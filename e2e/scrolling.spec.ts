import { expect, test } from '@playwright/test';
import {
  bootToWorkbench,
  chain,
  cleanBridge,
  onStart,
  playProgram,
  PROGRAMS,
  readSnapshot,
  seedChallengeProgress,
  withEnvironment,
  type GameSnapshot,
} from './helpers';

// Scrolling worlds, end to end: a world wider than the screen travels with the
// player, a screen-sized world still never moves, and both the child's blocks
// and the harness's own world file land where they mean to.

declare global {
  interface Window {
    __kidGame: {
      snapshot(): GameSnapshot;
      currentChallengeId(): string | null;
    };
  }
}

const VIEWPORT_WIDTH = 800;

/** Everything in game/environment/challenges.json ahead of 'great-journey'. */
const CHALLENGES_BEFORE_THE_JOURNEY = [
  'add-platform',
  'make-jump',
  'learn-to-run',
  'add-star',
  'score-points',
  'enemy-patrol',
  'win-condition',
];

/** A theme every substitute world reuses; the colours are irrelevant here. */
const THEME = {
  name: 'Sunny Meadow',
  sky: '#87ceeb',
  platform: '#5cae4a',
  player: '#7c5cff',
  collectible: '#ffd23f',
  enemy: '#e0455a',
  goal: '#3fa9f5',
};

/**
 * Three screens wide, floored edge to edge so holding right is a clean run,
 * plus one ledge high above head height that the R7 check pins down.
 */
const WIDE_WORLD = {
  version: 1,
  title: 'Three Screens Wide',
  genre: 'platformer',
  theme: THEME,
  world: { width: 2400, height: 480 },
  player: { spawn: { x: 100, y: 360 } },
  platforms: [
    { x: 400, y: 460, width: 800, height: 40 },
    { x: 1200, y: 460, width: 800, height: 40 },
    { x: 2000, y: 460, width: 800, height: 40 },
    { x: 1500, y: 300, width: 160, height: 24 },
  ],
  collectibles: [],
  enemies: [],
  goal: { x: 2300, y: 400, kind: 'flag' },
  weather: 'clear',
  sounds: { jump: 'boing', collect: 'ding', win: 'tada' },
};

/** Where the harness put those platforms — the exact positions R7 asserts. */
const WIDE_WORLD_PLATFORMS = WIDE_WORLD.platforms.map(({ x, y }) => ({ x, y }));

/**
 * Wide *and* tall, with ground only under the spawn: run right and you walk off
 * the end into a fall much deeper than one viewport.
 */
const PIT_WORLD = {
  ...WIDE_WORLD,
  title: 'A Long Way Down',
  world: { width: 1600, height: 900 },
  platforms: [{ x: 200, y: 460, width: 400, height: 40 }],
  goal: undefined,
};

const runOnRightKey = (speed: number) => [
  {
    type: 'event_key',
    x: 20,
    y: 20,
    fields: { KEY: 'right' },
    inputs: { DO: { block: { type: 'move_right', fields: { SPEED: speed } } } },
  },
];

const runRightFromStart = (speed: number) => [
  onStart({ type: 'move_right', fields: { SPEED: speed } }),
];

/**
 * Run right, stop, then — once the camera has caught up and settled — spawn a
 * platform at view coordinates. Stopping first is what makes the assertion
 * exact: a moving camera would have travelled on between the spawn and the read.
 */
const runThenSpawnPlatform = [
  onStart(
    chain([
      { type: 'move_right', fields: { SPEED: 400 } },
      {
        type: 'timer_after',
        fields: { SECONDS: 3 },
        inputs: { DO: { block: { type: 'move_stop' } } },
      },
      {
        type: 'timer_after',
        fields: { SECONDS: 5 },
        inputs: {
          DO: { block: { type: 'spawn_platform', fields: { X: 400, Y: 300, WIDTH: 140 } } },
        },
      },
    ]),
  ),
];

const winAtGoalRunning = (speed: number) => [
  onStart({ type: 'move_right', fields: { SPEED: speed } }),
  {
    type: 'event_touch',
    x: 20,
    y: 220,
    fields: { KIND: 'goal' },
    inputs: { DO: { block: { type: 'game_win' } } },
  },
];

test.beforeEach(() => cleanBridge());

test('Covers AE1. Holding right scrolls a wide world, and the camera stops at its far edge', async ({
  page,
}) => {
  await withEnvironment(WIDE_WORLD, async () => {
    await bootToWorkbench(page);
    const start = await readSnapshot(page);
    expect(start.world).toEqual({ width: 2400, height: 480 });
    expect(start.camera.scrollX).toBe(0);

    await playProgram(page, runOnRightKey(400));
    await page.keyboard.down('ArrowRight');
    try {
      // The camera travels with the player...
      await page.waitForFunction(() => window.__kidGame.snapshot().camera.scrollX > 200, null, {
        polling: 'raf',
        timeout: 20_000,
      });
      // ...and then stops dead at world.width - one viewport.
      await page.waitForFunction(
        (limit) => window.__kidGame.snapshot().camera.scrollX >= limit - 0.5,
        WIDE_WORLD.world.width - VIEWPORT_WIDTH,
        { polling: 'raf', timeout: 30_000 },
      );
    } finally {
      await page.keyboard.up('ArrowRight');
    }

    const clamped = await readSnapshot(page);
    expect(clamped.camera.scrollX).toBeLessThanOrEqual(clamped.world.width - VIEWPORT_WIDTH);
    expect(clamped.camera.scrollY).toBe(0);
  });
});

test('Covers AE2. A screen-sized starter world never scrolls, right through challenge one', async ({
  page,
}) => {
  // Deliberately no substitute world: this is the bundled starter file every
  // other spec runs against, and the compatibility guarantee is that it is
  // unaffected by scrolling existing at all.
  await bootToWorkbench(page);
  const start = await readSnapshot(page);
  expect(start.world).toEqual({ width: 800, height: 480 });
  expect(start.camera.scrollX).toBe(0);

  await playProgram(page, [...PROGRAMS.addPlatform, ...runOnRightKey(400)]);
  await page.keyboard.down('ArrowRight');
  try {
    await expect(page.locator('#challenge-panel .explanation')).toContainText(
      'told the game to build a platform',
      { timeout: 20_000 },
    );
    // The player really is running at the right-hand edge of the world...
    await page.waitForFunction(() => window.__kidGame.snapshot().player.x > 400, null, {
      polling: 'raf',
      timeout: 20_000,
    });
    // ...and the camera has not budged, at any point, on either axis.
    for (let sample = 0; sample < 6; sample += 1) {
      const seen = await readSnapshot(page);
      expect(seen.camera).toEqual({ scrollX: 0, scrollY: 0 });
      await page.waitForTimeout(250);
    }
  } finally {
    await page.keyboard.up('ArrowRight');
  }
});

test('Covers AE3. A spawn block places its platform in the view the child is looking at', async ({
  page,
}) => {
  await withEnvironment(WIDE_WORLD, async () => {
    await bootToWorkbench(page);
    await playProgram(page, runThenSpawnPlatform);

    // Read the world the instant the new platform exists: the challenge check
    // fires on it too, and a successful session resets the world shortly after.
    const handle = await page.waitForFunction(
      (harnessCount) => {
        const seen = window.__kidGame.snapshot();
        return seen.platforms.length > harnessCount ? seen : null;
      },
      WIDE_WORLD.platforms.length,
      { polling: 'raf', timeout: 30_000 },
    );
    const atSpawn = await handle.jsonValue();
    if (!atSpawn) throw new Error('waitForFunction resolved without a snapshot');

    expect(atSpawn.camera.scrollX).toBeGreaterThan(200);
    const spawned = atSpawn.platforms[atSpawn.platforms.length - 1];
    // "x 400" means the middle of what the child can see, wherever that is.
    expect(spawned.x).toBeCloseTo(atSpawn.camera.scrollX + 400, 1);
    expect(spawned.y).toBeCloseTo(atSpawn.camera.scrollY + 300, 1);
  });
});

test('Covers AE5. The great journey challenge arrives with its three-screen world and is winnable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await bootToWorkbench(page);
  // Walking the whole arc costs minutes; resuming a save that already did is
  // the app's own path back into a late challenge.
  await seedChallengeProgress(
    page,
    CHALLENGES_BEFORE_THE_JOURNEY,
    CHALLENGES_BEFORE_THE_JOURNEY.length,
  );

  expect(await page.evaluate(() => window.__kidGame.currentChallengeId())).toBe('great-journey');
  await expect(page.locator('#challenge-panel')).toContainText('Go on a great journey!');
  expect((await readSnapshot(page)).world).toEqual({ width: 2400, height: 480 });

  await playProgram(page, winAtGoalRunning(350));
  // The journey really crosses the screen boundary on the way to the flag.
  await page.waitForFunction(() => window.__kidGame.snapshot().camera.scrollX > 800, null, {
    polling: 'raf',
    timeout: 30_000,
  });
  await expect(page.locator('#challenge-panel .explanation')).toContainText(
    'ran across a world three screens wide',
    { timeout: 30_000 },
  );
});

test('Covers R3. Falling out of a tall world respawns at the spawn point, not at the screen edge', async ({
  page,
}) => {
  await withEnvironment(PIT_WORLD, async () => {
    await bootToWorkbench(page);
    const start = await readSnapshot(page);
    expect(start.world).toEqual({ width: 1600, height: 900 });

    await playProgram(page, runRightFromStart(300));
    // 700 is far below the 480-high viewport: a viewport-derived fall check
    // would have respawned the player long before here.
    await page.waitForFunction(() => window.__kidGame.snapshot().player.y > 700, null, {
      polling: 'raf',
      timeout: 30_000,
    });
    // Past the world's own floor, the player is put back on the spawn ledge.
    await page.waitForFunction(
      (spawn) => {
        const player = window.__kidGame.snapshot().player;
        // A hair of tolerance: the respawn lands mid-frame, so one frame of the
        // run's velocity is still on the clock.
        return Math.abs(player.x - spawn.x) < 20 && player.y < 440;
      },
      PIT_WORLD.player.spawn,
      { polling: 'raf', timeout: 30_000 },
    );
  });
});

test('Covers R7. Harness-authored platforms keep their world coordinates while the camera is scrolled', async ({
  page,
}) => {
  await withEnvironment(WIDE_WORLD, async () => {
    await bootToWorkbench(page);
    await playProgram(page, runOnRightKey(400));
    await page.keyboard.down('ArrowRight');
    try {
      await page.waitForFunction(() => window.__kidGame.snapshot().camera.scrollX > 600, null, {
        polling: 'raf',
        timeout: 20_000,
      });
    } finally {
      await page.keyboard.up('ArrowRight');
    }

    // The camera is most of a screen away from the origin, and every platform
    // the harness wrote still sits on its environment.json coordinate — the
    // view translation kid spawns get (AE3) must not reach these.
    const scrolled = await readSnapshot(page);
    expect(scrolled.camera.scrollX).toBeGreaterThan(600);
    expect(scrolled.platforms).toEqual(WIDE_WORLD_PLATFORMS);
  });
});

test('advancing into the journey does not complete it with the previous challenge play', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await bootToWorkbench(page);

  // Sit on the win challenge, uncompleted, with the six before it done.
  await seedChallengeProgress(page, CHALLENGES_BEFORE_THE_JOURNEY.slice(0, 6), 6);
  await page.reload();
  await page.waitForFunction(() => '__kidGame' in window);
  expect(await page.evaluate(() => window.__kidGame.currentChallengeId())).toBe('win-condition');

  // Win it, which is also how the child leaves it: the celebration restarts a
  // fresh session, and running right reaches the flag again in that one.
  await playProgram(page, PROGRAMS.winAtGoal);
  await expect(page.locator('#challenge-panel .explanation')).toContainText('YOU WIN', {
    timeout: 20_000,
  });
  // Let the post-win session restart, re-touch the goal, and pass the 3s
  // "was this a real attempt?" window that guards cancelled-session judging.
  await page.waitForTimeout(6000);

  await page.getByRole('button', { name: 'Next challenge →' }).click();
  await expect(page.locator('#challenge-panel')).toContainText('great journey', {
    timeout: 10_000,
  });

  // The journey is a three-screen run; a win triggered back on the old world
  // must not count for it. Its explanation appearing here means it completed
  // without the child travelling anywhere.
  await page.waitForTimeout(3000);
  await expect(page.locator('#challenge-panel .explanation')).not.toBeVisible();
  expect(await page.evaluate(() => window.__kidGame.currentChallengeId())).toBe('great-journey');
});
