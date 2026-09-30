// Готовит картинки art-pack для игры: уменьшает до самого крупного размера на экране
// (с запасом) и сохраняет в assets/art-pack/game/ два варианта:
//   <имя>.webp — основной (в 5–10 раз меньше PNG);
//   <имя>.png  — запасной для браузеров без WebP (старые iPhone, iOS до 14); небо — .jpg.
// Оригиналы в assets/art-pack/ не меняются.
// Запуск (после замены или добавления картинок): node scripts/art-pack-game.mjs
// Нужен Playwright (он же для scripts/capture.mjs): в облачной сессии установлен
// глобально, локально — `npm i -g playwright` (в проект не добавляется).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return import(pathToFileURL(path.join(globalRoot, 'playwright', 'index.mjs')).href);
  }
}

const SRC = 'assets/art-pack';
const OUT = 'assets/art-pack/game';
const WEBP_QUALITY = 0.85;

// Исходный файл → длинная сторона в игре, px. Холст игры 540 px в ширину;
// размер взят с запасом к самому крупному появлению на экране (у кота).
const PLAN = {
  'arch/arch-wide-01.png': 256,
  'sky/sky-strip.jpg': 640
};
for (let n = 8; n <= 16; n += 1) PLAN[`hedge/hedge-${String(n).padStart(2, '0')}.png`] = 160;
for (let n = 1; n <= 4; n += 1) {
  PLAN[`trees/tree-0${n}.png`] = 384;
  PLAN[`planters/planter-0${n}.png`] = 256;
  PLAN[`props/bush-0${n}.png`] = 192;
}
for (let n = 1; n <= 3; n += 1) {
  PLAN[`gates/gate-0${n}.png`] = 256;
  PLAN[`props/rock-0${n}.png`] = 128;
}
PLAN['props/fence-01.png'] = 192;
PLAN['props/fence-02.png'] = 192;
PLAN['props/grass-01.png'] = 128;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
fs.mkdirSync(OUT, { recursive: true });

let before = 0;
let webpTotal = 0;
let fallbackTotal = 0;
for (const [file, maxSide] of Object.entries(PLAN)) {
  const data = fs.readFileSync(path.join(SRC, file));
  before += data.length;
  const jpg = file.endsWith('.jpg');
  const result = await page.evaluate(async ({ b64, maxSide, jpg, quality }) => {
    const img = new Image();
    img.src = `data:image/${jpg ? 'jpeg' : 'png'};base64,${b64}`;
    await img.decode();
    let canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    // Уменьшаем по шагам в 2 раза — картинка остаётся чёткой.
    while (canvas.width / 2 >= w) {
      const next = document.createElement('canvas');
      next.width = Math.round(canvas.width / 2);
      next.height = Math.round(canvas.height / 2);
      const ctx = next.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, next.width, next.height);
      canvas = next;
    }
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h);
    return {
      webp: out.toDataURL('image/webp', quality),
      fallback: out.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.85)
    };
  }, { b64: data.toString('base64'), maxSide, jpg, quality: WEBP_QUALITY });
  const name = path.basename(file).replace(/\.\w+$/, '');
  const webp = Buffer.from(result.webp.split(',')[1], 'base64');
  const fallback = Buffer.from(result.fallback.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, `${name}.webp`), webp);
  fs.writeFileSync(path.join(OUT, `${name}.${jpg ? 'jpg' : 'png'}`), fallback);
  webpTotal += webp.length;
  fallbackTotal += fallback.length;
}
await browser.close();

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} МБ`;
console.log(`Картинок: ${Object.keys(PLAN).length}. Оригиналы: ${mb(before)}.`);
console.log(`Для игры: WebP ${mb(webpTotal)}, запасные PNG/JPG ${mb(fallbackTotal)} (${OUT}/).`);
