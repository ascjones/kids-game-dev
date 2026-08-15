// The child's line to the harness (free-form creative requests): the Game
// Wizard, sitting at the bottom of the bench. The wizard's aura is the app's
// light source — it breathes slowly while idle and quickens while a wish is
// being cast.

export interface GameMakerBoxHandle {
  /** A wish was sent and the wizard is working on it. */
  setBusy(wish: string): void;
  /** The wizard replied (message or new world); show done, then go quiet. */
  wishAnswered(): void;
}

export function createGameMakerBox(
  container: HTMLElement,
  onRequest: (text: string) => void,
): GameMakerBoxHandle {
  container.classList.add('panel');
  container.innerHTML = `
    <div class="gm-head">
      <span class="wizard-mark robot">🧙</span>
      <div class="gm-head-text">
        <div class="gm-name">The Game Wizard</div>
        <div class="gm-tag">&gt; wish for anything<span class="gm-cursor">▊</span></div>
      </div>
      <button class="kid-button secondary panel-close gm-collapse" title="Hide the wizard">✕</button>
    </div>
    <button class="kid-button panel-chip gm-chip" hidden>🧙</button>
    <div class="gm-status" hidden></div>
    <textarea class="field" rows="3" placeholder="like: make it rain tacos!"></textarea>
    <button class="kid-button gm-send">Send</button>
  `;
  const input = container.querySelector('textarea')!;
  const button = container.querySelector<HTMLButtonElement>('.gm-send')!;
  const collapseButton = container.querySelector<HTMLButtonElement>('.gm-collapse')!;
  const chip = container.querySelector<HTMLButtonElement>('.gm-chip')!;
  const setCollapsed = (collapsed: boolean) => {
    container.classList.toggle('collapsed', collapsed);
    chip.hidden = !collapsed;
    for (const child of container.children) {
      if (child !== chip) (child as HTMLElement).hidden = collapsed;
    }
    if (!collapsed) {
      status.hidden = status.dataset.active !== '1';
    }
  };
  collapseButton.onclick = () => setCollapsed(true);
  chip.onclick = () => setCollapsed(false);
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    onRequest(text);
    input.value = '';
  };
  button.onclick = send;
  input.onkeydown = (event) => {
    // Enter sends; Shift+Enter makes a new line for longer wishes.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const status = container.querySelector<HTMLElement>('.gm-status')!;
  let busy = false;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return {
    setBusy(wish: string): void {
      busy = true;
      if (doneTimer) clearTimeout(doneTimer);
      container.classList.add('casting');
      status.dataset.active = '1';
      status.hidden = container.classList.contains('collapsed');
      status.innerHTML = `Casting “${escapeHtml(wish)}”<span class="gm-cursor">▊</span>`;
    },
    wishAnswered(): void {
      if (!busy) return;
      busy = false;
      container.classList.remove('casting');
      status.textContent = 'Spell finished — look at your game!';
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        status.dataset.active = '0';
        status.hidden = true;
      }, 8000);
    },
  };
}
