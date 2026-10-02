import { NextResponse } from "next/server";
import { applySpecEdit, type SpecEdit } from "@/lib/spec/edit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: SpecEdit;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    applySpecEdit(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Edit failed." },
      { status: 422 },
    );
  }
}
