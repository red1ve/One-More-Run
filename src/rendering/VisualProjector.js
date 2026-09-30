import { CONFIG } from '../config.js';
import { corridorHorizonY, pathInsetAt } from '../game/Corridor.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function projectorConfig() {
  const vis = CONFIG.VISUAL.PROJECTOR || {};
  return {
    farRoadWidth: vis.FAR_ROAD_WIDTH ?? 120,
    // Objects just past the player keep growing, but not without limit.
    scaleMax: vis.SCALE_MAX ?? 1.3,
    readZoneAbove: vis.READ_ZONE_ABOVE ?? CONFIG.CHOICE_SHOW_HEIGHT ?? 280,
    // World-distance (from the player) at which depth reaches u = 0.5.
    // Smaller = perspective falls off faster close to the camera.
    falloffDistance: vis.FALLOFF_DISTANCE ?? 460
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

/**
 * Single source of truth for "how far into the distance" a world position
 * reads, as a plain 0..1 ratio: 1 at the player, sliding toward 0 as the
 * world-space distance from the player grows. Everything that needs a
 * depth cue - screen position, scale, road width - reads this same
 * ratio, so they can never drift out of sync with each other.
 *
 * u(d) = D / (D + d), the classic reciprocal "camera" falloff: smooth,
 * fully analytic (no lookup table, no per-frame numerical integration),
 * and naturally bounded for any d, including the small negative d of
 * objects just past the player.
 */
function depthRatio(worldY, cfg) {
  const d = CONFIG.PLAYER_START_Y - worldY;
  const D = Math.max(1, cfg.falloffDistance);
  return D / (D + Math.max(-D * 0.85, d));
}

function depthRatioToWorldOffset(u, cfg) {
  const D = Math.max(1, cfg.falloffDistance);
  const clamped = Math.max(0.001, u);
  return D * (1 / clamped - 1);
}

// Road width at the player row. Gameplay X is measured against this one
// constant width, so an object keeps the same share of the road at any depth.
function nearRoadWidth() {
  return gameplayRoadAt(CONFIG.PLAYER_START_Y, CONFIG.CANVAS_HEIGHT).width;
}

function roadWidthAt(u, cfg) {
  const nearWidth = nearRoadWidth();
  return cfg.farRoadWidth + (nearWidth - cfg.farRoadWidth) * u;
}

// True perspective: an object shrinks exactly as much as the road does,
// so it grows in place instead of sliding out from behind the hedges.
function scaleAt(u, cfg) {
  return Math.min(cfg.scaleMax, roadWidthAt(u, cfg) / nearRoadWidth());
}

/** Shift-independent screen Y for a given depth ratio (0 = horizon, 1 = player). */
function baseScreenYForRatio(u) {
  const horizon = corridorHorizonY();
  return horizon + (CONFIG.PLAYER_START_Y - horizon) * clamp(u, 0, 4);
}

export function worldYForScreen(screenY, shift = 0, height = CONFIG.CANVAS_HEIGHT) {
  const cfg = projectorConfig();
  const horizon = corridorHorizonY();
  const base = screenY - shift;
  const u = (base - horizon) / Math.max(1, CONFIG.PLAYER_START_Y - horizon);
  // 0.002: дорожка доходит до самого горизонта (раньше 0.02 оставлял щель ~14 px).
  const d = depthRatioToWorldOffset(clamp(u, 0.002, 4), cfg);
  return CONFIG.PLAYER_START_Y - d;
}

export function screenYForWorld(worldY, shift = 0) {
  const cfg = projectorConfig();
  const u = depthRatio(worldY, cfg);
  return baseScreenYForRatio(u) + shift;
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
  const u = depthRatio(worldY, cfg);
  const screenY = baseScreenYForRatio(u) + shift;
  const drawY = screenY - shift;
  const scale = scaleAt(u, cfg);
  const roadWidth = roadWidthAt(u, cfg);
  const roadCenter = vanishX;
  const roadLeft = roadCenter - roadWidth * 0.5;
  const roadRight = roadCenter + roadWidth * 0.5;
  const gameplay = gameplayRoadAt(screenY, height);
  const xScale = roadWidth / nearRoadWidth();
  const screenX = vanishX + (worldX - vanishX) * xScale;
  const readStart = readZoneStartWorldY();
  const inReadZone = worldY >= readStart;
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
    scale,
    s: scale,
    yJacobian: scale * scale,
    nearRoadWidth: roadWidthAt(1, cfg),
    t: clamp(u, 0, 1),
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
    playerScreenY: CONFIG.PLAYER_START_Y + shift,
    alpha: 0.88 + 0.12 * u,
    contrast: 0.78 + 0.22 * u
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
  const u = roadUFromGameplayX(gameplayX, nearRoadWidth(), projected.roadCenter);
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
  const sections = Math.max(24, Math.min(90, options.sections || 60));
  const pad = options.pad == null ? 56 : options.pad;
  // Верх дорожки — на той же линии горизонта, что небо, арка, газон и изгородь
  // (с учётом сдвига камеры), иначе между ними видна полоса.
  const top = corridorHorizonY() + shift;
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
 * but taller so HIDDEN->PARTIAL->VISIBLE reads clearly. Does not change
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
    lift: 0
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
