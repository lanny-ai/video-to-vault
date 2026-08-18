import type { HTMLAttributes, ReactNode } from "react";

/** Small, restrained primitives. One accent; everything else is quiet. */

const STATUS_LABELS: Record<string, string> = {
  captured: "Captured",
  mapped: "Mapped",
  interviewing: "Interviewing",
  evals: "Test bench",
  shadow: "Shadow",
  live: "Live",
  no_go: "Not automated",
  archived: "Archived",
  running: "Running",
  waiting_approval: "Waiting",
  completed: "Completed",
  failed: "Failed",
  aborted: "Stopped",
};

export function StatusPill({ status }: { status: string }) {
  const accent = status === "live" || status === "shadow" || status === "completed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        accent ? "bg-accent-soft text-accent" : "bg-canvas text-muted"
      }`}
    >
      {accent && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const CLASSIFICATION_META: Record<string, { label: string }> = {
  deterministic: { label: "Deterministic" },
  llm_judgment: { label: "AI judgment" },
  human_approval: { label: "Human decision" },
};

export function ClassificationChip({ classification }: { classification: string }) {
  const meta = CLASSIFICATION_META[classification] ?? { label: classification };
  const isJudgment = classification === "llm_judgment";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        isJudgment ? "border-transparent bg-accent-soft text-accent" : "border-hairline text-muted"
      }`}
    >
      {meta.label}
    </span>
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{detail}</p>}
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[28px] font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-[13px] text-muted">{label}</div>
    </div>
  );
}

/** Timestamp like 1:24 from seconds. */
export function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
