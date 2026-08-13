import { expect, test } from '@playwright/test';
import { bootToWorkbench, cleanBridge } from './helpers';

test.beforeEach(() => cleanBridge());

test('first run shows intake with six genres, five locked', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await expect(page.locator('#intake-root h1')).toContainText("Let's make YOUR game");
  const cards = page.locator('.genre-card');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('.genre-card:disabled')).toHaveCount(5);
  await expect(cards.filter({ hasText: 'Jump & Run' })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('intake falls back to the starter world and boots a working game canvas', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await bootToWorkbench(page);
  await expect(page.locator('#game-container canvas')).toBeVisible();
  await expect(page.locator('#challenge-panel')).toContainText('Build a new platform!');
  await expect(page.locator('#js-view')).toContainText('Drag some blocks');
  expect(pageErrors).toEqual([]);
});

test('the block editor opens as an overlay via button, E key, and Escape', async ({ page }) => {
  await bootToWorkbench(page);
  const overlay = page.locator('#editor-overlay');
  await expect(overlay).toBeHidden();

  await page.getByRole('button', { name: '🧩 Blocks (E)' }).click();
  await expect(overlay).toBeVisible();
  await expect(page.getByRole('region', { name: 'Blocks workspace.' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  await page.keyboard.press('e');
  await expect(overlay).toBeVisible();
  await page.keyboard.press('e');
  await expect(overlay).toBeHidden();

  // Typing an "e" into the free-request box must not toggle the editor.
  await page.locator('#game-maker-box input').fill('make everything electric');
  await expect(overlay).toBeHidden();
});

test('spaces and arrows type normally into text fields despite Phaser key capture', async ({
  page,
}) => {
  await bootToWorkbench(page);
  const input = page.locator('#game-maker-box input');
  await input.click();
  // Real key events (not fill) so Phaser's window-level capture is exercised.
  await input.pressSequentially('a big castle');
  await expect(input).toHaveValue('a big castle');
});
