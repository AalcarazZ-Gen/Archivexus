import { afterEach, describe, expect, it } from 'vitest';
import {
  ARCHIVEXUS_CSS,
  buildCytoscapeStyle,
  categoryEdgeColor,
  CATEGORY_EDGE_COLORS,
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  ensureArchivexusStyles,
  NODE_TYPE_COLORS,
  nodeTypeColor,
} from './archivexus-styles.js';
import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import { RELATIONSHIP_TRAVERSAL_CATEGORIES } from '../../core/domain/relationship-definition.js';

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('ensureArchivexusStyles', () => {
  it('is a no-op without a document, and injects exactly one <style> however many times it is called', () => {
    expect(() => ensureArchivexusStyles()).not.toThrow();

    const appended: { id: string; textContent: string }[] = [];
    const byId = new Map<string, unknown>();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => byId.get(id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: {
        appendChild: (n: { id: string; textContent: string }) => {
          appended.push(n);
          byId.set(n.id, n);
        },
      },
    };
    ensureArchivexusStyles();
    ensureArchivexusStyles();
    ensureArchivexusStyles();
    expect(appended).toHaveLength(1);
    expect(appended[0]?.id).toBe('archivexus-styles');
    expect(appended[0]?.textContent).toBe(ARCHIVEXUS_CSS);
  });
});

describe('ARCHIVEXUS_CSS', () => {
  it('defines the token layer on .archivexus and keeps every rule scoped (no global selectors)', () => {
    expect(ARCHIVEXUS_CSS).toContain('.archivexus {');
    expect(ARCHIVEXUS_CSS).toContain('--ax-accent:');
    // Strip comments, then every rule's selector list must mention `.archivexus`.
    const cssNoComments = ARCHIVEXUS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const chunk of cssNoComments.split('}')) {
      const selector = chunk.split('{')[0]?.trim();
      if (!selector || selector.startsWith('@') || selector.startsWith('--')) continue;
      expect(selector).toContain('.archivexus');
    }
  });

  it('carries the migrated per-surface prefixes (one source, not five)', () => {
    for (const prefix of [
      '.archivexus-codex',
      '.ax-gp-',
      '.archivexus-console',
      '.archivexus-def-',
      '.archivexus-rel-',
      '.ax-codex-views',
    ]) {
      expect(ARCHIVEXUS_CSS).toContain(prefix);
    }
  });

  it('the preset toggle is a real segmented control, not the old underline', () => {
    expect(ARCHIVEXUS_CSS).not.toContain('text-decoration: underline');
    expect(ARCHIVEXUS_CSS).toContain('.ax-segmented button[aria-pressed="true"]');
    expect(ARCHIVEXUS_CSS).toMatch(/\.ax-segmented button\[aria-pressed="true"\][^}]*background/);
  });

  it('carries the .ax-btn plain-button primitive with a hover and a disabled state', () => {
    expect(ARCHIVEXUS_CSS).toContain('.archivexus .ax-btn {');
    expect(ARCHIVEXUS_CSS).toMatch(/\.archivexus \.ax-btn:hover/);
    expect(ARCHIVEXUS_CSS).toMatch(/\.archivexus \.ax-btn:disabled/);
  });

  it('carries the .ax-select primitive for toolbar dropdowns', () => {
    expect(ARCHIVEXUS_CSS).toContain('.archivexus .ax-select {');
  });

  it('normalises the datalist input dropdown indicator (ADAPT-023)', () => {
    expect(ARCHIVEXUS_CSS).toContain('.archivexus input[list]');
    expect(ARCHIVEXUS_CSS).toContain('::-webkit-calendar-picker-indicator');
  });
});

describe('node / edge colour maps', () => {
  it('has a hue for every KNOWN_NODE_TYPE and falls back for an invented one', () => {
    for (const type of KNOWN_NODE_TYPES) {
      expect(nodeTypeColor(type)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(NODE_TYPE_COLORS[type]).toBeDefined();
    }
    expect(nodeTypeColor('GmInventedType')).toBe(DEFAULT_NODE_COLOR);
  });

  it('has a hue for every traversalCategory and falls back for unknown/undefined', () => {
    for (const category of RELATIONSHIP_TRAVERSAL_CATEGORIES) {
      expect(categoryEdgeColor(category)).toBe(CATEGORY_EDGE_COLORS[category]);
    }
    expect(categoryEdgeColor(undefined)).toBe(DEFAULT_EDGE_COLOR);
    expect(categoryEdgeColor('other')).toBe(DEFAULT_EDGE_COLOR);
  });
});

describe('buildCytoscapeStyle', () => {
  it('emits a per-node-type and per-category selector, plus cluster + selected rules', () => {
    const style = buildCytoscapeStyle('dark');
    const selectors = style.map((rule) => rule.selector);
    expect(selectors).toContain('node[nodeType = "City"]');
    expect(selectors).toContain('edge[category = "affiliation"]');
    expect(selectors).toContain('node.archivexus-selected');
    expect(selectors).toContain('node[?isCluster]');
  });

  it('swaps the label plate between light and dark so labels stay legible', () => {
    const darkNode = buildCytoscapeStyle('dark').find((r) => r.selector === 'node');
    const lightNode = buildCytoscapeStyle('light').find((r) => r.selector === 'node');
    const darkPlate = (darkNode?.style as Record<string, unknown>)['text-background-color'];
    const lightPlate = (lightNode?.style as Record<string, unknown>)['text-background-color'];
    expect(darkPlate).not.toBe(lightPlate);
    // the node style carries a label plate at all (the "labels overlap" fix)
    expect(darkPlate).toBeTruthy();
  });
});
