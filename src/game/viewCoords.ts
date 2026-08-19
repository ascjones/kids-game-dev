/** The world box a translated coordinate is clamped into. */
export interface WorldSize {
  width: number;
  height: number;
}

/**
 * Translate a kid-authored block coordinate (0–800 / 0–480, read as a position
 * in what the child can currently see) into a world coordinate (KTD2, R4).
 *
 * Adding the camera scroll makes "x 400" mean the middle of the current view
 * wherever the camera has travelled; when the camera sits at the origin — every
 * single-screen world, and every program saved before scrolling existed — the
 * translation is the identity, which is the compatibility guarantee of R5.
 *
 * Pure by design: the caller supplies the camera scroll, so the helper stays
 * engine-agnostic and testable, and blocks that fire mid-session (timers,
 * collect events) simply pass the scroll of that moment (R6).
 *
 * Clamping is deliberately point-wise: the result is a sprite *centre*, held
 * inside [0, width] × [0, height]. A wide platform spawned at the very edge can
 * still overhang the world boundary — the alternative, insetting by half the
 * width, would silently shift a platform the child asked for, and a visible
 * overhang is friendlier than a mystery displacement.
 */
export function viewToWorld(
  scrollX: number,
  scrollY: number,
  x: number,
  y: number,
  world: WorldSize,
): { x: number; y: number } {
  return {
    x: clamp(x + scrollX, world.width),
    y: clamp(y + scrollY, world.height),
  };
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}
