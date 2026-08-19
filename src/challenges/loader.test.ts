import { describe, expect, it } from 'vitest';
import { CHALLENGES_FALLBACK_MESSAGE, loadChallengesFromData } from './loader';
import { starterChallenges } from './starterChallenges';
import { starterEnvironment } from '../game/starterEnvironment';

function challengeFile(environment?: unknown) {
  return {
    version: 1,
    challenges: [
      {
        id: 'go-wide',
        title: 'Run to the flag!',
        prompt: 'Your world just grew. Run right to find the flag.',
        hints: ['Hold the right arrow key.'],
        check: 'win_triggered',
        explanation: 'You crossed a world three screens wide!',
        toolbox: ['events', 'world', 'motion'],
        ...(environment === undefined ? {} : { environment }),
      },
    ],
  };
}

describe('challenge-carried environments in harness data (KTD4)', () => {
  it('carries a valid embedded world through to the challenge', () => {
    const wide = { ...starterEnvironment, world: { width: 2400, height: 480 } };
    const result = loadChallengesFromData(challengeFile(wide));
    expect(result.source).toBe('loaded');
    expect(result.challenges[0].environment?.world.width).toBe(2400);
  });

  it('leaves the world alone for a challenge that carries none', () => {
    const result = loadChallengesFromData(challengeFile());
    expect(result.source).toBe('loaded');
    expect(result.challenges[0].environment).toBeUndefined();
  });

  it('falls back to the bundled challenges when an embedded world is invalid', () => {
    // Six screens is the documented ceiling (KTD3); past it the file is broken.
    const tooWide = { ...starterEnvironment, world: { width: 9999, height: 480 } };
    const result = loadChallengesFromData(challengeFile(tooWide));
    expect(result.source).toBe('fallback');
    expect(result.challenges).toBe(starterChallenges);
    expect(result.kidMessage).toBe(CHALLENGES_FALLBACK_MESSAGE);
  });
});
