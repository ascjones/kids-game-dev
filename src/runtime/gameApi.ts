// The constrained surface kid code runs against (R13). Kid programs only ever
// see the `api` object created here; the backend hides Phaser (or a test fake).

export type KeyName = 'left' | 'right' | 'up' | 'down' | 'space';
export type TouchKind = 'enemy' | 'goal';

/** What the game world must provide. PlatformerScene implements this; tests use a fake. */
export interface GameBackend {
  setVelocityX(velocity: number): void;
  /** Attempt a jump; returns true if the player was on the ground and jumped. */
  jump(strength: number): boolean;
  isOnGround(): boolean;
  spawnPlatform(x: number, y: number, width: number): void;
  spawnCollectible(x: number, y: number): void;
  setEnemyPatrol(speed: number): void;
  playSound(name: string): void;
  showWin(): void;
}

export interface RuntimeStats {
  moved: boolean;
  jumped: boolean;
  score: number;
  scoreIncreasedOnCollect: boolean;
  collectedCount: number;
  platformsSpawned: number;
  collectiblesSpawned: number;
  patrolStarted: boolean;
  winTriggered: boolean;
  soundsPlayed: string[];
}

export interface GameApi {
  onStart(handler: () => void): void;
  onKey(key: KeyName, handler: () => void): void;
  onCollect(handler: () => void): void;
  onTouch(kind: TouchKind, handler: () => void): void;
  moveLeft(speed?: number): void;
  moveRight(speed?: number): void;
  stop(): void;
  jump(strength?: number): void;
  isOnGround(): boolean;
  spawnPlatform(x: number, y: number, width?: number): void;
  spawnCollectible(x: number, y: number): void;
  addScore(amount?: number): void;
  getScore(): number;
  after(seconds: number, handler: () => void): void;
  every(seconds: number, handler: () => void): void;
  playSound(name: string): void;
  patrolEnemies(speed?: number): void;
  win(): void;
  /** Internal: Blockly's INFINITE_LOOP_TRAP calls this inside every loop body. */
  __loopTick(): void;
}

export class LoopTrapError extends Error {
  constructor() {
    super('loop trap tripped');
    this.name = 'LoopTrapError';
  }
}

const DEFAULT_MOVE_SPEED = 200;
const DEFAULT_JUMP_STRENGTH = 520;
const DEFAULT_PATROL_SPEED = 80;
const DEFAULT_PLATFORM_WIDTH = 120;
const LOOP_TRAP_LIMIT = 100_000;

type MoveSource = 'ambient' | `key:${KeyName}`;

interface ScheduledTask {
  remaining: number;
  interval: number | null;
  handler: () => void;
}

function freshStats(): RuntimeStats {
  return {
    moved: false,
    jumped: false,
    score: 0,
    scoreIncreasedOnCollect: false,
    collectedCount: 0,
    platformsSpawned: 0,
    collectiblesSpawned: 0,
    patrolStarted: false,
    winTriggered: false,
    soundsPlayed: [],
  };
}

/**
 * Host-side runtime: owns handler registries, score, timers, and per-run stats.
 * The scene (or a test) drives it via start/frame/collect/touch.
 */
export class ApiRuntime {
  readonly api: GameApi;
  stats: RuntimeStats = freshStats();

  private backend: GameBackend;
  private startHandlers: Array<() => void> = [];
  private keyHandlers = new Map<KeyName, Array<() => void>>();
  private collectHandlers: Array<() => void> = [];
  private touchHandlers = new Map<TouchKind, Array<() => void>>();
  private tasks: ScheduledTask[] = [];
  private loopTicks = 0;
  private activeSource: MoveSource = 'ambient';
  private lastMoveSource: MoveSource | null = null;
  private errorHandlers: Array<(error: unknown) => void> = [];

  constructor(backend: GameBackend) {
    this.backend = backend;
    this.api = this.buildApi();
  }

  private buildApi(): GameApi {
    const runtime = this;
    return {
      onStart: (handler) => runtime.startHandlers.push(handler),
      onKey: (key, handler) => {
        const list = runtime.keyHandlers.get(key) ?? [];
        list.push(handler);
        runtime.keyHandlers.set(key, list);
      },
      onCollect: (handler) => runtime.collectHandlers.push(handler),
      onTouch: (kind, handler) => {
        const list = runtime.touchHandlers.get(kind) ?? [];
        list.push(handler);
        runtime.touchHandlers.set(kind, list);
      },
      moveLeft: (speed = DEFAULT_MOVE_SPEED) => runtime.move(-Math.abs(speed)),
      moveRight: (speed = DEFAULT_MOVE_SPEED) => runtime.move(Math.abs(speed)),
      stop: () => {
        runtime.backend.setVelocityX(0);
        runtime.lastMoveSource = null;
      },
      jump: (strength = DEFAULT_JUMP_STRENGTH) => {
        if (runtime.backend.jump(Math.abs(strength))) {
          runtime.stats.jumped = true;
        }
      },
      isOnGround: () => runtime.backend.isOnGround(),
      spawnPlatform: (x, y, width = DEFAULT_PLATFORM_WIDTH) => {
        runtime.backend.spawnPlatform(x, y, width);
        runtime.stats.platformsSpawned += 1;
      },
      spawnCollectible: (x, y) => {
        runtime.backend.spawnCollectible(x, y);
        runtime.stats.collectiblesSpawned += 1;
      },
      addScore: (amount = 1) => {
        runtime.stats.score += amount;
      },
      getScore: () => runtime.stats.score,
      after: (seconds, handler) => {
        runtime.tasks.push({ remaining: Math.max(0, seconds), interval: null, handler });
      },
      every: (seconds, handler) => {
        const interval = Math.max(0.05, seconds);
        runtime.tasks.push({ remaining: interval, interval, handler });
      },
      playSound: (name) => {
        runtime.backend.playSound(name);
        runtime.stats.soundsPlayed.push(name);
      },
      patrolEnemies: (speed = DEFAULT_PATROL_SPEED) => {
        runtime.backend.setEnemyPatrol(Math.abs(speed));
        runtime.stats.patrolStarted = true;
      },
      win: () => {
        if (runtime.stats.winTriggered) return;
        runtime.stats.winTriggered = true;
        runtime.backend.showWin();
      },
      __loopTick: () => {
        runtime.loopTicks += 1;
        if (runtime.loopTicks > LOOP_TRAP_LIMIT) {
          throw new LoopTrapError();
        }
      },
    };
  }

  private move(velocity: number): void {
    this.backend.setVelocityX(velocity);
    this.lastMoveSource = this.activeSource;
    if (velocity !== 0) this.stats.moved = true;
  }

  /** Subscribe to errors thrown by kid handlers during the run. */
  onError(handler: (error: unknown) => void): void {
    this.errorHandlers.push(handler);
  }

  /** Clear all handlers, timers, and stats so the same runtime can host a fresh run. */
  reset(): void {
    this.startHandlers = [];
    this.keyHandlers.clear();
    this.collectHandlers = [];
    this.touchHandlers.clear();
    this.tasks = [];
    this.loopTicks = 0;
    this.activeSource = 'ambient';
    this.lastMoveSource = null;
    this.stats = freshStats();
  }

  /** Run the program's start handlers. Call once per play test, after the sandbox ran. */
  start(): void {
    this.invokeAll(this.startHandlers, 'ambient');
  }

  /**
   * Advance one frame: run held-key handlers, tick timers, and release
   * key-driven movement when the key is no longer held.
   */
  frame(dtSeconds: number, heldKeys: readonly KeyName[]): void {
    for (const key of heldKeys) {
      const handlers = this.keyHandlers.get(key);
      if (handlers) this.invokeAll(handlers, `key:${key}`);
    }
    if (
      this.lastMoveSource !== null &&
      this.lastMoveSource !== 'ambient' &&
      !heldKeys.includes(this.lastMoveSource.slice(4) as KeyName)
    ) {
      this.backend.setVelocityX(0);
      this.lastMoveSource = null;
    }
    for (const task of [...this.tasks]) {
      task.remaining -= dtSeconds;
      if (task.remaining <= 0) {
        if (task.interval === null) {
          this.tasks.splice(this.tasks.indexOf(task), 1);
        } else {
          task.remaining += task.interval;
        }
        this.invokeOne(task.handler, 'ambient');
      }
    }
  }

  /** The player picked up a collectible. */
  collect(): void {
    this.stats.collectedCount += 1;
    const before = this.stats.score;
    this.invokeAll(this.collectHandlers, 'ambient');
    if (this.stats.score > before) {
      this.stats.scoreIncreasedOnCollect = true;
    }
  }

  /** The player touched an enemy or the goal. */
  touch(kind: TouchKind): void {
    const handlers = this.touchHandlers.get(kind);
    if (handlers) this.invokeAll(handlers, 'ambient');
  }

  private invokeAll(handlers: Array<() => void>, source: MoveSource): void {
    for (const handler of [...handlers]) {
      this.invokeOne(handler, source);
    }
  }

  private invokeOne(handler: () => void, source: MoveSource): void {
    const previous = this.activeSource;
    this.activeSource = source;
    try {
      handler();
    } catch (error) {
      for (const errorHandler of this.errorHandlers) errorHandler(error);
    } finally {
      this.activeSource = previous;
    }
  }
}
