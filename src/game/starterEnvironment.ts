import type { Environment } from './environmentSchema';

// Bundled fallback world (R2): used when game/environment/environment.json is
// missing or broken, so the child always gets a playable game. The harness
// normally replaces this with a world built from the child's idea.
export const starterEnvironment: Environment = {
  version: 1,
  title: 'Sunny Meadow',
  genre: 'platformer',
  theme: {
    name: 'Sunny Meadow',
    sky: '#87ceeb',
    platform: '#5cae4a',
    player: '#7c5cff',
    collectible: '#ffd23f',
    enemy: '#e0455a',
    goal: '#3fa9f5',
  },
  world: { width: 800, height: 480 },
  player: { spawn: { x: 100, y: 360 } },
  platforms: [
    { x: 400, y: 460, width: 800, height: 40 },
    { x: 250, y: 350, width: 160, height: 24 },
    { x: 520, y: 260, width: 160, height: 24 },
  ],
  collectibles: [{ x: 520, y: 210, kind: 'star' }],
  enemies: [{ x: 620, y: 420, patrol: { minX: 480, maxX: 760 }, speed: 0 }],
  goal: { x: 750, y: 400, kind: 'flag' },
  sounds: { jump: 'boing', collect: 'ding', win: 'tada' },
};
