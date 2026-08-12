import * as Blockly from 'blockly';

// Scratch-style block set (R6/R7): every block reads as a sentence about the
// game, and every generated statement is a call into the constrained game api.

export const CATEGORY_COLOURS = {
  events: '#f5b83d',
  motion: '#4c97ff',
  world: '#59c059',
  enemies: '#e0455a',
  scoring: '#ff8c1a',
  timing: '#9966ff',
  sound: '#cf63cf',
  winning: '#ffd23f',
  logic: '#5cb1d6',
  variables: '#ff8c9a',
} as const;

let registered = false;

export function registerBlocks(): void {
  if (registered) return;
  registered = true;

  Blockly.common.defineBlocksWithJsonArray([
    // -- Events ------------------------------------------------------------
    {
      type: 'event_start',
      message0: 'when the game starts %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: CATEGORY_COLOURS.events,
      tooltip: 'Runs your blocks once, when you press Play test.',
    },
    {
      type: 'event_key',
      message0: 'when the %1 key is pressed %2 %3',
      args0: [
        {
          type: 'field_dropdown',
          name: 'KEY',
          options: [
            ['left arrow', 'left'],
            ['right arrow', 'right'],
            ['up arrow', 'up'],
            ['down arrow', 'down'],
            ['space', 'space'],
          ],
        },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: CATEGORY_COLOURS.events,
      tooltip: 'Runs your blocks while that key is held down.',
    },
    {
      type: 'event_collect',
      message0: 'when you collect a star %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: CATEGORY_COLOURS.events,
      tooltip: 'Runs your blocks every time the player picks up a star.',
    },
    {
      type: 'event_touch',
      message0: 'when you touch %1 %2 %3',
      args0: [
        {
          type: 'field_dropdown',
          name: 'KIND',
          options: [
            ['an enemy', 'enemy'],
            ['the goal flag', 'goal'],
          ],
        },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: CATEGORY_COLOURS.events,
      tooltip: 'Runs your blocks when the player touches that thing.',
    },
    // -- Motion ------------------------------------------------------------
    {
      type: 'move_left',
      message0: 'move left at speed %1',
      args0: [{ type: 'field_number', name: 'SPEED', value: 200, min: 10, max: 600 }],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.motion,
      tooltip: 'Makes the player run to the left.',
    },
    {
      type: 'move_right',
      message0: 'move right at speed %1',
      args0: [{ type: 'field_number', name: 'SPEED', value: 200, min: 10, max: 600 }],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.motion,
      tooltip: 'Makes the player run to the right.',
    },
    {
      type: 'move_stop',
      message0: 'stop moving',
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.motion,
      tooltip: 'Makes the player stand still.',
    },
    {
      type: 'jump',
      message0: 'jump %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'STRENGTH',
          options: [
            ['a little', '380'],
            ['normally', '520'],
            ['super high', '700'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.motion,
      tooltip: 'Makes the player jump. Only works standing on something!',
    },
    // -- World -------------------------------------------------------------
    {
      type: 'spawn_platform',
      message0: 'add a platform at x %1 y %2 that is %3 wide',
      args0: [
        { type: 'field_number', name: 'X', value: 400, min: 0, max: 800 },
        { type: 'field_number', name: 'Y', value: 300, min: 0, max: 480 },
        { type: 'field_number', name: 'WIDTH', value: 120, min: 40, max: 800 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.world,
      tooltip: 'Puts a new platform in your world.',
    },
    {
      type: 'spawn_collectible',
      message0: 'add a star at x %1 y %2',
      args0: [
        { type: 'field_number', name: 'X', value: 400, min: 0, max: 800 },
        { type: 'field_number', name: 'Y', value: 200, min: 0, max: 480 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.world,
      tooltip: 'Puts a new star in your world for the player to collect.',
    },
    // -- Enemies -----------------------------------------------------------
    {
      type: 'enemy_patrol',
      message0: 'make enemies patrol at speed %1',
      args0: [{ type: 'field_number', name: 'SPEED', value: 80, min: 10, max: 300 }],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.enemies,
      tooltip: 'Makes enemies walk back and forth on their patch.',
    },
    // -- Scoring -----------------------------------------------------------
    {
      type: 'score_add',
      message0: 'add %1 to the score',
      args0: [{ type: 'field_number', name: 'AMOUNT', value: 1, min: 1, max: 100 }],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.scoring,
      tooltip: 'Makes the score go up.',
    },
    {
      type: 'score_get',
      message0: 'score',
      output: 'Number',
      colour: CATEGORY_COLOURS.scoring,
      tooltip: 'The score right now.',
    },
    // -- Timing ------------------------------------------------------------
    {
      type: 'timer_every',
      message0: 'every %1 seconds %2 %3',
      args0: [
        { type: 'field_number', name: 'SECONDS', value: 1, min: 0.25, max: 60 },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.timing,
      tooltip: 'Keeps running your blocks again and again.',
    },
    {
      type: 'timer_after',
      message0: 'after %1 seconds %2 %3',
      args0: [
        { type: 'field_number', name: 'SECONDS', value: 3, min: 0.25, max: 120 },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.timing,
      tooltip: 'Waits, then runs your blocks one time.',
    },
    // -- Sound -------------------------------------------------------------
    {
      type: 'sound_play',
      message0: 'play the %1 sound',
      args0: [
        {
          type: 'field_dropdown',
          name: 'NAME',
          options: [
            ['boing', 'boing'],
            ['ding', 'ding'],
            ['tada', 'tada'],
            ['zap', 'zap'],
            ['pop', 'pop'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: CATEGORY_COLOURS.sound,
      tooltip: 'Plays a sound.',
    },
    // -- Winning -----------------------------------------------------------
    {
      type: 'game_win',
      message0: 'you win the game! 🎉',
      previousStatement: null,
      colour: CATEGORY_COLOURS.winning,
      tooltip: 'Ends the game with a big celebration.',
    },
  ]);
}
