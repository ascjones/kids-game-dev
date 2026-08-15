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
      /** Position in the six-challenge sequence, 1-based, when known. */
      step?: number;
      total?: number;
    }
  | { kind: 'completed'; title: string; explanation: string; step?: number; total?: number }
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

/**
 * The challenges are a fixed sequence, so where the child is in it is real
 * information — one filled pip per finished challenge, an open one for the
 * rest.
 */
function stepMarkup(step?: number, total?: number): string {
  if (!step || !total) return '';
  const pips = Array.from({ length: total }, (_, index) => {
    const state = index < step - 1 ? 'done' : index === step - 1 ? 'now' : '';
    return `<span class="cp-pip ${state}"></span>`;
  }).join('');
  return `
    <div class="cp-step">
      <span class="plaque">Spell ${step} of ${total}</span>
      <span class="cp-pips">${pips}</span>
    </div>
  `;
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
  collapseButton.className = 'kid-button secondary panel-close';
  collapseButton.textContent = '✕';
  collapseButton.title = 'Hide the challenge';
  const chip = document.createElement('button');
  chip.className = 'kid-button panel-chip';
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
      container.classList.toggle('cp-done', view.kind !== 'challenge');
      content.innerHTML = '';
      if (view.kind === 'completed') {
        content.innerHTML = `
          <div class="cp-head">
            <span class="cp-star">⭐</span>
            <div class="cp-head-text">
              ${stepMarkup(view.step, view.total)}
              <h2 class="cp-title">${view.title}</h2>
            </div>
          </div>
          <p class="explanation">${view.explanation}</p>
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
          <div class="cp-head">
            <span class="cp-star">🏆</span>
            <div class="cp-head-text">
              <span class="plaque">All spells learned</span>
              <h2 class="cp-title">You finished every challenge!</h2>
            </div>
          </div>
          <p class="explanation">Every block is unlocked. Build anything you can imagine — and ask the Game Wizard below for new things to put in your world.</p>
        `;
        return;
      }
      const notYetBanner = view.notYet
        ? `<p class="not-yet">Not yet! Your blocks ran fine, but the challenge isn't finished. ${
            view.hasMoreHints ? 'Ask for a hint below.' : 'Read the hints again — you are close.'
          }</p>`
        : '';
      content.innerHTML = `
        <div class="cp-head">
          <div class="cp-head-text">
            ${stepMarkup(view.step, view.total)}
            <h2 class="cp-title">${view.title}</h2>
          </div>
        </div>
        <p class="cp-prompt">${view.prompt}</p>
        ${notYetBanner}
        <ul class="hints">${view.hints.map((hint) => `<li>${hint}</li>`).join('')}</ul>
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
