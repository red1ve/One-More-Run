// Фаза 1м: скины кота Loaf (шаг 6а, прототип). Перекраска кадров бега в тексте SVG (SkinArt.js).
//  (а) разбор кадров: у каждого из 4 кадров находятся силуэт, хвост, лапы, уши;
//  (б) каждый скин даёт на каждом кадре правильный SVG, контур не меняется, форма та же;
//  (в) цвета по правилам visual-bible §3 (естественные коричнево-рыжие, без чёрного и белого,
//      тёмный скин отличается по яркости от контура);
//  (г) скины различаются между собой; хвост красится одинаково на всех кадрах (нет мигания на бегу);
//  (д) накладки (пятна, лента) лежат на коте и у корня хвоста на всех кадрах;
//  (е) Renderer.setSkin: подмена кадров, возврат к обычному, гонка запросов, ошибка загрузки.
// Запуск: node scripts/phase1m-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { SKINS, mix, readPaths, roleOf, skinSvg } from '../src/rendering/SkinArt.js';
import { Renderer } from '../src/rendering/Renderer.js';

const results = [];
function check(name, fn) {
  try {
    const outcome = fn();
    if (outcome && typeof outcome.then === 'function') {
      return outcome.then(
        () => results.push(`OK  ${name}`),
        (error) => results.push(`FAIL ${name}: ${error.message}`)
      );
    }
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
  return undefined;
}
function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

const FRAMES = [1, 2, 3, 4].map((n) => readFileSync(new URL(`../assets/characters/run/loaf-run-0${n}.svg`, import.meta.url), 'utf8'));
const OUTLINE = '#57271c';

function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

// Все цвета, которые скин вносит в рисунок (роли, части, пятна).
function skinColors(skin) {
  const list = [];
  Object.values(skin.colors || {}).forEach((c) => list.push(c));
  Object.values(skin.parts || {}).forEach((part) => Object.values(part).forEach((c) => list.push(c)));
  (skin.patches || []).forEach((p) => list.push(p.color));
  return list;
}

// ---- (а) разбор кадров

check('frames: silhouette, tail, feet and ears are found in all four run frames', () => {
  FRAMES.forEach((svg, i) => {
    const paths = readPaths(svg);
    assert(paths.length > 120, `frame ${i + 1}: only ${paths.length} paths`);
    assert(paths.filter((p) => p.part === 'whole' && p.role === 'body').length === 1, `frame ${i + 1}: expected one cream silhouette`);
    const tail = paths.filter((p) => p.part === 'tail');
    assert(tail.length >= 4, `frame ${i + 1}: the tail has ${tail.length} paths`);
    const tailBody = tail.find((p) => p.role === 'body');
    assert(tailBody && tailBody.box.area > 12000, `frame ${i + 1}: no big tail body`);
    // Хвост у корня стоит у крупа, в нижней трети кота.
    assert(tailBody.box.cy > 600 && tailBody.box.cy < 800, `frame ${i + 1}: tail body centre y ${tailBody.box.cy.toFixed(0)}`);
    assert(paths.filter((p) => p.part === 'ear').length >= 2, `frame ${i + 1}: ears not found`);
    assert(paths.filter((p) => p.part === 'foot').length >= 4, `frame ${i + 1}: feet not found`);
    assert(paths.filter((p) => p.part === 'head' && p.role === 'stripe').length >= 2, `frame ${i + 1}: forehead stripes not found`);
  });
});

check('frames: role of a fill by colour (cream, shade, stripe, pad, outline)', () => {
  assert(roleOf('#eedac6') === 'body' && roleOf('#ceaa95') === 'shade', 'body / shade');
  assert(roleOf('#d8a582') === 'stripe' && roleOf('#bc825f') === 'tan', 'stripe / tan');
  assert(roleOf('#9d5a4f') === 'pad' && roleOf('#57271c') === 'outline', 'pad / outline');
});

// ---- (б) каждый скин на каждом кадре

check('skins: the list has the 8 agreed skins, classic first and unchanged', () => {
  assert(SKINS.map((s) => s.id).join() === 'classic,ginger,tuxedo,calico,siamese,honey,snow,ribbon', `ids: ${SKINS.map((s) => s.id)}`);
  assert(new Set(SKINS.map((s) => s.id)).size === SKINS.length, 'duplicate ids');
  FRAMES.forEach((svg) => assert(skinSvg(svg, 'classic') === svg, 'classic must return the frame untouched'));
  assert(skinSvg(FRAMES[0], 'no-such-skin') === FRAMES[0], 'an unknown skin must return the frame untouched');
});

check('skins: every skin gives a well-formed SVG on every frame; the outline and the shapes do not change', () => {
  for (const skin of SKINS) {
    FRAMES.forEach((svg, i) => {
      const out = skinSvg(svg, skin.id);
      const label = `${skin.id}, frame ${i + 1}`;
      assert(out.startsWith('<?xml') && out.trimEnd().endsWith('</svg>'), `${label}: broken start or end`);
      assert(out.split('<g').length === out.split('</g>').length, `${label}: unbalanced <g>`);
      assert(out.split('<clipPath').length === out.split('</clipPath>').length, `${label}: unbalanced <clipPath>`);
      const before = readPaths(svg);
      const after = readPaths(out);
      // Накладки (лента) дописывают свои контуры в конец; исходные остаются на своих местах.
      assert(after.length >= before.length && (skin.extra || after.length === before.length), `${label}: the number of paths changed (${before.length} → ${after.length})`);
      before.forEach((p, k) => {
        assert(after[k].d === p.d && after[k].attrs.replace(/fill="[^"]*"/, '') === p.attrs.replace(/fill="[^"]*"/, ''), `${label}: path ${k} changed its shape`);
        if (p.role === 'outline' || p.role === 'other') assert(after[k].fill === p.fill, `${label}: outline path ${k} changed colour`);
      });
      // Каждый path остаётся с шестизначным цветом.
      assert(after.every((p) => /^#[0-9a-f]{6}$/.test(p.fill)), `${label}: a fill is not a hex colour`);
    });
  }
});

// ---- (в) цвета

check('colours: natural cat colours only — no black, no white, no neon, hues brown to ginger', () => {
  for (const skin of SKINS) {
    for (const color of skinColors(skin)) {
      assert(/^#[0-9a-fA-F]{6}$/.test(color), `${skin.id}: ${color} is not a hex colour`);
      const { h, s, l } = hsl(color);
      assert(l > 0.18 && l < 0.97, `${skin.id}: ${color} is too dark or too light (L ${l.toFixed(2)})`);
      assert(s <= 0.8, `${skin.id}: ${color} is too saturated (S ${s.toFixed(2)})`);
      assert(h < 60 || h > 335 || s < 0.12, `${skin.id}: ${color} has an unnatural hue (${h.toFixed(0)}°)`);
    }
  }
  assert(mix('#000000', '#ffffff', 0.5) === '#808080', 'mix() must blend channels');
});

check('colours: a dark coat stays separated from the outline by brightness', () => {
  const outline = hsl(OUTLINE).l;
  for (const skin of SKINS) {
    const all = [skin.colors?.body, ...Object.values(skin.parts || {}).map((p) => p.body)].filter(Boolean);
    for (const color of all) {
      const l = hsl(color).l;
      assert(Math.abs(l - outline) >= 0.05, `${skin.id}: coat ${color} (L ${l.toFixed(2)}) is too close to the outline (L ${outline.toFixed(2)})`);
    }
  }
});

// ---- (г) различия и мигание

check('skins: all skins look different from each other and from the default cat', () => {
  const seen = new Map();
  for (const skin of SKINS) {
    const out = skinSvg(FRAMES[0], skin.id);
    assert(!seen.has(out), `${skin.id} is the same picture as ${seen.get(out)}`);
    seen.set(out, skin.id);
  }
});

check('skins: the tail is painted the same way on all four frames (no flicker while running)', () => {
  for (const skin of SKINS.filter((s) => s.parts?.tail || s.colors)) {
    // part и role считаются по исходному кадру; цвет тела хвоста в готовом SVG — тот же на всех кадрах.
    const original = FRAMES.map((svg) => readPaths(svg).find((p) => p.part === 'tail' && p.role === 'body'));
    original.forEach((p, i) => assert(p, `frame ${i + 1}: no tail body`));
    const expected = skin.parts?.tail?.body || skin.colors?.body;
    if (!expected) continue;
    FRAMES.forEach((svg, i) => {
      const out = readPaths(skinSvg(svg, skin.id));
      const index = readPaths(svg).findIndex((p) => p.part === 'tail' && p.role === 'body');
      const lift = hsl(out[index].fill).l - hsl(expected).l;
      assert(Math.abs(lift) <= 0.07, `${skin.id}, frame ${i + 1}: the tail body is ${out[index].fill}, expected about ${expected}`);
    });
  }
});

// ---- (д) накладки

check('overlays: patches lie on the cat; the ribbon sits at the tail root on every frame', () => {
  const calico = SKINS.find((s) => s.id === 'calico');
  assert(calico.patches.length >= 5, 'calico needs several patches');
  for (const p of calico.patches) {
    assert(p.cx > 380 && p.cx < 660 && p.cy > 110 && p.cy < 800, `a patch is off the cat: ${p.cx}, ${p.cy}`);
  }
  const out = skinSvg(FRAMES[0], 'calico');
  assert(out.includes('<clipPath id="omr-skin-clip">') && out.includes('clip-path="url(#omr-skin-clip)"'), 'patches must be clipped to the body');
  assert(out.includes('mix-blend-mode:multiply'), 'patches must multiply over the coat so the outline and stripes stay');
  FRAMES.forEach((svg, i) => {
    const ribbon = skinSvg(svg, 'ribbon');
    assert(ribbon.includes('<circle cx="548" cy="604"'), `frame ${i + 1}: no ribbon`);
    const tail = readPaths(svg).find((p) => p.part === 'tail' && p.role === 'body').box;
    const left = tail.cx - tail.w / 2 - 30;
    const right = tail.cx + tail.w / 2 + 30;
    const top = tail.cy - tail.h / 2 - 30;
    const bottom = tail.cy + tail.h / 2 + 30;
    assert(548 > left && 548 < right && 604 > top && 604 < bottom, `frame ${i + 1}: the ribbon (548, 604) is not on the tail box ${left.toFixed(0)}…${right.toFixed(0)} × ${top.toFixed(0)}…${bottom.toFixed(0)}`);
  });
});

// ---- (е) Renderer.setSkin

function stubBrowser() {
  const saved = { Image: globalThis.Image, fetch: globalThis.fetch, revoke: URL.revokeObjectURL, create: URL.createObjectURL };
  const log = { fetches: [], revoked: [], created: [] };
  globalThis.Image = class {
    set src(value) {
      this.currentSrc = value;
      queueMicrotask(() => (this.failing ? this.onerror?.(new Error('x')) : this.onload?.()));
    }
  };
  globalThis.fetch = async (url) => {
    log.fetches.push(String(url));
    if (log.failFetch) throw new Error('offline');
    const sit = String(url).includes('loaf-sit.svg');
    const name = sit ? 'loaf-sit.svg' : String(url).match(/loaf-run-0\d\.svg/)[0];
    const folder = sit ? '' : 'run/';
    return { text: async () => readFileSync(new URL(`../assets/characters/${folder}${name}`, import.meta.url), 'utf8') };
  };
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = create(blob); log.created.push(url); return url; };
  URL.revokeObjectURL = (url) => { log.revoked.push(url); };
  return { log, restore() { Object.assign(globalThis, { Image: saved.Image, fetch: saved.fetch }); URL.revokeObjectURL = saved.revoke; URL.createObjectURL = saved.create; } };
}

function makeRenderer() {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const made = [];
  const renderer = new Renderer(ctx, { imageFactory: () => { const image = { id: made.length }; made.push(image); return image; } });
  return { renderer, base: renderer.runFrames.slice() };
}

await check('setSkin: swaps the four run frames, returns to the default, drops stale blob URLs', async () => {
  const env = stubBrowser();
  try {
    const { renderer, base } = makeRenderer();
    assert(base.length === 4 && renderer.baseRunFrames === renderer.runFrames, 'the default frames must be remembered');
    assert(await renderer.setSkin('ginger') === true, 'ginger did not load');
    assert(renderer.runFrames.length === 4 && renderer.runFrames.every((f, i) => f !== base[i]), 'the frames were not replaced');
    assert(renderer.playerSprite === renderer.runFrames[0], 'the sprite must follow the first frame');
    assert(env.log.created.length === 5, `${env.log.created.length} blob URLs for 4 run frames and the sitting cat`);
    assert(renderer.playerFrontSprite !== renderer.baseFrontSprite, 'the sitting cat must be recoloured too');
    assert(await renderer.setSkin('calico') === true, 'calico did not load');
    assert(env.log.revoked.length === 5 && env.log.revoked.every((u) => env.log.created.slice(0, 5).includes(u)), 'the ginger URLs must be released when calico is ready');
    assert(await renderer.setSkin('classic') === true, 'classic did not restore');
    assert(renderer.runFrames.length === 4 && renderer.runFrames.every((f, i) => f === base[i]), 'classic must bring back the default frames');
    assert(renderer.playerFrontSprite === renderer.baseFrontSprite, 'classic must bring back the default sitting cat');
    assert(env.log.revoked.length === 10, 'the calico URLs must be released too');
  } finally {
    env.restore();
  }
});

await check('setSkin: the last request wins, a failed load keeps the current cat', async () => {
  const env = stubBrowser();
  try {
    const { renderer, base } = makeRenderer();
    const first = renderer.setSkin('ginger');
    const second = renderer.setSkin('snow');
    const [a, b] = await Promise.all([first, second]);
    assert(a === false && b === true, `results ${a}, ${b}: the older request must be dropped`);
    assert(env.log.revoked.length === 5, 'the dropped request must release its URLs');
    const current = renderer.runFrames.slice();
    env.log.failFetch = true;
    const quiet = console.error;
    console.error = () => {}; // ошибка загрузки здесь нарочная
    const failed = await renderer.setSkin('honey');
    console.error = quiet;
    assert(failed === false, 'a failed load must report false');
    assert(renderer.runFrames.length === 4 && renderer.runFrames.every((f, i) => f === current[i]), 'a failed load must keep the current frames');
    env.log.failFetch = false;
    await renderer.setSkin('classic');
    assert(renderer.runFrames.length === 4 && renderer.runFrames.every((f, i) => f === base[i]), 'back to default');
  } finally {
    env.restore();
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1m checks passed');
}
