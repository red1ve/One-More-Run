import { CONFIG } from '../config.js';
import { corridorHorizonY, pathInsetAt } from '../game/Corridor.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smooth01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function projectorConfig() {
  const vis = CONFIG.VISUAL.PROJECTOR || {};
  return {
    farRoadWidth: vis.FAR_ROAD_WIDTH ?? 120,
    xScaleFar: vis.X_SCALE_FAR ?? 0.75,
    scaleFar: vis.SCALE_FAR ?? 0.88,
    scaleMid: vis.SCALE_MID ?? 0.94,
    scaleNear: vis.SCALE_NEAR ?? 1,
    farYSpeed: vis.FAR_Y_SPEED ?? 0.58,
    readZoneAbove: vis.READ_ZONE_ABOVE ?? CONFIG.CHOICE_SHOW_HEIGHT ?? 280,
    roadSections: vis.ROAD_SECTIONS ?? 18
  };
}

export function vanishPoint(width = CONFIG.CANVAS_WIDTH) {
  return {
    x: width * 0.5,
    y: corridorHorizonY()
  };
}

export function readZoneStartWorldY() {
  const cfg = projectorConfig();
  return CONFIG.PLAYER_START_Y - cfg.readZoneAbove;
}

function depthScale(t, cfg) {
  const far = cfg.scaleFar;
  const mid = cfg.scaleMid;
  const near = cfg.scaleNear;
  if (t < 0.5) return far + (mid - far) * smooth01(t * 2);
  return mid + (near - mid) * smooth01((t - 0.5) * 2);
}

function legacySpriteScale(screenY, shift, cfg) {
  const vanishY = corridorHorizonY();
  const readStart = readZoneStartWorldY() + shift;
  if (screenY >= readStart) return cfg.scaleNear;
  const farSpan = Math.max(1, readStart - vanishY);
  const farU = screenY <= vanishY ? 0 : clamp((screenY - vanishY) / farSpan, 0, 1);
  return depthScale(farU, cfg);
}

function widthEase(t) {
  const x = clamp(t, 0, 1);
  return x * (0.72 + 0.28 * x);
}

function widthEaseDeriv(t) {
  const x = clamp(t, 0, 1);
  return 0.72 + 0.56 * x;
}

function gameplayRoadAt(linearScreenY, height) {
  const inset = pathInsetAt(linearScreenY, height);
  const left = CONFIG.TRACK_LEFT + inset;
  const right = CONFIG.TRACK_RIGHT - inset;
  return {
    inset,
    left,
    right,
    width: Math.max(8, right - left),
    center: (left + right) * 0.5
  };
}

function nearSpan(shift) {
  const vanishY = corridorHorizonY();
  const nearScreenY = CONFIG.PLAYER_START_Y + shift;
  return {
    vanishY,
    nearScreenY,
    span: Math.max(1, nearScreenY - vanishY)
  };
}

/** Perspective ribbon width used by depth/s. Flat at/below the cat so s stays 1. */
function perspectiveWidthAt(screenY, shift, height, cfg) {
  const { vanishY, nearScreenY, span } = nearSpan(shift);
  const nearW = gameplayRoadAt(nearScreenY, height).width;
  const farW = cfg.farRoadWidth;
  if (screenY >= nearScreenY) return nearW;
  const t = clamp((screenY - vanishY) / span, 0, 1);
  return farW + (nearW - farW) * widthEase(t);
}

function perspectiveWidthDeriv(screenY, shift, height, cfg) {
  const { vanishY, nearScreenY, span } = nearSpan(shift);
  const nearW = gameplayRoadAt(nearScreenY, height).width;
  const farW = cfg.farRoadWidth;
  const t = screenY >= nearScreenY ? 1 : clamp((screenY - vanishY) / span, 0, 1);
  return (nearW - farW) * widthEaseDeriv(t) / span;
}

function visualRoadWidth(screenY, shift, height, cfg) {
  return perspectiveWidthAt(screenY, shift, height, cfg);
}

/**
 * Drawn sand-edge width. FAR→MID keep the perspective ease. From a join
 * just above the cat, continue with the join tangent so left/right edges
 * stay nearly straight while the road keeps widening — no fixed width,
 * no hard corner, no reverse taper.
 */
function visualEdgeWidth(screenY, shift, height, cfg) {
  const { nearScreenY } = nearSpan(shift);
  const joinY = nearScreenY - 100;

  if (screenY <= joinY) {
    return perspectiveWidthAt(screenY, shift, height, cfg);
  }

  const w0 = perspectiveWidthAt(joinY, shift, height, cfg);
  const m0 = perspectiveWidthDeriv(joinY, shift, height, cfg);
  return w0 + m0 * (screenY - joinY);
}

function playerAnchor(shift) {
  const worldY = CONFIG.PLAYER_START_Y;
  return {
    worldY,
    screenY: worldY + shift
  };
}

function depthAtScreen(screenY, shift, height, cfg = projectorConfig()) {
  const anchor = playerAnchor(shift);
  const nearW = Math.max(1, visualRoadWidth(anchor.screenY, shift, height, cfg));
  const width = visualRoadWidth(screenY, shift, height, cfg);
  const s = width / nearW;
  return {
    s,
    width,
    nearW,
    yJacobian: s * s
  };
}

let depthMapCache = null;

function interpolateTable(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  const u = span > 1e-8 ? (x - xs[lo]) / span : 0;
  return ys[lo] + (ys[hi] - ys[lo]) * u;
}

function buildDepthMap(shift, height) {
  const horizon = corridorHorizonY();
  const anchor = playerAnchor(shift);
  const top = horizon;
  const bottom = height + 80;
  const step = 1;
  const screens = [top];
  const offsets = [0];
  let prev = top;
  let acc = 0;
  for (let screen = top + step; screen <= bottom + 1e-6; screen += step) {
    const next = Math.min(screen, bottom);
    const s0 = depthAtScreen(prev, shift, height).s;
    const s1 = depthAtScreen(next, shift, height).s;
    const mid = Math.max(1e-3, (s0 + s1) * 0.5);
    acc += (next - prev) / (mid * mid);
    screens.push(next);
    offsets.push(acc);
    prev = next;
    if (next >= bottom - 1e-6) break;
  }
  const playerOffset = interpolateTable(screens, offsets, anchor.screenY);
  const worlds = offsets.map((offset) => anchor.worldY + (offset - playerOffset));
  return {
    shift,
    height,
    screens,
    worlds,
    horizon,
    playerWorld: anchor.worldY,
    playerScreen: anchor.screenY
  };
}

function depthMapFor(shift, height) {
  if (!depthMapCache || depthMapCache.shift !== shift || depthMapCache.height !== height) {
    depthMapCache = buildDepthMap(shift, height);
  }
  return depthMapCache;
}

function bracket(xs, x) {
  const n = xs.length;
  if (x <= xs[0]) return { lo: 0, hi: 0, u: 0, outside: -1 };
  if (x >= xs[n - 1]) return { lo: n - 1, hi: n - 1, u: 0, outside: 1 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  return {
    lo,
    hi,
    u: span > 1e-8 ? (x - xs[lo]) / span : 0,
    outside: 0
  };
}

export function worldYForScreen(screenY, shift = 0, height = CONFIG.CANVAS_HEIGHT) {
  const map = depthMapFor(shift, height);
  const edge = depthAtScreen(screenY, shift, height);
  const jac = Math.max(1e-4, edge.yJacobian);
  if (screenY <= map.screens[0]) {
    return map.worlds[0] + (screenY - map.screens[0]) / jac;
  }
  const last = map.screens.length - 1;
  if (screenY >= map.screens[last]) {
    return map.worlds[last] + (screenY - map.screens[last]) / jac;
  }
  const hit = bracket(map.screens, screenY);
  return map.worlds[hit.lo] + (map.worlds[hit.hi] - map.worlds[hit.lo]) * hit.u;
}

export function screenYForWorld(worldY, shift = 0, height = CONFIG.CANVAS_HEIGHT) {
  const map = depthMapFor(shift, height);
  const jac0 = Math.max(1e-4, depthAtScreen(map.screens[0], shift, height).yJacobian);
  if (worldY <= map.worlds[0]) {
    return map.screens[0] + (worldY - map.worlds[0]) * jac0;
  }
  const last = map.worlds.length - 1;
  const jac1 = Math.max(1e-4, depthAtScreen(map.screens[last], shift, height).yJacobian);
  if (worldY >= map.worlds[last]) {
    return map.screens[last] + (worldY - map.worlds[last]) * jac1;
  }
  const hit = bracket(map.worlds, worldY);
  return map.screens[hit.lo] + (map.screens[hit.hi] - map.screens[hit.lo]) * hit.u;
}

export function projectWorldToScreen(
  worldX,
  worldY,
  shift = 0,
  height = CONFIG.CANVAS_HEIGHT
) {
  const cfg = projectorConfig();
  const vanishX = CONFIG.CANVAS_WIDTH * 0.5;
  const vanishY = corridorHorizonY();
  const anchor = playerAnchor(shift);
  const screenY = screenYForWorld(worldY, shift, height);
  const depth = depthAtScreen(screenY, shift, height, cfg);
  const drawY = screenY - shift;
  const t = clamp((screenY - vanishY) / Math.max(1, height - vanishY), 0, 1);
  const gameplay = gameplayRoadAt(screenY, height);
  // Drawn sand edges can keep expanding with a straight near slope.
  // Depth/s stays on visualRoadWidth (flat at/below the cat).
  const roadWidth = visualEdgeWidth(screenY, shift, height, cfg);
  const roadCenter = vanishX;
  const roadLeft = roadCenter - roadWidth * 0.5;
  const roadRight = roadCenter + roadWidth * 0.5;
  const xScale = roadWidth / Math.max(1, gameplay.width);
  const screenX = vanishX + (worldX - vanishX) * xScale;
  const readStart = readZoneStartWorldY() + shift;
  const inReadZone = screenY >= readStart;
  const clip = screenY < vanishY
    ? clamp((vanishY - screenY) / 48, 0, 1)
    : 0;

  return {
    worldX,
    worldY,
    linearScreenY: screenY,
    screenY,
    drawY,
    screenX,
    scale: depth.s,
    s: depth.s,
    yJacobian: depth.yJacobian,
    nearRoadWidth: depth.nearW,
    t,
    xScale,
    inset: (CONFIG.TRACK_WIDTH - roadWidth) * 0.5,
    roadCenter,
    roadLeft,
    roadRight,
    roadWidth,
    gameplayLeft: gameplay.left,
    gameplayRight: gameplay.right,
    gameplayWidth: gameplay.width,
    inReadZone,
    clip,
    vanishX,
    vanishY,
    playerScreenY: anchor.screenY,
    alpha: 0.88 + 0.12 * t,
    contrast: 0.78 + 0.22 * t
  };
}

export function roadUFromGameplayX(gameplayX, gameplayWidth, roadCenter = CONFIG.CANVAS_WIDTH * 0.5) {
  const half = Math.max(4, gameplayWidth * 0.5);
  return (gameplayX - roadCenter) / half;
}

export function projectTrackX(
  gameplayX,
  worldY,
  shift = 0,
  height = CONFIG.CANVAS_HEIGHT
) {
  const projected = projectWorldToScreen(gameplayX, worldY, shift, height);
  const u = roadUFromGameplayX(gameplayX, projected.gameplayWidth, projected.roadCenter);
  const roadU = clamp(u, -1, 1);
  return {
    ...projected,
    trackU: (roadU + 1) * 0.5,
    roadU,
    screenX: projected.roadCenter + roadU * projected.roadWidth * 0.5
  };
}

export function sampleRoadRibbon(shift = 0, options = {}) {
  const height = options.height || CONFIG.CANVAS_HEIGHT;
  const sections = Math.max(12, Math.min(24, options.sections || projectorConfig().roadSections));
  const pad = options.pad == null ? 56 : options.pad;
  const top = corridorHorizonY();
  const bottom = height + pad;
  const playerScreen = CONFIG.PLAYER_START_Y + shift;
  const screens = [];
  for (let i = 0; i <= sections; i += 1) {
    screens.push(top + ((bottom - top) * i) / sections);
  }
  if (!screens.some((screen) => Math.abs(screen - playerScreen) < 0.5)) {
    screens.push(playerScreen);
    screens.sort((a, b) => a - b);
  }
  return screens.map((screen) => {
    const worldY = worldYForScreen(screen, shift, height);
    return projectWorldToScreen(CONFIG.CANVAS_WIDTH * 0.5, worldY, shift, height);
  });
}

export function unifiedDepthSample(screenY, shift = 0, height = CONFIG.CANVAS_HEIGHT) {
  const worldY = worldYForScreen(screenY, shift, height);
  const projected = projectWorldToScreen(CONFIG.CANVAS_WIDTH * 0.5, worldY, shift, height);
  const tile = Math.max(1, CONFIG.VISUAL.PATH_SAND_TILE || 2600);
  return {
    ...projected,
    texelPerSource: projected.yJacobian * tile
  };
}

export function unifiedDepthZones(shift = 0, height = CONFIG.CANVAS_HEIGHT) {
  const horizon = corridorHorizonY();
  const playerScreen = CONFIG.PLAYER_START_Y + shift;
  const mid = horizon + (playerScreen - horizon) * 0.5;
  return {
    horizon,
    playerScreen,
    FAR: unifiedDepthSample(horizon, shift, height),
    MID: unifiedDepthSample(mid, shift, height),
    NEAR: unifiedDepthSample(playerScreen, shift, height)
  };
}

export function depthDebugEnabled() {
  const env = import.meta.env;
  return !!(env && env.DEV);
}

export function crestYAt(screenX, width = CONFIG.CANVAS_WIDTH) {
  const vis = CONFIG.VISUAL.PROJECTOR || {};
  const horizon = corridorHorizonY();
  const peakOff = vis.CREST_PEAK ?? 16;
  const sideOff = vis.CREST_SIDE ?? 6;
  const asymAmp = vis.CREST_ASYM ?? 3.2;
  const nx = (screenX - width * 0.5) / Math.max(1, width * 0.48);
  const u = clamp(Math.abs(nx), 0, 1);
  const hill = (1 - u * u) * (0.92 + 0.08 * (1 - u));
  const asym = Math.sin(nx * 0.95 + 0.35) * asymAmp;
  return horizon + sideOff + (peakOff - sideOff) * hill + asym;
}

/**
 * Occlusion crest for obstacle reveal. Same broad shape as the visual crest,
 * but taller so HIDDEN→TOP→PARTIAL→FULL reads clearly. Does not change
 * road silhouette / FAR continuity (those keep crestYAt / C1 throat).
 */
export function revealCrestYAt(screenX, width = CONFIG.CANVAS_WIDTH) {
  const vis = CONFIG.VISUAL.PROJECTOR || {};
  const horizon = corridorHorizonY();
  const peakOff = Math.max(
    vis.CREST_PEAK ?? 16,
    vis.REVEAL_CREST_PEAK ?? CONFIG.VISUAL.OBSTACLE_REVEAL ?? 48
  );
  const sideOff = Math.max(vis.CREST_SIDE ?? 6, Math.round(peakOff * 0.28));
  const asymAmp = vis.CREST_ASYM ?? 3.2;
  const nx = (screenX - width * 0.5) / Math.max(1, width * 0.48);
  const u = clamp(Math.abs(nx), 0, 1);
  const hill = (1 - u * u) * (0.92 + 0.08 * (1 - u));
  const asym = Math.sin(nx * 0.95 + 0.35) * asymAmp;
  return horizon + sideOff + (peakOff - sideOff) * hill + asym;
}

export function horizonOcclusion(
  screenX,
  groundScreenY,
  spriteHeight,
  width = CONFIG.CANVAS_WIDTH
) {
  const crestY = revealCrestYAt(screenX, width);
  const h = Math.max(1, spriteHeight || 0);
  const past = groundScreenY - crestY;
  if (past <= 0.75) {
    return {
      state: 'HIDDEN',
      visibleRatio: 0,
      visibleH: 0,
      past,
      crestY,
      lift: 0
    };
  }
  // Span > 1 keeps tip/mid on screen longer without raising the crest peak.
  const span = Math.max(1, CONFIG.VISUAL.PROJECTOR?.REVEAL_SPAN ?? 1.28) * h;
  const visibleH = Math.min(h, (past / span) * h);
  const visibleRatio = clamp(visibleH / h, 0, 1);
  const full = past >= span - 0.5;
  return {
    state: full ? 'VISIBLE' : 'PARTIAL',
    visibleRatio: full ? 1 : visibleRatio,
    visibleH: full ? h : visibleH,
    past,
    crestY,
    lift: full ? 0 : (h - visibleH)
  };
}

export function isOccludedByHorizon(
  screenX,
  groundScreenY,
  spriteHeight,
  width = CONFIG.CANVAS_WIDTH
) {
  return horizonOcclusion(screenX, groundScreenY, spriteHeight, width).state !== 'VISIBLE';
}
