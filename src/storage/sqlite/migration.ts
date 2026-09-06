import type { SqliteExecutor } from './sqlite-executor.js';

/**
 * An ordered, numbered SQL migration (ADR-0008 point 3): `PRAGMA
 * user_version` tracks how far a given database file has been migrated,
 * compared against this module's own `MIGRATIONS` at Adapter startup. No
 * down-migrations — single local file, single user, no concurrent-writer
 * coordination problem to solve for (ADR-0008 point 3's own reasoning).
 */
export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

/**
 * Migration 1 — the initial schema. Node/Relationship rows keep their
 * queryable/constrainable fields (id, type/title/visibility,
 * origin/target/definitionId) as real columns; the remaining
 * KnowledgeElement fields that nothing queries yet (metadata, tags,
 * history, blocks, references) are stored as JSON TEXT columns rather than
 * normalized into their own tables — deliberate, not an oversight: at this
 * project's scale (a few hundred/thousand rows, per ADR-0007's
 * Consequences) and with no query today that needs to filter/join on tag
 * or block content, normalizing them now would be exactly the premature
 * complexity `CONTRIBUTING_GUIDE.md` Rule 9 warns against. Revisit if a
 * real query need for them appears.
 *
 * `relationships` deliberately declares **no** foreign key from
 * `origin`/`target` to `nodes.id` — see the inline comment below. This is
 * the storage-level enforcement ADR-0007's "Implementation caution for
 * whoever picks up STORE-001" names explicitly: a Relationship must
 * survive deletion of either endpoint Node (no cascade, no
 * delete-blocking), so the FK itself must never be declared, not just
 * declared with a permissive action.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK (visibility IN ('hidden', 'visible', 'owned')),
        metadata TEXT NOT NULL DEFAULT '{}',
        tags TEXT NOT NULL DEFAULT '[]',
        history TEXT NOT NULL DEFAULT '[]',
        blocks TEXT NOT NULL DEFAULT '[]',
        "references" TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE INDEX idx_nodes_type ON nodes(type)`,
      `CREATE TABLE relationships (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        target TEXT NOT NULL,
        definition_id TEXT NOT NULL,
        title TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK (visibility IN ('hidden', 'visible', 'owned')),
        metadata TEXT NOT NULL DEFAULT '{}',
        tags TEXT NOT NULL DEFAULT '[]',
        history TEXT NOT NULL DEFAULT '[]',
        blocks TEXT NOT NULL DEFAULT '[]',
        "references" TEXT NOT NULL DEFAULT '[]',
        CHECK (origin <> target)
        -- Deliberately NO "FOREIGN KEY (origin) REFERENCES nodes(id)" (and
        -- none for target either). Declaring one with RESTRICT would block
        -- deleting a Node that still has Relationships pointing at it;
        -- CASCADE would silently delete those Relationships along with it.
        -- Both are rejected by ADR-0007 point 8 / ADR-0008 point 2
        -- ("History is Part of the World" — a Relationship must survive
        -- the deletion of either endpoint). The natural-exclusion behavior
        -- View traversal needs comes from the resolution query itself (a
        -- plain lookup/join that drops unresolvable rows for free), not
        -- from a referential-integrity constraint declared here.
      )`,
      `CREATE INDEX idx_relationships_origin ON relationships(origin)`,
      `CREATE INDEX idx_relationships_target ON relationships(target)`,
      `CREATE INDEX idx_relationships_definition_id ON relationships(definition_id)`,
    ],
  },
];

function readUserVersion(executor: SqliteExecutor): number {
  const value = executor.scalar('PRAGMA user_version');
  return typeof value === 'number' ? value : 0;
}

/**
 * `PRAGMA user_version = N` doesn't support `?` bind parameters (SQLite
 * limitation), so the version is interpolated directly. Safe here because
 * `version` only ever comes from this module's own trusted `MIGRATIONS`
 * array, never external input — the integer check is defense-in-depth
 * against a future authoring mistake, not untrusted-input sanitization.
 */
function writeUserVersion(executor: SqliteExecutor, version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid migration version: ${JSON.stringify(version)}`);
  }
  executor.run(`PRAGMA user_version = ${version}`);
}

/**
 * Applies every migration whose version is greater than the database's
 * current `PRAGMA user_version`, in ascending order, inside a single
 * transaction — "applied ... in a single transaction on Adapter startup,
 * comparing stored vs. expected version" (ADR-0008 point 3). A no-op if
 * the database is already current. Throws (and rolls back) if any
 * statement fails, leaving the stored version unchanged.
 */
export function runMigrations(
  executor: SqliteExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  const currentVersion = readUserVersion(executor);
  const pending = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    return;
  }

  executor.run('BEGIN');
  try {
    for (const migration of pending) {
      for (const statement of migration.statements) {
        executor.run(statement);
      }
      writeUserVersion(executor, migration.version);
    }
    executor.run('COMMIT');
  } catch (error) {
    executor.run('ROLLBACK');
    throw error;
  }
}
