import {
  getWorkflow,
  latestEvalRun,
  listGoldenCases,
  listRuns,
  type WorkflowRow,
} from "@/lib/db/repo";
import { groundedConfidence } from "@/lib/spec/schema";
import { summarizeEvalRun } from "@/lib/evals/runner";

/**
 * Client-facing artifacts, generated from what the system actually knows:
 * - Sprint Report: the sellable audit deliverable (operating map, ROI matrix,
 *   go/no-go).
 * - Defend Pack: the same system argued two ways, engineer and VP.
 * Both are markdown; the report page renders and prints them. Plain, direct
 * language; nothing the pipeline did not see or measure.
 */

function requireWorkflow(workflowId: string): WorkflowRow {
  const workflow = getWorkflow(workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${workflowId} has no operating map yet.`);
  return workflow;
}

const CLASSIFICATION_LABELS = {
  deterministic: "Deterministic",
  llm_judgment: "AI judgment",
  human_approval: "Human decision",
} as const;

export function generateSprintReport(workflowId: string): string {
  const workflow = requireWorkflow(workflowId);
  const spec = workflow.spec!;
  const confidence = groundedConfidence(spec);
  const lines: string[] = [];

  lines.push(`# Sprint Report: ${spec.title}`);
  lines.push("");
  lines.push(spec.summary);
  lines.push("");
  lines.push(`Grounding: ${Math.round(confidence.ratio * 100)}% of the map is confirmed; ${confidence.open} assumption${confidence.open === 1 ? "" : "s"} still open.`);
  lines.push("");

  lines.push("## How the work happens today");
  lines.push("");
  lines.push(`Trigger: ${spec.trigger.description}`);
  if (spec.trigger.intakeVariants.length > 0) {
    lines.push("");
    lines.push("Intake arrives in these forms:");
    for (const variant of spec.trigger.intakeVariants) {
      lines.push(`- ${variant.description}`);
    }
  }
  lines.push("");
  for (const observed of spec.observed) {
    lines.push(`${observed.index + 1}. ${observed.title} (${observed.system})`);
  }
  lines.push("");

  lines.push("## The designed workflow");
  lines.push("");
  for (const step of spec.steps.sort((a, b) => a.index - b.index)) {
    lines.push(`${step.index + 1}. ${step.title} — ${CLASSIFICATION_LABELS[step.classification]}${step.externallyVisible ? ", gated by approval" : ""}`);
    if (step.changeNote) lines.push(`   Change: ${step.changeNote}`);
    for (const rule of step.decisionRules) {
      lines.push(`   Rule: when ${rule.condition}, ${rule.action} (${rule.source})`);
    }
  }
  lines.push("");

  lines.push("## Value assessment");
  lines.push("");
  lines.push(`| Bucket | Score (0-5) |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Revenue uplift | ${spec.roi.revenueUplift} |`);
  lines.push(`| Risk mitigation | ${spec.roi.riskMitigation} |`);
  lines.push(`| Cost savings | ${spec.roi.costSavings} |`);
  lines.push(`| Build cost | ${spec.roi.buildCost} |`);
  lines.push(`| Automation risk | ${spec.roi.automationRisk} |`);
  lines.push("");
  lines.push(spec.roi.narrative);
  lines.push("");
  lines.push(`## Recommendation: ${spec.goNoGo.decision === "go" ? "Go" : spec.goNoGo.decision === "no_go" ? "Do not automate yet" : "Partial automation"}`);
  lines.push("");
  lines.push(spec.goNoGo.rationale);
  lines.push("");

  if (spec.redactionFlags.some((f) => !f.resolved)) {
    lines.push("## Before sharing");
    lines.push("");
    lines.push(
      `${spec.redactionFlags.filter((f) => !f.resolved).length} sensitive-content flag(s) in the recording are unresolved. Resolve them in review before this report leaves the building.`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

export function generateDefendPack(workflowId: string): string {
  const workflow = requireWorkflow(workflowId);
  const spec = workflow.spec!;
  const evalRun = latestEvalRun(workflowId);
  const summary = evalRun ? summarizeEvalRun(evalRun) : null;
  const cases = listGoldenCases(workflowId);
  const runs = listRuns(workflowId);
  const lines: string[] = [];

  lines.push(`# Defend Pack: ${spec.title}`);
  lines.push("");

  lines.push("## The VP version");
  lines.push("");
  lines.push(`Problem: ${spec.trigger.description} Today this is manual, and the rules live in one person's head.`);
  lines.push("");
  if (summary) {
    lines.push(
      `Evidence: ${summary.passCount} of ${summary.total} historical cases (${Math.round(summary.passRate * 100)}%) are handled correctly by the automated workflow, measured against hand-labeled expected outcomes.`,
    );
    if (summary.categories.length > 0) {
      lines.push(
        `Known gaps: ${summary.categories.map((c) => `${c.label} (${c.count})`).join(", ")}. Each gap routes to a person rather than acting.`,
      );
    }
  } else {
    lines.push("Evidence: evals have not run yet. Nothing deploys before they pass.");
  }
  lines.push("");
  lines.push(
    `Risk: every externally visible action is gated behind human approval until the step earns autonomy through a clean approval record. ${runs.length} run${runs.length === 1 ? "" : "s"} so far, each with a complete audit trail.`,
  );
  lines.push("");
  lines.push(`Outcome: ${spec.roi.narrative}`);
  lines.push("");

  lines.push("## The engineer version");
  lines.push("");
  lines.push(
    `Architecture: the recording compiles to a versioned workflow spec (${spec.steps.length} steps). Classification: ${spec.steps.filter((s) => s.classification === "deterministic").length} deterministic, ${spec.steps.filter((s) => s.classification === "llm_judgment").length} AI judgment, ${spec.steps.filter((s) => s.classification === "human_approval").length} human. The compiler inserts an approval gate before every externally visible step; the runtime checkpoints after each node and resumes after failures or approvals.`,
  );
  lines.push("");
  lines.push(
    `Decisions: judgment steps apply only rules extracted from the recording and interview (${spec.steps.flatMap((s) => s.decisionRules).length} rules). Uncovered inputs route to a person; the model never invents a rule.`,
  );
  lines.push("");
  lines.push(
    `Evals: golden dataset of ${cases.length} cases (${cases.filter((c) => c.source === "historical").length} historical, ${cases.filter((c) => c.source === "interview").length} from interview, ${cases.filter((c) => c.source === "correction").length} from corrections). Failure reports are categorized so each round names what to fix. Deployment is gated on a 90% pass rate over at least 20 cases.`,
  );
  lines.push("");
  lines.push(
    "Iteration record: corrections made at the approval inbox become new golden cases automatically, so the dataset hardens with use.",
  );
  lines.push("");
  return lines.join("\n");
}
