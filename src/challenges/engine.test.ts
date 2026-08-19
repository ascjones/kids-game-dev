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
