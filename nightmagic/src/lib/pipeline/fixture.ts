import fs from "node:fs";
import path from "node:path";
import {
  addFrame,
  addGoldenCase,
  addTranscriptSegment,
  createWorkflow,
  type WorkflowRow,
} from "@/lib/db/repo";

/**
 * Fixture recordings make the whole product runnable and testable without
 * ffmpeg, yt-dlp, or an API key. A fixture bundles transcript segments and
 * frame descriptions; frames render as clean SVG mock screens.
 */

export function fixturesDir(): string {
  return path.join(process.cwd(), "fixtures");
}

export function listFixtures(): string[] {
  const dir = fixturesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => fs.existsSync(path.join(dir, f, "recording.json")));
}

interface FixtureRecording {
  title: string;
  sourceRef: string;
  durationSec: number;
  transcript: { startSec: number; endSec: number; text: string }[];
  frames: { timestampSec: number; description: string }[];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 6);
}

/** A calm mock screen: window chrome, a title, wrapped description text. */
export function mockFrameSvg(timestampSec: number, description: string): string {
  const lines = wrapText(description, 52);
  const textLines = lines
    .map(
      (l, i) =>
        `<text x="36" y="${104 + i * 26}" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="15" fill="#4b4b4f">${escapeXml(l)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320">
<rect width="640" height="320" rx="12" fill="#f5f5f7"/>
<rect x="0" y="0" width="640" height="40" rx="12" fill="#e8e8ed"/>
<circle cx="24" cy="20" r="6" fill="#c9c9ce"/><circle cx="44" cy="20" r="6" fill="#c9c9ce"/><circle cx="64" cy="20" r="6" fill="#c9c9ce"/>
<text x="36" y="76" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="13" fill="#86868b">Screen at ${Math.round(timestampSec)}s</text>
${textLines}
</svg>`;
}

export function loadFixture(name: string): WorkflowRow {
  const file = path.join(fixturesDir(), name, "recording.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Fixture not found: ${name}. Available: ${listFixtures().join(", ") || "none"}`);
  }
  const recording: FixtureRecording = JSON.parse(fs.readFileSync(file, "utf8"));
  const workflow = createWorkflow({
    title: recording.title,
    sourceKind: "fixture",
    sourceRef: recording.sourceRef,
  });
  for (const segment of recording.transcript) {
    addTranscriptSegment({ workflowId: workflow.id, ...segment });
  }
  for (const frame of recording.frames) {
    addFrame({
      workflowId: workflow.id,
      timestampSec: frame.timestampSec,
      image: mockFrameSvg(frame.timestampSec, frame.description),
      description: frame.description,
    });
  }
  return workflow;
}

/** Load the fixture's bundled historical examples into the golden dataset. */
export function loadFixtureGoldenCases(name: string, workflowId: string): number {
  const file = path.join(fixturesDir(), name, "golden-cases.json");
  if (!fs.existsSync(file)) return 0;
  const cases: { name: string; input: Record<string, unknown>; expected: Record<string, unknown> }[] =
    JSON.parse(fs.readFileSync(file, "utf8"));
  for (const c of cases) {
    addGoldenCase({
      workflowId,
      name: c.name,
      input: c.input,
      expected: c.expected,
      source: "historical",
    });
  }
  return cases.length;
}
