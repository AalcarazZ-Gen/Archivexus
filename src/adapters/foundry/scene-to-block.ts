import { createBlock, type Block } from '../../core/domain/block.js';

/**
 * ADAPT-018 / ADR-0015 point 13 — a Foundry `Scene` maps to a `scene` Block,
 * never to a Node of its own. **This is the answer to ADAPT-005 / issue #23**
 * (a Scene is a map/backdrop, not a knowledge concept): a Scene shows up in
 * the graph only as a Block on the place-Node whose folder contains it.
 *
 * Pure and synchronous — no Foundry API calls, a sibling of
 * `mapActorToNode` / `mapFolderToNode`. The reconciliation (which folder-Node
 * gets which Scene Blocks, and keeping that set current) is the ADAPT-017
 * engine's job — `folder-containment-sync.ts` — not this file.
 */

export interface FoundrySceneLike {
  readonly uuid: string;
  readonly name: string;
  /**
   * The Scene's containing Folder (`scene.folder`), with its ancestor
   * chain. `module-entry.ts` walks this to find the nearest **tagged**
   * folder, exactly as it does for Actors/pages — an untagged folder
   * between the Scene and a tagged place folder is transparent. `null`
   * when the Scene is at the directory root.
   */
  readonly folder?: {
    readonly uuid?: string;
    readonly ancestors?: readonly { readonly uuid: string }[];
  } | null;
}

/** The Block `type` string a Scene maps to (Foundry's own `documentName` is `Scene`, but Blocks use lowercase here per ADR-0015 point 13's own text). */
export const SCENE_BLOCK_TYPE = 'scene';

/** Maps a Foundry `Scene` to a `{ type: 'scene', uuid, title }` Block. */
export function mapSceneToBlock(scene: FoundrySceneLike): Block {
  return createBlock({ type: SCENE_BLOCK_TYPE, uuid: scene.uuid, title: scene.name });
}
