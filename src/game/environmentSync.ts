import type { Environment } from './environmentSchema';
import type { LoadResult } from './environmentLoader';

// U8: environment reload is a runtime refetch, never a page reload. The swap
// waits out an active play test, autosaves first, and announces itself when
// the child had already made progress on the old world.

export interface EnvironmentSyncDeps {
  fetchEnvironment(): Promise<LoadResult>;
  applyEnvironment(environment: Environment): void;
  isPlayTestActive(): boolean;
  /** Persist the project before the world changes under it. */
  autosave(): Promise<void>;
  announce(message: string): void;
  /** Whether the child has meaningful progress (blocks or completed challenges). */
  hasProgress(): boolean;
}

export const NEW_WORLD_MESSAGE =
  'The Game Wizard finished a new world for you! Here it is — your blocks and challenges came along too.';

export class EnvironmentSync {
  private deps: EnvironmentSyncDeps;
  private pending = false;

  constructor(deps: EnvironmentSyncDeps) {
    this.deps = deps;
  }

  /** Handle an environment_updated inbox message. */
  async onEnvironmentUpdated(): Promise<void> {
    if (this.deps.isPlayTestActive()) {
      this.pending = true;
      return;
    }
    await this.applyNow();
  }

  /**
   * Apply a world handed to us rather than fetched — a challenge's bundled
   * environment (KTD4). No deferral here: the caller stops the session first
   * (see `swapWorldForChallenge`) and awaits this, so the swap cannot race a
   * restart.
   */
  async applyChallengeEnvironment(environment: Environment): Promise<void> {
    await this.apply(environment);
  }

  /** Call when a play test ends, to apply a deferred swap. */
  async onPlayTestEnded(): Promise<void> {
    if (!this.pending) return;
    this.pending = false;
    await this.applyNow();
  }

  hasPendingSwap(): boolean {
    return this.pending;
  }

  private async applyNow(): Promise<void> {
    const result = await this.deps.fetchEnvironment();
    if (result.source === 'fallback') {
      // The harness announced an update but the file is broken; keep playing
      // on the current world rather than yanking it away.
      if (result.kidMessage) this.deps.announce(result.kidMessage);
      return;
    }
    await this.apply(result.environment);
  }

  /** Save first, swap second: the child's work never falls into the gap. */
  private async apply(environment: Environment): Promise<void> {
    await this.deps.autosave();
    const announce = this.deps.hasProgress();
    this.deps.applyEnvironment(environment);
    if (announce) this.deps.announce(NEW_WORLD_MESSAGE);
  }
}

export interface ChallengeWorldSwapDeps {
  isPlayTestActive(): boolean;
  cancelPlayTest(): void;
  startPlayTest(): void;
  applyEnvironment(environment: Environment): Promise<void>;
}

/**
 * Hand a challenge's bundled world to the game around a running session (KTD4).
 * A session carries stats and a scene built on the old world, so it is stopped
 * before the swap and restarted only once the swap has finished — the ordering
 * a deferred (unawaited) swap cannot guarantee.
 */
export async function swapWorldForChallenge(
  environment: Environment | null,
  deps: ChallengeWorldSwapDeps,
): Promise<void> {
  const wasPlaying = deps.isPlayTestActive();
  try {
    if (environment) {
      if (wasPlaying) deps.cancelPlayTest();
      await deps.applyEnvironment(environment);
    }
  } finally {
    // Restart even when the swap failed: the session was stopped to make room
    // for a world that never arrived, and leaving the child on a frozen game
    // is worse than leaving them on the old world.
    if (wasPlaying) deps.startPlayTest();
  }
}

/**
 * Which world a returning game boots on (KTD4). The harness file normally wins,
 * but once a challenge-carried world has been applied the saved world outranks
 * it — otherwise a reload mid-journey would silently shrink the world back.
 */
export function resolveBootEnvironment(
  fetched: LoadResult,
  saved: Environment,
  challengeWorldApplied: boolean,
): Environment {
  if (challengeWorldApplied) return saved;
  return fetched.source === 'loaded' ? fetched.environment : saved;
}
