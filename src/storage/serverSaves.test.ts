import { describe, expect, it } from 'vitest';
import { isWorthSaving } from './serverSaves';
import type { ProjectRecord } from './projects';
import { starterEnvironment } from '../game/starterEnvironment';

function record(overrides: Partial<ProjectRecord>): ProjectRecord {
  return {
    version: 1,
    id: 'g1',
    savedAt: '2026-08-15T10:00:00.000Z',
    idea: 'x',
    workspace: { blocks: { languageVersion: 0, blocks: [] } },
    challengeProgress: { completedIds: [], currentIndex: 0, hintStages: {} },
    environment: starterEnvironment,
    ...overrides,
  };
}

describe('isWorthSaving', () => {
  it('rejects a freshly-booted empty shell', () => {
    expect(isWorthSaving(record({}))).toBe(false);
  });

  it('accepts a game with blocks on the workspace', () => {
    expect(
      isWorthSaving(
        record({ workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'event_start' }] } } }),
      ),
    ).toBe(true);
  });

  it('accepts a game with a completed challenge even with no blocks', () => {
    expect(
      isWorthSaving(
        record({
          challengeProgress: { completedIds: ['add-platform'], currentIndex: 1, hintStages: {} },
        }),
      ),
    ).toBe(true);
  });

  it('tolerates a workspace with no blocks section at all', () => {
    expect(isWorthSaving(record({ workspace: {} }))).toBe(false);
  });
});
