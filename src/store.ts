import type { Store } from "./types";
export class SqlStore implements Store {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS chunks (hash TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(hash, part))",
    );
  }
  get<T>(key: string): T | undefined {
    const rows = this.storage.sql
      .exec<{ value: string }>("SELECT value FROM records WHERE key = ?", key)
      .toArray();
    return rows.length ? JSON.parse(rows[0].value) : undefined;
  }
  put<T>(key: string, value: T) {
    this.storage.sql.exec(
      "INSERT OR REPLACE INTO records VALUES (?, ?)",
      key,
      JSON.stringify(value),
    );
  }
  delete(key: string) {
    this.storage.sql.exec("DELETE FROM records WHERE key = ?", key);
  }
  list<T>(prefix: string): [string, T][] {
    return this.storage.sql
      .exec<{ key: string; value: string }>(
        "SELECT key, value FROM records WHERE key >= ? AND key < ? ORDER BY key",
        prefix,
        prefix + "\uffff",
      )
      .toArray()
      .map((r) => [r.key, JSON.parse(r.value)]);
  }
  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }
  chunk(hash: string, index: number) {
    const row = this.storage.sql
      .exec<{ data: ArrayBuffer }>(
        "SELECT data FROM chunks WHERE hash = ? AND part = ?",
        hash,
        index,
      )
      .toArray()[0];
    return row && new Uint8Array(row.data);
  }
  putChunk(hash: string, index: number, bytes: Uint8Array) {
    this.storage.sql.exec(
      "INSERT OR REPLACE INTO chunks VALUES (?, ?, ?)",
      hash,
      index,
      bytes,
    );
  }
  deleteChunks(hash: string) {
    this.storage.sql.exec("DELETE FROM chunks WHERE hash = ?", hash);
  }
}
