// The in-game challenge panel (R3, R5): one challenge at a time, staged hints
// on demand, a distinct "not yet" state, and the free-form "ask the game
// maker" box (the plan's open question assigns that UI here).

export type PanelView =
  | {
      kind: 'challenge';
      title: string;
      prompt: string;
      hints: string[];
      hasMoreHints: boolean;
      notYet: boolean;
    }
  | { kind: 'completed'; title: string; explanation: string }
  | { kind: 'free_play' };

export interface ChallengePanelCallbacks {
  onHintRequest(): void;
  onNextChallenge(): void;
  onFreeRequest(text: string): void;
}

export interface ChallengePanelHandle {
  render(view: PanelView): void;
}

export function createChallengePanel(
  container: HTMLElement,
  callbacks: ChallengePanelCallbacks,
): ChallengePanelHandle {
  container.classList.add('panel');

  const content = document.createElement('div');
  const requestBox = document.createElement('div');
  requestBox.style.cssText = 'margin-top:12px;border-top:2px dashed var(--panel-border);padding-top:10px;';
  requestBox.innerHTML = `
    <label style="font-weight:bold;">💬 Ask the game maker for anything:</label>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <input type="text" placeholder="like: make my player a dragon!" style="flex:1;padding:8px;border:2px solid var(--panel-border);border-radius:8px;font-family:inherit;" />
      <button class="kid-button">Send</button>
    </div>
  `;
  const requestInput = requestBox.querySelector('input')!;
  const requestButton = requestBox.querySelector('button')!;
  const sendRequest = () => {
    const text = requestInput.value.trim();
    if (!text) return;
    callbacks.onFreeRequest(text);
    requestInput.value = '';
  };
  requestButton.onclick = sendRequest;
  requestInput.onkeydown = (event) => {
    if (event.key === 'Enter') sendRequest();
  };

  container.append(content, requestBox);

  return {
    render(view: PanelView): void {
      content.innerHTML = '';
      if (view.kind === 'completed') {
        content.innerHTML = `
          <h2 style="margin:0;">⭐ ${view.title}</h2>
          <p class="explanation" style="font-size:1.1rem;">${view.explanation}</p>
        `;
        const next = document.createElement('button');
        next.className = 'kid-button';
        next.textContent = 'Next challenge →';
        next.onclick = callbacks.onNextChallenge;
        content.appendChild(next);
        return;
      }
      if (view.kind === 'free_play') {
        content.innerHTML = `
          <h2 style="margin:0;">🏆 You finished every challenge!</h2>
          <p>Your whole toolbox is unlocked. Build anything you can imagine — and if you want new stuff in your world, ask the game maker below!</p>
        `;
        return;
      }
      const notYetBanner = view.notYet
        ? `<p class="not-yet" style="background:var(--accent-soft);border-radius:8px;padding:8px;">🧐 Not yet! Your blocks ran fine, but the challenge isn't done. ${
            view.hasMoreHints ? 'Try the hint button below!' : 'Look at the hints again — you are close!'
          }</p>`
        : '';
      content.innerHTML = `
        <h2 style="margin:0;">🎯 ${view.title}</h2>
        <p style="font-size:1.05rem;">${view.prompt}</p>
        ${notYetBanner}
        <ul class="hints" style="margin:6px 0;">${view.hints.map((h) => `<li>💡 ${h}</li>`).join('')}</ul>
      `;
      if (view.hasMoreHints) {
        const hint = document.createElement('button');
        hint.className = 'kid-button secondary';
        hint.textContent = 'Give me a hint';
        hint.onclick = callbacks.onHintRequest;
        content.appendChild(hint);
      }
    },
  };
}
