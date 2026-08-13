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
  /** Un-collapse (used when the panel joins the editor overlay). */
  expand(): void;
}

export function createChallengePanel(
  container: HTMLElement,
  callbacks: ChallengePanelCallbacks,
): ChallengePanelHandle {
  container.classList.add('panel');

  const content = document.createElement('div');

  // Dismissible: collapses to a small chip instead of disappearing, and
  // reopens by itself when a challenge completes so success is never missed.
  const collapseButton = document.createElement('button');
  collapseButton.className = 'kid-button secondary';
  collapseButton.textContent = '✕';
  collapseButton.title = 'Hide the challenge';
  collapseButton.style.cssText = 'float:right;padding:2px 10px;margin-left:8px;';
  const chip = document.createElement('button');
  chip.className = 'kid-button';
  chip.textContent = '🎯 Challenge';
  chip.hidden = true;
  const setCollapsed = (collapsed: boolean) => {
    container.classList.toggle('collapsed', collapsed);
    content.hidden = collapsed;
    collapseButton.hidden = collapsed;
    chip.hidden = !collapsed;
  };
  collapseButton.onclick = () => setCollapsed(true);
  chip.onclick = () => setCollapsed(false);

  container.append(collapseButton, chip, content);

  return {
    expand: () => setCollapsed(false),
    render(view: PanelView): void {
      if (view.kind === 'completed') setCollapsed(false);
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
          <p>Your whole toolbox is unlocked. Build anything you can imagine — and if you want new stuff in your world, ask the Game Wizard in the corner!</p>
        `;
        return;
      }
      const notYetBanner = view.notYet
        ? `<p class="not-yet" style="background:rgba(124,92,255,0.3);border-radius:8px;padding:8px;">🧐 Not yet! Your blocks ran fine, but the challenge isn't done. ${
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
