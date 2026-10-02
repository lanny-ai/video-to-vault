/**
 * Live capture progress: the pipeline reports where it actually is, the UI
 * polls it. Real stages and real counts only; the ambient ticker supplies the
 * personality, this supplies the truth.
 *
 * In-memory registry: correct for the single-process deployment this app
 * targets (see DECISIONS.md). Entries expire so abandoned captures never leak.
 */

export type CaptureStage =
  | "starting"
  | "fetching"
  | "frames"
  | "transcribing"
  | "reading"
  | "mapping"
  | "done"
  | "error";

export interface CaptureProgress {
  stage: CaptureStage;
  /** Human-readable line, e.g. "Reading screen 6 of 45". */
  detail: string;
  current?: number;
  total?: number;
  updatedAt: number;
}

const TTL_MS = 15 * 60 * 1000;

const registry = new Map<string, CaptureProgress>();

function sweep(): void {
  const now = Date.now();
  for (const [id, entry] of registry) {
    if (now - entry.updatedAt > TTL_MS) registry.delete(id);
  }
}

const VALID_ID = /^[\w-]{8,64}$/;

export function isValidProgressId(id: string): boolean {
  return VALID_ID.test(id);
}

export function reportProgress(
  id: string | undefined,
  stage: CaptureStage,
  detail: string,
  counts?: { current?: number; total?: number },
): void {
  if (!id || !isValidProgressId(id)) return;
  sweep();
  registry.set(id, {
    stage,
    detail,
    current: counts?.current,
    total: counts?.total,
    updatedAt: Date.now(),
  });
}

export function getProgress(id: string): CaptureProgress | null {
  sweep();
  return registry.get(id) ?? null;
}

export function clearProgressForTests(): void {
  registry.clear();
}
