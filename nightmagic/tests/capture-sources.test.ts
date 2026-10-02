import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resetDbForTests } from "@/lib/db";
import { listWorkflows } from "@/lib/db/repo";
import { captureRecording } from "@/lib/pipeline";
import {
  CaptureError,
  classifyDownloadFailure,
  detectSourceKind,
  driveFileId,
  isVideoFilename,
  resolveUploadRef,
  uploadsDir,
} from "@/lib/pipeline/sources";
import { parseConfirmForm } from "@/lib/pipeline/drive";

/**
 * Capture is the first wall every user hits. These tests pin the source
 * routing, the Drive URL handling, and the guided-error taxonomy.
 */

beforeEach(() => {
  resetDbForTests();
});

describe("detectSourceKind", () => {
  it("routes each source shape to the right path", () => {
    expect(detectSourceKind("fixture://invoice-intake")).toBe("fixture");
    expect(detectSourceKind("upload://up_abc.mp4")).toBe("upload");
    expect(detectSourceKind("https://www.loom.com/share/d46c0c14")).toBe("loom");
    expect(detectSourceKind("https://youtu.be/zXysLUTLjw4")).toBe("youtube");
    expect(detectSourceKind("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectSourceKind("/Users/helios/Downloads/process.mov")).toBe("upload");
  });

  it("recognizes every Google Drive link shape", () => {
    expect(
      detectSourceKind("https://drive.google.com/file/d/1ScC4w4pclphO2ynZ2V2B037QZQUwiccG/view?usp=drivesdk"),
    ).toBe("drive");
    expect(detectSourceKind("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")).toBe("drive");
    expect(detectSourceKind("https://docs.google.com/file/d/1AbCdEfGhIjKlMnOp/edit")).toBe("drive");
  });

  it("sends unknown https URLs down the downloader path instead of treating them as file paths", () => {
    expect(detectSourceKind("https://example.com/video")).toBe("loom");
  });
});

describe("driveFileId", () => {
  it("extracts the id from share, open, and uc links", () => {
    expect(
      driveFileId("https://drive.google.com/file/d/1ScC4w4pclphO2ynZ2V2B037QZQUwiccG/view?usp=drivesdk"),
    ).toBe("1ScC4w4pclphO2ynZ2V2B037QZQUwiccG");
    expect(driveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUv",
    );
    expect(driveFileId("https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUv")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUv",
    );
  });

  it("returns null for folder links and junk", () => {
    expect(driveFileId("https://drive.google.com/drive/folders/xyz")).toBeNull();
    expect(driveFileId("https://drive.google.com/")).toBeNull();
  });
});

describe("classifyDownloadFailure", () => {
  it("maps the broken-Loom-extractor failure to a guided private-video error", () => {
    const err = classifyDownloadFailure(
      "loom",
      "yt-dlp failed: WARNING: [loom] abc: Failed to parse JSON: Expecting value ERROR: The downloaded file is empty",
    );
    expect(err.code).toBe("loom_fetch_failed");
    expect(err.message).toContain("private");
    expect(err.hint).toContain("Download");
  });

  it("keeps a generic but guided message for other failures", () => {
    const err = classifyDownloadFailure("youtube", "network unreachable");
    expect(err.code).toBe("youtube_fetch_failed");
    expect(err.hint.length).toBeGreaterThan(0);
  });
});

describe("upload refs", () => {
  it("resolves upload:// refs into the uploads dir", () => {
    expect(resolveUploadRef("upload://up_abc.mp4")).toBe(path.join(uploadsDir(), "up_abc.mp4"));
  });

  it("refuses path traversal in upload refs", () => {
    expect(() => resolveUploadRef("upload://../../etc/passwd")).toThrow(CaptureError);
    expect(() => resolveUploadRef("upload://")).toThrow(CaptureError);
  });

  it("validates video extensions", () => {
    expect(isVideoFilename("demo.mp4")).toBe(true);
    expect(isVideoFilename("demo.MOV")).toBe(true);
    expect(isVideoFilename("demo.pdf")).toBe(false);
    expect(isVideoFilename("demo")).toBe(false);
  });
});

describe("captureRecording guided failures", () => {
  it("fails a missing upload with the upload_missing code", async () => {
    await expect(captureRecording({ source: "upload://up_gone.mp4" })).rejects.toMatchObject({
      code: "upload_missing",
    });
  });

  it("fails a non-video upload with upload_bad_type", async () => {
    const dir = uploadsDir();
    fs.mkdirSync(dir, { recursive: true });
    const bad = path.join(dir, "up_notes.txt");
    fs.writeFileSync(bad, "not a video");
    try {
      await expect(captureRecording({ source: "upload://up_notes.txt" })).rejects.toMatchObject({
        code: "upload_bad_type",
      });
    } finally {
      fs.rmSync(bad, { force: true });
    }
  });

  it("fails a Drive folder link with drive_bad_link and archives the placeholder workflow", async () => {
    await expect(
      captureRecording({ source: "https://drive.google.com/drive/folders/abc123" }),
    ).rejects.toMatchObject({ code: "drive_bad_link" });
    const rows = listWorkflows();
    expect(rows[0].status).toBe("archived");
  });
});

describe("parseConfirmForm", () => {
  it("parses the virus-scan confirm form inputs", () => {
    const html = `
      <form id="download-form" action="https://drive.usercontent.google.com/download" method="get">
        <input type="hidden" name="id" value="1AbC">
        <input type="hidden" name="export" value="download">
        <input type="hidden" name="confirm" value="t">
        <input type="hidden" name="uuid" value="9f2a">
      </form>`;
    expect(parseConfirmForm(html)).toEqual({
      id: "1AbC",
      export: "download",
      confirm: "t",
      uuid: "9f2a",
    });
  });

  it("returns null for a sign-in wall", () => {
    expect(parseConfirmForm("<html><body>Sign in to continue</body></html>")).toBeNull();
  });
});
