import { LoopTrapError } from './gameApi';

// R9: everything the app tells the child about a failure describes the game
// effect in kid language — never a stack trace or a technical term.

export const KID_ERROR_MESSAGES = {
  loopTrap:
    'Whoa! Your blocks got stuck going round and round forever, so we stopped the game. Try making your repeat blocks smaller.',
  runtime:
    "Hmm, the game didn't understand one of your blocks, so nothing happened. Try changing your last block and press Play test again!",
  emptyProgram:
    'Your game is waiting for some blocks! Drag a "when game starts" block in to make something happen.',
} as const;

/** Map any error thrown by kid code into what the child should read. */
export function toKidMessage(error: unknown): string {
  if (error instanceof LoopTrapError) {
    return KID_ERROR_MESSAGES.loopTrap;
  }
  return KID_ERROR_MESSAGES.runtime;
}
