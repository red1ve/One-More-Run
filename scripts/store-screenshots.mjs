// Честные скриншоты для каталога Яндекса: настоящий забег, кот ведётся «автопилотом»
// (смотрит только на препятствия в игровом мире), кадры снимаются как есть.
// Запуск: сначала `npm run dev` (порт 3000), затем
//   node scripts/store-screenshots.mjs docs/store/screenshots [seed]
// Телефон 1080×1920, десктоп 1920×1080; русский и английский; JPEG 0.92.
// Нужен Playwright (как для scripts/capture.mjs).
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

const { chromium } = await loadPlaywright();
const [,, outDir = 'docs/store/screenshots', seed = '11'] = process.argv; fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ args:['--no-sandbox'] });
const setups = [
  { name: 'phone', viewport: { width: 540, height: 960 }, scale: 2, times: [4, 11, 19, 28] },
  { name: 'desktop', viewport: { width: 1920, height: 1080 }, scale: 1, times: [7, 15, 24] }
];
for (const lang of ['ru', 'en']) for (const s of setups) {
  const ctx = await b.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('one_more_run_onboardingSeen','true'); localStorage.setItem('one_more_run_riskHintSeen','true'); } catch {} });
  await p.goto(`http://localhost:3000/?lang=${lang}&seed=${seed}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const g = window.__omrGame;
    const bot = () => {
      const pl = g.player; const top = pl.y - pl.height / 2; let rowY = -Infinity; const row = [];
      for (const seg of g.track.segments) for (const o of seg.obstacles) { const bt = o.y + o.height; if (bt > top || bt < top - 420) continue; if (bt > rowY + 1) { rowY = bt; row.length = 0; } if (Math.abs(bt - rowY) <= 1) row.push(o); }
      if (!row.length) return 0; row.sort((a, c) => a.x - c.x);
      const L = 70, R = 470; let best = null, from = L; // CONFIG.TRACK_LEFT / TRACK_RIGHT
      for (const o of [...row, { x: R, width: 0 }]) { const w = o.x - from; if (!best || w > best.w) best = { c: from + w / 2, w }; from = Math.max(from, o.x + o.width); }
      const dx = best.c - pl.x; return Math.abs(dx) > 8 ? Math.sign(dx) : 0;
    };
    g.keyboardInput.isLeftPressed = () => bot() < 0; g.keyboardInput.isRightPressed = () => bot() > 0;
  });
  await p.keyboard.press('Space');
  let last = 0;
  for (const t of s.times) {
    // Если кот врезался — новый забег (скриншот всегда с игрой, а не с экраном проигрыша).
    for (let w = 0; w < (t - last) * 4; w++) {
      await p.waitForTimeout(250);
      if (await p.evaluate(() => window.__omrGame.state === 'GAMEOVER' && !window.__omrGame.gameOverInputLocked())) await p.keyboard.press('Space');
    }
    last = t;
    const st = await p.evaluate(() => window.__omrGame.state);
    const file = `${outDir}/${lang}-${s.name}-${String(t).padStart(2, '0')}s.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 92 });
    console.log(file, st);
  }
  await ctx.close();
}
await b.close();
