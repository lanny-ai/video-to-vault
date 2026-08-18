import { getDb, newId, nowIso } from "./index";
import { parseSpec, type WorkflowSpec } from "@/lib/spec/schema";

/** Workflow lifecycle. Each stage earns the right to the next. */
export type WorkflowStatus =
  | "captured"
  | "mapped"
  | "interviewing"
  | "evals"
  | "shadow"
  | "live"
  | "no_go"
  | "archived";

export interface WorkflowRow {
  id: string;
  title: string;
  status: WorkflowStatus;
  sourceKind: "loom" | "youtube" | "upload" | "fixture";
  sourceRef: string;
  spec: WorkflowSpec | null;
  createdAt: string;
  updatedAt: string;
}

export interface FrameRow {
  id: string;
  workflowId: string;
  timestampSec: number;
  /** Inline SVG or a file path under the data dir. */
  image: string;
  description: string;
}

export interface TranscriptSegment {
  id: string;
  workflowId: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface GoldenCase {
  id: string;
  workflowId: string;
  name: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  source: "historical" | "interview" | "correction" | "recording";
  createdAt: string;
}

export interface EvalCaseResult {
  caseId: string;
  caseName: string;
  pass: boolean;
  failureCategory?: string;
  actual: Record<string, unknown>;
  notes: string;
  stepChecks: {
    rightData: boolean;
    requiredSteps: boolean;
    matchesExpert: boolean;
    safeToAct: boolean;
  };
}

export interface EvalRunRow {
  id: string;
  workflowId: string;
  createdAt: string;
  results: EvalCaseResult[];
  passCount: number;
  total: number;
}

export type RunMode = "shadow" | "live";
export type RunStatus = "running" | "waiting_approval" | "completed" | "failed" | "aborted";

export interface RunRow {
  id: string;
  workflowId: string;
  mode: RunMode;
  status: RunStatus;
  checkpointIndex: number;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  runId: string;
  ts: string;
  kind:
    | "run_started"
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "step_skipped"
    | "approval_requested"
    | "approval_resolved"
    | "routed_to_human"
    | "retry"
    | "run_completed"
    | "run_failed"
    | "run_aborted";
  stepId: string | null;
  summary: string;
  detail: Record<string, unknown> | null;
}

export type ApprovalStatus = "pending" | "approved" | "edited" | "rejected";

export interface ApprovalRow {
  id: string;
  runId: string;
  workflowId: string;
  stepId: string;
  draft: Record<string, unknown>;
  reasoning: string;
  status: ApprovalStatus;
  editedDraft: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Workflows

function rowToWorkflow(r: any): WorkflowRow {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    sourceKind: r.source_kind,
    sourceRef: r.source_ref,
    spec: r.spec ? parseSpec(JSON.parse(r.spec)) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createWorkflow(input: {
  title: string;
  sourceKind: WorkflowRow["sourceKind"];
  sourceRef: string;
}): WorkflowRow {
  const id = newId("wf");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO workflows (id, title, status, source_kind, source_ref, created_at, updated_at)
       VALUES (?, ?, 'captured', ?, ?, ?, ?)`,
    )
    .run(id, input.title, input.sourceKind, input.sourceRef, ts, ts);
  return getWorkflow(id)!;
}

export function getWorkflow(id: string): WorkflowRow | null {
  const r = getDb().prepare(`SELECT * FROM workflows WHERE id = ?`).get(id);
  return r ? rowToWorkflow(r) : null;
}

export function listWorkflows(): WorkflowRow[] {
  return getDb()
    .prepare(`SELECT * FROM workflows ORDER BY created_at DESC`)
    .all()
    .map(rowToWorkflow);
}

export function saveSpec(workflowId: string, spec: WorkflowSpec): void {
  parseSpec(spec); // refuse to persist an invalid spec
  getDb()
    .prepare(`UPDATE workflows SET spec = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(spec), nowIso(), workflowId);
}

export function setWorkflowStatus(workflowId: string, status: WorkflowStatus): void {
  getDb()
    .prepare(`UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, nowIso(), workflowId);
}

export function setWorkflowTitle(workflowId: string, title: string): void {
  getDb()
    .prepare(`UPDATE workflows SET title = ?, updated_at = ? WHERE id = ?`)
    .run(title, nowIso(), workflowId);
}

// ---------------------------------------------------------------------------
// Frames and transcript

export function addFrame(input: Omit<FrameRow, "id">): FrameRow {
  const id = newId("fr");
  getDb()
    .prepare(
      `INSERT INTO frames (id, workflow_id, timestamp_sec, image, description) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, input.workflowId, input.timestampSec, input.image, input.description);
  return { id, ...input };
}

export function listFrames(workflowId: string): FrameRow[] {
  return getDb()
    .prepare(`SELECT * FROM frames WHERE workflow_id = ? ORDER BY timestamp_sec`)
    .all(workflowId)
    .map((r: any) => ({
      id: r.id,
      workflowId: r.workflow_id,
      timestampSec: r.timestamp_sec,
      image: r.image,
      description: r.description,
    }));
}

export function addTranscriptSegment(input: Omit<TranscriptSegment, "id">): TranscriptSegment {
  const id = newId("ts");
  getDb()
    .prepare(
      `INSERT INTO transcript_segments (id, workflow_id, start_sec, end_sec, text) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, input.workflowId, input.startSec, input.endSec, input.text);
  return { id, ...input };
}

export function listTranscript(workflowId: string): TranscriptSegment[] {
  return getDb()
    .prepare(`SELECT * FROM transcript_segments WHERE workflow_id = ? ORDER BY start_sec`)
    .all(workflowId)
    .map((r: any) => ({
      id: r.id,
      workflowId: r.workflow_id,
      startSec: r.start_sec,
      endSec: r.end_sec,
      text: r.text,
    }));
}

// ---------------------------------------------------------------------------
// Golden dataset

export function addGoldenCase(input: Omit<GoldenCase, "id" | "createdAt">): GoldenCase {
  const id = newId("gc");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO golden_cases (id, workflow_id, name, input, expected, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.workflowId,
      input.name,
      JSON.stringify(input.input),
      JSON.stringify(input.expected),
      input.source,
      ts,
    );
  return { id, createdAt: ts, ...input };
}

export function listGoldenCases(workflowId: string): GoldenCase[] {
  return getDb()
    .prepare(`SELECT * FROM golden_cases WHERE workflow_id = ? ORDER BY created_at`)
    .all(workflowId)
    .map((r: any) => ({
      id: r.id,
      workflowId: r.workflow_id,
      name: r.name,
      input: JSON.parse(r.input),
      expected: JSON.parse(r.expected),
      source: r.source,
      createdAt: r.created_at,
    }));
}

// ---------------------------------------------------------------------------
// Eval runs

export function addEvalRun(input: Omit<EvalRunRow, "id" | "createdAt">): EvalRunRow {
  const id = newId("ev");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO eval_runs (id, workflow_id, created_at, results, pass_count, total)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.workflowId, ts, JSON.stringify(input.results), input.passCount, input.total);
  return { id, createdAt: ts, ...input };
}

export function listEvalRuns(workflowId: string): EvalRunRow[] {
  return getDb()
    .prepare(`SELECT * FROM eval_runs WHERE workflow_id = ? ORDER BY created_at DESC`)
    .all(workflowId)
    .map((r: any) => ({
      id: r.id,
      workflowId: r.workflow_id,
      createdAt: r.created_at,
      results: JSON.parse(r.results),
      passCount: r.pass_count,
      total: r.total,
    }));
}

export function latestEvalRun(workflowId: string): EvalRunRow | null {
  return listEvalRuns(workflowId)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Runs and audit trail

function rowToRun(r: any): RunRow {
  return {
    id: r.id,
    workflowId: r.workflow_id,
    mode: r.mode,
    status: r.status,
    checkpointIndex: r.checkpoint_index,
    context: JSON.parse(r.context),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createRun(input: {
  workflowId: string;
  mode: RunMode;
  context?: Record<string, unknown>;
}): RunRow {
  const id = newId("run");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO runs (id, workflow_id, mode, status, checkpoint_index, context, created_at, updated_at)
       VALUES (?, ?, ?, 'running', 0, ?, ?, ?)`,
    )
    .run(id, input.workflowId, input.mode, JSON.stringify(input.context ?? {}), ts, ts);
  return getRun(id)!;
}

export function getRun(id: string): RunRow | null {
  const r = getDb().prepare(`SELECT * FROM runs WHERE id = ?`).get(id);
  return r ? rowToRun(r) : null;
}

export function listRuns(workflowId: string): RunRow[] {
  return getDb()
    .prepare(`SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC`)
    .all(workflowId)
    .map(rowToRun);
}

export function updateRun(
  id: string,
  patch: Partial<Pick<RunRow, "status" | "checkpointIndex" | "context">>,
): void {
  const run = getRun(id);
  if (!run) throw new Error(`Run not found: ${id}`);
  getDb()
    .prepare(`UPDATE runs SET status = ?, checkpoint_index = ?, context = ?, updated_at = ? WHERE id = ?`)
    .run(
      patch.status ?? run.status,
      patch.checkpointIndex ?? run.checkpointIndex,
      JSON.stringify(patch.context ?? run.context),
      nowIso(),
      id,
    );
}

export function addAuditEvent(input: Omit<AuditEvent, "id" | "ts">): AuditEvent {
  const id = newId("ae");
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO audit_events (id, run_id, ts, kind, step_id, summary, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.runId,
      ts,
      input.kind,
      input.stepId,
      input.summary,
      input.detail ? JSON.stringify(input.detail) : null,
    );
  return { id, ts, ...input };
}

export function listAuditEvents(runId: string): AuditEvent[] {
  return getDb()
    .prepare(`SELECT * FROM audit_events WHERE run_id = ? ORDER BY ts, id`)
    .all(runId)
    .map((r: any) => ({
      id: r.id,
      runId: r.run_id,
      ts: r.ts,
      kind: r.kind,
      stepId: r.step_id,
      summary: r.summary,
      detail: r.detail ? JSON.parse(r.detail) : null,
    }));
}

// ---------------------------------------------------------------------------
// Approvals

function rowToApproval(r: any): ApprovalRow {
  return {
    id: r.id,
    runId: r.run_id,
    workflowId: r.workflow_id,
    stepId: r.step_id,
    draft: JSON.parse(r.draft),
    reasoning: r.reasoning,
    status: r.status,
    editedDraft: r.edited_draft ? JSON.parse(r.edited_draft) : null,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

export function createApproval(input: {
  runId: string;
  workflowId: string;
  stepId: string;
  draft: Record<string, unknown>;
  reasoning: string;
}): ApprovalRow {
  const id = newId("ap");
  getDb()
    .prepare(
      `INSERT INTO approvals (id, run_id, workflow_id, step_id, draft, reasoning, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.runId,
      input.workflowId,
      input.stepId,
      JSON.stringify(input.draft),
      input.reasoning,
      nowIso(),
    );
  return getApproval(id)!;
}

export function getApproval(id: string): ApprovalRow | null {
  const r = getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).get(id);
  return r ? rowToApproval(r) : null;
}

export function listPendingApprovals(): ApprovalRow[] {
  return getDb()
    .prepare(`SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at`)
    .all()
    .map(rowToApproval);
}

export function listApprovalsForRun(runId: string): ApprovalRow[] {
  return getDb()
    .prepare(`SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at`)
    .all(runId)
    .map(rowToApproval);
}

export function resolveApproval(
  id: string,
  resolution: { status: Exclude<ApprovalStatus, "pending">; editedDraft?: Record<string, unknown> },
): ApprovalRow {
  const approval = getApproval(id);
  if (!approval) throw new Error(`Approval not found: ${id}`);
  if (approval.status !== "pending") {
    throw new Error(`Approval ${id} is already ${approval.status}`);
  }
  getDb()
    .prepare(`UPDATE approvals SET status = ?, edited_draft = ?, resolved_at = ? WHERE id = ?`)
    .run(
      resolution.status,
      resolution.editedDraft ? JSON.stringify(resolution.editedDraft) : null,
      nowIso(),
      id,
    );
  return getApproval(id)!;
}
