"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkflowSpec } from "@/lib/spec/schema";
import type { TriageFinding } from "@/lib/spec/triage";
import type { EvalSummary } from "@/lib/evals/runner";
import { Card, ClassificationChip, SectionTitle, StatusPill, formatTimestamp } from "@/components/ui";

/**
 * The synced review screen. Calm by default: the step list in plain language.
 * Click a step and the evidence slides in: the frame at that moment, the
 * transcript snippet, the rules, the failure modes. Depth on demand.
 */

interface FrameData {
  id: string;
  timestampSec: number;
  image: string;
  description: string;
}

interface Props {
  workflow: { id: string; title: string; status: string };
  spec: WorkflowSpec;
  frames: FrameData[];
  confidence: { ratio: number; open: number; resolved: number };
  lint: TriageFinding[];
  gate: { ready: boolean; reason: string };
  graduates: string[];
  evalSummary: EvalSummary | null;
  goldenCount: number;
  runCount: number;
  runs: { id: string; mode: string; status: string; createdAt: string }[];
}

function Frame({ frame }: { frame: FrameData }) {
  if (frame.image.trim().startsWith("<svg")) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-hairline"
        dangerouslySetInnerHTML={{ __html: frame.image }}
      />
    );
  }
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4 text-sm text-muted">
      {frame.description}
    </div>
  );
}

export function ReviewClient(props: Props) {
  const router = useRouter();
  const { workflow, spec, frames, confidence, lint, gate, graduates, evalSummary } = props;
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showObserved, setShowObserved] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const frameById = new Map(frames.map((f) => [f.id, f]));
  const openRedactions = spec.redactionFlags.filter((f) => !f.resolved);
  const steps = [...spec.steps].sort((a, b) => a.index - b.index);

  async function post(url: string, body: unknown): Promise<boolean> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setBanner(data.error ?? "That did not work.");
      return false;
    }
    setBanner(null);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-tight">{workflow.title}</h1>
            <StatusPill status={workflow.status} />
          </div>
          <p className="mt-1 max-w-2xl text-[15px] text-muted">{spec.summary}</p>
        </div>
      </div>

      {banner && (
        <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{banner}</div>
      )}

      {/* The one number that matters here, plus the one next action. */}
      <Card className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-5">
          <div className="relative h-12 w-12">
            <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
              <circle cx="20" cy="20" r="17" fill="none" stroke="var(--hairline)" strokeWidth="3.5" />
              <circle
                cx="20"
                cy="20"
                r="17"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${confidence.ratio * 106.8} 106.8`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">
              {Math.round(confidence.ratio * 100)}%
            </span>
          </div>
          <div>
            <p className="text-[15px] font-medium">
              {confidence.open === 0
                ? "Fully grounded. Every assumption is confirmed."
                : `${confidence.open} assumption${confidence.open === 1 ? "" : "s"} still open.`}
            </p>
            <p className="text-sm text-muted">
              {confidence.open === 0
                ? gate.ready
                  ? gate.reason
                  : gate.reason
                : "The interview closes them one question at a time."}
            </p>
          </div>
        </div>
        {confidence.open > 0 ? (
          <Link
            href={`/workflows/${workflow.id}/interview`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Continue interview
          </Link>
        ) : workflow.status === "evals" ? (
          <Link
            href={`/workflows/${workflow.id}/bench`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Open test bench
          </Link>
        ) : workflow.status === "shadow" ? (
          <button
            onClick={() => post(`/api/workflows/${workflow.id}/deploy`, { target: "live" })}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Promote to live
          </button>
        ) : null}
      </Card>

      {spec.goNoGo.decision !== "go" && (
        <Card className="px-6 py-5">
          <p className="text-[15px] font-medium">
            {spec.goNoGo.decision === "no_go" ? "Recommendation: do not automate this" : "Recommendation: automate partially"}
          </p>
          <p className="mt-1 text-sm text-muted">{spec.goNoGo.rationale}</p>
        </Card>
      )}

      {openRedactions.length > 0 && (
        <Card className="px-6 py-5">
          <p className="text-[15px] font-medium">
            {openRedactions.length} sensitive-content flag{openRedactions.length === 1 ? "" : "s"} to resolve
          </p>
          <div className="mt-3 space-y-2">
            {openRedactions.map((flag) => (
              <div key={flag.id} className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {formatTimestamp(flag.timestampSec)} — {flag.note}
                </span>
                <button
                  onClick={() =>
                    post(`/api/workflows/${workflow.id}/edit`, {
                      kind: "resolve_redaction",
                      flagId: flag.id,
                    })
                  }
                  className="text-accent hover:underline"
                >
                  Mark resolved
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>The designed workflow</SectionTitle>
          <button
            onClick={() => setShowObserved(!showObserved)}
            className="text-sm text-muted hover:text-ink"
          >
            {showObserved ? "Hide the recording view" : "Show as recorded"}
          </button>
        </div>

        {spec.trigger.intakeVariants.length > 0 && (
          <p className="text-sm text-muted">
            Arrives as: {spec.trigger.intakeVariants.map((v) => v.description.toLowerCase()).join(" · ")}
          </p>
        )}

        <Card>
          {steps.map((step, i) => {
            const open = openStep === step.id;
            const evidence = step.evidence[0];
            const frame = evidence?.frameId ? frameById.get(evidence.frameId) : undefined;
            const finding = lint.find((l) => l.stepId === step.id && l.kind !== "missing_failure_modes");
            const canGraduate = graduates.includes(step.id);
            return (
              <div key={step.id} className={i > 0 ? "border-t border-hairline" : ""}>
                <button
                  onClick={() => setOpenStep(open ? null : step.id)}
                  className="flex w-full items-center gap-4 px-6 py-4 text-left"
                >
                  <span className="w-5 text-sm tabular-nums text-faint">{step.index + 1}</span>
                  <span className="flex-1 text-[15px] font-medium text-ink">{step.title}</span>
                  {canGraduate && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      Ready to graduate
                    </span>
                  )}
                  <ClassificationChip classification={step.classification} />
                  {evidence && (
                    <span className="text-xs tabular-nums text-faint">
                      {formatTimestamp(evidence.timestampSec)}
                    </span>
                  )}
                </button>

                {open && (
                  <div className="space-y-4 border-t border-hairline bg-raised px-6 py-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-3">
                        <p className="text-sm text-ink">{step.goal}.</p>
                        {step.changeNote && (
                          <p className="text-sm text-muted">Change from the recording: {step.changeNote}</p>
                        )}
                        {evidence?.transcriptSnippet && (
                          <blockquote className="border-l-2 border-hairline pl-3 text-sm italic text-muted">
                            “{evidence.transcriptSnippet}” — {formatTimestamp(evidence.timestampSec)}
                          </blockquote>
                        )}
                        {step.decisionRules.length > 0 && (
                          <div>
                            <p className="text-[13px] font-medium text-ink">Rules</p>
                            <ul className="mt-1.5 space-y-1">
                              {step.decisionRules.map((rule) => (
                                <li key={rule.id} className="text-sm text-muted">
                                  When {rule.condition} → {rule.action}
                                  <span className="ml-1.5 text-xs text-faint">({rule.source})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div>
                          <p className="text-[13px] font-medium text-ink">If it goes wrong</p>
                          <ul className="mt-1.5 space-y-1">
                            {step.failureModes.map((fm) => (
                              <li key={fm.id} className="text-sm text-muted">
                                {fm.description} → {fm.handling.replace(/_/g, " ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {finding && <p className="text-sm text-warn">{finding.message}</p>}
                        {canGraduate && (
                          <button
                            onClick={() =>
                              post(`/api/workflows/${workflow.id}/trust`, {
                                stepId: step.id,
                                trustLevel: "auto",
                              })
                            }
                            className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                          >
                            Put this step on auto
                          </button>
                        )}
                        {step.trustLevel === "auto" && (
                          <p className="text-sm text-muted">
                            Runs without a gate.{" "}
                            <button
                              onClick={() =>
                                post(`/api/workflows/${workflow.id}/trust`, {
                                  stepId: step.id,
                                  trustLevel: "approve_each",
                                })
                              }
                              className="text-accent hover:underline"
                            >
                              Bring the gate back
                            </button>
                          </p>
                        )}
                      </div>
                      <div>{frame && <Frame frame={frame} />}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      {showObserved && (
        <section className="space-y-3">
          <SectionTitle>As recorded</SectionTitle>
          <Card className="px-6 py-2">
            {spec.observed.map((observed, i) => (
              <div
                key={observed.id}
                className={`flex gap-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                <span className="w-5 text-sm tabular-nums text-faint">{observed.index + 1}</span>
                <div>
                  <p className="text-sm text-ink">{observed.observedAction}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {observed.system} · {formatTimestamp(observed.evidence[0]?.timestampSec ?? 0)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>Evidence and value</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="px-6 py-5">
            <p className="text-sm text-muted">Test bench</p>
            <p className="mt-1 text-[22px] font-semibold tracking-tight">
              {evalSummary ? `${evalSummary.passCount}/${evalSummary.total}` : "—"}
            </p>
            <Link href={`/workflows/${workflow.id}/bench`} className="mt-1 inline-block text-sm text-accent hover:underline">
              {props.goldenCount} golden cases →
            </Link>
          </Card>
          <Card className="px-6 py-5">
            <p className="text-sm text-muted">Runs</p>
            <p className="mt-1 text-[22px] font-semibold tracking-tight">{props.runCount}</p>
            {props.runs[0] ? (
              <Link href={`/runs/${props.runs[0].id}`} className="mt-1 inline-block text-sm text-accent hover:underline">
                Latest run →
              </Link>
            ) : (
              <p className="mt-1 text-sm text-faint">None yet</p>
            )}
          </Card>
          <Card className="px-6 py-5">
            <p className="text-sm text-muted">Sprint report</p>
            <p className="mt-1 text-[22px] font-semibold tracking-tight capitalize">
              {spec.goNoGo.decision.replace("_", "-")}
            </p>
            <Link href={`/workflows/${workflow.id}/report`} className="mt-1 inline-block text-sm text-accent hover:underline">
              View and export →
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}
