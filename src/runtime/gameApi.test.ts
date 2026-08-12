import { describe, expect, it } from 'vitest';
import { ApiRuntime } from './gameApi';
import { FakeBackend } from './fakeBackend';

function makeRuntime() {
  const backend = new FakeBackend();
  const runtime = new ApiRuntime(backend);
  return { backend, runtime, api: runtime.api };
}

describe('movement', () => {
  it('moveRight from onStart keeps the player moving until stop', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => api.moveRight(150));
    runtime.start();
    expect(backend.velocityX).toBe(150);
    runtime.frame(1 / 60, []);
    expect(backend.velocityX).toBe(150);
    api.stop();
    expect(backend.velocityX).toBe(0);
  });

  it('key-driven movement stops when the key is released', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onKey('left', () => api.moveLeft());
    runtime.start();
    runtime.frame(1 / 60, ['left']);
    expect(backend.velocityX).toBe(-200);
    runtime.frame(1 / 60, []);
    expect(backend.velocityX).toBe(0);
  });

  it('moveLeft always moves left even with a positive speed argument', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => api.moveLeft(300));
    runtime.start();
    expect(backend.velocityX).toBe(-300);
  });
});

describe('jumping', () => {
  it('jump on the ground records a jump in stats', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => api.jump());
    runtime.start();
    expect(backend.jumps).toEqual([520]);
    expect(runtime.stats.jumped).toBe(true);
  });

  it('jump in the air does nothing and does not count as jumped', () => {
    const { backend, runtime, api } = makeRuntime();
    backend.onGround = false;
    api.onStart(() => api.jump());
    runtime.start();
    expect(backend.jumps).toEqual([]);
    expect(runtime.stats.jumped).toBe(false);
  });
});

describe('spawning', () => {
  it('spawnPlatform and spawnCollectible reach the backend and count in stats', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => {
      api.spawnPlatform(300, 200);
      api.spawnCollectible(310, 160);
    });
    runtime.start();
    expect(backend.platforms).toEqual([{ x: 300, y: 200, width: 120 }]);
    expect(backend.collectibles).toEqual([{ x: 310, y: 160 }]);
    expect(runtime.stats.platformsSpawned).toBe(1);
    expect(runtime.stats.collectiblesSpawned).toBe(1);
  });
});

describe('scoring', () => {
  it('addScore accumulates and getScore reads it back', () => {
    const { runtime, api } = makeRuntime();
    api.onStart(() => {
      api.addScore(2);
      api.addScore();
    });
    runtime.start();
    expect(api.getScore()).toBe(3);
    expect(runtime.stats.score).toBe(3);
  });

  it('collect marks scoreIncreasedOnCollect only when a collect handler scores', () => {
    const { runtime, api } = makeRuntime();
    runtime.collect();
    expect(runtime.stats.scoreIncreasedOnCollect).toBe(false);
    api.onCollect(() => api.addScore(1));
    runtime.collect();
    expect(runtime.stats.collectedCount).toBe(2);
    expect(runtime.stats.scoreIncreasedOnCollect).toBe(true);
  });
});

describe('timers', () => {
  it('after fires once when its time elapses', () => {
    const { runtime, api } = makeRuntime();
    let fired = 0;
    api.after(0.5, () => fired++);
    runtime.frame(0.4, []);
    expect(fired).toBe(0);
    runtime.frame(0.2, []);
    expect(fired).toBe(1);
    runtime.frame(1, []);
    expect(fired).toBe(1);
  });

  it('every fires repeatedly on its interval', () => {
    const { runtime, api } = makeRuntime();
    let fired = 0;
    api.every(0.25, () => fired++);
    for (let i = 0; i < 8; i++) runtime.frame(0.125, []);
    expect(fired).toBe(4);
  });
});

describe('sound, patrol, win', () => {
  it('playSound reaches the backend and is recorded', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => api.playSound('boing'));
    runtime.start();
    expect(backend.sounds).toEqual(['boing']);
    expect(runtime.stats.soundsPlayed).toEqual(['boing']);
  });

  it('patrolEnemies sets patrol speed and marks stats', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => api.patrolEnemies());
    runtime.start();
    expect(backend.patrolSpeed).toBe(80);
    expect(runtime.stats.patrolStarted).toBe(true);
  });

  it('win shows the win screen once even if called twice', () => {
    const { backend, runtime, api } = makeRuntime();
    api.onStart(() => {
      api.win();
      api.win();
    });
    runtime.start();
    expect(backend.winShown).toBe(true);
    expect(runtime.stats.winTriggered).toBe(true);
  });
});

describe('touch events', () => {
  it('touch runs handlers for the matching kind only', () => {
    const { runtime, api } = makeRuntime();
    const touched: string[] = [];
    api.onTouch('enemy', () => touched.push('enemy'));
    api.onTouch('goal', () => touched.push('goal'));
    runtime.touch('goal');
    expect(touched).toEqual(['goal']);
  });
});

describe('error containment', () => {
  it('a throwing handler reports to onError and does not propagate', () => {
    const { runtime, api } = makeRuntime();
    const errors: unknown[] = [];
    runtime.onError((e) => errors.push(e));
    api.onStart(() => {
      throw new Error('kid code broke');
    });
    expect(() => runtime.start()).not.toThrow();
    expect(errors).toHaveLength(1);
  });
});

describe('reset', () => {
  it('running a program twice with reset between does not double-register handlers', () => {
    const { backend, runtime, api } = makeRuntime();
    const program = () => api.onCollect(() => api.addScore(1));
    program();
    runtime.start();
    runtime.collect();
    expect(runtime.stats.score).toBe(1);

    runtime.reset();
    program();
    runtime.start();
    runtime.collect();
    expect(runtime.stats.score).toBe(1);
    expect(backend.velocityX).toBe(0);
  });
});
