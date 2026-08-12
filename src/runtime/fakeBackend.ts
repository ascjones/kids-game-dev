import type { GameBackend } from './gameApi';

/** Minimal recording backend so runtime and integration tests never touch Phaser. */
export class FakeBackend implements GameBackend {
  velocityX = 0;
  x = 0;
  onGround = true;
  jumps: number[] = [];
  platforms: Array<{ x: number; y: number; width: number }> = [];
  collectibles: Array<{ x: number; y: number }> = [];
  patrolSpeed: number | null = null;
  sounds: string[] = [];
  winShown = false;

  setVelocityX(velocity: number): void {
    this.velocityX = velocity;
  }

  jump(strength: number): boolean {
    if (!this.onGround) return false;
    this.jumps.push(strength);
    return true;
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  spawnPlatform(x: number, y: number, width: number): void {
    this.platforms.push({ x, y, width });
  }

  spawnCollectible(x: number, y: number): void {
    this.collectibles.push({ x, y });
  }

  setEnemyPatrol(speed: number): void {
    this.patrolSpeed = speed;
  }

  playSound(name: string): void {
    this.sounds.push(name);
  }

  showWin(): void {
    this.winShown = true;
  }

  /** Advance fake physics: integrate x from velocity. */
  step(dtSeconds: number): void {
    this.x += this.velocityX * dtSeconds;
  }
}
