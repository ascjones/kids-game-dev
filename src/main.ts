import { createGame } from './game/boot';
import { PlatformerScene } from './game/PlatformerScene';
import { fetchEnvironment } from './game/environmentLoader';
import {
  EnvironmentSync,
  resolveBootEnvironment,
  swapWorldForChallenge,
} from './game/environmentSync';
import type { Environment } from './game/environmentSchema';
import { createEditor, type EditorHandle } from './blocks/editor';
import { ChallengeEngine } from './challenges/engine';
import { hasChallengeEnvironmentApplied } from './challenges/types';
import { fetchChallenges } from './challenges/loader';
import { createChallengePanel, type PanelView } from './ui/challengePanel';
import { createGameMakerBox } from './ui/gameMakerBox';
import { createJsView } from './ui/jsView';
import { createKidNotice } from './ui/kidNotice';
import { createSessionController, type SessionController } from './ui/playTest';
import { createIntake, ideaDecision } from './ui/intake';
import { sendDecision, startInboxPolling } from './bridge/client';
import {
  createAutosaver,
  deleteProject,
  hasProject,
  loadProject,
  saveProject,
  type ProjectRecord,
} from './storage/projects';
import { downloadProject, importProjectFromText } from './storage/exportImport';
import { listServerSaves, loadServerSave, saveToServer } from './storage/serverSaves';
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
// Any wizard reply counts as progress on a pending wish.
const wizardAnswerListeners = new Set<() => void>();

startInboxPolling((message) => {
  if (message.type === 'environment_updated') {
    for (const listener of [...envUpdateListeners]) listener();
  } else if (message.type === 'message') {
    notice.celebrate(message.payload.text);
  }
  for (const listener of [...wizardAnswerListeners]) listener();
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
  id: string | null;
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
  // A challenge may carry its own world (KTD4). Normally it lands during the
  // transition into that challenge; this catches the case where the tab closed
  // between the transition and the save, which loses the marker and the world
  // together. Already-applied worlds report nothing pending, so a plain reload
  // never overwrites what the child (or the harness) has since changed.
  const bootWorld = engine.pendingEnvironment();
  if (bootWorld) {
    scene.setEnvironment(bootWorld);
    engine.markEnvironmentApplied();
  }

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
  let projectId = seed.id || crypto.randomUUID();
  const collectRecord = (): ProjectRecord => ({
    version: 1,
    id: projectId,
    savedAt: new Date().toISOString(),
    idea,
    workspace: editor.serialize(),
    challengeProgress: engine.progress(),
    environment: scene.getEnvironment(),
  });
  // Server library is the default home for games; IndexedDB is the cache.
  const autosaver = createAutosaver(collectRecord, undefined, saveToServer);

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
      // The new challenge may bring its own world, and a running session
      // carries stats (and a scene) from the previous one — so stop, swap,
      // then start the new challenge from a clean slate.
      void swapWorldForChallenge(engine.pendingEnvironment(), {
        isPlayTestActive: () => playTest?.isPlaying() ?? false,
        cancelPlayTest: () => playTest?.cancel(),
        startPlayTest: () => startPlaying(),
        applyEnvironment: async (environment) => {
          await envSync.applyChallengeEnvironment(environment);
          engine.markEnvironmentApplied();
          autosaver.trigger();
        },
      });
    },
  });

  const wizardBox = createGameMakerBox(
    document.querySelector<HTMLElement>('#game-maker-box')!,
    (text) => {
      void sendDecision({ type: 'free_request', payload: { request: text } }).then((sent) => {
        if (sent) {
          wizardBox.setBusy(text);
        } else {
          notice.info(
            "The Game Wizard is asleep right now, but your wish is saved for when it wakes up!",
          );
        }
      });
    },
  );
  wizardAnswerListeners.add(() => wizardBox.wishAnswered());

  function renderPanel(notYet = false): void {
    const current = engine.current();
    // The challenges are a fixed sequence, so the child gets to see where in
    // it they are.
    const total = challengesResult.challenges.length;
    const step = engine.progress().currentIndex + 1;
    let view: PanelView;
    if (!current) {
      view = { kind: 'free_play' };
    } else if (engine.currentCompleted()) {
      view = {
        kind: 'completed',
        title: current.title,
        explanation: current.explanation,
        step,
        total,
      };
    } else {
      view = {
        kind: 'challenge',
        title: current.title,
        prompt: current.prompt,
        hints: engine.revealedHints(),
        hasMoreHints: engine.hasMoreHints(),
        notYet,
        step,
        total,
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

  let playTest: SessionController | null = null;
  let sessionStartedAt = 0;
  let emptyNudgeShown = false;

  // Start (or restart) a play session — the editor-closed mode.
  function startPlaying(): void {
    if (!playTest) return;
    if (playTest.isPlaying()) playTest.cancel();
    const result = playTest.start();
    if (result.started) {
      sessionStartedAt = Date.now();
    } else if (result.empty && !emptyNudgeShown) {
      emptyNudgeShown = true;
      notice.info('Your game is waiting for blocks! Press 🧩 Build blocks to make something happen.');
    }
  }

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

  playTest = createSessionController(scene, {
      getCode: () => editor.getCode(),
      onKidMessage: (message) => notice.info(message),
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
        if (endedBy === 'success') {
          // Keep the fun going: a fresh session after the celebration moment.
          setTimeout(() => {
            if (editorOverlay.hidden && playTest && !playTest.isPlaying()) startPlaying();
          }, 700);
          return;
        }
        if (endedBy === 'cancelled') {
          // Entering Build mode is the natural "attempt over" moment — but only
          // judge sessions that actually got played, not quick in-and-outs.
          if (Date.now() - sessionStartedAt < 3000) return;
          const result = engine.evaluate(state);
          if (result === 'completed') {
            onChallengeCompleted();
          } else if (result === 'not_yet') {
            renderPanel(true);
          }
        }
      },
    });

  // Editor toolbar: undo/reset/save (R8) and the export/import round trip (R14).
  const toolbar = document.querySelector<HTMLElement>('#editor-toolbar')!;
  const toolbarButton = (label: string, onClick: () => void, variant = 'secondary'): void => {
    const button = document.createElement('button');
    button.className = `kid-button ${variant}`;
    button.textContent = label;
    button.onclick = onClick;
    toolbar.appendChild(button);
  };
  toolbarButton('↩ Undo', () => editor.undo());
  toolbarButton('↪ Redo', () => editor.redo());
  toolbarButton('✨ Tidy blocks', () => editor.tidy());
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
          projectId = record.id || projectId;
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
  // Everything past here throws work away, so it sits apart from the rest.
  const toolbarSpacer = document.createElement('span');
  toolbarSpacer.className = 'toolbar-spacer';
  toolbar.appendChild(toolbarSpacer);
  toolbarButton(
    '🗑 Start over',
    () => {
      void notice
        .confirm('Clear all your blocks and start this challenge fresh?')
        .then((yes) => {
          if (yes) editor.resetWorkspace();
        });
    },
    'secondary danger',
  );

  editor.onChange(() => {
    jsView.update(editor.getCode());
    autosaver.trigger();
    // No session cancel here: edits only happen in Build mode (no session
    // running), and Blockly delivers change events asynchronously — a late
    // event after the editor closes would kill the freshly started session.
  });

  // Block editor overlay: Blocks button, "e", or Escape to close.
  const editorOverlay = document.querySelector<HTMLElement>('#editor-overlay')!;
  const challengePanelElement = document.querySelector<HTMLElement>('#challenge-panel')!;
  const challengeSlot = document.querySelector<HTMLElement>('#challenge-slot')!;
  const challengeHome = challengePanelElement.parentElement!;
  // Two modes: Build (editor open, session stopped) and Play (editor closed,
  // session running). The mode toggle is the only play control.
  function toggleEditor(show = editorOverlay.hidden): void {
    editorOverlay.hidden = !show;
    if (show) {
      playTest?.cancel();
      // The challenge belongs beside the blocks while building.
      challengeSlot.appendChild(challengePanelElement);
      panel.expand();
      editor.refresh();
    } else {
      challengeHome.appendChild(challengePanelElement);
      startPlaying();
    }
    modeButton.textContent = show ? '▶ Play my game (E)' : '🧩 Build blocks (E)';
  }
  const modeButton = document.createElement('button');
  modeButton.className = 'kid-button magic dock-blocks';
  modeButton.textContent = '🧩 Build blocks (E)';
  modeButton.onclick = () => toggleEditor();
  const playControlsBar = document.querySelector<HTMLElement>('#play-controls')!;
  playControlsBar.prepend(modeButton);
  const dockTip = document.createElement('span');
  dockTip.className = 'dock-tip';
  dockTip.textContent = 'arrow keys to play';
  playControlsBar.appendChild(dockTip);

  // Minimize the dock to a single button so nothing blocks the view mid-game.
  const dockToggle = document.createElement('button');
  dockToggle.className = 'kid-button secondary dock-toggle';
  dockToggle.textContent = '▲';
  dockToggle.title = 'Hide the controls';
  dockToggle.onclick = () => {
    const collapsed = playControlsBar.classList.toggle('collapsed');
    dockToggle.textContent = collapsed ? '🎮' : '▲';
    dockToggle.title = collapsed ? 'Show the controls' : 'Hide the controls';
  };
  playControlsBar.prepend(dockToggle);

  // Quit to intake for a brand new game — with a save reminder first.
  const newGameButton = document.createElement('button');
  newGameButton.className = 'kid-button secondary dock-new';
  newGameButton.textContent = 'New game';
  newGameButton.onclick = async () => {
    playTest?.cancel();
    const saveFirst = await notice.confirm(
      'Before you start a new game — save this one to a file so you can bring it back later?',
      '💾 Save it first',
      'Skip saving',
    );
    if (saveFirst) downloadProject(collectRecord());
    const start = await notice.confirm(
      'Ready to start a brand new game? Your old one goes away (unless you saved it).',
      'Yes, new game!',
      'Keep playing this one',
    );
    if (!start) return;
    await deleteProject();
    location.reload();
  };
  playControlsBar.appendChild(newGameButton);
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
  // The app boots in Play mode: a saved program runs immediately.
  startPlaying();

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
    // Prefer the harness's current world; fall back to the saved snapshot —
    // unless this game is already living on a challenge-carried world, which
    // outranks the harness file so a reload cannot shrink it back (KTD4).
    const result = await fetchEnvironment();
    await bootWorkbench({
      environment: resolveBootEnvironment(
        result,
        saved.environment,
        hasChallengeEnvironmentApplied(saved.challengeProgress),
      ),
      idea: saved.idea,
      id: saved.id || null,
      workspace: saved.workspace,
      challengeProgress: saved.challengeProgress,
    });
    return;
  }

  const saves = await listServerSaves();
  const intake = createIntake(intakeRoot, {
    saves,
    onLoadSave: async (id) => {
      const record = await loadServerSave(id);
      if (!record) {
        notice.info("That saved game couldn't wake up — try another one!");
        return;
      }
      await saveProject(record);
      intake.dismiss();
      await bootWorkbench({
        environment: record.environment,
        idea: record.idea,
        id: record.id || null,
        workspace: record.workspace,
        challengeProgress: record.challengeProgress,
      });
    },
    onSubmit: async (idea) => {
      intake.showBuilding();
      await sendDecision(ideaDecision(idea));
      const result = await fetchEnvironment();
      intake.dismiss();
      notice.info(
        "The Game Wizard is conjuring your world — it'll appear here when the spell is ready. Start playing meanwhile!",
      );
      await bootWorkbench({
        environment: result.environment,
        idea,
        id: null,
        workspace: null,
        challengeProgress: null,
      });
    },
  });
}

void start();
