import * as Blockly from 'blockly';
import { registerBlocks } from './definitions';
import { registerGenerators, workspaceToProgram } from './generators';
import { buildToolbox, type CategoryId } from './toolbox';

export interface EditorHandle {
  workspace: Blockly.WorkspaceSvg;
  getCode(): string;
  serialize(): Record<string, unknown>;
  load(state: Record<string, unknown>): void;
  /** Show only these categories; ids in `justUnlocked` get a sparkle badge (KTD10). */
  setToolboxCategories(ids: readonly CategoryId[], justUnlocked?: readonly CategoryId[]): void;
  undo(): void;
  redo(): void;
  resetWorkspace(): void;
  onChange(listener: () => void): void;
  /** Re-measure the workspace after its container becomes visible or resizes. */
  refresh(): void;
  /** Arrange all blocks into a tidy column (Blockly's clean-up). */
  tidy(): void;
}

// The workspace is the console's main screen. Colours follow src/style.css.
const kidTheme = Blockly.Theme.defineTheme('kid-console', {
  name: 'kid-console',
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: '#08060f',
    toolboxBackgroundColour: '#130f21',
    toolboxForegroundColour: '#e2ddf5',
    flyoutBackgroundColour: '#0e0b1a',
    flyoutForegroundColour: '#e2ddf5',
    flyoutOpacity: 1,
    scrollbarColour: '#33285e',
    insertionMarkerColour: '#7cf5a6',
    insertionMarkerOpacity: 0.7,
    cursorColour: '#7cf5a6',
  },
  fontStyle: {
    family: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
    weight: '700',
    size: 12,
  },
});

export function createEditor(container: HTMLElement): EditorHandle {
  registerBlocks();
  registerGenerators();

  const workspace = Blockly.inject(container, {
    renderer: 'zelos',
    theme: kidTheme,
    toolbox: buildToolbox(['events']),
    // A faint grid gives the empty workspace some ground to drop blocks onto.
    grid: { spacing: 28, length: 3, colour: '#1e1838', snap: false },
    zoom: { controls: true, wheel: true, startScale: 0.9 },
    trashcan: true,
    move: { scrollbars: true, drag: true, wheel: true },
  });

  const changeListeners: Array<() => void> = [];
  workspace.addChangeListener((event) => {
    if (event.isUiEvent) return;
    for (const listener of changeListeners) listener();
  });

  return {
    workspace,
    getCode: () => workspaceToProgram(workspace),
    serialize: () =>
      Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>,
    load: (state) => Blockly.serialization.workspaces.load(state, workspace),
    setToolboxCategories: (ids, justUnlocked = []) => {
      workspace.updateToolbox(buildToolbox(ids, justUnlocked));
    },
    undo: () => workspace.undo(false),
    redo: () => workspace.undo(true),
    resetWorkspace: () => workspace.clear(),
    onChange: (listener) => changeListeners.push(listener),
    refresh: () => Blockly.svgResize(workspace),
    tidy: () => {
      // Group first (event blocks and their contents on top, loose action
      // blocks below, stable within each group), then let Blockly's clean-up
      // snap everything into one aligned column with real spacing.
      const rank = (type: string) => (type.startsWith('event_') ? 0 : 1);
      const tops = workspace.getTopBlocks(true);
      const sorted = [...tops].sort((a, b) => rank(a.type) - rank(b.type));
      Blockly.Events.setGroup(true);
      try {
        sorted.forEach((block, index) => {
          const position = block.getRelativeToSurfaceXY();
          block.moveBy(24 - position.x, 24 + index * 48 - position.y);
        });
        workspace.cleanUp();
        // cleanUp columnizes but keeps the column where it was; pin it to the
        // top-left corner and bring it into view.
        const tops = workspace.getTopBlocks(true);
        if (tops.length > 0) {
          const first = tops[0].getRelativeToSurfaceXY();
          const dx = 16 - first.x;
          const dy = 16 - first.y;
          if (dx !== 0 || dy !== 0) {
            for (const block of tops) block.moveBy(dx, dy);
          }
        }
        workspace.scrollCenter();
      } finally {
        Blockly.Events.setGroup(false);
      }
    },
  };
}
