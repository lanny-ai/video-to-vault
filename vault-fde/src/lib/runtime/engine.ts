import { compileSpec, type ExecNode, type ExecutablePlan } from "@/lib/compiler";
import { resolveConnector, ConnectorError, type ConnectorContext } from "@/lib/connectors";
import type { Step, WorkflowSpec } from "@/lib/spec/schema";
import {
  addAuditEvent,
  addGoldenCase,
  createApproval,
  createRun,
  getApproval,
  getRun,
  getWorkflow,
  latestEvalRun,
  listGoldenCases,
  resolveApproval,
  saveSpec,
  setWorkflowStatus,
  updateRun,
  type ApprovalRow,
  type RunMode,
  type RunRow,
} from "@/lib/db/repo";

/**
 * The runtime: executes a compiled plan with checkpointing, retries, an audit
 * trail for every event, approval gates that block in live mode, and the
 * feedback loop that turns human edits into golden dataset cases.
 */

export const GRADUATION_THRESHOLD = 10;
export const EVAL_PASS_GATE = 0.9;
export const MIN_GOLDEN_CASES = 20;

interface RunContext {
  input: Record<string, unknown>;
  values: Record<string, Record<string, unknown>>;
  /** Set while a live run waits at a gate. */
  pendingApprovalId?: string;
  [key: string]: unknown;
}

export class DeploymentGateError extends Error {}

/** Deployment gate: evals earn the right to run. */
export function deploymentGate(workflowId: string): { ready: boolean; reason: string } {
  const cases = listGoldenCases(workflowId);
  if (cases.length < MIN_GOLDEN_CASES) {
    return {
      ready: false,
      reason: `The golden dataset has ${cases.length} case${cases.length === 1 ? "" : "s"}; ${MIN_GOLDEN_CASES}+ are required before deployment.`,
    };
  }
  const latest = latestEvalRun(workflowId);
  if (!latest) {
    return { ready: false, reason: "No eval run yet. Run the test bench first." };
  }
  const rate = latest.total === 0 ? 0 : latest.passCount / latest.total;
  if (rate < EVAL_PASS_GATE) {
    return {
      ready: false,
      reason: `Latest eval pass rate is ${Math.round(rate * 100)}%; ${Math.round(EVAL_PASS_GATE * 100)}% is required. Use the failure categories to close the gaps.`,
    };
  }
  return { ready: true, reason: `Pass rate ${Math.round(rate * 100)}% across ${latest.total} cases.` };
}

export function deployToShadow(workflowId: string): void {
  const gate = deploymentGate(workflowId);
  if (!gate.ready) throw new DeploymentGateError(gate.reason);
  setWorkflowStatus(workflowId, "shadow");
}

export function promoteToLive(workflowId: string): void {
  const workflow = getWorkflow(workflowId);
  if (workflow?.status !== "shadow") {
    throw new DeploymentGateError(
      "A workflow goes live only from shadow mode. Run it in shadow first; trust is earned in stages.",
    );
  }
  setWorkflowStatus(workflowId, "live");
}

// ---------------------------------------------------------------------------

export interface StartRunResult {
  run: RunRow;
}

export async function startRun(input: {
  workflowId: string;
  mode: RunMode;
  runInput: Record<string, unknown>;
}): Promise<StartRunResult> {
  const workflow = getWorkflow(input.workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${input.workflowId} has no spec.`);
  if (input.mode === "live" && workflow.status !== "live") {
    throw new DeploymentGateError(
      `Workflow status is "${workflow.status}"; live runs require live status.`,
    );
  }
  const plan = compileSpec(workflow.spec);
  const run = createRun({
    workflowId: input.workflowId,
    mode: input.mode,
    context: { input: input.runInput, values: {} },
  });
  addAuditEvent({
    runId: run.id,
    kind: "run_started",
    stepId: null,
    summary: `${input.mode === "shadow" ? "Shadow" : "Live"} run started`,
    detail: { input: input.runInput },
  });
  await executeFrom(run.id, workflow.spec, plan);
  return { run: getRun(run.id)! };
}

/** Skip commit-style steps once the decision routed down the correction path. */
function skipForDecision(step: Step, values: RunContext["values"]): string | null {
  const decision = Object.values(values).find((v) => typeof v.action === "string");
  if (
    decision &&
    decision.action === "request_correction" &&
    /creat|enter|bill|record|schedul/i.test(`${step.title} ${step.goal}`)
  ) {
    return "The decision routed this item to the correction path; nothing gets entered.";
  }
  return null;
}

async function executeFrom(
  runId: string,
  spec: WorkflowSpec,
  plan: ExecutablePlan,
): Promise<void> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const context = run.context as unknown as RunContext;

  for (let i = run.checkpointIndex; i < plan.nodes.length; i++) {
    const node = plan.nodes[i];
    const step = node.step;

    if (node.kind === "approval_gate" || node.kind === "human_task") {
      const draft = {
        step: step.title,
        system: step.system,
        input: context.input,
        proposed: context.values[step.id] ?? inferDraft(step, context),
      };
      const reasoning =
        node.kind === "human_task"
          ? `"${step.title}" is a human decision in this workflow. Review and decide.`
          : `${node.reason} Trust level: ${step.trustLevel.replace("_", "-")}.`;
      const approval = createApproval({
        runId,
        workflowId: spec.id,
        stepId: step.id,
        draft,
        reasoning,
      });
      addAuditEvent({
        runId,
        kind: "approval_requested",
        stepId: step.id,
        summary: `Draft waiting for approval: ${step.title}`,
        detail: { approvalId: approval.id },
      });
      if (run.mode === "live") {
        context.pendingApprovalId = approval.id;
        updateRun(runId, {
          status: "waiting_approval",
          checkpointIndex: i,
          context: context as Record<string, unknown>,
        });
        return;
      }
      // Shadow mode: the draft is recorded for review; the run continues,
      // because nothing external executes in shadow anyway.
      updateRun(runId, { checkpointIndex: i + 1, context: context as Record<string, unknown> });
      continue;
    }

    // Action node.
    const skipReason = skipForDecision(step, context.values);
    if (skipReason) {
      addAuditEvent({
        runId,
        kind: "step_skipped",
        stepId: step.id,
        summary: `Skipped: ${step.title}`,
        detail: { reason: skipReason },
      });
      updateRun(runId, { checkpointIndex: i + 1, context: context as Record<string, unknown> });
      continue;
    }

    addAuditEvent({ runId, kind: "step_started", stepId: step.id, summary: step.title, detail: null });
    const connectorCtx: ConnectorContext = {
      spec,
      input: context.input,
      values: context.values,
      mode: run.mode,
    };
    const connector = resolveConnector(step);
    let result;
    try {
      result = await connector(step, connectorCtx);
    } catch (firstErr) {
      const transient =
        firstErr instanceof ConnectorError &&
        (firstErr.category === "dead_system" ||
          firstErr.category === "timeout" ||
          firstErr.category === "malformed_response");
      if (transient) {
        addAuditEvent({
          runId,
          kind: "retry",
          stepId: step.id,
          summary: `Retrying after failure: ${(firstErr as Error).message}`,
          detail: null,
        });
        try {
          result = await connector(step, connectorCtx);
        } catch (secondErr) {
          return routeFailure(runId, spec, step, i, context, secondErr);
        }
      } else {
        return routeFailure(runId, spec, step, i, context, firstErr);
      }
    }

    context.values[step.id] = result.output;
    addAuditEvent({
      runId,
      kind: "step_completed",
      stepId: step.id,
      summary: result.summary,
      detail: { simulated: result.simulated, output: result.output },
    });
    updateRun(runId, { checkpointIndex: i + 1, context: context as Record<string, unknown> });
  }

  updateRun(runId, { status: "completed", context: context as Record<string, unknown> });
  addAuditEvent({ runId, kind: "run_completed", stepId: null, summary: "Run completed", detail: null });
}

function inferDraft(step: Step, context: RunContext): Record<string, unknown> {
  // The draft already carries the run input; repeat only the decision here.
  const decision = Object.values(context.values).find((v) => typeof v.action === "string");
  return decision ? { wouldDo: step.goal, decision } : { wouldDo: step.goal };
}

/** Explicit failure behavior: the step's failure modes decide, defaulting to a human. */
function routeFailure(
  runId: string,
  spec: WorkflowSpec,
  step: Step,
  nodeIndex: number,
  context: RunContext,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const category = err instanceof ConnectorError ? err.category : "malformed_response";
  addAuditEvent({
    runId,
    kind: "step_failed",
    stepId: step.id,
    summary: `Failed: ${message}`,
    detail: { category },
  });
  const abort = step.failureModes.some(
    (fm) => fm.handling === "abort" && matchesCategory(fm.description, category),
  );
  if (abort) {
    updateRun(runId, { status: "failed", context: context as Record<string, unknown> });
    addAuditEvent({ runId, kind: "run_failed", stepId: step.id, summary: "Run failed", detail: null });
    return;
  }
  const approval = createApproval({
    runId,
    workflowId: spec.id,
    stepId: step.id,
    draft: { failedStep: step.title, error: message, input: context.input },
    reasoning: `"${step.title}" failed (${category.replace("_", " ")}). A person decides how to proceed; approving retries the step, rejecting stops the run.`,
  });
  context.pendingApprovalId = approval.id;
  addAuditEvent({
    runId,
    kind: "routed_to_human",
    stepId: step.id,
    summary: `Routed to a person after failure`,
    detail: { approvalId: approval.id },
  });
  updateRun(runId, {
    status: "waiting_approval",
    checkpointIndex: nodeIndex,
    context: context as Record<string, unknown>,
  });
}

function matchesCategory(description: string, category: string): boolean {
  const map: Record<string, RegExp> = {
    missing_data: /missing|empty/i,
    dead_system: /unreachable|timeout|dead/i,
    timeout: /timeout|times out/i,
    malformed_response: /malformed|schema/i,
    not_configured: /config/i,
  };
  return map[category]?.test(description) ?? false;
}

// ---------------------------------------------------------------------------
// Approval resolution and the feedback loop

export interface ResolveInput {
  approvalId: string;
  status: "approved" | "edited" | "rejected";
  editedDraft?: Record<string, unknown>;
}

export async function resolveApprovalAndContinue(input: ResolveInput): Promise<ApprovalRow> {
  const approval = getApproval(input.approvalId);
  if (!approval) throw new Error(`Approval not found: ${input.approvalId}`);
  if (input.status === "edited" && !input.editedDraft) {
    throw new Error("An edited resolution needs the edited draft.");
  }
  const resolved = resolveApproval(input.approvalId, {
    status: input.status,
    editedDraft: input.editedDraft,
  });

  const workflow = getWorkflow(approval.workflowId);
  const run = getRun(approval.runId);
  if (!workflow?.spec || !run) return resolved;
  const spec = workflow.spec;

  // Trust stats: every resolution is a data point toward graduation.
  const step = spec.steps.find((s) => s.id === approval.stepId);
  if (step) {
    if (input.status === "approved") step.approvalStats.approvals += 1;
    if (input.status === "edited") step.approvalStats.edits += 1;
    if (input.status === "rejected") step.approvalStats.rejections += 1;
    saveSpec(spec.id, spec);
  }

  // The feedback loop: an edit silently becomes a golden dataset case.
  if (input.status === "edited" && input.editedDraft) {
    const runInput = (run.context as { input?: Record<string, unknown> }).input ?? {};
    addGoldenCase({
      workflowId: spec.id,
      name: `Correction from run ${run.id.slice(-6)}`,
      input: runInput,
      expected: input.editedDraft,
      source: "correction",
    });
  }

  addAuditEvent({
    runId: run.id,
    kind: "approval_resolved",
    stepId: approval.stepId,
    summary: `Approval ${input.status}`,
    detail: { approvalId: approval.id },
  });

  // A live run waiting on this approval continues or stops.
  const context = run.context as unknown as RunContext;
  if (run.status === "waiting_approval" && context.pendingApprovalId === approval.id) {
    if (input.status === "rejected") {
      updateRun(run.id, { status: "aborted", context: context as Record<string, unknown> });
      addAuditEvent({
        runId: run.id,
        kind: "run_aborted",
        stepId: approval.stepId,
        summary: "Run stopped after rejection",
        detail: null,
      });
    } else {
      if (step) {
        context.values[step.id] = (input.editedDraft ?? approval.draft) as Record<string, unknown>;
      }
      delete context.pendingApprovalId;
      updateRun(run.id, {
        status: "running",
        checkpointIndex: run.checkpointIndex + 1,
        context: context as Record<string, unknown>,
      });
      const plan = compileSpec(spec);
      await executeFrom(run.id, spec, plan);
    }
  }
  return resolved;
}

/** Steps that have earned a graduation prompt. Graduating stays a human choice. */
export function graduationCandidates(spec: WorkflowSpec): Step[] {
  return spec.steps.filter(
    (s) =>
      s.trustLevel !== "auto" &&
      s.approvalStats.approvals >= GRADUATION_THRESHOLD &&
      s.approvalStats.edits === 0 &&
      s.approvalStats.rejections === 0,
  );
}

export function setStepTrustLevel(
  workflowId: string,
  stepId: string,
  trustLevel: Step["trustLevel"],
): void {
  const workflow = getWorkflow(workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${workflowId} has no spec.`);
  const step = workflow.spec.steps.find((s) => s.id === stepId);
  if (!step) throw new Error(`Step not found: ${stepId}`);
  step.trustLevel = trustLevel;
  saveSpec(workflowId, workflow.spec);
}
