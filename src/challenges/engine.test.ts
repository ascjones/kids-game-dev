import { describe, expect, it } from 'vitest';
import { ChallengeEngine } from './engine';
import { starterChallenges } from './starterChallenges';
import { BASELINE_SESSION, type SessionState } from './types';

const baseline: SessionState = { ...BASELINE_SESSION, initialPlatformCount: 3, platformCount: 3 };

function makeEngine() {
  return new ChallengeEngine(starterChallenges);
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

  it('completing all six ends in free play with every category', () => {
    const engine = makeEngine();
    const satisfyAll: SessionState = {
      ...baseline,
      platformCount: 4,
      jumped: true,
      collectiblesSpawned: 1,
      scoreIncreasedOnCollect: true,
      patrolStarted: true,
      enemyPatrolled: true,
      winTriggered: true,
    };
    for (let i = 0; i < 6; i++) {
      expect(engine.evaluate(satisfyAll)).toBe('completed');
      engine.advance();
    }
    expect(engine.allDone()).toBe(true);
    expect(engine.current()).toBeNull();
    expect(engine.toolboxCategories()).toContain('timing');
    expect(engine.toolboxCategories()).toContain('variables');
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
