import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { newId } from "@/lib/db";
import { isVideoFilename, uploadsDir, VIDEO_EXTENSIONS } from "@/lib/pipeline/sources";

export const dynamic = "force-dynamic";

/** 4 GB: generous for hour-long screen recordings, still a hard stop. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Streaming upload: the raw request body goes straight to disk, so a 1 GB Loom
 * download never sits in memory. The client sends the filename in a header and
 * the bytes as the body (an XHR PUT with a File body streams natively).
 */
export async function PUT(request: Request) {
  const rawName = request.headers.get("x-file-name") ?? "";
  let fileName: string;
  try {
    fileName = decodeURIComponent(rawName);
  } catch {
    fileName = rawName;
  }
  fileName = path.basename(fileName.trim());

  if (!fileName) {
    return NextResponse.json(
      { error: "Missing file name.", code: "upload_bad_type" },
      { status: 400 },
    );
  }
  if (!isVideoFilename(fileName)) {
    return NextResponse.json(
      {
        error: `"${fileName}" is not a supported video format.`,
        code: "upload_bad_type",
        hint: `Supported formats: ${VIDEO_EXTENSIONS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "That file is over the 4 GB upload limit.",
        code: "upload_bad_type",
        hint: "Trim the recording or re-export it at 720p, then try again.",
      },
      { status: 413 },
    );
  }

  if (!request.body) {
    return NextResponse.json(
      { error: "Empty upload.", code: "upload_missing" },
      { status: 400 },
    );
  }

  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${newId("up")}${path.extname(fileName).toLowerCase()}`;
  const dest = path.join(dir, storedName);

  try {
    await pipeline(Readable.fromWeb(request.body as never), fs.createWriteStream(dest));
  } catch (err) {
    fs.rmSync(dest, { force: true });
    return NextResponse.json(
      {
        error: `Upload failed partway: ${err instanceof Error ? err.message : String(err)}`,
        code: "upload_missing",
        hint: "Check your connection and drop the file again.",
      },
      { status: 500 },
    );
  }

  const size = fs.statSync(dest).size;
  if (size === 0) {
    fs.rmSync(dest, { force: true });
    return NextResponse.json(
      { error: "The uploaded file was empty.", code: "upload_missing" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ref: `upload://${storedName}`,
    originalName: fileName,
    bytes: size,
  });
}
