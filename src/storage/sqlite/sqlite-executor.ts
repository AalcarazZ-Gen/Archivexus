/**
 * Minimal structural subset of `@sqlite.org/sqlite-wasm`'s OO1 `Database`
 * this package needs — same no-real-dependency-surface tradeoff already
 * used for Foundry's own types (e.g. `FoundryActorLike`): depending on the
 * full, heavily-overloaded `Database`/`OpfsSAHPoolDatabase` type here would
 * couple every consumer of `SqliteExecutor` to that library's exact shape.
 * A real `Database`/`OpfsSAHPoolDatabase` instance is structurally close
 * but not an exact overload match (its `exec` has many more overloads for
 * options this package never uses) — callers hand it in via an explicit
 * `as unknown as SqliteDatabaseLike` cast (see `worker/sqlite.worker.ts`),
 * the same pattern this codebase already uses for Foundry's own complex
 * types (`foundry-globals.d.ts`).
 */
export interface SqliteDatabaseLike {
  exec(
    sql: string,
    opts: { bind: readonly unknown[]; rowMode: 'object'; returnValue: 'resultRows' },
  ): readonly Record<string, unknown>[];
  exec(sql: string, opts: { bind: readonly unknown[] }): unknown;
  close?(): void;
}

/**
 * The narrow, engine-agnostic surface `SqliteStorageProvider` and the
 * migration runner actually use. Deliberately synchronous — the real
 * WASM SQLite engine executes synchronously once inside a Worker (see
 * `worker/sqlite.worker.ts`); async-ness is only introduced at the
 * `StorageProvider`/RPC boundary, never here.
 */
export interface SqliteExecutor {
  /** Runs a statement with no expected result rows (DDL, INSERT/UPDATE/DELETE, PRAGMA writes). */
  run(sql: string, bind?: readonly unknown[]): void;
  /** Runs a SELECT and returns every matching row as a plain object keyed by column name. */
  all(sql: string, bind?: readonly unknown[]): readonly Record<string, unknown>[];
  /** Runs a query expected to return at most one row, and returns its first column's value (or `undefined`). */
  scalar(sql: string, bind?: readonly unknown[]): unknown;
  /** Releases the underlying database handle, if the wrapped engine has one. */
  close(): void;
}

/** Wraps a real (or fake, for tests) `SqliteDatabaseLike` as a `SqliteExecutor`. */
export function createSqliteExecutor(db: SqliteDatabaseLike): SqliteExecutor {
  return {
    run(sql, bind = []) {
      db.exec(sql, { bind });
    },
    all(sql, bind = []) {
      return db.exec(sql, { bind, rowMode: 'object', returnValue: 'resultRows' });
    },
    scalar(sql, bind = []) {
      const rows = db.exec(sql, { bind, rowMode: 'object', returnValue: 'resultRows' });
      const firstRow = rows[0];
      if (firstRow === undefined) {
        return undefined;
      }
      return Object.values(firstRow)[0];
    },
    close() {
      db.close?.();
    },
  };
}
