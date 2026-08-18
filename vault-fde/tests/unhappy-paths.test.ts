import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db";
import {
  getRun,
  getWorkflow,
  listAuditEvents,
  listPendingApprovals,
  saveSpec,
  setWorkflowStatus,
} from "@/lib/db/repo";
import { loadFixture, loadFixtureGoldenCases } from "@/lib/pipeline/fixture";
import { buildOperatingMap } from "@/lib/pipeline";
import { parseVtt } from "@/lib/pipeline/vtt";
import { answerQuestion, nextQuestion, startInterview } from "@/lib/interview/engine";
import { runEvals } from "@/lib/evals/runner";
import { compileSpec, CompileRefusedError } from "@/lib/compiler";
import {
  deployToShadow,
  promoteToLive,
  resolveApprovalAndContinue,
  startRun,
  DeploymentGateError,
} from "@/lib/runtime/engine";
import { decideGoNoGo } from "@/lib/spec/gonogo";

/**
 * The thousand ways it can go wrong: explicit behavior for each, never a
 * silent failure.
 */

async function readyWorkflow() {
  const workflow = loadFixture("invoice-intake");
  await buildOperatingMap(workflow.id);
  startInterview(workflow.id);
  for (;;) {
    const current = getWorkflow(workflow.id)!;
    const question = nextQuestion(current.spec!);
    if (!question) break;
    answerQuestion({ workflowId: workflow.id, assumptionId: question.assumptionId, action: "confirm" });
  }
  loadFixtureGoldenCases("invoice-intake", workflow.id);
  return getWorkflow(workflow.id)!;
}

describe("unhappy paths", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("go/no-go refuses high automation risk and low value", () => {
    expect(
      decideGoNoGo({
        revenueUplift: 5, riskMitigation: 5, costSavings: 5,
        buildCost: 1, automationRisk: 5, narrative: "",
      }).decision,
    ).toBe("no_go");
    expect(
      decideGoNoGo({
        revenueUplift: 0.5, riskMitigation: 1, costSavings: 1,
        buildCost: 0.5, automationRisk: 0.5, narrative: "",
      }).decision,
    ).toBe("no_go");
  });

  it("a no-go spec refuses to compile", async () => {
    const workflow = await readyWorkflow();
    const spec = workflow.spec!;
    spec.goNoGo = { decision: "no_go", rationale: "Too risky for now." };
    saveSpec(workflow.id, spec);
    expect(() => compileSpec(getWorkflow(workflow.id)!.spec!)).toThrow(CompileRefusedError);
  });

  it("an already-answered assumption cannot be answered twice", async () => {
    const workflow = loadFixture("invoice-intake");
    await buildOperatingMap(workflow.id);
    const question = nextQuestion(getWorkflow(workflow.id)!.spec!)!;
    answerQuestion({ workflowId: workflow.id, assumptionId: question.assumptionId, action: "confirm" });
    expect(() =>
      answerQuestion({ workflowId: workflow.id, assumptionId: question.assumptionId, action: "confirm" }),
    ).toThrow(/already/);
  });

  it("a correction without text is rejected", async () => {
    const workflow = loadFixture("invoice-intake");
    await buildOperatingMap(workflow.id);
    const question = nextQuestion(getWorkflow(workflow.id)!.spec!)!;
    expect(() =>
      answerQuestion({ workflowId: workflow.id, assumptionId: question.assumptionId, action: "correct" }),
    ).toThrow(/correction/i);
  });

  it("evals refuse to run on an empty golden dataset", async () => {
    const workflow = loadFixture("invoice-intake");
    await buildOperatingMap(workflow.id);
    await expect(runEvals(workflow.id)).rejects.toThrow(/no gradable cases/i);
  });

  it("live runs require live status, live status requires shadow first", async () => {
    const workflow = await readyWorkflow();
    await expect(
      startRun({ workflowId: workflow.id, mode: "live", runInput: {} }),
    ).rejects.toThrow(DeploymentGateError);
    expect(() => promoteToLive(workflow.id)).toThrow(/shadow/i);
  });

  it("a rejected approval stops a live run with a full audit trail", async () => {
    const workflow = await readyWorkflow();
    await runEvals(workflow.id);
    // Close the two known gaps so the gate opens.
    const spec = getWorkflow(workflow.id)!.spec!;
    const judgment = spec.steps.find((s) => s.classification === "llm_judgment")!;
    judgment.decisionRules.push(
      { id: "r-services", condition: "category is services", action: "code 6300", source: "interview" },
      { id: "r-dup", condition: "duplicate invoice", action: "request a corrected invoice", source: "interview" },
    );
    saveSpec(workflow.id, spec);
    await runEvals(workflow.id);
    deployToShadow(workflow.id);
    setWorkflowStatus(workflow.id, "live");

    const { run } = await startRun({
      workflowId: workflow.id,
      mode: "live",
      runInput: {
        vendor: "Corvid Office", invoiceNumber: "CO-901", amount: 80, dueDate: "2026-09-01",
        hasAttachment: true, poFound: true, poAmount: 80, category: "office supplies",
      },
    });
    expect(run.status).toBe("waiting_approval");
    const pending = listPendingApprovals().find((a) => a.runId === run.id)!;
    await resolveApprovalAndContinue({ approvalId: pending.id, status: "rejected" });
    const after = getRun(run.id)!;
    expect(after.status).toBe("aborted");
    const kinds = listAuditEvents(run.id).map((e) => e.kind);
    expect(kinds).toContain("run_aborted");
  });

  it("a browser-configured step routes to a human instead of crashing", async () => {
    const workflow = await readyWorkflow();
    const spec = getWorkflow(workflow.id)!.spec!;
    const step = spec.steps.find((s) => s.classification === "deterministic")!;
    step.executor = { kind: "browser", operation: "browser.click", config: {} };
    saveSpec(workflow.id, spec);
    setWorkflowStatus(workflow.id, "shadow");

    const { run } = await startRun({
      workflowId: workflow.id,
      mode: "shadow",
      runInput: {
        vendor: "Corvid Office", invoiceNumber: "CO-902", amount: 80, dueDate: "2026-09-01",
        hasAttachment: true, poFound: true, poAmount: 80, category: "office supplies",
      },
    });
    const after = getRun(run.id)!;
    expect(after.status).toBe("waiting_approval");
    const kinds = listAuditEvents(run.id).map((e) => e.kind);
    expect(kinds).toContain("step_failed");
    expect(kinds).toContain("routed_to_human");
  });

  it("an edited gate draft is exactly what the gated step executes", async () => {
    const workflow = await readyWorkflow();
    await runEvals(workflow.id);
    const spec = getWorkflow(workflow.id)!.spec!;
    const judgment = spec.steps.find((s) => s.classification === "llm_judgment")!;
    judgment.decisionRules.push(
      { id: "r-services", condition: "category is services", action: "code 6300", source: "interview" },
      { id: "r-dup", condition: "duplicate invoice", action: "request a corrected invoice", source: "interview" },
    );
    saveSpec(workflow.id, spec);
    await runEvals(workflow.id);
    deployToShadow(workflow.id);
    setWorkflowStatus(workflow.id, "live");

    const { run } = await startRun({
      workflowId: workflow.id,
      mode: "live",
      runInput: {
        vendor: "Corvid Office", invoiceNumber: "CO-903", amount: 80, dueDate: "2026-09-01",
        hasAttachment: true, poFound: true, poAmount: 80, category: "office supplies",
      },
    });
    let currentRun = getRun(run.id)!;
    let edited = false;
    let editedStepId = "";
    let guard = 0;
    while (currentRun.status === "waiting_approval" && guard < 10) {
      const pending = listPendingApprovals().find((a) => a.runId === run.id)!;
      if (!edited) {
        edited = true;
        editedStepId = pending.stepId;
        await resolveApprovalAndContinue({
          approvalId: pending.id,
          status: "edited",
          editedDraft: { note: "use net-45 terms", vendor: "Corvid Office" },
        });
      } else {
        await resolveApprovalAndContinue({ approvalId: pending.id, status: "approved" });
      }
      currentRun = getRun(run.id)!;
      guard += 1;
    }
    expect(currentRun.status).toBe("completed");
    const values = (currentRun.context as { values: Record<string, Record<string, unknown>> }).values;
    // The step executed the human's edit verbatim, not a rebuilt draft.
    expect(values[editedStepId]).toEqual({ note: "use net-45 terms", vendor: "Corvid Office" });
  });

  it("approving a failure escalation retries; editing supplies the outcome by hand", async () => {
    const workflow = await readyWorkflow();
    const spec = getWorkflow(workflow.id)!.spec!;
    const step = spec.steps.find((s) => s.classification === "deterministic")!;
    step.executor = { kind: "browser", operation: "browser.click", config: {} };
    saveSpec(workflow.id, spec);
    setWorkflowStatus(workflow.id, "shadow");

    const { run } = await startRun({
      workflowId: workflow.id,
      mode: "shadow",
      runInput: {
        vendor: "Corvid Office", invoiceNumber: "CO-904", amount: 80, dueDate: "2026-09-01",
        hasAttachment: true, poFound: true, poAmount: 80, category: "office supplies",
      },
    });
    expect(getRun(run.id)!.status).toBe("waiting_approval");

    // Approve: the step retries (and fails again, since the stub still fails).
    const first = listPendingApprovals().find((a) => a.runId === run.id)!;
    await resolveApprovalAndContinue({ approvalId: first.id, status: "approved" });
    const afterRetry = getRun(run.id)!;
    expect(afterRetry.status).toBe("waiting_approval");
    const retryEvents = listAuditEvents(run.id).filter(
      (e) => e.kind === "step_failed" && e.stepId === step.id,
    );
    expect(retryEvents.length).toBeGreaterThanOrEqual(2);

    // Edit: the human supplies the outcome and the run moves on.
    const second = listPendingApprovals().find((a) => a.runId === run.id)!;
    await resolveApprovalAndContinue({
      approvalId: second.id,
      status: "edited",
      editedDraft: { doneByHand: true },
    });
    const values = (getRun(run.id)!.context as { values: Record<string, Record<string, unknown>> })
      .values;
    expect(values[step.id]).toEqual({ doneByHand: true });
  });

  it("correction cases are kept but excluded from bench scoring", async () => {
    const workflow = await readyWorkflow();
    const before = await runEvals(workflow.id);
    const { addGoldenCase } = await import("@/lib/db/repo");
    addGoldenCase({
      workflowId: workflow.id,
      name: "Correction from a run",
      input: { vendor: "X" },
      expected: { correction: "use net-45" },
      source: "correction",
    });
    const after = await runEvals(workflow.id);
    expect(after.total).toBe(before.total);
  });

  it("parses VTT and tolerates malformed cues", () => {
    const vtt = `WEBVTT

00:00.000 --> 00:04.500
First line spoken

not a cue at all

00:04.500 --> 00:09.000
Second line spoken`;
    const segments = parseVtt(vtt);
    expect(segments).toHaveLength(2);
    expect(segments[0].startSec).toBe(0);
    expect(segments[1].endSec).toBe(9);
    expect(parseVtt("garbage with no cues")).toHaveLength(0);
  });

  it("loadFixture fails clearly for a missing fixture", () => {
    expect(() => loadFixture("does-not-exist")).toThrow(/Fixture not found/);
  });
});
