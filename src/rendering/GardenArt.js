import { CONFIG } from '../config.js';
import { GARDEN_SHEETS } from './gardenAssets.js';

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
  const sheets = {};
  Object.keys(GARDEN_SHEETS).forEach((key) => {
    sheets[key] = GARDEN_SHEETS[key].map((item) => ({ ...item, image: null }));
  });
  return sheets;
}

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
    this.animTime = 0;
    this.lastShift = 0;
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
          if (typeof this.onReady === 'function') this.onReady();
        };
        image.src = item.url;
        item.image = image;
      });
    });
  }

  isReady(item) {
    return !!(item && item.image && item.image.complete && item.image.naturalWidth > 0);
  }

  pick(group, seed) {
    const list = (this.sheets[group] || []).filter((item) => this.isReady(item));
    if (!list.length) return null;
    return list[Math.floor(hash01(seed) * list.length) % list.length];
  }

  walkGameplay(camera, period, fn) {
    const cam = camera || dummyCamera();
    const progress = cam.progress || 0;
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const step = Math.max(8, period);
    const yMin = -Math.abs(shift) - step * 2;
    const yMax = this.height + Math.abs(shift) + step * 2;
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
    ctx.drawImage(
      item.image,
      item.sx,
      item.sy,
      item.sw,
      item.sh,
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
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = this.c.ShadowDust;
    this.roundedRectPath(x + 2, y + 3, w, h, radius);
    ctx.fill();
    ctx.globalAlpha = 0.62;
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
    return CONFIG.VISUAL.SKY_BAND;
  }

  smoothstep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  nearT(screenY) {
    const horizon = this.horizonY();
    return Math.max(0, Math.min(1, (screenY - horizon) / Math.max(1, this.height - horizon)));
  }

  depthEase(screenY) {
    return this.smoothstep(this.nearT(screenY));
  }

  depthScale(screenY) {
    return 0.52 + 0.56 * this.depthEase(screenY);
  }

  depthAlpha(screenY) {
    return 0.46 + 0.54 * this.depthEase(screenY);
  }

  pathInset(screenY) {
    const horizon = this.horizonY();
    const t = Math.max(0, Math.min(1, (screenY - horizon) / Math.max(1, this.height - horizon)));
    const farness = 1 - t;
    const eased = farness * farness * (0.22 + 0.78 * farness);
    const near = CONFIG.VISUAL.PATH_INSET_NEAR;
    const far = CONFIG.VISUAL.PATH_INSET_FAR;
    const above = Math.max(0, horizon - screenY);
    return near + eased * (far - near) + Math.min(18, above * 0.28);
  }

  pathLeftX(gameplayY, shift, progress) {
    const screenY = gameplayY + shift;
    return CONFIG.TRACK_LEFT + this.pathInset(screenY) + edgeWobble(gameplayY - progress, 1);
  }

  pathRightX(gameplayY, shift, progress) {
    const screenY = gameplayY + shift;
    return CONFIG.TRACK_RIGHT - this.pathInset(screenY) + edgeWobble(gameplayY - progress, 9);
  }

  projectedLaneX(side, lane, screenY) {
    const t = this.depthEase(screenY);
    const inset = this.pathInset(screenY);
    const edge = side < 0
      ? CONFIG.TRACK_LEFT + inset
      : CONFIG.TRACK_RIGHT - inset;
    const dist = lane === 'outer' ? 48 : lane === 'mid' ? 22 : 9;
    const spread = 0.46 + 0.54 * t;
    return edge + (side < 0 ? -1 : 1) * dist * spread;
  }

  contactShadow(x, groundY, width) {
    const ctx = this.ctx;
    const rx = Math.max(6, width * 0.26);
    const ry = 3.2;
    ctx.save();
    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.22;
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
    this.drawSky();
    this.drawClouds(this.animTime);
  }

  drawFarWorld(camera) {
    this.drawHorizonGarden(camera);
  }

  drawMainWorld(camera) {
    const cam = camera || dummyCamera();
    this.lastShift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    this.drawLawn(camera);
    this.drawPath(camera);
    this.drawPlayfieldPlants(camera);
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
    const progress = cam.progress || 0;
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const step = 20;
    const skyBand = this.horizonY();
    const y0 = skyBand - shift + 10;
    const y1 = this.height + Math.abs(shift) + 56;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, y0 + 10);
    for (let x = 0; x <= this.width; x += 36) {
      const wobble = Math.sin((x + progress) * 0.018) * 7 + Math.sin(x * 0.05) * 4;
      ctx.lineTo(x, y0 + wobble);
    }
    ctx.lineTo(this.width, y1);
    ctx.lineTo(0, y1);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = this.lawnBed;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let y = y0; y <= y1; y += step) {
      ctx.lineTo(this.pathLeftX(y, shift, progress) - 1, y);
    }
    ctx.lineTo(0, y1);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(this.width, y0);
    for (let y = y0; y <= y1; y += step) {
      ctx.lineTo(this.pathRightX(y, shift, progress) + 1, y);
    }
    ctx.lineTo(this.width, y1);
    ctx.closePath();
    ctx.fill();

    this.walkGameplay(cam, 92, (slot, y) => {
      const screenY = y + shift;
      if (screenY < skyBand - 8) return;
      const leftSpot = hash01(slot + 2) > 0.5;
      const edge = leftSpot
        ? this.pathLeftX(y, shift, progress)
        : this.pathRightX(y, shift, progress);
      const garden = leftSpot
        ? Math.max(18, edge - 8)
        : Math.max(18, this.width - edge - 8);
      const x = leftSpot
        ? 8 + hash01(slot) * garden
        : edge + 8 + hash01(slot + 3) * garden;
      ctx.globalAlpha = 0.16 + this.depthEase(screenY) * 0.16;
      ctx.fillStyle = hash01(slot + 5) > 0.5 ? this.lawnLight : this.lawnShade;
      this.oval(x, y + 14, 18 + hash01(slot + 6) * 16, 7 + hash01(slot + 7) * 4);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.lawnEdge;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let y = y0; y <= y1; y += step) {
      const x = this.pathLeftX(y, shift, progress);
      if (y === y0) ctx.moveTo(x - 18, y);
      else ctx.lineTo(x - 18 - edgeWobble(y - progress, 21) * 0.35, y);
    }
    for (let y = y1; y >= y0; y -= step) {
      ctx.lineTo(this.pathLeftX(y, shift, progress) + 1, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (let y = y0; y <= y1; y += step) {
      const x = this.pathRightX(y, shift, progress);
      if (y === y0) ctx.moveTo(x + 18, y);
      else ctx.lineTo(x + 18 + edgeWobble(y - progress, 27) * 0.35, y);
    }
    for (let y = y1; y >= y0; y -= step) {
      ctx.lineTo(this.pathRightX(y, shift, progress) - 1, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = this.c.ShadowDust;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    for (let y = y0; y <= y1; y += step) {
      const x = this.pathLeftX(y, shift, progress);
      if (y === y0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let y = y0; y <= y1; y += step) {
      const x = this.pathRightX(y, shift, progress);
      if (y === y0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.drawPathEdgeTufts(cam);
    ctx.restore();
  }

  drawPathEdgeTufts(camera) {
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const progress = cam.progress || 0;
    this.walkGameplay(cam, 38, (slot, y) => {
      const screenY = y + shift;
      if (screenY < this.horizonY() + 8 || hash01(slot + 4) < 0.38) return;
      const leftSide = hash01(slot) > 0.5;
      const edge = leftSide
        ? this.pathLeftX(y, shift, progress)
        : this.pathRightX(y, shift, progress);
      const x = edge + (leftSide ? -7 : 7);
      const grass = this.pick('grass', slot + 6);
      const scale = this.depthScale(screenY);
      if (grass) {
        const h = (14 + hash01(slot + 8) * 6) * scale;
        this.drawSprite(grass, x, y + 10, h * 0.72, h, {
          grounded: true,
          alpha: 0.55 + this.depthEase(screenY) * 0.28,
          flip: !leftSide
        });
        return;
      }
      this.ctx.globalAlpha = 0.4;
      this.blob(x, y + 4, 5 * scale, slot, this.c.HedgeSage);
      this.ctx.globalAlpha = 1;
    });
  }

  drawClouds(time) {
    const item = this.pick('clouds', 1);
    const skyLimit = this.horizonY() - 48;
    if (!item) {
      this.ctx.globalAlpha = 0.5;
      this.blob(64, 52, 34, 3, this.cloud);
      this.blob(this.width - 70, 78, 30, 8, this.cloud);
      this.blob(this.width * 0.46, 44, 26, 12, this.cloud);
      this.ctx.globalAlpha = 1;
      return;
    }
    const drift = (Number(time) || 0) * 1.15;
    const placements = [
      { seed: 4, y: 42, w: 210, side: -1 },
      { seed: 11, y: 72, w: 188, side: 1 },
      { seed: 19, y: 54, w: 176, side: -1 }
    ];
    placements.forEach((place) => {
      if (place.y > skyLimit) return;
      const cloud = this.pick('clouds', place.seed) || item;
      const h = Math.min(place.w * (cloud.sh / cloud.sw), skyLimit - 8);
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
    const ctx = this.ctx;
    const horizon = this.horizonY();
    const cam = camera || dummyCamera();

    ctx.save();
    ctx.fillStyle = this.horizonMist;
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.moveTo(0, horizon - 18);
    for (let x = 0; x <= this.width; x += 28) {
      const rise = Math.sin(x * 0.03) * 10 + Math.sin(x * 0.07 + 1.2) * 6;
      ctx.lineTo(x, horizon - 16 + rise);
    }
    ctx.lineTo(this.width, horizon + 18);
    ctx.lineTo(0, horizon + 18);
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
        const h = 44 + hash01(slot + 10) * 26;
        const w = h * (item.sw / item.sh) * 0.92;
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

  drawPath(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const progress = cam.progress || 0;
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const step = 16;
    const skyBand = this.horizonY();
    const vanishY = skyBand - shift - 32;
    const y1 = this.height + Math.abs(shift) + 56;

    const tracePath = (outset = 0) => {
      const leftV = this.pathLeftX(vanishY, shift, progress) - outset;
      const rightV = this.pathRightX(vanishY, shift, progress) + outset;
      const mid = (leftV + rightV) / 2;
      const tipY = vanishY - 14;
      ctx.beginPath();
      ctx.moveTo(this.pathLeftX(y1, shift, progress) - outset, y1);
      for (let y = y1; y >= vanishY; y -= step) {
        ctx.lineTo(this.pathLeftX(y, shift, progress) - outset, y);
      }
      ctx.quadraticCurveTo(leftV, tipY, mid, tipY);
      ctx.quadraticCurveTo(rightV, tipY, rightV, vanishY);
      for (let y = vanishY; y <= y1; y += step) {
        ctx.lineTo(this.pathRightX(y, shift, progress) + outset, y);
      }
      ctx.closePath();
    };

    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.22;
    tracePath(3);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.c.FloorSand;
    tracePath(0);
    ctx.fill();

    ctx.save();
    tracePath(0);
    ctx.clip();
    ctx.fillStyle = mixHex(this.c.FloorSand, this.horizonMist, 0.55);
    ctx.globalAlpha = 0.28;
    const midX = (CONFIG.TRACK_LEFT + CONFIG.TRACK_RIGHT) / 2;
    this.oval(midX, vanishY + 6, 88, 22);
    ctx.restore();

    this.drawSandGrain(cam);
  }

  drawSandGrain(camera) {
    const ctx = this.ctx;
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    const progress = cam.progress || 0;
    this.walkGameplay(cam, 64, (slot, y) => {
      const screenY = y + shift;
      if (screenY < this.horizonY() - 90) return;
      const left = this.pathLeftX(y, shift, progress) + 18;
      const right = this.pathRightX(y, shift, progress) - 18;
      if (right <= left) return;
      const near = this.depthEase(screenY);
      const x = left + hash01(slot) * (right - left);
      ctx.globalAlpha = 0.11 + near * 0.16;
      ctx.fillStyle = hash01(slot + 2) > 0.5 ? this.sandLight : this.sandShade;
      this.oval(x, y + 16, 14 + hash01(slot + 4) * 12, 5 + hash01(slot + 6) * 3);
      if (hash01(slot + 8) > 0.78) {
        ctx.globalAlpha = 0.16 + near * 0.12;
        ctx.fillStyle = mixHex(this.c.FloorSand, this.c.InkBrown, 0.18);
        this.oval(x + 6, y + 22, 2.4, 1.6);
        this.oval(x + 11, y + 23, 2.1, 1.4);
      }
      if (hash01(slot + 11) > 0.88) {
        ctx.globalAlpha = 0.1 + near * 0.08;
        ctx.fillStyle = this.sandShade;
        this.oval(x - 4, y + 28, 3.2, 1.8);
        this.oval(x + 3, y + 29, 3.2, 1.8);
      }
    });
    ctx.globalAlpha = 1;
  }

  drawPlayfieldPlants(camera) {
    this.drawSideGroups(camera, -1, 82);
    this.drawSideGroups(camera, 1, 96);
  }

  groupKind(slot, side) {
    const cycle = [0, 1, 2, 3, 0, 4, 1, 2, 0, 3];
    const offset = side < 0 ? 0 : 4;
    return cycle[Math.abs(slot + offset) % cycle.length];
  }

  clampPlantX(x, halfW, side, screenY) {
    const inset = this.pathInset(screenY);
    if (side < 0) return Math.min(x, CONFIG.TRACK_LEFT + inset - halfW - 6);
    return Math.max(x, CONFIG.TRACK_RIGHT - inset + halfW + 6);
  }

  plantOnGrass(role, x, groundY, screenY, seed, side) {
    const scale = this.depthScale(screenY);
    const alpha = this.depthAlpha(screenY);
    const flip = side > 0 || hash01(seed + 9) > 0.55;
    let item = null;
    let h = 16;
    if (role === 'tree') {
      item = this.pick('trees', seed);
      h = (100 + hash01(seed) * 12) * scale;
    } else if (role === 'largeBush') {
      item = this.pick('bushes', seed);
      h = (62 + hash01(seed) * 8) * scale;
    } else if (role === 'smallBush') {
      item = this.pick('bushes', seed + 3);
      h = (42 + hash01(seed) * 6) * scale;
    } else if (role === 'flower') {
      item = this.pick('flowers', seed);
      h = (22 + hash01(seed) * 6) * scale;
    } else if (role === 'grass') {
      item = this.pick('grass', seed);
      h = (20 + hash01(seed) * 5) * scale;
    } else if (role === 'planter') {
      item = this.pick('planters', seed);
      h = (26 + hash01(seed) * 6) * scale;
    }
    if (!item) {
      if (role === 'tree' || role === 'largeBush' || role === 'smallBush') {
        this.drawHedgeTuft(x, groundY - 10, seed, side);
      }
      return;
    }
    let w = h * (item.sw / item.sh);
    if (role === 'tree') w = Math.min(w, 88);
    if (role === 'largeBush') w = Math.min(w, 54);
    if (role === 'smallBush') w = Math.min(w, 38);
    if (role === 'planter') w = Math.min(w, 30);
    if (role === 'flower' || role === 'grass') w = Math.min(w, h * 0.78);
    const px = this.clampPlantX(x, w / 2, side, screenY);
    this.contactShadow(px, groundY, w);
    this.drawSprite(item, px, groundY, w, h, {
      grounded: true,
      alpha,
      flip,
      rotate: (hash01(seed + 4) - 0.5) * (role === 'tree' ? 0.04 : 0.1)
    });
  }

  drawSideGroups(camera, side, period) {
    const cam = camera || dummyCamera();
    const shift = typeof cam.gameplayShift === 'function' ? cam.gameplayShift() : 0;
    this.walkGameplay(cam, period, (slot, y) => {
      const screenY = y + shift;
      if (screenY < this.horizonY() - 4) return;
      if (hash01(slot + side * 13) < 0.1) return;
      const kind = this.groupKind(slot, side);
      const groundY = y + 18;
      const jitter = (hash01(slot + 8) - 0.5) * 8;
      const outer = this.projectedLaneX(side, 'outer', screenY) + jitter;
      const mid = this.projectedLaneX(side, 'mid', screenY) + jitter * 0.45;
      const inner = this.projectedLaneX(side, 'inner', screenY);

      if (kind === 0) {
        this.plantOnGrass('tree', outer, groundY, screenY, slot + 1, side);
        this.plantOnGrass('largeBush', mid, groundY + 2, screenY, slot + 2, side);
        this.plantOnGrass('grass', inner, groundY + 6, screenY, slot + 3, side);
      } else if (kind === 1) {
        this.plantOnGrass('largeBush', mid, groundY + 2, screenY, slot + 4, side);
        this.plantOnGrass('smallBush', inner, groundY + 3, screenY, slot + 5, side);
        this.plantOnGrass('flower', inner + side * 8, groundY + 4, screenY, slot + 6, side);
      } else if (kind === 2) {
        this.plantOnGrass('tree', outer, groundY - 2, screenY, slot + 7, side);
        this.plantOnGrass('smallBush', mid, groundY + 3, screenY, slot + 8, side);
        this.plantOnGrass('flower', inner, groundY + 5, screenY, slot + 9, side);
      } else if (kind === 3) {
        this.plantOnGrass('smallBush', inner, groundY + 2, screenY, slot + 11, side);
        this.plantOnGrass('planter', mid, groundY + 4, screenY, slot + 12, side);
        this.plantOnGrass('grass', outer, groundY + 6, screenY, slot + 13, side);
        this.plantOnGrass('flower', mid + side * 6, groundY + 5, screenY, slot + 14, side);
      } else {
        this.plantOnGrass('tree', outer, groundY, screenY, slot + 17, side);
        this.plantOnGrass('largeBush', inner, groundY + 2, screenY, slot + 15, side);
        this.plantOnGrass('grass', mid, groundY + 6, screenY, slot + 16, side);
      }
    });
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

  drawPlanter(obs, neighbors = []) {
    const ctx = this.ctx;
    const lip = CONFIG.VISUAL.PLANTER_LIP;
    const seed = Math.abs(Math.round(obs.x * 13 + obs.width * 7 + obs.height * 17));
    const left = neighbors.find((path) => Math.abs(obs.x - (path.x + path.width)) < 2);
    const right = neighbors.find((path) => Math.abs(obs.x + obs.width - path.x) < 2);
    const fill = this.planterFill(left, right);
    const radius = obs.width < 28 || obs.height < 22 ? 4 : 8;
    const sprite = this.pick('planters', seed);
    const useSprite = !!(sprite && obs.width >= 12 && obs.height >= 12);
    const screenY = obs.y + obs.height + (this.lastShift || 0);
    const fade = 0.7 + 0.3 * this.depthEase(screenY);

    ctx.save();
    ctx.globalAlpha = fade;

    this.contactShadow(
      obs.x + obs.width / 2,
      obs.y + obs.height - 1,
      Math.max(16, obs.width * 0.7)
    );

    if (useSprite) {
      this.drawPlanterSprite(obs, sprite, seed);
    } else {
      ctx.fillStyle = fill;
      this.irregularRectPath(obs.x, obs.y, obs.width, obs.height, seed, radius);
      ctx.fill();
      this.drawPlanterDetails(obs, seed, lip);
      const cap = this.pick('bushes', seed + 11) || this.pick('grass', seed + 12);
      if (cap && obs.width >= 18 && obs.height >= 16) {
        const capH = Math.min(32, Math.max(obs.height + 6, 20));
        const capW = Math.min(obs.width + 4, 34);
        this.drawSprite(cap, obs.x + obs.width / 2, obs.y + obs.height * 0.35, capW, capH, {
          flip: hash01(seed + 14) > 0.5
        });
      } else {
        this.drawPlanterPlants(obs, seed, left, right);
      }
    }

    neighbors.forEach((path) => {
      const accent = this.pathAccent(path.type);
      ctx.fillStyle = accent;
      if (Math.abs(obs.x + obs.width - path.x) < 2) {
        ctx.fillRect(obs.x + obs.width - 7, obs.y + 2, 7, obs.height - 4);
      }
      if (Math.abs(obs.x - (path.x + path.width)) < 2) {
        ctx.fillRect(obs.x, obs.y + 2, 7, obs.height - 4);
      }
    });
    ctx.restore();
  }

  drawPlanterSprite(obs, sprite, seed) {
    if (!this.isReady(sprite)) return;
    const ctx = this.ctx;
    const tiles = obs.width < 44 ? 1 : Math.max(1, Math.round(obs.width / 90));
    const tileW = obs.width / tiles;
    const destH = Math.max(obs.height / 0.58, obs.height + 18);
    const cy = obs.y + obs.height - destH * 0.32;
    for (let i = 0; i < tiles; i += 1) {
      const cx = obs.x + tileW * (i + 0.5);
      const thin = tileW < 48;
      ctx.save();
      ctx.translate(cx, cy);
      if (hash01(seed + i + 3) > 0.5) ctx.scale(-1, 1);
      if (thin) {
        ctx.drawImage(
          sprite.image,
          sprite.sx + sprite.sw * 0.3,
          sprite.sy,
          sprite.sw * 0.4,
          sprite.sh,
          -tileW * 0.58,
          -destH / 2,
          tileW * 1.16,
          destH
        );
      } else {
        ctx.drawImage(
          sprite.image,
          sprite.sx,
          sprite.sy,
          sprite.sw,
          sprite.sh,
          -tileW * 0.56,
          -destH / 2,
          tileW * 1.12,
          destH
        );
      }
      ctx.restore();
    }
  }

  drawPlanterDetails(obs, seed, lip) {
    const ctx = this.ctx;
    ctx.fillStyle = this.woodLight;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(obs.x + 3, obs.y + 2, Math.max(4, obs.width - 6), Math.min(lip + 1, obs.height * 0.28));
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.woodDeep;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(obs.x + 3, obs.y + obs.height - 7, Math.max(4, obs.width - 6), 5);
    ctx.globalAlpha = 1;
    if (obs.width <= 36 || obs.height <= 26) return;
    ctx.strokeStyle = this.woodDeep;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2;
    const slats = obs.width > 90 ? 3 : 2;
    for (let i = 1; i <= slats; i += 1) {
      const sx = obs.x + (obs.width * i) / (slats + 1);
      ctx.beginPath();
      ctx.moveTo(sx, obs.y + 8);
      ctx.lineTo(sx + (hash01(seed + i) - 0.5) * 2, obs.y + obs.height - 8);
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
    if (type === 'RISKY_HARD') return this.c.HighRiskClay;
    if (type === 'RISKY' || type === 'RISKY_EASY' || type === 'SHORT_RISKY') return this.c.RiskApricot;
    return this.c.SafeLawn;
  }

  drawPlanterPlants(obs, seed, left, right) {
    if (obs.width < 30 || obs.height < 28) {
      if (obs.width >= 18 && obs.height >= 36) {
        this.blob(obs.x + obs.width / 2, obs.y + 4, 9, seed + 21, this.c.HedgeSage);
      }
      return;
    }
    const calm = (left?.type === 'SAFE') || (right?.type === 'SAFE') || (!left && !right);
    const count = calm ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      const px = obs.x + obs.width * (0.22 + i * (0.56 / Math.max(1, count - 1)));
      this.blob(px, obs.y + 3, calm ? 8 : 6.5, seed + 30 + i, calm ? this.lawnMid : mixHex(this.c.HedgeSage, this.c.RiskApricot, 0.2));
    }
  }

  drawSill(path, gateH, accent) {
    const sill = Math.min(8, gateH);
    this.ctx.fillStyle = accent;
    this.ctx.globalAlpha = path.type === 'SAFE' ? 0.4 : 0.58;
    this.roundedRectPath(path.x + 2, path.y + gateH - sill, path.width - 4, sill, 3);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  drawCoin(coin) {
    if (coin.collected) return;
    const ctx = this.ctx;
    const radius = Math.min(coin.width, coin.height) / 2;
    const bob = Math.sin((this.animTime || 0) * 3.1 + coin.x * 0.04) * 1.8;
    const cx = coin.x + coin.width / 2;
    const cy = coin.y + coin.height / 2 + bob;
    const offset = CONFIG.VISUAL.SHADOW_OFFSET;

    ctx.save();
    ctx.fillStyle = this.c.ShadowDust;
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(cx + offset * 0.45, cy + radius * 0.62, radius * 0.78, radius * 0.28, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(cx + offset * 0.45, cy + radius * 0.55, radius * 0.7, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = this.coinGold;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = this.coinRim;
    ctx.lineWidth = Math.max(2, radius * 0.22);
    ctx.arc(cx, cy, radius * 0.78, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = this.coinHi;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.28, cy - radius * 0.32, radius * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(cx + radius * 0.18, cy + radius * 0.22, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = this.c.InkBrown;
    ctx.lineWidth = Math.max(2, CONFIG.VISUAL.OUTLINE_WIDTH - 1);
    ctx.stroke();
  }
}
