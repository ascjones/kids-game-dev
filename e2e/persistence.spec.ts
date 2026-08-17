import { expect, test } from '@playwright/test';
import { bootToWorkbench, cleanBridge, playProgram, PROGRAMS } from './helpers';

test.beforeEach(() => cleanBridge());

test('a project survives reload mid-challenge', async ({ page }) => {
  await bootToWorkbench(page);
  await playProgram(page, PROGRAMS.addPlatform);
  await expect(page.locator('#challenge-panel .explanation')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Next challenge →' }).click();
  await expect(page.locator('#challenge-panel')).toContainText('jump');
  // Let the debounced autosave land before reloading (toolbar lives in the editor overlay).
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '💾 Save' }).click();
  await expect(page.locator('.kid-notice').last()).toContainText('Saved');

  await page.reload();
  // No intake this time: the saved project resumes on challenge 2 with its blocks.
  await expect(page.getByRole('button', { name: '🧩 Build blocks (E)' })).toBeVisible();
  await expect(page.locator('#intake-root')).toHaveCount(0);
  await expect(page.locator('#challenge-panel')).toContainText('jump');
  await expect(page.locator('#js-view')).toContainText('api.spawnPlatform');
});

test('export then import round-trips through a single file', async ({ page }) => {
  await bootToWorkbench(page);
  await playProgram(page, PROGRAMS.addPlatform);
  await expect(page.locator('#challenge-panel .explanation')).toBeVisible({ timeout: 20_000 });
  // Toolbar lives in the editor overlay; save so import asks before replacing.
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '💾 Save' }).click();
  await expect(page.locator('.kid-notice').last()).toContainText('Saved');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '📤 Save to a file' }).click();
  const download = await downloadPromise;
  const filePath = test.info().outputPath('my-game.json');
  await download.saveAs(filePath);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '📥 Load from a file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);

  // Importing over a non-empty project asks first.
  await expect(page.locator('.kid-notice').last()).toContainText('are you sure');
  await page.getByRole('button', { name: 'Yes, do it' }).click();
  await expect(page.locator('.kid-notice').last()).toContainText('Your game is back');
  await expect(page.locator('#js-view')).toContainText('api.spawnPlatform');
});

test('a corrupt import is rejected and the project is untouched', async ({ page }) => {
  await bootToWorkbench(page);
  await playProgram(page, PROGRAMS.addPlatform);
  await expect(page.locator('#challenge-panel .explanation')).toBeVisible({ timeout: 20_000 });

  const badFile = test.info().outputPath('not-a-game.json');
  const fs = await import('node:fs');
  fs.writeFileSync(badFile, '{ "definitely": "not a project"');

  await page.keyboard.press('e');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '📥 Load from a file' }).click();
  await (await chooserPromise).setFiles(badFile);

  await expect(page.locator('.kid-notice').last()).toContainText("doesn't look like");
  await expect(page.locator('#js-view')).toContainText('api.spawnPlatform');
});
