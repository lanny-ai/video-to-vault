import { NextResponse } from "next/server";
import { setStepTrustLevel } from "@/lib/runtime/engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { stepId?: string; trustLevel?: "shadow" | "approve_each" | "auto" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.stepId || !body.trustLevel) {
    return NextResponse.json({ error: "stepId and trustLevel are required." }, { status: 400 });
  }
  try {
    setStepTrustLevel(params.id, body.stepId, body.trustLevel);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trust update failed." },
      { status: 422 },
    );
  }
}
