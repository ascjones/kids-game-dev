// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from './db';
import { createAutosaver, loadProject, saveProject, type ProjectRecord } from './projects';
import { starterEnvironment } from '../game/starterEnvironment';

function makeRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    version: 1,
    savedAt: '2026-08-12T10:00:00.000Z',
    idea: 'ninja cat',
    workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'event_start' }] } },
    challengeProgress: {
      completedIds: ['add-platform'],
      currentIndex: 1,
      hintStages: { 'add-platform': 2 },
    },
    environment: starterEnvironment,
    ...overrides,
  };
}

beforeEach(() => {
  indexedDB = new IDBFactory();
  resetDbForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('project persistence', () => {
  it('save then load restores workspace and challenge progress exactly', async () => {
    const record = makeRecord();
    await saveProject(record);
    const loaded = await loadProject();
    expect(loaded).toEqual(record);
  });

  it('loadProject returns null on an empty store', async () => {
    expect(await loadProject()).toBeNull();
  });
});

describe('debounced autosave', () => {
  it('rapid consecutive edits produce one write, not one per edit', async () => {
    vi.useFakeTimers();
    let collected = 0;
    const autosaver = createAutosaver(() => {
      collected += 1;
      return makeRecord({ idea: `edit-${collected}` });
    }, 100);

    for (let i = 0; i < 10; i++) {
      autosaver.trigger();
      vi.advanceTimersByTime(20);
    }
    await vi.advanceTimersByTimeAsync(200);

    expect(collected).toBe(1);
    vi.useRealTimers();
    const loaded = await loadProject();
    expect(loaded?.idea).toBe('edit-1');
  });

  it('flush writes a pending save immediately', async () => {
    vi.useFakeTimers();
    const autosaver = createAutosaver(() => makeRecord({ idea: 'flushed' }), 5000);
    autosaver.trigger();
    vi.useRealTimers();
    await autosaver.flush();
    expect((await loadProject())?.idea).toBe('flushed');
  });

  it('flush without a pending save writes nothing', async () => {
    const autosaver = createAutosaver(() => makeRecord(), 100);
    await autosaver.flush();
    expect(await loadProject()).toBeNull();
  });
});
