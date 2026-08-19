"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EvalCaseResult } from "@/lib/db/repo";
import type { EvalSummary } from "@/lib/evals/runner";
import { Card, SectionTitle, StatusPill } from "@/components/ui";

/**
 * The test bench, styled as a report card. The pass count is the headline;
 * failure categories are chips that name what to fix; each case opens to a
 * side-by-side of expected versus actual. Readable by a VP.
 */

interface EvalRunView {
  id: string;
  createdAt: string;
  passCount: number;
  total: number;
  summary: EvalSummary;
  results: EvalCaseResult[];
}

interface Props {
  workflow: { id: string; title: string; status: string };
  cases: { id: string; name: string; source: string }[];
  evalRuns: EvalRunView[];
  gate: { ready: boolean; reason: string };
}

export function BenchClient({ workflow, cases, evalRuns, gate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const latest = evalRuns[0] ?? null;

  async function runBench() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/workflows/${workflow.id}/evals`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "The bench run failed.");
    setBusy(false);
    router.refresh();
  }

  async function importCsv(file: File) {
    setError(null);
    const response = await fetch(`/api/workflows/${workflow.id}/golden`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: await file.text(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Import failed.");
    else if (data.errors?.length) setError(`Imported ${data.added}; skipped: ${data.errors.join(" ")}`);
    router.refresh();
  }

  async function deploy() {
    setError(null);
    const response = await fetch(`/api/workflows/${workflow.id}/deploy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "shadow" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Deployment was refused.");
    router.refresh();
  }

  const shownResults = filter
    ? latest?.results.filter((r) => r.failureCategory === filter) ?? []
    : latest?.results ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-tight">Test bench</h1>
            <StatusPill status={workflow.status} />
          </div>
          <p className="mt-1 text-[15px] text-muted">
            <Link href={`/workflows/${workflow.id}`} className="text-accent hover:underline">
              {workflow.title}
            </Link>{" "}
            · {cases.length} golden case{cases.length === 1 ? "" : "s"} — every run is measured against
            hand-labeled outcomes.
          </p>
        </div>
        <button
          onClick={runBench}
          disabled={busy || cases.length === 0}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Running…" : "Run the bench"}
        </button>
      </div>

      {error && <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{error}</div>}

      {latest ? (
        <Card className="p-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[44px] font-semibold leading-none tracking-tight">
                {latest.passCount}
                <span className="text-muted">/{latest.total}</span>
              </p>
              <p className="mt-2 text-[15px] text-muted">
                cases handled correctly · {new Date(latest.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${gate.ready ? "text-pass" : "text-muted"}`}>
                {gate.ready ? "Deployment gate: open" : "Deployment gate: closed"}
              </p>
              <p className="mt-0.5 max-w-xs text-sm text-muted">{gate.reason}</p>
              {gate.ready && workflow.status === "evals" && (
                <button
                  onClick={deploy}
                  className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Deploy to shadow
                </button>
              )}
            </div>
          </div>

          {latest.summary.categories.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {latest.summary.categories.map((category) => (
                <button
                  key={category.category}
                  onClick={() => setFilter(filter === category.category ? null : category.category)}
                  className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                    filter === category.category
                      ? "bg-fail text-white"
                      : "bg-fail-soft text-fail hover:opacity-80"
                  }`}
                >
                  {category.label} · {category.count}
                </button>
              ))}
              {filter && (
                <button onClick={() => setFilter(null)} className="px-2 text-[13px] text-muted hover:text-ink">
                  Show all
                </button>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card className="px-8 py-10 text-center">
          <p className="text-[15px] font-medium">No bench run yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {cases.length === 0
              ? "Import historical examples first — the CSV needs input_* and expected_* columns."
              : "Run the bench to measure the workflow against every golden case."}
          </p>
        </Card>
      )}

      {latest && (
        <section className="space-y-3">
          <SectionTitle>{filter ? "Cases in this category" : "All cases"}</SectionTitle>
          <Card>
            {shownResults.map((result, i) => {
              const open = openCase === result.caseId;
              return (
                <div key={result.caseId} className={i > 0 ? "border-t border-hairline" : ""}>
                  <button
                    onClick={() => setOpenCase(open ? null : result.caseId)}
                    className="flex w-full items-center gap-3 px-6 py-3.5 text-left"
                  >
                    <span
                      className={`h-2 w-2 flex-none rounded-full ${result.pass ? "bg-pass" : "bg-fail"}`}
                    />
                    <span className="flex-1 truncate text-[15px] text-ink">{result.caseName}</span>
                    {result.failureCategory && (
                      <span className="rounded-full bg-fail-soft px-2 py-0.5 text-[11px] font-medium text-fail">
                        {latest.summary.categories.find((c) => c.category === result.failureCategory)
                          ?.label ?? result.failureCategory}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="border-t border-hairline bg-raised px-6 py-4 text-sm">
                      <p className="text-muted">{result.notes || "Handled exactly as expected."}</p>
                      {!result.pass && (
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-[13px] font-medium text-ink">What the agent produced</p>
                            <pre className="mt-1 overflow-x-auto rounded-lg bg-canvas p-3 text-xs text-muted">
                              {JSON.stringify(
                                { action: result.actual.action, glCode: result.actual.glCode, needsSignoff: result.actual.needsSignoff },
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-ink">Safety checks</p>
                            <ul className="mt-1 space-y-1 text-xs text-muted">
                              <li>Right data: {result.stepChecks.rightData ? "yes" : "no"}</li>
                              <li>Required steps: {result.stepChecks.requiredSteps ? "yes" : "no"}</li>
                              <li>Matches an expert: {result.stepChecks.matchesExpert ? "yes" : "no"}</li>
                              <li>Safe to act on: {result.stepChecks.safeToAct ? "yes" : "no — routes to a person"}</li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>Golden dataset</SectionTitle>
        <Card className="px-6 py-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {cases.filter((c) => c.source === "historical").length} historical ·{" "}
              {cases.filter((c) => c.source === "interview").length} from the interview ·{" "}
              {cases.filter((c) => c.source === "correction").length} from corrections
            </p>
            <label className="cursor-pointer text-sm font-medium text-accent hover:underline">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCsv(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {evalRuns.length > 1 && (
            <div className="mt-4 border-t border-hairline pt-4">
              <p className="text-[13px] font-medium text-ink">History</p>
              <div className="mt-2 space-y-1">
                {evalRuns.map((run) => (
                  <p key={run.id} className="text-sm tabular-nums text-muted">
                    {new Date(run.createdAt).toLocaleString()} — {run.passCount}/{run.total}
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
