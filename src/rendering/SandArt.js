import { CONFIG } from '../config.js';

// Песок дорожки как на референсе: светлый ровный FloorSand, мягкие пятна
// чуть темнее и чуть светлее и редкие камешки. Без полос текстуры.
// Пятна привязаны к миру (едут с дорогой) и уменьшаются по перспективе.
// Вызывается внутри уже обрезанной по дорожке области (clip).

// Палитра из docs/visual-bible.md §6 (2026-09).
const SAND = '#F7DCA0'; // FloorSand
const SAND_SHADE = '#EDCC8E'; // SandShade: мягкие пятна
const SAND_LIGHT = '#F9E2AE'; // SandLight
const PEBBLE = '#D9B77E'; // Pebble
// FarGround: FloorSand, смешанный с GardenLawn — далёкая земля у горизонта.
const FAR_GROUND = 'rgba(214, 205, 134, 1)';
const FAR_GROUND_MID = 'rgba(223, 210, 135, 0.55)';
const FAR_GROUND_CLEAR = 'rgba(247, 220, 160, 0)';

function hash(n) {
  const x = Math.sin(n * 63.1 + 29.9) * 43758.5453;
  return x - Math.floor(x);
}

export class SandArt {
  constructor(art) {
    this.art = art;
    this.spots = [];
    this.pebbles = [];
  }

  draw(progress) {
    const art = this.art;
    const ctx = art.ctx;
    ctx.fillStyle = SAND;
    ctx.fillRect(0, art.horizonY() - 60, art.width, art.height + 120);
    this.collect(progress);
    this.drawSpots(ctx);
    this.drawPebbles(ctx);
    this.drawFarFade(ctx);
  }

  // Последние px песка у горизонта плавно переходят в цвет далёкой земли —
  // без резкого обреза «как край стола».
  drawFarFade(ctx) {
    const art = this.art;
    const top = art.horizonY();
    const depth = CONFIG.VISUAL.SAND?.FAR_FADE ?? 36;
    const fade = ctx.createLinearGradient(0, top, 0, top + depth);
    fade.addColorStop(0, FAR_GROUND);
    fade.addColorStop(0.5, FAR_GROUND_MID);
    fade.addColorStop(1, FAR_GROUND_CLEAR);
    ctx.fillStyle = fade;
    ctx.fillRect(0, top - 2, art.width, depth + 2);
  }

  // Пятна и камешки привязаны к слотам мира (k) и зависят только от номера слота.
  // Размер — по глубине (у горизонта почти ноль), яркость — слабее вдали (три
  // ступени). Слишком мелкие не рисуются; так как размер по пути только растёт,
  // пятно не мигает и доходит до самого горизонта без резкой границы.
  collect(progress) {
    const art = this.art;
    const cfg = CONFIG.VISUAL.SAND || {};
    const period = cfg.SPOT_PERIOD ?? 46;
    const spots = this.spots;
    const pebbles = this.pebbles;
    spots.length = 0;
    pebbles.length = 0;
    const nearWorld = art.screenToWorldY(art.height + 80 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    for (let guard = 0; guard < 600; guard += 1, k -= 1) {
      const p = art.roadAt(k * period + progress);
      if (p.drawY < art.horizonY() + 1) break;
      const s = p.scale;
      const depth = p.t; // размер по глубине: у кота 1, у горизонта 0
      // Самое крупное пятно уже меньше 0.8 px — дальше только мельче.
      if (52 * depth < 0.8) break;
      const band = p.t > 0.45 ? 0 : p.t > 0.2 ? 1 : 2; // ступень яркости
      for (let n = 0; n < 2; n += 1) {
        const seed = k * 9.7 + n * 4.1;
        const u = (hash(seed) - 0.5) * 1.9;
        const x = p.roadCenter + u * p.roadWidth * 0.5;
        if (hash(seed + 1) < (cfg.SPOT_CHANCE ?? 0.55) && (22 + hash(seed + 2) * 30) * depth >= 0.8) {
          spots.push(x, p.drawY, (22 + hash(seed + 2) * 30) * depth, (6 + hash(seed + 3) * 5) * depth,
            (hash(seed + 4) < 0.85 ? 0 : 1) + band * 2);
        }
        if (hash(seed + 5) < (cfg.PEBBLE_CHANCE ?? 0.35) * (s > 0.6 ? 1 : 0.5)) {
          const px = p.roadCenter + (hash(seed + 6) - 0.5) * 1.8 * p.roadWidth * 0.5;
          pebbles.push(px, p.drawY + hash(seed + 7) * period * 0.5 * depth, Math.max(0.5, (1.6 + hash(seed + 8) * 1.8) * depth));
        }
      }
    }
  }

  // Пятно — два наложенных овала: мягкая неровная клякса, а не полоса.
  // Код пятна: светлое/тёмное + 2 × ступень яркости (0 — рядом, 2 — у горизонта).
  drawSpots(ctx) {
    const p = this.spots;
    for (let code = 0; code < 6; code += 1) {
      ctx.globalAlpha = [1, 0.7, 0.45][code >> 1];
      ctx.fillStyle = code & 1 ? SAND_LIGHT : SAND_SHADE;
      ctx.beginPath();
      for (let i = 0; i < p.length; i += 5) {
        if (p[i + 4] !== code) continue;
        const rx = p[i + 2];
        const ry = p[i + 3];
        ctx.moveTo(p[i] + rx, p[i + 1]);
        ctx.ellipse(p[i], p[i + 1], rx, ry, 0, 0, Math.PI * 2);
        ctx.moveTo(p[i] - rx * 0.3 + rx * 0.55, p[i + 1] + ry * 0.5);
        ctx.ellipse(p[i] - rx * 0.3, p[i + 1] + ry * 0.5, rx * 0.55, ry * 0.8, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPebbles(ctx) {
    const p = this.pebbles;
    ctx.fillStyle = PEBBLE;
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 3) {
      ctx.moveTo(p[i] + p[i + 2] * 1.3, p[i + 1]);
      ctx.ellipse(p[i], p[i + 1], p[i + 2] * 1.3, p[i + 2] * 0.8, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
