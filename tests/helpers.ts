import { DatabaseSync } from "node:sqlite";
import type { Store } from "../src/types";
export class TestStore implements Store {
  db = new DatabaseSync(":memory:");
  constructor() {
    this.db.exec(
      "CREATE TABLE records (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE chunks(hash TEXT, part INTEGER, data BLOB, PRIMARY KEY(hash,part))",
    );
  }
  get<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM records WHERE key=?")
      .get(key);
    return row ? JSON.parse(String(row.value)) : undefined;
  }
  put<T>(key: string, value: T) {
    this.db
      .prepare("INSERT OR REPLACE INTO records VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  delete(key: string) {
    this.db.prepare("DELETE FROM records WHERE key=?").run(key);
  }
  list<T>(prefix: string): [string, T][] {
    return this.db
      .prepare(
        "SELECT key,value FROM records WHERE key>=? AND key<? ORDER BY key",
      )
      .all(prefix, prefix + "\uffff")
      .map((row) => [String(row.key), JSON.parse(String(row.value))]);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  chunk(hash: string, index: number) {
    const row = this.db
      .prepare("SELECT data FROM chunks WHERE hash=? AND part=?")
      .get(hash, index);
    return row?.data as Uint8Array | undefined;
  }
  putChunk(hash: string, index: number, bytes: Uint8Array) {
    this.db
      .prepare("INSERT OR REPLACE INTO chunks VALUES(?,?,?)")
      .run(hash, index, bytes);
  }
  deleteChunks(hash: string) {
    this.db.prepare("DELETE FROM chunks WHERE hash=?").run(hash);
  }
}
