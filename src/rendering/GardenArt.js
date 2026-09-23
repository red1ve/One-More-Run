import { CONFIG } from '../config.js';
import { getGardenSheets } from './gardenAssets.js';
import {
  corridorHorizonY,
  hedgeBorderWidth,
  sandShoulderWidth
} from '../game/Corridor.js';
import {
  projectTrackX,
  projectWorldToScreen,
  sampleRoadRibbon,
  worldYForScreen,
  crestYAt as projectorCrestYAt,
  horizonOcclusion
} from './VisualProjector.js';

function parseHex(hex) {
  const value = String(hex || '').replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0
  };
}

export function mixHex(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const m = Math.max(0, Math.min(1, t));
  const r = Math.round(pa.r + (pb.r - pa.r) * m);
  const g = Math.round(pa.g + (pb.g - pa.g) * m);
  const bch = Math.round(pa.b + (pb.b - pa.b) * m);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bch.toString(16).padStart(2, '0')}`;
}

export function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function worldYFromScroll(speedScroll) {
  const scale = CONFIG.FEEL.SPEED_SCROLL_SCALE || 0.35;
  return (Number(speedScroll) || 0) / scale;
}

function dummyCamera() {
  return {
    progress: 0,
    y: 0,
    gameplayShift() { return 0; },
    farY() { return 0; }
  };
}

function edgeWobble(worldPos, seed = 0) {
  return Math.sin(worldPos * 0.037 + seed) * 4.4
    + Math.sin(worldPos * 0.079 + seed * 1.7) * 2.2
    + Math.sin(worldPos * 0.17 + seed * 0.5) * 1.05;
}

function cloneSheets() {
  const source = getGardenSheets();
  const sheets = {};
  Object.keys(source).forEach((key) => {
    sheets[key] = source[key].map((item) => ({ ...item, image: null }));
  });
  return sheets;
}

const OBSTACLE_FAMILIES = {
  FLOWER_GATE: ['garden-gate'],
  STANDING_PLANTER: ['planter-06', 'planter-07', 'planter-08'],
  GARDEN_FENCE: ['garden-fence']
};

const OBSTACLE_FAMILY_NAMES = ['FLOWER_GATE', 'STANDING_PLANTER', 'GARDEN_FENCE'];
const LEGACY_FAMILY_MAP = {
  FLOWER_PLANTER: 'FLOWER_GATE',
  WOOD_GATE: 'STANDING_PLANTER',
  GARDEN_BOX: 'GARDEN_FENCE'
};
const PRODUCTION_CONSTRUCTIONS = {
  FLOWER_GATE: { id: 'garden-gate', nearCat: 0.78 },
  GARDEN_FENCE: { id: 'garden-fence', nearCat: 0.96 }
};

const FENCE_POST_SRC = { sx: 700, sy: 24, sw: 56, sh: 304 };
const FENCE_RAIL_SRC = { sx: 528, sy: 24, sw: 96, sh: 304 };
const GATE_LEFT_POST_SRC = { sx: 40, sy: 70, sw: 92, sh: 938 };
const GATE_RIGHT_POST_SRC = { sx: 890, sy: 70, sw: 96, sh: 938 };
const GATE_BEAM_SRC = { sx: 128, sy: 14, sw: 768, sh: 210 };

const LANE_U = {
  inner: 0.10,
  mid: 0.40,
  outer: 0.86
};

const VIEW_CULL_MARGIN = 56;
const VIEW_WALK_PAD = 400;

const GROUP_LAYOUTS = {
  A: [
    { role: 'tree', lane: 'outer', dy: 0 },
    { role: 'largeBush', lane: 'mid', dy: 16 },
    { role: 'grass', lane: 'inner', dy: 22 }
  ],
  B: [
    { role: 'sapling', lane: 'outer', dy: 4 },
    { role: 'largeBush', lane: 'mid', dy: 10 },
    { role: 'grass', lane: 'inner', dy: 18 }
  ],
  C: [
    { role: 'largeBush', lane: 'mid', dy: 2 },
    { role: 'grass', lane: 'inner', dy: 16 },
    { role: 'flower', lane: 'inner', dy: 20, ju: 0.1 }
  ],
  D: [
    { role: 'smallBush', lane: 'mid', dy: 6 },
    { role: 'grass', lane: 'inner', dy: 16 }
  ],
  E: [
    { role: 'tree', lane: 'outer', dy: 0 },
    { role: 'smallBush', lane: 'mid', dy: 14, ju: 0.08 },
    { role: 'grass', lane: 'inner', dy: 18 }
  ]
};

const ROLE_LAYER = {
  mass: 0,
  tree: 1,
  sapling: 1,
  largeBush: 2,
  smallBush: 2,
  hedge: 3,
  edge: 4,
  flower: 4,
  grass: 4,
  arch: 5,
  planter: 6,
  coin: 7
};

export class GardenArt {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.width = CONFIG.CANVAS_WIDTH;
    this.height = CONFIG.CANVAS_HEIGHT;
    this.onReady = options.onReady || null;
    const c = CONFIG.COLORS;
    this.c = c;
    this.sky = c.GardenSky;
    this.lawnFar = mixHex(c.HedgeSage, c.GardenSky, 0.58);
    this.lawnMid = mixHex(c.HedgeSage, c.SafeLawn, 0.28);
    this.lawnDeep = mixHex(c.HedgeSage, c.InkBrown, 0.22);
    this.cloud = mixHex(c.CatCream, c.GardenSky, 0.28);
    this.sandLight = mixHex(c.FloorSand, c.SkyPaper, 0.42);
    this.sandShade = mixHex(c.FloorSand, c.ShadowDust, 0.38);
    this.woodLight = mixHex(c.PlanterWood, c.SkyPaper, 0.34);
    this.woodDeep = mixHex(c.PlanterWood, c.InkBrown, 0.26);
    this.woodSafe = mixHex(c.PlanterWood, c.SafeLawn, 0.22);
    this.woodRisk = mixHex(c.PlanterWood, c.RiskApricot, 0.42);
    this.woodHard = mixHex(c.PlanterWood, c.HighRiskClay, 0.38);
    this.lawnBed = mixHex(c.SafeLawn, c.HedgeSage, 0.38);
    this.lawnLight = mixHex(c.SafeLawn, c.SkyPaper, 0.22);
    this.lawnShade = mixHex(c.HedgeSage, c.InkBrown, 0.16);
    this.lawnEdge = mixHex(c.SafeLawn, c.FloorSand, 0.28);
    this.coinGold = mixHex(c.CoinAmber, c.CatGinger, 0.22);
    this.coinRim = mixHex(c.CoinAmber, c.InkBrown, 0.34);
    this.coinHi = mixHex(c.CoinAmber, c.SkyPaper, 0.48);
    this.horizonMist = mixHex(c.GardenSky, c.HedgeSage, 0.38);
    this.horizonDeep = mixHex(c.HedgeSage, c.GardenSky, 0.46);
    this.hedgeFill = mixHex(c.HedgeSage, c.SafeLawn, 0.38);
    this.hedgeLight = mixHex(c.HedgeSage, c.SafeLawn, 0.52);
    this.hedgeFace = mixHex(c.HedgeSage, c.SafeLawn, 0.18);
    this.sandEdge = mixHex(c.FloorSand, c.ShadowDust, 0.28);
    this.sandRim = mixHex(c.FloorSand, c.PlanterWood, 0.18);
    this.pathSandNear = mixHex(c.FloorSand, c.PlanterWood, 0.22);
    this.pathSandFar = mixHex(c.FloorSand, c.SkyPaper, 0.14);
    this.borderScratch = { inner: [], outer: [], top: [] };
    this.worldPropPool = [];
    this.worldProps = [];
    this.deferredProps = [];
    this.worldPropCount = 0;
    this.riskEdge = mixHex(c.PlanterWood, c.RiskApricot, 0.46);
    this.riskWash = mixHex(c.PlanterWood, c.RiskApricot, 0.26);
    this.hardEdge = mixHex(c.PlanterWood, c.HighRiskClay, 0.5);
    this.hardWash = mixHex(c.PlanterWood, c.HighRiskClay, 0.28);
    this.safeEdge = mixHex(c.PlanterWood, c.SafeLawn, 0.42);
    this.safeWash = mixHex(c.PlanterWood, c.SafeLawn, 0.22);
    this.animTime = 0;
    this.lastShift = 0;
    this.lastProgress = 0;
    this.lastCamera = null;
    this.fenceKit = null;
    this.gatewayKit = null;
    this.choiceClearance = [];
    this._crestLayout = null;
    this._crestLayoutKey = '';
    this.sheets = cloneSheets();
    this.loadSprites();
  }

  loadSprites() {
    if (typeof Image !== 'function' || typeof document === 'undefined') return;
    Object.keys(this.sheets).forEach((group) => {
      this.sheets[group].forEach((item) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          this.trimSprite(item);
          if (typeof this.onReady === 'function') this.onReady();
        };
        image.src = item.url;
        item.image = image;
        if (image.complete && image.naturalWidth > 0) this.trimSprite(item);
      });
    });
  }

  isReady(item) {
    if (!(item && item.image && item.image.complete && item.image.naturalWidth > 0)) return false;
    this.trimSprite(item);
    return true;
  }

  trimSprite(item) {
    if (!item || item._trimmed || !this.isReadyImage(item)) return;
    item._trimmed = true;
    if (
      item.id === 'distant-garden-horizon'
      || item.id === 'distant-garden'
      || item.id === 'path-sand-material'
    ) return;
    if (typeof document === 'undefined') return;
    const img = item.image;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 4 || h < 4) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof ctx.getImageData !== 'function') return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      const step = w * h > 480000 ? 2 : 1;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (data[(y * w + x) * 4 + 3] > 12) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) return;
      const pad = 2;
      item.sx = Math.max(0, minX - pad);
      item.sy = Math.max(0, minY - pad);
      item.sw = Math.min(w - item.sx, maxX - minX + pad * 2 + 1);
      item.sh = Math.min(h - item.sy, maxY - minY + pad * 2 + 1);
    } catch (error) {
      return;
    }
  }

  isReadyImage(item) {
    return !!(item && item.image && item.image.complete && item.image.naturalWidth > 0);
  }

  usePack() {
    return CONFIG.VISUAL.USE_ENVIRONMENT_ASSET_PACK === true;
  }

  sourceRect(item) {
    const ready = this.isReady(item);
    return {
      sx: item.sx || 0,
      sy: item.sy || 0,
      sw: item.sw || (ready ? item.image.naturalWidth : 1),
      sh: item.sh || (ready ? item.image.naturalHeight : 1)
    };
  }

  pick(group, seed) {
    const list = this.sheets[group] || [];
    if (!list.length) return null;
    return list[Math.floor(hash01(seed) * list.length) % list.length];
  }

  firstReady(group) {
    const list = this.sheets[group] || [];
    for (let i = 0; i < list.length; i += 1) {
      if (this.isReady(list[i])) return list[i];
    }
    return null;
  }

  pickByIds(group, ids, seed) {
    const allowed = (this.sheets[group] || []).filter((item) => (ids || []).includes(item.id));
    if (!allowed.length) return this.pick(group, seed);
    return allowed[Math.floor(hash01(seed) * allowed.length) % allowed.length];
  }

  itemById(group, id) {
    if (!id) return null;
    return (this.sheets[group] || []).find((item) => item.id === id) || null;
  }

  catH() {
    return CONFIG.VISUAL.LOAF_REAR.DRAW_HEIGHT;
  }

  obstacleFamilyFor(segment) {
    const raw = segment?.visualObstacleType;
    const mapped = LEGACY_FAMILY_MAP[raw] || raw;
    if (mapped && OBSTACLE_FAMILY_NAMES.includes(mapped)) return mapped;
    const seed = hash01(segment?.id || 1);
    return OBSTACLE_FAMILY_NAMES[Math.floor(seed * OBSTACLE_FAMILY_NAMES.length)
      % OBSTACLE_FAMILY_NAMES.length];
  }

  constructionItem(id) {
    return this.itemById('obstacles', id);
  }

  flowerGateItem() {
    return this.constructionItem('garden-gate');
  }

  gardenFenceItem() {
    return this.constructionItem('garden-fence');
  }

  readyConstructionSprite(mapped, lockedSprite) {
    const spec = PRODUCTION_CONSTRUCTIONS[mapped];
    if (!spec) return null;
    if (lockedSprite && lockedSprite.id === spec.id && this.isReady(lockedSprite)) return lockedSprite;
    const item = this.constructionItem(spec.id);
    return this.isReady(item) ? item : null;
  }

  obstacleSpriteFor(segment) {
    const family = this.obstacleFamilyFor(segment);
    const spec = PRODUCTION_CONSTRUCTIONS[family];
    if (spec) return this.constructionItem(spec.id);
    const id = segment?.visualObstacleId;
    if (id && id !== 'garden-gate' && id !== 'garden-fence') {
      const locked = this.itemById('planters', id);
      if (locked) return locked;
    }
    const ids = OBSTACLE_FAMILIES[family] || OBSTACLE_FAMILIES.STANDING_PLANTER;
    const seed = segment?.visualObstacleSeed || 1;
    const chosen = ids[Math.floor(hash01(seed) * ids.length) % ids.length];
    return this.itemById('planters', chosen);
  }

  farHorizonItem() {
    const named = (this.sheets.distantHorizon || []).find((item) => (
      item.id === 'distant-garden-horizon'
    ));
    if (this.isReady(named)) return named;
    return this.firstReady('distantGarden');
  }

  sideMassItem(side) {
    const id = side < 0 ? 'left-garden-mass' : 'right-garden-mass';
    const item = (this.sheets.sideMasses || []).find((entry) => entry.id === id);
    return this.isReady(item) ? item : null;
  }

  pathSandItem() {
    const named = (this.sheets.pathSand || []).find((entry) => (
      entry.id === 'path-sand-material'
    ));
    return this.isReady(named) ? named : null;
  }

  massPeriod(side) {
    return side < 0 ? 680 : 820;
  }

  massShows(slot, side) {
    return hash01(slot * 8.17 + side * 4.3) > 0.78;
  }

  nearSideMass(side, y, progress) {
    const period = this.massPeriod(side);
    const local = y - (progress || 0);
    const slot = Math.round(local / period);
    if (!this.massShows(slot, side)) return false;
    return Math.abs(local - slot * period) < 72;
  }

  gardenZone(slot, side) {
    const left = ['A', 'D', 'C', 'E', 'D', 'C', 'B'];
    const right = ['C', 'E', 'D', 'B', 'D', 'A', 'C'];
    const cycle = side < 0 ? left : right;
    const index = ((slot % cycle.length) + cycle.length) % cycle.length;
    return cycle[index];
  }

  walkGameplay(camera, period, fn) {
    const cam = camera || dummyCamera();
    const progress = cam.progress || 0;
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const step = Math.max(8, period);
    const visPad = VIEW_WALK_PAD;
    const yMin = -Math.abs(shift) - visPad;
    const yMax = this.height + Math.abs(shift) + visPad;
    const start = Math.floor((yMin - progress) / step) - 1;
    const end = Math.ceil((yMax - progress) / step) + 1;
    for (let slot = start; slot <= end; slot += 1) {
      fn(slot, slot * step + progress);
    }
  }

  walkHorizon(camera, period, fn) {
    const cam = camera || dummyCamera();
    const cameraY = typeof cam.farY === 'function' ? cam.farY() : 0;
    const step = Math.max(8, period);
    const start = Math.floor((cameraY - step) / step) - 1;
    const end = Math.ceil((cameraY + CONFIG.VISUAL.SKY_BAND + step) / step) + 1;
    for (let slot = start; slot <= end; slot += 1) {
      fn(slot, slot * step - cameraY);
    }
  }

  drawSprite(item, x, y, w, h, options = {}) {
    if (!this.isReady(item) || w < 2 || h < 2) return false;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
    ctx.translate(x, y);
    if (options.rotate) ctx.rotate(options.rotate);
    if (options.flip) ctx.scale(-1, 1);
    const src = this.sourceRect(item);
    ctx.drawImage(
      item.image,
      src.sx,
      src.sy,
      src.sw,
      src.sh,
      -w / 2,
      options.grounded ? -h : -h / 2,
      w,
      h
    );
    ctx.restore();
    return true;
  }

  oval(x, y, rx, ry) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.5, rx), Math.max(0.5, ry));
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  blob(x, y, radius, seed, color) {
    this.ctx.fillStyle = color;
    for (let i = 0; i < 3; i += 1) {
      const ox = (hash01(seed + i) - 0.5) * radius * 0.5;
      const oy = (hash01(seed + i + 8) - 0.5) * radius * 0.38;
      const rx = radius * (0.7 + hash01(seed + i + 3) * 0.38);
      const ry = radius * (0.55 + hash01(seed + i + 5) * 0.32);
      this.oval(x + ox, y + oy, rx, ry);
    }
  }

  roundedRectPath(x, y, w, h, radius) {
    const ctx = this.ctx;
    const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  irregularRectPath(x, y, w, h, seed, radius = 8) {
    const inset = (side) => 0.7 + hash01(seed + side) * 1.6;
    const x0 = x + inset(1) * 0.15;
    const y0 = y + inset(2) * 0.12;
    const x1 = x + w - inset(3) * 0.15;
    const y1 = y + h - inset(4) * 0.12;
    this.roundedRectPath(x0, y0, x1 - x0, y1 - y0, radius);
  }

  plate(x, y, w, h, radius = 12) {
    const ctx = this.ctx;
    const offset = CONFIG.VISUAL.SHADOW_OFFSET;
    ctx.fillStyle = this.c.ShadowDust;
    this.roundedRectPath(x + offset - 1, y + offset - 1, w, h, radius);
    ctx.fill();
    ctx.fillStyle = this.c.SkyPaper;
    this.roundedRectPath(x, y, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = this.c.InkBrown;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  badge(x, y, w, h, radius = 10) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = this.c.ShadowDust;
    this.roundedRectPath(x + 2, y + 3, w, h, radius);
    ctx.fill();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = this.c.SkyPaper;
    this.roundedRectPath(x, y, w, h, radius);
    ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = this.c.InkBrown;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  horizonY() {
    return corridorHorizonY();
  }

  crestLayout() {
    const horizon = this.horizonY();
    const vis = CONFIG.VISUAL.PROJECTOR || {};
    const key = `${this.width}|${horizon}|${vis.CREST_PEAK}|${vis.CREST_SIDE}|${vis.CREST_ASYM}`;
    if (this._crestLayout && this._crestLayoutKey === key) return this._crestLayout;
    this._crestLayoutKey = key;
    let peak = Infinity;
    let foot = -Infinity;
    for (let x = 0; x <= this.width; x += 24) {
      const y = projectorCrestYAt(x, this.width);
      if (y < peak) peak = y;
      if (y > foot) foot = y;
    }
    this._crestLayout = {
      hasSprite: false,
      item: null,
      src: null,
      destX: 0,
      destY: peak,
      destW: this.width,
      destH: Math.max(8, foot - peak),
      peak,
      foot,
      cx: this.width * 0.5
    };
    return this._crestLayout;
  }

  crestPeakScreenY() {
    return this.crestLayout().peak;
  }

  crestFootScreenY() {
    return this.crestLayout().foot;
  }

  crestYAt(screenX = this.width * 0.5) {
    return projectorCrestYAt(screenX, this.width);
  }

  throatTaper() {
    return 0;
  }

  horizonBlend(screenY) {
    const start = this.horizonY() + 96;
    const tip = this.horizonY() - 4;
    if (screenY >= start) return 0;
    if (screenY <= tip) return 1;
    return this.smoothstep((start - screenY) / Math.max(1, start - tip));
  }

  projectWorld(worldX, worldY) {
    return projectWorldToScreen(worldX, worldY, this.lastShift || 0, this.height);
  }

  roadAt(worldY) {
    return this.projectWorld(this.width * 0.5, worldY);
  }

  screenToWorldY(screenY, shift = this.lastShift || 0) {
    return worldYForScreen(screenY, shift, this.height);
  }

  pathVisualInset(screenY) {
    return this.roadAt(this.screenToWorldY(screenY)).inset;
  }

  pathLeftVisual(gameplayY, shift = this.lastShift || 0) {
    return projectWorldToScreen(this.width * 0.5, gameplayY, shift, this.height).roadLeft;
  }

  pathRightVisual(gameplayY, shift = this.lastShift || 0) {
    return projectWorldToScreen(this.width * 0.5, gameplayY, shift, this.height).roadRight;
  }

  roadEntryScreenY() {
    return this.crestFootScreenY();
  }

  farRoadTipScreenY() {
    return this.crestPeakScreenY();
  }

  smoothstep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  nearT(screenY) {
    return this.worldDepthAt(screenY).t;
  }

  worldDepthAt(screenY) {
    const projected = this.projectWorld(this.width * 0.5, this.screenToWorldY(screenY));
    return {
      t: projected.t,
      z: 1 / Math.max(0.001, projected.scale),
      scale: projected.scale,
      alpha: projected.alpha,
      contrast: projected.contrast,
      screenY: projected.screenY,
      horizon: projected.vanishY
    };
  }

  depthEase(screenY) {
    return this.worldDepthAt(screenY).t;
  }

  depthScale(screenY) {
    return this.worldDepthAt(screenY).scale;
  }

  propScale(screenY) {
    return this.worldDepthAt(screenY).scale;
  }

  depthAlpha(screenY) {
    return this.worldDepthAt(screenY).alpha;
  }

  depthContrast(screenY) {
    return this.worldDepthAt(screenY).contrast;
  }

  projectWorldProp(worldX, worldY) {
    const projected = this.projectWorld(worldX, worldY);
    return {
      worldX,
      worldY,
      groundY: projected.drawY,
      screenY: projected.screenY,
      screenX: projected.screenX,
      scale: projected.s,
      s: projected.s,
      alpha: projected.alpha,
      contrast: projected.contrast,
      drawY: projected.drawY,
      linearScreenY: projected.linearScreenY,
      clip: projected.clip,
      depth: projected
    };
  }

  perspectiveX(worldX, screenY) {
    return this.projectWorld(worldX, this.screenToWorldY(screenY)).screenX;
  }

  gardenWorldX(side, u) {
    const hedge = side < 0
      ? CONFIG.TRACK_LEFT - (CONFIG.VISUAL.HEDGE_BORDER_NEAR || 48)
      : CONFIG.TRACK_RIGHT + (CONFIG.VISUAL.HEDGE_BORDER_NEAR || 48);
    const edge = side < 0 ? -48 : this.width + 48;
    const t = Math.max(0, Math.min(1, u));
    return hedge + (edge - hedge) * t;
  }

  gardenLaneX(side, u, screenY) {
    const projected = this.projectWorld(this.gardenWorldX(side, u), this.screenToWorldY(screenY));
    return projected.screenX;
  }

  edgeGardenX(side, screenY, u) {
    return this.gardenLaneX(side, u, screenY);
  }

  plantedY(gameplayY, progress) {
    return gameplayY - (progress || 0);
  }

  objectOcclusion(screenX, groundDrawY, spriteHeight) {
    return horizonOcclusion(
      screenX,
      groundDrawY + (this.lastShift || 0),
      spriteHeight,
      this.width
    );
  }

  isWorldObjectHidden(screenX, groundDrawY, spriteHeight) {
    return this.objectOcclusion(screenX, groundDrawY, spriteHeight).state === 'HIDDEN';
  }

  isWorldObjectFullyVisible(screenX, groundDrawY, spriteHeight) {
    return this.objectOcclusion(screenX, groundDrawY, spriteHeight).state === 'VISIBLE';
  }

  clipCrestRevealBand(x0, x1, visibleH) {
    const ctx = this.ctx;
    const shift = this.lastShift || 0;
    const pad = 28;
    const left = Math.min(x0, x1) - pad;
    const right = Math.max(x0, x1) + pad;
    const steps = 12;
    const band = Math.max(1.5, visibleH);
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const x = left + ((right - left) * i) / steps;
      const y = projectorCrestYAt(x, this.width) - shift;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const x = left + ((right - left) * i) / steps;
      ctx.lineTo(x, projectorCrestYAt(x, this.width) - shift + band + 1.5);
    }
    ctx.closePath();
    ctx.clip();
  }

  beginHorizonReveal(x, groundDrawY, width, height, x0, x1) {
    const occ = this.objectOcclusion(x, groundDrawY, height);
    occ.clipped = false;
    if (occ.state === 'HIDDEN') return null;
    if (occ.state === 'PARTIAL') {
      this.ctx.save();
      const left = x0 == null ? x - width * 0.5 : x0;
      const right = x1 == null ? x + width * 0.5 : x1;
      this.clipCrestRevealBand(left, right, occ.visibleH);
      if (occ.lift > 0.5) this.ctx.translate(0, occ.lift);
      occ.clipped = true;
    }
    return occ;
  }

  endHorizonReveal(occ) {
    if (occ?.clipped) this.ctx.restore();
  }

  spriteOffscreen(x, groundY, w, h) {
    const margin = VIEW_CULL_MARGIN;
    const half = Math.max(0, (w || 0) * 0.5);
    const top = groundY - Math.max(0, h || 0);
    const bottom = groundY;
    const left = x - half;
    const right = x + half;
    return bottom < -margin
      || top > this.height + margin
      || right < -margin
      || left > this.width + margin;
  }

  pathInset(screenY) {
    return this.pathVisualInset(screenY);
  }

  pathLeftX(gameplayY, shift = this.lastShift || 0) {
    return this.pathLeftVisual(gameplayY, shift);
  }

  pathRightX(gameplayY, shift = this.lastShift || 0) {
    return this.pathRightVisual(gameplayY, shift);
  }

  hedgeWidth(screenY) {
    return hedgeBorderWidth(screenY, this.height);
  }

  hedgeSetback(screenY) {
    const t = this.nearT(screenY);
    const near = CONFIG.VISUAL.HEDGE_SETBACK_NEAR || 20;
    const far = CONFIG.VISUAL.HEDGE_SETBACK_FAR || 8;
    return far + (near - far) * t;
  }

  hedgeHeight(screenY) {
    const t = this.nearT(screenY);
    const near = CONFIG.VISUAL.HEDGE_HEIGHT_NEAR;
    const far = CONFIG.VISUAL.HEDGE_HEIGHT_FAR;
    return far + (near - far) * t;
  }

  hedgeInnerX(side, gameplayY, shift, progress = 0) {
    const projected = projectWorldToScreen(this.width * 0.5, gameplayY, shift, this.height);
    const path = side < 0 ? projected.roadLeft : projected.roadRight;
    const setback = this.hedgeSetback(projected.linearScreenY);
    const wobble = edgeWobble(gameplayY - progress, side < 0 ? 2 : 9) * 0.18;
    return path + (side < 0 ? -1 : 1) * (setback + wobble);
  }

  hedgeOuterX(side, gameplayY, shift, progress) {
    const projected = projectWorldToScreen(this.width * 0.5, gameplayY, shift, this.height);
    const inner = this.hedgeInnerX(side, gameplayY, shift, progress);
    const width = this.hedgeWidth(projected.linearScreenY);
    const wobble = edgeWobble(gameplayY - (progress || 0), side < 0 ? 4 : 11)
      * (0.28 + projected.t * 0.38);
    return inner + (side < 0 ? -1 : 1) * (width + wobble);
  }

  roadWidthScale(screenY) {
    const projected = this.projectWorld(this.width * 0.5, this.screenToWorldY(screenY));
    return Math.max(0.2, projected.roadWidth / CONFIG.TRACK_WIDTH);
  }

  projectGameplayX(gameplayX, gameplayY) {
    return projectTrackX(gameplayX, gameplayY, this.lastShift || 0, this.height).screenX;
  }

  projectTrackRect(x, y, w, h) {
    const groundWorldY = y + h;
    const shift = this.lastShift || 0;
    const left = projectTrackX(x, groundWorldY, shift, this.height);
    const right = projectTrackX(x + w, groundWorldY, shift, this.height);
    const roadLeft = left.roadLeft;
    const roadRight = left.roadRight;
    const visLeft = Math.max(roadLeft, Math.min(left.screenX, right.screenX));
    const visRight = Math.min(roadRight, Math.max(left.screenX, right.screenX));
    const visW = Math.max(3, visRight - visLeft);
    const uniform = left.scale;
    const visH = Math.max(4, h * uniform);
    return {
      x: visLeft,
      y: left.drawY - visH,
      width: visW,
      height: visH,
      groundY: left.drawY,
      worldY: groundWorldY,
      screenY: left.screenY,
      roadCenter: left.roadCenter,
      roadLeft,
      roadRight,
      roadWidth: left.roadWidth,
      scaleX: visW / Math.max(1, w),
      scaleZ: uniform,
      uniformScale: uniform,
      s: left.s,
      alpha: 1,
      contrast: left.contrast,
      depth: left
    };
  }

  projectedLaneX(side, lane, screenY) {
    const t = this.depthEase(screenY);
    const u = lane === 'outer'
      ? 0.62 + t * 0.24
      : lane === 'mid'
        ? 0.30 + t * 0.10
        : 0.08 + t * 0.05;
    return this.edgeGardenX(side, screenY, u);
  }

  contactShadow(x, groundY, width, screenY = null) {
    const ctx = this.ctx;
    const depth = this.worldDepthAt(screenY == null ? groundY + (this.lastShift || 0) : screenY);
    const rx = Math.max(6, width * (0.22 + depth.t * 0.08));
    const ry = 2.2 + depth.t * 2.4;
    ctx.save();
    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = (0.12 + depth.t * 0.16) * depth.alpha;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(x, groundY + 1, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(x, groundY + 1, rx, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  spriteSize(item, height) {
    const src = this.sourceRect(item);
    const h = Math.max(2, height);
    return {
      width: h * (src.sw / Math.max(1, src.sh)),
      height: h
    };
  }

  drawScreenBackdrop(time = 0) {
    this.animTime = Number(time) || 0;
    if (this.usePack()) {
      const ctx = this.ctx;
      ctx.fillStyle = this.sky;
      ctx.fillRect(0, 0, this.width, this.height);
      return;
    }
    this.drawSky();
    this.drawClouds(this.animTime);
  }

  drawFarWorld(camera) {
    this.drawHorizonGarden(camera);
    this.drawDistantMeadow();
  }

  drawMainWorld(camera, segments = [], playerY = CONFIG.PLAYER_START_Y) {
    const cam = camera || dummyCamera();
    this.lastCamera = cam;
    this.lastShift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    this.lastProgress = cam.progress || 0;
    this.drawLawn(camera);
    this.drawPath(camera);
    this.drawSandShoulder(camera);
    this.drawGardenBorders(camera);
    this.drawCrestLandform();
    this.collectAndDrawWorld(camera, segments, playerY);
  }

  depthProbeWorldY(progress) {
    const shift = this.lastShift || 0;
    if (this._depthProgress != null && progress + 1 < this._depthProgress) {
      this.depthProbePlanted = null;
      this._depthClock = null;
      this._liveLock = {};
    }
    this._depthProgress = progress;
    if (this.depthProbePlanted == null) {
      const horizon = this.horizonY();
      const playerScreen = CONFIG.PLAYER_START_Y + shift;
      const screen = horizon + (playerScreen - horizon) * 0.12;
      this.depthProbePlanted = this.screenToWorldY(screen, shift) - progress;
    }
    let worldY = this.depthProbePlanted + progress;
    let projected = this.projectWorld(this.width * 0.5, worldY);
    if (projected.screenY > this.height + 24) {
      const horizon = this.horizonY();
      const playerScreen = CONFIG.PLAYER_START_Y + shift;
      const screen = horizon + (playerScreen - horizon) * 0.08;
      worldY = this.screenToWorldY(screen, shift);
      this.depthProbePlanted = worldY - progress;
      projected = this.projectWorld(this.width * 0.5, worldY);
      this._depthClock = null;
    }
    return { worldY, planted: this.depthProbePlanted, projected };
  }

  liveDepthSample(progress, worldSpeed, now) {
    if (!this._liveLock) this._liveLock = {};
    const props = this.worldProps || [];
    const trees = [];
    const fences = [];
    const gates = [];
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      if (!Number.isFinite(prop.worldY) || !Number.isFinite(prop.s)) continue;
      if (prop.kind === 'sprite' && prop.role === 'tree') trees.push(prop);
      else if (prop.kind === 'fence-row' && prop.choice) gates.push(prop);
      else if (prop.kind === 'fence-row') fences.push(prop);
    }
    return {
      TREE: this.trackLiveDepth('TREE', trees, progress, worldSpeed, now),
      FENCE: this.trackLiveDepth('FENCE', fences.length ? fences : gates, progress, worldSpeed, now),
      GATEWAY: this.trackLiveDepth('GATEWAY', gates, progress, worldSpeed, now)
    };
  }

  trackLiveDepth(name, candidates, progress, worldSpeed, now) {
    const prev = this._liveLock[name];
    let prop = null;
    if (prev) {
      for (let i = 0; i < candidates.length; i += 1) {
        const item = candidates[i];
        if (Math.abs((item.worldY - progress) - prev.planted) < 2.5) {
          prop = item;
          break;
        }
      }
      if (prop && prop.screenY > this.height + 36) prop = null;
    }
    if (!prop) {
      const horizon = this.horizonY();
      for (let i = 0; i < candidates.length; i += 1) {
        const item = candidates[i];
        if (item.screenY < horizon - 12 || item.screenY > this.height + 8) continue;
        if (!prop || item.screenY < prop.screenY) prop = item;
      }
    }
    if (!prop) {
      this._liveLock[name] = null;
      return null;
    }
    const planted = prop.worldY - progress;
    let speed = (Number(prop.s) || 0) ** 2 * (worldSpeed || 0);
    let worldV = worldSpeed || 0;
    if (prev && Math.abs(prev.planted - planted) < 2.5 && now > prev.t) {
      const dt = (now - prev.t) / 1000;
      if (dt >= 1 / 120 && dt <= 0.25) {
        speed = (prop.screenY - prev.screenY) / dt;
        worldV = (prop.worldY - prev.worldY) / dt;
      }
    }
    this._liveLock[name] = {
      planted,
      t: now,
      screenY: prop.screenY,
      worldY: prop.worldY
    };
    const check = this.projectWorld(Number.isFinite(prop.x) ? prop.x : this.width * 0.5, prop.worldY);
    return {
      name,
      id: prop.item?.id || '',
      worldY: prop.worldY,
      screenY: prop.screenY,
      s: prop.s,
      scale: prop.scale,
      speed,
      worldV,
      model: (Number(prop.s) || 0) ** 2 * (worldV || 0),
      projS: check.s,
      projScale: check.scale,
      projScreen: check.screenY,
      groundY: prop.groundY
    };
  }

  liveDepthCohort(live) {
    const anchor = live?.TREE || live?.FENCE || live?.GATEWAY;
    if (!anchor || !Number.isFinite(anchor.worldY)) return null;
    let n = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let minSy = Infinity;
    let maxSy = -Infinity;
    let minS = Infinity;
    let maxS = -Infinity;
    const props = this.worldProps || [];
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      if (!Number.isFinite(prop.worldY) || !Number.isFinite(prop.s)) continue;
      if (Math.abs(prop.worldY - anchor.worldY) > 1.5) continue;
      n += 1;
      minY = Math.min(minY, prop.worldY);
      maxY = Math.max(maxY, prop.worldY);
      minSy = Math.min(minSy, prop.screenY);
      maxSy = Math.max(maxSy, prop.screenY);
      minS = Math.min(minS, prop.s);
      maxS = Math.max(maxS, prop.s);
    }
    if (n < 2) return { n, dY: 0, dSy: 0, dS: 0 };
    return {
      n,
      dY: maxY - minY,
      dSy: maxSy - minSy,
      dS: maxS - minS
    };
  }

  drawDepthProbe() {
    // PASS B.4: no on-canvas UNIFIED DEPTH overlay in game view.
  }

  resetWorldProps() {
    this.worldProps.length = 0;
    this.deferredProps.length = 0;
    this.worldPropCount = 0;
    this.choiceClearance = [];
  }

  allocProp() {
    const index = this.worldPropCount || 0;
    this.worldPropCount = index + 1;
    if (!this.worldPropPool[index]) this.worldPropPool[index] = {};
    const prop = this.worldPropPool[index];
    prop.kind = null;
    prop.item = null;
    prop.x = 0;
    prop.groundY = 0;
    prop.screenY = 0;
    prop.w = 0;
    prop.h = 0;
    prop.alpha = 1;
    prop.flip = false;
    prop.layer = 0;
    prop.role = null;
    prop.obs = null;
    prop.neighbors = null;
    prop.family = null;
    prop.familySeed = 0;
    prop.classScale = 1;
    prop.coin = null;
    prop.side = 0;
    prop.spans = null;
    prop.openings = null;
    prop.choice = false;
    prop.worldY = null;
    prop.scale = null;
    prop.s = null;
    this.worldProps.push(prop);
    return prop;
  }

  collectAndDrawWorld(camera, segments, playerY) {
    this.resetWorldProps();
    this.markFenceClearance(segments);
    this.collectSideMasses(camera);
    this.collectMidGarden(camera);
    this.collectSideGroups(camera);
    this.collectUnderstory(camera);
    this.collectRoadEdge(camera);
    this.collectHedgeFoliage(camera);
    if (this.usePack()) this.collectFenceRows(segments);
    else this.collectObstacles(segments);
    this.collectCoins(segments);

    const props = this.worldProps;
    props.sort((a, b) => (
      a.screenY - b.screenY
      || a.layer - b.layer
      || a.x - b.x
    ));

    const passLine = (Number(playerY) || CONFIG.PLAYER_START_Y) - 10;
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      if (prop.kind === 'arch' && (prop.groundY || prop.screenY) >= passLine) {
        this.deferredProps.push(prop);
        continue;
      }
      this.drawWorldProp(prop);
    }
  }

  drawDeferredWorld() {
    for (let i = 0; i < this.deferredProps.length; i += 1) {
      this.drawWorldProp(this.deferredProps[i]);
    }
    this.deferredProps.length = 0;
  }

  drawWorldProp(prop) {
    if (!prop) return;
    if (prop.kind === 'sprite') this.drawCollectedSprite(prop);
    else if (prop.kind === 'planter') this.drawPlanter(
      prop.obs,
      prop.neighbors || [],
      prop.family,
      prop.familySeed,
      prop.classScale,
      prop.item
    );
    else if (prop.kind === 'coin') this.drawCoin(prop.coin);
    else if (prop.kind === 'fence-row') this.drawFenceRow(prop);
    else if (prop.kind === 'arch' || prop.kind === 'choice-arch' || prop.kind === 'choice-gateway') {
      this.drawGardenArch(prop);
    }
  }

  drawGardenArch(prop) {
    if (!prop.item || prop.w < 2 || prop.h < 2) return;
    const occ = this.beginHorizonReveal(prop.x, prop.groundY, prop.w, prop.h);
    if (!occ) return;
    this.drawSprite(prop.item, prop.x, prop.groundY, prop.w, prop.h, {
      grounded: true,
      alpha: 1,
      flip: false
    });
    this.endHorizonReveal(occ);
  }

  drawCollectedSprite(prop) {
    if (!prop.item || prop.w < 2 || prop.h < 2) return;
    const occ = this.beginHorizonReveal(prop.x, prop.groundY, prop.w, prop.h);
    if (!occ) return;
    if (occ.state === 'VISIBLE') {
      this.contactShadow(prop.x, prop.groundY, prop.w * (prop.role === 'tree' ? 0.42 : 0.58), prop.screenY);
    }
    this.drawSprite(prop.item, prop.x, prop.groundY, prop.w, prop.h, {
      grounded: true,
      alpha: 1,
      flip: prop.flip
    });
    this.endHorizonReveal(occ);
  }

  drawSky() {
    const ctx = this.ctx;
    const skyBand = this.horizonY();
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = mixHex(this.sky, this.c.CatCream, 0.18);
    ctx.fillRect(0, 0, this.width, 88);
    ctx.fillStyle = mixHex(this.sky, this.c.SkyPaper, 0.12);
    ctx.globalAlpha = 0.55;
    this.oval(this.width * 0.5, 36, this.width * 0.62, 42);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.horizonMist;
    ctx.globalAlpha = 0.34;
    this.oval(this.width * 0.5, skyBand - 18, this.width * 0.72, 28);
    ctx.globalAlpha = 1;
  }

  drawLawn(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const step = 20;
    const skyBand = this.horizonY();
    const pack = this.usePack();
    const span = this.roadWorldRange(shift, 8, 56);
    const world0 = span.world0;
    const world1 = span.world1;
    const top = this.roadAt(world0);
    const bottom = this.roadAt(world1);
    const wobbleAmp = pack ? 0.08 : 1;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, top.drawY + 10);
    for (let x = 0; x <= this.width; x += 36) {
      const wobble = (Math.sin(x * 0.018) * 7 + Math.sin(x * 0.05) * 4) * wobbleAmp;
      ctx.lineTo(x, top.drawY + wobble);
    }
    ctx.lineTo(this.width, bottom.drawY);
    ctx.lineTo(0, bottom.drawY);
    ctx.closePath();
    ctx.clip();

    if (pack && typeof ctx.createLinearGradient === 'function') {
      const farLawn = parseHex(mixHex(this.c.HedgeSage, this.c.SafeLawn, 0.42));
      const midLawn = parseHex(this.lawnBed);
      const fade = ctx.createLinearGradient(0, top.drawY, 0, top.drawY + 220);
      fade.addColorStop(0, `rgba(${farLawn.r}, ${farLawn.g}, ${farLawn.b}, 0)`);
      fade.addColorStop(0.12, `rgba(${farLawn.r}, ${farLawn.g}, ${farLawn.b}, 0.18)`);
      fade.addColorStop(0.38, `rgba(${farLawn.r}, ${farLawn.g}, ${farLawn.b}, 0.58)`);
      fade.addColorStop(0.72, `rgba(${midLawn.r}, ${midLawn.g}, ${midLawn.b}, 0.9)`);
      fade.addColorStop(1, this.lawnBed);
      ctx.fillStyle = fade;
    } else {
      ctx.fillStyle = this.lawnBed;
    }
    ctx.beginPath();
    ctx.moveTo(0, top.drawY);
    for (let worldY = world0; worldY <= world1; worldY += step) {
      const p = this.roadAt(worldY);
      ctx.lineTo(p.roadLeft - 1, p.drawY);
    }
    ctx.lineTo(0, bottom.drawY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(this.width, top.drawY);
    for (let worldY = world0; worldY <= world1; worldY += step) {
      const p = this.roadAt(worldY);
      ctx.lineTo(p.roadRight + 1, p.drawY);
    }
    ctx.lineTo(this.width, bottom.drawY);
    ctx.closePath();
    ctx.fill();

    this.walkGameplay(cam, pack ? 28 : 54, (slot, y) => {
      const p = this.roadAt(y);
      if (p.linearScreenY < skyBand - 4) return;
      const leftSpot = hash01(slot + 2) > 0.5;
      const edge = leftSpot ? p.roadLeft : p.roadRight;
      const garden = leftSpot
        ? Math.max(18, edge - 8)
        : Math.max(18, this.width - edge - 8);
      const x = leftSpot
        ? 8 + hash01(slot) * garden
        : edge + 8 + hash01(slot + 3) * garden;
      ctx.globalAlpha = 0.1 + p.t * 0.14;
      ctx.fillStyle = hash01(slot + 5) > 0.5 ? this.lawnLight : this.lawnShade;
      this.oval(x, p.drawY + 14, 18 + hash01(slot + 6) * 16, 7 + hash01(slot + 7) * 4);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = mixHex(this.c.SafeLawn, this.c.FloorSand, 0.18);
    ctx.globalAlpha = pack ? 0.28 : 0.34;
    const fringe0 = this.roadWorldRange(shift, 16, 56).world0;
    ctx.beginPath();
    for (let worldY = fringe0; worldY <= world1; worldY += step) {
      const p = this.roadAt(worldY);
      const fringe = this.hedgeSetback(p.linearScreenY) * (0.55 + 0.45 * p.t);
      if (worldY === fringe0) ctx.moveTo(p.roadLeft - fringe, p.drawY);
      else ctx.lineTo(p.roadLeft - fringe, p.drawY);
    }
    for (let worldY = world1; worldY >= fringe0; worldY -= step) {
      const p = this.roadAt(worldY);
      ctx.lineTo(p.roadLeft + 1, p.drawY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (let worldY = fringe0; worldY <= world1; worldY += step) {
      const p = this.roadAt(worldY);
      const fringe = this.hedgeSetback(p.linearScreenY) * (0.55 + 0.45 * p.t);
      if (worldY === fringe0) ctx.moveTo(p.roadRight + fringe, p.drawY);
      else ctx.lineTo(p.roadRight + fringe, p.drawY);
    }
    for (let worldY = world1; worldY >= fringe0; worldY -= step) {
      const p = this.roadAt(worldY);
      ctx.lineTo(p.roadRight - 1, p.drawY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawClouds(time) {
    const item = this.pick('clouds', 1);
    const skyLimit = this.horizonY() - 56;
    if (!item) {
      this.ctx.globalAlpha = 0.5;
      this.blob(64, 48, 34, 3, this.cloud);
      this.blob(this.width - 70, 70, 28, 8, this.cloud);
      this.blob(this.width * 0.46, 40, 24, 12, this.cloud);
      this.ctx.globalAlpha = 1;
      return;
    }
    const drift = (Number(time) || 0) * 1.05;
    const placements = this.usePack()
      ? [
        { seed: 4, y: 30, w: 198, side: -1 },
        { seed: 11, y: 58, w: 176, side: 1 },
        { seed: 19, y: 44, w: 158, side: -1 },
        { seed: 27, y: 72, w: 148, side: 1 }
      ]
      : [
        { seed: 4, y: 36, w: 198, side: -1 },
        { seed: 11, y: 64, w: 176, side: 1 },
        { seed: 19, y: 48, w: 164, side: -1 }
      ];
    placements.forEach((place) => {
      if (place.y > skyLimit) return;
      const cloud = this.pick('clouds', place.seed) || item;
      const src = this.sourceRect(cloud);
      const h = Math.min(place.w * (src.sh / src.sw), Math.max(24, skyLimit - place.y - 6));
      const minX = place.side < 0 ? -place.w * 0.06 : this.width * 0.58;
      const maxX = place.side < 0 ? this.width * 0.4 : this.width + place.w * 0.06;
      const span = Math.max(24, maxX - minX);
      const dir = place.side < 0 ? 1 : -1;
      const x = minX + ((hash01(place.seed) * span + drift * dir) % span + span) % span;
      this.drawSprite(cloud, x, place.y, place.w, h, {
        alpha: 0.9,
        flip: place.side > 0
      });
    });
  }

  drawHorizonGarden(camera) {
    if (this.usePack()) {
      this.drawPackHorizon(camera);
      return;
    }
    const ctx = this.ctx;
    const horizon = this.horizonY();
    const cam = camera || dummyCamera();

    ctx.save();
    ctx.fillStyle = this.horizonMist;
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.moveTo(0, horizon - 28);
    for (let x = 0; x <= this.width; x += 24) {
      const rise = Math.sin(x * 0.028) * 12 + Math.sin(x * 0.07 + 1.1) * 7;
      ctx.lineTo(x, horizon - 22 + rise);
    }
    ctx.lineTo(this.width, horizon + 22);
    ctx.lineTo(0, horizon + 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.horizonDeep;
    ctx.globalAlpha = 0.5;
    this.oval(this.width * 0.5, horizon - 4, this.width * 0.62, 22);
    this.oval(this.width * 0.18, horizon + 4, 118, 18);
    this.oval(this.width * 0.5, horizon + 8, 150, 16);
    this.oval(this.width * 0.82, horizon + 3, 122, 18);
    ctx.restore();

    this.walkHorizon(cam, 20, (slot, y) => {
      if (y < horizon - 64 || y > horizon + 20) return;
      const groundY = horizon + 8 + hash01(slot + 5) * 6;
      const x = 10 + hash01(slot + 6) * (this.width - 20);
      ctx.globalAlpha = 0.34 + hash01(slot + 2) * 0.14;
      this.blob(x, groundY - 12, 20 + hash01(slot) * 12, slot, this.horizonDeep);
      ctx.globalAlpha = 1;
    });

    const tree = this.pick('trees', 2);
    const bush = this.pick('bushes', 3);
    this.walkHorizon(cam, 16, (slot, y) => {
      if (y < horizon - 60 || y > horizon + 14) return;
      if (hash01(slot + 3) < 0.1) return;
      const groundY = horizon + 8 + hash01(slot + 5) * 8;
      const x = 6 + hash01(slot + 6) * (this.width - 12);
      const centerFade = Math.abs(x - this.width / 2) / (this.width / 2);
      const alpha = 0.34 + hash01(slot + 12) * 0.16 - (1 - centerFade) * 0.06;
      const item = hash01(slot + 9) > 0.28 ? tree : bush;
      if (item) {
        const src = this.sourceRect(item);
        const h = 44 + hash01(slot + 10) * 26;
        const w = h * (src.sw / src.sh) * 0.92;
        this.drawSprite(item, x, groundY, w, h, {
          grounded: true,
          alpha: Math.max(0.28, Math.min(0.58, alpha)),
          flip: hash01(slot + 7) > 0.5
        });
        return;
      }
      this.blob(x, groundY - 8, 15 + hash01(slot) * 9, slot, this.lawnFar);
    });
  }

  drawPackHorizon(camera) {
    const ctx = this.ctx;
    const horizon = this.horizonY();
    const item = this.farHorizonItem();

    if (!item) {
      ctx.save();
      ctx.fillStyle = this.sky;
      ctx.fillRect(0, 0, this.width, horizon + 24);
      ctx.fillStyle = this.horizonDeep;
      ctx.globalAlpha = 0.46;
      this.oval(this.width * 0.5, horizon + 4, this.width * 0.62, 20);
      ctx.restore();
      return;
    }

    const src = this.sourceRect(item);
    const aspect = src.sh / Math.max(1, src.sw);
    const skylineT = CONFIG.VISUAL.FAR_SKYLINE_T || 0.86;
    const minH = (horizon + 4) / Math.max(0.2, skylineT);
    const destH = Math.max(minH, this.width * aspect * 1.02);
    const destW = destH / aspect;
    const destX = (this.width - destW) / 2;
    const destY = horizon - destH * skylineT;

    ctx.drawImage(
      item.image,
      src.sx,
      src.sy,
      src.sw,
      src.sh,
      destX,
      destY,
      destW,
      destH
    );

    this.drawHorizonSeam(horizon, destY + destH);
  }

  drawFarGardenWings() {
    return;
  }

  drawHorizonSeam(horizon, destBottom) {
    const ctx = this.ctx;
    if (typeof ctx.createLinearGradient !== 'function') return;
    const garden = parseHex(mixHex(this.c.HedgeSage, this.c.SafeLawn, 0.34));
    const coverTop = horizon - 6;
    const coverBot = Math.min(this.horizonY() + 42, Math.max(horizon + 18, destBottom));
    const cover = ctx.createLinearGradient(0, coverTop, 0, coverBot);
    cover.addColorStop(0, `rgba(${garden.r}, ${garden.g}, ${garden.b}, 0)`);
    cover.addColorStop(0.55, `rgba(${garden.r}, ${garden.g}, ${garden.b}, 0.04)`);
    cover.addColorStop(1, `rgba(${garden.r}, ${garden.g}, ${garden.b}, 0.08)`);
    ctx.fillStyle = cover;
    ctx.fillRect(0, coverTop, this.width, Math.max(8, coverBot - coverTop));
  }

  drawDistantMeadow() {
    const ctx = this.ctx;
    const horizon = this.horizonY();
    const meadow = parseHex(mixHex(this.c.HedgeSage, this.c.SafeLawn, 0.38));
    const steps = 16;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, horizon - 6);
    for (let i = 0; i <= steps; i += 1) {
      const x = (this.width * i) / steps;
      ctx.lineTo(x, projectorCrestYAt(x, this.width) + 8);
    }
    ctx.lineTo(this.width, horizon - 6);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const peak = projectorCrestYAt(this.width * 0.5, this.width);
      const wash = ctx.createLinearGradient(0, horizon - 4, 0, peak + 10);
      wash.addColorStop(0, `rgba(${meadow.r}, ${meadow.g}, ${meadow.b}, 0)`);
      wash.addColorStop(0.55, `rgba(${meadow.r}, ${meadow.g}, ${meadow.b}, 0.05)`);
      wash.addColorStop(1, `rgba(${meadow.r}, ${meadow.g}, ${meadow.b}, 0.09)`);
      ctx.fillStyle = wash;
      ctx.fill();
    }
    ctx.restore();
  }

  drawCrestLandform() {
    const ctx = this.ctx;
    const shift = this.lastShift || 0;
    const steps = 16;
    const sand = parseHex(mixHex(this.c.FloorSand, this.c.ShadowDust, 0.22));
    const sage = parseHex(mixHex(this.c.HedgeSage, this.c.FloorSand, 0.42));
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const x = (this.width * i) / steps;
      const y = projectorCrestYAt(x, this.width) - shift;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const x = (this.width * i) / steps;
      ctx.lineTo(x, projectorCrestYAt(x, this.width) - shift + 18);
    }
    ctx.closePath();
    ctx.clip();
    const peak = projectorCrestYAt(this.width * 0.5, this.width) - shift;
    if (typeof ctx.createLinearGradient === 'function') {
      const wash = ctx.createLinearGradient(0, peak - 2, 0, peak + 18);
      wash.addColorStop(0, `rgba(${sage.r}, ${sage.g}, ${sage.b}, 0.16)`);
      wash.addColorStop(0.42, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0.08)`);
      wash.addColorStop(1, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0)`);
      ctx.fillStyle = wash;
    } else {
      ctx.fillStyle = this.sandShade;
      ctx.globalAlpha = 0.08;
    }
    ctx.fillRect(0, peak - 6, this.width, 28);
    ctx.restore();
  }

  roadWorldRange(shift, farPad = 4, nearPad = 48) {
    return {
      world0: worldYForScreen(this.horizonY() + farPad, shift, this.height),
      world1: worldYForScreen(this.height + nearPad, shift, this.height)
    };
  }

  screenPathLeft(screenY) {
    return this.projectWorld(this.width * 0.5, this.screenToWorldY(screenY)).roadLeft;
  }

  screenPathRight(screenY) {
    return this.projectWorld(this.width * 0.5, this.screenToWorldY(screenY)).roadRight;
  }

  drawSandShoulder(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const progress = cam.progress || 0;
    const step = 16;
    const span = this.roadWorldRange(shift, 10, 48);
    const world0 = span.world0;
    const world1 = span.world1;

    const paintShoulder = (side) => {
      ctx.beginPath();
      let started = false;
      for (let worldY = world0; worldY <= world1; worldY += step) {
        const p = this.roadAt(worldY);
        const sand = sandShoulderWidth(p.linearScreenY, this.height);
        const inner = side < 0 ? p.roadLeft : p.roadRight;
        const x = inner - side * sand * 0.28;
        if (!started) {
          ctx.moveTo(x, p.drawY);
          started = true;
        } else ctx.lineTo(x, p.drawY);
      }
      if (!started) return;
      for (let worldY = world1; worldY >= world0; worldY -= step) {
        const p = this.roadAt(worldY);
        const sand = sandShoulderWidth(p.linearScreenY, this.height);
        const inner = side < 0 ? p.roadLeft : p.roadRight;
        const wobble = edgeWobble(worldY - progress, side < 0 ? 15 : 19) * 0.22;
        ctx.lineTo(inner + side * (sand * 0.78 + wobble), p.drawY);
      }
      ctx.closePath();
      ctx.fill();
    };

    ctx.save();
    ctx.fillStyle = this.sandRim;
    ctx.globalAlpha = 0.42;
    paintShoulder(-1);
    paintShoulder(1);
    ctx.fillStyle = this.sandEdge;
    ctx.globalAlpha = 0.22;
    paintShoulder(-1);
    paintShoulder(1);
    ctx.restore();
  }

  drawPath(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const progress = cam.progress || 0;
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const samples = sampleRoadRibbon(shift, { height: this.height, pad: 56 });
    if (samples.length < 2) return;

    const traceRibbon = (outset = 0) => {
      ctx.beginPath();
      const last = samples[samples.length - 1];
      ctx.moveTo(last.roadLeft - outset, last.drawY);
      for (let i = samples.length - 2; i >= 0; i -= 1) {
        ctx.lineTo(samples[i].roadLeft - outset, samples[i].drawY);
      }
      ctx.lineTo(samples[0].roadRight + outset, samples[0].drawY);
      for (let i = 1; i < samples.length; i += 1) {
        ctx.lineTo(samples[i].roadRight + outset, samples[i].drawY);
      }
      ctx.closePath();
    };

    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.16;
    traceRibbon(3);
    ctx.fill();
    ctx.globalAlpha = 1;

    const farSample = samples[0];
    const nearSample = samples[samples.length - 1];
    if (typeof ctx.createLinearGradient === 'function') {
      ctx.save();
      traceRibbon(0);
      ctx.clip();
      const farC = parseHex(this.pathSandFar);
      const midC = parseHex(mixHex(this.pathSandFar, this.pathSandNear, 0.45));
      const fill = ctx.createLinearGradient(0, farSample.drawY, 0, nearSample.drawY);
      fill.addColorStop(0, `rgba(${farC.r}, ${farC.g}, ${farC.b}, 0.55)`);
      fill.addColorStop(0.18, `rgba(${farC.r}, ${farC.g}, ${farC.b}, 0.88)`);
      fill.addColorStop(0.5, `rgba(${midC.r}, ${midC.g}, ${midC.b}, 1)`);
      fill.addColorStop(1, this.pathSandNear);
      ctx.fillStyle = fill;
      ctx.fillRect(0, farSample.drawY - 8, this.width, nearSample.drawY - farSample.drawY + 24);
      ctx.restore();
    } else {
      ctx.fillStyle = this.pathSandNear;
      traceRibbon(0);
      ctx.fill();
    }

    const sand = this.usePack() ? this.pathSandItem() : null;
    if (sand && typeof ctx.drawImage === 'function') {
      ctx.save();
      traceRibbon(0);
      ctx.clip();
      this.drawPathSandRibbon(sand, samples, progress);
      this.drawRibbonEdgeTone(samples);
      ctx.restore();
    } else {
      this.drawSandGrain(cam);
    }
  }

  drawPathSandRibbon(item, samples, progress) {
    const ctx = this.ctx;
    const img = item.image;
    if (!img) return;
    const tw = img.naturalWidth || 864;
    const th = img.naturalHeight || 1152;
    const tileWorld = Math.max(900, CONFIG.VISUAL.PATH_SAND_TILE || 1760);
    if (ctx.imageSmoothingEnabled != null) ctx.imageSmoothingEnabled = true;

    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i];
      const b = samples[i + 1];
      const destH = Math.max(1, b.drawY - a.drawY) + 1;
      const left = Math.min(a.roadLeft, b.roadLeft);
      const right = Math.max(a.roadRight, b.roadRight);
      const destW = right - left;
      if (destW < 2 || destH < 1) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.roadLeft, a.drawY);
      ctx.lineTo(b.roadLeft, b.drawY);
      ctx.lineTo(b.roadRight, b.drawY);
      ctx.lineTo(a.roadRight, a.drawY);
      ctx.closePath();
      ctx.clip();

      // Same planted world-Y as vegetation slots: worldY - progress, no extra scroll.
      const planted = this.plantedY(a.worldY, progress);
      const worldV = ((planted % tileWorld) + tileWorld) % tileWorld;
      const srcY = (worldV / tileWorld) * th;
      const srcH = Math.max(0.8, (Math.abs(b.worldY - a.worldY) / tileWorld) * th);
      ctx.globalAlpha = 0.42 + a.t * 0.46;
      this.blitPathSandStrip(ctx, img, tw, th, srcY, srcH, left, a.drawY - 0.5, destW, destH);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawRibbonEdgeTone(samples) {
    const ctx = this.ctx;
    for (let i = 1; i < samples.length; i += 1) {
      const p = samples[i];
      const destW = p.roadWidth;
      if (destW < 16) continue;
      const band = Math.max(6, destW * (0.08 + p.t * 0.04));
      ctx.fillStyle = this.sandEdge;
      ctx.globalAlpha = 0.12 + p.t * 0.16;
      this.oval(p.roadLeft + band * 0.55, p.drawY, band, 6);
      this.oval(p.roadRight - band * 0.55, p.drawY, band, 6);
    }
    ctx.globalAlpha = 1;
  }

  blitPathSandStrip(ctx, img, tw, th, srcY, srcH, dx, dy, dw, dh) {
    const sy = ((srcY % th) + th) % th;
    if (sy + srcH <= th + 0.01) {
      ctx.drawImage(img, 0, sy, tw, Math.min(srcH, th - sy), dx, dy, dw, dh);
      return;
    }
    const firstH = th - sy;
    const frac = firstH / srcH;
    const firstDest = Math.max(0.5, dh * frac);
    ctx.drawImage(img, 0, sy, tw, firstH, dx, dy, dw, firstDest);
    ctx.drawImage(img, 0, 0, tw, srcH - firstH, dx, dy + firstDest, dw, Math.max(0.5, dh - firstDest));
  }

  drawSandGrain(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const progress = cam.progress || 0;
    this.walkGameplay(cam, 72, (slot, y) => {
      const p = this.roadAt(y);
      if (p.linearScreenY < this.horizonY() + 10) return;
      const pad = 10;
      const left = p.roadLeft + pad;
      const right = p.roadRight - pad;
      if (right <= left) return;
      const span = right - left;
      const mid = (left + right) / 2;
      const x = left + hash01(slot) * span;
      const offCenter = Math.abs(x - mid) / Math.max(1, span * 0.5);
      if (offCenter > 0.28 || hash01(slot + 3) > 0.62) {
        ctx.globalAlpha = 0.1 + p.t * 0.16;
        ctx.fillStyle = hash01(slot + 2) > 0.5 ? this.sandLight : this.sandShade;
        this.oval(x, p.drawY + 8, (16 + hash01(slot + 4) * 14) * p.scale, (4.5 + hash01(slot + 6) * 3.5) * p.scale);
      }
    });
    ctx.globalAlpha = 1;
  }

  drawGardenBorders(camera) {
    this.drawGardenBorder(camera, -1);
    this.drawGardenBorder(camera, 1);
  }

  drawGardenBorder(camera, side) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const progress = cam.progress || 0;
    const step = 10;
    const span = this.roadWorldRange(shift, 4, 40);
    const world0 = span.world0;
    const world1 = span.world1;
    const innerPts = this.borderScratch.inner;
    const outerPts = this.borderScratch.outer;
    const topPts = this.borderScratch.top;
    innerPts.length = 0;
    outerPts.length = 0;
    topPts.length = 0;

    for (let worldY = world0; worldY <= world1; worldY += step) {
      const projected = this.roadAt(worldY);
      const inner = this.hedgeInnerX(side, worldY, shift, progress);
      const outer = this.hedgeOuterX(side, worldY, shift, progress);
      const dip = hash01(Math.round((worldY - progress) / 38) * 17 + (side < 0 ? 3 : 11));
      const live = dip < 0.18 ? 0.42 + dip * 0.8 : dip > 0.94 ? 1.1 : 1;
      const height = this.hedgeHeight(projected.linearScreenY) * live;
      const scallop = Math.sin((worldY - progress) * 0.038 + (side < 0 ? 0.6 : 1.8)) * (3.4 + projected.t * 4.6)
        + Math.sin((worldY - progress) * 0.09 + side) * 2.4
        + Math.sin((worldY - progress) * 0.17 + side * 0.7) * 1.4;
      innerPts.push(inner, projected.drawY);
      outerPts.push(outer, projected.drawY);
      topPts.push((inner + outer) * 0.5, projected.drawY - height + scallop);
    }

    if (innerPts.length < 4) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(innerPts[0], innerPts[1]);
    for (let i = 2; i < innerPts.length; i += 2) ctx.lineTo(innerPts[i], innerPts[i + 1]);
    for (let i = outerPts.length - 2; i >= 0; i -= 2) ctx.lineTo(outerPts[i], outerPts[i + 1]);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const fill = ctx.createLinearGradient(0, this.horizonY(), 0, this.height);
      const sage = parseHex(this.hedgeFill);
      fill.addColorStop(0, `rgba(${sage.r}, ${sage.g}, ${sage.b}, 0.34)`);
      fill.addColorStop(0.1, `rgba(${sage.r}, ${sage.g}, ${sage.b}, 0.62)`);
      fill.addColorStop(0.32, `rgba(${sage.r}, ${sage.g}, ${sage.b}, 0.86)`);
      fill.addColorStop(1, `rgba(${sage.r}, ${sage.g}, ${sage.b}, 0.96)`);
      ctx.fillStyle = fill;
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = this.hedgeFill;
      ctx.globalAlpha = 0.7;
    }
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(innerPts[0], innerPts[1]);
    for (let i = 2; i < innerPts.length; i += 2) ctx.lineTo(innerPts[i], innerPts[i + 1]);
    for (let i = topPts.length - 2; i >= 0; i -= 2) ctx.lineTo(topPts[i], topPts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = this.hedgeFace;
    ctx.globalAlpha = 0.18;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(outerPts[0], outerPts[1]);
    for (let i = 2; i < outerPts.length; i += 2) ctx.lineTo(outerPts[i], outerPts[i + 1]);
    for (let i = topPts.length - 2; i >= 0; i -= 2) ctx.lineTo(topPts[i], topPts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = this.hedgeLight;
    ctx.globalAlpha = 0.28;
    ctx.fill();

    ctx.strokeStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(innerPts[0], innerPts[1]);
    for (let i = 2; i < innerPts.length; i += 2) ctx.lineTo(innerPts[i], innerPts[i + 1]);
    ctx.stroke();
    ctx.restore();
  }

  collectHedgeFoliage(camera) {
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const progress = cam.progress || 0;
    const pack = this.usePack();
    [-1, 1].forEach((side) => {
      this.walkGameplay(cam, pack ? 36 : 28, (slot, y) => {
        const projected = this.roadAt(y);
        if (projected.linearScreenY < this.horizonY() - 10) return;
        if (hash01(slot * 4.7 + side) < 0.45) return;
        const inner = this.hedgeInnerX(side, y, shift, progress);
        const outer = this.hedgeOuterX(side, y, shift, progress);
        const height = this.hedgeHeight(projected.linearScreenY);
        const width = Math.abs(outer - inner);
        const u = 0.42 + hash01(slot + 2) * 0.28;
        const worldX = inner + (side < 0 ? -1 : 1) * width * u;
        const groundY = projected.drawY + 3;
        const tuft = hash01(slot + 11);
        let item = null;
        let h = height * (0.34 + hash01(slot + 5) * 0.18);
        if (pack && tuft > 0.86) {
          item = this.pick('flowers', slot + 17);
          h = height * (0.24 + hash01(slot + 19) * 0.12);
        } else if (pack) {
          item = this.pick('grass', slot + 41);
        }
        if (!item || !this.isReady(item)) return;
        const size = this.spriteSize(item, Math.max(8, h * (0.94 + projected.t * 0.04)));
        if (this.spriteOffscreen(worldX, groundY, size.width * 0.92, size.height)) return;
        const prop = this.allocProp();
        prop.kind = 'sprite';
        prop.role = 'hedge';
        prop.item = item;
        prop.x = worldX;
        prop.groundY = groundY;
        prop.screenY = projected.screenY;
        prop.w = size.width * 0.92;
        prop.h = size.height;
        prop.alpha = 1;
        prop.flip = hash01(slot + 8) > 0.5;
        prop.layer = ROLE_LAYER.hedge;
        prop.side = side;
      });
    });
  }

  collectSideMasses(camera) {
    if (!this.usePack()) return;
    [-1, 1].forEach((side) => {
      const item = this.sideMassItem(side);
      if (!item || !this.isReady(item)) return;
      const cam = camera || dummyCamera();
      const catH = this.catH();
      const horizon = this.horizonY();
      this.walkGameplay(cam, this.massPeriod(side), (slot, y) => {
        if (!this.massShows(slot, side)) return;
        const worldGroundY = y + 18;
        const worldX = this.gardenWorldX(side, 0.72 + hash01(slot + 3) * 0.16);
        const propX = this.projectWorldProp(worldX, worldGroundY);
        if (propX.linearScreenY < horizon - 10) return;
        const nearCat = CONFIG.VISUAL.MASS_NEAR_CAT || 1.92;
        const h = catH * (nearCat * (0.96 + hash01(slot) * 0.05)) * propX.scale;
        const size = this.spriteSize(item, h);
        const x = this.keepOffRoad(propX.screenX, size.width / 2, side, worldGroundY, 'mass');
        if (this.spriteOffscreen(x, propX.groundY, size.width, size.height)) return;
        const prop = this.allocProp();
        prop.kind = 'sprite';
        prop.role = 'mass';
        prop.item = item;
        prop.x = x;
        prop.groundY = propX.groundY;
        prop.screenY = propX.screenY;
        prop.worldY = worldGroundY;
        prop.s = propX.s;
        prop.scale = propX.s;
        prop.w = size.width;
        prop.h = size.height;
        prop.alpha = 1;
        prop.flip = false;
        prop.layer = ROLE_LAYER.mass;
        prop.side = side;
      });
    });
  }

  isChoiceVisual(segment) {
    return segment?.type === 'TWO_PATHS'
      || segment?.type === 'DUAL_RISK'
      || !!segment?.isChoiceSegment;
  }

  choiceGatewayItem() {
    const item = this.itemById('landmarks', 'single-choice-arch');
    if (!item || item.id !== 'single-choice-arch' || !this.isReady(item)) return null;
    const src = this.sourceRect(item);
    if (src.sw < 80 || src.sh < 80) return null;
    return item;
  }

  choiceGateHeight(segment, path) {
    const row = (segment?.obstacles || []).filter((obs) => (
      Math.abs(obs.y - (path?.y || 0)) < 12
    ));
    if (row.length) {
      return row.reduce((max, obs) => Math.max(max, obs.height || 0), 0);
    }
    return CONFIG.CHOICE_GATE_HEIGHT;
  }

  markFenceClearance(segments) {
    this.choiceClearance = [];
    (segments || []).forEach((segment) => {
      (segment.obstacles || []).forEach((obs) => {
        if (!Number.isFinite(obs?.y)) return;
        this.choiceClearance.push({
          groundY: obs.y + Math.max(8, obs.height || 0),
          x0: obs.x - 12,
          x1: obs.x + obs.width + 12
        });
      });
      (segment.paths || []).forEach((path) => {
        if (!Number.isFinite(path?.y) || !Number.isFinite(path?.x)) return;
        const gateH = this.choiceGateHeight(segment, path);
        this.choiceClearance.push({
          groundY: path.y + Math.max(8, gateH),
          x0: path.x - 16,
          x1: path.x + path.width + 16
        });
      });
    });
  }

  markChoiceClearance(segments) {
    this.markFenceClearance(segments);
  }

  nearChoiceGround(gameplayY) {
    return (this.choiceClearance || []).some((zone) => (
      Math.abs((zone.groundY || 0) - gameplayY) < 104
    ));
  }

  blocksChoiceGateway(role, x, groundY, halfW, height = 0) {
    if (role === 'grass' || role === 'flower' || role === 'edge') return false;
    const shift = this.lastShift || 0;
    const pathLeft = this.pathLeftVisual(groundY, shift);
    const pathRight = this.pathRightVisual(groundY, shift);
    if (!(x > pathLeft && x < pathRight)) return false;
    const half = Number(halfW) || 0;
    const top = groundY - Math.max(8, height || 0);
    return (this.choiceClearance || []).some((zone) => {
      const gateTop = zone.groundY - 96;
      const gateBottom = zone.groundY;
      if (top > gateBottom || groundY < gateTop) return false;
      const gateLeft = this.projectGameplayX(zone.x0, zone.groundY);
      const gateRight = this.projectGameplayX(zone.x1, zone.groundY);
      return x + half > gateLeft && x - half < gateRight;
    });
  }

  ensureFenceKit() {
    if (this.fenceKit && this.fenceKit.image) return this.fenceKit;
    const item = this.gardenFenceItem();
    if (!this.isReady(item)) return null;
    this.fenceKit = {
      image: item.image,
      post: FENCE_POST_SRC,
      rail: FENCE_RAIL_SRC
    };
    return this.fenceKit;
  }

  ensureGatewayKit() {
    if (this.gatewayKit && this.gatewayKit.image) return this.gatewayKit;
    const item = this.choiceGatewayItem();
    if (!this.isReady(item)) return null;
    this.gatewayKit = {
      image: item.image,
      leftPost: GATE_LEFT_POST_SRC,
      rightPost: GATE_RIGHT_POST_SRC,
      beam: GATE_BEAM_SRC
    };
    return this.gatewayKit;
  }

  blitModule(image, src, dx, dy, dw, dh, alpha = 1) {
    if (!image || !src || dw < 1 || dh < 1) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      image,
      src.sx,
      src.sy,
      src.sw,
      src.sh,
      dx,
      dy,
      dw,
      dh
    );
    ctx.restore();
  }

  mergeFenceSpans(obstacles) {
    const sorted = (obstacles || [])
      .filter((obs) => Number.isFinite(obs?.x) && Number.isFinite(obs?.width))
      .map((obs) => ({
        x: obs.x,
        y: obs.y,
        width: obs.width,
        height: obs.height || CONFIG.CHOICE_GATE_HEIGHT
      }))
      .sort((a, b) => a.x - b.x);
    const merged = [];
    sorted.forEach((obs) => {
      const last = merged[merged.length - 1];
      if (last && obs.x <= last.x + last.width + 3) {
        const right = Math.max(last.x + last.width, obs.x + obs.width);
        last.width = right - last.x;
        last.height = Math.max(last.height, obs.height);
        return;
      }
      merged.push({ ...obs });
    });
    return merged;
  }

  collectFenceRows(segments) {
    if (!this.usePack()) return;
    const kit = this.ensureFenceKit();
    if (!kit) return;

    (segments || []).forEach((segment) => {
      const rows = new Map();
      (segment.obstacles || []).forEach((obs) => {
        if (!Number.isFinite(obs?.y)) return;
        const key = Math.round(obs.y / 12) * 12;
        if (!rows.has(key)) rows.set(key, { obstacles: [], paths: [] });
        rows.get(key).obstacles.push(obs);
      });
      (segment.paths || []).forEach((path) => {
        if (!Number.isFinite(path?.y)) return;
        const key = Math.round(path.y / 12) * 12;
        if (!rows.has(key)) rows.set(key, { obstacles: [], paths: [] });
        rows.get(key).paths.push(path);
      });

      const classScale = Number.isFinite(segment.visualObstacleScale)
        ? segment.visualObstacleScale
        : 1;
      const choice = this.isChoiceVisual(segment);

      rows.forEach((row) => {
        const spans = this.mergeFenceSpans(row.obstacles);
        if (!spans.length) return;
        const sample = spans[0];
        const vis = this.projectTrackRect(sample.x, sample.y, sample.width, sample.height);
        if (!vis) return;
        const h = this.catH() * (CONFIG.VISUAL.FENCE_NEAR_CAT ?? 0.98) * vis.uniformScale;
        const gateH = choice
          ? this.catH() * (CONFIG.VISUAL.CHOICE_GATEWAY_NEAR_CAT ?? 1.08) * vis.uniformScale
          : 0;
        if (this.spriteOffscreen(
          vis.roadCenter,
          vis.groundY,
          vis.roadWidth,
          Math.max(h, gateH)
        )) return;

        const prop = this.allocProp();
        prop.kind = 'fence-row';
        prop.role = 'planter';
        prop.spans = spans;
        prop.openings = (row.paths || []).slice();
        prop.choice = choice;
        prop.classScale = classScale;
        prop.screenY = vis.screenY;
        prop.groundY = vis.groundY;
        prop.worldY = vis.worldY;
        prop.x = vis.roadCenter;
        prop.w = vis.roadWidth;
        prop.h = Math.max(h, gateH);
        prop.alpha = 1;
        prop.scale = vis.s;
        prop.s = vis.s;
        prop.layer = ROLE_LAYER.planter;
      });
    });
  }

  fenceRowHeight(screenY) {
    const scale = this.worldDepthAt(screenY).scale;
    const nearCat = CONFIG.VISUAL.FENCE_NEAR_CAT ?? 0.98;
    return this.catH() * nearCat * scale;
  }

  gatewayRowHeight(screenY) {
    const scale = this.worldDepthAt(screenY).scale;
    const nearCat = CONFIG.VISUAL.CHOICE_GATEWAY_NEAR_CAT ?? 1.08;
    return this.catH() * nearCat * scale;
  }

  drawFenceRow(prop) {
    if (!prop || !prop.spans || !prop.spans.length) return;
    const kit = this.ensureFenceKit();
    if (!kit) return;
    const scale = Number.isFinite(prop.scale) ? prop.scale : 1;
    const h = this.catH() * (CONFIG.VISUAL.FENCE_NEAR_CAT ?? 0.98) * scale;
    const groundY = prop.groundY;
    const worldY = Number.isFinite(prop.worldY) ? prop.worldY : groundY;
    const road = this.roadAt(worldY);
    const choice = !!(prop.choice && prop.openings && prop.openings.length >= 2);
    const gateH = choice
      ? this.catH() * (CONFIG.VISUAL.CHOICE_GATEWAY_NEAR_CAT ?? 1.08) * scale
      : 0;
    const occH = Math.max(h, gateH);
    const occ = this.beginHorizonReveal(
      road.roadCenter,
      groundY,
      road.roadWidth,
      occH,
      road.roadLeft,
      road.roadRight
    );
    if (!occ) return;

    prop.spans.forEach((span) => {
      const x0 = Math.max(road.roadLeft, this.projectGameplayX(span.x, worldY));
      const x1 = Math.min(road.roadRight, this.projectGameplayX(span.x + span.width, worldY));
      if (!(x1 > x0)) return;
      if (occ.state === 'VISIBLE') {
        this.contactShadow((x0 + x1) / 2, groundY + 1, Math.max(16, x1 - x0), prop.screenY);
      }
      this.drawFenceSpan(kit, x0, x1, groundY, h, 1, span, worldY);
    });

    if (choice) {
      const gateKit = this.ensureGatewayKit();
      if (gateKit) {
        prop.openings.forEach((path) => {
          const left = Math.max(road.roadLeft, this.projectGameplayX(path.x, worldY));
          const right = Math.min(road.roadRight, this.projectGameplayX(path.x + path.width, worldY));
          this.drawGatewayFrame(gateKit, left, right, groundY, gateH, 1, 1);
        });
      }
    }
    this.endHorizonReveal(occ);
  }

  drawFenceSpan(kit, x0, x1, groundY, height, alpha, span, worldY) {
    const screenSpan = x1 - x0;
    if (screenSpan < 10 || height < 8) return;
    const postW = Math.max(6, height * (kit.post.sw / Math.max(1, kit.post.sh)));
    const top = groundY - height;
    this.blitModule(kit.image, kit.rail, x0 + postW * 0.42, top, Math.max(2, screenSpan - postW * 0.84), height, alpha);
    this.blitModule(kit.image, kit.post, x0, top, Math.min(postW, screenSpan * 0.42), height, alpha);
    this.blitModule(kit.image, kit.post, x1 - Math.min(postW, screenSpan * 0.42), top, Math.min(postW, screenSpan * 0.42), height, alpha);

    const worldW = Math.max(1, span?.width || 0);
    const bayWorld = this.catH() * (CONFIG.VISUAL.FENCE_BAY ?? 1.18);
    const extra = Math.max(0, Math.round(worldW / Math.max(8, bayWorld)) - 1);
    for (let i = 1; i <= extra; i += 1) {
      const worldX = (span?.x || 0) + (worldW * i) / (extra + 1);
      const px = this.projectGameplayX(worldX, worldY) - postW / 2;
      if (px + postW < x0 || px > x1) continue;
      this.blitModule(kit.image, kit.post, px, top, postW, height, alpha);
    }
  }

  drawGatewayFrame(kit, left, right, groundY, height, alpha, frameScale = 1) {
    const opening = right - left;
    if (opening < 8 || height < 8) return;
    const scale = Math.max(1, Number(frameScale) || 1);
    const postW = Math.max(7, height * (kit.leftPost.sw / Math.max(1, kit.leftPost.sh)) * scale);
    const overlap = postW * (CONFIG.VISUAL.CHOICE_GATEWAY_OVERLAP ?? 0.38) * (scale > 1 ? 1.12 : 1);
    const top = groundY - height;
    const leftX = left - overlap;
    const rightX = right + overlap - postW;
    this.blitModule(kit.image, kit.leftPost, leftX, top, postW, height, alpha);
    this.blitModule(kit.image, kit.rightPost, rightX, top, postW, height, alpha);
    const beamH = Math.max(8, height * (kit.beam.sh / Math.max(1, kit.leftPost.sh)));
    const beamX = leftX + postW * 0.55;
    const beamW = Math.max(8, rightX + postW * 0.45 - beamX);
    this.blitModule(kit.image, kit.beam, beamX, top, beamW, beamH, alpha);
  }

  collectObstacles(segments) {
    (segments || []).forEach((segment) => {
      const family = segment.visualObstacleType || this.obstacleFamilyFor(segment);
      const familySeed = segment.visualObstacleSeed || 1;
      const classScale = Number.isFinite(segment.visualObstacleScale)
        ? segment.visualObstacleScale
        : 1;
      const choice = segment.type === 'TWO_PATHS' || segment.type === 'DUAL_RISK' || !!segment.isChoiceSegment;
      (segment.obstacles || []).forEach((obs) => {
        const vis = this.projectTrackRect(obs.x, obs.y, obs.width, obs.height);
        if (!vis) return;
        if (this.spriteOffscreen(vis.x + vis.width / 2, vis.groundY, vis.width, vis.height)) return;
        const neighbors = choice
          ? (segment.paths || []).filter((path) => (
            Math.abs(path.y - obs.y) < 12
            && (
              Math.abs(obs.x + obs.width - path.x) < 2
              || Math.abs(obs.x - (path.x + path.width)) < 2
            )
          ))
          : [];
        const prop = this.allocProp();
        prop.kind = 'planter';
        prop.role = 'planter';
        prop.obs = obs;
        prop.neighbors = neighbors;
        prop.family = family;
        prop.familySeed = familySeed;
        prop.classScale = classScale;
        prop.screenY = vis.screenY;
        prop.groundY = vis.groundY;
        prop.x = vis.x + vis.width / 2;
        prop.layer = ROLE_LAYER.planter;
        prop.item = this.obstacleSpriteFor(segment);
      });
    });
  }

  collectCoins(segments) {
    (segments || []).forEach((segment) => {
      (segment.coins || []).forEach((coin) => {
        if (coin.collected) return;
        const vis = this.projectTrackRect(coin.x, coin.y, coin.width, coin.height);
        if (!vis) return;
        const coinH = Math.max(10, (CONFIG.VISUAL.COIN_DRAW_SIZE || 26) * vis.uniformScale);
        if (this.spriteOffscreen(vis.x + vis.width / 2, vis.groundY, coinH, coinH)) return;
        const prop = this.allocProp();
        prop.kind = 'coin';
        prop.role = 'coin';
        prop.coin = coin;
        prop.screenY = vis.screenY;
        prop.groundY = vis.groundY;
        prop.worldY = vis.worldY;
        prop.s = vis.s;
        prop.scale = vis.s;
        prop.x = vis.x + vis.width / 2;
        prop.layer = ROLE_LAYER.coin;
      });
    });
  }

  keepOffRoad(x, halfW, side, worldY, role = null) {
    const shift = this.lastShift || 0;
    const projected = this.roadAt(worldY);
    const t = projected.t;
    const large = role === 'tree' || role === 'sapling' || role === 'mass';
    const bound = large
      ? (side < 0
        ? this.hedgeOuterX(-1, worldY, shift, this.lastProgress)
        : this.hedgeOuterX(1, worldY, shift, this.lastProgress))
      : (side < 0
        ? this.hedgeInnerX(-1, worldY, shift, this.lastProgress)
        : this.hedgeInnerX(1, worldY, shift, this.lastProgress));
    const canopy = role === 'tree' || role === 'sapling'
      ? 0.52 + 0.12 * this.smoothstep((t - 0.4) / 0.3)
      : role === 'mass'
        ? 0.58
        : role === 'largeBush'
          ? 0.40
          : 0.20;
    const extra = large ? 12 * this.smoothstep((t - 0.4) / 0.3) : 0;
    const pad = Math.max(8, (halfW || 0) * canopy) + extra;
    if (side < 0) return Math.min(x, bound - pad);
    return Math.max(x, bound + pad);
  }

  collectSideGroups(camera) {
    const leftPeriod = this.usePack() ? 88 : 74;
    const rightPeriod = this.usePack() ? 102 : 86;
    this.collectSideGroupLane(camera, -1, leftPeriod);
    this.collectSideGroupLane(camera, 1, rightPeriod);
  }

  collectSideGroupLane(camera, side, period) {
    const cam = camera || dummyCamera();
    const horizon = this.horizonY();
    this.walkGameplay(cam, period, (slot, y) => {
      const projected = this.roadAt(y);
      if (projected.linearScreenY < horizon - 4) return;
      const besideMass = this.usePack()
        && this.sideMassItem(side)
        && this.nearSideMass(side, y, cam.progress || 0);
      const groundY = y + 18;
      const zone = besideMass ? 'C' : this.gardenZone(slot, side);
      const layout = GROUP_LAYOUTS[zone] || GROUP_LAYOUTS.D;
      layout.forEach((entry, index) => {
        const outerBias = entry.role === 'tree' || entry.role === 'sapling' ? 0.06 : 0;
        const u = LANE_U[entry.lane] + outerBias + (entry.ju || 0) + (hash01(slot + index + 3) - 0.5) * 0.04;
        const worldX = this.gardenWorldX(side, Math.max(0.04, Math.min(0.98, u)));
        this.collectPlant(entry.role, worldX, groundY + (entry.dy || 0), slot * 19 + index + side, side, false);
      });
    });
  }

  collectMidGarden(camera) {
    const cam = camera || dummyCamera();
    const horizon = this.horizonY();
    this.walkGameplay(cam, this.usePack() ? 44 : 38, (slot, y) => {
      const projected = this.roadAt(y);
      if (projected.linearScreenY < horizon - 2) return;
      const groundY = y + 10;
      [-1, 1].forEach((side) => {
        const roll = hash01(slot * 3.17 + side * 5.1);
        if (roll < 0.10) return;
        this.collectPlant('grass', this.gardenWorldX(side, 0.08 + hash01(slot + 2) * 0.10), groundY + 8, slot * 11 + side, side, false);
        if (roll > 0.62) {
          this.collectPlant('flower', this.gardenWorldX(side, 0.12 + hash01(slot + 4) * 0.10), groundY + 5, slot * 13 + side, side, false);
        }
        if (roll > 0.08) {
          this.collectPlant('smallBush', this.gardenWorldX(side, 0.22 + hash01(slot + 6) * 0.12), groundY + 3, slot * 17 + side, side, false);
        }
        if (roll > 0.40) {
          this.collectPlant('largeBush', this.gardenWorldX(side, 0.36 + hash01(slot + 7) * 0.16), groundY + 1, slot * 18 + side, side, false);
        }
        if (roll > 0.82) {
          this.collectPlant('sapling', this.gardenWorldX(side, 0.58 + hash01(slot + 8) * 0.16), groundY, slot * 19 + side, side, false);
        }
      });
    });
  }

  roadEdgeItem(kind, seed) {
    const ids = {
      bush: ['road-edge-bush-01', 'road-edge-bush-02'],
      grass: ['road-edge-grass-01'],
      flower: ['road-edge-flower-01']
    };
    const named = this.pickByIds('roadEdges', ids[kind] || [], seed);
    if (named && this.isReady(named)) return named;
    if (kind === 'bush') return this.pick('bushes', seed);
    if (kind === 'flower') return this.pick('flowers', seed);
    return this.pick('grass', seed);
  }

  collectRoadEdge(camera) {
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const progress = cam.progress || 0;
    const pack = this.usePack();
    const catH = this.catH();
    [-1, 1].forEach((side) => {
      this.walkGameplay(cam, pack ? 40 : 32, (slot, y) => {
        const projected = this.roadAt(y);
        if (projected.linearScreenY < this.horizonY() - 10) return;
        if (hash01(slot * 4.1 + side) < 0.38) return;
        const path = side < 0 ? projected.roadLeft : projected.roadRight;
        const inner = this.hedgeInnerX(side, y, shift, progress);
        const u = 0.28 + hash01(slot + 3) * 0.42;
        const x = path + (inner - path) * u;
        const roll = hash01(slot * 6.3 + side);
        let role = 'grass';
        let kind = 'grass';
        let h = pack ? catH * 0.13 * projected.scale : 10;
        if (roll > 0.88) {
          role = 'smallBush';
          kind = 'bush';
          h = pack ? catH * 0.32 * projected.scale : 14;
        } else if (roll > 0.74) {
          role = 'flower';
          kind = 'flower';
          h = pack ? catH * 0.18 * projected.scale : 11;
        }
        const item = this.roadEdgeItem(kind, slot * 9 + side);
        if (!item || !this.isReady(item)) return;
        const size = this.spriteSize(item, h);
        if (size.width < 3 || size.height < 3) return;
        const drawW = size.width * (role === 'smallBush' ? 0.82 : 1);
        const half = drawW * 0.5;
        // Keep road-edge foliage off the sand ribbon so near-scale bushes
        // do not fake an inward taper of the visible sand edge.
        const placedX = side < 0
          ? Math.min(x, path - half - 1)
          : Math.max(x, path + half + 1);
        const groundY = projected.drawY + (role === 'grass' ? 5 : 3);
        if (this.spriteOffscreen(placedX, groundY, drawW, size.height)) return;
        const prop = this.allocProp();
        prop.kind = 'sprite';
        prop.role = 'edge';
        prop.item = item;
        prop.x = placedX;
        prop.groundY = groundY;
        prop.screenY = projected.screenY;
        prop.worldY = y;
        prop.s = projected.s;
        prop.scale = projected.s;
        prop.w = drawW;
        prop.h = size.height;
        prop.alpha = 1;
        prop.flip = hash01(slot + 8) > 0.5;
        prop.layer = ROLE_LAYER.edge;
        prop.side = side;
      });
    });
  }

  collectUnderstory(camera) {
    const cam = camera || dummyCamera();
    this.walkGameplay(cam, this.usePack() ? 44 : 36, (slot, y) => {
      const projected = this.roadAt(y);
      if (projected.linearScreenY < this.horizonY() - 10) return;
      if (hash01(slot * 9.13) < 0.32) return;
      const side = hash01(slot + 2.4) > 0.5 ? 1 : -1;
      const groundY = y + 15;
      const lane = hash01(slot + 5) > 0.62 ? 'mid' : 'inner';
      const u = LANE_U[lane] + (hash01(slot + 8) - 0.5) * 0.05;
      const worldX = this.gardenWorldX(side, u);
      const roll = hash01(slot + 11);
      if (roll < 0.58) {
        this.collectPlant('grass', worldX, groundY + 7, slot, side, false);
      } else if (roll < 0.82) {
        this.collectPlant('flower', worldX, groundY + 5, slot + 4, side, false);
      } else if (lane !== 'inner') {
        this.collectPlant('smallBush', worldX, groundY + 3, slot + 8, side, false);
      } else {
        this.collectPlant('grass', worldX, groundY + 8, slot + 9, side, false);
      }
    });
  }

  collectPlant(role, xIn, groundY, seed, side) {
    const projected = this.projectWorldProp(xIn, groundY);
    const catH = this.catH();
    const pack = this.usePack();
    const vary = 0.98 + hash01(seed) * 0.04;
    let item = null;
    let h = 16;
    if (role === 'tree') {
      item = this.pick('trees', seed);
      const near = CONFIG.VISUAL.TREE_NEAR_CAT || 2.48;
      h = pack ? catH * near * projected.scale * vary : 86 * projected.scale;
    } else if (role === 'largeBush') {
      item = this.pick('bushes', seed);
      const near = CONFIG.VISUAL.BUSH_LARGE_CAT || 1.22;
      h = pack ? catH * near * projected.scale * vary : 46 * projected.scale;
    } else if (role === 'smallBush') {
      item = this.pick('bushes', seed + 3);
      const near = CONFIG.VISUAL.BUSH_SMALL_CAT || 0.78;
      h = pack ? catH * near * projected.scale * vary : 30 * projected.scale;
    } else if (role === 'flower') {
      item = this.pick('flowers', seed);
      h = pack ? catH * (0.20 + hash01(seed) * 0.04) * projected.scale : 16 * projected.scale;
    } else if (role === 'grass') {
      item = this.pick('grass', seed);
      h = pack ? catH * (0.14 + hash01(seed) * 0.04) * projected.scale : 14 * projected.scale;
    } else if (role === 'sapling') {
      item = this.pick('trees', seed);
      const near = CONFIG.VISUAL.SAPLING_CAT || 1.08;
      h = pack ? catH * near * projected.scale * vary : 42 * projected.scale;
    }
    if (!item || !this.isReady(item)) return;
    const size = this.spriteSize(item, h);
    const x = this.keepOffRoad(projected.screenX, size.width / 2, side, groundY, role);
    if (this.blocksChoiceGateway(role, x, groundY, size.width / 2, size.height)) return;
    if (this.spriteOffscreen(x, projected.groundY, size.width, size.height)) return;
    const prop = this.allocProp();
    prop.kind = 'sprite';
    prop.role = role;
    prop.item = item;
    prop.x = x;
    prop.groundY = projected.groundY;
    prop.screenY = projected.screenY;
    prop.worldY = groundY;
    prop.s = projected.s;
    prop.scale = projected.s;
    prop.w = size.width;
    prop.h = size.height;
    prop.alpha = 1;
    prop.flip = hash01(seed + 9) > 0.5;
    prop.layer = ROLE_LAYER[role] || 2;
    prop.side = side;
  }

  drawHedgeTuft(x, y, seed, side) {
    const radius = 16 + hash01(seed) * 7;
    this.ctx.fillStyle = this.c.ShadowDust;
    this.ctx.globalAlpha = 0.4;
    this.blob(x + 4, y + 5, radius, seed + 3, this.c.ShadowDust);
    this.ctx.globalAlpha = 1;
    this.blob(x, y, radius, seed, this.c.HedgeSage);
    this.blob(x + side * 8, y - 6, radius * 0.62, seed + 5, this.lawnDeep);
  }

  groundShadow(x, y, rx, ry) {
    const ctx = this.ctx;
    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(x + 3, y, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(x + 3, y, rx, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawPlanter(obs, neighbors = [], family = null, familySeed = 0, classScale = 1, lockedSprite = null) {
    const vis = this.projectTrackRect(obs.x, obs.y, obs.width, obs.height);
    if (!vis) return;
    const ctx = this.ctx;
    const lip = CONFIG.VISUAL.PLANTER_LIP;
    const seed = familySeed || Math.abs(Math.round(obs.x * 13 + obs.width * 7 + obs.height * 17));
    const left = neighbors.find((path) => Math.abs(obs.x - (path.x + path.width)) < 2);
    const right = neighbors.find((path) => Math.abs(obs.x + obs.width - path.x) < 2);
    const fill = this.planterFill(left, right);
    const radius = vis.width < 28 || vis.height < 22 ? 4 : 8;
    const mapped = LEGACY_FAMILY_MAP[family] || family || 'STANDING_PLANTER';
    const scaleClass = Number.isFinite(classScale) ? classScale : 1;
    const spec = PRODUCTION_CONSTRUCTIONS[mapped];
    let fit = null;
    let construction = null;
    if (spec && this.usePack()) {
      construction = this.readyConstructionSprite(mapped, lockedSprite);
      if (construction) fit = this.constructionFit(vis, construction, scaleClass, spec.nearCat);
    }
    const revealH = fit ? fit.h : vis.height;
    const revealW = fit ? fit.w : vis.width;
    const revealX = fit ? fit.x : vis.x + vis.width / 2;
    const occ = this.beginHorizonReveal(revealX, vis.groundY, revealW, revealH);
    if (!occ) return;

    ctx.save();
    ctx.globalAlpha = 1;

    if (fit && construction) {
      if (occ.state === 'VISIBLE') {
        this.contactShadow(fit.x, vis.groundY + 1, Math.max(12, fit.w * 0.72), vis.screenY);
      }
      this.drawConstructionSprite(vis, construction, spec.nearCat, scaleClass, fit);
      ctx.restore();
      this.endHorizonReveal(occ);
      return;
    }

    const sprite = lockedSprite || null;
    const useSprite = !!(sprite && this.isReady(sprite) && vis.width >= 8);

    if (occ.state === 'VISIBLE') {
      this.contactShadow(
        vis.x + vis.width / 2,
        vis.groundY + 1,
        Math.max(12, vis.width * 0.72),
        vis.screenY
      );
    }
    this.paintObstacleBed(vis, fill);

    if (useSprite) {
      this.drawPlanterSprite(vis, sprite, seed, mapped, scaleClass);
    } else if (!this.usePack()) {
      ctx.fillStyle = fill;
      this.irregularRectPath(vis.x, vis.y, vis.width, vis.height, seed, radius);
      ctx.fill();
      this.drawPlanterDetails(vis, seed, lip);
      this.drawPlanterPlants(vis, seed, left, right);
    }

    this.paintObstacleMaterial(vis, left, right);
    ctx.restore();
    this.endHorizonReveal(occ);
  }

  paintObstacleBed(vis, fill) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = vis.alpha * 0.22;
    ctx.fillStyle = this.c.ShadowDust;
    this.oval(vis.x + vis.width / 2 + 3, vis.groundY + 2, vis.width * 0.42, 4.5);
    ctx.globalAlpha = vis.alpha * 0.18;
    ctx.fillStyle = fill;
    this.roundedRectPath(
      vis.x + 2,
      vis.groundY - Math.max(6, vis.height * 0.22),
      vis.width - 4,
      Math.max(6, vis.height * 0.22),
      4
    );
    ctx.fill();
    ctx.restore();
  }

  paintObstacleMaterial(vis, left, right) {
    const type = (right || left)?.type;
    if (!type) return;
    const ctx = this.ctx;
    const wash = this.planterFill(left, right);
    const hard = type === 'RISKY_HARD';
    const risky = type === 'RISKY' || type === 'RISKY_EASY' || type === 'SHORT_RISKY';
    ctx.save();
    ctx.globalAlpha = vis.alpha * (hard ? 0.2 : risky ? 0.14 : 0.08);
    ctx.fillStyle = wash;
    this.roundedRectPath(
      vis.x + 1,
      vis.groundY - vis.height * 0.92,
      vis.width - 2,
      vis.height * 0.92,
      6
    );
    ctx.fill();
    ctx.restore();
  }

  constructionFit(vis, sprite, classScale = 1, nearCat = 0.7) {
    const src = this.sourceRect(sprite);
    const aspect = src.sw / Math.max(1, src.sh);
    const uniform = vis.uniformScale || vis.scaleZ || this.depthScale(vis.screenY);
    const drawH = this.catH() * nearCat * (Number.isFinite(classScale) ? classScale : 1) * uniform;
    let drawW = Math.max(8, drawH * aspect);
    const span = Math.max(8, vis.width);
    if (drawW > span) drawW = span;
    return {
      x: vis.x + span / 2,
      w: drawW,
      h: drawH,
      sx: src.sx,
      sy: src.sy,
      sw: src.sw,
      sh: src.sh
    };
  }

  gardenGateFit(vis, sprite, classScale = 1) {
    return this.constructionFit(vis, sprite, classScale, PRODUCTION_CONSTRUCTIONS.FLOWER_GATE.nearCat);
  }

  drawConstructionSprite(vis, sprite, nearCat = 0.7, classScale = 1, fit = null) {
    if (!this.isReady(sprite)) return;
    const placed = fit || this.constructionFit(vis, sprite, classScale, nearCat);
    this.ctx.drawImage(
      sprite.image,
      placed.sx,
      placed.sy,
      placed.sw,
      placed.sh,
      placed.x - placed.w / 2,
      vis.groundY - placed.h,
      placed.w,
      placed.h
    );
  }

  drawGardenGateSprite(vis, sprite, classScale = 1, fit = null) {
    this.drawConstructionSprite(
      vis,
      sprite,
      PRODUCTION_CONSTRUCTIONS.FLOWER_GATE.nearCat,
      classScale,
      fit
    );
  }

  drawPlanterSprite(vis, sprite, seed, family = 'STANDING_PLANTER', classScale = 1) {
    if (!this.isReady(sprite)) return;
    const ctx = this.ctx;
    const src = this.sourceRect(sprite);
    const aspect = src.sw / Math.max(1, src.sh);
    const catH = this.catH();
    const uniform = vis.uniformScale || vis.scaleZ || this.depthScale(vis.screenY);
    const mapped = LEGACY_FAMILY_MAP[family] || family;
    const nearH = mapped === 'FLOWER_GATE'
      ? catH * 0.78
      : mapped === 'GARDEN_FENCE'
        ? catH * 0.62
        : catH * 0.7;
    let tileH = nearH * (Number.isFinite(classScale) ? classScale : 1) * uniform;
    let drawW = Math.max(8, tileH * aspect);
    const span = Math.max(8, vis.width);
    if (drawW > span) {
      const fit = span / drawW;
      drawW *= fit;
      tileH *= fit;
    }
    const flip = hash01(seed + 3) > 0.5;

    ctx.save();
    ctx.translate(vis.x + span / 2, vis.groundY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(
      sprite.image,
      src.sx,
      src.sy,
      src.sw,
      src.sh,
      -drawW / 2,
      -tileH,
      drawW,
      tileH
    );
    ctx.restore();
  }

  drawPlanterDetails(vis, seed, lip) {
    const ctx = this.ctx;
    ctx.fillStyle = this.woodLight;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(vis.x + 3, vis.y + 2, Math.max(3, vis.width - 6), Math.min(lip + 1, vis.height * 0.28));
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.woodDeep;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(vis.x + 3, vis.y + vis.height - 6, Math.max(3, vis.width - 6), 4);
    ctx.globalAlpha = 1;
    if (vis.width <= 28 || vis.height <= 20) return;
    ctx.strokeStyle = this.woodDeep;
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = 2;
    const slats = vis.width > 70 ? 3 : 2;
    for (let i = 1; i <= slats; i += 1) {
      const sx = vis.x + (vis.width * i) / (slats + 1);
      ctx.beginPath();
      ctx.moveTo(sx, vis.y + 6);
      ctx.lineTo(sx + (hash01(seed + i) - 0.5) * 2, vis.y + vis.height - 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  planterFill(left, right) {
    const type = (right || left)?.type;
    if (type === 'RISKY_HARD') return this.woodHard;
    if (type === 'RISKY' || type === 'RISKY_EASY' || type === 'SHORT_RISKY') return this.woodRisk;
    if (type === 'SAFE') return this.woodSafe;
    return this.c.PlanterWood;
  }

  pathAccent(type) {
    if (type === 'RISKY_HARD') return this.hardEdge;
    if (type === 'RISKY' || type === 'RISKY_EASY' || type === 'SHORT_RISKY') return this.riskEdge;
    return this.safeEdge;
  }

  drawPlanterPlants(vis, seed, left, right) {
    if (vis.width < 24 || vis.height < 22) {
      if (vis.width >= 14 && vis.height >= 28) {
        this.blob(vis.x + vis.width / 2, vis.y + 4, 7, seed + 21, this.c.HedgeSage);
      }
      return;
    }
    const calm = (left?.type === 'SAFE') || (right?.type === 'SAFE') || (!left && !right);
    const count = calm ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      const px = vis.x + vis.width * (0.22 + i * (0.56 / Math.max(1, count - 1)));
      this.blob(px, vis.y + 3, calm ? 7 : 5.5, seed + 30 + i, calm ? this.lawnMid : mixHex(this.c.HedgeSage, this.c.RiskApricot, 0.2));
    }
  }

  drawSill(path, gateH, accent) {
    const vis = this.projectTrackRect(path.x, path.y, path.width, gateH);
    if (!vis) return;
    const revealH = this.catH() * (CONFIG.VISUAL.CHOICE_GATEWAY_NEAR_CAT ?? 1.08)
      * (vis.uniformScale || 1);
    if (!this.isWorldObjectFullyVisible(vis.x + vis.width / 2, vis.groundY, revealH)) return;
    const sill = Math.min(6, vis.height * 0.18);
    const painted = this.pathAccent(path.type);
    this.ctx.fillStyle = painted || accent;
    this.ctx.globalAlpha = path.type === 'SAFE' ? 0.32 : 0.4;
    this.roundedRectPath(vis.x + 2, vis.y + vis.height - sill, vis.width - 4, sill, 3);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  coinSprite(coin) {
    const list = this.sheets.coins || [];
    if (coin?.visualId) {
      const named = list.find((item) => item.id === coin.visualId);
      if (named) return named;
    }
    return this.pick('coins', coin?.visualSeed || 1);
  }

  drawCoin(coin) {
    if (coin.collected) return;
    const vis = this.projectTrackRect(coin.x, coin.y, coin.width, coin.height);
    if (!vis) return;
    const ctx = this.ctx;
    const scale = vis.uniformScale || vis.scaleZ || 1;
    const drawSize = CONFIG.VISUAL.COIN_DRAW_SIZE || 26;
    const size = Math.max(10, drawSize * scale);
    const bob = Math.sin((this.animTime || 0) * 3.1 + coin.x * 0.04) * (1.1 + scale * 0.6);
    const cx = vis.x + vis.width / 2;
    const groundY = vis.groundY;
    const occ = this.beginHorizonReveal(cx, groundY, size, size);
    if (!occ) return;

    if (occ.state === 'VISIBLE') this.contactShadow(cx, groundY, size * 0.7, vis.screenY);

    const sprite = this.coinSprite(coin);
    if (sprite && this.isReady(sprite)) {
      this.drawSprite(sprite, cx, groundY + bob, size, size, {
        grounded: true,
        alpha: 1
      });
      this.endHorizonReveal(occ);
      return;
    }

    const radius = size * 0.42;
    const cy = groundY - radius + bob;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.fillStyle = this.coinGold;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = this.coinRim;
    ctx.lineWidth = Math.max(1.6, radius * 0.2);
    ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = mixHex(this.c.CoinAmber, this.c.SkyPaper, 0.42);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.12, cy - radius * 0.08, radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.coinHi;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.28, cy - radius * 0.32, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = this.c.InkBrown;
    ctx.lineWidth = Math.max(1.8, CONFIG.VISUAL.OUTLINE_WIDTH - 1.5);
    ctx.stroke();
    ctx.restore();
    this.endHorizonReveal(occ);
  }
}
