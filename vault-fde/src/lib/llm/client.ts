import Anthropic from "@anthropic-ai/sdk";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Thin wrapper over the Anthropic SDK.
 *
 * - Cost routing: "primary" (claude-fable-5) for map generation and judgment
 *   steps; "fast" (claude-haiku-4-5) for mechanical subtasks.
 * - Structured output: the model is asked for pure JSON, the response is
 *   validated with zod, and one retry carries the validation error back.
 * - Demo mode: when no API key is present, callers check llmAvailable() and use
 *   their deterministic fallbacks. Nothing here fakes a model response.
 */

export type ModelTier = "primary" | "fast";

const MODELS: Record<ModelTier, string> = {
  primary: process.env.VAULT_FDE_MODEL_PRIMARY || "claude-fable-5",
  fast: process.env.VAULT_FDE_MODEL_FAST || "claude-haiku-4-5",
};

let cachedClient: Anthropic | null = null;

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!llmAvailable()) {
    throw new LlmUnavailableError(
      "ANTHROPIC_API_KEY is not set. The app is in demo mode; LLM-backed features use their deterministic fallbacks.",
    );
  }
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export class LlmUnavailableError extends Error {}
export class LlmRefusalError extends Error {}
export class LlmOutputError extends Error {}

export interface JsonRequest<T> {
  tier: ModelTier;
  system: string;
  user: string;
  /** Input type is unconstrained so schemas with .default() fields infer their output type. */
  schema: ZodType<T, ZodTypeDef, unknown>;
  maxTokens?: number;
}

function extractText(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") {
    throw new LlmRefusalError("The model declined this request.");
  }
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}

function parseJsonLoose(text: string): unknown {
  // Models occasionally wrap JSON in a fence despite instructions.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  return JSON.parse(candidate);
}

const JSON_INSTRUCTION =
  "Respond with a single JSON object only. No prose, no markdown fences, no commentary before or after the JSON.";

/**
 * Ask the model for a JSON object matching `schema`. Validates and retries once
 * with the validation error included so the model can self-correct.
 */
export async function llmJson<T>(req: JsonRequest<T>): Promise<T> {
  const client = getClient();
  const model = MODELS[req.tier];
  const maxTokens = req.maxTokens ?? 16000;

  const baseParams = {
    model,
    max_tokens: maxTokens,
    system: `${req.system}\n\n${JSON_INSTRUCTION}`,
  };

  const first = await client.messages.create({
    ...baseParams,
    messages: [{ role: "user" as const, content: req.user }],
  });
  const firstText = extractText(first);

  let firstError: string;
  try {
    const parsed = parseJsonLoose(firstText);
    const result = req.schema.safeParse(parsed);
    if (result.success) return result.data;
    firstError = result.error.message;
  } catch (err) {
    firstError = err instanceof Error ? err.message : String(err);
  }

  // One retry, carrying the failure back so the model can fix its output.
  const second = await client.messages.create({
    ...baseParams,
    messages: [
      { role: "user" as const, content: req.user },
      { role: "assistant" as const, content: firstText },
      {
        role: "user" as const,
        content: `Your previous response failed validation: ${firstError}\nRespond again with only the corrected JSON object.`,
      },
    ],
  });
  const secondText = extractText(second);
  try {
    const parsed = parseJsonLoose(secondText);
    const result = req.schema.safeParse(parsed);
    if (result.success) return result.data;
    throw new LlmOutputError(`Model output failed validation twice: ${result.error.message}`);
  } catch (err) {
    if (err instanceof LlmOutputError) throw err;
    throw new LlmOutputError(
      `Model output was not valid JSON after retry: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Plain-text completion for tasks where structure is not required. */
export async function llmText(req: Omit<JsonRequest<string>, "schema">): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODELS[req.tier],
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  });
  return extractText(response);
}

/**
 * Vision: the actual image bytes go to the model. Never describe an image the
 * model has not seen.
 */
export async function llmImageText(req: {
  tier: ModelTier;
  system: string;
  user: string;
  imagePath: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getClient();
  const fs = await import("node:fs");
  const path = await import("node:path");
  const data = fs.readFileSync(req.imagePath).toString("base64");
  const ext = path.extname(req.imagePath).toLowerCase();
  const mediaType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
  const response = await client.messages.create({
    model: MODELS[req.tier],
    max_tokens: req.maxTokens ?? 1000,
    system: req.system,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: req.user },
        ],
      },
    ],
  });
  return extractText(response);
}
