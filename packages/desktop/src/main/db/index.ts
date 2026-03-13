import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { DB_FILE_NAME } from '@clawwork/shared';
import * as schema from './schema.js';
import { initFTS } from './fts.js';

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: Database.Database | null = null;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  artifact_dir TEXT NOT NULL DEFAULT '',
  gateway_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  message_id TEXT NOT NULL REFERENCES messages(id),
  type TEXT NOT NULL DEFAULT 'file',
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  local_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  git_sha TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`;

export function initDatabase(workspacePath: string): void {
  if (db) return;

  const dbPath = join(workspacePath, DB_FILE_NAME);
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(CREATE_TABLES_SQL);

  // Migration: add gateway_id column to existing tasks table
  try {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN gateway_id TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists, ignore
  }

  initFTS(sqlite);

  db = drizzle(sqlite, { schema });
  console.log(`[db] initialized at ${dbPath}`);
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function getSqlite(): Database.Database | null {
  return sqlite;
}

export function isDbReady(): boolean {
  return db !== null;
}

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
}
