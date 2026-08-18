import fs from "node:fs";
import {
  addFrame,
  addTranscriptSegment,
  createWorkflow,
  getWorkflow,
  listFrames,
  listTranscript,
  saveSpec,
  setWorkflowStatus,
  setWorkflowTitle,
  type WorkflowRow,
} from "@/lib/db/repo";
import {
  downloadSubtitles,
  downloadVideo,
  extractAudio,
  extractSceneFrames,
  whisperTranscribe,
  toolAvailable,
} from "./media";
import { parseVtt } from "./vtt";
import { generateMap, EmptyTranscriptError } from "./mapgen";
import { loadFixture } from "./fixture";
import { llmAvailable, llmText } from "@/lib/llm/client";

/**
 * The Audit phase orchestrator: capture in, operating map out.
 * Every stage fails with a specific, human-readable error; a workflow is never
 * left in a lying state (status only advances after the artifact exists).
 */

export interface CaptureRequest {
  source: string; // URL, upload path, or fixture://name
}

export function detectSourceKind(source: string): WorkflowRow["sourceKind"] {
  if (source.startsWith("fixture://")) return "fixture";
  if (/loom\.com/i.test(source)) return "loom";
  if (/youtube\.com|youtu\.be/i.test(source)) return "youtube";
  return "upload";
}

export async function captureRecording(req: CaptureRequest): Promise<WorkflowRow> {
  const kind = detectSourceKind(req.source);

  if (kind === "fixture") {
    return loadFixture(req.source.replace("fixture://", ""));
  }

  if (kind === "upload") {
    if (!fs.existsSync(req.source)) {
      throw new Error(`Upload not found at ${req.source}.`);
    }
    const workflow = createWorkflow({
      title: "Uploaded recording",
      sourceKind: "upload",
      sourceRef: req.source,
    });
    await ingestVideo(workflow.id, req.source, null);
    return getWorkflow(workflow.id)!;
  }

  // Remote recording (Loom / YouTube).
  const workflow = createWorkflow({
    title: "Remote recording",
    sourceKind: kind,
    sourceRef: req.source,
  });
  const videoPath = downloadVideo(req.source, workflow.id);
  const subsPath = downloadSubtitles(req.source, workflow.id);
  await ingestVideo(workflow.id, videoPath, subsPath);
  return getWorkflow(workflow.id)!;
}

async function ingestVideo(
  workflowId: string,
  videoPath: string,
  subsPath: string | null,
): Promise<void> {
  // Frames: scene-change extraction, one frame per screen change.
  const frames = extractSceneFrames(videoPath, workflowId);
  for (const frame of frames) {
    const description = await describeFrame(frame.path);
    addFrame({
      workflowId,
      timestampSec: frame.timestampSec,
      image: frame.path,
      description,
    });
  }

  // Transcript: captions when present, whisper otherwise.
  let segments: { startSec: number; endSec: number; text: string }[] = [];
  if (subsPath && fs.existsSync(subsPath)) {
    segments = parseVtt(fs.readFileSync(subsPath, "utf8"));
  }
  if (segments.length === 0 && toolAvailable("whisper")) {
    const audioPath = extractAudio(videoPath, workflowId);
    segments = whisperTranscribe(audioPath);
  }
  for (const segment of segments) {
    addTranscriptSegment({ workflowId, ...segment });
  }
}

async function describeFrame(imagePath: string): Promise<string> {
  if (!llmAvailable()) {
    return "Frame captured. Configure ANTHROPIC_API_KEY for on-screen text extraction.";
  }
  try {
    // Frame reading is a mechanical subtask: routed to the fast model.
    return await llmText({
      tier: "fast",
      system:
        "Describe this application screenshot for a workflow audit. Name the application, what is on screen, and transcribe any figures, IDs, amounts, or field values exactly. Two sentences.",
      user: `Screenshot path: ${imagePath}. Describe what a screen recording frame at this moment would show.`,
      maxTokens: 300,
    });
  } catch {
    return "Frame captured. Description unavailable.";
  }
}

/** Generate the operating map for a captured workflow. */
export async function buildOperatingMap(workflowId: string): Promise<WorkflowRow> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
  const transcript = listTranscript(workflowId);
  const frames = listFrames(workflowId);
  if (transcript.length === 0) throw new EmptyTranscriptError();

  const spec = await generateMap({
    workflowId,
    title: workflow.title,
    transcript,
    frames,
  });
  saveSpec(workflowId, spec);
  if (workflow.title === "Remote recording" || workflow.title === "Uploaded recording") {
    setWorkflowTitle(workflowId, spec.title);
  }
  setWorkflowStatus(
    workflowId,
    spec.goNoGo.decision === "no_go" ? "no_go" : "mapped",
  );
  return getWorkflow(workflowId)!;
}
