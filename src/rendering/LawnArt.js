import { CONFIG } from '../config.js';

// Газон по бокам от изгороди, как на референсе: сплошной сочный GardenLawn без дымки,
// мягкие пятна потемнее и посветлее, мелкие пучки травы. Пятна и пучки
// привязаны к миру (едут вместе с дорогой) и уменьшаются по перспективе.

// Палитра из docs/visual-bible.md §6 (2026-09).
const LAWN = '#B4C05A'; // GardenLawn
const LAWN_SHADE = '#9EB455'; // LawnShade
const LAWN_LIGHT = '#BEC96A'; // LawnLight
const TUFT = '#94A74F'; // LawnTuft

function hash(n) {
  const x = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

export class LawnArt {
  constructor(art) {
    this.art = art;
    this.patches = [];
    this.tufts = [];
  }

  // Внешний край изгороди: газон виден только дальше него.
  hedgeOuter(p, side) {
    const h = CONFIG.VISUAL.HEDGE_WALL || {};
    const reach = (h.SHOULDER_NEAR ?? 8) + (h.CURB_NEAR ?? 12) + (h.WIDTH_NEAR ?? 74);
    const edge = side < 0 ? p.roadLeft : p.roadRight;
    return edge + side * reach * p.scale;
  }

  draw(camera) {
    const art = this.art;
    const ctx = art.ctx;
    const top = art.horizonY() - 2;
    ctx.save();
    ctx.fillStyle = LAWN;
    ctx.fillRect(0, top, art.width, art.height - top + 60);
    this.collect(camera?.progress || 0);
    this.drawPatches(ctx);
    this.drawTufts(ctx);
    ctx.restore();
  }

  collect(progress) {
    const art = this.art;
    const cfg = CONFIG.VISUAL.LAWN || {};
    const period = cfg.PATCH_PERIOD ?? 34;
    const patches = this.patches;
    const tufts = this.tufts;
    patches.length = 0;
    tufts.length = 0;
    const nearWorld = art.screenToWorldY(art.height + 80 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    let prevY = Infinity;
    for (let guard = 0; guard < 300; guard += 1, k -= 1) {
      const p = art.roadAt(k * period + progress);
      if (p.drawY < art.horizonY() + 4 || prevY - p.drawY < 1.2) break;
      prevY = p.drawY;
      const s = p.scale;
      for (const side of [-1, 1]) {
        const outer = this.hedgeOuter(p, side);
        const room = side < 0 ? outer : art.width - outer;
        if (room < 6) continue;
        const seed = k * 5.9 + side * 2.3;
        const x = outer + side * (8 * s + hash(seed) * room);
        if (hash(seed + 1) < (cfg.PATCH_CHANCE ?? 0.34)) {
          patches.push(x, p.drawY, (30 + hash(seed + 2) * 34) * s, (8 + hash(seed + 3) * 6) * s,
            hash(seed + 4) < 0.88 ? 0 : 1);
        }
        if (s > 0.5 && hash(seed + 5) < (cfg.TUFT_CHANCE ?? 0.8)) {
          const tx = outer + side * (6 * s + hash(seed + 6) * room);
          tufts.push(tx, p.drawY + hash(seed + 7) * period * 0.5 * s, 6 * s);
        }
      }
    }
  }

  drawPatches(ctx) {
    const p = this.patches;
    for (const light of [0, 1]) {
      ctx.fillStyle = light ? LAWN_LIGHT : LAWN_SHADE;
      ctx.beginPath();
      for (let i = 0; i < p.length; i += 5) {
        if (p[i + 4] !== light) continue;
        // Два наложенных овала дают неровную мягкую кляксу, а не «лужу».
        const rx = p[i + 2];
        const ry = p[i + 3];
        ctx.moveTo(p[i] + rx, p[i + 1]);
        ctx.ellipse(p[i], p[i + 1], rx, ry, 0, 0, Math.PI * 2);
        ctx.moveTo(p[i] + rx * 0.35 + rx * 0.6, p[i + 1] - ry * 0.55);
        ctx.ellipse(p[i] + rx * 0.35, p[i + 1] - ry * 0.55, rx * 0.6, ry * 0.9, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  // Пучок травы: три коротких листика веером.
  drawTufts(ctx) {
    const t = this.tufts;
    ctx.strokeStyle = TUFT;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < t.length; i += 3) {
      const x = t[i];
      const y = t[i + 1];
      const h = t[i + 2];
      ctx.moveTo(x - h * 0.45, y - h * 0.8);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - h);
      ctx.moveTo(x, y);
      ctx.lineTo(x + h * 0.45, y - h * 0.8);
    }
    ctx.stroke();
  }
}
