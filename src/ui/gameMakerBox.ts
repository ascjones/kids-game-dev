// The child's line to the harness (free-form creative requests): its own
// floating box, top-right, with the robot game maker's face on it.

export function createGameMakerBox(
  container: HTMLElement,
  onRequest: (text: string) => void,
): void {
  container.classList.add('panel');
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <span class="robot" style="font-size:2.4rem;line-height:1;">🤖</span>
      <div>
        <div style="font-size:1.35rem;font-weight:bold;">The Game Maker</div>
        <div style="font-size:0.95rem;opacity:0.75;">Ask me to change your game!</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <input type="text" placeholder="like: make it rain tacos!"
        style="flex:1;padding:12px;border:3px solid var(--panel-border);border-radius:12px;font-family:inherit;font-size:1.15rem;" />
      <button class="kid-button" style="font-size:1.15rem;">Send</button>
    </div>
  `;
  const input = container.querySelector('input')!;
  const button = container.querySelector('button')!;
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    onRequest(text);
    input.value = '';
  };
  button.onclick = send;
  input.onkeydown = (event) => {
    if (event.key === 'Enter') send();
  };
}
