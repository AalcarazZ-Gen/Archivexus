import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { View } from '../../core/domain/view.js';
import { MIGRATIONS, runMigrations } from './migration.js';
import {
  nodeToRow,
  relationshipToRow,
  rowToNode,
  rowToRelationship,
  rowToView,
  viewToRow,
  type NodeRow,
  type RelationshipRow,
  type ViewRow,
} from './row-mapping.js';
import type { SqliteExecutor } from './sqlite-executor.js';

const NODE_COLUMNS = 'id, type, title, visibility, metadata, tags, history, blocks, "references"';
const RELATIONSHIP_COLUMNS =
  'id, origin, target, definition_id, title, visibility, metadata, tags, history, blocks, "references"';
const VIEW_COLUMNS =
  'id, format, title, visibility, spec, metadata, tags, history, blocks, "references"';

/**
 * `StorageProvider` implemented against a `SqliteExecutor` (real WASM
 * SQLite, or the real `@sqlite.org/sqlite-wasm` package running in-memory
 * for tests — see `sqlite-storage-provider.test.ts`). Intended to run
 * inside the dedicated Worker `worker/sqlite.worker.ts` creates — this
 * class itself has no Worker/OPFS-specific code, only SQL, so it's usable
 * (and tested) without either.
 */
export class SqliteStorageProvider implements StorageProvider {
  readonly #db: SqliteExecutor;

  constructor(db: SqliteExecutor) {
    this.#db = db;
  }

  init(): Promise<void> {
    runMigrations(this.#db, MIGRATIONS);
    return Promise.resolve();
  }

  saveNode(node: Node): Promise<void> {
    const row = nodeToRow(node);
    this.#db.run(
      `INSERT INTO nodes (${NODE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         title = excluded.title,
         visibility = excluded.visibility,
         metadata = excluded.metadata,
         tags = excluded.tags,
         history = excluded.history,
         blocks = excluded.blocks,
         "references" = excluded."references"`,
      [
        row.id,
        row.type,
        row.title,
        row.visibility,
        row.metadata,
        row.tags,
        row.history,
        row.blocks,
        row.references,
      ],
    );
    return Promise.resolve();
  }

  getNode(id: string): Promise<Node | undefined> {
    const rows = this.#db.all('SELECT * FROM nodes WHERE id = ?', [id]);
    const row = rows[0];
    return Promise.resolve(row ? rowToNode(row as unknown as NodeRow) : undefined);
  }

  deleteNode(id: string): Promise<void> {
    this.#db.run('DELETE FROM nodes WHERE id = ?', [id]);
    return Promise.resolve();
  }

  listNodes(): Promise<readonly Node[]> {
    const rows = this.#db.all('SELECT * FROM nodes ORDER BY id');
    return Promise.resolve(rows.map((row) => rowToNode(row as unknown as NodeRow)));
  }

  saveRelationship(relationship: Relationship): Promise<void> {
    const row = relationshipToRow(relationship);
    this.#db.run(
      `INSERT INTO relationships (${RELATIONSHIP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         origin = excluded.origin,
         target = excluded.target,
         definition_id = excluded.definition_id,
         title = excluded.title,
         visibility = excluded.visibility,
         metadata = excluded.metadata,
         tags = excluded.tags,
         history = excluded.history,
         blocks = excluded.blocks,
         "references" = excluded."references"`,
      [
        row.id,
        row.origin,
        row.target,
        row.definition_id,
        row.title,
        row.visibility,
        row.metadata,
        row.tags,
        row.history,
        row.blocks,
        row.references,
      ],
    );
    return Promise.resolve();
  }

  getRelationship(id: string): Promise<Relationship | undefined> {
    const rows = this.#db.all('SELECT * FROM relationships WHERE id = ?', [id]);
    const row = rows[0];
    return Promise.resolve(row ? rowToRelationship(row as unknown as RelationshipRow) : undefined);
  }

  deleteRelationship(id: string): Promise<void> {
    this.#db.run('DELETE FROM relationships WHERE id = ?', [id]);
    return Promise.resolve();
  }

  listRelationships(): Promise<readonly Relationship[]> {
    const rows = this.#db.all('SELECT * FROM relationships ORDER BY id');
    return Promise.resolve(rows.map((row) => rowToRelationship(row as unknown as RelationshipRow)));
  }

  getRelationshipsForNode(nodeId: string): Promise<readonly Relationship[]> {
    // ADR-0007's 1-hop lookup: served by idx_relationships_origin /
    // idx_relationships_target (migration.ts), never a full scan.
    const rows = this.#db.all(
      'SELECT * FROM relationships WHERE origin = ? OR target = ? ORDER BY id',
      [nodeId, nodeId],
    );
    return Promise.resolve(rows.map((row) => rowToRelationship(row as unknown as RelationshipRow)));
  }

  saveView(view: View): Promise<void> {
    const row = viewToRow(view);
    this.#db.run(
      `INSERT INTO views (${VIEW_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         format = excluded.format,
         title = excluded.title,
         visibility = excluded.visibility,
         spec = excluded.spec,
         metadata = excluded.metadata,
         tags = excluded.tags,
         history = excluded.history,
         blocks = excluded.blocks,
         "references" = excluded."references"`,
      [
        row.id,
        row.format,
        row.title,
        row.visibility,
        row.spec,
        row.metadata,
        row.tags,
        row.history,
        row.blocks,
        row.references,
      ],
    );
    return Promise.resolve();
  }

  getView(id: string): Promise<View | undefined> {
    const rows = this.#db.all('SELECT * FROM views WHERE id = ?', [id]);
    const row = rows[0];
    return Promise.resolve(row ? rowToView(row as unknown as ViewRow) : undefined);
  }

  deleteView(id: string): Promise<void> {
    this.#db.run('DELETE FROM views WHERE id = ?', [id]);
    return Promise.resolve();
  }

  listViews(): Promise<readonly View[]> {
    const rows = this.#db.all('SELECT * FROM views ORDER BY id');
    return Promise.resolve(rows.map((row) => rowToView(row as unknown as ViewRow)));
  }

  close(): Promise<void> {
    this.#db.close();
    return Promise.resolve();
  }
}
