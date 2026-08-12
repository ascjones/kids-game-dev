import { projectRecordSchema, type ProjectRecord } from './projects';

// KTD5: the export file is the durable backup (IndexedDB can be evicted).
// Import never touches existing data unless the file validates and the child
// confirms the overwrite.

export const IMPORT_ERROR_MESSAGE =
  "That file doesn't look like one of your saved games, so we left everything just as it was. Try a different file!";

export const IMPORT_CONFIRM_MESSAGE =
  'This will replace your current game with the one from the file — are you sure?';

export function serializeProject(record: ProjectRecord): string {
  return JSON.stringify(record, null, 2);
}

export type ImportResult =
  | { ok: true; record: ProjectRecord }
  | { ok: false; kidMessage: string };

/** Validate an imported file's text; nothing is replaced here. */
export function parseProjectFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, kidMessage: IMPORT_ERROR_MESSAGE };
  }
  const parsed = projectRecordSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, kidMessage: IMPORT_ERROR_MESSAGE };
  }
  return { ok: true, record: parsed.data };
}

/** Trigger a browser download of the project as a single .json file. */
export function downloadProject(record: ProjectRecord): void {
  const blob = new Blob([serializeProject(record)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'my-game.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ImportDeps {
  hasExistingProject(): Promise<boolean>;
  /** Kid-language confirm; resolves true to proceed. */
  confirm(message: string): Promise<boolean>;
  applyProject(record: ProjectRecord): Promise<void>;
  announceError(kidMessage: string): void;
}

export type ImportOutcome = 'imported' | 'declined' | 'rejected';

/**
 * Full import flow: validate first, confirm if a non-empty project would be
 * replaced, and only then apply. A corrupt file leaves existing data untouched.
 */
export async function importProjectFromText(
  deps: ImportDeps,
  text: string,
): Promise<ImportOutcome> {
  const result = parseProjectFile(text);
  if (!result.ok) {
    deps.announceError(result.kidMessage);
    return 'rejected';
  }
  if (await deps.hasExistingProject()) {
    const confirmed = await deps.confirm(IMPORT_CONFIRM_MESSAGE);
    if (!confirmed) return 'declined';
  }
  await deps.applyProject(result.record);
  return 'imported';
}
