import { ArtPack } from './ArtPack.js';
import { HedgeArt } from './HedgeArt.js';
import { LawnArt } from './LawnArt.js';
import { SideDecorArt } from './SideDecorArt.js';
import { SkyArt } from './SkyArt.js';
import { SandArt } from './SandArt.js';
import { ObstacleArt, obstacleLook } from './ObstacleArt.js';
import { CONFIG } from '../config.js';
import { getGardenSheets } from './gardenAssets.js';
import { corridorHorizonY } from '../game/Corridor.js';
import {
  projectTrackX,
  projectWorldToScreen,
  sampleRoadRibbon,
  worldYForScreen,
  crestYAt as projectorCrestYAt,
  revealCrestYAt,
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

function dummyCamera() {
  return {
    progress: 0,
    y: 0,
    gameplayShift() { return 0; }
  };
}

function cloneSheets() {
  const source = getGardenSheets();
  const sheets = {};
  Object.keys(source).forEach((key) => {
    sheets[key] = source[key].map((item) => ({ ...item, image: null }));
  });
  return sheets;
}

const OBSTACLE_FAMILY_NAMES = ['FLOWER_GATE', 'STANDING_PLANTER', 'GARDEN_FENCE'];
const LEGACY_FAMILY_MAP = {
  FLOWER_PLANTER: 'FLOWER_GATE',
  WOOD_GATE: 'STANDING_PLANTER',
  GARDEN_BOX: 'GARDEN_FENCE'
};

const VIEW_CULL_MARGIN = 56;

// Порядок рисования в одном ряду: ящики и ворота, затем монеты поверх.
const ROLE_LAYER = { planter: 6, coin: 7 };

export class GardenArt {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.width = CONFIG.CANVAS_WIDTH;
    this.height = CONFIG.CANVAS_HEIGHT;
    this.onReady = options.onReady || null;
    const c = CONFIG.COLORS;
    this.c = c;
    this.artPack = new ArtPack(() => this.onReady?.());
    this.hedges = new HedgeArt(this);
    this.lawn = new LawnArt(this);
    this.sideDecor = new SideDecorArt(this);
    this.skyArt = new SkyArt(this.width, this.height);
    this.sandArt = new SandArt(this);
    this.obstacleArt = new ObstacleArt(ctx, this.artPack);
    this.sky = c.GardenSky;
    this.sandShade = mixHex(c.FloorSand, c.ShadowDust, 0.38);
    this.coinGold = mixHex(c.CoinAmber, c.CatGinger, 0.22);
    this.coinRim = mixHex(c.CoinAmber, c.InkBrown, 0.34);
    this.coinHi = mixHex(c.CoinAmber, c.SkyPaper, 0.48);
    this.pathSandFar = mixHex(c.FloorSand, c.SkyPaper, 0.14);
    this.worldPropPool = [];
    this.worldProps = [];
    this.worldPropCount = 0;
    this.riskEdge = mixHex(c.PlanterWood, c.RiskApricot, 0.46);
    this.hardEdge = mixHex(c.PlanterWood, c.HighRiskClay, 0.5);
    this.safeEdge = mixHex(c.PlanterWood, c.SafeLawn, 0.42);
    this.animTime = 0;
    this.lastShift = 0;
    this.lastProgress = 0;
    this.lastCamera = null;
    this.choiceClearance = [];
    this.sheets = cloneSheets();
    this.loadSprites();
  }

  // Из старых листов спрайтов нужны только монеты (всё остальное — art-pack).
  spriteGroupsToLoad() {
    return Object.keys(this.sheets).filter((group) => group === 'coins');
  }

  loadSprites() {
    if (typeof Image !== 'function' || typeof document === 'undefined') return;
    this.spriteGroupsToLoad().forEach((group) => {
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

  hudPill(x, y, w, h) {
    const ctx = this.ctx;
    const r = h / 2;
    ctx.fillStyle = this.c.ShadowDust;
    this.roundedRectPath(x + 2, y + 3, w, h, r);
    ctx.fill();
    ctx.fillStyle = this.c.SkyPaper;
    this.roundedRectPath(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = this.c.InkBrown;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  hudIconDisc(cx, cy, r, fill) {
    const ctx = this.ctx;
    ctx.fillStyle = this.c.ShadowDust;
    ctx.beginPath();
    ctx.arc(cx + 1, cy + 1.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.c.InkBrown;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  hudPawIcon(cx, cy, r) {
    const ctx = this.ctx;
    this.hudIconDisc(cx, cy, r, mixHex(this.c.FloorSand, this.c.SkyPaper, 0.3));
    ctx.fillStyle = this.c.InkBrown;
    this.oval(cx, cy + r * 0.2, r * 0.42, r * 0.34);
    this.oval(cx - r * 0.42, cy - r * 0.26, r * 0.19, r * 0.24);
    this.oval(cx - r * 0.02, cy - r * 0.48, r * 0.19, r * 0.24);
    this.oval(cx + r * 0.42, cy - r * 0.26, r * 0.19, r * 0.24);
  }

  hudCoinIcon(cx, cy, r) {
    const ctx = this.ctx;
    this.hudIconDisc(cx, cy, r, this.coinGold);
    ctx.strokeStyle = this.coinRim;
    ctx.lineWidth = Math.max(1.4, r * 0.22);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this.coinHi;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  hudStreakIcon(cx, cy, r, active) {
    const ctx = this.ctx;
    const bg = active ? this.c.CatGinger : mixHex(this.c.FloorSand, this.c.SkyPaper, 0.3);
    this.hudIconDisc(cx, cy, r, bg);
    ctx.fillStyle = active ? this.c.SkyPaper : this.c.InkBrown;
    this.oval(cx - r * 0.4, cy + r * 0.3, r * 0.15, r * 0.15);
    this.oval(cx, cy + r * 0.04, r * 0.19, r * 0.19);
    this.oval(cx + r * 0.42, cy - r * 0.32, r * 0.24, r * 0.24);
  }

  horizonY() {
    return corridorHorizonY();
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

  objectOcclusion(screenX, groundDrawY, spriteHeight) {
    return horizonOcclusion(
      screenX,
      groundDrawY + (this.lastShift || 0),
      spriteHeight,
      this.width
    );
  }

  isWorldObjectFullyVisible(screenX, groundDrawY, spriteHeight) {
    return this.objectOcclusion(screenX, groundDrawY, spriteHeight).state === 'VISIBLE';
  }

  beginHorizonReveal(x, groundDrawY, width, height) {
    const occ = this.objectOcclusion(x, groundDrawY, height);
    occ.clipped = false;
    if (occ.state === 'HIDDEN') return null;
    if (occ.state === 'PARTIAL') {
      // Fade objects in as they cross the horizon instead of clipping/lifting
      // them past an invisible hill — no painted crest exists to sell that
      // illusion, so a clip just reads as objects popping out of flat ground.
      this.ctx.save();
      this.ctx.globalAlpha *= occ.visibleRatio;
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

  drawScreenBackdrop(time = 0) {
    this.animTime = Number(time) || 0;
    const ctx = this.ctx;
    ctx.fillStyle = CONFIG.VISUAL.SKY?.COLOR || this.sky;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // Картинка неба (art-pack) и её зеркальная копия, когда загрузилась.
  skyStrip() {
    if (!this.artPack.has('sky-strip')) return null;
    if (!this._skyStrip) {
      this._skyStrip = { image: this.artPack.full('sky-strip'), mirror: this.artPack.full('sky-strip', true) };
    }
    return this._skyStrip;
  }

  drawFarWorld(camera) {
    const shift = typeof camera?.gameplayShift === 'function' ? camera.gameplayShift() : 0;
    this.skyArt.draw(this.ctx, this.horizonY(), shift, this.skyStrip());
    this.ctx.save();
    this.ctx.translate(0, shift);
    this.drawHorizonLandmark(shift);
    this.ctx.restore();
  }

  // Арка в розах на конце дорожки (ориентир, как на референсе).
  drawHorizonLandmark(shift = 0) {
    if (this.artPack.has('arch-wide-01')) this.drawPackArch(shift);
  }

  // Нарисованная арка (art-pack): основание на конце дорожки, столбы по краям
  // дорожки в этой точке. Если по высоте не помещается в небо — уменьшается целиком
  // (без искажения), чтобы верх не уходил за край экрана.
  drawPackArch(shift = 0) {
    const cfg = CONFIG.VISUAL.ROSE_ARCH || {};
    const pack = this.artPack;
    const horizon = this.horizonY();
    const farRoad = this.roadAt(worldYForScreen(horizon + shift + 1, shift, this.height));
    const aspect = pack.aspect('arch-wide-01');
    const maxH = Math.max(24, horizon + shift - (cfg.TOP_MARGIN ?? 6));
    const w = Math.min(farRoad.roadWidth / (cfg.PACK_POSTS_SPAN ?? 0.745), maxH / aspect);
    const h = w * aspect;
    pack.draw(this.ctx, 'arch-wide-01', this.width * 0.5 - w / 2, horizon + (cfg.BASE_SINK ?? 2) - h, w);
  }

  drawMainWorld(camera, segments = [], playerY = CONFIG.PLAYER_START_Y) {
    const cam = camera || dummyCamera();
    this.lastCamera = cam;
    this.lastShift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    this.lastProgress = cam.progress || 0;
    this.lawn.draw(cam);
    this.skyArt.drawLawnHaze(this.ctx, this.horizonY());
    this.drawPath(camera);
    this.hedges.draw(cam);
    // Деревья и мелочи газона рисуются ПОСЛЕ изгороди: ближний предмет перекрывает
    // изгородь за ним (кроны нависают над ней), но не заходит на песок.
    this.sideDecor.draw(cam);
    this.drawCrestLandform();
    this.collectAndDrawWorld(camera, segments, playerY);
    this.drawRevealCrestFeather();
  }

  resetWorldProps() {
    this.worldProps.length = 0;
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
    this.collectFenceRows(segments);
    this.collectCoins(segments);

    const props = this.worldProps;
    props.sort((a, b) => (
      a.screenY - b.screenY
      || a.layer - b.layer
      || a.x - b.x
    ));

    for (let i = 0; i < props.length; i += 1) this.drawWorldProp(props[i]);
  }


  drawWorldProp(prop) {
    if (!prop) return;
    if (prop.kind === 'coin') this.drawCoin(prop.coin);
    else if (prop.kind === 'fence-row') this.drawFenceRow(prop);
  }


  drawCrestLandform() {
    // Road-corridor sand continuity only — no full-width green mountain band.
    const ctx = this.ctx;
    const shift = this.lastShift || 0;
    const cx = this.width * 0.5;
    const farW = CONFIG.VISUAL.PROJECTOR?.FAR_ROAD_WIDTH || 120;
    const sand = parseHex(mixHex(this.c.FloorSand, this.c.ShadowDust, 0.18));
    const peak = projectorCrestYAt(cx, this.width) - shift;
    const half = farW * 0.72;
    const top = peak - 2;
    const bot = peak + 16;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.85, top);
    ctx.quadraticCurveTo(cx, top - 2, cx + half * 0.85, top);
    ctx.lineTo(cx + half, bot);
    ctx.quadraticCurveTo(cx, bot + 3, cx - half, bot);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const wash = ctx.createLinearGradient(0, top, 0, bot);
      wash.addColorStop(0, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0.14)`);
      wash.addColorStop(0.55, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0.08)`);
      wash.addColorStop(1, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0)`);
      ctx.fillStyle = wash;
    } else {
      ctx.fillStyle = this.sandShade;
      ctx.globalAlpha = 0.08;
    }
    ctx.fill();
    ctx.restore();
  }

  /**
   * Soft sand feather along the reveal crest — keep subtle so it does not
   * redraw a FAR/MAIN horizontal board on top of the shortened throat.
   */
  drawRevealCrestFeather() {
    const ctx = this.ctx;
    const shift = this.lastShift || 0;
    const cx = this.width * 0.5;
    const farW = CONFIG.VISUAL.PROJECTOR?.FAR_ROAD_WIDTH || 120;
    const peak = revealCrestYAt(cx, this.width) - shift;
    const half = farW * 0.78;
    const sand = parseHex(mixHex(this.c.FloorSand, this.c.ShadowDust, 0.18));
    const path = parseHex(mixHex(this.c.FloorSand, this.c.PlanterWood, 0.06));
    const top = peak - 3;
    const bot = peak + 12;
    const steps = 12;

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const x = cx - half + half * 2 * u;
      const y = revealCrestYAt(x, this.width) - shift
        - 1
        + Math.sin(u * Math.PI * 2.4) * 1.2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(cx + half, bot);
    ctx.quadraticCurveTo(cx, bot + 3, cx - half, bot);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const wash = ctx.createLinearGradient(0, top, 0, bot);
      wash.addColorStop(0, `rgba(${path.r}, ${path.g}, ${path.b}, 0)`);
      wash.addColorStop(0.35, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0.1)`);
      wash.addColorStop(0.65, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0.16)`);
      wash.addColorStop(1, `rgba(${sand.r}, ${sand.g}, ${sand.b}, 0)`);
      ctx.fillStyle = wash;
    } else {
      ctx.fillStyle = this.pathSandFar;
      ctx.globalAlpha = 0.12;
    }
    ctx.fill();
    ctx.restore();
  }

  // Добавляет в текущий путь контур дорожки (слева направо вниз и обратно).
  appendRoadRibbon(samples, outset = 0) {
    const ctx = this.ctx;
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
  }

  // Обрезка «всё, кроме дорожки»: после неё рисованное не заходит на песок.
  // Нужна деревьям и мелочам газона, которые нависают над изгородью.
  clipOutsideRoad() {
    const ctx = this.ctx;
    const samples = this.roadSamples;
    ctx.beginPath();
    ctx.rect(-300, -600, this.width + 600, this.height + 1600);
    if (samples && samples.length > 1) this.appendRoadRibbon(samples, 0);
    ctx.clip('evenodd');
  }

  drawPath(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const progress = cam.progress || 0;
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const samples = sampleRoadRibbon(shift, { height: this.height, pad: 56 });
    this.roadSamples = samples;
    if (samples.length < 2) return;

    const traceRibbon = (outset = 0) => {
      ctx.beginPath();
      this.appendRoadRibbon(samples, outset);
    };

    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.14;
    traceRibbon(3);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Светлый песок с мягкими пятнами (SandArt.js), только внутри дорожки.
    ctx.save();
    traceRibbon(0);
    ctx.clip();
    this.sandArt.draw(progress);
    ctx.restore();
  }

  isChoiceVisual(segment) {
    return segment?.type === 'TWO_PATHS'
      || segment?.type === 'DUAL_RISK'
      || !!segment?.isChoiceSegment;
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
      const look = obstacleLook(this.obstacleFamilyFor(segment));
      const lookSeed = Number(segment.visualObstacleSeed) || 1;

      rows.forEach((row) => {
        const spans = this.mergeFenceSpans(row.obstacles);
        if (!spans.length) return;
        const sample = spans[0];
        const vis = this.projectTrackRect(sample.x, sample.y, sample.width, sample.height);
        if (!vis) return;
        const h = this.obstacleArt.height(look, this.catH(), vis.uniformScale);
        // Keep rows alive behind the reveal crest (HIDDEN) so they can emerge
        // via occlusion instead of popping into existence when VISIBLE.
        if (this.spriteOffscreen(
          vis.roadCenter,
          vis.groundY,
          vis.roadWidth,
          h
        )) return;

        const prop = this.allocProp();
        prop.kind = 'fence-row';
        prop.segmentY = segment.y;
        prop.role = 'planter';
        prop.spans = spans;
        prop.openings = (row.paths || []).slice();
        prop.choice = choice;
        prop.look = look;
        prop.lookSeed = lookSeed;
        prop.classScale = classScale;
        prop.screenY = vis.screenY;
        prop.groundY = vis.groundY;
        prop.worldY = vis.worldY;
        prop.x = vis.roadCenter;
        prop.w = vis.roadWidth;
        prop.h = h;
        prop.alpha = 1;
        prop.scale = vis.s;
        prop.s = vis.s;
        prop.layer = ROLE_LAYER.planter;
      });
    });
  }

  // Ящики и ворота ряда (ObstacleArt.js): рисунок стоит ровно на ширине участка.
  drawFenceRow(prop) {
    if (!prop || !prop.spans || !prop.spans.length) return;
    const scale = Number.isFinite(prop.scale) ? prop.scale : 1;
    const h = this.obstacleArt.height(prop.look, this.catH(), scale);
    const groundY = prop.groundY;
    const worldY = Number.isFinite(prop.worldY) ? prop.worldY : groundY;
    const road = this.roadAt(worldY);
    const occ = this.beginHorizonReveal(road.roadCenter, groundY, road.roadWidth, h);
    if (!occ) return;
    // Лёгкое проявление там, где трасса создаёт новые препятствия (на ~2 участка
    // впереди): ящики и ворота не «выскакивают», а проступают. Только картинка.
    const spawnFade = this.spawnFadeAlpha(Number.isFinite(prop.segmentY) ? prop.segmentY : worldY);
    this.ctx.save();
    this.ctx.globalAlpha *= spawnFade;
    prop.spans.forEach((span) => {
      const x0 = Math.max(road.roadLeft, this.projectGameplayX(span.x, worldY));
      const x1 = Math.min(road.roadRight, this.projectGameplayX(span.x + span.width, worldY));
      if (!(x1 > x0)) return;
      if (occ.state === 'VISIBLE') {
        this.contactShadow((x0 + x1) / 2, groundY + 1, Math.max(16, x1 - x0), prop.screenY);
      }
      this.obstacleArt.drawSpan(prop.look, x0, x1, groundY, this.catH(), scale, prop.lookSeed + span.x * 0.37,
        road.roadLeft, road.roadRight);
    });
    this.ctx.restore();
    this.endHorizonReveal(occ);
  }

  // 0 → 1, пока новый участок трассы проезжает первые SPAWN_FADE px после появления.
  // Track добавляет участок, когда верх последнего опускается ниже −SEGMENT_HEIGHT,
  // поэтому новый участок появляется с верхом около −2 × SEGMENT_HEIGHT.
  spawnFadeAlpha(segmentY) {
    const appearY = -2 * CONFIG.SEGMENT_HEIGHT;
    const fade = CONFIG.VISUAL.GARDEN_OBSTACLES?.SPAWN_FADE ?? 420;
    return Math.max(0, Math.min(1, (segmentY - appearY) / fade));
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

  groundShadow(x, y, rx, ry) {
    const ctx = this.ctx;
    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = CONFIG.VISUAL.SHADOW_ALPHA ?? 0.5;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(x + 3, y, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(x + 3, y, rx, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }


  pathAccent(type) {
    if (type === 'RISKY_HARD') return this.hardEdge;
    if (type === 'RISKY' || type === 'RISKY_EASY' || type === 'SHORT_RISKY') return this.riskEdge;
    return this.safeEdge;
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
