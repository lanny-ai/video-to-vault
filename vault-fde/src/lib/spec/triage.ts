import type { Step, StepClassification, WorkflowSpec } from "./schema";

/**
 * Judgment triage: the heart of FDE judgment. Most steps should be
 * deterministic; the model is reached for only at genuine judgment points, and
 * a human owns anything irreversible or unsafe.
 *
 * These heuristics power demo mode and act as a validation layer over
 * LLM-produced classifications: a step whose description trips a rule is
 * flagged for review rather than silently reclassified.
 */

const JUDGMENT_SIGNALS = [
  /categori[sz]e/i,
  /classif/i,
  /judg(e|ment)/i,
  /interpret/i,
  /summari[sz]e/i,
  /extract .*from (unstructured|free.?form|email|pdf|document)/i,
  /decide|discretion|depends/i,
  /match .*fuzzy|fuzzy match/i,
  /draft|compose|write/i,
];

const HUMAN_SIGNALS = [
  /approv/i,
  /sign.?off/i,
  /escalat/i,
  /exception/i,
  /legal|compliance/i,
  /over \$?\d/i,
  /threshold/i,
];

const EXTERNAL_SIGNALS = [
  /send|email|notify|reply|post|publish/i,
  /pay|payment|invoice|transfer|refund/i,
  /create .*(record|ticket|task|order)/i,
  /updat(e|ing) .*(crm|erp|system|record)/i,
  /delete|remove|cancel/i,
];

export function suggestClassification(description: string): StepClassification {
  // Judgment wins over human signals: a step that mentions routing to a person
  // for sign-off is usually a judgment/verification step with an approval
  // rule attached, not itself an approval step.
  if (JUDGMENT_SIGNALS.some((r) => r.test(description))) return "llm_judgment";
  if (HUMAN_SIGNALS.some((r) => r.test(description))) return "human_approval";
  return "deterministic";
}

export function suggestExternallyVisible(description: string): boolean {
  return EXTERNAL_SIGNALS.some((r) => r.test(description));
}

export interface TriageFinding {
  stepId: string;
  kind: "classification_mismatch" | "missing_approval_gate" | "missing_failure_modes";
  message: string;
}

/**
 * Lint a spec against the triage rules. Findings are advisory: they surface in
 * review, they never silently rewrite the map.
 */
export function lintSpec(spec: WorkflowSpec): TriageFinding[] {
  const findings: TriageFinding[] = [];
  for (const step of spec.steps) {
    const text = `${step.title}. ${step.goal}`;
    const suggested = suggestClassification(text);
    if (suggested !== step.classification && suggested === "human_approval") {
      findings.push({
        stepId: step.id,
        kind: "classification_mismatch",
        message: `"${step.title}" mentions approval or thresholds but is classified ${step.classification}. Consider human_approval.`,
      });
    }
    if (suggestExternallyVisible(text) && !step.externallyVisible) {
      findings.push({
        stepId: step.id,
        kind: "missing_approval_gate",
        message: `"${step.title}" looks externally visible (it commits something outside the system) but is not marked so. The compiler would skip its approval gate.`,
      });
    }
    if (step.failureModes.length === 0) {
      findings.push({
        stepId: step.id,
        kind: "missing_failure_modes",
        message: `"${step.title}" has no failure modes. Every step needs at least one unhappy path before deployment.`,
      });
    }
  }
  return findings;
}

/** Standard unhappy paths seeded onto steps that lack them. */
export function defaultFailureModes(step: Step) {
  const modes = [
    {
      id: `${step.id}-fm-missing`,
      description: "Required input data is missing or empty",
      handling: "route_to_human" as const,
      source: "inferred" as const,
    },
  ];
  if (step.executor.kind === "api" || step.executor.kind === "webhook") {
    modes.push({
      id: `${step.id}-fm-dead`,
      description: "Target system is unreachable or times out",
      handling: "route_to_human" as const,
      source: "inferred" as const,
    });
  }
  if (step.classification === "llm_judgment") {
    modes.push({
      id: `${step.id}-fm-schema`,
      description: "Model response is malformed or fails schema validation",
      handling: "route_to_human" as const,
      source: "inferred" as const,
    });
  }
  return modes;
}
