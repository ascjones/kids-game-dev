// The child's line to the harness (free-form creative requests): a little
// robot console, top-right — fixed-width font, dark screen, blinking cursor.

export function createGameMakerBox(
  container: HTMLElement,
  onRequest: (text: string) => void,
): void {
  container.classList.add('panel');
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <span class="robot" style="font-size:2.4rem;line-height:1;">🧙</span>
      <div>
        <div style="font-size:1.2rem;font-weight:bold;letter-spacing:1px;">THE GAME WIZARD</div>
        <div style="font-size:0.95rem;opacity:0.8;">&gt; wish for anything in your game<span class="gm-cursor">▊</span></div>
      </div>
    </div>
    <textarea rows="6" placeholder="like: make it rain tacos!"
      style="width:100%;resize:vertical;padding:12px;border:2px solid var(--console-border);border-radius:10px;background:var(--console-bg-deep);color:#8ef0a9;font-family:inherit;font-size:1.15rem;line-height:1.5;"></textarea>
    <button class="kid-button" style="margin-top:8px;width:100%;font-size:1.05rem;font-family:inherit;">▶ SEND</button>
  `;
  const input = container.querySelector('textarea')!;
  const button = container.querySelector('button')!;
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
}
