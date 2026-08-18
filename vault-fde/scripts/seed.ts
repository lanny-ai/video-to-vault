/**
 * Seed: drives the bundled invoice-intake fixture through the full lifecycle
 * so a fresh clone shows every surface populated: a mapped workflow, a closed
 * interview, a failing-then-passing eval history, a shadow deployment with
 * runs, and a partially worked approval inbox.
 *
 * Run: npm run db:seed
 */
import { initDb } from "@/lib/db";
import {
  getWorkflow,
  listPendingApprovals,
  listWorkflows,
} from "@/lib/db/repo";
import { loadFixture, loadFixtureGoldenCases } from "@/lib/pipeline/fixture";
import { buildOperatingMap } from "@/lib/pipeline";
import { answerQuestion, nextQuestion, startInterview } from "@/lib/interview/engine";
import { runEvals, summarizeEvalRun } from "@/lib/evals/runner";
import { applySpecEdit } from "@/lib/spec/edit";
import { deployToShadow, resolveApprovalAndContinue, startRun } from "@/lib/runtime/engine";

async function main() {
  initDb();
  if (listWorkflows().some((w) => w.sourceKind === "fixture")) {
    console.log("Seed data already present; nothing to do. Delete data/vault-fde.db to reseed.");
    return;
  }

  console.log("1/6 Capturing fixture recording and building the operating map...");
  const workflow = loadFixture("invoice-intake");
  await buildOperatingMap(workflow.id);

  console.log("2/6 Running the interview (one question at a time)...");
  startInterview(workflow.id);
  let corrected = false;
  for (;;) {
    const current = getWorkflow(workflow.id)!;
    const question = nextQuestion(current.spec!);
    if (!question) break;
    // One question gets corrected to show the correction path in the ledger.
    if (!corrected && /threshold/i.test(question.question)) {
      answerQuestion({
        workflowId: workflow.id,
        assumptionId: question.assumptionId,
        action: "correct",
        correction:
          "The threshold is $500 for most vendors, but Atlas Freight is $1,000 because their invoices run large.",
      });
      corrected = true;
    } else {
      answerQuestion({
        workflowId: workflow.id,
        assumptionId: question.assumptionId,
        action: "confirm",
      });
    }
  }

  console.log("3/6 Importing 24 historical examples into the golden dataset...");
  loadFixtureGoldenCases("invoice-intake", workflow.id);

  console.log("4/6 First bench run (expected to fail below the gate)...");
  const first = await runEvals(workflow.id);
  const firstSummary = summarizeEvalRun(first);
  console.log(
    `    ${first.passCount}/${first.total} passed. Gaps: ${firstSummary.categories.map((c) => `${c.label} (${c.count})`).join(", ")}`,
  );

  console.log("5/6 Closing the gaps the report named, then re-running the bench...");
  const spec = getWorkflow(workflow.id)!.spec!;
  const judgmentStep = spec.steps.find((s) => s.classification === "llm_judgment") ?? spec.steps[0];
  applySpecEdit(workflow.id, {
    kind: "add_rule",
    stepId: judgmentStep.id,
    condition: "category is services",
    action: "code 6300",
    source: "interview",
  });
  applySpecEdit(workflow.id, {
    kind: "add_rule",
    stepId: judgmentStep.id,
    condition: "invoice number already exists in the tracker (duplicate)",
    action: "request a corrected invoice",
    source: "interview",
  });
  const second = await runEvals(workflow.id);
  console.log(`    ${second.passCount}/${second.total} passed.`);

  console.log("6/6 Deploying to shadow and running three shadow invoices...");
  deployToShadow(workflow.id);
  const inputs = [
    {
      vendor: "Meridian Supply Co", invoiceNumber: "8901", amount: 233.1, dueDate: "2026-08-30",
      hasAttachment: true, poFound: true, poAmount: 233.1, category: "office supplies",
    },
    {
      vendor: "Atlas Freight", invoiceNumber: "INV-2290", amount: 1480.0, dueDate: "2026-09-02",
      hasAttachment: true, poFound: true, poAmount: 1480.0, category: "freight",
    },
    {
      vendor: "Pinehill Services", invoiceNumber: "PH-95", amount: 640.0, dueDate: "2026-09-04",
      hasAttachment: true, poFound: true, poAmount: 612.0, category: "services",
    },
  ];
  for (const runInput of inputs) {
    await startRun({ workflowId: workflow.id, mode: "shadow", runInput });
  }

  // Work part of the inbox: approve two drafts, edit one (the feedback loop),
  // and leave the rest pending so the inbox has real work in it.
  const pending = listPendingApprovals();
  if (pending[0]) await resolveApprovalAndContinue({ approvalId: pending[0].id, status: "approved" });
  if (pending[1]) await resolveApprovalAndContinue({ approvalId: pending[1].id, status: "approved" });
  if (pending[2]) {
    await resolveApprovalAndContinue({
      approvalId: pending[2].id,
      status: "edited",
      editedDraft: {
        note: "Atlas Freight bills are entered with net-45 terms, not the default net-30.",
      },
    });
  }

  const done = getWorkflow(workflow.id)!;
  console.log(`\nSeeded "${done.title}" (${done.id}) in status "${done.status}".`);
  console.log(`Open approvals: ${listPendingApprovals().length}. Start the app: npm run dev`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
