import { NextResponse } from "next/server";
import { addGoldenCase, getWorkflow } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/**
 * Import historical examples. Accepts JSON: an array of
 * { name, input, expected } or CSV text with input_/expected_ column prefixes.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const workflow = getWorkflow(params.id);
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  let cases: { name: string; input: Record<string, unknown>; expected: Record<string, unknown> }[] = [];
  try {
    if (contentType.includes("text/csv")) {
      cases = parseCsv(await request.text());
    } else {
      const body = await request.json();
      if (!Array.isArray(body)) throw new Error("Expected a JSON array of cases.");
      cases = body;
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse examples: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  let added = 0;
  const errors: string[] = [];
  cases.forEach((c, i) => {
    if (!c || typeof c !== "object" || !c.input || !c.expected) {
      errors.push(`Row ${i + 1}: needs input and expected.`);
      return;
    }
    addGoldenCase({
      workflowId: params.id,
      name: c.name || `Imported case ${i + 1}`,
      input: c.input,
      expected: c.expected,
      source: "historical",
    });
    added += 1;
  });
  return NextResponse.json({ added, errors });
}

function coerce(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null;
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && /^-?[\d.]+$/.test(trimmed)) return num;
  return trimmed;
}

/** RFC-style CSV line split: quoted fields may contain commas and "" escapes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(
  text: string,
): { name: string; input: Record<string, unknown>; expected: Record<string, unknown> }[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    const input: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    let name = `Imported case ${i + 1}`;
    headers.forEach((header, col) => {
      const value = cells[col] ?? "";
      if (header === "name") name = value.trim() || name;
      else if (header.startsWith("input_")) input[header.slice(6)] = coerce(value);
      else if (header.startsWith("expected_")) expected[header.slice(9)] = coerce(value);
    });
    return { name, input, expected };
  });
}
