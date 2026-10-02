/** Minimal WebVTT parser: enough for yt-dlp auto-subs and Loom captions. */

export interface Segment {
  startSec: number;
  endSec: number;
  text: string;
}

function parseTimestamp(ts: string): number | null {
  const match = ts.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) return null;
  const [, h, m, s, ms] = match;
  return (
    (h ? parseInt(h, 10) * 3600 : 0) +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms.padEnd(3, "0"), 10) / 1000
  );
}

export function parseVtt(content: string): Segment[] {
  const segments: Segment[] = [];
  const blocks = content.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const cueIndex = lines.findIndex((l) => l.includes("-->"));
    if (cueIndex === -1) continue;
    const [rawStart, rawEnd] = lines[cueIndex].split("-->");
    const startSec = parseTimestamp(rawStart);
    const endSec = parseTimestamp((rawEnd ?? "").split(" ")[1] ?? rawEnd ?? "");
    if (startSec === null || endSec === null) continue;
    const text = lines
      .slice(cueIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    const prev = segments[segments.length - 1];
    // Auto-subs repeat lines across cues; drop exact repeats.
    if (prev && prev.text === text) {
      prev.endSec = endSec;
      continue;
    }
    segments.push({ startSec, endSec, text });
  }
  return segments;
}
