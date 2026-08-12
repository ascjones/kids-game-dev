import { environmentSchema, type Environment } from './environmentSchema';
import { starterEnvironment } from './starterEnvironment';

export interface LoadResult {
  environment: Environment;
  source: 'loaded' | 'fallback';
  /** Kid-language notice to show when we fell back (R9). */
  kidMessage?: string;
}

export const FALLBACK_KID_MESSAGE =
  "Your world's blueprint got a bit scrambled, so we set up the starter world for now. Your game is safe!";

/** Parse unknown data into a validated Environment, or fall back to the bundled starter. */
export function loadEnvironmentFromData(data: unknown): LoadResult {
  const parsed = environmentSchema.safeParse(data);
  if (parsed.success) {
    return { environment: parsed.data, source: 'loaded' };
  }
  return {
    environment: starterEnvironment,
    source: 'fallback',
    kidMessage: FALLBACK_KID_MESSAGE,
  };
}

const ENVIRONMENT_URL = '/game/environment/environment.json';

/** Fetch the harness-owned environment file; any failure degrades to the bundled starter. */
export async function fetchEnvironment(): Promise<LoadResult> {
  try {
    const res = await fetch(`${ENVIRONMENT_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`environment fetch failed: ${res.status}`);
    return loadEnvironmentFromData(await res.json());
  } catch {
    return {
      environment: starterEnvironment,
      source: 'fallback',
      kidMessage: FALLBACK_KID_MESSAGE,
    };
  }
}
