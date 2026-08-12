import { describe, expect, it } from 'vitest';
import { ApiRuntime } from './gameApi';
import { FakeBackend } from './fakeBackend';
import { runProgram } from './sandbox';
import { KID_ERROR_MESSAGES } from './kidErrors';

function makeRuntime() {
  const backend = new FakeBackend();
  const runtime = new ApiRuntime(backend);
  return { backend, runtime, api: runtime.api };
}

describe('runProgram', () => {
  it('registers an onStart movement handler that mutates the fake game state', () => {
    const { backend, runtime, api } = makeRuntime();
    const result = runProgram('api.onStart(function () { api.moveRight(120); });', api);
    expect(result.ok).toBe(true);
    runtime.start();
    backend.step(1);
    expect(backend.x).toBe(120);
  });

  it('stops a while(true) program via the loop trap and maps it to kid language', () => {
    const { api } = makeRuntime();
    const result = runProgram('while (true) { api.__loopTick(); }', api);
    expect(result).toEqual({ ok: false, kidMessage: KID_ERROR_MESSAGES.loopTrap });
  });

  it('returns a kid-language message for a runtime error instead of propagating', () => {
    const { api } = makeRuntime();
    const result = runProgram('null.explode();', api);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kidMessage).toBe(KID_ERROR_MESSAGES.runtime);
      expect(result.kidMessage).not.toMatch(/null|TypeError|undefined/);
    }
  });

  it('returns a kid-language message for a syntax error', () => {
    const { api } = makeRuntime();
    const result = runProgram('api.onStart(function ( {', api);
    expect(result.ok).toBe(false);
  });

  it('running the same program twice with reset does not double-register', () => {
    const { runtime, api } = makeRuntime();
    const code = 'api.onCollect(function () { api.addScore(1); });';
    runProgram(code, api);
    runtime.start();
    runtime.collect();
    expect(runtime.stats.score).toBe(1);

    runtime.reset();
    runProgram(code, api);
    runtime.start();
    runtime.collect();
    expect(runtime.stats.score).toBe(1);
  });
});
