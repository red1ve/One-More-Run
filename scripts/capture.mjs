// Делает кадры игры (START, игра, Game Over) в окне 600×1067 и печатает ошибки консоли.
// Запуск: сначала `npm run dev` (порт 3000), затем
//   node scripts/capture.mjs <папка> [url]
// Нужен Playwright: в облачной сессии он уже установлен глобально,
// локально можно поставить `npm i -g playwright` (в проект он не добавляется).
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

const outDir = process.argv[2] || 'docs/reference/progress/tmp';
const url = process.argv[3] || 'http://localhost:3000/';
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 600, height: 1067 } });
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

async function shot(name) {
  const data = await page.evaluate(() => document.getElementById('game-canvas').toDataURL('image/png'));
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log('кадр', file);
}

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot('01-start');

await page.keyboard.press('Space');
await page.waitForTimeout(2500);
await shot('02-play');

// Игрок стоит на месте, пока не врежется: так получаем Game Over.
await page.waitForTimeout(Number(process.env.GAMEOVER_WAIT_MS || 20000));
await page.waitForTimeout(1200);
await shot('03-gameover');

await browser.close();
const unexpected = consoleErrors.filter((t) => !/sdk\.js|Failed to load resource/.test(t));
console.log(unexpected.length ? `Ошибки консоли:\n${unexpected.join('\n')}` : 'Ошибок консоли нет (кроме ожидаемого sdk.js).');
