import { z } from "zod";

/**
 * The workflow spec is the product's canonical intermediate representation:
 * everything downstream (interview, evals, compiler, runtime, reports) consumes
 * this document, never the video. Versioned so stored specs can be migrated.
 */
export const SPEC_VERSION = "1.0";

export const StepClassification = z.enum([
  "deterministic",
  "llm_judgment",
  "human_approval",
]);
export type StepClassification = z.infer<typeof StepClassification>;

export const TrustLevel = z.enum(["shadow", "approve_each", "auto"]);
export type TrustLevel = z.infer<typeof TrustLevel>;

/** A pointer back into the recording: the receipts behind every claim. */
export const EvidenceRef = z.object({
  timestampSec: z.number().min(0),
  frameId: z.string().optional(),
  transcriptSnippet: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const RuleSource = z.enum(["narration", "on_screen", "interview", "inferred"]);
export type RuleSource = z.infer<typeof RuleSource>;

/** Business rules extracted from narration: the conditionals that never appear on screen. */
export const DecisionRule = z.object({
  id: z.string(),
  condition: z.string(),
  action: z.string(),
  source: RuleSource,
  evidence: EvidenceRef.optional(),
});
export type DecisionRule = z.infer<typeof DecisionRule>;

export const FailureHandling = z.enum(["retry", "route_to_human", "abort", "skip"]);

export const FailureMode = z.object({
  id: z.string(),
  description: z.string(),
  handling: FailureHandling,
  source: RuleSource,
});
export type FailureMode = z.infer<typeof FailureMode>;

export const AssumptionStatus = z.enum(["open", "confirmed", "corrected"]);

/**
 * Anything the tool inferred rather than observed. Every assumption is visible
 * and badged until a human confirms or corrects it. Never silent guessing.
 */
export const Assumption = z.object({
  id: z.string(),
  stepId: z.string().optional(),
  question: z.string(),
  proposedAnswer: z.string(),
  status: AssumptionStatus,
  finalAnswer: z.string().optional(),
  evidence: EvidenceRef.optional(),
  /** When true, the interview also asks for historical examples at this point. */
  harvestExamples: z.boolean().default(false),
});
export type Assumption = z.infer<typeof Assumption>;

export const RedactionKind = z.enum(["pii", "credential", "financial"]);

export const RedactionFlag = z.object({
  id: z.string(),
  frameId: z.string().optional(),
  timestampSec: z.number().min(0),
  kind: RedactionKind,
  note: z.string(),
  resolved: z.boolean().default(false),
});
export type RedactionFlag = z.infer<typeof RedactionFlag>;

export const ExecutorKind = z.enum(["api", "webhook", "human", "browser", "llm"]);
export type ExecutorKind = z.infer<typeof ExecutorKind>;

export const ExecutorConfig = z.object({
  kind: ExecutorKind,
  /** e.g. "gmail.send", "http.post", free-form connector reference */
  operation: z.string(),
  config: z.record(z.unknown()).default({}),
});
export type ExecutorConfig = z.infer<typeof ExecutorConfig>;

/** As-is: what the human actually did on screen, evidence-linked. */
export const ObservedStep = z.object({
  id: z.string(),
  index: z.number().int().min(0),
  title: z.string(),
  observedAction: z.string(),
  system: z.string(),
  evidence: z.array(EvidenceRef),
});
export type ObservedStep = z.infer<typeof ObservedStep>;

/** To-be: one step of the designed automation. */
export const Step = z.object({
  id: z.string(),
  index: z.number().int().min(0),
  title: z.string(),
  goal: z.string(),
  system: z.string(),
  classification: StepClassification,
  executor: ExecutorConfig,
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  decisionRules: z.array(DecisionRule).default([]),
  failureModes: z.array(FailureMode).default([]),
  /**
   * True when the step commits something outside the system (sends an email,
   * writes a record, notifies a person). The compiler inserts an approval gate
   * before every externally visible step unless the step has graduated to auto.
   */
  externallyVisible: z.boolean(),
  trustLevel: TrustLevel.default("shadow"),
  approvalStats: z
    .object({
      approvals: z.number().int().min(0).default(0),
      edits: z.number().int().min(0).default(0),
      rejections: z.number().int().min(0).default(0),
    })
    .default({ approvals: 0, edits: 0, rejections: 0 }),
  /** Which observed (as-is) steps this designed step derives from. */
  derivedFrom: z.array(z.string()).default([]),
  /** Present when the to-be design restructures rather than replicates. */
  changeNote: z.string().optional(),
  evidence: z.array(EvidenceRef).default([]),
});
export type Step = z.infer<typeof Step>;

export const IntakeVariant = z.object({
  id: z.string(),
  description: z.string(),
  frequencyHint: z.string().optional(),
  source: RuleSource,
});
export type IntakeVariant = z.infer<typeof IntakeVariant>;

/**
 * The three buckets that matter to a business, plus what automation costs and
 * risks. Scores are 0-5. The go/no-go gate reads these.
 */
export const RoiScore = z.object({
  revenueUplift: z.number().min(0).max(5),
  riskMitigation: z.number().min(0).max(5),
  costSavings: z.number().min(0).max(5),
  buildCost: z.number().min(0).max(5),
  automationRisk: z.number().min(0).max(5),
  narrative: z.string(),
});
export type RoiScore = z.infer<typeof RoiScore>;

export const GoNoGo = z.object({
  decision: z.enum(["go", "no_go", "partial"]),
  rationale: z.string(),
});
export type GoNoGo = z.infer<typeof GoNoGo>;

export const WorkflowSpec = z.object({
  specVersion: z.literal(SPEC_VERSION),
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  /** The trigger is usually the messiest step; intake variance gets first-class treatment. */
  trigger: z.object({
    description: z.string(),
    intakeVariants: z.array(IntakeVariant).default([]),
  }),
  observed: z.array(ObservedStep),
  steps: z.array(Step),
  assumptions: z.array(Assumption).default([]),
  redactionFlags: z.array(RedactionFlag).default([]),
  roi: RoiScore,
  goNoGo: GoNoGo,
  /** Named upstream/downstream handoffs feed next-bottleneck suggestions. */
  handoffs: z
    .object({
      upstream: z.array(z.string()).default([]),
      downstream: z.array(z.string()).default([]),
    })
    .default({ upstream: [], downstream: [] }),
});
export type WorkflowSpec = z.infer<typeof WorkflowSpec>;

export function parseSpec(raw: unknown): WorkflowSpec {
  return WorkflowSpec.parse(raw);
}

export function safeParseSpec(raw: unknown) {
  return WorkflowSpec.safeParse(raw);
}

/**
 * Grounded confidence: how much of the map rests on confirmed ground versus
 * open assumptions. Drives the interview progress meter.
 */
export function groundedConfidence(spec: WorkflowSpec): {
  ratio: number;
  open: number;
  resolved: number;
} {
  const open = spec.assumptions.filter((a) => a.status === "open").length;
  const resolved = spec.assumptions.length - open;
  const evidencedSteps = spec.steps.filter((s) => s.evidence.length > 0).length;
  const stepRatio = spec.steps.length === 0 ? 0 : evidencedSteps / spec.steps.length;
  const assumptionRatio =
    spec.assumptions.length === 0 ? 1 : resolved / spec.assumptions.length;
  // Steps grounded in evidence carry more weight than assumption closure.
  const ratio = 0.6 * stepRatio + 0.4 * assumptionRatio;
  return { ratio: Math.round(ratio * 100) / 100, open, resolved };
}
