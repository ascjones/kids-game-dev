import type { GameApi } from './gameApi';
import { toKidMessage } from './kidErrors';

// KTD6: this sandbox is a convenience boundary, not a security boundary. The
// threat model is one child on the family machine running their own block
// program. Real protection comes from the constrained `api` surface (kid code
// receives nothing else) and Blockly's INFINITE_LOOP_TRAP, which calls
// api.__loopTick() inside every generated loop so runaway loops throw instead
// of hanging the tab. Revisit before any hosted or multi-user version.

export type SandboxResult = { ok: true } | { ok: false; kidMessage: string };

/** Compile and run a generated program, handing it only the game api. */
export function runProgram(code: string, api: GameApi): SandboxResult {
  try {
    const program = new Function('api', `"use strict";\n${code}`);
    program(api);
    return { ok: true };
  } catch (error) {
    return { ok: false, kidMessage: toKidMessage(error) };
  }
}
