import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db";
import {
  getWorkflow,
  listAuditEvents,
  listGoldenCases,
  listPendingApprovals,
  getRun,
} from "@/lib/db/repo";
import { loadFixture, loadFixtureGoldenCases } from "@/lib/pipeline/fixture";
import { buildOperatingMap } from "@/lib/pipeline";
import { answerQuestion, nextQuestion, startInterview } from "@/lib/interview/engine";
import { runEvals, summarizeEvalRun } from "@/lib/evals/runner";
import { compileSpec, CompileRefusedError } from "@/lib/compiler";
import {
  deployToShadow,
  deploymentGate,
  promoteToLive,
  resolveApprovalAndContinue,
  startRun,
  DeploymentGateError,
  graduationCandidates,
  setStepTrustLevel,
  GRADUATION_THRESHOLD,
} from "@/lib/runtime/engine";
import { applySpecEdit } from "@/lib/spec/edit";

/**
 * The golden path, end to end: fixture recording -> operating map -> interview
 * closes every assumption -> evals fail below gate -> categorized report shows
 * what to fix -> corrections close the gaps -> evals pass -> shadow deployment
 * -> approval inbox -> edit feeds the golden dataset -> live run blocks at the
 * gate and continues after approval.
 */

describe("golden path", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  async function mapFixture() {
    const workflow = loadFixture("invoice-intake");
    await buildOperatingMap(workflow.id);
    return getWorkflow(workflow.id)!;
  }

  async function finishInterview(workflowId: string) {
    startInterview(workflowId);
    let guard = 0;
    for (;;) {
      const workflow = getWorkflow(workflowId)!;
      const question = nextQuestion(workflow.spec!);
      if (!question) break;
      answerQuestion({
        workflowId,
        assumptionId: question.assumptionId,
        action: "confirm",
      });
      guard += 1;
      if (guard > 50) throw new Error("Interview did not converge");
    }
  }

  it("maps the fixture and refuses to compile with open assumptions", async () => {
    const workflow = await mapFixture();
    expect(workflow.status).toBe("mapped");
    expect(workflow.spec!.assumptions.length).toBeGreaterThan(0);
    expect(() => compileSpec(workflow.spec!)).toThrow(CompileRefusedError);
  });

  it("asks exactly one question at a time until the ledger closes", async () => {
    const workflow = await mapFixture();
    startInterview(workflow.id);
    const first = nextQuestion(workflow.spec!);
    expect(first).not.toBeNull();
    // The harvest (intake) question leads.
    expect(first!.harvestExamples).toBe(true);
    expect(first!.remaining).toBe(workflow.spec!.assumptions.length);

    const afterOne = answerQuestion({
      workflowId: workflow.id,
      assumptionId: first!.assumptionId,
      action: "confirm",
    });
    const second = nextQuestion(afterOne.spec);
    expect(second).not.toBeNull();
    expect(second!.assumptionId).not.toBe(first!.assumptionId);
    expect(second!.remaining).toBe(first!.remaining - 1);
  });

  it("a correction becomes a decision rule on its step", async () => {
    const workflow = await mapFixture();
    startInterview(workflow.id);
    const question = nextQuestion(workflow.spec!)!;
    const stepScoped = workflow.spec!.assumptions.find((a) => a.stepId)!;
    const result = answerQuestion({
      workflowId: workflow.id,
      assumptionId: stepScoped.id,
      action: "correct",
      correction: "Route every deviation to the AP lead the same day.",
    });
    const step = result.spec.steps.find((s) => s.id === stepScoped.stepId)!;
    expect(step.decisionRules.some((r) => r.source === "interview")).toBe(true);
    expect(question).toBeDefined();
  });

  it("runs the full loop to live", async () => {
    const workflow = await mapFixture();
    const workflowId = workflow.id;

    // Deployment is gated before anything exists.
    expect(deploymentGate(workflowId).ready).toBe(false);

    await finishInterview(workflowId);
    expect(getWorkflow(workflowId)!.status).toBe("evals");

    // Historical examples arrive (the harvest).
    const added = loadFixtureGoldenCases("invoice-intake", workflowId);
    expect(added).toBeGreaterThanOrEqual(20);

    // First bench run: below the gate, with categorized failures.
    const firstEval = await runEvals(workflowId);
    const firstSummary = summarizeEvalRun(firstEval);
    expect(firstSummary.passRate).toBeLessThan(0.9);
    expect(firstSummary.categories.length).toBeGreaterThan(0);
    const uncovered = firstSummary.categories.find((c) => c.category === "uncovered_case");
    expect(uncovered).toBeDefined();
    expect(() => deployToShadow(workflowId)).toThrow(DeploymentGateError);

    // Close the gaps the report named: the services GL code and duplicates.
    const spec = getWorkflow(workflowId)!.spec!;
    const judgmentStep = spec.steps.find((s) => s.classification === "llm_judgment") ?? spec.steps[2];
    applySpecEdit(workflowId, {
      kind: "add_rule",
      stepId: judgmentStep.id,
      condition: "category is services",
      action: "code 6300",
      source: "interview",
    });
    applySpecEdit(workflowId, {
      kind: "add_rule",
      stepId: judgmentStep.id,
      condition: "invoice number already exists in the tracker (duplicate)",
      action: "request a corrected invoice",
      source: "interview",
    });

    // Second bench run: green.
    const secondEval = await runEvals(workflowId);
    const secondSummary = summarizeEvalRun(secondEval);
    expect(secondSummary.passRate).toBeGreaterThanOrEqual(0.9);

    // Shadow deployment now passes the gate.
    deployToShadow(workflowId);
    expect(getWorkflow(workflowId)!.status).toBe("shadow");

    // A shadow run records drafts without blocking.
    const shadowRun = await startRun({
      workflowId,
      mode: "shadow",
      runInput: {
        vendor: "Meridian Supply Co",
        invoiceNumber: "9001",
        amount: 250,
        dueDate: "2026-06-01",
        hasAttachment: true,
        poFound: true,
        poAmount: 250,
        category: "office supplies",
      },
    });
    expect(shadowRun.run.status).toBe("completed");
    const pending = listPendingApprovals();
    expect(pending.length).toBeGreaterThan(0);

    // An edit at the inbox becomes a golden case (the feedback loop).
    const before = listGoldenCases(workflowId).length;
    await resolveApprovalAndContinue({
      approvalId: pending[0].id,
      status: "edited",
      editedDraft: { note: "Use net-45 for this vendor" },
    });
    expect(listGoldenCases(workflowId).length).toBe(before + 1);

    // Approve the rest; stats accumulate toward graduation.
    for (const approval of listPendingApprovals()) {
      await resolveApprovalAndContinue({ approvalId: approval.id, status: "approved" });
    }

    // Live requires shadow first; then a live run blocks at the gate.
    promoteToLive(workflowId);
    const liveRun = await startRun({
      workflowId,
      mode: "live",
      runInput: {
        vendor: "Corvid Office",
        invoiceNumber: "CO-900",
        amount: 120,
        dueDate: "2026-06-10",
        hasAttachment: true,
        poFound: true,
        poAmount: 120,
        category: "office supplies",
      },
    });
    expect(liveRun.run.status).toBe("waiting_approval");
    const gate = listPendingApprovals().find((a) => a.runId === liveRun.run.id)!;
    await resolveApprovalAndContinue({ approvalId: gate.id, status: "approved" });

    // The run continues past the gate (it may block again at the next one).
    let run = getRun(liveRun.run.id)!;
    let guard = 0;
    while (run.status === "waiting_approval" && guard < 10) {
      const next = listPendingApprovals().find((a) => a.runId === run.id)!;
      await resolveApprovalAndContinue({ approvalId: next.id, status: "approved" });
      run = getRun(liveRun.run.id)!;
      guard += 1;
    }
    expect(run.status).toBe("completed");

    // The audit trail tells the story.
    const events = listAuditEvents(run.id);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("run_started");
    expect(kinds).toContain("approval_requested");
    expect(kinds).toContain("approval_resolved");
    expect(kinds).toContain("run_completed");
  });

  it("graduation requires clean approvals and stays a human choice", async () => {
    const workflow = await mapFixture();
    await finishInterview(workflow.id);
    const spec = getWorkflow(workflow.id)!.spec!;
    const step = spec.steps.find((s) => s.externallyVisible)!;
    expect(graduationCandidates(spec)).toHaveLength(0);
    step.approvalStats.approvals = GRADUATION_THRESHOLD;
    expect(graduationCandidates(spec).map((s) => s.id)).toContain(step.id);
    step.approvalStats.edits = 1;
    expect(graduationCandidates(spec)).toHaveLength(0);

    // Human graduates the step; the compiler then skips its gate.
    step.approvalStats.edits = 0;
    setStepTrustLevel(workflow.id, step.id, "auto");
    const updated = getWorkflow(workflow.id)!.spec!;
    const plan = compileSpec(updated);
    const gates = plan.nodes.filter(
      (n) => n.kind === "approval_gate" && n.step.id === step.id,
    );
    expect(gates).toHaveLength(0);
  });
});
