import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  createSqliteExecutor,
  type SqliteDatabaseLike,
  type SqliteExecutor,
} from '../sqlite-executor.js';

/**
 * Test-only helper: a real, in-memory `@sqlite.org/sqlite-wasm` database
 * (no OPFS, no Worker — `:memory:` works in plain Node via the package's
 * own `node` build) wrapped as a `SqliteExecutor`. Used so
 * `migration.test.ts` / `sqlite-storage-provider.test.ts` exercise the
 * real SQL engine and real schema, not a hand-rolled fake — the strongest
 * verification available without a real browser/OPFS (see this ticket's
 * session-log entry on what still needs live Foundry re-verification).
 */
export async function createInMemorySqliteExecutor(): Promise<SqliteExecutor> {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  return createSqliteExecutor(db as unknown as SqliteDatabaseLike);
}
