import { describe, expect, it } from 'vitest';
import { FALLBACK_KID_MESSAGE, loadEnvironmentFromData } from './environmentLoader';
import { starterEnvironment } from './starterEnvironment';

const validEnvironment = {
  player: { spawn: { x: 100, y: 360 } },
  platforms: [
    { x: 400, y: 460, width: 800, height: 40 },
    { x: 250, y: 350, width: 160 },
  ],
  collectibles: [{ x: 520, y: 210 }],
  enemies: [{ x: 620, y: 420, patrol: { minX: 480, maxX: 760 } }],
};

describe('loadEnvironmentFromData', () => {
  it('parses valid environment JSON with the expected object counts', () => {
    const result = loadEnvironmentFromData(validEnvironment);
    expect(result.source).toBe('loaded');
    expect(result.environment.platforms).toHaveLength(2);
    expect(result.environment.collectibles).toHaveLength(1);
    expect(result.environment.enemies).toHaveLength(1);
    expect(result.environment.platforms[1].height).toBe(24);
    expect(result.environment.collectibles[0].kind).toBe('star');
  });

  it('loads an environment missing an optional section with that group empty', () => {
    const { enemies: _enemies, collectibles: _collectibles, ...noOptionals } = validEnvironment;
    const result = loadEnvironmentFromData(noOptionals);
    expect(result.source).toBe('loaded');
    expect(result.environment.enemies).toEqual([]);
    expect(result.environment.collectibles).toEqual([]);
    expect(result.environment.goal).toBeUndefined();
  });

  it('rejects a malformed environment with a kid-language error and starter fallback', () => {
    const malformed = { ...validEnvironment, player: { spawn: { x: 'left', y: 360 } } };
    const result = loadEnvironmentFromData(malformed);
    expect(result.source).toBe('fallback');
    expect(result.environment).toEqual(starterEnvironment);
    expect(result.kidMessage).toBe(FALLBACK_KID_MESSAGE);
    expect(result.kidMessage).not.toMatch(/error|invalid|expected|parse/i);
  });

  it('rejects an environment missing the player spawn and falls back', () => {
    const { player: _player, ...missingSpawn } = validEnvironment;
    const result = loadEnvironmentFromData(missingSpawn);
    expect(result.source).toBe('fallback');
    expect(result.environment).toEqual(starterEnvironment);
  });

  it('ignores unknown extra fields instead of failing', () => {
    const withExtras = {
      ...validEnvironment,
      weather: 'rainbow',
      platforms: [{ x: 1, y: 2, width: 10, bounciness: 3 }],
    };
    const result = loadEnvironmentFromData(withExtras);
    expect(result.source).toBe('loaded');
    expect(result.environment.platforms).toHaveLength(1);
  });
});
