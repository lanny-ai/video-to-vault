import type { WorkflowSpec } from "@/lib/spec/schema";
import { groundedConfidence } from "@/lib/spec/schema";
import {
  addGoldenCase,
  getWorkflow,
  saveSpec,
  setWorkflowStatus,
} from "@/lib/db/repo";

/**
 * The interview engine. Interaction rules are absolute:
 * - Exactly one question at a time. Never two.
 * - Every question leads with the AI's proposed answer; the default action is
 *   Confirm, the secondary is Correct. The tool does the thinking.
 * - Answers update the assumption ledger; corrections can amend decision rules;
 *   harvest questions accept historical examples into the golden dataset.
 */

export interface InterviewQuestion {
  assumptionId: string;
  stepId?: string;
  question: string;
  proposedAnswer: string;
  evidence?: { timestampSec: number; transcriptSnippet?: string };
  harvestExamples: boolean;
  /** Position for the progress meter: 1-based index over open assumptions at generation time. */
  position: number;
  remaining: number;
}

/** The single next question, or null when the interview is complete. */
export function nextQuestion(spec: WorkflowSpec): InterviewQuestion | null {
  const open = spec.assumptions.filter((a) => a.status === "open");
  if (open.length === 0) return null;
  // Intake/harvest questions come first: they unlock the eval dataset.
  const sorted = [...open].sort((a, b) => Number(b.harvestExamples) - Number(a.harvestExamples));
  const current = sorted[0];
  return {
    assumptionId: current.id,
    stepId: current.stepId,
    question: current.question,
    proposedAnswer: current.proposedAnswer,
    evidence: current.evidence,
    harvestExamples: current.harvestExamples,
    position: spec.assumptions.length - open.length + 1,
    remaining: open.length,
  };
}

export interface AnswerInput {
  workflowId: string;
  assumptionId: string;
  /** "confirm" accepts the proposed answer; "correct" replaces it. */
  action: "confirm" | "correct";
  correction?: string;
  /** Optional historical examples supplied alongside a harvest question. */
  examples?: { name: string; input: Record<string, unknown>; expected: Record<string, unknown> }[];
}

export interface AnswerResult {
  spec: WorkflowSpec;
  confidence: ReturnType<typeof groundedConfidence>;
  interviewComplete: boolean;
  examplesAdded: number;
}

export function answerQuestion(input: AnswerInput): AnswerResult {
  const workflow = getWorkflow(input.workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${input.workflowId} has no spec to interview against.`);
  const spec = workflow.spec;

  const assumption = spec.assumptions.find((a) => a.id === input.assumptionId);
  if (!assumption) throw new Error(`Assumption not found: ${input.assumptionId}`);
  if (assumption.status !== "open") {
    throw new Error(`Assumption ${input.assumptionId} was already ${assumption.status}.`);
  }
  if (input.action === "correct" && !input.correction?.trim()) {
    throw new Error("A correction needs the corrected answer text.");
  }

  if (input.action === "confirm") {
    assumption.status = "confirmed";
    assumption.finalAnswer = assumption.proposedAnswer;
  } else {
    assumption.status = "corrected";
    assumption.finalAnswer = input.correction!.trim();
    // A correction that states a rule becomes a decision rule on its step.
    if (assumption.stepId) {
      const step = spec.steps.find((s) => s.id === assumption.stepId);
      if (step) {
        step.decisionRules.push({
          id: `${step.id}-rule-interview-${step.decisionRules.length + 1}`,
          condition: `per interview: ${assumption.question.slice(0, 80)}`,
          action: assumption.finalAnswer,
          source: "interview",
        });
      }
    }
  }

  let examplesAdded = 0;
  if (input.examples) {
    for (const example of input.examples) {
      addGoldenCase({
        workflowId: input.workflowId,
        name: example.name,
        input: example.input,
        expected: example.expected,
        source: "interview",
      });
      examplesAdded += 1;
    }
  }

  saveSpec(input.workflowId, spec);
  const confidence = groundedConfidence(spec);
  const complete = spec.assumptions.every((a) => a.status !== "open");
  if (complete && workflow.status === "interviewing") {
    setWorkflowStatus(input.workflowId, "evals");
  } else if (!complete && workflow.status === "mapped") {
    setWorkflowStatus(input.workflowId, "interviewing");
  }
  return { spec, confidence, interviewComplete: complete, examplesAdded };
}

/** Begin the interview: mapped -> interviewing (idempotent). */
export function startInterview(workflowId: string): void {
  const workflow = getWorkflow(workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${workflowId} has no spec.`);
  if (workflow.status === "mapped") setWorkflowStatus(workflowId, "interviewing");
}
