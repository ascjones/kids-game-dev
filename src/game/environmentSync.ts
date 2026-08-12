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
  'The game maker finished a new world for you! Here it is — your blocks and challenges came along too.';

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
    await this.deps.autosave();
    const announce = this.deps.hasProgress();
    this.deps.applyEnvironment(result.environment);
    if (announce) this.deps.announce(NEW_WORLD_MESSAGE);
  }
}
