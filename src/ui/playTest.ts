import type { GameBackend, RuntimeStats } from '../runtime/gameApi';
import { ApiRuntime } from '../runtime/gameApi';
import { runProgram } from '../runtime/sandbox';
import { toKidMessage, KID_ERROR_MESSAGES } from '../runtime/kidErrors';
import type { SceneStats } from '../game/PlatformerScene';
import type { SessionState } from '../challenges/types';

// R4/KTD7: Play test compiles the blocks and runs them right here in the
// browser — no harness round-trip is ever on this path.

/** The slice of PlatformerScene a play-test session drives (a test fake fits too). */
export interface SessionHost extends GameBackend {
  beginPlayTest(runtime: ApiRuntime): void;
  endPlayTest(): SceneStats;
  getSceneStats(): SceneStats;
}

export type SessionStart =
  | { ok: true; runtime: ApiRuntime }
  | { ok: false; kidMessage: string };

/** Compile-and-start one play-test session. Any failure comes back as kid language. */
export function startSession(
  host: SessionHost,
  code: string,
  onRuntimeError: (kidMessage: string) => void,
): SessionStart {
  if (code.trim() === '') {
    return { ok: false, kidMessage: KID_ERROR_MESSAGES.emptyProgram };
  }
  const runtime = new ApiRuntime(host);
  runtime.onError((error) => onRuntimeError(toKidMessage(error)));
  host.beginPlayTest(runtime);
  const result = runProgram(code, runtime.api);
  if (!result.ok) {
    host.endPlayTest();
    return { ok: false, kidMessage: result.kidMessage };
  }
  runtime.start();
  return { ok: true, runtime };
}

/** Merge runtime stats and scene facts into what the challenge checks see. */
export function buildSessionState(stats: RuntimeStats, scene: SceneStats): SessionState {
  return {
    initialPlatformCount: scene.initialPlatformCount,
    platformCount: scene.platformCount,
    moved: stats.moved,
    jumped: stats.jumped,
    collectiblesSpawned: stats.collectiblesSpawned,
    collectedCount: stats.collectedCount,
    score: stats.score,
    scoreIncreasedOnCollect: stats.scoreIncreasedOnCollect,
    patrolStarted: stats.patrolStarted,
    enemyPatrolled: scene.enemyPatrolled,
    winTriggered: stats.winTriggered,
  };
}

export type SessionEnd = 'error' | 'success' | 'cancelled';

export interface SessionCallbacks {
  getCode(): string;
  /** Called ~4×/second while playing; return true once the goal state is reached. */
  onLiveState(state: SessionState): boolean;
  /** Called when a session ends (error, live success, or cancellation). */
  onSessionEnd(state: SessionState, endedBy: SessionEnd): void;
  /** Kid-language problems (sandbox errors) surface through here. */
  onKidMessage(message: string): void;
}

export interface SessionController {
  isPlaying(): boolean;
  /** Compile the current blocks and run. `empty` means there was nothing to run. */
  start(): { started: boolean; empty: boolean };
  /** End the session without judging it (entering Build mode, new game, edits). */
  cancel(): void;
}

const LIVE_CHECK_INTERVAL_MS = 250;

/**
 * Button-free play session driver: the app has two modes (Build = editor
 * open, Play = editor closed) and main.ts calls start/cancel on the mode
 * boundary instead of the child pressing Play/Stop.
 */
export function createSessionController(
  host: SessionHost,
  callbacks: SessionCallbacks,
): SessionController {
  let runtime: ApiRuntime | null = null;
  let liveTimer: ReturnType<typeof setInterval> | null = null;

  function end(endedBy: SessionEnd): void {
    if (!runtime) return;
    const stats = runtime.stats;
    runtime = null;
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = null;
    const sceneStats = host.endPlayTest();
    callbacks.onSessionEnd(buildSessionState(stats, sceneStats), endedBy);
  }

  return {
    isPlaying: () => runtime !== null,
    cancel: () => end('cancelled'),
    start() {
      if (runtime) end('cancelled');
      const code = callbacks.getCode();
      if (code.trim() === '') {
        return { started: false, empty: true };
      }
      const started = startSession(host, code, (kidMessage) => {
        callbacks.onKidMessage(kidMessage);
        // A handler error surfaces mid-frame, inside the scene's update loop;
        // tearing the world down right there would destroy bodies Phaser is
        // still stepping, so finish the frame first.
        setTimeout(() => end('error'), 0);
      });
      if (!started.ok) {
        callbacks.onKidMessage(started.kidMessage);
        return { started: false, empty: false };
      }
      runtime = started.runtime;
      liveTimer = setInterval(() => {
        if (!runtime) return;
        const state = buildSessionState(runtime.stats, host.getSceneStats());
        if (callbacks.onLiveState(state)) {
          // Let the child watch their success for a moment before the world resets.
          if (liveTimer) clearInterval(liveTimer);
          liveTimer = null;
          setTimeout(() => end('success'), 1500);
        }
      }, LIVE_CHECK_INTERVAL_MS);
      return { started: true, empty: false };
    },
  };
}
