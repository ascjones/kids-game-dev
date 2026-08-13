import type { CheckName, SessionState } from './types';

// KTD8: completion is detected in-app by named deterministic predicates over
// session state — instant, offline, testable. Challenge content refers to
// these by name; adding a genre means adding predicates, not changing the engine.

type Check = (state: SessionState, params: Record<string, number>) => boolean;

export const CHECKS: Record<CheckName, Check> = {
  platform_added: (state, params) =>
    state.platformCount - state.initialPlatformCount >= (params.minNew ?? 1),
  moved: (state) => state.moved,
  jumped: (state) => state.jumped,
  collectible_added: (state, params) => state.collectiblesSpawned >= (params.minNew ?? 1),
  score_on_collect: (state) => state.scoreIncreasedOnCollect,
  enemy_patrolled: (state) => state.patrolStarted && state.enemyPatrolled,
  win_triggered: (state) => state.winTriggered,
};

export function runCheck(
  check: CheckName,
  state: SessionState,
  params: Record<string, number> = {},
): boolean {
  return CHECKS[check](state, params);
}
