import type { DecisionInput } from '../bridge/messages';

// R1: first-run intake — the child describes their game and picks a genre.
// Platformer is live; the other five genres are visible but locked.

/**
 * R2: the child never waits on the harness. The idea goes to the outbox, play
 * starts immediately in whatever world is available, and the harness's world
 * arrives later through the environment-sync path.
 */
export function ideaDecision(idea: string): DecisionInput {
  return { type: 'new_game_idea', payload: { idea, genre: 'platformer' } };
}

export interface SavedGameSummary {
  id: string;
  idea: string;
  title: string;
  savedAt: string;
  completedChallenges: number;
}

export interface IntakeCallbacks {
  /** Send the idea toward the harness; resolves false if the bridge is down. */
  onSubmit(idea: string): Promise<void>;
  /** Load a game from the server-side library. */
  onLoadSave?(id: string): void;
  /** Previous games to offer (server-side library). */
  saves?: SavedGameSummary[];
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
  container.innerHTML = `
    <div class="intake-frame">
      <div class="intake-header">
        <span class="intake-wizard">🧙</span>
        <div>
          <div class="intake-title">THE GAME WIZARD</div>
          <div class="intake-sub">&gt; tell me your idea and I will conjure your game<span class="gm-cursor">▊</span></div>
        </div>
      </div>
      <h1 class="intake-h1">LET'S MAKE <span class="intake-glow">YOUR</span> GAME</h1>
      <div class="saved-games" hidden>
        <p class="intake-label">&gt; your saved games:</p>
        <div class="saved-games-grid"></div>
        <p class="intake-label" style="margin-top:18px;">&gt; or start a brand new one:</p>
      </div>
      <textarea rows="4" placeholder="like: a ninja cat who collects magic fish in a candy world"></textarea>
      <p class="intake-label">&gt; pick a game style:</p>
      <div class="genres"></div>
      <button class="kid-button intake-build">▶ BUILD MY GAME</button>
      <div class="building" hidden></div>
    </div>
  `;

  const textarea = container.querySelector('textarea')!;
  const genreGrid = container.querySelector<HTMLElement>('.genres')!;
  const buildButton = container.querySelector<HTMLButtonElement>('button.intake-build')!;
  const building = container.querySelector<HTMLElement>('.building')!;

  const savedSection = container.querySelector<HTMLElement>('.saved-games')!;
  const savedGrid = container.querySelector<HTMLElement>('.saved-games-grid')!;
  const saves = callbacks.saves ?? [];
  if (saves.length > 0 && callbacks.onLoadSave) {
    savedSection.hidden = false;
    for (const save of saves) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'saved-game-card';
      card.dataset.saveId = save.id;
      const when = save.savedAt ? new Date(save.savedAt).toLocaleDateString() : '';
      card.innerHTML = `
        <div class="saved-game-title">💾 ${save.title}</div>
        <div class="saved-game-idea">${save.idea || 'a mystery game'}</div>
        <div class="saved-game-meta">⭐ ${save.completedChallenges} challenges done${when ? ` · ${when}` : ''}</div>
      `;
      card.onclick = () => callbacks.onLoadSave?.(save.id);
      savedGrid.appendChild(card);
    }
  }

  let selectedGenre = 'platformer';
  for (const genre of GENRES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = genre.locked ? 'genre-card' : 'genre-card selected';
    card.dataset.genre = genre.id;
    card.disabled = genre.locked;
    card.innerHTML = `<div class="genre-emoji">${genre.emoji}</div>${genre.label}${genre.locked ? '<div class="genre-lock">🔒 soon!</div>' : ''}`;
    card.onclick = () => {
      if (genre.locked) return;
      selectedGenre = genre.id;
      for (const other of genreGrid.children) other.classList.remove('selected');
      card.classList.add('selected');
    };
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
      building.innerHTML = '🪄 <strong>casting the world-building spell…</strong><span class="gm-cursor">▊</span>';
    },
    dismiss(): void {
      container.remove();
    },
  };
}
