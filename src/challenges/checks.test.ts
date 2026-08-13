import { describe, expect, it } from 'vitest';
import { runCheck } from './checks';
import { BASELINE_SESSION, type CheckName, type SessionState } from './types';

const baseline: SessionState = { ...BASELINE_SESSION, initialPlatformCount: 3, platformCount: 3 };

// Each of the six checks: one satisfying state, and the baseline must fail (KTD8).
const satisfying: Record<CheckName, Partial<SessionState>> = {
  platform_added: { platformCount: 4 },
  moved: { moved: true },
  jumped: { jumped: true },
  collectible_added: { collectiblesSpawned: 1 },
  score_on_collect: { scoreIncreasedOnCollect: true, collectedCount: 1, score: 1 },
  enemy_patrolled: { patrolStarted: true, enemyPatrolled: true },
  win_triggered: { winTriggered: true },
};

describe.each(Object.entries(satisfying) as Array<[CheckName, Partial<SessionState>]>)(
  'check %s',
  (check, delta) => {
    it('passes on satisfying state', () => {
      expect(runCheck(check, { ...baseline, ...delta })).toBe(true);
    });

    it('fails on baseline state', () => {
      expect(runCheck(check, baseline)).toBe(false);
    });
  },
);

describe('check params', () => {
  it('platform_added respects a minNew param', () => {
    const state = { ...baseline, platformCount: 4 };
    expect(runCheck('platform_added', state, { minNew: 2 })).toBe(false);
    expect(runCheck('platform_added', { ...state, platformCount: 5 }, { minNew: 2 })).toBe(true);
  });

  it('enemy_patrolled requires the patrol to have been started by the program', () => {
    expect(runCheck('enemy_patrolled', { ...baseline, enemyPatrolled: true })).toBe(false);
  });
});
