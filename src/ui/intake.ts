import type { DecisionInput } from '../bridge/messages';

// R1: first-run intake — the child describes their game and picks a genre.
// Platformer is live; the other five genres are visible but locked.

export interface IntakeFlowDeps {
  sendDecision(input: DecisionInput): Promise<boolean>;
  /** Resolves true when an environment_updated arrives, false on timeout. */
  waitForEnvironmentUpdate(timeoutMs: number): Promise<boolean>;
  timeoutMs?: number;
}

export const INTAKE_TIMEOUT_MS = 90_000;

/**
 * R2: send the idea to the harness and wait for its world. On timeout the
 * bundled starter takes over; the idea stays queued in the outbox for the
 * harness to pick up whenever it starts listening.
 */
export async function submitIdea(
  deps: IntakeFlowDeps,
  idea: string,
): Promise<'harness' | 'fallback'> {
  await deps.sendDecision({
    type: 'new_game_idea',
    payload: { idea, genre: 'platformer' },
  });
  const updated = await deps.waitForEnvironmentUpdate(deps.timeoutMs ?? INTAKE_TIMEOUT_MS);
  return updated ? 'harness' : 'fallback';
}

export interface IntakeCallbacks {
  /** Send the idea toward the harness; resolves false if the bridge is down. */
  onSubmit(idea: string): Promise<void>;
}

export interface IntakeHandle {
  /** Switch to the "building your world" wait state. */
  showBuilding(): void;
  /** Tear the intake down (world is ready, or fallback engaged). */
  dismiss(): void;
}

const GENRES: Array<{ id: string; label: string; emoji: string; locked: boolean }> = [
  { id: 'platformer', label: 'Jump & Run', emoji: '🏃', locked: false },
  { id: 'top_down_adventure', label: 'Adventure', emoji: '🗺️', locked: true },
  { id: 'racing', label: 'Racing', emoji: '🏎️', locked: true },
  { id: 'sports', label: 'Sports', emoji: '⚽', locked: true },
  { id: 'puzzle', label: 'Puzzle', emoji: '🧩', locked: true },
  { id: 'shooter', label: 'Space Blaster', emoji: '🚀', locked: true },
];

export function createIntake(container: HTMLElement, callbacks: IntakeCallbacks): IntakeHandle {
  container.classList.add('panel');
  container.style.cssText = 'max-width:640px;margin:40px auto;text-align:center;';
  container.innerHTML = `
    <h1>🎮 Let's make YOUR game!</h1>
    <p style="font-size:1.1rem;">What should your game be about? Tell me your idea!</p>
    <textarea rows="3" placeholder="like: a ninja cat who collects magic fish in a candy world"
      style="width:100%;padding:10px;border:3px solid var(--panel-border);border-radius:10px;font-family:inherit;font-size:1rem;"></textarea>
    <p style="font-weight:bold;margin-bottom:6px;">Pick a game style:</p>
    <div class="genres" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;"></div>
    <button class="kid-button" style="margin-top:16px;font-size:1.2rem;">Build my game! 🚀</button>
    <div class="building" hidden style="margin-top:16px;font-size:1.15rem;"></div>
  `;

  const textarea = container.querySelector('textarea')!;
  const genreGrid = container.querySelector<HTMLElement>('.genres')!;
  const buildButton = container.querySelector('button')!;
  const building = container.querySelector<HTMLElement>('.building')!;

  let selectedGenre = 'platformer';
  for (const genre of GENRES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'genre-card';
    card.dataset.genre = genre.id;
    card.disabled = genre.locked;
    card.style.cssText = `padding:10px;border-radius:10px;border:3px solid var(--panel-border);font-family:inherit;cursor:${genre.locked ? 'default' : 'pointer'};background:${genre.locked ? '#eee' : '#fff'};`;
    card.innerHTML = `<div style="font-size:1.6rem;">${genre.emoji}</div>${genre.label}${genre.locked ? '<div>🔒 soon!</div>' : ''}`;
    card.onclick = () => {
      if (genre.locked) return;
      selectedGenre = genre.id;
      for (const other of genreGrid.children) {
        (other as HTMLElement).style.borderColor = 'var(--panel-border)';
      }
      card.style.borderColor = 'var(--accent)';
    };
    if (!genre.locked) card.style.borderColor = 'var(--accent)';
    genreGrid.appendChild(card);
  }

  buildButton.onclick = async () => {
    const idea = textarea.value.trim();
    if (!idea) {
      textarea.placeholder = 'Type your idea first — anything you can imagine!';
      textarea.focus();
      return;
    }
    if (selectedGenre !== 'platformer') return;
    await callbacks.onSubmit(idea);
  };

  return {
    showBuilding(): void {
      buildButton.disabled = true;
      textarea.disabled = true;
      building.hidden = false;
      building.innerHTML = '🔨 <strong>Building your world…</strong> the game maker is thinking!';
    },
    dismiss(): void {
      container.remove();
    },
  };
}
