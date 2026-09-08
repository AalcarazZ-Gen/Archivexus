/**
 * Whether the current Foundry viewer is a Gamemaster — `false` (the safe
 * default: show only non-`hidden` Nodes, ADR-0003) when `game.user` isn't
 * resolvable yet (before Foundry's setup phase).
 *
 * Separate from `graph-view-elements.ts`'s `filterNodesForViewer`, which
 * takes `{ isGM }` explicitly to stay pure — this is the one-line glue that
 * reads the live global, shared by the sidebar tab and the graph popout.
 */
export function isViewerGM(): boolean {
  return (game as { user?: { isGM?: boolean } }).user?.isGM === true;
}
