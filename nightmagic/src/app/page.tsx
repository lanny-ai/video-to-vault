import Link from "next/link";
import {
  listWorkflows,
  latestEvalRun,
  listRuns,
  listGoldenCases,
} from "@/lib/db/repo";
import { groundedConfidence } from "@/lib/spec/schema";
import { Card, EmptyState, Stat, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const workflows = listWorkflows();

  if (workflows.length === 0) {
    return (
      <EmptyState
        title="No workflows yet"
        detail="Capture a recording of a process to get its operating map. Run npm run db:seed for a complete demo workflow."
      />
    );
  }

  const totalRuns = workflows.reduce((n, w) => n + listRuns(w.id).length, 0);
  const deployed = workflows.filter((w) => w.status === "shadow" || w.status === "live").length;
  const totalCases = workflows.reduce((n, w) => n + listGoldenCases(w.id).length, 0);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-[15px] text-muted">
          Each one earns its next stage: map, interview, bench, shadow, live.
        </p>
      </div>

      <div className="flex gap-12">
        <Stat value={String(workflows.length)} label="Workflows" />
        <Stat value={String(deployed)} label="Deployed" />
        <Stat value={String(totalRuns)} label="Runs" />
        <Stat value={String(totalCases)} label="Golden cases" />
      </div>

      <div className="space-y-3">
        {workflows.map((workflow) => {
          const confidence = workflow.spec ? groundedConfidence(workflow.spec) : null;
          const evalRun = latestEvalRun(workflow.id);
          const runs = listRuns(workflow.id);
          return (
            <Link key={workflow.id} href={`/workflows/${workflow.id}`} className="block">
              <Card className="px-6 py-5 transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="truncate text-[17px] font-medium text-ink">
                        {workflow.title}
                      </span>
                      <StatusPill status={workflow.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {[
                        confidence
                          ? `${Math.round(confidence.ratio * 100)}% grounded${confidence.open > 0 ? `, ${confidence.open} open` : ""}`
                          : "Not mapped yet",
                        evalRun
                          ? `bench ${evalRun.passCount}/${evalRun.total}`
                          : null,
                        runs.length > 0 ? `${runs.length} run${runs.length === 1 ? "" : "s"}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="text-faint">›</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
