// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import { registerBlocks } from './definitions';
import { registerGenerators, workspaceToProgram } from './generators';
import { buildToolbox } from './toolbox';

beforeAll(() => {
  registerBlocks();
  registerGenerators();
});

function codeFor(state: Record<string, unknown>): string {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [state] } }, workspace);
    return workspaceToProgram(workspace);
  } finally {
    workspace.dispose();
  }
}

describe('per-block code generation', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['event_start', { type: 'event_start' }, 'api.onStart(function () {\n});\n'],
    [
      'event_key',
      { type: 'event_key', fields: { KEY: 'left' } },
      "api.onKey('left', function () {\n});\n",
    ],
    ['event_collect', { type: 'event_collect' }, 'api.onCollect(function () {\n});\n'],
    [
      'event_touch',
      { type: 'event_touch', fields: { KIND: 'goal' } },
      "api.onTouch('goal', function () {\n});\n",
    ],
    ['move_left', { type: 'move_left', fields: { SPEED: 150 } }, 'api.moveLeft(150);\n'],
    ['move_right', { type: 'move_right', fields: { SPEED: 200 } }, 'api.moveRight(200);\n'],
    ['move_stop', { type: 'move_stop' }, 'api.stop();\n'],
    ['jump', { type: 'jump', fields: { STRENGTH: '520' } }, 'api.jump(520);\n'],
    [
      'spawn_platform',
      { type: 'spawn_platform', fields: { X: 300, Y: 200, WIDTH: 140 } },
      'api.spawnPlatform(300, 200, 140);\n',
    ],
    [
      'spawn_collectible',
      { type: 'spawn_collectible', fields: { X: 310, Y: 160 } },
      'api.spawnCollectible(310, 160);\n',
    ],
    ['enemy_patrol', { type: 'enemy_patrol', fields: { SPEED: 90 } }, 'api.patrolEnemies(90);\n'],
    ['score_add', { type: 'score_add', fields: { AMOUNT: 5 } }, 'api.addScore(5);\n'],
    [
      'timer_every',
      { type: 'timer_every', fields: { SECONDS: 2 } },
      'api.every(2, function () {\n});\n',
    ],
    [
      'timer_after',
      { type: 'timer_after', fields: { SECONDS: 3 } },
      'api.after(3, function () {\n});\n',
    ],
    ['sound_play', { type: 'sound_play', fields: { NAME: 'ding' } }, "api.playSound('ding');\n"],
    ['game_win', { type: 'game_win' }, 'api.win();\n'],
  ];

  it.each(cases)('%s generates the expected api call', (_name, state, expected) => {
    expect(codeFor(state)).toBe(expected);
  });
});

describe('composed programs', () => {
  it('an event block wrapping movement and score blocks generates well-formed nested code', () => {
    const code = codeFor({
      type: 'event_collect',
      inputs: {
        DO: {
          block: {
            type: 'score_add',
            fields: { AMOUNT: 1 },
            next: { block: { type: 'sound_play', fields: { NAME: 'ding' } } },
          },
        },
      },
    });
    expect(code).toBe(
      "api.onCollect(function () {\n  api.addScore(1);\n  api.playSound('ding');\n});\n",
    );
  });

  it('a repeat loop gets the infinite loop trap tick injected', () => {
    const code = codeFor({
      type: 'event_start',
      inputs: {
        DO: {
          block: {
            type: 'controls_repeat_ext',
            inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 3 } } } },
          },
        },
      },
    });
    expect(code).toContain('api.__loopTick();');
  });
});

describe('toolbox subsets', () => {
  it('a descriptor with two categories renders only those categories', () => {
    const toolbox = buildToolbox(['events', 'motion']);
    expect(toolbox.contents.map((c) => c.name)).toEqual(['Events', 'Moving']);
    const blockTypes = toolbox.contents.flatMap((c) => (c.contents ?? []).map((b) => b.type));
    expect(blockTypes).toContain('event_start');
    expect(blockTypes).toContain('jump');
    expect(blockTypes).not.toContain('score_add');
  });

  it('marks just-unlocked categories with a sparkle badge', () => {
    const toolbox = buildToolbox(['events', 'scoring'], ['scoring']);
    expect(toolbox.contents.map((c) => c.name)).toEqual(['Events', 'Score ✨']);
  });

  it('keeps canonical category order regardless of id order', () => {
    const toolbox = buildToolbox(['winning', 'events']);
    expect(toolbox.contents.map((c) => c.name)).toEqual(['Events', 'Winning']);
  });
});
