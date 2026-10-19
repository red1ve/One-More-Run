import { CONFIG } from '../config.js';

// Чёткость картинки на телефонах: холст игры всегда считается в «логических» 540 × 960 пикселях, а вот
// сколько настоящих пикселей ему дать — решает масштаб. Масштаб 1 — как раньше (540 × 960), 1.5 и 2 —
// в два раза чётче на телефонах с плотным экраном (всё рисуется тем же кодом, меняется только размер
// холста и преобразование в Game.render). Если телефон слабый и кадры проседают, масштаб сам падает
// (FrameGovernor) и запоминается: в следующий раз игра начнёт с него.

// Допустимые масштабы от большего к меньшему.
export const RENDER_SCALES = [2, 1.5, 1];

// Какой масштаб нужен, чтобы картинка была «пиксель в пиксель» на этом экране: ширина холста на экране в
// CSS-пикселях, умноженная на плотность экрана (devicePixelRatio), делённая на 540. Округляется до
// допустимого, не больше cap (настройка и то, что запомнила игра на слабом телефоне).
export function pickRenderScale({ cssWidth = CONFIG.CANVAS_WIDTH, devicePixelRatio = 1, cap = CONFIG.RENDER.MAX_SCALE } = {}) {
  const css = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : CONFIG.CANVAS_WIDTH;
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const needed = (css * ratio) / CONFIG.CANVAS_WIDTH;
  let scale = 1;
  if (needed >= 1.75) scale = 2;
  else if (needed >= 1.25) scale = 1.5;
  const limit = Number.isFinite(cap) && cap >= 1 ? cap : CONFIG.RENDER.MAX_SCALE;
  return Math.min(scale, RENDER_SCALES.find((value) => value <= limit) ?? 1);
}

// Следующий масштаб вниз (2 → 1.5 → 1 → 1).
export function lowerScale(scale) {
  return RENDER_SCALES.find((value) => value < scale) ?? 1;
}

// Следит за временем кадра в забеге. Медленный кадр (дольше SLOW_FRAME_MS) добавляет единицу, быстрый
// отнимает, поэтому одиночный провал (загрузка картинки, реклама) масштаб не роняет, а устойчивая
// медлительность — роняет. observe возвращает true, когда пора снизить масштаб.
export class FrameGovernor {
  constructor({ slowMs = CONFIG.RENDER.SLOW_FRAME_MS, limit = CONFIG.RENDER.SLOW_FRAMES } = {}) {
    this.slowMs = slowMs;
    this.limit = limit;
    this.score = 0;
  }

  observe(frameMs, active = true) {
    if (!active || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return false;
    this.score = frameMs > this.slowMs ? this.score + 1 : Math.max(0, this.score - 1);
    if (this.score < this.limit) return false;
    this.score = 0;
    return true;
  }

  reset() {
    this.score = 0;
  }
}
