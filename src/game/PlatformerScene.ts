import Phaser from 'phaser';
import type { Environment, EnemyDef } from './environmentSchema';
import { starterEnvironment } from './starterEnvironment';
import type { ApiRuntime, GameBackend, KeyName } from '../runtime/gameApi';
import { playBeep } from './sounds';

/** Scene-side facts the challenge checks need beyond the runtime's stats. */
export interface SceneStats {
  initialPlatformCount: number;
  platformCount: number;
  enemyPatrolled: boolean;
}

interface EnemyState {
  sprite: Phaser.Physics.Arcade.Sprite;
  def: EnemyDef;
  speed: number;
  reachedMin: boolean;
  reachedMax: boolean;
}

const TOUCH_COOLDOWN_MS = 600;

/**
 * The platformer world, rendered entirely from harness-owned environment data
 * (KTD9). Implements GameBackend so kid programs drive it only through the
 * constrained api (R13).
 */
export class PlatformerScene extends Phaser.Scene implements GameBackend {
  static readonly KEY = 'platformer';

  private environment: Environment = starterEnvironment;
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private collectibles!: Phaser.Physics.Arcade.Group;
  private goalSprite: Phaser.Physics.Arcade.Sprite | null = null;
  private enemies: EnemyState[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private winText: Phaser.GameObjects.Text | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private runtime: ApiRuntime | null = null;
  private colliders: Phaser.Physics.Arcade.Collider[] = [];
  private lastTouch: Record<string, number> = {};
  private stats: SceneStats = { initialPlatformCount: 0, platformCount: 0, enemyPatrolled: false };

  constructor() {
    super(PlatformerScene.KEY);
  }

  create(): void {
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.buildWorld();
    this.game.events.emit('platformer-ready', this);
  }

  /** Swap in a new environment (intake result or harness update) and rebuild. */
  setEnvironment(environment: Environment): void {
    this.environment = environment;
    if (this.sys.isActive()) {
      this.buildWorld();
    }
  }

  getEnvironment(): Environment {
    return this.environment;
  }

  /** Reset the world to the environment baseline and attach the run's runtime. */
  beginPlayTest(runtime: ApiRuntime): void {
    this.buildWorld();
    this.runtime = runtime;
  }

  /** Detach the runtime and restore the edit-mode baseline world. */
  endPlayTest(): SceneStats {
    const stats = { ...this.stats };
    this.runtime = null;
    this.buildWorld();
    return stats;
  }

  getSceneStats(): SceneStats {
    return { ...this.stats };
  }

  isPlaying(): boolean {
    return this.runtime !== null;
  }

  private buildWorld(): void {
    const env = this.environment;
    // Explicit teardown: destroying each object also removes its physics body;
    // colliders must go first or they would reference dead bodies.
    for (const collider of this.colliders) collider.destroy();
    this.colliders = [];
    (this.platforms as Phaser.Physics.Arcade.StaticGroup | undefined)?.destroy(true);
    (this.collectibles as Phaser.Physics.Arcade.Group | undefined)?.destroy(true);
    for (const child of [...this.children.list]) child.destroy();
    this.enemies = [];
    this.goalSprite = null;
    this.winText = null;
    this.lastTouch = {};

    this.cameras.main.setBackgroundColor(env.theme.sky);
    this.makeTextures();

    this.platforms = this.physics.add.staticGroup();
    for (const p of env.platforms) {
      this.addPlatformSprite(p.x, p.y, p.width, p.height);
    }

    this.player = this.physics.add.sprite(env.player.spawn.x, env.player.spawn.y, 'player');
    this.player.setCollideWorldBounds(true);

    this.collectibles = this.physics.add.group({ allowGravity: false });
    for (const c of env.collectibles) {
      this.collectibles.create(c.x, c.y, 'collectible');
    }

    for (const def of env.enemies) {
      const sprite = this.physics.add.sprite(def.x, def.y, 'enemy');
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      this.enemies.push({
        sprite,
        def,
        speed: def.speed,
        reachedMin: false,
        reachedMax: false,
      });
      if (def.speed > 0) sprite.setVelocityX(def.speed);
    }

    if (env.goal) {
      this.goalSprite = this.physics.add.sprite(env.goal.x, env.goal.y, 'goal');
      (this.goalSprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    }

    this.colliders.push(
      this.physics.add.collider(this.player, this.platforms),
      this.physics.add.overlap(this.player, this.collectibles, (_player, collectible) => {
        (collectible as Phaser.Physics.Arcade.Sprite).destroy();
        this.runtime?.collect();
      }),
    );
    for (const enemy of this.enemies) {
      this.colliders.push(
        this.physics.add.overlap(this.player, enemy.sprite, () => this.touched('enemy')),
      );
    }
    if (this.goalSprite) {
      this.colliders.push(
        this.physics.add.overlap(this.player, this.goalSprite, () => this.touched('goal')),
      );
    }

    this.scoreText = this.add
      .text(12, 8, '', { fontSize: '22px', color: '#2b2440', fontStyle: 'bold' })
      .setDepth(10);

    this.stats = {
      initialPlatformCount: env.platforms.length,
      platformCount: env.platforms.length,
      enemyPatrolled: false,
    };
  }

  private makeTextures(): void {
    const theme = this.environment.theme;
    const gfx = this.add.graphics();
    const paint = (key: string, color: string, width: number, height: number, round = 6) => {
      if (this.textures.exists(key)) this.textures.remove(key);
      gfx.clear();
      gfx.fillStyle(Number.parseInt(color.slice(1), 16), 1);
      gfx.fillRoundedRect(0, 0, width, height, round);
      gfx.generateTexture(key, width, height);
    };
    paint('platform', theme.platform, 100, 24, 4);
    paint('player', theme.player, 32, 44, 8);
    paint('collectible', theme.collectible, 24, 24, 12);
    paint('enemy', theme.enemy, 34, 30, 8);
    paint('goal', theme.goal, 30, 60, 4);
    gfx.destroy();
  }

  private addPlatformSprite(x: number, y: number, width: number, height: number): void {
    const sprite = this.platforms.create(x, y, 'platform') as Phaser.Physics.Arcade.Sprite;
    sprite.setDisplaySize(width, height);
    sprite.refreshBody();
  }

  private touched(kind: 'enemy' | 'goal'): void {
    const now = this.time.now;
    if (now - (this.lastTouch[kind] ?? -Infinity) < TOUCH_COOLDOWN_MS) return;
    this.lastTouch[kind] = now;
    this.runtime?.touch(kind);
  }

  update(_time: number, delta: number): void {
    if (this.runtime) {
      const held: KeyName[] = [];
      if (this.cursors.left.isDown) held.push('left');
      if (this.cursors.right.isDown) held.push('right');
      if (this.cursors.up.isDown) held.push('up');
      if (this.cursors.down.isDown) held.push('down');
      if (this.spaceKey.isDown) held.push('space');
      this.runtime.frame(delta / 1000, held);
      this.scoreText.setText(`⭐ ${this.runtime.stats.score}`);

      if (this.player.y > this.scale.height + 60) {
        this.player.setPosition(
          this.environment.player.spawn.x,
          this.environment.player.spawn.y,
        );
        this.player.setVelocity(0, 0);
      }
    } else {
      this.scoreText.setText('');
    }

    for (const enemy of this.enemies) {
      if (enemy.speed <= 0) continue;
      const patrol = enemy.def.patrol ?? { minX: enemy.def.x - 100, maxX: enemy.def.x + 100 };
      const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.x === 0) enemy.sprite.setVelocityX(enemy.speed);
      if (enemy.sprite.x <= patrol.minX) {
        enemy.reachedMin = true;
        enemy.sprite.setVelocityX(enemy.speed);
      } else if (enemy.sprite.x >= patrol.maxX) {
        enemy.reachedMax = true;
        enemy.sprite.setVelocityX(-enemy.speed);
      }
      if (enemy.reachedMin && enemy.reachedMax) {
        this.stats.enemyPatrolled = true;
      }
    }
  }

  // ---- GameBackend (the only surface kid code reaches, via ApiRuntime) ----

  setVelocityX(velocity: number): void {
    this.player.setVelocityX(velocity);
  }

  jump(strength: number): boolean {
    if (!this.isOnGround()) return false;
    this.player.setVelocityY(-strength);
    const soundName = this.environment.sounds.jump;
    if (soundName) playBeep(soundName);
    return true;
  }

  isOnGround(): boolean {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    return body.blocked.down || body.touching.down;
  }

  spawnPlatform(x: number, y: number, width: number): void {
    this.addPlatformSprite(x, y, width, 24);
    this.stats.platformCount += 1;
  }

  spawnCollectible(x: number, y: number): void {
    this.collectibles.create(x, y, 'collectible');
  }

  setEnemyPatrol(speed: number): void {
    for (const enemy of this.enemies) {
      enemy.speed = speed;
      enemy.sprite.setVelocityX(speed);
    }
  }

  playSound(name: string): void {
    playBeep(this.environment.sounds[name] ?? name);
  }

  showWin(): void {
    if (this.winText) return;
    const soundName = this.environment.sounds.win;
    if (soundName) playBeep(soundName);
    this.winText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '🎉 You did it! 🎉', {
        fontSize: '48px',
        color: '#ffffff',
        backgroundColor: '#2eaf5f',
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(20);
  }
}
