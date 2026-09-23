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

function hermiteG(u, s) {
  const x = clamp(u, 0, 1);
  const x2 = x * x;
  const x3 = x2 * x;
  return (s - 1) * x3 + 2 * (1 - s) * x2 + s * x;
}

function depthScale(t, cfg) {
  const far = cfg.scaleFar;
  const mid = cfg.scaleMid;
  const near = cfg.scaleNear;
  if (t < 0.5) return far + (mid - far) * smooth01(t * 2);
  return mid + (near - mid) * smooth01((t - 0.5) * 2);
}

function widthEase(t) {
  const x = clamp(t, 0, 1);
  return x * (0.72 + 0.28 * x);
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

function projectedScreenY(linearScreenY, shift, height, cfg) {
  const vanishY = corridorHorizonY();
  const readStartLinearY = readZoneStartWorldY() + shift;
  const farSpan = Math.max(1, readStartLinearY - vanishY);
  const inReadZone = linearScreenY >= readStartLinearY;
  let screenY;
  if (inReadZone) screenY = linearScreenY;
  else if (linearScreenY <= vanishY) screenY = vanishY;
  else {
    const u = (linearScreenY - vanishY) / farSpan;
    screenY = vanishY + hermiteG(u, cfg.farYSpeed) * farSpan;
  }
  return { screenY, inReadZone, vanishY, readStartLinearY, farSpan };
}

function visualRoadWidth(screenY, shift, height, cfg) {
  const vanishY = corridorHorizonY();
  const nearScreenY = CONFIG.PLAYER_START_Y + shift;
  const nearRoad = gameplayRoadAt(nearScreenY, height);
  const farW = cfg.farRoadWidth;
  if (screenY >= nearScreenY) {
    return gameplayRoadAt(screenY, height).width;
  }
  const t = clamp((screenY - vanishY) / Math.max(1, nearScreenY - vanishY), 0, 1);
  return farW + (nearRoad.width - farW) * widthEase(t);
}

export function projectWorldToScreen(
  worldX,
  worldY,
  shift = 0,
  height = CONFIG.CANVAS_HEIGHT
) {
  const cfg = projectorConfig();
  const vanishX = CONFIG.CANVAS_WIDTH * 0.5;
  const linearScreenY = worldY + shift;
  const yInfo = projectedScreenY(linearScreenY, shift, height, cfg);
  const { screenY, inReadZone, vanishY, farSpan } = yInfo;
  const drawY = screenY - shift;
  const t = clamp((linearScreenY - vanishY) / Math.max(1, height - vanishY), 0, 1);
  const farU = linearScreenY <= vanishY
    ? 0
    : clamp((linearScreenY - vanishY) / farSpan, 0, 1);

  const gameplay = gameplayRoadAt(linearScreenY, height);
  const roadWidth = visualRoadWidth(screenY, shift, height, cfg);
  const roadCenter = vanishX;
  const roadLeft = roadCenter - roadWidth * 0.5;
  const roadRight = roadCenter + roadWidth * 0.5;
  const xScale = roadWidth / gameplay.width;
  const screenX = vanishX + (worldX - vanishX) * xScale;
  const scale = inReadZone ? cfg.scaleNear : depthScale(farU, cfg);
  const clip = linearScreenY < vanishY
    ? clamp((vanishY - linearScreenY) / 48, 0, 1)
    : 0;

  return {
    worldX,
    worldY,
    linearScreenY,
    screenY,
    drawY,
    screenX,
    scale,
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
  const worldTop = corridorHorizonY() - shift;
  const worldBot = height - shift + pad;
  const samples = [];
  for (let i = 0; i <= sections; i += 1) {
    const worldY = worldTop + ((worldBot - worldTop) * i) / sections;
    samples.push(projectWorldToScreen(CONFIG.CANVAS_WIDTH * 0.5, worldY, shift, height));
  }
  return samples;
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

export function horizonOcclusion(
  screenX,
  groundScreenY,
  spriteHeight,
  width = CONFIG.CANVAS_WIDTH
) {
  const crestY = crestYAt(screenX, width);
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
  const visibleH = Math.min(h, past);
  const visibleRatio = clamp(visibleH / h, 0, 1);
  const full = visibleRatio >= 0.995;
  return {
    state: full ? 'VISIBLE' : 'PARTIAL',
    visibleRatio: full ? 1 : visibleRatio,
    visibleH: full ? h : visibleH,
    past,
    crestY,
    lift: full ? 0 : (crestY + h - groundScreenY)
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
