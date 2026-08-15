// R10: a read-only JavaScript view beside the blocks, updating as blocks change.

export interface JsViewHandle {
  update(code: string): void;
}

export function createJsView(container: HTMLElement): JsViewHandle {
  container.classList.add('panel');
  container.innerHTML = `
    <div class="jsv-head">
      <span class="plaque">&gt; your blocks as code</span>
      <span class="jsv-note">this is real JavaScript</span>
    </div>
    <pre class="js-view-code"><code></code></pre>
  `;
  const codeElement = container.querySelector('code')!;
  return {
    update(code: string): void {
      codeElement.textContent = code.trim() === '' ? '// Drag some blocks to see code here!' : code;
    },
  };
}
