import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';
import {
  buildGuidancePanelHTML,
  buildWelcomeDialogContent,
  GUIDANCE_STEPS,
  maybeShowWelcomeDialog,
  ONBOARDING_NAMESPACE,
  ONBOARDING_SETTING_KEY,
  registerOnboardingSetting,
  type FoundrySettingsLike,
  type WelcomeDialogV2Like,
} from './first-run-guidance.js';

const log = createLogger('archivexus-test');

function fakeSettings(initial?: unknown): FoundrySettingsLike & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  if (initial !== undefined) {
    store.set(`${ONBOARDING_NAMESPACE}.${ONBOARDING_SETTING_KEY}`, initial);
  }
  return {
    store,
    register: vi.fn(),
    get: (namespace, key) => store.get(`${namespace}.${key}`),
    set: vi.fn(async (namespace, key, value) => {
      store.set(`${namespace}.${key}`, value);
    }),
  };
}

const counts = { actorCount: 41, pageCount: 61, definitionCount: 17 };

describe('GUIDANCE_STEPS', () => {
  it('is the three setup steps, each with a title and body', () => {
    expect(GUIDANCE_STEPS).toHaveLength(3);
    for (const step of GUIDANCE_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });
});

describe('buildWelcomeDialogContent', () => {
  it('names the imported counts and embeds the three steps', () => {
    const html = buildWelcomeDialogContent(counts);
    expect(html).toContain('41 Actors');
    expect(html).toContain('61 Journal pages');
    expect(html).toContain('17 relationship types');
    for (const step of GUIDANCE_STEPS) {
      expect(html).toContain(step.title);
    }
  });

  it('uses singular nouns for a count of one', () => {
    const html = buildWelcomeDialogContent({ actorCount: 1, pageCount: 1, definitionCount: 1 });
    expect(html).toContain('1 Actor,');
    expect(html).toContain('1 Journal page,');
    expect(html).toContain('1 relationship type ');
  });
});

describe('registerOnboardingSetting', () => {
  it('registers a world-scoped, hidden boolean flag', () => {
    const settings = fakeSettings();
    registerOnboardingSetting(settings);
    expect(settings.register).toHaveBeenCalledWith(
      ONBOARDING_NAMESPACE,
      ONBOARDING_SETTING_KEY,
      expect.objectContaining({ scope: 'world', config: false, type: Boolean, default: false }),
    );
  });
});

describe('maybeShowWelcomeDialog', () => {
  function fakeDialog(resolvesTo: string | null): WelcomeDialogV2Like & { wait: ReturnType<typeof vi.fn> } {
    return { wait: vi.fn(async () => resolvesTo) };
  }

  it('does nothing for a non-GM viewer', async () => {
    const settings = fakeSettings();
    const dialogV2 = fakeDialog('codex');
    const showCodex = vi.fn();
    await maybeShowWelcomeDialog({ settings, isGM: false, dialogV2, counts, showCodex, log });
    expect(dialogV2.wait).not.toHaveBeenCalled();
    expect(settings.set).not.toHaveBeenCalled();
    expect(showCodex).not.toHaveBeenCalled();
  });

  it('does nothing when the flag is already set', async () => {
    const settings = fakeSettings(true);
    const dialogV2 = fakeDialog('codex');
    const showCodex = vi.fn();
    await maybeShowWelcomeDialog({ settings, isGM: true, dialogV2, counts, showCodex, log });
    expect(dialogV2.wait).not.toHaveBeenCalled();
    expect(showCodex).not.toHaveBeenCalled();
  });

  it('shows the dialog and marks it dismissed for a fresh GM world', async () => {
    const settings = fakeSettings();
    const dialogV2 = fakeDialog('codex');
    const showCodex = vi.fn();
    await maybeShowWelcomeDialog({ settings, isGM: true, dialogV2, counts, showCodex, log });
    expect(dialogV2.wait).toHaveBeenCalledOnce();
    expect(settings.get(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY)).toBe(true);
    expect(showCodex).toHaveBeenCalledOnce();
  });

  it('marks it dismissed but does not open the Codex for the secondary choice', async () => {
    const settings = fakeSettings();
    const showCodex = vi.fn();
    await maybeShowWelcomeDialog({
      settings,
      isGM: true,
      dialogV2: fakeDialog('dismiss'),
      counts,
      showCodex,
      log,
    });
    expect(settings.get(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY)).toBe(true);
    expect(showCodex).not.toHaveBeenCalled();
  });

  it('marks it dismissed on a plain close (null)', async () => {
    const settings = fakeSettings();
    const showCodex = vi.fn();
    await maybeShowWelcomeDialog({
      settings,
      isGM: true,
      dialogV2: fakeDialog(null),
      counts,
      showCodex,
      log,
    });
    expect(settings.get(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY)).toBe(true);
    expect(showCodex).not.toHaveBeenCalled();
  });

  it('still marks it dismissed if the dialog rejects', async () => {
    const settings = fakeSettings();
    const showCodex = vi.fn();
    await maybeShowWelcomeDialog({
      settings,
      isGM: true,
      dialogV2: { wait: vi.fn(async () => Promise.reject(new Error('boom'))) },
      counts,
      showCodex,
      log,
    });
    expect(settings.get(ONBOARDING_NAMESPACE, ONBOARDING_SETTING_KEY)).toBe(true);
    expect(showCodex).not.toHaveBeenCalled();
  });

  it('does not throw if persisting the flag fails', async () => {
    const settings: FoundrySettingsLike = {
      register: vi.fn(),
      get: () => false,
      set: vi.fn(async () => Promise.reject(new Error('no write'))),
    };
    await expect(
      maybeShowWelcomeDialog({
        settings,
        isGM: true,
        dialogV2: fakeDialog('codex'),
        counts,
        showCodex: vi.fn(),
        log,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('buildGuidancePanelHTML', () => {
  it('is expanded with no authored relationships (the navigator empty state)', () => {
    const html = buildGuidancePanelHTML({ nodeCount: 102, relationshipCount: 0 });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('▾');
    expect(html).not.toContain('data-role="guidance-body" hidden');
    expect(html).toContain('102 nodes · 0 relationships authored');
    for (const step of GUIDANCE_STEPS) {
      expect(html).toContain(step.title);
    }
  });

  it('is collapsed once at least one relationship exists', () => {
    const html = buildGuidancePanelHTML({ nodeCount: 1, relationshipCount: 3 });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('▸');
    expect(html).toContain('data-role="guidance-body" hidden');
    expect(html).toContain('1 node · 3 relationships authored');
  });
});
