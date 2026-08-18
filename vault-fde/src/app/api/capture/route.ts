import { NextResponse } from "next/server";
import { captureRecording, buildOperatingMap } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const source = body.source?.trim();
  if (!source) {
    return NextResponse.json({ error: "Provide a recording URL or fixture://name." }, { status: 400 });
  }
  try {
    const workflow = await captureRecording({ source });
    const mapped = await buildOperatingMap(workflow.id);
    return NextResponse.json({ workflowId: mapped.id, status: mapped.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Capture failed." },
      { status: 422 },
    );
  }
}
