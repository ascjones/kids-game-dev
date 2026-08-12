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
  container.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;max-width:560px;width:90%;';

  function card(kind: 'info' | 'celebrate'): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'panel kid-notice';
    element.style.cssText = `border-color:${kind === 'celebrate' ? 'var(--success)' : 'var(--warn)'};box-shadow:0 4px 16px rgba(43,36,64,.2);font-size:1.05rem;`;
    container.appendChild(element);
    return element;
  }

  function show(kind: 'info' | 'celebrate', message: string): void {
    const element = card(kind);
    element.textContent = `${kind === 'celebrate' ? '🎉 ' : '💡 '}${message}`;
    const close = document.createElement('button');
    close.textContent = '✕';
    close.className = 'kid-button secondary';
    close.style.cssText = 'float:right;padding:2px 8px;margin-left:8px;';
    close.onclick = () => element.remove();
    element.prepend(close);
    setTimeout(() => element.remove(), INFO_AUTOHIDE_MS);
  }

  return {
    info: (message) => show('info', message),
    celebrate: (message) => show('celebrate', message),
    confirm: (message, yesLabel = 'Yes, do it', noLabel = 'No, keep mine') =>
      new Promise((resolve) => {
        const element = card('info');
        const text = document.createElement('p');
        text.textContent = `🤔 ${message}`;
        text.style.margin = '0 0 10px';
        const yes = document.createElement('button');
        yes.className = 'kid-button';
        yes.textContent = yesLabel;
        const no = document.createElement('button');
        no.className = 'kid-button secondary';
        no.textContent = noLabel;
        no.style.marginLeft = '8px';
        yes.onclick = () => {
          element.remove();
          resolve(true);
        };
        no.onclick = () => {
          element.remove();
          resolve(false);
        };
        element.append(text, yes, no);
      }),
  };
}
