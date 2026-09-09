import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import { isVisibility } from '../../core/domain/visibility.js';

/**
 * ADAPT-016 / ADR-0015: a Foundry `Folder` the GM has tagged
 * (`flags.archivexus.nodeType`) becomes a Node, `id = folder.uuid`
 * (`Folder.<id>`). Pure and synchronous, a sibling of `mapActorToNode` /
 * `mapJournalEntryPageToNode` — no Foundry API calls.
 *
 * - `id` = `folder.uuid`; `title` = `folder.name`; `type` = the tag flag.
 *   A folder with no `flags.archivexus.nodeType` is simply not a Node and
 *   this function is never called for it (`isTaggedFolder` guards callers).
 * - Visibility: a Folder has **no `ownership`**, so there is nothing to
 *   translate through ADR-0003. It defaults to `hidden` (fail-closed —
 *   `createNode`'s own default — a world-structure folder routinely encodes
 *   spoilers, and the Codex filters `hidden` Nodes for non-GM viewers). A
 *   GM raises it with an explicit `flags.archivexus.visibility` override.
 * - The containment this Folder-Node introduces (edges to/from its tagged
 *   contents) is derived and reconciled by the ADAPT-017 engine, not here.
 */

export interface FoundryFolderLike {
  readonly uuid: string;
  readonly name: string;
  readonly flags?: {
    readonly archivexus?: {
      readonly nodeType?: string;
      /** `hidden` | `visible` | `owned` — overrides the fail-closed `hidden` default. */
      readonly visibility?: string;
      /** A RelationshipDefinition id overriding the type default for edges from this folder's contents. */
      readonly containmentRelationship?: string;
      /** The GM chose "this is a top-level concept" — suppress the auto edge to a tagged ancestor. */
      readonly containmentRoot?: boolean;
    };
  };
}

export const FOLDER_NODE_TYPE_FLAG_KEY = 'nodeType';

/** `true` iff this Folder has been tagged with an Archivexus Node type (and so is a Node). */
export function isTaggedFolder(folder: FoundryFolderLike): boolean {
  const type = folder.flags?.archivexus?.nodeType;
  return typeof type === 'string' && type.trim().length > 0;
}

/** Maps a **tagged** Foundry `Folder` to a Node. Callers must check `isTaggedFolder` first. */
export function mapFolderToNode(folder: FoundryFolderLike): Node {
  const type = (folder.flags?.archivexus?.nodeType ?? '').trim();
  const overrideVisibility = folder.flags?.archivexus?.visibility;

  const input: CreateNodeInput = {
    id: folder.uuid,
    type,
    title: folder.name,
    ...(isVisibility(overrideVisibility) ? { visibility: overrideVisibility } : {}),
  };

  return createNode(input);
}
