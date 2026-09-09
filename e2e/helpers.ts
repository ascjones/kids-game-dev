import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const OUTBOX = path.join(ROOT, 'bridge', 'outbox');
export const INBOX = path.join(ROOT, 'bridge', 'inbox');
export const ENVIRONMENT_JSON = path.join(ROOT, 'game', 'environment', 'environment.json');

/** Remove bridge traffic so each test asserts only on files it caused. */
export function cleanBridge(): void {
  for (const dir of [OUTBOX, INBOX, path.join(OUTBOX, 'processed'), path.join(INBOX, 'processed')]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json')) fs.rmSync(path.join(dir, file));
    }
  }
}

export function outboxFiles(type?: string): string[] {
  return fs
    .readdirSync(OUTBOX)
    .filter((f) => f.endsWith('.json') && (!type || f.includes(type)))
    .sort();
}

export function readOutbox(file: string): { type: string; payload: Record<string, unknown> } {
  return JSON.parse(fs.readFileSync(path.join(OUTBOX, file), 'utf8'));
}

/** Simulate the harness: drop an atomic reply into the inbox. */
export function dropInbox(name: string, message: unknown): void {
  const temp = path.join(INBOX, `.tmp-${name}`);
  fs.writeFileSync(temp, JSON.stringify(message));
  fs.renameSync(temp, path.join(INBOX, name));
}

/**
 * Run a test against a substitute world file. `game/environment/environment.json`
 * holds a real child's game, so the original always comes back — even when the
 * body throws.
 */
export async function withEnvironment<T>(
  environment: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const original = fs.readFileSync(ENVIRONMENT_JSON, 'utf8');
  try {
    fs.writeFileSync(ENVIRONMENT_JSON, JSON.stringify(environment, null, 2));
    return await run();
  } finally {
    fs.writeFileSync(ENVIRONMENT_JSON, original);
  }
}

/** What the dev seam reports about the running scene. */
export interface GameSnapshot {
  camera: { scrollX: number; scrollY: number };
  world: { width: number; height: number };
  player: { x: number; y: number };
  platforms: Array<{ x: number; y: number }>;
}

interface KidGameSeam {
  loadWorkspace(state: unknown): void;
  currentChallengeId(): string | null;
  getCode(): string;
  snapshot(): GameSnapshot;
}

/** Read the camera, world and sprite positions out of the running game. */
export function readSnapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => (window as unknown as { __kidGame: KidGameSeam }).__kidGame.snapshot());
}

/** Get past intake to the workbench, using the bundled starter world. */
export async function bootToWorkbench(page: Page, idea = 'a brave test robot'): Promise<void> {
  await page.goto('/');
  await page.locator('#intake-root textarea').fill(idea);
  await page.locator('#intake-root button.intake-build').click();
  await expect(page.getByRole('button', { name: '🧩 Build blocks (E)' })).toBeVisible();
  await page.waitForFunction(() => '__kidGame' in window);
}

/**
 * Load a block program through the dev seam and enter Play mode. The app has
 * two modes: Build (editor open) and Play (editor closed, session running) —
 * closing the editor is what runs the program.
 */
export async function playProgram(page: Page, blocks: unknown[]): Promise<void> {
  const overlay = page.locator('#editor-overlay');
  if (await overlay.isHidden()) {
    await page.keyboard.press('e');
    await expect(overlay).toBeVisible();
  }
  await page.evaluate(
    (state) =>
      (
        window as unknown as {
          __kidGame: { loadWorkspace(s: unknown): void };
        }
      ).__kidGame.loadWorkspace(state),
    { blocks: { languageVersion: 0, blocks } },
  );
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
}

/**
 * Rewrite the saved project's challenge progress, then reload. Walking the
 * whole arc to reach a late challenge costs minutes; the save is the app's own
 * resume path, so a seeded save exercises the same boot code a returning child
 * hits. Call after the workbench has booted once (the save must exist).
 */
export async function seedChallengeProgress(
  page: Page,
  completedIds: string[],
  currentIndex: number,
): Promise<void> {
  // Let the boot autosave land first, or the reload would race it.
  await page.waitForTimeout(1500);
  await page.evaluate(
    async ({ completedIds, currentIndex }) => {
      const openDatabase = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('kids-game-dev');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });

      const db = await openDatabase();
      const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const get = db.transaction('projects', 'readonly').objectStore('projects').get('current');
        get.onerror = () => reject(get.error);
        get.onsuccess = () => resolve(get.result);
      });
      if (!record) throw new Error('no saved project to seed progress into');
      record.challengeProgress = {
        ...(record.challengeProgress as Record<string, unknown>),
        completedIds,
        currentIndex,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(record, 'current');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => resolve();
      });
    },
    { completedIds, currentIndex },
  );
  await page.reload();
  await page.waitForFunction(() => '__kidGame' in window);
}

// ---- Block program builders (workspace JSON, same shapes the editor saves) --

export const onStart = (first: unknown): unknown => ({
  type: 'event_start',
  x: 20,
  y: 20,
  inputs: { DO: { block: first } },
});

export const chain = (blocks: Array<Record<string, unknown>>): unknown =>
  blocks.reduceRight((next, block) => ({ ...block, ...(next ? { next: { block: next } } : {}) }), null as unknown);

export const PROGRAMS = {
  addPlatform: [onStart({ type: 'spawn_platform', fields: { X: 400, Y: 300, WIDTH: 140 } })],
  runOnArrowKeys: [
    {
      type: 'event_key',
      x: 20,
      y: 20,
      fields: { KEY: 'right' },
      inputs: { DO: { block: { type: 'move_right', fields: { SPEED: 200 } } } },
    },
    {
      type: 'event_key',
      x: 20,
      y: 160,
      fields: { KEY: 'left' },
      inputs: { DO: { block: { type: 'move_left', fields: { SPEED: 200 } } } },
    },
  ],
  jumpOnUpKey: [
    {
      type: 'event_key',
      x: 20,
      y: 20,
      fields: { KEY: 'up' },
      inputs: { DO: { block: { type: 'jump', fields: { STRENGTH: '520' } } } },
    },
  ],
  addStar: [onStart({ type: 'spawn_collectible', fields: { X: 250, Y: 415 } })],
  scoreOnCollect: [
    onStart(
      chain([
        { type: 'spawn_collectible', fields: { X: 250, Y: 415 } },
        { type: 'move_right', fields: { SPEED: 200 } },
      ]),
    ),
    {
      type: 'event_collect',
      x: 20,
      y: 220,
      inputs: { DO: { block: { type: 'score_add', fields: { AMOUNT: 1 } } } },
    },
  ],
  patrolEnemies: [onStart({ type: 'enemy_patrol', fields: { SPEED: 150 } })],
  winAtGoal: [
    onStart({ type: 'move_right', fields: { SPEED: 200 } }),
    {
      type: 'event_touch',
      x: 20,
      y: 220,
      fields: { KIND: 'goal' },
      inputs: { DO: { block: { type: 'game_win' } } },
    },
  ],
};
