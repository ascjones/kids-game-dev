import { expect, test, type Page } from '@playwright/test';
import { bootToWorkbench, cleanBridge, outboxFiles, playProgram, PROGRAMS } from './helpers';

// The release-gate playthrough (DoD): all six challenges completed in the
// browser with block programs, each ending in its kid-language explanation.

test.beforeEach(() => cleanBridge());

async function expectCompletedAndAdvance(page: Page, explanationBit: string): Promise<void> {
  await expect(page.locator('#challenge-panel .explanation')).toContainText(explanationBit, {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Next challenge →' }).click();
}

test('all challenges are completable with blocks only', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToWorkbench(page);

  // 1. Add a platform
  await expect(page.locator('#challenge-panel')).toContainText('Build a new platform!');
  await playProgram(page, PROGRAMS.addPlatform);
  await expectCompletedAndAdvance(page, 'told the game to build a platform');

  // 2. Make the character jump (hold the up arrow during the play test)
  await expect(page.locator('#challenge-panel')).toContainText('jump');
  await playProgram(page, PROGRAMS.jumpOnUpKey);
  await page.keyboard.down('ArrowUp');
  await expectCompletedAndAdvance(page, 'press up');
  await page.keyboard.up('ArrowUp');

  // 3. Learn to run (hold the right arrow during the play test)
  await expect(page.locator('#challenge-panel')).toContainText('run');
  await playProgram(page, PROGRAMS.runOnArrowKeys);
  await page.keyboard.down('ArrowRight');
  await expectCompletedAndAdvance(page, 'YOU steer the player');
  await page.keyboard.up('ArrowRight');

  // 4. Add a collectible
  await playProgram(page, PROGRAMS.addStar);
  await expectCompletedAndAdvance(page, 'new star into the world');

  // 5. Increase score on collect (run right through the star on the ground)
  await playProgram(page, PROGRAMS.scoreOnCollect);
  await expectCompletedAndAdvance(page, 'collect a star, score goes up');

  // 6. Make an enemy patrol (it must reach both patrol ends)
  await playProgram(page, PROGRAMS.patrolEnemies);
  await expectCompletedAndAdvance(page, 'gave the enemy a brain');

  // 7. Win at the goal flag
  await playProgram(page, PROGRAMS.winAtGoal);
  await expect(page.locator('#challenge-panel .explanation')).toContainText('YOU WIN', {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Next challenge →' }).click();

  // Free play unlocks the whole toolbox, and every completion reached the bridge.
  await expect(page.locator('#challenge-panel')).toContainText('finished every challenge');
  await expect(() => {
    expect(outboxFiles('challenge_completed')).toHaveLength(7);
  }).toPass();
});

test('a played session that misses the goal shows the "not yet" state on returning to Build', async ({
  page,
}) => {
  await bootToWorkbench(page);
  // A clean program that does not add a platform: challenge 1 is not satisfied.
  await playProgram(page, PROGRAMS.jumpOnUpKey);
  // Play long enough to count as a real attempt, then go back to building.
  await page.waitForTimeout(3500);
  await page.keyboard.press('e');
  await expect(page.locator('#challenge-panel .not-yet')).toContainText('Not yet');
  await expect(page.locator('#challenge-panel .explanation')).toHaveCount(0);
});
