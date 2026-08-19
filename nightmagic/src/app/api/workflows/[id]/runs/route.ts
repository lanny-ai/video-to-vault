import { NextResponse } from "next/server";
import { startRun, DeploymentGateError } from "@/lib/runtime/engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { mode?: "shadow" | "live"; input?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.mode !== "shadow" && body.mode !== "live") {
    return NextResponse.json({ error: "mode must be shadow or live." }, { status: 400 });
  }
  if (!body.input || typeof body.input !== "object") {
    return NextResponse.json({ error: "input object is required." }, { status: 400 });
  }
  try {
    const result = await startRun({
      workflowId: params.id,
      mode: body.mode,
      runInput: body.input,
    });
    return NextResponse.json({ runId: result.run.id, status: result.run.status });
  } catch (err) {
    const gate = err instanceof DeploymentGateError;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Run failed to start." },
      { status: gate ? 409 : 422 },
    );
  }
}
