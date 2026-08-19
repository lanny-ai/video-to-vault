/**
 * Pure helpers for the in-app screen recorder. Kept free of browser globals so
 * the mime-selection and naming logic is unit-testable in node.
 */

/** Preference order: vp9/opus webm compresses best; mp4 covers Safari. */
export const RECORDER_MIMES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  for (const mime of RECORDER_MIMES) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

export function recordingExtension(mime: string): string {
  return mime.startsWith("video/mp4") ? ".mp4" : ".webm";
}

export function recordingFilename(mime: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `recording-${stamp}${recordingExtension(mime)}`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
