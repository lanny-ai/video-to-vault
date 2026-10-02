import { z } from "zod";
import type { Step, WorkflowSpec } from "@/lib/spec/schema";
import { llmAvailable, llmJson } from "@/lib/llm/client";
import { evaluateDecision } from "./rules";

/**
 * The executor interface, resolved down the API-first ladder:
 * official API -> webhook -> human task; browser automation is a stub behind
 * the same interface for later. In demo mode, action connectors produce the
 * draft they would execute; live execution happens only for connectors with
 * real transport configured (http/webhook).
 */

export interface ConnectorContext {
  spec: WorkflowSpec;
  input: Record<string, unknown>;
  /** Outputs of completed steps, keyed by step id. */
  values: Record<string, Record<string, unknown>>;
  mode: "shadow" | "live" | "eval";
  /**
   * Present when a human already approved (and possibly edited) this step's
   * draft at its gate. What the human approved is what executes; connectors
   * must consume it verbatim instead of rebuilding their own draft.
   */
  approvedDraft?: Record<string, unknown>;
}

export interface ConnectorResult {
  output: Record<string, unknown>;
  summary: string;
  /** True when nothing external actually happened (shadow/demo drafts). */
  simulated: boolean;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly category:
      | "missing_data"
      | "dead_system"
      | "malformed_response"
      | "timeout"
      | "not_configured",
  ) {
    super(message);
  }
}

export type Connector = (step: Step, ctx: ConnectorContext) => Promise<ConnectorResult>;

/**
 * An approved gate draft wraps the actual action as `proposed` (plus any
 * human `correction`). Unwrap it so the step's output is the action itself.
 */
export function approvedPayload(draft: Record<string, unknown>): Record<string, unknown> {
  if (draft.proposed && typeof draft.proposed === "object" && !Array.isArray(draft.proposed)) {
    const payload = { ...(draft.proposed as Record<string, unknown>) };
    if (typeof draft.correction === "string") payload.correction = draft.correction;
    return payload;
  }
  return draft;
}

// ---------------------------------------------------------------------------

const DecisionSchema = z.object({
  action: z.enum(["enter", "request_correction", "escalate"]),
  glCode: z.string().nullable(),
  needsSignoff: z.boolean(),
  reasons: z.array(z.string()),
});

/**
 * Judgment steps: the model with the spec's rules in context, or the rule
 * interpreter in demo mode. The eval bench uses the same path as shadow/live
 * runs on purpose: the deployment gate must certify the decision procedure
 * that will actually run.
 */
const judgmentConnector: Connector = async (step, ctx) => {
  if (ctx.approvedDraft) {
    return {
      output: approvedPayload(ctx.approvedDraft),
      summary: `Executed the approved draft for ${step.title}`,
      simulated: ctx.mode !== "live",
    };
  }
  if (llmAvailable()) {
    try {
      const rules = ctx.spec.steps
        .flatMap((s) => s.decisionRules)
        .map((r) => `- when ${r.condition}: ${r.action}`)
        .join("\n");
      const output = await llmJson({
        tier: "primary",
        system: `You are executing the judgment step "${step.title}" of the workflow "${ctx.spec.title}". Apply ONLY these rules, extracted from the process recording and interview:\n${rules}\n\nIf the input is not covered by a rule, choose request_correction and say why in reasons. Never invent a rule.`,
        user: `Input: ${JSON.stringify(ctx.input)}\nPrior step outputs: ${JSON.stringify(ctx.values)}\nReturn {action, glCode, needsSignoff, reasons}.`,
        schema: DecisionSchema,
        maxTokens: 2000,
      });
      return {
        output,
        summary: `Judged: ${output.action}${output.glCode ? `, GL ${output.glCode}` : ""}${output.needsSignoff ? ", needs sign-off" : ""}`,
        simulated: false,
      };
    } catch (err) {
      // Fall through to the deterministic interpreter; the audit trail records it.
      console.error("LLM judgment failed, using rule interpreter:", err);
    }
  }
  const decision = evaluateDecision(ctx.spec, ctx.input);
  return {
    output: { ...decision },
    summary: `Judged by rule interpreter: ${decision.action}${decision.glCode ? `, GL ${decision.glCode}` : ""}${decision.needsSignoff ? ", needs sign-off" : ""}`,
    simulated: true,
  };
};

/** Real HTTP transport for steps configured with a URL (API or webhook rung). */
const httpConnector: Connector = async (step, ctx) => {
  const url = step.executor.config.url;
  if (typeof url !== "string" || !url) {
    throw new ConnectorError(
      `Step "${step.title}" uses the ${step.executor.kind} executor but has no url configured. Add one in review, or leave the step simulated.`,
      "not_configured",
    );
  }
  if (ctx.mode !== "live") {
    return {
      output: { wouldPost: url, payload: buildDraft(step, ctx) },
      summary: `Draft only (${ctx.mode} mode): would POST to ${url}`,
      simulated: true,
    };
  }
  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: step.id, input: ctx.input, draft: buildDraft(step, ctx) }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new ConnectorError(
      `${aborted ? "Timed out" : "Failed"} calling ${url}: ${err instanceof Error ? err.message : String(err)}`,
      aborted ? "timeout" : "dead_system",
    );
  }
  if (!response.ok) {
    throw new ConnectorError(`Target returned ${response.status} for ${url}`, "dead_system");
  }
  return {
    output: { posted: url, status: response.status },
    summary: `Posted to ${url} (${response.status})`,
    simulated: false,
  };
};

/** Everything else: a simulated system action that produces its draft. */
const simulatedConnector: Connector = async (step, ctx) => {
  if (ctx.approvedDraft) {
    return {
      output: approvedPayload(ctx.approvedDraft),
      summary: `${step.system}: executed the approved draft`,
      simulated: true,
    };
  }
  const draft = buildDraft(step, ctx);
  return {
    output: draft,
    summary: `${step.system}: prepared ${step.title.toLowerCase()}`,
    simulated: true,
  };
};

/** Draft = the concrete thing this step would commit, built from context. */
function buildDraft(step: Step, ctx: ConnectorContext): Record<string, unknown> {
  if (ctx.approvedDraft) return approvedPayload(ctx.approvedDraft);
  const decision = Object.values(ctx.values).find((v) => "action" in v) ?? {};
  return {
    step: step.title,
    system: step.system,
    input: ctx.input,
    decision,
  };
}

export function resolveConnector(step: Step): Connector {
  if (step.executor.operation === "llm.judge" || step.classification === "llm_judgment") {
    return judgmentConnector;
  }
  if (step.executor.kind === "browser") {
    return async () => {
      throw new ConnectorError(
        `Step "${step.title}" is configured for browser automation, which is stubbed in this version. Prefer an API or webhook executor.`,
        "not_configured",
      );
    };
  }
  if (
    (step.executor.kind === "api" || step.executor.kind === "webhook") &&
    typeof step.executor.config.url === "string"
  ) {
    return httpConnector;
  }
  return simulatedConnector;
}
