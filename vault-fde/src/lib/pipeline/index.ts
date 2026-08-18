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
  MediaToolMissingError,
} from "./media";
import { parseVtt } from "./vtt";
import { generateMap, EmptyTranscriptError } from "./mapgen";
import { loadFixture } from "./fixture";
import { downloadDriveFile } from "./drive";
import {
  CaptureError,
  classifyDownloadFailure,
  detectSourceKind,
  isVideoFilename,
  resolveUploadRef,
} from "./sources";
import { llmAvailable, llmImageText } from "@/lib/llm/client";

export { detectSourceKind, CaptureError } from "./sources";

/**
 * The Audit phase orchestrator: capture in, operating map out.
 * Every stage fails with a specific, guided error (see sources.ts); a workflow
 * is never left in a lying state (status only advances after the artifact
 * exists).
 */

export interface CaptureRequest {
  source: string; // URL, upload:// ref, local path, or fixture://name
}

/** Normalize any ingest failure into a guided CaptureError. */
function toCaptureError(err: unknown): CaptureError {
  if (err instanceof CaptureError) return err;
  if (err instanceof MediaToolMissingError) {
    return new CaptureError(
      "tool_missing",
      err.message,
      "Once it is installed, drop the file again and processing picks up from there.",
    );
  }
  return new CaptureError(
    "empty_video",
    err instanceof Error ? err.message : String(err),
    "If this recording plays fine locally, re-export it as mp4 and drop it again.",
  );
}

export async function captureRecording(req: CaptureRequest): Promise<WorkflowRow> {
  const kind = detectSourceKind(req.source);

  if (kind === "fixture") {
    return loadFixture(req.source.replace("fixture://", ""));
  }

  if (kind === "upload") {
    const filePath = req.source.startsWith("upload://")
      ? resolveUploadRef(req.source)
      : req.source;
    if (!fs.existsSync(filePath)) {
      throw new CaptureError(
        "upload_missing",
        `No file found at ${filePath}.`,
        "Drop the video file on the capture page instead of typing a path.",
      );
    }
    if (!isVideoFilename(filePath)) {
      throw new CaptureError(
        "upload_bad_type",
        `${filePath} does not look like a video file.`,
        "Supported formats: mp4, mov, webm, mkv, m4v, avi.",
      );
    }
    const workflow = createWorkflow({
      title: "Uploaded recording",
      sourceKind: "upload",
      sourceRef: req.source,
    });
    try {
      await ingestVideo(workflow.id, filePath, null);
    } catch (err) {
      setWorkflowStatus(workflow.id, "archived");
      throw toCaptureError(err);
    }
    return getWorkflow(workflow.id)!;
  }

  if (kind === "drive") {
    const workflow = createWorkflow({
      title: "Drive recording",
      sourceKind: "drive",
      sourceRef: req.source,
    });
    try {
      const videoPath = await downloadDriveFile(req.source, workflow.id);
      await ingestVideo(workflow.id, videoPath, null);
    } catch (err) {
      setWorkflowStatus(workflow.id, "archived");
      throw toCaptureError(err);
    }
    return getWorkflow(workflow.id)!;
  }

  // Remote recording (Loom / YouTube): yt-dlp is best-effort by nature, so its
  // failures get classified into guided recovery instead of surfacing stderr.
  const workflow = createWorkflow({
    title: "Remote recording",
    sourceKind: kind,
    sourceRef: req.source,
  });
  let videoPath: string;
  let subsPath: string | null;
  try {
    videoPath = downloadVideo(req.source, workflow.id);
    subsPath = downloadSubtitles(req.source, workflow.id);
  } catch (err) {
    setWorkflowStatus(workflow.id, "archived");
    if (err instanceof MediaToolMissingError) {
      throw new CaptureError(
        "tool_missing",
        err.message,
        "Or skip the link: download the video yourself and drop the file here.",
      );
    }
    throw classifyDownloadFailure(
      kind === "loom" ? "loom" : "youtube",
      err instanceof Error ? err.message : String(err),
    );
  }
  try {
    await ingestVideo(workflow.id, videoPath, subsPath);
  } catch (err) {
    setWorkflowStatus(workflow.id, "archived");
    throw toCaptureError(err);
  }
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
    // The actual frame image goes to the model (fast tier: mechanical subtask).
    // A description is only ever produced from pixels the model has seen.
    return await llmImageText({
      tier: "fast",
      system:
        "You are reading one frame of a screen recording for a workflow audit. Name the application, what is on screen, and transcribe any figures, IDs, amounts, or field values exactly as shown. Two sentences. If the frame is unreadable, say so.",
      user: "Describe this frame.",
      imagePath,
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
