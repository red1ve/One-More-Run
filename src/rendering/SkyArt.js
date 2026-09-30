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

  // Холст перестраивается, только если изменился горизонт или догрузилась картинка неба.
  ensure(horizon, strip = null) {
    if (this.canvas && this.horizon === horizon && this.strip === strip) return this.canvas;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = Math.ceil(horizon + PAD * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const base = horizon + PAD;
    if (strip) {
      this.paintStrip(ctx, base, strip);
    } else {
      this.paintSky(ctx, base);
      this.paintClouds(ctx, base);
      this.paintTreeRow(ctx, base, TREE_FAR, null, 15, 0.88, 101);
      this.paintTreeRow(ctx, base + 2, TREE_NEAR, TREE_NEAR_LIGHT, 11, 0.86, 202);
      this.haze = LAWN_HAZE;
    }
    ctx.fillStyle = LAWN_HAZE;
    ctx.fillRect(0, base, this.width, canvas.height - base);
    this.canvas = canvas;
    this.horizon = horizon;
    this.strip = strip;
    return canvas;
  }

  // strip — картинка неба (assets/art-pack/sky/sky-strip.jpg) с её зеркальной копией.
  draw(ctx, horizon, shift = 0, strip = null) {
    const canvas = this.ensure(horizon, strip);
    if (!canvas) return false;
    ctx.drawImage(canvas, 0, shift - PAD);
    return true;
  }

  // Нарисованное небо: видна нижняя часть картинки (облака и деревья), её низ —
  // на горизонте. Картинка уже экрана, поэтому по бокам — зеркальные копии
  // (шов незаметен: край встречается сам с собой). Небо выше картинки —
  // цветом её верхнего края. Высота подобрана так, чтобы облака были ниже панелей счёта.
  paintStrip(ctx, base, strip) {
    const cfg = CONFIG.VISUAL.SKY || {};
    const h = cfg.STRIP_HEIGHT ?? 118;
    const w = strip.image.width * (h / strip.image.height);
    const top = base + (cfg.STRIP_SINK ?? 2) - h;
    const edge = this.sampleRow(strip.image, 1);
    this.haze = this.sampleRow(strip.image, strip.image.height - 2);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, this.width, top + 2);
    const x0 = (this.width - w) / 2;
    for (let k = -2; k <= 2; k += 1) {
      const x = x0 + k * w;
      if (x > this.width || x + w < 0) continue;
      ctx.drawImage(k % 2 === 0 ? strip.image : strip.mirror, x, top, w, h);
    }
  }

  // Средний цвет строки картинки: им небо продолжается вверх, а дымка ложится на газон.
  sampleRow(image, y) {
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 1;
    const pctx = probe.getContext('2d');
    pctx.drawImage(image, 0, y, image.width, 1, 0, 0, 32, 1);
    const d = pctx.getImageData(0, 0, 32, 1).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    return `rgb(${Math.round(r / 32)}, ${Math.round(g / 32)}, ${Math.round(b / 32)})`;
  }

  // Лёгкая дымка на газоне у горизонта: мягкий стык неба с землёй.
  // horizon — в координатах мира (холст уже сдвинут камерой).
  drawLawnHaze(ctx, horizon) {
    if (!this.strip || !this.haze) return;
    const depth = CONFIG.VISUAL.SKY?.LAWN_HAZE_DEPTH ?? 34;
    const y = horizon;
    const g = ctx.createLinearGradient(0, y, 0, y + depth);
    g.addColorStop(0, this.haze.replace('rgb', 'rgba').replace(')', ', 0.6)'));
    g.addColorStop(1, this.haze.replace('rgb', 'rgba').replace(')', ', 0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 1, this.width, depth + 1);
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
