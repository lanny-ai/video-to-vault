import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CaptureError, driveFileId } from "./sources";
import { workspaceFor } from "./media";

/**
 * Google Drive ingestion without OAuth: works for files shared as
 * "anyone with the link". Handles the large-file virus-scan interstitial by
 * re-submitting Drive's confirm form. Anything requiring sign-in gets a guided
 * error, not a scrape attempt.
 */

const DOWNLOAD_URL = "https://drive.google.com/uc";
const CONFIRM_URL = "https://drive.usercontent.google.com/download";

function looksLikeHtml(contentType: string | null): boolean {
  return Boolean(contentType && contentType.includes("text/html"));
}

function notPublicError(): CaptureError {
  return new CaptureError(
    "drive_not_public",
    "Google Drive would not hand over this file. It is not shared publicly.",
    'In Drive, right-click the file, choose Share, and set General access to "Anyone with the link". Or skip Drive entirely: download the file and drop it here.',
  );
}

/** Parse the hidden inputs on Drive's virus-scan confirm page. */
export function parseConfirmForm(html: string): Record<string, string> | null {
  if (!html.includes(CONFIRM_URL) && !html.includes("download-form")) return null;
  const params: Record<string, string> = {};
  for (const match of html.matchAll(
    /<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g,
  )) {
    params[match[1]] = match[2];
  }
  return Object.keys(params).length > 0 ? params : null;
}

export async function downloadDriveFile(url: string, workflowId: string): Promise<string> {
  const fileId = driveFileId(url);
  if (!fileId) {
    throw new CaptureError(
      "drive_bad_link",
      "That does not look like a Google Drive file link.",
      "Use the Share link of the file itself (it contains /file/d/…), not a folder link.",
    );
  }

  const dest = path.join(workspaceFor(workflowId), "video.mp4");
  const firstUrl = `${DOWNLOAD_URL}?export=download&id=${fileId}`;

  let response: Response;
  try {
    response = await fetch(firstUrl, { redirect: "follow" });
  } catch (err) {
    throw new CaptureError(
      "drive_fetch_failed",
      `Could not reach Google Drive: ${err instanceof Error ? err.message : String(err)}`,
      "Check your connection, or download the file from Drive and drop it here.",
    );
  }

  if (!response.ok) {
    if (response.status === 403 || response.status === 404) throw notPublicError();
    throw new CaptureError(
      "drive_fetch_failed",
      `Google Drive returned ${response.status}.`,
      "Download the file from Drive and drop it here instead.",
    );
  }

  // Small public files stream directly. HTML means an interstitial:
  // either the virus-scan confirm form or a sign-in wall.
  if (looksLikeHtml(response.headers.get("content-type"))) {
    const html = await response.text();
    const form = parseConfirmForm(html);
    if (!form) throw notPublicError();
    const confirmParams = new URLSearchParams({ id: fileId, export: "download", ...form });
    try {
      response = await fetch(`${CONFIRM_URL}?${confirmParams}`, { redirect: "follow" });
    } catch (err) {
      throw new CaptureError(
        "drive_fetch_failed",
        `Drive confirm request failed: ${err instanceof Error ? err.message : String(err)}`,
        "Download the file from Drive and drop it here instead.",
      );
    }
    if (!response.ok || looksLikeHtml(response.headers.get("content-type"))) {
      throw notPublicError();
    }
  }

  if (!response.body) {
    throw new CaptureError(
      "drive_fetch_failed",
      "Google Drive sent an empty response.",
      "Download the file from Drive and drop it here instead.",
    );
  }
  await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(dest));

  const size = fs.statSync(dest).size;
  if (size < 10_000) {
    fs.rmSync(dest, { force: true });
    throw new CaptureError(
      "empty_video",
      "The file Google Drive handed over is too small to be a video.",
      "Make sure the link points at the video file itself, then try again, or drop the file here.",
    );
  }
  return dest;
}
