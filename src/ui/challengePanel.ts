// The in-game challenge panel (R3, R5): one challenge at a time, staged hints
// on demand, and a distinct "not yet" state. Free-form requests live in the
// game maker box (gameMakerBox.ts).

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
  container.append(content);

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
          <p>Your whole toolbox is unlocked. Build anything you can imagine — and if you want new stuff in your world, ask the robot game maker in the corner!</p>
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
