import type { Node } from '../domain/node.js';
import type { Relationship } from '../domain/relationship.js';
import type { View } from '../domain/view.js';

/**
 * The contract Core (and, through it, any Adapter) programs against for
 * persistence — never a concrete engine. This is the "port" side of
 * `01_ARCHITECTURE.md`'s "Storage is replaceable" / "Changing storage must
 * not affect the Core": the SQLite-backed implementation
 * (`src/storage/sqlite/`) satisfies this interface, but nothing in Core or
 * the Foundry Adapter should ever import that implementation directly —
 * only this shape.
 *
 * Covers Node/Relationship CRUD plus ADR-0007's required 1-hop neighbor
 * lookup (STORE-003), and View CRUD (CORE-006, `decisions/ADR-0014-graph-view-sidebar-tab.md`
 * points 6-7). Does not expose the N-hop composition/category filtering
 * ADR-0007 assigns to Core's own Query API — `getRelationshipsForNode` is
 * the 1-hop primitive `src/core/query/traversal.ts` (CORE-005) composes on
 * top of, not a replacement for it.
 *
 * Every method is async: the concrete SQLite engine runs across a Worker
 * boundary (OPFS `SyncAccessHandle`s only work inside a dedicated Worker —
 * see ADR-0008), so even though the engine itself executes synchronously
 * once inside that Worker, the contract Core/Adapters see must always be
 * Promise-based.
 */
export interface StorageProvider {
  /**
   * Prepares the store for use — for SQLite, this means running pending
   * `PRAGMA user_version`-tracked migrations (ADR-0008 point 3). Must be
   * called (and awaited) before any other method; implementations may
   * throw if it wasn't.
   */
  init(): Promise<void>;

  /** Inserts or fully overwrites the Node with this id (upsert by id). */
  saveNode(node: Node): Promise<void>;
  /** Looks up a Node by id, or `undefined` if none exists. */
  getNode(id: string): Promise<Node | undefined>;
  /**
   * Deletes a Node by id. Deliberately does **not** cascade to
   * Relationships that reference it as origin/target — ADR-0007 point 8 /
   * ADR-0008 point 2 require a Relationship to survive deletion of either
   * endpoint ("History is Part of the World"). Callers must not add their
   * own cascading delete on top of this.
   */
  deleteNode(id: string): Promise<void>;
  /** All Nodes currently stored, in an unspecified but stable order. */
  listNodes(): Promise<readonly Node[]>;

  /** Inserts or fully overwrites the Relationship with this id (upsert by id). */
  saveRelationship(relationship: Relationship): Promise<void>;
  /** Looks up a Relationship by id, or `undefined` if none exists. */
  getRelationship(id: string): Promise<Relationship | undefined>;
  /** Deletes a Relationship by id. */
  deleteRelationship(id: string): Promise<void>;
  /** All Relationships currently stored, in an unspecified but stable order. */
  listRelationships(): Promise<readonly Relationship[]>;

  /**
   * ADR-0007's required 1-hop lookup: every Relationship whose origin OR
   * target equals `nodeId`, via a real index (see
   * `src/storage/sqlite/migration.ts`) — never a full scan. Includes
   * Relationships pointing at `nodeId` from either direction; the caller
   * decides how to interpret direction. May return Relationships whose
   * *other* endpoint no longer resolves to an existing Node (a dangling
   * reference is valid data, not an error — ADR-0007 point 8); this
   * method doesn't filter those out, since it has no Node-existence
   * context of its own without a second lookup the caller may not need.
   */
  getRelationshipsForNode(nodeId: string): Promise<readonly Relationship[]>;

  /** Inserts or fully overwrites the View with this id (upsert by id). */
  saveView(view: View): Promise<void>;
  /** Looks up a View by id, or `undefined` if none exists. */
  getView(id: string): Promise<View | undefined>;
  /**
   * Deletes a View by id. A View referencing a since-deleted
   * Node/Relationship is not this method's concern in either direction:
   * deleting a View never touches the Nodes/Relationships its `spec`
   * names, and (per ADR-0014 point 7, same no-cascade reasoning as
   * ADR-0007 point 8 for Relationship endpoints) deleting a Node or
   * Relationship never deletes or blocks a View that references it — the
   * View just resolves fewer results on its next open.
   */
  deleteView(id: string): Promise<void>;
  /** All Views currently stored, in an unspecified but stable order. */
  listViews(): Promise<readonly View[]>;

  /** Releases underlying resources (e.g. closes the SQLite handle / terminates the Worker). */
  close(): Promise<void>;
}
