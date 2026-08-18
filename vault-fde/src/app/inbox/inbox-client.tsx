"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, EmptyState } from "@/components/ui";

/**
 * The approval inbox: one draft at a time, like reading mail. Approve is one
 * tap. An edit quietly becomes a golden dataset case. Rejections stop the run.
 */

interface Item {
  id: string;
  workflowId: string;
  workflowTitle: string;
  stepTitle: string;
  approvals: number;
  reasoning: string;
  draft: Record<string, unknown>;
  createdAt: string;
  runId: string;
}

export function InboxClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);

  const remaining = items.slice(index);
  const current = remaining[0];

  if (!current) {
    return (
      <EmptyState
        title={resolvedCount > 0 ? "Inbox zero" : "Nothing waiting"}
        detail={
          resolvedCount > 0
            ? `${resolvedCount} draft${resolvedCount === 1 ? "" : "s"} handled. Every decision just made the workflow more trustworthy.`
            : "Drafts appear here when a workflow reaches an approval gate or needs a human decision."
        }
      />
    );
  }

  async function resolve(status: "approved" | "edited" | "rejected") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const editedDraft =
        status === "edited" ? { ...current.draft, correction: editText.trim() } : undefined;
      const response = await fetch(`/api/approvals/${current.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, editedDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "That did not save.");
      setResolvedCount((n) => n + 1);
      setIndex((i) => i + 1);
      setEditing(false);
      setEditText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">Inbox</h1>
        <span className="text-sm tabular-nums text-muted">
          {remaining.length} waiting
        </span>
      </div>

      <Card className="p-7">
        <p className="text-sm text-muted">
          <Link href={`/workflows/${current.workflowId}`} className="text-accent hover:underline">
            {current.workflowTitle}
          </Link>{" "}
          · <Link href={`/runs/${current.runId}`} className="hover:underline">run {current.runId.slice(-6)}</Link>
        </p>
        <h2 className="mt-1.5 text-[20px] font-semibold tracking-tight">{current.stepTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{current.reasoning}</p>

        <div className="mt-5 rounded-xl bg-canvas p-5">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">The draft</p>
          <dl className="mt-2 space-y-1.5">
            {Object.entries(flattenDraft(current.draft)).map(([key, value]) => (
              <div key={key} className="flex gap-3 text-sm">
                <dt className="w-32 flex-none text-muted">{key}</dt>
                <dd className="text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {editing && (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="What should change about this draft…"
            rows={3}
            autoFocus
            className="mt-4 w-full rounded-xl border border-hairline bg-surface p-4 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
        )}

        {error && <p className="mt-3 text-sm text-fail">{error}</p>}

        <div className="mt-6 flex gap-3">
          {!editing ? (
            <>
              <button
                onClick={() => resolve("approved")}
                disabled={busy}
                className="flex-1 rounded-full bg-accent py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Approve
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={busy}
                className="rounded-full border border-hairline px-5 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Edit
              </button>
              <button
                onClick={() => resolve("rejected")}
                disabled={busy}
                className="rounded-full border border-hairline px-5 py-2.5 text-[15px] font-medium text-fail transition-colors hover:bg-fail-soft"
              >
                Reject
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => resolve("edited")}
                disabled={busy || !editText.trim()}
                className="flex-1 rounded-full bg-accent py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Save edit and approve
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditText("");
                }}
                disabled={busy}
                className="rounded-full border border-hairline px-5 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Cancel
              </button>
            </>
          )}
        </div>
        {editing && (
          <p className="mt-3 text-sm text-muted">
            Your edit is kept as a golden case, so the workflow learns from it.
          </p>
        )}
        {current.approvals > 0 && (
          <p className="mt-4 text-sm text-faint">
            This step has {current.approvals} clean approval{current.approvals === 1 ? "" : "s"} so far.
          </p>
        )}
      </Card>
    </div>
  );
}

function flattenDraft(draft: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (value: unknown, prefix: string) => {
    if (value === null || value === undefined) return;
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, prefix ? `${prefix} ${k}` : k);
      }
    } else {
      out[prefix] = String(value);
    }
  };
  visit(draft, "");
  return out;
}
