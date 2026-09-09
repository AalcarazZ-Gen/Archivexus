import type { NodeType } from '../../core/domain/node.js';
import { mapActorToNode, type FoundryActorLike } from './actor-to-node.js';
import { isTaggedFolder, mapFolderToNode, type FoundryFolderLike } from './folder-to-node.js';
import {
  mapJournalEntryPageToNode,
  type FoundryJournalEntryPageLike,
} from './journal-entry-page-to-node.js';

/**
 * Node-type resolution for the two entities dropped into the
 * Relationship-authoring window (ADAPT-007, ADR-0010 point 3): "the window
 * resolves that document's would-be Node synchronously and purely, exactly
 * the way `mapActorToNode`/`mapJournalEntryPageToNode` already compute it
 * ... not a new classification rule, and not a storage read." This module
 * is deliberately thin glue over those two existing pure mappings — the
 * only new logic here is picking *which* mapping applies, based on the
 * dropped document's Foundry `documentName` ("Actor" / "JournalEntryPage" /
 * anything else), and turning an unsupported type into the exact kind of
 * clear inline error ADR-0010 point 2 asks for, rather than a hidden/wrong
 * classification.
 */

export const SUPPORTED_DOCUMENT_KINDS = ['Actor', 'JournalEntryPage', 'Folder'] as const;
export type SupportedDocumentKind = (typeof SUPPORTED_DOCUMENT_KINDS)[number];

/** What the authoring window needs to know about a successfully resolved endpoint. */
export interface ResolvedDroppedNode {
  /** The would-be Node's id — always the dropped document's own `uuid` (ADR-0001), no lookup needed. */
  readonly nodeId: string;
  readonly nodeType: NodeType;
  readonly title: string;
  readonly documentKind: SupportedDocumentKind;
}

export type ResolveDroppedNodeResult =
  | { readonly ok: true; readonly node: ResolvedDroppedNode }
  | { readonly ok: false; readonly error: string };

/**
 * Resolves a dropped/pasted document's would-be Node, or a clear inline
 * error when `documentName` isn't one of the two Node-backing document
 * types ADAPT-001/ADAPT-004 support (ADR-0010 point 2's exact example:
 * "Scenes and Items aren't Nodes yet — drop an Actor or a Journal Page.").
 *
 * `documentName` is Foundry's own document-class discriminator (every
 * Foundry Document exposes it, e.g. `Actor.documentName === 'Actor'`) —
 * the caller (the live window, resolving a `<document-tags>` UUID via
 * `fromUuid`) supplies it rather than this function inferring it, keeping
 * this pure and testable with plain fixtures, same tradeoff as
 * `FoundryActorLike`/`FoundryJournalEntryPageLike` themselves.
 */
export function resolveDroppedDocumentNode(
  documentName: string,
  document: FoundryActorLike | FoundryJournalEntryPageLike | FoundryFolderLike,
): ResolveDroppedNodeResult {
  if (documentName === 'Actor') {
    const node = mapActorToNode(document as FoundryActorLike);
    return {
      ok: true,
      node: { nodeId: node.id, nodeType: node.type, title: node.title, documentKind: 'Actor' },
    };
  }

  if (documentName === 'JournalEntryPage') {
    const node = mapJournalEntryPageToNode(document as FoundryJournalEntryPageLike);
    return {
      ok: true,
      node: {
        nodeId: node.id,
        nodeType: node.type,
        title: node.title,
        documentKind: 'JournalEntryPage',
      },
    };
  }

  if (documentName === 'Folder') {
    const folder = document as FoundryFolderLike;
    // A Folder is only a Node once the GM has tagged it (ADR-0015). An
    // untagged folder gets the same clear inline error a Scene/Item does.
    if (!isTaggedFolder(folder)) {
      return {
        ok: false,
        error: `That folder isn't an Archivexus Node yet — right-click it and pick "Archivexus Node Type" first.`,
      };
    }
    const node = mapFolderToNode(folder);
    return {
      ok: true,
      node: { nodeId: node.id, nodeType: node.type, title: node.title, documentKind: 'Folder' },
    };
  }

  return {
    ok: false,
    error: `Scenes and Items aren't Nodes yet — drop an Actor, a Journal Page, or a tagged Folder. (Got "${documentName}".)`,
  };
}
