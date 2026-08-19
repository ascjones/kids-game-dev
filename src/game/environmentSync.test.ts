import { describe, expect, it, vi } from 'vitest';
import {
  EnvironmentSync,
  NEW_WORLD_MESSAGE,
  resolveBootEnvironment,
  swapWorldForChallenge,
  type EnvironmentSyncDeps,
} from './environmentSync';
import { starterEnvironment } from './starterEnvironment';
import type { Environment } from './environmentSchema';
import type { LoadResult } from './environmentLoader';

const wideWorld: Environment = {
  ...starterEnvironment,
  title: 'The Long Run',
  world: { width: 2400, height: 480 },
};

const harnessWorld: Environment = {
  ...starterEnvironment,
  title: 'Harness World',
};

function makeSync(overrides: Partial<EnvironmentSyncDeps> = {}) {
  const applied: Environment[] = [];
  const announced: string[] = [];
  const order: string[] = [];
  const deps: EnvironmentSyncDeps = {
    fetchEnvironment: async () => ({ environment: harnessWorld, source: 'loaded' }),
    applyEnvironment: (environment) => {
      order.push('apply');
      applied.push(environment);
    },
    isPlayTestActive: () => false,
    autosave: async () => {
      order.push('autosave');
    },
    announce: (message) => announced.push(message),
    hasProgress: () => true,
    ...overrides,
  };
  return { sync: new EnvironmentSync(deps), applied, announced, order };
}

describe('challenge-carried world application', () => {
  it('applies the world it was handed instead of refetching the harness file', async () => {
    const fetchEnvironment = vi.fn(
      async (): Promise<LoadResult> => ({ environment: harnessWorld, source: 'loaded' }),
    );
    const { sync, applied } = makeSync({ fetchEnvironment });

    await sync.applyChallengeEnvironment(wideWorld);

    expect(fetchEnvironment).not.toHaveBeenCalled();
    expect(applied).toEqual([wideWorld]);
  });

  it('autosaves before the world changes under the child', async () => {
    const { sync, order } = makeSync();
    await sync.applyChallengeEnvironment(wideWorld);
    expect(order).toEqual(['autosave', 'apply']);
  });

  it('announces the swap only when there was progress to carry over', async () => {
    const withProgress = makeSync();
    await withProgress.sync.applyChallengeEnvironment(wideWorld);
    expect(withProgress.announced).toEqual([NEW_WORLD_MESSAGE]);

    const fresh = makeSync({ hasProgress: () => false });
    await fresh.sync.applyChallengeEnvironment(wideWorld);
    expect(fresh.announced).toEqual([]);
  });
});

describe('swapWorldForChallenge ordering', () => {
  function recorder(playing: boolean) {
    const order: string[] = [];
    let isPlaying = playing;
    return {
      order,
      deps: {
        isPlayTestActive: () => isPlaying,
        cancelPlayTest: () => {
          isPlaying = false;
          order.push('cancel');
        },
        startPlayTest: () => {
          isPlaying = true;
          order.push('start');
        },
        applyEnvironment: async () => {
          order.push('apply-begin');
          await Promise.resolve();
          order.push('apply-end');
        },
      },
    };
  }

  it('cancels the session, finishes the swap, then restarts play', async () => {
    const { order, deps } = recorder(true);
    await swapWorldForChallenge(wideWorld, deps);
    expect(order).toEqual(['cancel', 'apply-begin', 'apply-end', 'start']);
  });

  it('applies without touching play when no session is running', async () => {
    const { order, deps } = recorder(false);
    await swapWorldForChallenge(wideWorld, deps);
    expect(order).toEqual(['apply-begin', 'apply-end']);
  });

  it('with no world to apply, a running session just restarts for the new challenge', async () => {
    const { order, deps } = recorder(true);
    await swapWorldForChallenge(null, deps);
    expect(order).toEqual(['start']);
  });

  it('with no world and no session, nothing happens', async () => {
    const { order, deps } = recorder(false);
    await swapWorldForChallenge(null, deps);
    expect(order).toEqual([]);
  });
});

describe('boot environment precedence (KTD4)', () => {
  const fetched: LoadResult = { environment: harnessWorld, source: 'loaded' };

  it('prefers the harness file when no challenge world has been applied', () => {
    expect(resolveBootEnvironment(fetched, wideWorld, false)).toBe(harnessWorld);
  });

  it('keeps the saved world when the marker says a challenge world was applied', () => {
    // Otherwise a reload mid-journey silently reverts the wide world.
    expect(resolveBootEnvironment(fetched, wideWorld, true)).toBe(wideWorld);
  });

  it('falls back to the saved world when the harness file is broken', () => {
    const broken: LoadResult = { environment: starterEnvironment, source: 'fallback' };
    expect(resolveBootEnvironment(broken, wideWorld, false)).toBe(wideWorld);
  });
});
