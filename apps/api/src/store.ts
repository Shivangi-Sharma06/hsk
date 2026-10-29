import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    const schemaVersion = Number(
      this.db.prepare("PRAGMA user_version").get()?.user_version,
    );
    if (schemaVersion !== 0 && schemaVersion !== 1) {
      this.db.close();
      throw new Error("Unsupported database schema version");
    }
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS documents(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(kind,id));
 CREATE INDEX IF NOT EXISTS document_owner ON documents(kind,owner);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS event_run ON events(run_id,id);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,run_id TEXT NOT NULL,due INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0,tries INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS job_due ON jobs(due,lease);
 CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(scope,key));
 PRAGMA user_version=1;`);
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM documents WHERE kind=? AND id=?")
      .get(kind, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  list<T>(kind: string, owner?: string, limit = -1): T[] {
    if (!Number.isSafeInteger(limit) || limit < -1)
      throw new Error("Invalid document limit");
    const rows =
      owner === undefined
        ? this.db
            .prepare(
              "SELECT data FROM documents WHERE kind=? ORDER BY rowid DESC LIMIT ?",
            )
            .all(kind, limit)
        : this.db
            .prepare(
              "SELECT data FROM documents WHERE kind=? AND owner=? ORDER BY rowid DESC LIMIT ?",
            )
            .all(kind, owner, limit);
    return rows.map((r) => JSON.parse(r.data as string) as T);
  }
  put(kind: string, id: string, owner: string, data: unknown) {
    this.db
      .prepare(
        "INSERT INTO documents(kind,id,owner,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=version+1",
      )
      .run(kind, id, owner, JSON.stringify(data));
  }
  remove(kind: string, id: string) {
    this.db
      .prepare("DELETE FROM documents WHERE kind=? AND id=?")
      .run(kind, id);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  event(runId: string, type: string, data: unknown = {}) {
    this.db
      .prepare("INSERT INTO events(run_id,type,data,at) VALUES(?,?,?,?)")
      .run(runId, type, JSON.stringify(data), Date.now());
  }
  events(runId: string, after = 0) {
    return this.db
      .prepare(
        "SELECT id,type,data,at FROM events WHERE run_id=? AND id>? ORDER BY id LIMIT 200",
      )
      .all(runId, after)
      .map((r) => ({
        id: Number(r.id),
        type: String(r.type),
        at: Number(r.at),
        data: JSON.parse(r.data as string) as unknown,
      }));
  }
  enqueue(kind: string, runId: string, due = Date.now()) {
    this.db
      .prepare(
        "INSERT INTO jobs(id,kind,run_id,due) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET due=min(due,excluded.due)",
      )
      .run(`${kind}:${runId}`, kind, runId, due);
  }
  close() {
    this.db.close();
  }
}
export type Job = {
  id: string;
  kind: string;
  run_id: string;
  due: number;
  lease: number;
  tries: number;
};
