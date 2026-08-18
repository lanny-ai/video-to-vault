import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkflow } from "@/lib/db/repo";
import { generateDefendPack, generateSprintReport } from "@/lib/reports";
import { Card } from "@/components/ui";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/** Markdown rendered with restraint; print styles make it the deliverable. */
function renderMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.split("\n");
  const nodes: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let key = 0;

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer
      .filter((row) => !/^\|[\s-|]+\|$/.test(row))
      .map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
    nodes.push(
      <table key={key++} className="my-4 w-full max-w-sm text-sm">
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className={i === 0 ? "text-muted" : "border-t border-hairline"}>
              {cells.map((cell, j) => (
                <td key={j} className={`py-1.5 ${j > 0 ? "text-right tabular-nums" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
    tableBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("|")) {
      tableBuffer.push(line);
      continue;
    }
    flushTable();
    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={key++} className="mt-2 text-[26px] font-semibold tracking-tight">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={key++} className="mt-8 text-[18px] font-semibold tracking-tight">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      nodes.push(
        <p key={key++} className="mt-1 pl-4 text-[15px] leading-relaxed text-muted">
          · {line.slice(2)}
        </p>,
      );
    } else if (/^\d+\. /.test(line)) {
      nodes.push(
        <p key={key++} className="mt-1 pl-4 text-[15px] leading-relaxed text-ink">
          {line}
        </p>,
      );
    } else if (line.startsWith("   ")) {
      nodes.push(
        <p key={key++} className="pl-10 text-sm leading-relaxed text-muted">
          {line.trim()}
        </p>,
      );
    } else if (line.trim()) {
      nodes.push(
        <p key={key++} className="mt-3 text-[15px] leading-relaxed text-ink">
          {line}
        </p>,
      );
    }
  }
  flushTable();
  return nodes;
}

export default function ReportPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { kind?: string };
}) {
  const workflow = getWorkflow(params.id);
  if (!workflow?.spec) notFound();
  const kind = searchParams.kind === "defend" ? "defend" : "sprint";
  const markdown =
    kind === "defend" ? generateDefendPack(params.id) : generateSprintReport(params.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="no-print flex items-center justify-between">
        <div className="flex gap-1 rounded-full bg-canvas p-1">
          <Link
            href={`/workflows/${params.id}/report`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              kind === "sprint" ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            Sprint report
          </Link>
          <Link
            href={`/workflows/${params.id}/report?kind=defend`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              kind === "defend" ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            Defend pack
          </Link>
        </div>
        <PrintButton />
      </div>
      <Card className="px-10 py-9">{renderMarkdown(markdown)}</Card>
    </div>
  );
}
