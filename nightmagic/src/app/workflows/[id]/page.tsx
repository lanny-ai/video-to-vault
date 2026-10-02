import { notFound } from "next/navigation";
import {
  getWorkflow,
  latestEvalRun,
  listFrames,
  listGoldenCases,
  listRuns,
} from "@/lib/db/repo";
import { groundedConfidence } from "@/lib/spec/schema";
import { lintSpec } from "@/lib/spec/triage";
import { deploymentGate, graduationCandidates } from "@/lib/runtime/engine";
import { summarizeEvalRun } from "@/lib/evals/runner";
import { ReviewClient } from "./review-client";

export const dynamic = "force-dynamic";

export default function WorkflowPage({ params }: { params: { id: string } }) {
  const workflow = getWorkflow(params.id);
  if (!workflow) notFound();
  const spec = workflow.spec;
  if (!spec) {
    return (
      <p className="text-muted">
        This recording is still being processed, or mapping failed. Recapture it from the capture
        page.
      </p>
    );
  }

  const frames = listFrames(params.id);
  const evalRun = latestEvalRun(params.id);
  const runs = listRuns(params.id);

  return (
    <ReviewClient
      workflow={{ id: workflow.id, title: spec.title, status: workflow.status }}
      spec={spec}
      frames={frames.map((f) => ({ id: f.id, timestampSec: f.timestampSec, image: f.image, description: f.description }))}
      confidence={groundedConfidence(spec)}
      lint={lintSpec(spec)}
      gate={deploymentGate(params.id)}
      graduates={graduationCandidates(spec).map((s) => s.id)}
      evalSummary={evalRun ? summarizeEvalRun(evalRun) : null}
      goldenCount={listGoldenCases(params.id).length}
      runCount={runs.length}
      runs={runs.slice(0, 5).map((r) => ({ id: r.id, mode: r.mode, status: r.status, createdAt: r.createdAt }))}
    />
  );
}
