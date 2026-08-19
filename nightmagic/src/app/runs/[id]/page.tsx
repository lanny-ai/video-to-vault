import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun, getWorkflow, listAuditEvents } from "@/lib/db/repo";
import { Card, StatusPill, formatTimestamp } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The run timeline: any run, readable as a story. The audit trail is a
 * feature, not a log file.
 */

const KIND_LABELS: Record<string, string> = {
  run_started: "Run started",
  step_started: "Started",
  step_completed: "Completed",
  step_failed: "Failed",
  step_skipped: "Skipped",
  approval_requested: "Waiting for approval",
  approval_resolved: "Approval decided",
  routed_to_human: "Routed to a person",
  retry: "Retried",
  run_completed: "Run completed",
  run_failed: "Run failed",
  run_aborted: "Run stopped",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  running: "Running",
  waiting_approval: "Waiting for approval",
  completed: "Completed",
  failed: "Failed",
  aborted: "Stopped",
};

export default function RunPage({ params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) notFound();
  const workflow = getWorkflow(run.workflowId);
  const events = listAuditEvents(run.id);
  const stepTitles = new Map(workflow?.spec?.steps.map((s) => [s.id, s.title]) ?? []);
  const started = new Date(run.createdAt);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="text-sm text-muted">
          <Link href={`/workflows/${run.workflowId}`} className="text-accent hover:underline">
            {workflow?.spec?.title ?? "Workflow"}
          </Link>
        </p>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">
            {run.mode === "shadow" ? "Shadow run" : "Live run"}
          </h1>
          <StatusPill status={run.status} />
        </div>
        <p className="mt-1 text-[15px] text-muted">
          {RUN_STATUS_LABELS[run.status]} · started {started.toLocaleString()}
        </p>
      </div>

      <Card className="px-7 py-2">
        {events.map((event, i) => {
          const failed = event.kind === "step_failed" || event.kind === "run_failed";
          const waiting = event.kind === "approval_requested" || event.kind === "routed_to_human";
          const elapsed = (new Date(event.ts).getTime() - started.getTime()) / 1000;
          return (
            <div key={event.id} className={`flex gap-4 py-3.5 ${i > 0 ? "border-t border-hairline" : ""}`}>
              <span
                className={`mt-1.5 h-2 w-2 flex-none rounded-full ${
                  failed ? "bg-fail" : waiting ? "bg-warn" : "bg-accent"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink">
                  <span className="font-medium">
                    {event.stepId ? stepTitles.get(event.stepId) ?? event.stepId : KIND_LABELS[event.kind]}
                  </span>
                  {event.stepId && (
                    <span className="text-muted"> — {KIND_LABELS[event.kind] ?? event.kind}</span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-sm text-muted">{event.summary}</p>
              </div>
              <span className="mt-0.5 flex-none text-xs tabular-nums text-faint">
                +{formatTimestamp(Math.max(0, elapsed))}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
