import { createGame } from './game/boot';
import { PlatformerScene } from './game/PlatformerScene';
import { fetchEnvironment } from './game/environmentLoader';
import { EnvironmentSync } from './game/environmentSync';
import type { Environment } from './game/environmentSchema';
import { createEditor, type EditorHandle } from './blocks/editor';
import { ChallengeEngine } from './challenges/engine';
import { fetchChallenges } from './challenges/loader';
import { createChallengePanel, type PanelView } from './ui/challengePanel';
import { createJsView } from './ui/jsView';
import { createKidNotice } from './ui/kidNotice';
import { createPlayTestControls, type PlayTestHandle } from './ui/playTest';
import { createIntake, submitIdea } from './ui/intake';
import { sendDecision, startInboxPolling } from './bridge/client';
import {
  createAutosaver,
  hasProject,
  loadProject,
  saveProject,
  type ProjectRecord,
} from './storage/projects';
import { downloadProject, importProjectFromText } from './storage/exportImport';

const notice = createKidNotice(document.querySelector<HTMLElement>('#kid-notice-root')!);

// ---- Inbox dispatch: one poll loop feeds intake waiting, env sync, and chat --

type EnvUpdateListener = () => void;
const envUpdateListeners = new Set<EnvUpdateListener>();

startInboxPolling((message) => {
  if (message.type === 'environment_updated') {
    for (const listener of [...envUpdateListeners]) listener();
  } else if (message.type === 'message') {
    notice.celebrate(message.payload.text);
  }
});

function waitForEnvironmentUpdate(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = () => {
      envUpdateListeners.delete(listener);
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      envUpdateListeners.delete(listener);
      resolve(false);
    }, timeoutMs);
    envUpdateListeners.add(listener);
  });
}

// ---- Phaser boot ------------------------------------------------------------

function bootScene(): Promise<PlatformerScene> {
  return new Promise((resolve) => {
    const game = createGame('game-container', [PlatformerScene]);
    game.events.once('platformer-ready', (scene: PlatformerScene) => resolve(scene));
    if (import.meta.hot) {
      // Vite does not tear down Phaser instances on hot reload; without this a
      // duplicate canvas appears on every edit.
      import.meta.hot.dispose(() => game.destroy(true));
    }
  });
}

// ---- Workbench: everything after a project exists ---------------------------

interface WorkbenchSeed {
  environment: Environment;
  idea: string;
  workspace: Record<string, unknown> | null;
  challengeProgress: ProjectRecord['challengeProgress'] | null;
}

async function bootWorkbench(seed: WorkbenchSeed): Promise<void> {
  document.querySelector<HTMLElement>('#workbench')!.hidden = false;

  const scene = await bootScene();
  scene.setEnvironment(seed.environment);

  const challengesResult = await fetchChallenges();
  if (challengesResult.kidMessage) notice.info(challengesResult.kidMessage);
  let engine = new ChallengeEngine(
    challengesResult.challenges,
    seed.challengeProgress ?? undefined,
  );

  const editor: EditorHandle = createEditor(
    document.querySelector<HTMLElement>('#blockly-container')!,
  );
  if (seed.workspace) {
    try {
      editor.load(seed.workspace);
    } catch {
      notice.info('Your saved blocks were a bit tangled, so we started you fresh. Your world is safe!');
    }
  }

  const jsView = createJsView(document.querySelector<HTMLElement>('#js-view')!);
  jsView.update(editor.getCode());

  const idea = seed.idea;
  const collectRecord = (): ProjectRecord => ({
    version: 1,
    savedAt: new Date().toISOString(),
    idea,
    workspace: editor.serialize(),
    challengeProgress: engine.progress(),
    environment: scene.getEnvironment(),
  });
  const autosaver = createAutosaver(collectRecord);

  const panel = createChallengePanel(document.querySelector<HTMLElement>('#challenge-panel')!, {
    onHintRequest: () => {
      engine.revealNextHint();
      renderPanel();
      autosaver.trigger();
    },
    onNextChallenge: () => {
      engine.advance();
      editor.setToolboxCategories(engine.toolboxCategories(), engine.justUnlocked());
      renderPanel();
      autosaver.trigger();
    },
    onFreeRequest: (text) => {
      void sendDecision({ type: 'free_request', payload: { request: text } }).then((sent) => {
        notice.info(
          sent
            ? 'Sent to the game maker! Keep playing — your wish is being worked on.'
            : "The game maker isn't listening right now, but your wish is saved for later!",
        );
      });
    },
  });

  function renderPanel(notYet = false): void {
    const current = engine.current();
    let view: PanelView;
    if (!current) {
      view = { kind: 'free_play' };
    } else if (engine.currentCompleted()) {
      view = { kind: 'completed', title: current.title, explanation: current.explanation };
    } else {
      view = {
        kind: 'challenge',
        title: current.title,
        prompt: current.prompt,
        hints: engine.revealedHints(),
        hasMoreHints: engine.hasMoreHints(),
        notYet,
      };
    }
    panel.render(view);
  }

  function onChallengeCompleted(): void {
    const current = engine.current();
    if (current) {
      void sendDecision({
        type: 'challenge_completed',
        payload: { challengeId: current.id, challengeTitle: current.title },
      });
    }
    renderPanel();
    autosaver.trigger();
  }

  let playTest: PlayTestHandle | null = null;

  const envSync = new EnvironmentSync({
    fetchEnvironment,
    applyEnvironment: (environment) => {
      scene.setEnvironment(environment);
      autosaver.trigger();
    },
    isPlayTestActive: () => playTest?.isPlaying() ?? false,
    autosave: () => autosaver.flush(),
    announce: (message) => notice.celebrate(message),
    hasProgress: () =>
      engine.progress().completedIds.length > 0 || editor.getCode().trim() !== '',
  });
  envUpdateListeners.add(() => void envSync.onEnvironmentUpdated());

  playTest = createPlayTestControls(
    document.querySelector<HTMLElement>('#play-controls')!,
    scene,
    notice,
    {
      getCode: () => editor.getCode(),
      onLiveState: (state) => {
        if (engine.evaluate(state) === 'completed') {
          onChallengeCompleted();
          return true;
        }
        return false;
      },
      onSessionEnd: (state, endedBy) => {
        void envSync.onPlayTestEnded();
        if (endedBy !== 'stop') return;
        const result = engine.evaluate(state);
        if (result === 'completed') {
          onChallengeCompleted();
        } else if (result === 'not_yet') {
          renderPanel(true);
        }
      },
    },
  );

  // Editor toolbar: undo/reset/save (R8) and the export/import round trip (R14).
  const toolbar = document.querySelector<HTMLElement>('#editor-toolbar')!;
  toolbar.classList.add('panel');
  toolbar.style.cssText += 'display:flex;gap:8px;flex-wrap:wrap;';
  const toolbarButton = (label: string, onClick: () => void): void => {
    const button = document.createElement('button');
    button.className = 'kid-button secondary';
    button.textContent = label;
    button.onclick = onClick;
    toolbar.appendChild(button);
  };
  toolbarButton('↩ Undo', () => editor.undo());
  toolbarButton('↪ Redo', () => editor.redo());
  toolbarButton('🗑 Start over', () => {
    void notice
      .confirm('Clear all your blocks and start this challenge fresh?')
      .then((yes) => {
        if (yes) editor.resetWorkspace();
      });
  });
  toolbarButton('💾 Save', () => {
    autosaver.trigger();
    void autosaver.flush().then(() => notice.celebrate('Saved! Your game is safe.'));
  });
  toolbarButton('📤 Save to a file', () => downloadProject(collectRecord()));
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.hidden = true;
  importInput.onchange = async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    const text = await file.text();
    await importProjectFromText(
      {
        hasExistingProject: hasProject,
        confirm: (message) => notice.confirm(message),
        announceError: (message) => notice.info(message),
        applyProject: async (record) => {
          await saveProject(record);
          scene.setEnvironment(record.environment);
          engine = new ChallengeEngine(challengesResult.challenges, record.challengeProgress);
          editor.load(record.workspace);
          editor.setToolboxCategories(engine.toolboxCategories());
          renderPanel();
          notice.celebrate('Your game is back! Just how you saved it.');
        },
      },
      text,
    );
  };
  toolbar.appendChild(importInput);
  toolbarButton('📥 Load from a file', () => importInput.click());

  editor.onChange(() => {
    jsView.update(editor.getCode());
    autosaver.trigger();
  });

  editor.setToolboxCategories(engine.toolboxCategories());
  renderPanel();
  autosaver.trigger();
}

// ---- App entry: resume a project or run first-time intake -------------------

async function start(): Promise<void> {
  const intakeRoot = document.querySelector<HTMLElement>('#intake-root')!;
  const saved = await loadProject();

  if (saved) {
    intakeRoot.remove();
    // Prefer the harness's current world; fall back to the saved snapshot.
    const result = await fetchEnvironment();
    await bootWorkbench({
      environment: result.source === 'loaded' ? result.environment : saved.environment,
      idea: saved.idea,
      workspace: saved.workspace,
      challengeProgress: saved.challengeProgress,
    });
    return;
  }

  const intake = createIntake(intakeRoot, {
    onSubmit: async (idea) => {
      intake.showBuilding();
      const outcome = await submitIdea(
        { sendDecision, waitForEnvironmentUpdate },
        idea,
      );
      const result = await fetchEnvironment();
      intake.dismiss();
      if (outcome === 'fallback') {
        notice.info(
          "The game maker is still dreaming up your world! Here's a starter world to play in — yours will arrive when it's ready.",
        );
      }
      if (result.source === 'fallback' && outcome === 'harness' && result.kidMessage) {
        notice.info(result.kidMessage);
      }
      await bootWorkbench({
        environment: result.environment,
        idea,
        workspace: null,
        challengeProgress: null,
      });
    },
  });
}

void start();
