import type { GameBackend, RuntimeStats } from '../runtime/gameApi';
import { ApiRuntime } from '../runtime/gameApi';
import { runProgram } from '../runtime/sandbox';
import { toKidMessage, KID_ERROR_MESSAGES } from '../runtime/kidErrors';
import type { SceneStats } from '../game/PlatformerScene';
import type { SessionState } from '../challenges/types';
import type { KidNotice } from './kidNotice';

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

export type SessionEnd = 'stop' | 'error' | 'success' | 'cancelled';

export interface PlayTestCallbacks {
  getCode(): string;
  /** Called ~4×/second while playing; return true once the goal state is reached. */
  onLiveState(state: SessionState): boolean;
  /** Called when a session ends (stop button, error, live success, or cancellation). */
  onSessionEnd(state: SessionState, endedBy: SessionEnd): void;
}

export interface PlayTestHandle {
  isPlaying(): boolean;
  stop(): void;
  /** End the session without judging it (e.g. the blocks changed mid-play). */
  cancel(): void;
}

const LIVE_CHECK_INTERVAL_MS = 250;

export function createPlayTestControls(
  container: HTMLElement,
  host: SessionHost,
  notice: KidNotice,
  callbacks: PlayTestCallbacks,
): PlayTestHandle {
  container.classList.add('panel');
  container.style.cssText += 'display:flex;gap:10px;align-items:center;';

  const playButton = document.createElement('button');
  playButton.className = 'kid-button';
  playButton.textContent = '▶ Play test';
  const stopButton = document.createElement('button');
  stopButton.className = 'kid-button secondary';
  stopButton.textContent = '⏹ Stop';
  stopButton.disabled = true;
  const tip = document.createElement('span');
  tip.textContent = 'Use the arrow keys while playing!';
  container.append(playButton, stopButton, tip);

  let runtime: ApiRuntime | null = null;
  let liveTimer: ReturnType<typeof setInterval> | null = null;

  function end(endedBy: SessionEnd): void {
    if (!runtime) return;
    const stats = runtime.stats;
    runtime = null;
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = null;
    const sceneStats = host.endPlayTest();
    playButton.disabled = false;
    stopButton.disabled = true;
    callbacks.onSessionEnd(buildSessionState(stats, sceneStats), endedBy);
  }

  playButton.onclick = () => {
    if (runtime) end('stop');
    const started = startSession(host, callbacks.getCode(), (kidMessage) => {
      notice.info(kidMessage);
      // A handler error surfaces mid-frame, inside the scene's update loop;
      // tearing the world down right there would destroy bodies Phaser is
      // still stepping, so finish the frame first.
      setTimeout(() => end('error'), 0);
    });
    if (!started.ok) {
      notice.info(started.kidMessage);
      return;
    }
    runtime = started.runtime;
    playButton.disabled = true;
    stopButton.disabled = false;
    liveTimer = setInterval(() => {
      if (!runtime) return;
      const state = buildSessionState(runtime.stats, host.getSceneStats());
      if (callbacks.onLiveState(state)) {
        // Let the child watch their success for a moment before edit mode returns.
        if (liveTimer) clearInterval(liveTimer);
        liveTimer = null;
        setTimeout(() => end('success'), 1500);
      }
    }, LIVE_CHECK_INTERVAL_MS);
  };

  stopButton.onclick = () => end('stop');

  return {
    isPlaying: () => runtime !== null,
    stop: () => end('stop'),
    cancel: () => end('cancelled'),
  };
}
