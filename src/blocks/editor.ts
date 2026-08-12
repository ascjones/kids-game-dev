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
}

const kidTheme = Blockly.Theme.defineTheme('kid-bright', {
  name: 'kid-bright',
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: '#f7f5ff',
    toolboxBackgroundColour: '#efeaff',
    flyoutBackgroundColour: '#e6defc',
    scrollbarColour: '#c9bcf2',
  },
  fontStyle: { family: '"Comic Sans MS", "Chalkboard SE", sans-serif', size: 12 },
});

export function createEditor(container: HTMLElement): EditorHandle {
  registerBlocks();
  registerGenerators();

  const workspace = Blockly.inject(container, {
    renderer: 'zelos',
    theme: kidTheme,
    toolbox: buildToolbox(['events']),
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
  };
}
