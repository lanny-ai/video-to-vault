import { compileSpec } from "@/lib/compiler";
import { resolveConnector, type ConnectorContext } from "@/lib/connectors";
import type { WorkflowSpec } from "@/lib/spec/schema";
import {
  addEvalRun,
  getWorkflow,
  listGoldenCases,
  type EvalCaseResult,
  type EvalRunRow,
  type GoldenCase,
} from "@/lib/db/repo";

/**
 * The test bench: run every golden case through the compiled workflow, compare
 * against the hand-labeled expectation, and categorize each failure so the
 * report says what to fix, not just how many failed.
 *
 * Per-case safety matrix (the four questions): right data, required steps,
 * matches an expert, safe to act on.
 */

export type FailureCategory =
  | "missing_data"
  | "wrong_action"
  | "wrong_gl_code"
  | "missed_signoff"
  | "unnecessary_signoff"
  | "uncovered_case"
  | "execution_error";

export const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  missing_data: "Missing data",
  wrong_action: "Wrong action",
  wrong_gl_code: "Wrong GL code",
  missed_signoff: "Missed sign-off",
  unnecessary_signoff: "Unnecessary sign-off",
  uncovered_case: "No rule covers this case",
  execution_error: "Execution error",
};

async function executeForEval(
  spec: WorkflowSpec,
  input: Record<string, unknown>,
): Promise<{ outputs: Record<string, unknown>; completed: boolean; error?: string }> {
  const plan = compileSpec(spec);
  const ctx: ConnectorContext = { spec, input, values: {}, mode: "eval" };
  for (const node of plan.nodes) {
    if (node.kind !== "action") continue; // gates auto-pass on the bench
    try {
      const result = await resolveConnector(node.step)(node.step, ctx);
      ctx.values[node.step.id] = result.output;
    } catch (err) {
      return {
        outputs: flatten(ctx.values),
        completed: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { outputs: flatten(ctx.values), completed: true };
}

function flatten(values: Record<string, Record<string, unknown>>): Record<string, unknown> {
  // Later steps win on key collisions; the judgment step's decision keys are unique in practice.
  return Object.assign({}, ...Object.values(values));
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  return value;
}

function categorize(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  mismatchedKey: string,
  reasons: string[],
): FailureCategory {
  if (mismatchedKey === "glCode") {
    return reasons.some((r) => /no rule covers/i.test(r)) ? "uncovered_case" : "wrong_gl_code";
  }
  if (mismatchedKey === "needsSignoff") {
    return expected.needsSignoff === true ? "missed_signoff" : "unnecessary_signoff";
  }
  if (mismatchedKey === "action") {
    return reasons.some((r) => /no rule covers/i.test(r)) ? "uncovered_case" : "wrong_action";
  }
  return "wrong_action";
}

export async function runEvals(workflowId: string): Promise<EvalRunRow> {
  const workflow = getWorkflow(workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${workflowId} has no spec.`);
  // Correction cases carry a free-text edit as their expectation, which the
  // bench cannot grade against step outputs. They are kept for review and
  // excluded from scoring until an operator turns them into labeled cases;
  // scoring them would silently drag the pass rate down forever.
  const cases = listGoldenCases(workflowId).filter((c) => c.source !== "correction");
  if (cases.length === 0) {
    throw new Error(
      "The golden dataset has no gradable cases. Add historical examples (interview harvest or CSV import) before running the bench.",
    );
  }

  const results: EvalCaseResult[] = [];
  for (const goldenCase of cases) {
    results.push(await runCase(workflow.spec, goldenCase));
  }
  const passCount = results.filter((r) => r.pass).length;
  return addEvalRun({ workflowId, results, passCount, total: results.length });
}

async function runCase(spec: WorkflowSpec, goldenCase: GoldenCase): Promise<EvalCaseResult> {
  const { outputs, completed, error } = await executeForEval(spec, goldenCase.input);
  const reasons = Array.isArray(outputs.reasons) ? (outputs.reasons as string[]) : [];
  const rightData = Object.values(goldenCase.input).every((v) => v !== null && v !== "");

  if (error) {
    return {
      caseId: goldenCase.id,
      caseName: goldenCase.name,
      pass: false,
      failureCategory: "execution_error",
      actual: outputs,
      notes: error,
      stepChecks: { rightData, requiredSteps: false, matchesExpert: false, safeToAct: false },
    };
  }

  let mismatchedKey: string | null = null;
  for (const key of Object.keys(goldenCase.expected)) {
    if (
      JSON.stringify(normalize(outputs[key])) !== JSON.stringify(normalize(goldenCase.expected[key]))
    ) {
      mismatchedKey = key;
      break;
    }
  }

  const pass = mismatchedKey === null;
  return {
    caseId: goldenCase.id,
    caseName: goldenCase.name,
    pass,
    failureCategory: pass
      ? undefined
      : categorize(goldenCase.expected, outputs, mismatchedKey!, reasons),
    actual: outputs,
    notes: pass
      ? reasons.join("; ").slice(0, 300)
      : `Expected ${mismatchedKey}=${JSON.stringify(goldenCase.expected[mismatchedKey!])}, got ${JSON.stringify(normalize(outputs[mismatchedKey!]))}. ${reasons.join("; ")}`.slice(0, 400),
    stepChecks: {
      rightData,
      requiredSteps: completed,
      matchesExpert: pass,
      safeToAct: pass && rightData,
    },
  };
}

export interface EvalSummary {
  passCount: number;
  total: number;
  passRate: number;
  categories: { category: FailureCategory; label: string; count: number; cases: string[] }[];
}

export function summarizeEvalRun(run: EvalRunRow): EvalSummary {
  const byCategory = new Map<FailureCategory, string[]>();
  for (const result of run.results) {
    if (result.pass || !result.failureCategory) continue;
    const key = result.failureCategory as FailureCategory;
    byCategory.set(key, [...(byCategory.get(key) ?? []), result.caseName]);
  }
  return {
    passCount: run.passCount,
    total: run.total,
    passRate: run.total === 0 ? 0 : run.passCount / run.total,
    categories: [...byCategory.entries()]
      .map(([category, cases]) => ({
        category,
        label: FAILURE_CATEGORY_LABELS[category],
        count: cases.length,
        cases,
      }))
      .sort((a, b) => b.count - a.count),
  };
}
