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

function hexToInt(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Lighten (positive) or darken (negative) a #rrggbb color by a fraction. */
function shade(hex: string, amount: number): number {
  const base = hexToInt(hex);
  const channel = (offset: number) => {
    const value = (base >> offset) & 0xff;
    const shifted =
      amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(shifted)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

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
  private collectBurst: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private jumpDust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private lastTouch: Record<string, number> = {};
  private stats: SceneStats = { initialPlatformCount: 0, platformCount: 0, enemyPatrolled: false };

  constructor() {
    super(PlatformerScene.KEY);
  }

  create(): void {
    const keyboard = this.input.keyboard!;
    // Without this, Phaser preventDefaults captured keys globally and the
    // child cannot type spaces or arrows into text inputs (free requests).
    keyboard.disableGlobalCapture();
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
    this.tweens.killAll();
    for (const collider of this.colliders) collider.destroy();
    this.colliders = [];
    (this.platforms as Phaser.Physics.Arcade.StaticGroup | undefined)?.destroy(true);
    (this.collectibles as Phaser.Physics.Arcade.Group | undefined)?.destroy(true);
    for (const child of [...this.children.list]) child.destroy();
    this.enemies = [];
    this.goalSprite = null;
    this.winText = null;
    this.collectBurst = null;
    this.jumpDust = null;
    this.lastTouch = {};

    this.cameras.main.setBackgroundColor(env.theme.sky);
    this.makeTextures();
    this.buildBackdrop();

    this.platforms = this.physics.add.staticGroup();
    for (const p of env.platforms) {
      this.addPlatformSprite(p.x, p.y, p.width, p.height);
    }

    this.player = this.physics.add.sprite(env.player.spawn.x, env.player.spawn.y, 'player');
    this.player.setCollideWorldBounds(true);

    this.collectibles = this.physics.add.group({ allowGravity: false });
    for (const c of env.collectibles) {
      this.addCollectibleSprite(c.x, c.y);
    }

    for (const def of env.enemies) {
      const sprite = this.physics.add.sprite(def.x, def.y, 'enemy');
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      this.tweens.add({
        targets: sprite,
        angle: { from: -5, to: 5 },
        duration: 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
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
      this.tweens.add({
        targets: this.goalSprite,
        angle: { from: -3, to: 3 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.collectBurst = this.add
      .particles(0, 0, 'spark', {
        speed: { min: 90, max: 240 },
        lifespan: 550,
        scale: { start: 1.1, end: 0 },
        gravityY: 320,
        emitting: false,
        tint: hexToInt(env.theme.collectible),
      })
      .setDepth(5);
    this.jumpDust = this.add
      .particles(0, 0, 'dust', {
        speed: { min: 30, max: 90 },
        lifespan: 350,
        scale: { start: 0.8, end: 0 },
        alpha: { start: 0.7, end: 0 },
        emitting: false,
        tint: 0xdddddd,
      })
      .setDepth(5);

    this.colliders.push(
      this.physics.add.collider(this.player, this.platforms),
      this.physics.add.overlap(this.player, this.collectibles, (_player, collectible) => {
        const star = collectible as Phaser.Physics.Arcade.Sprite;
        this.collectBurst?.explode(16, star.x, star.y);
        star.destroy();
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

    // Top-center, below the floating play controls; the game maker box owns
    // the screen's top-right corner.
    this.scoreText = this.add
      .text(this.scale.width / 2, 64, '', {
        fontSize: '24px',
        color: '#2b2440',
        fontStyle: 'bold',
        backgroundColor: 'rgba(255,255,255,0.85)',
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5, 0)
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
    const finish = (key: string, width: number, height: number) => {
      if (this.textures.exists(key)) this.textures.remove(key);
      gfx.generateTexture(key, width, height);
      gfx.clear();
    };

    // Platform: earth body with a bright grass lip.
    gfx.fillStyle(shade(theme.platform, -0.35), 1);
    gfx.fillRoundedRect(0, 0, 100, 24, 5);
    gfx.fillStyle(hexToInt(theme.platform), 1);
    gfx.fillRoundedRect(0, 0, 100, 9, { tl: 5, tr: 5, bl: 0, br: 0 });
    finish('platform', 100, 24);

    // Player: friendly blob with eyes and a smile.
    gfx.fillStyle(hexToInt(theme.player), 1);
    gfx.fillRoundedRect(0, 0, 32, 44, 12);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(10, 14, 6);
    gfx.fillCircle(22, 14, 6);
    gfx.fillStyle(0x2b2440, 1);
    gfx.fillCircle(11.5, 14, 3);
    gfx.fillCircle(23.5, 14, 3);
    gfx.fillStyle(0x2b2440, 1);
    gfx.fillRoundedRect(10, 28, 12, 4, 2);
    finish('player', 32, 44);

    // Collectible: a real five-point star with a glow rim.
    const starPoints = (cx: number, cy: number, outer: number, inner: number) => {
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push(
          new Phaser.Math.Vector2(
            cx + radius * Math.cos(angle),
            cy + radius * Math.sin(angle),
          ),
        );
      }
      return points;
    };
    gfx.fillStyle(shade(theme.collectible, 0.5), 0.55);
    gfx.fillPoints(starPoints(14, 14, 14, 6.5), true);
    gfx.fillStyle(hexToInt(theme.collectible), 1);
    gfx.fillPoints(starPoints(14, 14, 12, 5.5), true);
    finish('collectible', 28, 28);

    // Enemy: a little patrol dog — floppy ears, snout, wagging tail nub.
    gfx.fillStyle(shade(theme.enemy, -0.3), 1);
    gfx.fillRoundedRect(0, 12, 8, 6, 3); // tail nub
    gfx.fillStyle(hexToInt(theme.enemy), 1);
    gfx.fillRoundedRect(4, 6, 34, 22, 10); // body + head
    gfx.fillStyle(shade(theme.enemy, -0.35), 1);
    gfx.fillRoundedRect(22, 0, 7, 12, 3); // left floppy ear
    gfx.fillRoundedRect(33, 0, 7, 12, 3); // right floppy ear
    gfx.fillCircle(13, 30, 4); // paws
    gfx.fillCircle(31, 30, 4);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(25, 13, 4.5); // eyes
    gfx.fillCircle(35, 13, 4.5);
    gfx.fillStyle(0x2b2440, 1);
    gfx.fillCircle(26, 14, 2.2);
    gfx.fillCircle(34, 14, 2.2);
    gfx.fillStyle(shade(theme.enemy, 0.45), 1);
    gfx.fillRoundedRect(26, 18, 12, 8, 4); // snout
    gfx.fillStyle(0x2b2440, 1);
    gfx.fillCircle(36, 21, 2); // nose
    finish('enemy', 40, 34);

    // Goal: flag on a pole.
    gfx.fillStyle(0x8a6d4b, 1);
    gfx.fillRoundedRect(13, 0, 5, 60, 2);
    gfx.fillStyle(hexToInt(theme.goal), 1);
    gfx.fillTriangle(18, 2, 18, 26, 44, 14);
    finish('goal', 46, 60);

    // Particles.
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 4);
    finish('spark', 8, 8);
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillCircle(5, 5, 5);
    finish('dust', 10, 10);
    gfx.fillStyle(0xa8cfff, 1);
    gfx.fillRoundedRect(0, 0, 2.5, 9, 1);
    finish('raindrop', 3, 9);

    // Backdrop pieces: cloud puff and rolling hill.
    gfx.fillStyle(0xffffff, 0.92);
    gfx.fillCircle(26, 30, 18);
    gfx.fillCircle(48, 24, 22);
    gfx.fillCircle(72, 30, 16);
    gfx.fillRoundedRect(10, 26, 78, 18, 9);
    finish('cloud', 100, 48);
    gfx.fillStyle(shade(theme.platform, -0.15), 1);
    gfx.fillEllipse(150, 150, 300, 190);
    finish('hill', 300, 150);

    gfx.destroy();
  }

  private buildBackdrop(): void {
    const theme = this.environment.theme;
    const { width, height } = this.scale;

    const skyGfx = this.add.graphics();
    if (this.textures.exists('sky')) this.textures.remove('sky');
    skyGfx.fillGradientStyle(
      shade(theme.sky, 0.45),
      shade(theme.sky, 0.45),
      hexToInt(theme.sky),
      hexToInt(theme.sky),
      1,
    );
    skyGfx.fillRect(0, 0, width, height);
    // Sun with a soft halo.
    skyGfx.fillStyle(0xfff3b0, 0.35);
    skyGfx.fillCircle(width - 110, 86, 52);
    skyGfx.fillStyle(0xffe066, 1);
    skyGfx.fillCircle(width - 110, 86, 34);
    skyGfx.generateTexture('sky', width, height);
    skyGfx.destroy();
    this.add.image(width / 2, height / 2, 'sky').setDepth(-10);

    this.add.image(140, height - 30, 'hill').setDepth(-8).setAlpha(0.5);
    this.add.image(520, height - 16, 'hill').setDepth(-8).setScale(1.4, 0.8).setAlpha(0.4);

    for (const [x, y, scale, duration] of [
      [120, 70, 0.9, 46000],
      [420, 120, 0.6, 60000],
      [680, 50, 0.75, 52000],
    ] as const) {
      const cloud = this.add.image(x, y, 'cloud').setDepth(-7).setScale(scale).setAlpha(0.9);
      this.tweens.add({
        targets: cloud,
        x: x + this.scale.width,
        duration,
        repeat: -1,
        onRepeat: () => cloud.setX(-60),
      });
    }

    if (this.environment.weather === 'rain') {
      this.add
        .particles(0, 0, 'raindrop', {
          x: { min: -40, max: this.scale.width + 40 },
          y: -12,
          speedY: { min: 480, max: 640 },
          speedX: { min: 30, max: 70 },
          lifespan: 1300,
          quantity: 2,
          frequency: 18,
          alpha: { start: 0.55, end: 0.25 },
        })
        .setDepth(-6);
    }
  }

  private addCollectibleSprite(x: number, y: number): void {
    const star = this.collectibles.create(x, y, 'collectible') as Phaser.Physics.Arcade.Sprite;
    // Position is body-managed (arcade would overwrite a y tween); rotation
    // and scale are free to animate.
    this.tweens.add({
      targets: star,
      angle: { from: -14, to: 14 },
      scale: { from: 1, to: 1.18 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
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
    this.jumpDust?.explode(8, this.player.x, this.player.y + 20);
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
    this.addCollectibleSprite(x, y);
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
    const theme = this.environment.theme;
    const confetti = this.add
      .particles(0, 0, 'spark', {
        x: { min: 0, max: this.scale.width },
        y: -10,
        speedY: { min: 120, max: 260 },
        speedX: { min: -60, max: 60 },
        lifespan: 2600,
        scale: { start: 1.2, end: 0.3 },
        quantity: 4,
        frequency: 40,
        rotate: { min: 0, max: 360 },
        tint: [
          hexToInt(theme.collectible),
          hexToInt(theme.player),
          hexToInt(theme.goal),
          0xffffff,
        ],
      })
      .setDepth(19);
    this.time.delayedCall(2600, () => confetti.stop());
    this.winText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '🎉 You did it! 🎉', {
        fontSize: '48px',
        color: '#ffffff',
        backgroundColor: '#2eaf5f',
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setScale(0)
      .setDepth(20);
    this.tweens.add({
      targets: this.winText,
      scale: 1,
      duration: 500,
      ease: 'Back.easeOut',
    });
  }
}
