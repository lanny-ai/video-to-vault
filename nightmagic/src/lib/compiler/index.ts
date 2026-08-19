import type { Step, WorkflowSpec } from "@/lib/spec/schema";
import { lintSpec, type TriageFinding } from "@/lib/spec/triage";

/**
 * The compiler turns an approved spec into an executable plan.
 *
 * Structural rule (the draft -> approve -> execute sandwich): an approval gate
 * is inserted before every externally visible action by default. Only a step
 * that has graduated to trustLevel "auto" skips its gate, and graduation is a
 * human decision made in the approval inbox, never automatic.
 */

export type ExecNode =
  | { kind: "action"; step: Step }
  | { kind: "approval_gate"; step: Step; reason: string }
  | { kind: "human_task"; step: Step };

export interface ExecutablePlan {
  workflowId: string;
  nodes: ExecNode[];
  warnings: TriageFinding[];
}

export class CompileRefusedError extends Error {}

export function compileSpec(spec: WorkflowSpec): ExecutablePlan {
  if (spec.goNoGo.decision === "no_go") {
    throw new CompileRefusedError(
      `This workflow is marked no-go: ${spec.goNoGo.rationale} Change the assessment in review if circumstances changed.`,
    );
  }
  const openAssumptions = spec.assumptions.filter((a) => a.status === "open").length;
  if (openAssumptions > 0) {
    throw new CompileRefusedError(
      `${openAssumptions} assumption${openAssumptions === 1 ? "" : "s"} still open. Finish the interview before compiling; each phase earns the next.`,
    );
  }

  const nodes: ExecNode[] = [];
  const ordered = [...spec.steps].sort((a, b) => a.index - b.index);
  for (const step of ordered) {
    if (step.classification === "human_approval") {
      nodes.push({ kind: "human_task", step });
      continue;
    }
    if (step.externallyVisible && step.trustLevel !== "auto") {
      nodes.push({
        kind: "approval_gate",
        step,
        reason:
          "This step commits something outside the system. A person approves the draft before it executes.",
      });
    }
    nodes.push({ kind: "action", step });
  }
  return { workflowId: spec.id, nodes, warnings: lintSpec(spec) };
}
