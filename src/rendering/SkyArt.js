import { CONFIG } from '../config.js';

// Небо и дальний ряд деревьев, как на референсе: чистое голубое небо,
// белые облака и два ряда деревьев на горизонте (дальний в дымке, ближний
// темнее). Всё рисуется ОДИН раз в запасной холст и дальше только копируется,
// поэтому в каждом кадре это одна дешёвая команда drawImage.

// Палитра из docs/visual-bible.md §6 (2026-09).
const SKY = '#9CDCEC'; // GardenSky
const SKY_HAZE = '#B4E4EE'; // SkyHaze: небо у горизонта
const CLOUD = '#FBF8EA'; // CloudWhite
const CLOUD_SHADE = '#DCEEF0'; // CloudShade
const TREE_FAR = '#7DB38A'; // FarTree: HedgeSage в дымке неба
const TREE_NEAR = '#6A8D44'; // NearTree: HedgeSage к HedgeShade
const TREE_NEAR_LIGHT = '#76A544'; // HedgeSage
const LAWN_HAZE = '#B4C05A'; // газон у горизонта (как в LawnArt)

// Запас сверху и снизу, чтобы при сдвиге камеры не было щелей.
const PAD = 48;

function hash(n) {
  const x = Math.sin(n * 39.7 + 5.3) * 43758.5453;
  return x - Math.floor(x);
}

export class SkyArt {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = null;
    this.horizon = null;
  }

  // Холст перестраивается, только если изменился горизонт.
  ensure(horizon) {
    if (this.canvas && this.horizon === horizon) return this.canvas;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = Math.ceil(horizon + PAD * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const base = horizon + PAD;
    this.paintSky(ctx, base);
    this.paintClouds(ctx, base);
    this.paintTreeRow(ctx, base, TREE_FAR, null, 15, 0.88, 101);
    this.paintTreeRow(ctx, base + 2, TREE_NEAR, TREE_NEAR_LIGHT, 11, 0.86, 202);
    ctx.fillStyle = LAWN_HAZE;
    ctx.fillRect(0, base, this.width, canvas.height - base);
    this.canvas = canvas;
    this.horizon = horizon;
    return canvas;
  }

  draw(ctx, horizon, shift = 0) {
    const canvas = this.ensure(horizon);
    if (!canvas) return false;
    ctx.drawImage(canvas, 0, shift - PAD);
    return true;
  }

  paintSky(ctx, base) {
    const fill = ctx.createLinearGradient(0, 0, 0, base);
    fill.addColorStop(0, SKY);
    fill.addColorStop(0.55, SKY);
    fill.addColorStop(1, SKY_HAZE);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, this.width, base);
  }

  // Облако: несколько кругов с плоским низом и голубоватой тенью снизу.
  paintClouds(ctx, base) {
    const clouds = CONFIG.VISUAL.SKY?.CLOUDS || [[150, 0.3, 0.75], [60, 0.66, 0.85], [420, 0.62, 1]];
    for (const [cx, yT, size] of clouds) {
      const cy = PAD + (base - PAD) * yT;
      const w = 64 * size;
      const bottom = cy + 10 * size;
      const puffs = [[-0.55, 0.1, 0.34], [-0.2, -0.2, 0.46], [0.22, -0.1, 0.4], [0.55, 0.12, 0.3]];
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - w * 1.2, cy - w, w * 2.4, bottom - (cy - w));
      ctx.clip();
      for (const [color, dy] of [[CLOUD_SHADE, 3 * size], [CLOUD, 0]]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const [px, py, r] of puffs) {
          ctx.moveTo(cx + px * w + r * w, cy + py * w + dy);
          ctx.arc(cx + px * w, cy + py * w + dy, r * w, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Ряд деревьев: круглые кроны и изредка ели, стоят на линии горизонта.
  paintTreeRow(ctx, base, color, light, size, pineChance, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(0, base - 2, this.width, 4);
    let x = -10;
    let i = 0;
    const tops = [];
    while (x < this.width + 20) {
      const r = size * (0.8 + hash(seed + i) * 0.7);
      const pine = hash(seed + i * 2.7) > pineChance;
      const h = r * (pine ? 3.2 : 1.6 + hash(seed + i * 1.3) * 0.8);
      if (pine) {
        ctx.moveTo(x - r * 0.8, base);
        ctx.lineTo(x, base - h);
        ctx.lineTo(x + r * 0.8, base);
      } else {
        ctx.moveTo(x + r, base - h + r);
        ctx.arc(x, base - h + r, r, 0, Math.PI * 2);
        ctx.rect(x - r, base - h + r, r * 2, h - r);
        tops.push(x, base - h + r, r);
      }
      x += r * (1.1 + hash(seed + i * 3.1) * 0.6);
      i += 1;
    }
    ctx.fill();
    if (!light) return;
    // Блик сверху-слева на кронах ближнего ряда.
    ctx.fillStyle = light;
    ctx.beginPath();
    for (let k = 0; k < tops.length; k += 3) {
      const r = tops[k + 2] * 0.45;
      ctx.moveTo(tops[k] - tops[k + 2] * 0.3 + r, tops[k + 1] - tops[k + 2] * 0.3);
      ctx.arc(tops[k] - tops[k + 2] * 0.3, tops[k + 1] - tops[k + 2] * 0.3, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
