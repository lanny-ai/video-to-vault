import path from "node:path";
import { dataDir } from "@/lib/db";
import type { WorkflowRow } from "@/lib/db/repo";

/**
 * Source classification and the capture error taxonomy.
 *
 * Capture failures are the first wall every new user hits, so they never
 * surface as raw tool output. Every failure carries a code the UI maps to a
 * guided recovery (usually: download the file yourself and drop it here).
 */

export type CaptureErrorCode =
  | "loom_fetch_failed"
  | "youtube_fetch_failed"
  | "drive_not_public"
  | "drive_fetch_failed"
  | "drive_bad_link"
  | "upload_missing"
  | "upload_bad_type"
  | "tool_missing"
  | "empty_video"
  | "unsupported_source";

export class CaptureError extends Error {
  code: CaptureErrorCode;
  hint: string;

  constructor(code: CaptureErrorCode, message: string, hint: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"];

export function isVideoFilename(name: string): boolean {
  return VIDEO_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

export function uploadsDir(): string {
  return path.join(dataDir(), "uploads");
}

/** Resolve an upload:// ref to its path under the uploads dir, refusing traversal. */
export function resolveUploadRef(ref: string): string {
  const name = ref.replace("upload://", "");
  const base = path.basename(name);
  if (base !== name || !name) {
    throw new CaptureError(
      "upload_missing",
      "That upload reference is not valid.",
      "Upload the file again from the capture page.",
    );
  }
  return path.join(uploadsDir(), base);
}

export function detectSourceKind(source: string): WorkflowRow["sourceKind"] {
  if (source.startsWith("fixture://")) return "fixture";
  if (source.startsWith("upload://")) return "upload";
  if (/drive\.google\.com|docs\.google\.com/i.test(source)) return "drive";
  if (/loom\.com/i.test(source)) return "loom";
  if (/youtube\.com|youtu\.be/i.test(source)) return "youtube";
  if (/^https?:\/\//i.test(source)) return "loom"; // unknown URL: try the downloader path
  return "upload"; // local file path
}

/** Pull the file id out of any Google Drive URL shape. */
export function driveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([\w-]{10,})/, // drive.google.com/file/d/<id>/view
    /[?&]id=([\w-]{10,})/, // open?id=<id> and uc?id=<id>
    /\/d\/([\w-]{10,})/, // docs.google.com/.../d/<id>
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** Map a raw yt-dlp failure to a guided capture error. */
export function classifyDownloadFailure(
  kind: "loom" | "youtube",
  stderr: string,
): CaptureError {
  const text = stderr.toLowerCase();
  const isPrivate =
    text.includes("private") ||
    text.includes("sign in") ||
    text.includes("login") ||
    text.includes("failed to parse json") ||
    text.includes("empty");
  if (kind === "loom") {
    return new CaptureError(
      "loom_fetch_failed",
      isPrivate
        ? "Loom would not let us fetch this video. It is probably private or workspace-restricted."
        : "Loom fetch failed. Loom changes their site often and link fetching is best-effort.",
      "Open the video in Loom, click Download, then drop the file here. That works for every Loom you own, private or not.",
    );
  }
  return new CaptureError(
    "youtube_fetch_failed",
    isPrivate
      ? "YouTube would not let us fetch this video. It may be private or age-restricted."
      : "YouTube fetch failed.",
    "If you have the file, drop it here instead. Otherwise check that the video is public and try again.",
  );
}
