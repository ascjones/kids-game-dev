// R10: a read-only JavaScript view beside the blocks, updating as blocks change.

export interface JsViewHandle {
  update(code: string): void;
}

export function createJsView(container: HTMLElement): JsViewHandle {
  container.classList.add('panel');
  container.innerHTML = `
    <strong>The JavaScript your blocks make:</strong>
    <pre class="js-view-code" style="margin:8px 0 0;max-height:220px;overflow:auto;background:#2b2440;color:#a8ffbf;padding:10px;border-radius:8px;font-size:13px;"><code></code></pre>
  `;
  const codeElement = container.querySelector('code')!;
  return {
    update(code: string): void {
      codeElement.textContent = code.trim() === '' ? '// Drag some blocks to see code here!' : code;
    },
  };
}
