import { describe, expect, it } from 'vitest';
import { ChallengeEngine } from './engine';
import { starterChallenges } from './starterChallenges';
import {
  BASELINE_SESSION,
  hasChallengeEnvironmentApplied,
  type ChallengeDef,
  type SessionState,
} from './types';
import { starterEnvironment } from '../game/starterEnvironment';

const baseline: SessionState = { ...BASELINE_SESSION, initialPlatformCount: 3, platformCount: 3 };

function makeEngine() {
  return new ChallengeEngine(starterChallenges);
}

const wideWorld = {
  ...starterEnvironment,
  title: 'The Long Run',
  world: { width: 2400, height: 480 },
};

/** The first two starter challenges plus a third that carries a wide world. */
function arcWithWideFinale(): ChallengeDef[] {
  return [
    starterChallenges[0],
    starterChallenges[1],
    { ...starterChallenges[2], id: 'go-wide', environment: wideWorld },
  ];
}

function completeCurrent(engine: ChallengeEngine): void {
  engine.evaluate({
    ...baseline,
    platformCount: 4,
    moved: true,
    jumped: true,
    collectiblesSpawned: 1,
    collectedCount: 1,
    scoreIncreasedOnCollect: true,
    patrolStarted: true,
    enemyPatrolled: true,
    winTriggered: true,
  });
  engine.advance();
}

describe('hints', () => {
  it('reveals one stage at a time and never auto-opens', () => {
    const engine = makeEngine();
    expect(engine.revealedHints()).toEqual([]);
    const first = engine.revealNextHint();
    expect(first).toBe(starterChallenges[0].hints[0]);
    expect(engine.revealedHints()).toEqual([first]);
    engine.revealNextHint();
    engine.revealNextHint();
    expect(engine.revealedHints()).toHaveLength(3);
    expect(engine.revealNextHint()).toBeNull();
  });
});

describe('evaluation', () => {
  it('a clean play test that fails the check reports not_yet, not success', () => {
    const engine = makeEngine();
    expect(engine.evaluate(baseline)).toBe('not_yet');
    expect(engine.currentCompleted()).toBe(false);
  });

  it('a satisfying play test completes the challenge exactly once', () => {
    const engine = makeEngine();
    const satisfying = { ...baseline, platformCount: 4 };
    expect(engine.evaluate(satisfying)).toBe('completed');
    expect(engine.evaluate(satisfying)).toBe('already_completed');
    expect(engine.currentCompleted()).toBe(true);
  });
});

describe('progression and unlocks', () => {
  it('completing challenge N unlocks N+1 and its toolbox additions; N+2 stays locked', () => {
    const engine = makeEngine();
    expect(engine.current()?.id).toBe('add-platform');
    expect(engine.toolboxCategories()).toEqual(['events', 'world']);

    engine.evaluate({ ...baseline, platformCount: 4 });
    engine.advance();

    expect(engine.current()?.id).toBe('make-jump');
    expect(engine.toolboxCategories()).toContain('motion');
    expect(engine.justUnlocked()).toEqual(['motion']);
    expect(engine.toolboxCategories()).not.toContain('scoring');
    expect(engine.toolboxCategories()).not.toContain('winning');
  });

  it('advance does nothing while the current challenge is incomplete', () => {
    const engine = makeEngine();
    engine.advance();
    expect(engine.current()?.id).toBe('add-platform');
  });

  it('completing every challenge ends in free play with every category', () => {
    const engine = makeEngine();
    const satisfyAll: SessionState = {
      ...baseline,
      platformCount: 4,
      moved: true,
      jumped: true,
      collectiblesSpawned: 1,
      scoreIncreasedOnCollect: true,
      patrolStarted: true,
      enemyPatrolled: true,
      winTriggered: true,
    };
    for (let i = 0; i < starterChallenges.length; i++) {
      expect(engine.evaluate(satisfyAll)).toBe('completed');
      engine.advance();
    }
    expect(engine.allDone()).toBe(true);
    expect(engine.current()).toBeNull();
    expect(engine.toolboxCategories()).toContain('timing');
    expect(engine.toolboxCategories()).toContain('variables');
  });

  it('resumes at the first open challenge when content was inserted or reordered', () => {
    // A save from before 'learn-to-run' existed: three done, index pointed at
    // what used to be challenge 4. The completed set is the durable truth.
    const legacyProgress = {
      completedIds: ['add-platform', 'make-jump', 'add-star'],
      currentIndex: 3,
      hintStages: {},
    };
    const engine = new ChallengeEngine(starterChallenges, legacyProgress);
    expect(engine.current()?.id).toBe('learn-to-run');
  });

  it('round-trips progress through serialization', () => {
    const engine = makeEngine();
    engine.revealNextHint();
    engine.evaluate({ ...baseline, platformCount: 4 });
    engine.advance();

    const resumed = new ChallengeEngine(starterChallenges, engine.progress());
    expect(resumed.current()?.id).toBe('make-jump');
    expect(resumed.progress()).toEqual(engine.progress());
  });
});

describe('challenge-carried environments (KTD4)', () => {
  it('advancing into a challenge that carries a world offers it for application', () => {
    const engine = new ChallengeEngine(arcWithWideFinale());
    expect(engine.pendingEnvironment()).toBeNull();

    completeCurrent(engine);
    expect(engine.current()?.id).toBe('make-jump');
    // Challenge two carries no world, so nothing should swap under the child.
    expect(engine.pendingEnvironment()).toBeNull();

    completeCurrent(engine);
    expect(engine.current()?.id).toBe('go-wide');
    expect(engine.pendingEnvironment()?.world.width).toBe(2400);
  });

  it('applies a challenge world once: the marker stops a re-apply on every render', () => {
    const engine = new ChallengeEngine(arcWithWideFinale());
    completeCurrent(engine);
    completeCurrent(engine);

    expect(engine.pendingEnvironment()).not.toBeNull();
    engine.markEnvironmentApplied();

    expect(engine.pendingEnvironment()).toBeNull();
    expect(engine.progress().appliedEnvironmentChallengeId).toBe('go-wide');
  });

  it('a reload mid-journey does not re-apply the world the save already carries', () => {
    const challenges = arcWithWideFinale();
    const engine = new ChallengeEngine(challenges);
    completeCurrent(engine);
    completeCurrent(engine);
    engine.markEnvironmentApplied();

    const resumed = new ChallengeEngine(challenges, engine.progress());
    expect(resumed.current()?.id).toBe('go-wide');
    expect(resumed.pendingEnvironment()).toBeNull();
    expect(hasChallengeEnvironmentApplied(resumed.progress())).toBe(true);
  });

  it('a saved progress from before the marker existed still resumes and applies the world', () => {
    // R10: old saves have no appliedEnvironmentChallengeId field at all.
    const legacyProgress = {
      completedIds: ['add-platform', 'make-jump'],
      currentIndex: 2,
      hintStages: {},
    };
    const engine = new ChallengeEngine(arcWithWideFinale(), legacyProgress);
    expect(engine.current()?.id).toBe('go-wide');
    expect(hasChallengeEnvironmentApplied(legacyProgress)).toBe(false);
    expect(engine.pendingEnvironment()?.world.width).toBe(2400);
  });

  it('free play (all challenges done) has no world to apply', () => {
    const engine = new ChallengeEngine(arcWithWideFinale());
    completeCurrent(engine);
    completeCurrent(engine);
    engine.markEnvironmentApplied();
    completeCurrent(engine);
    expect(engine.allDone()).toBe(true);
    expect(engine.pendingEnvironment()).toBeNull();
  });
});

describe('the great journey, appended to the arc (R9/R10)', () => {
  const SCREEN_WIDTH = 800;
  /** The seven challenges the arc shipped with before the journey was added. */
  const ORIGINAL_SEVEN = [
    'add-platform',
    'make-jump',
    'learn-to-run',
    'add-star',
    'score-points',
    'enemy-patrol',
    'win-condition',
  ];

  function savedAfterTheOriginalSeven() {
    // A save written when the arc ended at 'win-condition': index pointed past
    // the end (free play). The completed ids are the durable truth.
    return { completedIds: [...ORIGINAL_SEVEN], currentIndex: 7, hintStages: {} };
  }

  it('leaves the original seven challenges first and in order, still world-free', () => {
    expect(starterChallenges.slice(0, 7).map((c) => c.id)).toEqual(ORIGINAL_SEVEN);
    expect(starterChallenges.slice(0, 7).map((c) => c.environment)).toEqual(
      ORIGINAL_SEVEN.map(() => undefined),
    );
  });

  it('a save from the seven-challenge arc reopens on the journey instead of free play', () => {
    const engine = new ChallengeEngine(starterChallenges, savedAfterTheOriginalSeven());
    expect(engine.allDone()).toBe(false);
    expect(engine.current()?.id).toBe('great-journey');
    expect(engine.currentCompleted()).toBe(false);
  });

  it('offers a world wider than the screen with the flag beyond the first screen', () => {
    // AE5: fresh state, no harness — the world comes from bundled data alone.
    const engine = new ChallengeEngine(starterChallenges, savedAfterTheOriginalSeven());
    const world = engine.pendingEnvironment();
    expect(world).not.toBeNull();
    expect(world?.world.width).toBe(2400);
    expect(world?.world.height).toBe(480);
    // Spawn on screen one, flag on screen three: winning means travelling.
    expect(world?.player.spawn.x).toBeLessThan(SCREEN_WIDTH);
    expect(world?.goal?.x).toBeGreaterThan(2 * SCREEN_WIDTH);
    expect(engine.current()?.check).toBe('win_triggered');
  });

  it('lays terrain and treasure on all three screens, not just the first', () => {
    const engine = new ChallengeEngine(starterChallenges, savedAfterTheOriginalSeven());
    const world = engine.pendingEnvironment();
    for (const screen of [0, 1, 2]) {
      const from = screen * SCREEN_WIDTH;
      const to = from + SCREEN_WIDTH;
      const onScreen = (x: number) => x >= from && x < to;
      expect(world?.platforms.filter((p) => onScreen(p.x)).length ?? 0).toBeGreaterThan(0);
      expect(world?.collectibles.filter((c) => onScreen(c.x)).length ?? 0).toBeGreaterThan(0);
    }
  });

  it('lays a walkable, jumpable trail: nothing in the world strands the child', () => {
    // Physics the world is designed against: gravity 900, jump 520 (a ~150px
    // climb), run 200px/s, player 32x44, star 28x28, flag 46x60. Sprites are
    // positioned by their centre.
    const PLAYER_HEIGHT = 44;
    const MAX_JUMP_RISE = 150;
    const MAX_JUMP_RUN = 180; // conservative slice of a full running jump
    const GROUND_TOP = 440;
    const HEAD_ROOM = 20;

    const world = new ChallengeEngine(
      starterChallenges,
      savedAfterTheOriginalSeven(),
    ).pendingEnvironment();
    const surfaces = (world?.platforms ?? []).map((p) => ({
      top: p.y - p.height / 2,
      bottom: p.y + p.height / 2,
      left: p.x - p.width / 2,
      right: p.x + p.width / 2,
    }));
    const ground = surfaces.filter((s) => s.top === GROUND_TOP).sort((a, b) => a.left - b.left);

    // The ground runs unbroken from one end of the world to the other, so
    // 'hold right' always works and a missed jump never costs the journey.
    expect(ground[0].left).toBe(0);
    expect(ground.at(-1)?.right).toBe(world?.world.width);
    for (const [i, slab] of ground.slice(1).entries()) {
      expect(slab.left).toBeLessThanOrEqual(ground[i].right);
    }

    for (const ledge of surfaces.filter((s) => s.top !== GROUND_TOP)) {
      // A ledge low enough to clip a running player's head would stop the
      // journey dead, so every one hangs clear above it.
      expect(ledge.bottom).toBeLessThanOrEqual(GROUND_TOP - PLAYER_HEIGHT - HEAD_ROOM);
      // ...and every one is a jump away from some surface below it.
      const launchable = surfaces.some((from) => {
        const rise = from.top - ledge.top;
        const gap = Math.max(0, ledge.left - from.right, from.left - ledge.right);
        return rise > 0 && rise <= MAX_JUMP_RISE && gap <= MAX_JUMP_RUN;
      });
      expect({ ledge, launchable }).toMatchObject({ launchable: true });
    }

    // Every star is collected just by standing on a surface under it.
    for (const star of world?.collectibles ?? []) {
      const standing = surfaces.some(
        (s) =>
          star.x >= s.left &&
          star.x <= s.right &&
          star.y + 14 >= s.top - PLAYER_HEIGHT &&
          star.y - 14 <= s.top,
      );
      expect({ star, standing }).toMatchObject({ standing: true });
    }

    // The flag is touched by running into it, no leap of faith required.
    const goal = world?.goal;
    expect(goal).toBeDefined();
    expect(ground.some((s) => goal!.x >= s.left && goal!.x <= s.right)).toBe(true);
    expect(goal!.y + 30).toBeGreaterThanOrEqual(GROUND_TOP - PLAYER_HEIGHT);
    expect(goal!.y - 30).toBeLessThanOrEqual(GROUND_TOP);
  });

  it('applies the journey world once and then leaves the child alone', () => {
    const engine = new ChallengeEngine(starterChallenges, savedAfterTheOriginalSeven());
    engine.markEnvironmentApplied();
    expect(engine.pendingEnvironment()).toBeNull();
    expect(engine.progress().appliedEnvironmentChallengeId).toBe('great-journey');
  });

  it('opens the full toolbox, as the winning challenge before it did', () => {
    const engine = new ChallengeEngine(starterChallenges, savedAfterTheOriginalSeven());
    expect(engine.toolboxCategories()).toEqual(starterChallenges[6].toolbox);
  });
});

describe('exactly-once completion emission', () => {
  it('evaluate returns completed exactly once per challenge across repeated play tests', () => {
    const engine = makeEngine();
    const satisfying = { ...baseline, platformCount: 4 };
    const results = [
      engine.evaluate(baseline),
      engine.evaluate(satisfying),
      engine.evaluate(satisfying),
      engine.evaluate(satisfying),
    ];
    expect(results.filter((r) => r === 'completed')).toHaveLength(1);
  });
});
