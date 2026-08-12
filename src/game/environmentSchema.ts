import { z } from 'zod';

// The environment is harness-owned data (KTD9): the agent harness writes
// game/environment/environment.json and the app renders it. Everything here is
// genre-neutral where possible so a second genre is new content, not a rewrite.

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb color');

export const themeSchema = z.object({
  name: z.string().default('Sunny Meadow'),
  sky: color.default('#87ceeb'),
  platform: color.default('#5cae4a'),
  player: color.default('#7c5cff'),
  collectible: color.default('#ffd23f'),
  enemy: color.default('#e0455a'),
  goal: color.default('#3fa9f5'),
});

export const platformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive().default(24),
});

export const collectibleSchema = z.object({
  x: z.number(),
  y: z.number(),
  kind: z.string().default('star'),
});

export const enemySchema = z.object({
  x: z.number(),
  y: z.number(),
  patrol: z
    .object({
      minX: z.number(),
      maxX: z.number(),
    })
    .optional(),
  speed: z.number().nonnegative().default(0),
});

export const goalSchema = z.object({
  x: z.number(),
  y: z.number(),
  kind: z.string().default('flag'),
});

export const environmentSchema = z.object({
  version: z.number().int().default(1),
  title: z.string().default('My Game'),
  genre: z.string().default('platformer'),
  theme: themeSchema.prefault({}),
  world: z
    .object({
      width: z.number().positive().default(800),
      height: z.number().positive().default(480),
    })
    .prefault({}),
  player: z.object({
    spawn: z.object({ x: z.number(), y: z.number() }),
  }),
  platforms: z.array(platformSchema),
  collectibles: z.array(collectibleSchema).default([]),
  enemies: z.array(enemySchema).default([]),
  goal: goalSchema.optional(),
  sounds: z.record(z.string(), z.string()).default({}),
});

export type Environment = z.infer<typeof environmentSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type PlatformDef = z.infer<typeof platformSchema>;
export type CollectibleDef = z.infer<typeof collectibleSchema>;
export type EnemyDef = z.infer<typeof enemySchema>;
export type GoalDef = z.infer<typeof goalSchema>;
