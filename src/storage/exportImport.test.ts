import { describe, expect, it } from 'vitest';
import {
  IMPORT_CONFIRM_MESSAGE,
  IMPORT_ERROR_MESSAGE,
  importProjectFromText,
  parseProjectFile,
  serializeProject,
  type ImportDeps,
} from './exportImport';
import type { ProjectRecord } from './projects';
import { starterEnvironment } from '../game/starterEnvironment';

const record: ProjectRecord = {
  version: 1,
  id: 'test-game',
  savedAt: '2026-08-12T10:00:00.000Z',
  idea: 'dragon bakery',
  workspace: { blocks: { languageVersion: 0, blocks: [] } },
  challengeProgress: { completedIds: [], currentIndex: 0, hintStages: {} },
  environment: starterEnvironment,
};

function makeDeps(overrides: Partial<ImportDeps> = {}) {
  const applied: ProjectRecord[] = [];
  const errors: string[] = [];
  const confirms: string[] = [];
  const deps: ImportDeps = {
    hasExistingProject: async () => false,
    confirm: async (message) => {
      confirms.push(message);
      return true;
    },
    applyProject: async (r) => {
      applied.push(r);
    },
    announceError: (message) => errors.push(message),
    ...overrides,
  };
  return { deps, applied, errors, confirms };
}

describe('export / import round trip', () => {
  it('export then import into an empty store reproduces the project', async () => {
    const text = serializeProject(record);
    const { deps, applied } = makeDeps();
    const outcome = await importProjectFromText(deps, text);
    expect(outcome).toBe('imported');
    expect(applied).toEqual([record]);
  });
});

describe('import safety', () => {
  it('asks for confirmation over a non-empty project; declining leaves it untouched', async () => {
    const { deps, applied, confirms } = makeDeps({
      hasExistingProject: async () => true,
      confirm: async (message) => {
        confirms.push(message);
        return false;
      },
    });
    const outcome = await importProjectFromText(deps, serializeProject(record));
    expect(outcome).toBe('declined');
    expect(confirms).toEqual([IMPORT_CONFIRM_MESSAGE]);
    expect(applied).toHaveLength(0);
  });

  it('rejects a corrupt file with a kid-language error and applies nothing', async () => {
    const { deps, applied, errors } = makeDeps({ hasExistingProject: async () => true });
    const outcome = await importProjectFromText(deps, '{ "not": "a project"');
    expect(outcome).toBe('rejected');
    expect(errors).toEqual([IMPORT_ERROR_MESSAGE]);
    expect(errors[0]).not.toMatch(/JSON|parse|schema|invalid/i);
    expect(applied).toHaveLength(0);
  });

  it('rejects valid JSON that is not a project file', () => {
    const result = parseProjectFile(JSON.stringify({ version: 99, junk: true }));
    expect(result.ok).toBe(false);
  });
});
