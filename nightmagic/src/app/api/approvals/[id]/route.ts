import { NextResponse } from "next/server";
import { resolveApprovalAndContinue } from "@/lib/runtime/engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { status?: "approved" | "edited" | "rejected"; editedDraft?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.status || !["approved", "edited", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "status must be approved, edited, or rejected." }, { status: 400 });
  }
  try {
    const approval = await resolveApprovalAndContinue({
      approvalId: params.id,
      status: body.status,
      editedDraft: body.editedDraft,
    });
    return NextResponse.json({ approval });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resolution failed." },
      { status: 422 },
    );
  }
}
