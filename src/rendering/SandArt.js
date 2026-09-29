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
  }

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
    let prevY = Infinity;
    for (let guard = 0; guard < 300; guard += 1, k -= 1) {
      const p = art.roadAt(k * period + progress);
      if (p.drawY < art.horizonY() + 2 || prevY - p.drawY < 1.2) break;
      prevY = p.drawY;
      const s = p.scale;
      for (let n = 0; n < 2; n += 1) {
        const seed = k * 9.7 + n * 4.1;
        const u = (hash(seed) - 0.5) * 1.9;
        const x = p.roadCenter + u * p.roadWidth * 0.5;
        // Вдали пятна теснее на экране, поэтому их там реже.
        const thin = Math.max(0.3, Math.min(1, (s - 0.5) / 0.4));
        if (hash(seed + 1) < (cfg.SPOT_CHANCE ?? 0.55) * thin) {
          spots.push(x, p.drawY, (22 + hash(seed + 2) * 30) * s, (6 + hash(seed + 3) * 5) * s,
            hash(seed + 4) < 0.85 ? 0 : 1);
        }
        if (s > 0.6 && hash(seed + 5) < (cfg.PEBBLE_CHANCE ?? 0.35)) {
          const px = p.roadCenter + (hash(seed + 6) - 0.5) * 1.8 * p.roadWidth * 0.5;
          pebbles.push(px, p.drawY + hash(seed + 7) * period * 0.5 * s, (1.6 + hash(seed + 8) * 1.8) * s);
        }
      }
    }
  }

  // Пятно — два наложенных овала: мягкая неровная клякса, а не полоса.
  drawSpots(ctx) {
    const p = this.spots;
    for (const light of [0, 1]) {
      ctx.fillStyle = light ? SAND_LIGHT : SAND_SHADE;
      ctx.beginPath();
      for (let i = 0; i < p.length; i += 5) {
        if (p[i + 4] !== light) continue;
        const rx = p[i + 2];
        const ry = p[i + 3];
        ctx.moveTo(p[i] + rx, p[i + 1]);
        ctx.ellipse(p[i], p[i + 1], rx, ry, 0, 0, Math.PI * 2);
        ctx.moveTo(p[i] - rx * 0.3 + rx * 0.55, p[i + 1] + ry * 0.5);
        ctx.ellipse(p[i] - rx * 0.3, p[i + 1] + ry * 0.5, rx * 0.55, ry * 0.8, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
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
