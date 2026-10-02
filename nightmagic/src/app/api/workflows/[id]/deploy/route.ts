import { NextResponse } from "next/server";
import { deployToShadow, promoteToLive, DeploymentGateError } from "@/lib/runtime/engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { target?: "shadow" | "live" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    if (body.target === "shadow") deployToShadow(params.id);
    else if (body.target === "live") promoteToLive(params.id);
    else return NextResponse.json({ error: "target must be shadow or live." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const gate = err instanceof DeploymentGateError;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deployment failed." },
      { status: gate ? 409 : 422 },
    );
  }
}
