import { z } from 'zod';
import { ALL_CATEGORY_IDS, type CategoryId } from '../blocks/toolbox';
import { environmentSchema } from '../game/environmentSchema';

// Challenge content is harness-editable data in game/environment/challenges.json
// (KTD9): the harness may rewrite prompts, hints, and explanations, but the
// check names are the contract with the in-app deterministic predicates (KTD8).

export const CHECK_NAMES = [
  'platform_added',
  'moved',
  'jumped',
  'collectible_added',
  'score_on_collect',
  'enemy_patrolled',
  'win_triggered',
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];

const categoryId = z.enum(ALL_CATEGORY_IDS as [CategoryId, ...CategoryId[]]);

export const challengeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  hints: z.array(z.string().min(1)).min(1),
  check: z.enum(CHECK_NAMES),
  params: z.record(z.string(), z.number()).default({}),
  explanation: z.string().min(1),
  toolbox: z.array(categoryId).min(1),
  // A challenge may bring its own world (KTD4): that is how the arc widens
  // past the starter screen. Applied once, on the first transition into the
  // challenge, through the same swap path as a harness environment update.
  environment: environmentSchema.optional(),
});

export const challengeFileSchema = z.object({
  version: z.number().int().default(1),
  challenges: z.array(challengeSchema).min(1),
});

export type ChallengeDef = z.infer<typeof challengeSchema>;

/**
 * Everything the completion predicates can see: merged from the runtime's
 * per-run stats and the scene's world facts at evaluation time.
 */
export interface SessionState {
  initialPlatformCount: number;
  platformCount: number;
  moved: boolean;
  jumped: boolean;
  collectiblesSpawned: number;
  collectedCount: number;
  score: number;
  scoreIncreasedOnCollect: boolean;
  patrolStarted: boolean;
  enemyPatrolled: boolean;
  winTriggered: boolean;
}

export const BASELINE_SESSION: SessionState = {
  initialPlatformCount: 0,
  platformCount: 0,
  moved: false,
  jumped: false,
  collectiblesSpawned: 0,
  collectedCount: 0,
  score: 0,
  scoreIncreasedOnCollect: false,
  patrolStarted: false,
  enemyPatrolled: false,
  winTriggered: false,
};

/** Serializable challenge progress, persisted with the project (R14). */
export interface ChallengeProgress {
  completedIds: string[];
  currentIndex: number;
  hintStages: Record<string, number>;
  /**
   * Which challenge's bundled world was last applied (KTD4). Absent in saves
   * written before challenges could carry worlds, and in games that have not
   * reached one yet.
   */
  appliedEnvironmentChallengeId?: string;
}

export const challengeProgressSchema = z.object({
  completedIds: z.array(z.string()),
  currentIndex: z.number().int().nonnegative(),
  hintStages: z.record(z.string(), z.number().int().nonnegative()),
  // Optional so older saves keep parsing (R10).
  appliedEnvironmentChallengeId: z.string().optional(),
});

export function emptyProgress(): ChallengeProgress {
  return { completedIds: [], currentIndex: 0, hintStages: {} };
}

/**
 * Whether this save is already living on a challenge-carried world. When it is,
 * that saved world outranks the harness file on boot — otherwise a reload would
 * silently revert a mid-journey world (KTD4).
 */
export function hasChallengeEnvironmentApplied(
  progress: ChallengeProgress | null | undefined,
): boolean {
  return progress?.appliedEnvironmentChallengeId !== undefined;
}
