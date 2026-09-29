import { CONFIG } from '../config.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function corridorHorizonY() {
  return CONFIG.VISUAL.SKY_BAND;
}

// Gameplay road shape (inset, hedge width) is measured from a fixed origin,
// not from the painted horizon, so moving the horizon never changes play.
export function corridorNearT(screenY, height = CONFIG.CANVAS_HEIGHT) {
  const horizon = CONFIG.CORRIDOR_ORIGIN_Y;
  return clamp01((screenY - horizon) / Math.max(1, height - horizon));
}

function smooth01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function worldDepth(screenY, height = CONFIG.CANVAS_HEIGHT) {
  const horizon = corridorHorizonY();
  const t = corridorNearT(screenY, height);
  const approach = smooth01(t);
  const far = CONFIG.VISUAL.DEPTH_SCALE_FAR ?? 0.9;
  const near = CONFIG.VISUAL.DEPTH_SCALE_NEAR ?? 1.05;
  const scale = far + (near - far) * approach;
  return {
    t,
    z: 1 / Math.max(0.001, scale),
    scale,
    alpha: 0.86 + 0.14 * t,
    contrast: 0.72 + 0.28 * t,
    screenY,
    horizon
  };
}

export function obstacleDepthScale(screenY, height = CONFIG.CANVAS_HEIGHT) {
  const t = corridorNearT(screenY, height);
  const far = CONFIG.VISUAL.OBSTACLE_SCALE_FAR ?? 0.9;
  const mid = CONFIG.VISUAL.OBSTACLE_SCALE_MID ?? 0.98;
  const near = CONFIG.VISUAL.OBSTACLE_SCALE_NEAR ?? 1.06;
  if (t < 0.5) return far + (mid - far) * smooth01(t * 2);
  return mid + (near - mid) * smooth01((t - 0.5) * 2);
}

export function pathInsetAt(screenY, height = CONFIG.CANVAS_HEIGHT) {
  const farness = 1 - corridorNearT(screenY, height);
  const eased = farness * 0.55 + farness * farness * 0.45;
  const near = CONFIG.VISUAL.PATH_INSET_NEAR;
  const far = CONFIG.VISUAL.PATH_INSET_FAR;
  return near + eased * (far - near);
}

export function roadInnerLeft(screenY, height = CONFIG.CANVAS_HEIGHT) {
  return CONFIG.TRACK_LEFT + pathInsetAt(screenY, height);
}

export function roadInnerRight(screenY, height = CONFIG.CANVAS_HEIGHT) {
  return CONFIG.TRACK_RIGHT - pathInsetAt(screenY, height);
}

export function hedgeBorderWidth(screenY, height = CONFIG.CANVAS_HEIGHT) {
  const t = corridorNearT(screenY, height);
  const near = CONFIG.VISUAL.HEDGE_BORDER_NEAR;
  const far = CONFIG.VISUAL.HEDGE_BORDER_FAR;
  return far + (near - far) * t;
}

export function sandShoulderWidth(screenY, height = CONFIG.CANVAS_HEIGHT) {
  const t = corridorNearT(screenY, height);
  const near = CONFIG.VISUAL.SAND_SHOULDER_NEAR;
  const far = CONFIG.VISUAL.SAND_SHOULDER_FAR;
  return far + (near - far) * t;
}

export function playableXBounds(screenY, playerWidth = CONFIG.PLAYER_WIDTH, height = CONFIG.CANVAS_HEIGHT) {
  const half = playerWidth / 2;
  const left = roadInnerLeft(screenY, height);
  const right = roadInnerRight(screenY, height);
  return {
    left,
    right,
    minX: left + half,
    maxX: right - half
  };
}
