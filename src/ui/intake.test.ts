// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { DecisionInput } from '../bridge/messages';
import { createIntake, ideaDecision } from './intake';
import { EnvironmentSync, NEW_WORLD_MESSAGE } from '../game/environmentSync';
import { starterEnvironment } from '../game/starterEnvironment';
import type { LoadResult } from '../game/environmentLoader';

describe('ideaDecision', () => {
  it('builds a new_game_idea decision containing the idea text and genre', () => {
    const decision: DecisionInput = ideaDecision('a ninja cat in a candy world');
    expect(decision).toEqual({
      type: 'new_game_idea',
      payload: { idea: 'a ninja cat in a candy world', genre: 'platformer' },
    });
  });
});

function makeSyncDeps(overrides: Partial<ConstructorParameters<typeof EnvironmentSync>[0]> = {}) {
  const applied: unknown[] = [];
  const announced: string[] = [];
  const autosaves: number[] = [];
  const deps = {
    fetchEnvironment: async (): Promise<LoadResult> => ({
      environment: starterEnvironment,
      source: 'loaded' as const,
    }),
    applyEnvironment: (environment: unknown) => applied.push(environment),
    isPlayTestActive: () => false,
    autosave: async () => {
      autosaves.push(1);
    },
    announce: (message: string) => announced.push(message),
    hasProgress: () => false,
    ...overrides,
  };
  return { deps, applied, announced, autosaves };
}

describe('EnvironmentSync', () => {
  it('an environment_updated message triggers a runtime refetch and apply — no reload', async () => {
    const { deps, applied, autosaves } = makeSyncDeps();
    const sync = new EnvironmentSync(deps);
    await sync.onEnvironmentUpdated();
    expect(applied).toHaveLength(1);
    expect(autosaves).toHaveLength(1);
  });

  it('defers the swap while a play test is active and applies it when it ends', async () => {
    let playing = true;
    const { deps, applied } = makeSyncDeps({ isPlayTestActive: () => playing });
    const sync = new EnvironmentSync(deps);
    await sync.onEnvironmentUpdated();
    expect(applied).toHaveLength(0);
    expect(sync.hasPendingSwap()).toBe(true);

    playing = false;
    await sync.onPlayTestEnded();
    expect(applied).toHaveLength(1);
    expect(sync.hasPendingSwap()).toBe(false);
  });

  it('announces the new world when the child already made progress', async () => {
    const { deps, announced } = makeSyncDeps({ hasProgress: () => true });
    await new EnvironmentSync(deps).onEnvironmentUpdated();
    expect(announced).toEqual([NEW_WORLD_MESSAGE]);
  });

  it('keeps the current world when the announced update is broken', async () => {
    const { deps, applied } = makeSyncDeps({
      fetchEnvironment: async () => ({
        environment: starterEnvironment,
        source: 'fallback' as const,
        kidMessage: 'scrambled',
      }),
    });
    await new EnvironmentSync(deps).onEnvironmentUpdated();
    expect(applied).toHaveLength(0);
  });
});

describe('intake screen', () => {
  it('shows six genres with only platformer selectable', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    createIntake(container, { onSubmit: vi.fn(async () => {}) });

    const cards = [...container.querySelectorAll<HTMLButtonElement>('.genre-card')];
    expect(cards).toHaveLength(6);
    const enabled = cards.filter((card) => !card.disabled);
    expect(enabled).toHaveLength(1);
    expect(enabled[0].dataset.genre).toBe('platformer');
    expect(cards.filter((card) => card.disabled)).toHaveLength(5);
  });

  it('lists saved games and loads one on click', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onLoadSave = vi.fn();
    createIntake(container, {
      onSubmit: vi.fn(async () => {}),
      onLoadSave,
      saves: [
        {
          id: 'game-1',
          idea: 'space cats',
          title: 'Space Cats World',
          savedAt: '2026-08-15T10:00:00.000Z',
          completedChallenges: 3,
        },
      ],
    });
    const card = container.querySelector<HTMLButtonElement>('.saved-game-card')!;
    expect(card.textContent).toContain('Space Cats World');
    expect(card.textContent).toContain('3 challenges done');
    card.click();
    expect(onLoadSave).toHaveBeenCalledWith('game-1');
  });

  it('hides the saved games section when there are none', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    createIntake(container, { onSubmit: vi.fn(async () => {}), saves: [] });
    expect(container.querySelector<HTMLElement>('.saved-games')!.hidden).toBe(true);
  });

  it('submits the typed idea', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onSubmit = vi.fn(async () => {});
    createIntake(container, { onSubmit });

    container.querySelector('textarea')!.value = 'dragon bakery';
    container.querySelector<HTMLButtonElement>('button.kid-button')!.click();
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith('dragon bakery');
  });
});
