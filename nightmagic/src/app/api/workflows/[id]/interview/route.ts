import { NextResponse } from "next/server";
import { getWorkflow } from "@/lib/db/repo";
import { answerQuestion, nextQuestion, startInterview } from "@/lib/interview/engine";
import { groundedConfidence } from "@/lib/spec/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const workflow = getWorkflow(params.id);
  if (!workflow?.spec) {
    return NextResponse.json({ error: "Workflow or operating map not found." }, { status: 404 });
  }
  startInterview(params.id);
  const question = nextQuestion(workflow.spec);
  return NextResponse.json({
    question,
    confidence: groundedConfidence(workflow.spec),
    workflowTitle: workflow.spec.title,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: {
    assumptionId?: string;
    action?: "confirm" | "correct";
    correction?: string;
    examples?: { name: string; input: Record<string, unknown>; expected: Record<string, unknown> }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.assumptionId || !body.action) {
    return NextResponse.json({ error: "assumptionId and action are required." }, { status: 400 });
  }
  try {
    const result = answerQuestion({
      workflowId: params.id,
      assumptionId: body.assumptionId,
      action: body.action,
      correction: body.correction,
      examples: body.examples,
    });
    return NextResponse.json({
      confidence: result.confidence,
      interviewComplete: result.interviewComplete,
      examplesAdded: result.examplesAdded,
      question: nextQuestion(result.spec),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Answer failed." },
      { status: 422 },
    );
  }
}
