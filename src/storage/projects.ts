import { z } from 'zod';
import { environmentSchema } from '../game/environmentSchema';
import { starterEnvironment } from '../game/starterEnvironment';
import { challengeProgressSchema } from '../challenges/types';
import { getDb, PROJECT_STORE } from './db';

export const projectRecordSchema = z.object({
  version: z.literal(1),
  /** Stable per-game id; names the file in the server-side library. */
  id: z.string().default(''),
  savedAt: z.string(),
  idea: z.string().default(''),
  workspace: z.record(z.string(), z.unknown()),
  challengeProgress: challengeProgressSchema,
  environment: environmentSchema,
});

export type ProjectRecord = z.infer<typeof projectRecordSchema>;

const CURRENT_KEY = 'current';

export async function saveProject(record: ProjectRecord): Promise<void> {
  const db = await getDb();
  await db.put(PROJECT_STORE, record, CURRENT_KEY);
}

export async function loadProject(): Promise<ProjectRecord | null> {
  const db = await getDb();
  const raw = await db.get(PROJECT_STORE, CURRENT_KEY);
  if (raw === undefined) return null;
  return parseStoredProject(raw);
}

/**
 * Parse a stored project, rescuing the child's work when only its world is
 * unusable. The environment schema is the part that tightens over time (world
 * bounds, new required fields), and a whole-record rejection would throw away
 * the blocks and challenge progress too — which reads to the child as "my game
 * is gone". A world we cannot parse degrades to the starter world instead; the
 * harness or the next challenge replaces it soon enough.
 */
export function parseStoredProject(raw: unknown): ProjectRecord | null {
  const parsed = projectRecordSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw === null || typeof raw !== 'object') return null;
  const rescued = projectRecordSchema.safeParse({
    ...(raw as Record<string, unknown>),
    environment: starterEnvironment,
  });
  return rescued.success ? rescued.data : null;
}

export async function hasProject(): Promise<boolean> {
  return (await loadProject()) !== null;
}

/** Remove the current project (the "start a new game" reset). */
export async function deleteProject(): Promise<void> {
  const db = await getDb();
  await db.delete(PROJECT_STORE, CURRENT_KEY);
}

export interface Autosaver {
  /** Note a change; the actual write happens after the debounce window. */
  trigger(): void;
  /** Write immediately if a save is pending (e.g. before an environment swap). */
  flush(): Promise<void>;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Debounced autosave (U9): rapid edits collapse into one write. Persists to
 * IndexedDB and, by default, mirrors to the server-side library.
 */
export function createAutosaver(
  collect: () => ProjectRecord,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
  mirror: (record: ProjectRecord) => Promise<unknown> = async () => {},
): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    const record = collect();
    await saveProject(record);
    void mirror(record);
  };

  return {
    trigger(): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, debounceMs);
    },
    async flush(): Promise<void> {
      if (!timer) return;
      clearTimeout(timer);
      await write();
    },
  };
}
