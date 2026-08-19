import { NextResponse } from "next/server";
import { runEvals, summarizeEvalRun } from "@/lib/evals/runner";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const run = await runEvals(params.id);
    return NextResponse.json({ run, summary: summarizeEvalRun(run) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eval run failed." },
      { status: 422 },
    );
  }
}
