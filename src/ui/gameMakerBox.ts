// The child's line to the harness (free-form creative requests): a little
// wizard console — fixed-width font, dark screen, blinking cursor, and a
// status line showing spell progress.

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
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <span class="robot" style="font-size:2.4rem;line-height:1;">🧙</span>
      <div style="flex:1;">
        <div style="font-size:1.2rem;font-weight:bold;letter-spacing:1px;">THE GAME WIZARD</div>
        <div style="font-size:0.95rem;opacity:0.8;">&gt; wish for anything in your game<span class="gm-cursor">▊</span></div>
      </div>
      <button class="kid-button secondary gm-collapse" title="Hide the wizard" style="padding:2px 10px;">✕</button>
    </div>
    <button class="kid-button gm-chip" hidden style="font-size:1.4rem;padding:8px 14px;">🧙</button>
    <div class="gm-status" hidden style="margin-bottom:8px;padding:8px 10px;border:2px dashed var(--console-border);border-radius:8px;font-size:0.95rem;"></div>
    <textarea rows="6" placeholder="like: make it rain tacos!"
      style="width:100%;resize:vertical;padding:12px;border:2px solid var(--console-border);border-radius:10px;background:var(--console-bg-deep);color:#8ef0a9;font-family:inherit;font-size:1.15rem;line-height:1.5;"></textarea>
    <button class="kid-button" style="margin-top:8px;width:100%;font-size:1.05rem;font-family:inherit;">▶ SEND</button>
  `;
  const input = container.querySelector('textarea')!;
  const button = container.querySelector<HTMLButtonElement>('button:not(.gm-collapse):not(.gm-chip)')!;
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
      status.dataset.active = '1';
      status.hidden = container.classList.contains('collapsed');
      status.innerHTML = `🪄 casting: "${escapeHtml(wish)}"<span class="gm-cursor">▊</span>`;
    },
    wishAnswered(): void {
      if (!busy) return;
      busy = false;
      status.innerHTML = '✅ spell finished — look at your game!';
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        status.dataset.active = '0';
        status.hidden = true;
      }, 8000);
    },
  };
}
