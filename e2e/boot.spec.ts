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
