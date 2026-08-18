import { getWorkflow, saveSpec } from "@/lib/db/repo";
import type { StepClassification, WorkflowSpec } from "./schema";

/**
 * Review-screen edits. Every edit is a small, explicit patch; the spec is
 * re-validated on save, and rules added by hand are tagged with their source.
 */

export type SpecEdit =
  | {
      kind: "add_rule";
      stepId: string;
      condition: string;
      action: string;
      source: "interview" | "inferred";
    }
  | { kind: "set_classification"; stepId: string; classification: StepClassification }
  | { kind: "set_externally_visible"; stepId: string; externallyVisible: boolean }
  | { kind: "resolve_redaction"; flagId: string }
  | { kind: "set_title"; title: string };

export function applySpecEdit(workflowId: string, edit: SpecEdit): WorkflowSpec {
  const workflow = getWorkflow(workflowId);
  if (!workflow?.spec) throw new Error(`Workflow ${workflowId} has no spec.`);
  const spec = workflow.spec;

  switch (edit.kind) {
    case "add_rule": {
      const step = spec.steps.find((s) => s.id === edit.stepId);
      if (!step) throw new Error(`Step not found: ${edit.stepId}`);
      step.decisionRules.push({
        id: `${step.id}-rule-manual-${step.decisionRules.length + 1}`,
        condition: edit.condition,
        action: edit.action,
        source: edit.source,
      });
      break;
    }
    case "set_classification": {
      const step = spec.steps.find((s) => s.id === edit.stepId);
      if (!step) throw new Error(`Step not found: ${edit.stepId}`);
      step.classification = edit.classification;
      if (edit.classification === "human_approval") step.executor.kind = "human";
      break;
    }
    case "set_externally_visible": {
      const step = spec.steps.find((s) => s.id === edit.stepId);
      if (!step) throw new Error(`Step not found: ${edit.stepId}`);
      step.externallyVisible = edit.externallyVisible;
      break;
    }
    case "resolve_redaction": {
      const flag = spec.redactionFlags.find((f) => f.id === edit.flagId);
      if (!flag) throw new Error(`Redaction flag not found: ${edit.flagId}`);
      flag.resolved = true;
      break;
    }
    case "set_title": {
      spec.title = edit.title;
      break;
    }
  }
  saveSpec(workflowId, spec);
  return spec;
}
