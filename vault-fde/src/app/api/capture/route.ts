import { NextResponse } from "next/server";
import { captureRecording, buildOperatingMap, CaptureError } from "@/lib/pipeline";
import { isValidProgressId, reportProgress } from "@/lib/pipeline/progress";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { source?: string; progressId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const source = body.source?.trim();
  if (!source) {
    return NextResponse.json(
      { error: "Provide a recording link, an upload, or fixture://name." },
      { status: 400 },
    );
  }
  const progressId =
    body.progressId && isValidProgressId(body.progressId) ? body.progressId : undefined;

  try {
    reportProgress(progressId, "starting", "Opening the recording…");
    const workflow = await captureRecording({ source, progressId });
    const mapped = await buildOperatingMap(workflow.id, progressId);
    reportProgress(progressId, "done", "Map ready");
    return NextResponse.json({ workflowId: mapped.id, status: mapped.status });
  } catch (err) {
    if (err instanceof CaptureError) {
      reportProgress(progressId, "error", err.message);
      // Guided failure: the UI renders the hint with a recovery path.
      return NextResponse.json(
        { error: err.message, code: err.code, hint: err.hint },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Capture failed.";
    reportProgress(progressId, "error", message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
