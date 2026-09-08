import type { Logger } from './logger.js';

/**
 * VIEW-001g — first-run guidance. The per-sheet entry points (node typing,
 * "New Relationship…", "Relationships…") aren't broken, they're buried two
 * clicks deep in each sheet's "⋯ Toggle Controls" header dropdown. A new GM
 * has no way to discover the setup path. This module is the visible pointer
 * at what already exists — deliberately *not* a wizard or a tour library
 * (fragile against Foundry updates, and against ADR-0009's anti-dependency
 * posture):
 *
 *   1. a one-time welcome `DialogV2` on a fresh world (GM-only, gated by a
 *      world-scoped `game.settings` flag — "the world has been set up" is a
 *      world fact, and Alberto expects the module may be shared/published);
 *   2. the Codex navigator's inline guidance panel (rendered by
 *      `codex-sidebar-tab.ts`, using `GUIDANCE_STEPS` / `buildGuidancePanelHTML`
 *      from here); and
 *   3. a "Getting started" section in `README.md`.
 *
 * Everything HTML here is a pure builder; `maybeShowWelcomeDialog`'s
 * GM/dismissed gating is unit-tested against fakes. Flagged as glue: the
 * real `DialogV2.wait` call, `game.settings` round-tripping, and switching
 * the sidebar to the Codex tab all need a live client.
 */

export const ONBOARDING_NAMESPACE = 'archivexus';
export const ONBOARDING_SETTING_KEY = 'onboardingDismissed';

/**
 * The three setup steps — one source of truth shared by the welcome dialog
 * and the Codex inline panel. `body` is trusted HTML (authored here, no
 * interpolation), so both builders embed it verbatim.
 */
export const GUIDANCE_STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Type your key Nodes',
    body:
      'Open an Actor or Journal page, click the <strong>⋯</strong> menu in its header, ' +
      'and choose <em>“Archivexus Node Type”</em> (Character, City, Faction, …).',
  },
  {
    title: 'Connect two Nodes',
    body:
      'From that same <strong>⋯</strong> menu choose <em>“New Relationship…”</em> to link ' +
      'them (resides-in, ally-of, member-of, …). <em>“Relationships…”</em> lists what a ' +
      'Node already has.',
  },
  {
    title: 'See the graph',
    body:
      'Open the <strong>Codex</strong> sidebar tab and click <em>“Open graph ⧉”</em>, or ' +
      'click any Node in the list to open the graph rooted on it.',
  },
];

function stepsListHTML(): string {
  const items = GUIDANCE_STEPS.map(
    (step) => `<li><strong>${step.title}.</strong> ${step.body}</li>`,
  ).join('');
  return `<ol class="archivexus-guidance-steps">${items}</ol>`;
}

// ---------------------------------------------------------------------------
// Welcome dialog
// ---------------------------------------------------------------------------

export interface GuidanceCounts {
  readonly actorCount: number;
  readonly pageCount: number;
  readonly definitionCount: number;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Pure markup for the welcome dialog body — a single scrollable panel, no steps of its own. */
export function buildWelcomeDialogContent(counts: GuidanceCounts): string {
  return (
    `<div class="archivexus-welcome">` +
    `<p>Archivexus turns your world’s Actors and Journal pages into a connected ` +
    `knowledge graph — a <em>Codex</em> you can explore.</p>` +
    `<p><strong>Imported so far:</strong> ${plural(counts.actorCount, 'Actor')}, ` +
    `${plural(counts.pageCount, 'Journal page')}, and ` +
    `${plural(counts.definitionCount, 'relationship type')} to connect them with.</p>` +
    `<h3>Three steps to set up your world</h3>` +
    stepsListHTML() +
    `<p>You can reopen this from the Codex tab’s <em>“Getting started”</em> button any time.</p>` +
    `</div>`
  );
}

/**
 * Minimal structural subset of `foundry.applications.api.DialogV2.wait` —
 * `wait` (not `prompt`/`confirm`) because the welcome dialog has two
 * non-destructive choices and any close means "dismiss". `rejectClose:
 * false` resolves with `null` on a header-X / Escape close instead of
 * rejecting.
 */
export interface WelcomeDialogV2Like {
  wait(config: {
    window: { title: string };
    content: string;
    buttons: readonly { action: string; label: string; default?: boolean }[];
    rejectClose: boolean;
  }): Promise<string | null | undefined>;
}

/** Minimal structural subset of `game.settings` this module touches. */
export interface FoundrySettingsLike {
  register(namespace: string, key: string, data: Record<string, unknown>): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
}

/**
 * Registers the world-scoped dismissal flag. Call once at `init` (Foundry
 * requires settings registered before `ready`). `config: false` keeps it
 * out of the Settings UI — it's set programmatically, not by hand.
 */
export function registerOnboardingSetting(settings: FoundrySettingsLike): void {
  settings.register(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY, {
    name: 'Archivexus onboarding dismissed',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });
}

export interface MaybeShowWelcomeDialogDeps {
  readonly settings: FoundrySettingsLike;
  readonly isGM: boolean;
  readonly dialogV2: WelcomeDialogV2Like;
  readonly counts: GuidanceCounts;
  /** Called only when the GM picks the primary "Show me the Codex" button. */
  readonly showCodex: () => void;
  readonly log: Logger;
}

/**
 * Shows the welcome dialog once per world, to the GM only. Any resolution
 * — primary button, secondary button, or a plain close — marks it
 * dismissed and it never shows again ("never nag"). A `showCodex()` call is
 * the only extra effect, and only for the primary choice.
 */
export async function maybeShowWelcomeDialog(deps: MaybeShowWelcomeDialogDeps): Promise<void> {
  const { settings, isGM, dialogV2, counts, showCodex, log } = deps;
  if (!isGM) {
    return;
  }
  if (settings.get(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY) === true) {
    return;
  }

  let choice: string | null | undefined;
  try {
    choice = await dialogV2.wait({
      window: { title: 'Welcome to Archivexus' },
      content: buildWelcomeDialogContent(counts),
      buttons: [
        { action: 'codex', label: 'Show me the Codex', default: true },
        { action: 'dismiss', label: 'Dismiss' },
      ],
      rejectClose: false,
    });
  } catch (error) {
    // rejectClose:false should prevent this, but never let a dialog quirk
    // block the flag from being set — that's what causes the nag.
    log.warn(`Welcome dialog closed abnormally: ${errorMessage(error)}`);
  }

  try {
    await settings.set(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY, true);
  } catch (error) {
    log.error(`Failed to persist onboarding dismissal: ${errorMessage(error)}`);
  }

  if (choice === 'codex') {
    showCodex();
  }
}

// ---------------------------------------------------------------------------
// Codex inline guidance panel (rendered by codex-sidebar-tab.ts)
// ---------------------------------------------------------------------------

export interface GuidancePanelState {
  readonly nodeCount: number;
  readonly relationshipCount: number;
}

/**
 * The navigator's inline guidance panel — its proper empty state. Expanded
 * while the world has no authored Relationships, collapsed to a one-line
 * "▸ Getting started" toggle once at least one exists. The toggle and the
 * toolbar's "Getting started" button re-expand it (`codex-sidebar-tab.ts`
 * flips `[data-role="guidance-body"]`'s `hidden`).
 */
export function buildGuidancePanelHTML(state: GuidancePanelState): string {
  const collapsed = state.relationshipCount > 0;
  const countLine =
    `${plural(state.nodeCount, 'node')} · ` +
    `${plural(state.relationshipCount, 'relationship')} authored`;
  return (
    `<div class="archivexus-codex-guidance" data-role="guidance">` +
    `<button type="button" class="archivexus-codex-guidance-toggle" data-role="guidance-toggle" ` +
    `aria-expanded="${collapsed ? 'false' : 'true'}">` +
    `<span class="archivexus-codex-guidance-caret">${collapsed ? '▸' : '▾'}</span> Getting started` +
    `</button>` +
    `<div class="archivexus-codex-guidance-body" data-role="guidance-body"${collapsed ? ' hidden' : ''}>` +
    stepsListHTML() +
    `<p class="archivexus-codex-guidance-count">${countLine}</p>` +
    `</div>` +
    `</div>`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
