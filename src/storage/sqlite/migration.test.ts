import { beforeEach, describe, expect, it } from 'vitest';
import type { SqliteExecutor } from './sqlite-executor.js';
import { createInMemorySqliteExecutor } from './test-helpers/in-memory-sqlite.js';
import { MIGRATIONS, runMigrations, type Migration } from './migration.js';

describe('runMigrations', () => {
  let executor: SqliteExecutor;

  beforeEach(async () => {
    executor = await createInMemorySqliteExecutor();
  });

  it('starts a fresh database at user_version 0', () => {
    expect(executor.scalar('PRAGMA user_version')).toBe(0);
  });

  it('applies MIGRATIONS and advances user_version to the latest version', () => {
    runMigrations(executor, MIGRATIONS);
    const latestVersion = Math.max(...MIGRATIONS.map((m) => m.version));
    expect(executor.scalar('PRAGMA user_version')).toBe(latestVersion);
  });

  it('creates the nodes, relationships, views and relationship_definitions tables with the expected indexes', () => {
    runMigrations(executor, MIGRATIONS);
    const tables = executor
      .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(tables).toEqual(['nodes', 'relationship_definitions', 'relationships', 'views']);

    const indexes = executor
      .all("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_nodes_type',
        'idx_relationships_origin',
        'idx_relationships_target',
        'idx_relationship_definitions_category',
      ]),
    );
  });

  it('is a no-op when the database is already at the latest version', () => {
    runMigrations(executor, MIGRATIONS);
    // A second call must not try to re-run CREATE TABLE and throw.
    expect(() => runMigrations(executor, MIGRATIONS)).not.toThrow();
  });

  it('applies only pending migrations, in ascending version order', () => {
    const applied: number[] = [];
    const migrations: readonly Migration[] = [
      { version: 1, statements: ['CREATE TABLE a (id TEXT)'] },
      { version: 2, statements: ['CREATE TABLE b (id TEXT)'] },
    ];
    runMigrations(executor, [migrations[0]!]);
    expect(executor.scalar('PRAGMA user_version')).toBe(1);

    runMigrations(executor, migrations);
    expect(executor.scalar('PRAGMA user_version')).toBe(2);

    const tables = executor
      .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(tables).toEqual(['a', 'b']);
    void applied;
  });

  it('rolls back and rethrows if a migration statement fails, leaving user_version unchanged', () => {
    const badMigration: readonly Migration[] = [
      { version: 1, statements: ['CREATE TABLE ok (id TEXT)', 'THIS IS NOT VALID SQL'] },
    ];
    expect(() => runMigrations(executor, badMigration)).toThrow();
    expect(executor.scalar('PRAGMA user_version')).toBe(0);
    const tables = executor
      .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(tables).toEqual([]);
  });

  it('rejects the no-cascade/no-restrict invariant assumption by construction: relationships has no real FOREIGN KEY clause on origin/target', () => {
    runMigrations(executor, MIGRATIONS);
    const sql = executor.scalar(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'relationships'",
    ) as string;
    // Strip SQL comments before asserting - the schema deliberately explains
    // *why* no FK is declared in a comment that itself mentions "FOREIGN
    // KEY", which would otherwise make this assertion trivially fail on
    // its own explanatory text rather than on an actual constraint clause.
    const withoutComments = sql.replace(/--.*$/gm, '');
    expect(withoutComments.toUpperCase()).not.toContain('FOREIGN KEY');
  });

  it('enforces origin <> target at the storage layer too (defense-in-depth alongside Core)', () => {
    runMigrations(executor, MIGRATIONS);
    expect(() =>
      executor.run(
        `INSERT INTO relationships (id, origin, target, definition_id, title, visibility)
         VALUES ('r1', 'n1', 'n1', 'def', 'title', 'hidden')`,
      ),
    ).toThrow();
  });

  it('allows a dangling origin/target with no matching Node row (ADR-0007 point 8)', () => {
    runMigrations(executor, MIGRATIONS);
    expect(() =>
      executor.run(
        `INSERT INTO relationships (id, origin, target, definition_id, title, visibility)
         VALUES ('r1', 'gone', 'n2', 'def', 'title', 'hidden')`,
      ),
    ).not.toThrow();
  });

  describe('migration 2 — the views table (CORE-006 / ADR-0014)', () => {
    it('creates views with no FOREIGN KEY clause (same no-cascade reasoning as relationships — ADR-0014 point 7)', () => {
      runMigrations(executor, MIGRATIONS);
      const sql = executor.scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'views'",
      ) as string;
      expect(sql.replace(/--.*$/gm, '').toUpperCase()).not.toContain('FOREIGN KEY');
    });

    it('constrains format to the single supported value', () => {
      runMigrations(executor, MIGRATIONS);
      expect(() =>
        executor.run(
          `INSERT INTO views (id, format, title, visibility, spec)
           VALUES ('v1', 'timeline', 't', 'hidden', '{}')`,
        ),
      ).toThrow();
    });

    it('accepts a graph View row and lets its spec reference a Node id that has no row (no FK)', () => {
      runMigrations(executor, MIGRATIONS);
      expect(() =>
        executor.run(
          `INSERT INTO views (id, format, title, visibility, spec)
           VALUES ('v1', 'graph', 'Kingdom overview', 'hidden', '{"preset":"direct-only","rootNodeId":"Node.gone"}')`,
        ),
      ).not.toThrow();
    });
  });

  describe('migration 3 — the relationship_definitions table (CORE-004 fast-follow)', () => {
    it('creates relationship_definitions with no FOREIGN KEY clause', () => {
      runMigrations(executor, MIGRATIONS);
      const sql = executor.scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'relationship_definitions'",
      ) as string;
      expect(sql.replace(/--.*$/gm, '').toUpperCase()).not.toContain('FOREIGN KEY');
    });

    it('constrains traversal_category to the closed taxonomy and symmetry to 0/1', () => {
      runMigrations(executor, MIGRATIONS);
      expect(() =>
        executor.run(
          `INSERT INTO relationship_definitions (id, name, inverse, cardinality, symmetry, traversal_category)
           VALUES ('d1', 'd', 'd-inv', 'many-to-many', 0, 'not-a-category')`,
        ),
      ).toThrow();
      expect(() =>
        executor.run(
          `INSERT INTO relationship_definitions (id, name, inverse, cardinality, symmetry, traversal_category)
           VALUES ('d2', 'd', 'd-inv', 'many-to-many', 2, 'affiliation')`,
        ),
      ).toThrow();
    });

    it('accepts a valid row with a null validation and defaults version to 1', () => {
      runMigrations(executor, MIGRATIONS);
      executor.run(
        `INSERT INTO relationship_definitions (id, name, inverse, cardinality, symmetry, traversal_category)
         VALUES ('ally-of', 'ally-of', 'ally-of', 'many-to-many', 1, 'affiliation')`,
      );
      const row = executor.all("SELECT * FROM relationship_definitions WHERE id = 'ally-of'")[0];
      expect(row?.version).toBe(1);
      expect(row?.validation).toBeNull();
    });
  });
});
