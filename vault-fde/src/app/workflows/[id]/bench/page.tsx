import { notFound } from "next/navigation";
import { getWorkflow, listEvalRuns, listGoldenCases } from "@/lib/db/repo";
import { summarizeEvalRun } from "@/lib/evals/runner";
import { deploymentGate } from "@/lib/runtime/engine";
import { BenchClient } from "./bench-client";

export const dynamic = "force-dynamic";

export default function BenchPage({ params }: { params: { id: string } }) {
  const workflow = getWorkflow(params.id);
  if (!workflow) notFound();

  const cases = listGoldenCases(params.id);
  const evalRuns = listEvalRuns(params.id);
  const gate = deploymentGate(params.id);

  return (
    <BenchClient
      workflow={{ id: workflow.id, title: workflow.spec?.title ?? workflow.title, status: workflow.status }}
      cases={cases.map((c) => ({ id: c.id, name: c.name, source: c.source }))}
      evalRuns={evalRuns.map((run) => ({
        id: run.id,
        createdAt: run.createdAt,
        passCount: run.passCount,
        total: run.total,
        summary: summarizeEvalRun(run),
        results: run.results,
      }))}
      gate={gate}
    />
  );
}
