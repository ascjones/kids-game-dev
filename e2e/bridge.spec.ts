import * as fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  bootToWorkbench,
  cleanBridge,
  dropInbox,
  ENVIRONMENT_JSON,
  outboxFiles,
  playProgram,
  PROGRAMS,
  readOutbox,
} from './helpers';

// App ↔ harness loop over real files, with this test playing the harness.

test.beforeEach(() => cleanBridge());

test('submitting an idea writes a new_game_idea decision to the outbox', async ({ page }) => {
  await bootToWorkbench(page, 'a dragon who bakes cakes');
  const files = outboxFiles('new_game_idea');
  expect(files).toHaveLength(1);
  const envelope = readOutbox(files[0]);
  expect(envelope.payload).toEqual({ idea: 'a dragon who bakes cakes', genre: 'platformer' });
});

test('the free-request box sends the child\'s words verbatim', async ({ page }) => {
  await bootToWorkbench(page);
  await page.locator('#game-maker-box textarea').fill('make my player a wizard');
  await page.getByRole('button', { name: 'Send' }).click();
  // The wizard box shows in-box progress ("Casting …") instead of a toast.
  await expect(page.locator('#game-maker-box .gm-status')).toContainText('make my player a wizard');
  await expect(() => {
    const files = outboxFiles('free_request');
    expect(files).toHaveLength(1);
    expect(readOutbox(files[0]).payload.request).toBe('make my player a wizard');
  }).toPass();
});

test('a harness message appears to the child on the next poll', async ({ page }) => {
  await bootToWorkbench(page);
  dropInbox('msg-1.json', { type: 'message', payload: { text: 'I built your castle!' } });
  await expect(page.locator('.kid-notice', { hasText: 'I built your castle!' })).toBeVisible({
    timeout: 10_000,
  });
});

test('a harness environment edit reaches the running game without a reload', async ({ page }) => {
  const original = fs.readFileSync(ENVIRONMENT_JSON, 'utf8');
  try {
    await bootToWorkbench(page);
    // Give the child progress so the swap announces itself.
    await playProgram(page, PROGRAMS.addPlatform);
    await expect(page.locator('#challenge-panel .explanation')).toBeVisible({ timeout: 20_000 });

    const edited = JSON.parse(original);
    edited.title = 'Dragon Bakery';
    edited.theme.sky = '#331155';
    fs.writeFileSync(ENVIRONMENT_JSON, JSON.stringify(edited, null, 2));
    dropInbox('env-1.json', { type: 'environment_updated', payload: { note: 'new world' } });

    await expect(page.locator('.kid-notice').last()).toContainText(
      'finished a new world',
      { timeout: 10_000 },
    );
  } finally {
    fs.writeFileSync(ENVIRONMENT_JSON, original);
  }
});
