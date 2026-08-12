// @vitest-environment jsdom
// U5 integration proof: real Blockly generator output, through the sandbox,
// into a scene-state fake — no Phaser, minimal mocking.
import { beforeAll, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import { registerBlocks } from '../blocks/definitions';
import { registerGenerators, workspaceToProgram } from '../blocks/generators';
import { FakeBackend } from '../runtime/fakeBackend';
import type { ApiRuntime } from '../runtime/gameApi';
import { KID_ERROR_MESSAGES } from '../runtime/kidErrors';
import type { SceneStats } from '../game/PlatformerScene';
import { buildSessionState, startSession, type SessionHost } from './playTest';

beforeAll(() => {
  registerBlocks();
  registerGenerators();
});

class FakeSceneHost extends FakeBackend implements SessionHost {
  initialPlatformCount = 0;
  runtime: ApiRuntime | null = null;

  beginPlayTest(runtime: ApiRuntime): void {
    this.runtime = runtime;
    this.platforms = [];
    this.velocityX = 0;
    this.x = 0;
  }

  endPlayTest(): SceneStats {
    this.runtime = null;
    return this.getSceneStats();
  }

  getSceneStats(): SceneStats {
    return {
      initialPlatformCount: this.initialPlatformCount,
      platformCount: this.initialPlatformCount + this.platforms.length,
      enemyPatrolled: false,
    };
  }
}

function generate(blocks: Record<string, unknown>[]): string {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, workspace);
    return workspaceToProgram(workspace);
  } finally {
    workspace.dispose();
  }
}

const moveRightProgram = [
  {
    type: 'event_start',
    inputs: { DO: { block: { type: 'move_right', fields: { SPEED: 180 } } } },
  },
];

describe('play-test loop', () => {
  it('a "when game starts, move right" program moves the player during play test', () => {
    const host = new FakeSceneHost();
    const started = startSession(host, generate(moveRightProgram), () => {});
    expect(started.ok).toBe(true);
    host.step(1);
    expect(host.velocityX).toBe(180);
    expect(host.x).toBe(180);
  });

  it('two consecutive play tests produce identical behavior', () => {
    const host = new FakeSceneHost();
    const code = generate(moveRightProgram);

    const first = startSession(host, code, () => {});
    expect(first.ok).toBe(true);
    if (first.ok) first.runtime.frame(1 / 60, []);
    const firstVelocity = host.velocityX;
    host.endPlayTest();

    const second = startSession(host, code, () => {});
    expect(second.ok).toBe(true);
    if (second.ok) second.runtime.frame(1 / 60, []);
    expect(host.velocityX).toBe(firstVelocity);
  });

  it('a program that throws shows the kid-language message and returns to edit mode cleanly', () => {
    const host = new FakeSceneHost();
    const started = startSession(host, 'null.explode();', () => {});
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.kidMessage).toBe(KID_ERROR_MESSAGES.runtime);
    }
    expect(host.runtime).toBeNull();
  });

  it('an empty workspace explains itself instead of silently doing nothing', () => {
    const host = new FakeSceneHost();
    const started = startSession(host, '   ', () => {});
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.kidMessage).toBe(KID_ERROR_MESSAGES.emptyProgram);
    }
  });

  it('a generated program spawning a platform shows up in the session state', () => {
    const host = new FakeSceneHost();
    host.initialPlatformCount = 3;
    const code = generate([
      {
        type: 'event_start',
        inputs: {
          DO: { block: { type: 'spawn_platform', fields: { X: 300, Y: 200, WIDTH: 140 } } },
        },
      },
    ]);
    const started = startSession(host, code, () => {});
    expect(started.ok).toBe(true);
    if (started.ok) {
      const state = buildSessionState(started.runtime.stats, host.getSceneStats());
      expect(state.platformCount).toBe(4);
      expect(state.initialPlatformCount).toBe(3);
    }
  });
});
