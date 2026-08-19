import type { WorkflowSpec } from "@/lib/spec/schema";
import { parseSpokenAmount } from "@/lib/pipeline/mapgen";

/**
 * A small interpreter over the spec's decision rules. This is what makes demo
 * mode honest: the judgment connector derives its behavior from the rules
 * extracted out of the recording (plus interview corrections), never from
 * hardcoded business logic. Anything the rules do not cover stays uncovered
 * and shows up as an eval failure, which is the point.
 */

export interface Decision {
  action: "enter" | "request_correction" | "escalate";
  glCode: string | null;
  needsSignoff: boolean;
  reasons: string[];
}

function allRules(spec: WorkflowSpec) {
  return spec.steps.flatMap((s) => s.decisionRules);
}

export function evaluateDecision(
  spec: WorkflowSpec,
  input: Record<string, unknown>,
): Decision {
  const rules = allRules(spec);
  const reasons: string[] = [];
  const ruleText = (r: { condition: string; action: string }) =>
    `${r.condition} ${r.action}`.toLowerCase();

  // 1. Missing data: any null/empty input field fails intake validation.
  const missing = Object.entries(input).filter(
    ([, v]) => v === null || v === undefined || v === "",
  );
  if (missing.length > 0) {
    reasons.push(`Missing data: ${missing.map(([k]) => k).join(", ")}`);
    return { action: "request_correction", glCode: null, needsSignoff: false, reasons };
  }

  // 2. Rules about missing references (e.g. "missing PO -> ask for correction").
  const missingRefRule = rules.find((r) => /missing po|no po\b/i.test(ruleText(r)));
  if (missingRefRule && input.poFound === false) {
    reasons.push(`Rule applied: ${missingRefRule.condition} -> ${missingRefRule.action}`);
    return { action: "request_correction", glCode: null, needsSignoff: false, reasons };
  }

  // 3. Mismatch rules ("if the amounts do not match exactly, flag it").
  const mismatchRule = rules.find((r) => /not match|mismatch/i.test(ruleText(r)));
  if (
    mismatchRule &&
    typeof input.amount === "number" &&
    typeof input.poAmount === "number" &&
    input.amount !== input.poAmount
  ) {
    reasons.push(`Rule applied: ${mismatchRule.condition} -> ${mismatchRule.action}`);
    return { action: "request_correction", glCode: null, needsSignoff: false, reasons };
  }

  // 4. Duplicate rules (usually added later through interview or correction).
  const duplicateRule = rules.find((r) => /duplicate|already exists|already in/i.test(ruleText(r)));
  if (duplicateRule && input.duplicate === true) {
    reasons.push(`Rule applied: ${duplicateRule.condition} -> ${duplicateRule.action}`);
    return { action: "request_correction", glCode: null, needsSignoff: false, reasons };
  }

  // 5. Threshold rules ("amount over five hundred dollars -> sign-off").
  let needsSignoff = false;
  for (const rule of rules) {
    const threshold = rule.condition.match(/amount over\s+(.{1,40})/i);
    if (threshold && typeof input.amount === "number") {
      const limit = parseSpokenAmount(threshold[1]);
      if (limit !== null && input.amount > limit) {
        needsSignoff = true;
        reasons.push(`Rule applied: ${rule.condition} -> ${rule.action}`);
      }
    }
  }

  // 6. Category mappings ("category is office supplies -> code 6200").
  let glCode: string | null = null;
  const category = String(input.category ?? "").toLowerCase();
  for (const rule of rules) {
    const condition = rule.condition.match(/category is\s+(.{2,40})/i);
    const code = rule.action.match(/code\s+(\d{3,5})/i);
    if (condition && code) {
      const target = condition[1].trim().toLowerCase();
      if (category && (category.includes(target) || target.includes(category))) {
        glCode = code[1];
        reasons.push(`Rule applied: ${rule.condition} -> ${rule.action}`);
        break;
      }
    }
  }
  if (glCode === null && category) {
    reasons.push(
      `No rule covers category "${category}". The recording never stated its code; this needs an interview answer or a correction.`,
    );
  }

  return { action: "enter", glCode, needsSignoff, reasons };
}
