import { challengeFileSchema, type ChallengeDef } from './types';
import { starterChallenges } from './starterChallenges';

export interface ChallengesLoadResult {
  challenges: ChallengeDef[];
  source: 'loaded' | 'fallback';
  kidMessage?: string;
}

const CHALLENGES_URL = '/game/environment/challenges.json';

export const CHALLENGES_FALLBACK_MESSAGE =
  'The challenge list got a bit muddled, so we set out the regular challenges for you.';

export function loadChallengesFromData(data: unknown): ChallengesLoadResult {
  const parsed = challengeFileSchema.safeParse(data);
  if (parsed.success) {
    return { challenges: parsed.data.challenges, source: 'loaded' };
  }
  return {
    challenges: starterChallenges,
    source: 'fallback',
    kidMessage: CHALLENGES_FALLBACK_MESSAGE,
  };
}

/** Fetch harness-owned challenge content; any failure degrades to the bundled six. */
export async function fetchChallenges(): Promise<ChallengesLoadResult> {
  try {
    const res = await fetch(`${CHALLENGES_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`challenges fetch failed: ${res.status}`);
    return loadChallengesFromData(await res.json());
  } catch {
    return { challenges: starterChallenges, source: 'fallback' };
  }
}
