import { CATEGORY_COLOURS } from './definitions';

// KTD10: progressive toolbox. Each challenge declares which of these category
// ids it shows; completed challenges unlock more.

export type CategoryId = keyof typeof CATEGORY_COLOURS;

export const ALL_CATEGORY_IDS: CategoryId[] = [
  'events',
  'motion',
  'world',
  'enemies',
  'scoring',
  'timing',
  'sound',
  'logic',
  'variables',
  'winning',
];

interface ToolboxBlockItem {
  kind: 'block';
  type: string;
  inputs?: Record<string, unknown>;
}

const block = (type: string, inputs?: Record<string, unknown>): ToolboxBlockItem => ({
  kind: 'block',
  type,
  ...(inputs ? { inputs } : {}),
});

const numberShadow = (value: number) => ({
  shadow: { type: 'math_number', fields: { NUM: value } },
});

const CATEGORY_NAMES: Record<CategoryId, string> = {
  events: 'Events',
  motion: 'Moving',
  world: 'World',
  enemies: 'Enemies',
  scoring: 'Score',
  timing: 'Timing',
  sound: 'Sounds',
  logic: 'Thinking',
  variables: 'Variables',
  winning: 'Winning',
};

const CATEGORY_CONTENTS: Record<CategoryId, ToolboxBlockItem[]> = {
  events: [
    block('event_start'),
    block('event_key'),
    block('event_collect'),
    block('event_touch'),
  ],
  motion: [block('move_right'), block('move_left'), block('move_stop'), block('jump')],
  world: [block('spawn_platform'), block('spawn_collectible')],
  enemies: [block('enemy_patrol')],
  scoring: [block('score_add'), block('score_get')],
  timing: [block('timer_every'), block('timer_after')],
  sound: [block('sound_play')],
  logic: [
    block('controls_if'),
    block('logic_compare', { A: numberShadow(0), B: numberShadow(0) }),
    block('controls_repeat_ext', { TIMES: numberShadow(3) }),
    block('math_number'),
  ],
  variables: [],
  winning: [block('game_win')],
};

export interface ToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents?: ToolboxBlockItem[];
  custom?: string;
}

export interface ToolboxDefinition {
  kind: 'categoryToolbox';
  contents: ToolboxCategory[];
}

/**
 * Build a toolbox showing only the given categories, in canonical order.
 * Categories in `justUnlocked` get a sparkle badge so the child notices the
 * new blocks (KTD10 unlock cue).
 */
export function buildToolbox(
  categoryIds: readonly string[],
  justUnlocked: readonly string[] = [],
): ToolboxDefinition {
  const wanted = new Set(categoryIds);
  return {
    kind: 'categoryToolbox',
    contents: ALL_CATEGORY_IDS.filter((id) => wanted.has(id)).map((id) => ({
      kind: 'category',
      name: justUnlocked.includes(id) ? `${CATEGORY_NAMES[id]} ✨` : CATEGORY_NAMES[id],
      colour: CATEGORY_COLOURS[id],
      ...(id === 'variables'
        ? { custom: 'VARIABLE' }
        : { contents: CATEGORY_CONTENTS[id] }),
    })),
  };
}
