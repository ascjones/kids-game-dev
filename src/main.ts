import { createGame } from './game/boot';
import { PlatformerScene } from './game/PlatformerScene';
import { fetchEnvironment } from './game/environmentLoader';
import { EnvironmentSync } from './game/environmentSync';
import type { Environment } from './game/environmentSchema';
import { createEditor, type EditorHandle } from './blocks/editor';
import { ChallengeEngine } from './challenges/engine';
import { fetchChallenges } from './challenges/loader';
import { createChallengePanel, type PanelView } from './ui/challengePanel';
import { createGameMakerBox } from './ui/gameMakerBox';
import { createJsView } from './ui/jsView';
import { createKidNotice } from './ui/kidNotice';
import { createPlayTestControls, type PlayTestHandle } from './ui/playTest';
import { createIntake, ideaDecision } from './ui/intake';
import { sendDecision, startInboxPolling } from './bridge/client';
import {
  createAutosaver,
  hasProject,
  loadProject,
  saveProject,
  type ProjectRecord,
} from './storage/projects';
import { downloadProject, importProjectFromText } from './storage/exportImport';
import { playBeep } from './game/sounds';

const notice = createKidNotice(document.querySelector<HTMLElement>('#kid-notice-root')!);

// Phaser listens for keys on the window and preventDefaults the ones it
// captures (space, arrows), which blocks typing them into text fields. Stop
// keyboard events at the document (bubble phase) whenever the child is typing:
// the field's own handlers (like Enter-to-send) have already run at the
// target, but Phaser's window listener never sees the event.
for (const type of ['keydown', 'keyup'] as const) {
  document.addEventListener(type, (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      event.stopPropagation();
    }
  });
}

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
  });

  createGameMakerBox(document.querySelector<HTMLElement>('#game-maker-box')!, (text) => {
    void sendDecision({ type: 'free_request', payload: { request: text } }).then((sent) => {
      notice.info(
        sent
          ? 'Sent to the game maker! Keep playing — your wish is being worked on.'
          : "The game maker isn't listening right now, but your wish is saved for later!",
      );
    });
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
      notice.celebrate(`Challenge done: ${current.title}`);
      playBeep('tada');
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
        if (import.meta.env.DEV) {
          // Diagnostic breadcrumb: what the completion checks actually saw.
          const breadcrumb = {
            endedBy,
            challengeId: engine.current()?.id ?? 'free-play',
            check: engine.current()?.check ?? null,
            completed: engine.currentCompleted(),
            state,
            code: editor.getCode(),
            progress: engine.progress(),
          };
          console.info('[kid-game] session ended', breadcrumb);
          void fetch('/__bridge/debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(breadcrumb),
          }).catch(() => {});
        }
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
  toolbarButton('✨ Tidy blocks', () => editor.tidy());
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
    // Editing blocks mid-play would leave the game running stale code — stop
    // it (without judging the interrupted session) so Play test always runs
    // what the child sees.
    if (playTest?.isPlaying()) {
      playTest.cancel();
      notice.info('You changed your blocks, so I stopped the game. Press Play test to try them!');
    }
  });

  // Block editor overlay: Blocks button, "e", or Escape to close.
  const editorOverlay = document.querySelector<HTMLElement>('#editor-overlay')!;
  function toggleEditor(show = editorOverlay.hidden): void {
    editorOverlay.hidden = !show;
    if (show) editor.refresh();
  }
  const blocksButton = document.createElement('button');
  blocksButton.className = 'kid-button';
  blocksButton.textContent = '🧩 Blocks (E)';
  blocksButton.onclick = () => toggleEditor();
  document.querySelector<HTMLElement>('#play-controls')!.prepend(blocksButton);
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'e' || event.key === 'E') {
      toggleEditor();
    } else if (event.key === 'Escape' && !editorOverlay.hidden) {
      toggleEditor(false);
    }
  });

  editor.setToolboxCategories(engine.toolboxCategories());
  renderPanel();
  autosaver.trigger();

  if (import.meta.env.DEV) {
    // Acceptance-test seam (dev only): lets Playwright load block programs
    // directly — everything downstream (generator, sandbox, game, challenge
    // checks) runs exactly as it does for hand-dragged blocks.
    (window as unknown as Record<string, unknown>).__kidGame = {
      loadWorkspace: (state: Record<string, unknown>) => {
        editor.resetWorkspace();
        editor.load(state);
      },
      currentChallengeId: () => engine.current()?.id ?? null,
      getCode: () => editor.getCode(),
    };
  }
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
      await sendDecision(ideaDecision(idea));
      const result = await fetchEnvironment();
      intake.dismiss();
      notice.info(
        "The game maker is building your world — it'll pop in here when it's ready. Start playing meanwhile!",
      );
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
