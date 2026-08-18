import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite for a single-box deployment. Repositories are the only consumers;
 * route handlers and engines never touch SQL directly.
 */

let db: Database.Database | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'captured',
    source_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    spec TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    timestamp_sec REAL NOT NULL,
    image TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    start_sec REAL NOT NULL,
    end_sec REAL NOT NULL,
    text TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS golden_cases (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    name TEXT NOT NULL,
    input TEXT NOT NULL,
    expected TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS eval_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    created_at TEXT NOT NULL,
    results TEXT NOT NULL,
    pass_count INTEGER NOT NULL,
    total INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    checkpoint_index INTEGER NOT NULL DEFAULT 0,
    context TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    step_id TEXT,
    summary TEXT NOT NULL,
    detail TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    step_id TEXT NOT NULL,
    draft TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    edited_draft TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`,
];

export function dataDir(): string {
  return (
    process.env.VAULT_FDE_DATA_DIR || path.join(process.cwd(), "data")
  );
}

export function initDb(filename?: string): Database.Database {
  if (db) return db;
  let target = filename;
  if (!target) {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    target = path.join(dir, "vault-fde.db");
  }
  db = new Database(target);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const migration of MIGRATIONS) db.exec(migration);
  return db;
}

export function getDb(): Database.Database {
  return db ?? initDb();
}

/** Test hook: swap in an isolated in-memory database. */
export function resetDbForTests(): Database.Database {
  if (db) db.close();
  db = null;
  return initDb(":memory:");
}

export function nowIso(): string {
  return new Date().toISOString();
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}
