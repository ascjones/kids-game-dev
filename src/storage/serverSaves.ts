import { projectRecordSchema, type ProjectRecord } from './projects';

// Server-side game library (saves/ on disk, via the dev-server middleware).
// This is the default home for games: IndexedDB stays the fast local cache
// for the current one. Every call tolerates a missing server.

export interface SaveSummary {
  id: string;
  idea: string;
  title: string;
  savedAt: string;
  completedChallenges: number;
}

/**
 * A game earns its library slot once it has any real content — blocks on the
 * workspace or a completed challenge. Freshly-booted empty shells (including
 * abandoned intake runs) never reach the server, which keeps the saved-games
 * list free of duplicates.
 */
export function isWorthSaving(record: ProjectRecord): boolean {
  const blocks = (record.workspace as { blocks?: { blocks?: unknown[] } }).blocks?.blocks;
  return (blocks?.length ?? 0) > 0 || record.challengeProgress.completedIds.length > 0;
}

export async function saveToServer(record: ProjectRecord): Promise<boolean> {
  if (!isWorthSaving(record)) return false;
  try {
    const res = await fetch('/__bridge/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listServerSaves(): Promise<SaveSummary[]> {
  try {
    const res = await fetch('/__bridge/saves');
    if (!res.ok) return [];
    const data = (await res.json()) as { saves?: SaveSummary[] };
    return data.saves ?? [];
  } catch {
    return [];
  }
}

export async function loadServerSave(id: string): Promise<ProjectRecord | null> {
  try {
    const res = await fetch(`/__bridge/saves/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { record?: unknown };
    const parsed = projectRecordSchema.safeParse(data.record);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
