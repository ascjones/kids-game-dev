import { describe, expect, it } from 'vitest';
import { viewToWorld } from './viewCoords';

const singleScreen = { width: 800, height: 480 };
const wideWorld = { width: 2400, height: 480 };
const tallWorld = { width: 800, height: 1440 };

describe('viewToWorld', () => {
  it('is the identity when the camera has not scrolled (single-screen worlds are unchanged)', () => {
    expect(viewToWorld(0, 0, 400, 300, singleScreen)).toEqual({ x: 400, y: 300 });
  });

  it('leaves the extreme ends of the kid range untouched in a single-screen world', () => {
    expect(viewToWorld(0, 0, 0, 0, singleScreen)).toEqual({ x: 0, y: 0 });
    expect(viewToWorld(0, 0, 800, 480, singleScreen)).toEqual({ x: 800, y: 480 });
  });

  it('adds the horizontal camera scroll so "x 400" means the middle of what the child sees', () => {
    expect(viewToWorld(1600, 0, 400, 300, wideWorld)).toEqual({ x: 2000, y: 300 });
  });

  it('clamps to the world right edge when the view reaches past it', () => {
    expect(viewToWorld(1700, 0, 800, 300, wideWorld)).toEqual({ x: 2400, y: 300 });
  });

  it('adds the vertical camera scroll and clamps at the world bottom', () => {
    expect(viewToWorld(0, 600, 400, 300, tallWorld)).toEqual({ x: 400, y: 900 });
    expect(viewToWorld(0, 1200, 400, 480, tallWorld)).toEqual({ x: 400, y: 1440 });
  });

  it('clamps negative results back inside the world', () => {
    expect(viewToWorld(-500, -200, 100, 100, singleScreen)).toEqual({ x: 0, y: 0 });
  });

  it('clamps a coordinate that already sits past a small world', () => {
    expect(viewToWorld(0, 0, 800, 480, { width: 640, height: 360 })).toEqual({ x: 640, y: 360 });
  });

  it('is pure: the same inputs always give the same result and the world is not mutated', () => {
    const world = { width: 2400, height: 480 };
    const first = viewToWorld(300, 0, 400, 300, world);
    const second = viewToWorld(300, 0, 400, 300, world);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(world).toEqual({ width: 2400, height: 480 });
  });
});
