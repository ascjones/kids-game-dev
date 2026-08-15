// The one surface for everything the app says to the child outside the
// challenge flow (R9): environment fallbacks, sandbox errors, import problems,
// harness messages. Everything through here must already be kid language.

export interface KidNotice {
  info(message: string): void;
  celebrate(message: string): void;
  /** Ask a kid-language yes/no question; resolves true for yes. */
  confirm(message: string, yesLabel?: string, noLabel?: string): Promise<boolean>;
}

const INFO_AUTOHIDE_MS = 9000;

export function createKidNotice(container: HTMLElement): KidNotice {
  container.classList.add('kid-notice-root');

  function card(kind: 'info' | 'celebrate'): {
    element: HTMLDivElement;
    body: HTMLDivElement;
  } {
    const element = document.createElement('div');
    element.className = `panel kid-notice ${kind === 'celebrate' ? 'celebrate' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'cp-star';
    icon.textContent = kind === 'celebrate' ? '🎉' : '💡';
    const body = document.createElement('div');
    body.className = 'kid-notice-body';
    element.append(icon, body);
    container.appendChild(element);
    return { element, body };
  }

  function show(kind: 'info' | 'celebrate', message: string): void {
    const { element, body } = card(kind);
    const text = document.createElement('p');
    text.className = 'kid-notice-text';
    text.textContent = message;
    const close = document.createElement('button');
    close.className = 'kid-button secondary panel-close';
    close.textContent = '✕';
    close.title = 'Close';
    close.onclick = () => element.remove();
    body.appendChild(text);
    element.appendChild(close);
    setTimeout(() => element.remove(), INFO_AUTOHIDE_MS);
  }

  return {
    info: (message) => show('info', message),
    celebrate: (message) => show('celebrate', message),
    confirm: (message, yesLabel = 'Yes, do it', noLabel = 'No, keep mine') =>
      new Promise((resolve) => {
        const { element, body } = card('info');
        const text = document.createElement('p');
        text.className = 'kid-notice-text';
        text.textContent = message;
        const actions = document.createElement('div');
        actions.className = 'kid-notice-actions';
        const yes = document.createElement('button');
        yes.className = 'kid-button';
        yes.textContent = yesLabel;
        const no = document.createElement('button');
        no.className = 'kid-button secondary';
        no.textContent = noLabel;
        yes.onclick = () => {
          element.remove();
          resolve(true);
        };
        no.onclick = () => {
          element.remove();
          resolve(false);
        };
        actions.append(yes, no);
        body.append(text, actions);
      }),
  };
}
