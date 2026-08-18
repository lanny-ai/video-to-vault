import {
  SPEC_VERSION,
  WorkflowSpec,
  type Assumption,
  type DecisionRule,
  type EvidenceRef,
  type IntakeVariant,
  type ObservedStep,
  type Step,
} from "@/lib/spec/schema";
import {
  defaultFailureModes,
  suggestClassification,
  suggestExternallyVisible,
} from "@/lib/spec/triage";
import { decideGoNoGo } from "@/lib/spec/gonogo";
import { llmAvailable, llmJson } from "@/lib/llm/client";
import type { FrameRow, TranscriptSegment } from "@/lib/db/repo";
import { scanForRedactions } from "./redact";

/**
 * Map generation: transcript + frames in, operating map (workflow spec) out.
 *
 * Two paths behind one interface:
 * - LLM path (claude-fable-5) when a key is configured.
 * - Deterministic path for demo mode and tests: cue-based segmentation,
 *   rule extraction, hedge-word assumptions, triage classification.
 *
 * Both paths only claim what the recording supports. Inferences become
 * assumptions, never facts.
 */

export interface MapgenInput {
  workflowId: string;
  title: string;
  transcript: TranscriptSegment[];
  frames: FrameRow[];
}

export async function generateMap(input: MapgenInput): Promise<WorkflowSpec> {
  if (input.transcript.length === 0) {
    throw new EmptyTranscriptError();
  }
  if (llmAvailable()) {
    try {
      return await generateMapLlm(input);
    } catch (err) {
      // The deterministic path is the safety net, but never silently:
      // the spec it produces carries a demo-mode marker in its summary.
      console.error("LLM map generation failed, using deterministic path:", err);
    }
  }
  return generateMapDeterministic(input);
}

export class EmptyTranscriptError extends Error {
  constructor() {
    super(
      "The recording has no transcript. Vault FDE needs narration to extract the business rules; re-record with the coaching card, speaking through each step.",
    );
  }
}

// ---------------------------------------------------------------------------
// LLM path

const MAPGEN_SYSTEM = `You are a forward deployed engineer producing an operating map from a screen recording of a business process. You receive the narration transcript (timestamped) and descriptions of each screen change.

Produce a workflow spec with:
- observed: the as-is steps exactly as the person performed them, each with evidence timestamps.
- steps: the to-be automation design. Restructure where an API replaces a UI path. Classify each step: deterministic (default; if-then and API calls), llm_judgment (only genuine judgment: categorization, extraction from unstructured input, drafting), human_approval (sign-offs, thresholds, exceptions). Mark externallyVisible true on any step that commits something outside the system (sends, writes records, notifies). Prefer executor kind "api" over "browser".
- decisionRules: every conditional the narrator states (if/when/unless/over amounts), with the evidence timestamp. These rules are the reason this product exists; do not miss any.
- assumptions: everything you inferred rather than heard or saw. Hedge words (usually, sometimes, typically) always produce an assumption with your best-guess proposedAnswer, status "open". Set harvestExamples true where historical examples would build the eval dataset.
- trigger.intakeVariants: every variant of how work arrives that the narration mentions.
- roi: score revenueUplift, riskMitigation, costSavings, buildCost, automationRisk 0-5 with a grounded narrative. Do not inflate.
Only state what the recording supports. If you did not hear or see it, it goes in assumptions or nowhere.`;

async function generateMapLlm(input: MapgenInput): Promise<WorkflowSpec> {
  const transcriptText = input.transcript
    .map((s) => `[${s.startSec}s-${s.endSec}s] ${s.text}`)
    .join("\n");
  const framesText = input.frames
    .map((f) => `[${f.timestampSec}s] ${f.description}`)
    .join("\n");

  const raw = await llmJson({
    tier: "primary",
    system: MAPGEN_SYSTEM,
    user: `Workflow id: ${input.workflowId}\nTitle: ${input.title}\n\nTRANSCRIPT:\n${transcriptText}\n\nSCREEN CHANGES:\n${framesText}\n\nReturn a JSON object matching the workflow spec schema with specVersion "${SPEC_VERSION}", id "${input.workflowId}", and goNoGo derived from the roi scores.`,
    schema: WorkflowSpec,
    maxTokens: 32000,
  });
  // The model proposes; deterministic policy decides go/no-go and redaction.
  raw.goNoGo = decideGoNoGo(raw.roi);
  raw.redactionFlags = scanForRedactions(input.transcript, input.frames);
  for (const step of raw.steps) {
    if (step.failureModes.length === 0) step.failureModes = defaultFailureModes(step);
  }
  return WorkflowSpec.parse(raw);
}

// ---------------------------------------------------------------------------
// Deterministic path

const ORDER_CUES = /^(first|then|next|once|after that|finally|lastly)\b/i;
const HEDGES: { pattern: RegExp; question: (m: string) => string }[] = [
  {
    pattern: /\busually\b/i,
    question: () => "You said 'usually'. What happens in the cases where it is not usual?",
  },
  {
    pattern: /\bsometimes\b/i,
    question: () => "You said 'sometimes'. How do you decide which way to handle it?",
  },
  {
    pattern: /\btypically\b/i,
    question: () => "You said 'typically'. What are the exceptions?",
  },
  {
    pattern: /\babout\b\s+\w+/i,
    question: () => "You gave an approximate figure. What is the actual range?",
  },
  {
    pattern: /\ba few\b/i,
    question: () => "You said 'a few'. Which ones specifically?",
  },
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  hundred: 100, thousand: 1000,
};

/** "five hundred dollars" -> 500. Good enough for spoken thresholds. */
export function parseSpokenAmount(text: string): number | null {
  const digit = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:dollars)?/);
  if (digit && /\d/.test(digit[1])) {
    const value = parseFloat(digit[1].replace(/,/g, ""));
    if (!Number.isNaN(value)) return value;
  }
  const words = text.toLowerCase().match(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand)\b(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand)\b)*/);
  if (!words) return null;
  let total = 0;
  let current = 0;
  for (const word of words[0].split(/[\s-]+/)) {
    const value = WORD_NUMBERS[word];
    if (value === undefined) continue;
    if (value === 100 || value === 1000) {
      current = (current || 1) * value;
    } else {
      current += value;
    }
  }
  total += current;
  return total || null;
}

const SYSTEM_HINTS: { pattern: RegExp; system: string; operation: string }[] = [
  { pattern: /\b(inbox|email|gmail|reply|mail)\b/i, system: "Email", operation: "email" },
  { pattern: /\b(spreadsheet|sheet|excel|tracker)\b/i, system: "Spreadsheet", operation: "sheets" },
  { pattern: /\bnetsuite\b/i, system: "NetSuite", operation: "netsuite" },
  { pattern: /\b(salesforce|hubspot|crm)\b/i, system: "CRM", operation: "crm" },
  { pattern: /\b(slack|channel|teams)\b/i, system: "Chat", operation: "chat" },
];

function detectSystem(text: string): { system: string; operation: string } {
  for (const hint of SYSTEM_HINTS) {
    if (hint.pattern.test(text)) return { system: hint.system, operation: hint.operation };
  }
  return { system: "Unknown system", operation: "http" };
}

function titleFromText(text: string): string {
  const cleaned = text
    .replace(ORDER_CUES, "")
    .replace(/^[,\s]+/, "")
    .replace(/\bI\b/g, "")
    .trim();
  const sentence = cleaned.split(/[.!?]/)[0].trim();
  const words = sentence.split(/\s+/).slice(0, 8).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function nearestFrame(frames: FrameRow[], atSec: number): FrameRow | null {
  let best: FrameRow | null = null;
  for (const frame of frames) {
    if (frame.timestampSec <= atSec + 2) best = frame;
  }
  return best ?? frames[0] ?? null;
}

function extractRules(segment: TranscriptSegment, stepId: string): DecisionRule[] {
  const rules: DecisionRule[] = [];
  const sentences = segment.text.split(/(?<=[.!?])\s+/);
  let n = 0;
  const push = (condition: string, action: string, sentence: string) => {
    n += 1;
    rules.push({
      id: `${stepId}-rule-${n}`,
      condition,
      action: action.trim().replace(/[.!?]$/, ""),
      source: "narration",
      evidence: { timestampSec: segment.startSec, transcriptSnippet: sentence.trim() },
    });
  };
  for (const sentence of sentences) {
    // "Anything over five hundred dollars has to go to Sarah for sign-off."
    const threshold = sentence.match(
      /\b(?:anything|everything)\s+over\s+(.{2,50}?)\s+(?:has to|have to|must|needs? to|goes? to)\s+(.{3,140})/i,
    );
    if (threshold) {
      push(`amount over ${threshold[1].trim()}`, threshold[2], sentence);
      continue;
    }
    // "If the amounts do not match exactly, I flag it." — and the same
    // sentence without the comma, which is how people actually talk.
    const conditional =
      sentence.match(/\b(if|when|unless|once)\b\s+(.{3,90}?)[,.]\s*(.{3,140})/i) ??
      sentence.match(/\b(if|when|unless|once)\b\s+(.{3,60}?)\s+((?:I|we)\s.{2,140})/i);
    if (conditional) {
      push(`${conditional[1].toLowerCase()} ${conditional[2].trim()}`, conditional[3], sentence);
      continue;
    }
    // Category mappings: "Office supplies go to 6200, freight goes to 6450."
    for (const mapping of sentence.matchAll(/\b([A-Za-z][\w ]{2,24}?)\s+go(?:es)?\s+to\s+(\d{3,5})\b/g)) {
      push(`category is ${mapping[1].trim().toLowerCase()}`, `code ${mapping[2]}`, sentence);
    }
  }
  return rules;
}

export function generateMapDeterministic(input: MapgenInput): WorkflowSpec {
  const { transcript, frames } = input;

  const observed: ObservedStep[] = [];
  const steps: Step[] = [];
  const assumptions: Assumption[] = [];
  const intakeVariants: IntakeVariant[] = [];

  let assumptionN = 0;
  const addAssumption = (a: Omit<Assumption, "id" | "status">) => {
    assumptionN += 1;
    assumptions.push({ id: `as-${assumptionN}`, status: "open", ...a });
  };

  transcript.forEach((segment, i) => {
    const stepId = `step-${i + 1}`;
    const obsId = `obs-${i + 1}`;
    const frame = nearestFrame(frames, segment.startSec);
    const evidence: EvidenceRef[] = [
      {
        timestampSec: segment.startSec,
        frameId: frame?.id,
        transcriptSnippet: segment.text.slice(0, 160),
      },
    ];
    const { system, operation } = detectSystem(segment.text);
    const title = titleFromText(segment.text);
    const classification = suggestClassification(segment.text);
    const externallyVisible = suggestExternallyVisible(segment.text);
    const rules = extractRules(segment, stepId);

    observed.push({
      id: obsId,
      index: i,
      title,
      observedAction: segment.text,
      system,
      evidence,
    });

    const isSpreadsheetCopy = /\b(spreadsheet|tracker|key those|copy)\b/i.test(segment.text);
    const step: Step = {
      id: stepId,
      index: i,
      title,
      goal: segment.text.split(/[.!?]/)[0].trim(),
      system,
      classification,
      executor: {
        kind: classification === "human_approval" ? "human" : "api",
        operation:
          classification === "llm_judgment" ? "llm.judge" : `${operation}.auto`,
        config: {},
      },
      inputs: [],
      outputs: [],
      decisionRules: rules,
      failureModes: [],
      externallyVisible,
      trustLevel: "shadow",
      approvalStats: { approvals: 0, edits: 0, rejections: 0 },
      derivedFrom: [obsId],
      changeNote: isSpreadsheetCopy
        ? "Manual re-keying is replaced by an automatic write to the system of record; the spreadsheet becomes a read-only view."
        : undefined,
      evidence,
    };
    step.failureModes = defaultFailureModes(step);
    steps.push(step);

    // Hedge words become open assumptions with a proposed answer.
    for (const hedge of HEDGES) {
      const match = segment.text.match(hedge.pattern);
      if (match) {
        addAssumption({
          stepId,
          question: hedge.question(match[0]),
          proposedAnswer:
            "Treat the stated behavior as the default and route anything that deviates to a person for review.",
          evidence: { timestampSec: segment.startSec, transcriptSnippet: segment.text.slice(0, 160) },
          harvestExamples: false,
        });
      }
    }

    // Spoken thresholds: confirm the number and whether it is fixed.
    const threshold = segment.text.match(
      /\b(?:anything|everything)?\s*over\s+((?:[\w,-]+\s){0,3}?(?:dollars|\$[\d,]+|[\d,]+))/i,
    );
    if (threshold) {
      const amount = parseSpokenAmount(threshold[1]);
      addAssumption({
        stepId,
        question: `You mentioned a threshold of ${amount !== null ? `$${amount}` : `"${threshold[1].trim()}"`}. Is that a fixed number, and does it ever change?`,
        proposedAnswer: `The threshold is fixed at ${amount !== null ? `$${amount}` : threshold[1].trim()} and applies to every vendor.`,
        evidence: { timestampSec: segment.startSec, transcriptSnippet: segment.text.slice(0, 160) },
        harvestExamples: false,
      });
    }
  });

  // The judgment lives at the decision point: the step carrying the most
  // decision rules becomes the workflow's judgment step, executed by the
  // model (or the rule interpreter in demo mode).
  const candidates = steps.filter((s) => s.classification !== "human_approval");
  const decisionStep = candidates.reduce<Step | null>(
    (best, s) =>
      s.decisionRules.length > 0 && s.decisionRules.length > (best?.decisionRules.length ?? 0)
        ? s
        : best,
    null,
  );
  if (decisionStep) {
    decisionStep.classification = "llm_judgment";
    decisionStep.executor = { kind: "llm", operation: "llm.judge", config: {} };
    decisionStep.failureModes = defaultFailureModes(decisionStep);
  }

  // Intake variance: the first segment usually describes how work arrives.
  const intakeText = transcript[0].text;
  const variantPatterns: { pattern: RegExp; description: string }[] = [
    { pattern: /\bpdf/i, description: "Attachment is a PDF" },
    { pattern: /\bphotos?\b/i, description: "Attachment is a photo or screenshot" },
    { pattern: /\bemail body\b|\binto the email\b/i, description: "Content pasted directly in the email body" },
    { pattern: /\bforwarded\b/i, description: "Buried in a forwarded thread" },
    { pattern: /\bspreadsheet|excel\b/i, description: "Arrives as a spreadsheet" },
  ];
  let variantN = 0;
  for (const vp of variantPatterns) {
    if (vp.pattern.test(intakeText)) {
      variantN += 1;
      intakeVariants.push({
        id: `iv-${variantN}`,
        description: vp.description,
        source: "narration",
      });
    }
  }
  // The intake step is the highest-variance step: always harvest examples.
  addAssumption({
    stepId: steps[0]?.id,
    question:
      "Intake is where most exceptions live. Can you share 10 real examples of what actually arrives, including the odd ones?",
    proposedAnswer:
      "The variants mentioned in the recording cover the common cases; real examples will surface the rest.",
    evidence: { timestampSec: transcript[0].startSec, transcriptSnippet: intakeText.slice(0, 160) },
    harvestExamples: true,
  });

  const volumeHint = /\b(every morning|every day|daily|each day)\b/i.test(
    transcript.map((t) => t.text).join(" "),
  );
  const roi = {
    revenueUplift: 0.5,
    riskMitigation: 2.5,
    costSavings: volumeHint ? 3.5 : 2,
    buildCost: 2,
    automationRisk: 1.5,
    narrative: volumeHint
      ? "A daily manual process with clear rules: cost savings dominate, with moderate risk mitigation from consistent validation. Scores are heuristic until run data replaces them."
      : "Frequency was not stated in the recording, so cost savings are scored conservatively. Scores are heuristic until run data replaces them.",
  };

  const spec: WorkflowSpec = {
    specVersion: SPEC_VERSION,
    id: input.workflowId,
    title: input.title,
    summary: `Operating map generated deterministically (demo mode) from ${transcript.length} narration segments and ${frames.length} screen changes. With an API key configured, map generation uses the primary model.`,
    trigger: {
      description: transcript[0].text.split(/[.!?]/)[0].trim(),
      intakeVariants,
    },
    observed,
    steps,
    assumptions,
    redactionFlags: scanForRedactions(transcript, frames),
    roi,
    goNoGo: decideGoNoGo(roi),
    handoffs: { upstream: [], downstream: [] },
  };
  return WorkflowSpec.parse(spec);
}
