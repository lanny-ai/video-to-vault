import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  pickRecorderMime,
  RECORDER_MIMES,
  recordingExtension,
  recordingFilename,
} from "@/lib/recorder";

describe("recorder mime selection", () => {
  it("prefers vp9 webm when everything is supported", () => {
    expect(pickRecorderMime(() => true)).toBe("video/webm;codecs=vp9,opus");
  });

  it("falls through to mp4 for Safari-style support", () => {
    expect(pickRecorderMime((m) => m === "video/mp4")).toBe("video/mp4");
  });

  it("returns null when nothing is supported", () => {
    expect(pickRecorderMime(() => false)).toBeNull();
  });

  it("only offers mimes the upload allowlist accepts", () => {
    for (const mime of RECORDER_MIMES) {
      expect([".webm", ".mp4"]).toContain(recordingExtension(mime));
    }
  });
});

describe("recording filenames", () => {
  it("stamps the date and picks the right extension", () => {
    const date = new Date(2026, 7, 19, 9, 5, 3);
    expect(recordingFilename("video/webm;codecs=vp9,opus", date)).toBe(
      "recording-20260819-090503.webm",
    );
    expect(recordingFilename("video/mp4", date)).toBe("recording-20260819-090503.mp4");
  });
});

describe("elapsed formatting", () => {
  it("formats mm:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9_000)).toBe("0:09");
    expect(formatElapsed(61_000)).toBe("1:01");
    expect(formatElapsed(600_000)).toBe("10:00");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
