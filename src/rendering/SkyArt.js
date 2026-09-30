import { CONFIG } from '../config.js';

// Небо с облаками и дальним лесом — картинка assets/art-pack/sky/sky-strip.jpg.
// Рисуется ОДИН раз в запасной холст и дальше только копируется, поэтому в каждом
// кадре это одна дешёвая команда drawImage. Пока картинка грузится — небо цветом.

const LAWN_HAZE = '#B4C05A'; // газон у горизонта (как в LawnArt)

// Запас сверху и снизу, чтобы при сдвиге камеры не было щелей.
const PAD = 48;

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
      ctx.fillStyle = CONFIG.VISUAL.SKY?.COLOR || '#9CDCEC';
      ctx.fillRect(0, 0, this.width, base);
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
}
