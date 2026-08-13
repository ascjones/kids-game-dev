import { z } from 'zod';
import { environmentSchema } from '../game/environmentSchema';
import { challengeProgressSchema } from '../challenges/types';
import { getDb, PROJECT_STORE } from './db';

export const projectRecordSchema = z.object({
  version: z.literal(1),
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
  const parsed = projectRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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

/** Debounced autosave (U9): rapid edits collapse into one write. */
export function createAutosaver(
  collect: () => ProjectRecord,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    await saveProject(collect());
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
