// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import { registerBlocks } from './definitions';

beforeAll(() => {
  registerBlocks();
});

describe('workspace serialization', () => {
  it('save then load round-trips to an identical serialized state', () => {
    const program = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'event_start',
            x: 20,
            y: 20,
            inputs: {
              DO: {
                block: {
                  type: 'move_right',
                  fields: { SPEED: 180 },
                  next: { block: { type: 'jump', fields: { STRENGTH: '520' } } },
                },
              },
            },
          },
          {
            type: 'event_collect',
            x: 20,
            y: 220,
            inputs: { DO: { block: { type: 'score_add', fields: { AMOUNT: 2 } } } },
          },
        ],
      },
    };

    const first = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(program, first);
    const saved = Blockly.serialization.workspaces.save(first);
    first.dispose();

    const second = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(saved, second);
    const resaved = Blockly.serialization.workspaces.save(second);
    second.dispose();

    expect(resaved).toEqual(saved);
  });
});
