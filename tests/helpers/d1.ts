// A D1-compatible shim over node:sqlite with the real migrations applied, so SQL is tested for real.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Param = string | number | null;

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private params: Param[] = []) {}
  bind(...p: unknown[]) { return new Stmt(this.db, this.sql, p.map((x) => (x === undefined ? null : (x as Param)))); }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} }; }
  async first<T>(col?: string) {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync() { return this.db.prepare(this.sql).run(...this.params); }
  /** What D1's batch() gives back for this statement: rows for a query, the run info otherwise. */
  batchSync() {
    return /^\s*(SELECT|WITH)\b/i.test(this.sql)
      ? { results: this.db.prepare(this.sql).all(...this.params), success: true, meta: {} }
      : this.runSync();
  }
}

export function testD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "../../migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try { const out = stmts.map((s) => s.batchSync()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    async exec(sql: string) { db.exec(sql); return { count: 1, duration: 0 }; },
  } as unknown as D1Database & { raw: DatabaseSync };
}
