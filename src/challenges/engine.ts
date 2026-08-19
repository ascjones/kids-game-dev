import { ALL_CATEGORY_IDS, type CategoryId } from '../blocks/toolbox';
import type { Environment } from '../game/environmentSchema';
import { runCheck } from './checks';
import {
  emptyProgress,
  type ChallengeDef,
  type ChallengeProgress,
  type SessionState,
} from './types';

export type EvaluationResult = 'completed' | 'not_yet' | 'already_completed';

/**
 * One-challenge-at-a-time state machine (R3). UI-free: the panel renders what
 * this exposes, and main.ts sends the bridge decision when `evaluate` says a
 * challenge just completed — the engine returns 'completed' exactly once per
 * challenge, which is what makes the emission exactly-once.
 */
export class ChallengeEngine {
  private challenges: ChallengeDef[];
  private state: ChallengeProgress;

  constructor(challenges: ChallengeDef[], progress?: ChallengeProgress) {
    this.challenges = challenges;
    const state = progress ?? emptyProgress();
    // Challenge content is harness-editable data, so a stored index can drift
    // when challenges are inserted or reordered between sessions. The set of
    // completed ids is the durable truth: resume at the first open challenge.
    // (A challenge completed but not yet advanced past resumes as advanced.)
    const firstOpen = challenges.findIndex((c) => !state.completedIds.includes(c.id));
    this.state = {
      ...state,
      currentIndex: firstOpen === -1 ? challenges.length : firstOpen,
    };
  }

  /** The active challenge, or null when all are done (free play). */
  current(): ChallengeDef | null {
    return this.challenges[this.state.currentIndex] ?? null;
  }

  allDone(): boolean {
    return this.state.currentIndex >= this.challenges.length;
  }

  /** Whether the active challenge is completed but not yet advanced past. */
  currentCompleted(): boolean {
    const current = this.current();
    return current !== null && this.state.completedIds.includes(current.id);
  }

  /** Toolbox categories for the active challenge; everything in free play (KTD10). */
  toolboxCategories(): CategoryId[] {
    const current = this.current();
    return current ? [...current.toolbox] : [...ALL_CATEGORY_IDS];
  }

  /** Categories the active challenge added compared to the one before it. */
  justUnlocked(): CategoryId[] {
    const index = this.state.currentIndex;
    if (index === 0) return [];
    const previous = new Set(
      this.challenges[index - 1]?.toolbox ?? this.challenges.at(-1)?.toolbox ?? [],
    );
    return this.toolboxCategories().filter((id) => !previous.has(id));
  }

  revealedHints(): string[] {
    const current = this.current();
    if (!current) return [];
    return current.hints.slice(0, this.state.hintStages[current.id] ?? 0);
  }

  /** Reveal the next hint stage on demand (R5); hints never auto-open. */
  revealNextHint(): string | null {
    const current = this.current();
    if (!current) return null;
    const stage = this.state.hintStages[current.id] ?? 0;
    if (stage >= current.hints.length) return null;
    this.state.hintStages[current.id] = stage + 1;
    return current.hints[stage];
  }

  hasMoreHints(): boolean {
    const current = this.current();
    if (!current) return false;
    return (this.state.hintStages[current.id] ?? 0) < current.hints.length;
  }

  /** Judge a play-test session against the active challenge's check. */
  evaluate(session: SessionState): EvaluationResult {
    const current = this.current();
    if (!current) return 'already_completed';
    if (this.state.completedIds.includes(current.id)) return 'already_completed';
    if (!runCheck(current.check, session, current.params)) return 'not_yet';
    this.state.completedIds.push(current.id);
    return 'completed';
  }

  /**
   * The world the active challenge brings with it, if it carries one and it has
   * not been applied yet (KTD4). Null once applied, so re-renders, reloads and
   * the child's own later edits are never overwritten.
   */
  pendingEnvironment(): Environment | null {
    const current = this.current();
    if (!current?.environment) return null;
    if (this.state.appliedEnvironmentChallengeId === current.id) return null;
    return current.environment;
  }

  /** Record that the active challenge's world is now the one on screen. */
  markEnvironmentApplied(): void {
    const current = this.current();
    if (!current?.environment) return;
    this.state.appliedEnvironmentChallengeId = current.id;
  }

  /** Move on after the explanation was shown. */
  advance(): void {
    if (this.currentCompleted()) {
      this.state.currentIndex += 1;
    }
  }

  progress(): ChallengeProgress {
    return {
      completedIds: [...this.state.completedIds],
      currentIndex: this.state.currentIndex,
      hintStages: { ...this.state.hintStages },
      appliedEnvironmentChallengeId: this.state.appliedEnvironmentChallengeId,
    };
  }
}
