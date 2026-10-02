import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/db";

/**
 * Real media handling: yt-dlp for remote recordings, ffmpeg scene-change frame
 * extraction, whisper for audio without captions. Every entry point checks tool
 * availability and fails with a clear, actionable error instead of a stack
 * trace; the caller decides whether fixture mode applies.
 */

export function toolAvailable(tool: string): boolean {
  const result = spawnSync("which", [tool], { encoding: "utf8" });
  return result.status === 0;
}

export class MediaToolMissingError extends Error {
  constructor(tool: string) {
    super(
      `${tool} is not installed. Install it (brew install ${tool} / apt install ${tool}) to process real recordings, or use a fixture:// source in demo mode.`,
    );
  }
}

export function workspaceFor(workflowId: string): string {
  const dir = path.join(dataDir(), "media", workflowId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function downloadVideo(url: string, workflowId: string): string {
  if (!toolAvailable("yt-dlp")) throw new MediaToolMissingError("yt-dlp");
  const dir = workspaceFor(workflowId);
  const out = path.join(dir, "video.mp4");
  const result = spawnSync(
    "yt-dlp",
    [
      "-f",
      "bestvideo[height<=720]+bestaudio/best[height<=720]",
      "--merge-output-format",
      "mp4",
      "-o",
      out,
      url,
    ],
    { encoding: "utf8", timeout: 10 * 60 * 1000 },
  );
  if (result.status !== 0 || !fs.existsSync(out)) {
    throw new Error(`yt-dlp failed: ${result.stderr?.slice(0, 500) || "unknown error"}`);
  }
  return out;
}

export function downloadSubtitles(url: string, workflowId: string): string | null {
  if (!toolAvailable("yt-dlp")) throw new MediaToolMissingError("yt-dlp");
  const dir = workspaceFor(workflowId);
  spawnSync(
    "yt-dlp",
    ["--write-auto-sub", "--sub-lang", "en", "--skip-download", "-o", path.join(dir, "subs"), url],
    { encoding: "utf8", timeout: 5 * 60 * 1000 },
  );
  const vtt = fs.readdirSync(dir).find((f) => f.endsWith(".vtt"));
  return vtt ? path.join(dir, vtt) : null;
}

/**
 * Scene-change extraction: one frame per screen change, not per interval.
 * The 0.1 threshold catches window/tab switches while skipping cursor motion.
 */
export function extractSceneFrames(
  videoPath: string,
  workflowId: string,
): { path: string; timestampSec: number }[] {
  if (!toolAvailable("ffmpeg")) throw new MediaToolMissingError("ffmpeg");
  const dir = path.join(workspaceFor(workflowId), "frames");
  fs.mkdirSync(dir, { recursive: true });
  const result = spawnSync(
    "ffmpeg",
    [
      "-i",
      videoPath,
      "-vf",
      "select='eq(n\\,0)+gt(scene\\,0.1)',showinfo,scale=1024:-1",
      "-vsync",
      "vfr",
      "-q:v",
      "2",
      path.join(dir, "frame_%04d.jpg"),
    ],
    { encoding: "utf8", timeout: 10 * 60 * 1000 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr?.slice(0, 500) || "unknown error"}`);
  }
  // showinfo logs pts_time for each selected frame on stderr.
  const times: number[] = [];
  for (const match of (result.stderr || "").matchAll(/pts_time:([0-9.]+)/g)) {
    times.push(parseFloat(match[1]));
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("frame_"))
    .sort();
  return files.map((f, i) => ({ path: path.join(dir, f), timestampSec: times[i] ?? i * 30 }));
}

export function extractAudio(videoPath: string, workflowId: string): string {
  if (!toolAvailable("ffmpeg")) throw new MediaToolMissingError("ffmpeg");
  const out = path.join(workspaceFor(workflowId), "audio.wav");
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-i", videoPath, "-vn", "-ar", "16000", "-ac", "1", out],
    { encoding: "utf8", timeout: 10 * 60 * 1000 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg audio extraction failed: ${result.stderr?.slice(0, 300)}`);
  }
  return out;
}

export function whisperTranscribe(
  audioPath: string,
): { startSec: number; endSec: number; text: string }[] {
  if (!toolAvailable("whisper")) throw new MediaToolMissingError("whisper");
  const outDir = path.dirname(audioPath);
  const result = spawnSync(
    "whisper",
    [audioPath, "--model", "base", "--output_format", "json", "--output_dir", outDir],
    { encoding: "utf8", timeout: 30 * 60 * 1000 },
  );
  if (result.status !== 0) {
    throw new Error(`whisper failed: ${result.stderr?.slice(0, 300)}`);
  }
  const jsonPath = path.join(outDir, `${path.basename(audioPath, ".wav")}.json`);
  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  return (parsed.segments ?? []).map((s: any) => ({
    startSec: s.start,
    endSec: s.end,
    text: String(s.text).trim(),
  }));
}
