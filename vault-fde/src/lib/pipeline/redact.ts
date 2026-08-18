import type { RedactionFlag } from "@/lib/spec/schema";
import type { FrameRow, TranscriptSegment } from "@/lib/db/repo";

/**
 * Redaction pass: flag PII and credentials visible in the recording before
 * anything is stored long-term or shared. Flags are surfaced in review; the
 * operator resolves them (blur the frame, trim the clip) before exporting.
 */

const PATTERNS: { kind: RedactionFlag["kind"]; pattern: RegExp; note: string }[] = [
  {
    kind: "credential",
    pattern: /\b(password|passwd|api[ _-]?key|secret|token|bearer)\b/i,
    note: "Possible credential visible or spoken",
  },
  {
    kind: "pii",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    note: "Email address visible",
  },
  {
    kind: "pii",
    pattern: /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/,
    note: "Possible SSN pattern",
  },
  {
    kind: "financial",
    pattern: /\b(?:\d[ -]*?){13,16}\b/,
    note: "Possible card number pattern",
  },
];

export function scanForRedactions(
  transcript: TranscriptSegment[],
  frames: FrameRow[],
): RedactionFlag[] {
  const flags: RedactionFlag[] = [];
  let n = 0;
  const scan = (text: string, timestampSec: number, frameId?: string) => {
    for (const p of PATTERNS) {
      if (p.pattern.test(text)) {
        n += 1;
        flags.push({
          id: `rf-${n}`,
          frameId,
          timestampSec,
          kind: p.kind,
          note: p.note,
          resolved: false,
        });
      }
    }
  };
  for (const segment of transcript) scan(segment.text, segment.startSec);
  for (const frame of frames) scan(frame.description, frame.timestampSec, frame.id);
  return flags;
}
