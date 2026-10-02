import { NextResponse } from "next/server";
import { getProgress, isValidProgressId } from "@/lib/pipeline/progress";

export const dynamic = "force-dynamic";

/** Live capture progress: the capture page polls this while processing. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isValidProgressId(id)) {
    return NextResponse.json({ error: "Invalid progress id." }, { status: 400 });
  }
  const progress = getProgress(id);
  if (!progress) return NextResponse.json({ stage: null });
  return NextResponse.json(progress);
}
