import type { GraphViewElement } from './graph-view-elements.js';

/**
 * Guarded, lazy, code-split Cytoscape.js loader — shared by every Foundry
 * surface that renders a graph (`codex-sidebar-tab.ts` today,
 * `graph-popout-window.ts` from VIEW-001b).
 *
 * **Why Cytoscape can't be a static `import` (VIEW-001a live finding,
 * Foundry v14.367):** Foundry v13+ locks `Array.prototype.equals` (plus
 * `deepFlatten`/`filterJoin`/`findSplice`/`partition`) as non-writable,
 * non-configurable. Cytoscape's collection prototype is
 * `Object.create(Array.prototype)` and `Object.assign`s its own `equals`
 * onto it during module evaluation → an uncatchable `TypeError` that kills
 * the whole module bundle at load. `ensureCytoscape` loads Cytoscape via a
 * dynamic `import()` (its own code-split chunk, off the synchronous load
 * path) with a defensive `Object.assign` swapped in only for the duration
 * of Cytoscape's evaluation.
 *
 * Minimal structural types over the real Cytoscape API — `tsconfig.json`
 * omits the DOM lib and this package takes no `@types/cytoscape` dependency
 * (Cytoscape ships its own types, but importing them would pull the DOM
 * lib in transitively); same cast-through-`unknown` tradeoff as
 * `sqlite-executor.ts` and the Foundry ambient globals.
 */

export interface CytoscapeCollectionLike {
  readonly length: number;
  remove(): unknown;
  addClass(className: string): unknown;
  removeClass(className: string): unknown;
}

export interface CytoscapeLayoutLike {
  run(): unknown;
}

export interface CytoscapeCoreLike {
  add(elements: readonly GraphViewElement[]): unknown;
  elements(selector?: string): CytoscapeCollectionLike;
  nodes(selector?: string): CytoscapeCollectionLike;
  edges(selector?: string): CytoscapeCollectionLike;
  getElementById(id: string): CytoscapeCollectionLike;
  layout(options: Record<string, unknown>): CytoscapeLayoutLike;
  on(
    event: string,
    selector: string,
    handler: (event: {
      readonly target: { id(): string };
      readonly originalEvent?: { clientX?: number; clientY?: number; preventDefault?(): void };
    }) => void,
  ): void;
  resize(): unknown;
  fit(): unknown;
  destroy(): void;
}

export type CytoscapeFactory = (options: Record<string, unknown>) => CytoscapeCoreLike;

let cytoscapeFactory: CytoscapeFactory | undefined;
let cytoscapeLoad: Promise<CytoscapeFactory> | undefined;

/**
 * A drop-in `Object.assign` that, when the stock assignment would throw a
 * `TypeError` (setting a key that resolves to a non-writable *inherited*
 * data property — exactly Cytoscape's `equals`-onto-`Array.prototype`
 * collision), instead defines an own, writable property that shadows the
 * inherited one. Behaviour is otherwise identical to `Object.assign`.
 */
function defensiveAssign(target: object, ...sources: unknown[]): object {
  for (const source of sources) {
    if (source === null || source === undefined) {
      continue;
    }
    const src = source as Record<PropertyKey, unknown>;
    const isEnumerable = (key: PropertyKey): boolean =>
      Object.prototype.propertyIsEnumerable.call(src, key);
    const keys: PropertyKey[] = [
      ...Object.keys(src),
      ...Object.getOwnPropertySymbols(src).filter(isEnumerable),
    ];
    for (const key of keys) {
      try {
        (target as Record<PropertyKey, unknown>)[key] = src[key];
      } catch {
        Object.defineProperty(target, key, {
          value: src[key],
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }
  return target;
}

/** Loads Cytoscape once (memoized). Safe to call before a Foundry client exists — it's a plain dynamic import of an npm package. */
export async function ensureCytoscape(): Promise<CytoscapeFactory> {
  if (cytoscapeFactory) {
    return cytoscapeFactory;
  }
  if (!cytoscapeLoad) {
    cytoscapeLoad = (async () => {
      const realAssign = Object.assign;
      // Swap in the defensive assign only while Cytoscape's module body
      // evaluates: it captures `Object.assign` once, at eval time
      // (`be = Object.assign.bind(Object)`), so the patch must be live
      // across the dynamic import and torn down straight after.
      (Object as { assign: typeof Object.assign }).assign =
        defensiveAssign as unknown as typeof Object.assign;
      try {
        const mod = (await import('cytoscape')) as { default?: unknown };
        cytoscapeFactory = (mod.default ?? mod) as unknown as CytoscapeFactory;
        return cytoscapeFactory;
      } finally {
        (Object as { assign: typeof Object.assign }).assign = realAssign;
      }
    })();
  }
  return cytoscapeLoad;
}

/** The loaded factory, or `undefined` if `ensureCytoscape()` hasn't resolved yet. Lets a synchronous render path bail cleanly rather than await. */
export function getLoadedCytoscape(): CytoscapeFactory | undefined {
  return cytoscapeFactory;
}

/**
 * `cose` (force-directed) needs edges to push nodes apart — a graph with
 * none collapses into a single column (seen live: 102 nodes, 0
 * relationships). Fall back to a grid until there's something to lay out;
 * an explicit `layoutName` (from the popout's layout picker) always wins.
 */
export function layoutFor(edgeCount: number, layoutName?: string): Record<string, unknown> {
  if (layoutName && layoutName !== 'auto') {
    return { name: layoutName, animate: false, fit: true, padding: 24 };
  }
  return edgeCount === 0
    ? { name: 'grid', fit: true, padding: 24 }
    : { name: 'cose', animate: false, fit: true, padding: 24 };
}

export const CYTOSCAPE_STYLE: readonly Record<string, unknown>[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-size': 11,
      'min-zoomed-font-size': 8,
      'text-wrap': 'ellipsis',
      'text-max-width': 120,
      'background-color': '#6b7bb3',
      color: '#e8e8e8',
      'text-valign': 'bottom',
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      'font-size': 8,
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'line-color': '#8a8a8a',
      'target-arrow-color': '#8a8a8a',
      color: '#b8b8b8',
      'text-rotation': 'autorotate',
    },
  },
  {
    selector: 'node.archivexus-selected',
    style: {
      'background-color': '#e0a54b',
      'border-width': 3,
      'border-color': '#f5d089',
    },
  },
  // VIEW-001e — a synthetic cluster node. `[?isCluster]` matches truthy.
  // When expanded it's a compound parent (translucent box holding members);
  // when collapsed (`[?collapsed]`) it's a solid pill you tap to open.
  {
    selector: 'node[?isCluster]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#3a3f52',
      'background-opacity': 0.22,
      'border-width': 2,
      'border-style': 'dashed',
      'border-color': '#8a93c0',
      color: '#d7dbf0',
      'font-size': 11,
      'font-weight': 'bold',
      'text-valign': 'top',
      'text-halign': 'center',
      padding: 14,
    },
  },
  {
    selector: 'node[?collapsed]',
    style: {
      shape: 'round-rectangle',
      'background-opacity': 0.9,
      'background-color': '#4a5170',
      'text-valign': 'center',
      padding: 8,
    },
  },
  {
    selector: 'edge[source *= "ax-cluster:"], edge[target *= "ax-cluster:"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#8a93c0',
      'target-arrow-shape': 'none',
      width: 1,
    },
  },
];
