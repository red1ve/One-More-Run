// Фаза 6а: большое превью скина в магазине, заранее загруженные превью, подсказка на старте про палец.
//  (а) нажатие на клетку: купленный скин надевается сразу, чужой открывает превью и ничего не покупает;
//  (б) кнопка «купить»: покупка, нехватка монет, скин, купленный на другом устройстве, скин, ушедший из продажи;
//  (в) «назад» и Esc: из превью к сетке, из сетки — закрыть магазин;
//  (г) рисование: превью на двух языках, картинки и пятна, кнопки на экране и не друг на друге, поля шляпы не срезаны;
//  (д) загрузка превью (Renderer.loadSkinPreviews): оба вида кота для каждого скина, один раз, ошибка не ломает;
//  (е) строки: новые ключи на двух языках, подсказка на старте и в магазине говорят правду.
// Запуск: node scripts/phase6a-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Achievements } from '../src/game/Achievements.js';
import { Daily } from '../src/game/Daily.js';
import { Game } from '../src/game/Game.js';
import { Quests } from '../src/game/Quests.js';
import { Shop } from '../src/game/Shop.js';
import { DICTIONARIES, getLanguage, setLanguage } from '../src/localization/i18n.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { HAT_GEOMETRY, PREVIEW_BOX, skinPreviewSvg } from '../src/rendering/SkinArt.js';
import { StorageService } from '../src/services/StorageService.js';

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}
function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function makeStorage(initial = {}) {
  const memory = new Map(Object.entries(initial).map(([key, value]) => [`one_more_run_${key}`, JSON.stringify(value)]));
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); }
  };
  return { storage: new StorageService(), memory };
}

const SKINS = CONFIG.SHOP.SKINS;
const PAID = SKINS.filter((skin) => skin.price > 0 && !skin.limited);
const CHEAP = PAID[0]; // самый дешёвый платный скин
const DEAR = PAID[PAID.length - 1]; // самый дорогой обычный скин
const LIMITED = SKINS.find((skin) => skin.limited);
const DAY = (LIMITED?.limited?.until ? '2026-10-25' : '2026-10-25'); // день внутри сезона ограниченного скина

// Холст-пустышка, который считает вызовы drawImage и запоминает тексты.
function recordingContext() {
  const state = { images: [], texts: [] };
  const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 9 }) }, {
    get: (target, key) => {
      if (key === 'drawImage') return (...args) => state.images.push(args);
      if (key === 'fillText') return (text) => state.texts.push(String(text));
      return key in target ? target[key] : () => ({ addColorStop() {} });
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });
  return { ctx, state };
}

function makeShopGame({ coins = 0, day = DAY, state = 'START' } = {}) {
  const env = makeStorage();
  env.storage.addCoins(coins);
  const log = { skins: [], saves: [], sounds: [], pulses: [], previewAsks: [], renders: 0 };
  const rec = recordingContext();
  const renderer = new Renderer(rec.ctx);
  renderer.setSkin = (id) => { renderer.skinRequest = (renderer.skinRequest || 0) + 1; log.skins.push(id); return Promise.resolve(true); };
  renderer.loadSkinPreviews = (ids) => { log.previewAsks.push(ids); return Promise.resolve(); };
  const shop = new Shop(env.storage, () => day);
  shop.ensureFirstDay();
  const game = Object.assign(Object.create(Game.prototype), {
    state,
    isRunning: false,
    hidden: false,
    storage: env.storage,
    shop,
    daily: new Daily(env.storage),
    quests: new Quests(env.storage),
    achievements: new Achievements(env.storage),
    clockOffset: 0,
    devDay: day,
    shopWindow: null,
    leaderboard: null,
    coins: env.storage.getCoins(),
    bestScore: 10,
    choiceHintSeen: true,
    riskHintSeen: true,
    renderer,
    audio: { play: (name) => log.sounds.push(name), muted: false },
    haptics: { pulse: (name) => log.pulses.push(name) },
    platform: { saveCloudData: (data) => { log.saves.push(data); return true; } },
    started: 0,
    requestRender() { log.renders += 1; },
    start() { this.started += 1; },
    gameOverInputLocked: () => false,
    handleSoundTap: () => false,
    handlePlatformTap: Game.prototype.handlePlatformTap
  });
  return { game, log, env, rec, shop };
}

const draw = (game) => game.renderer.drawShop(game.shopView());
function tapCell(game, id) {
  draw(game);
  const cell = game.renderer.shopButtons.skins.find((s) => s.id === id);
  return game.handleShopTap(cell.x + cell.w / 2, cell.y + cell.h / 2);
}
function tapButton(game, name) {
  draw(game);
  const r = game.renderer.shopButtons[name];
  return game.handleShopTap(r.x + r.w / 2, r.y + r.h / 2);
}

// ---- (а) нажатие на клетку

await check('tap: a bought skin is worn at once, a skin you do not have opens its preview and nothing is bought by looking', () => {
  const { game, log, shop } = makeShopGame({ coins: 500 });
  game.openShop();
  shop.buy(CHEAP.id);
  shop.select('classic');
  draw(game);
  assert(tapCell(game, CHEAP.id) === true && shop.selected() === CHEAP.id && log.skins.at(-1) === CHEAP.id, 'a bought skin is worn with one tap');
  assert(game.shopWindow.preview === null, 'no preview for a skin that is already yours');
  const before = game.storage.getCoins();
  assert(tapCell(game, DEAR.id) === true && game.shopWindow.preview === DEAR.id, 'a skin you do not have opens its preview');
  assert(game.storage.getCoins() === before && !shop.isOwned(DEAR.id) && log.saves.length === 0 && !log.sounds.includes('buy'), 'looking costs nothing, saves nothing, makes no purchase sound');
  assert(shop.selected() === CHEAP.id, 'the cat does not change while you look');
});

await check('tap: a skin that is not on sale or does not exist is ignored, and a tap without an open shop does nothing', () => {
  const { game, log } = makeShopGame({ coins: 500, day: '2027-03-01' }); // сезон Хэллоуина кончился
  game.openShop();
  assert(game.tapSkin(LIMITED.id) === false && game.shopWindow.preview === null, 'the seasonal skin after the season');
  assert(game.tapSkin('unicorn') === false && game.shopWindow.preview === null, 'an unknown skin');
  game.closeShop();
  assert(game.tapSkin(CHEAP.id) === false && game.buySkin(CHEAP.id) === false && log.saves.length === 0, 'no shop window, no purchase');
});

await check('window: openShop starts on the grid (no preview) and asks for the previews; a view without a preview has none', () => {
  const { game, log } = makeShopGame({ coins: 500 });
  assert(game.openShop() === true && game.shopWindow.preview === null && log.previewAsks.length === 1, 'opened on the grid and asked for previews');
  assert(log.previewAsks[0].join() === SKINS.map((s) => s.id).join(), 'for every skin');
  assert(game.shopView().preview === null, 'the grid has no preview');
});

// ---- (б) кнопка «купить»

await check('buy: the button buys the previewed skin, wears it, goes back to the grid, plays the sound and saves to the cloud once', () => {
  const { game, log, shop } = makeShopGame({ coins: DEAR.price + 5 });
  game.openShop();
  tapCell(game, DEAR.id);
  assert(tapButton(game, 'buy') === true, 'the purchase reports a change');
  assert(shop.isOwned(DEAR.id) && shop.selected() === DEAR.id && log.skins.at(-1) === DEAR.id, 'owned and put on the cat');
  assert(game.storage.getCoins() === 5 && game.coins === 5, `coins left ${game.coins}`);
  assert(game.shopWindow.preview === null && game.shopView().preview === null, 'back to the grid after buying');
  assert(log.sounds.filter((s) => s === 'buy').length === 1 && log.pulses.includes('best'), 'one purchase sound and a pulse');
  assert(log.saves.length === 1 && log.saves[0].skinsOwned.includes(DEAR.id) && log.saves[0].skinSelected === DEAR.id, 'the purchase goes to the cloud at once');
  assert(draw(game) === undefined && game.renderer.shopButtons.skins.length === shop.list().length, 'the grid is drawn again');
});

await check('buy: not enough coins says how many are missing, plays the soft "no", spends nothing and stays in the preview', () => {
  const { game, log, shop } = makeShopGame({ coins: CHEAP.price - 1 });
  game.openShop();
  tapCell(game, CHEAP.id);
  assert(game.shopView().preview.missing === 1, 'the view knows one coin is missing');
  assert(tapButton(game, 'buy') === false, 'a poor purchase reports no change');
  assert(game.shopWindow.preview === CHEAP.id && !shop.isOwned(CHEAP.id), 'still in the preview, still not owned');
  assert(game.storage.getCoins() === CHEAP.price - 1 && log.saves.length === 0, 'nothing spent or saved');
  assert(log.sounds.includes('nope') && !log.sounds.includes('buy'), 'the soft "no"');
  assert(game.shopWindow.message && game.shopWindow.message.includes('1'), `the note: ${game.shopWindow.message}`);
});

await check('buy: a skin that became yours meanwhile (cloud) or left the sale goes back to the grid instead of buying twice', () => {
  const owned = makeShopGame({ coins: 500 });
  owned.game.openShop();
  tapCell(owned.game, CHEAP.id);
  owned.shop.buy(CHEAP.id); // купили на другом устройстве, пришло из облака
  const coinsAfterOther = owned.game.storage.getCoins();
  assert(owned.game.shopView().preview === null, 'the view shows the grid: the preview of an owned skin is gone');
  assert(owned.game.buySkin() === false && owned.game.shopWindow.preview === null, 'buying it again is refused and leaves the preview');
  assert(owned.game.storage.getCoins() === coinsAfterOther && owned.log.sounds.filter((s) => s === 'buy').length === 0, 'no second payment, no sound');

  const gone = makeShopGame({ coins: 500, day: '2026-10-25' });
  gone.game.openShop();
  tapCell(gone.game, LIMITED.id);
  assert(gone.game.shopWindow.preview === LIMITED.id, 'the seasonal skin opens its preview inside the season');
  gone.shop.today = () => '2027-03-01'; // сезон кончился, пока было открыто окно
  assert(gone.game.shopView().preview === null, 'the preview of a skin that left the sale is not shown');
  assert(gone.game.buySkin() === false && !gone.shop.isOwned(LIMITED.id) && gone.game.storage.getCoins() === 500, 'it cannot be bought any more');
  assert(makeShopGame({ coins: 500 }).game.buySkin() === false, 'buying without an open shop does nothing');
  const none = makeShopGame({ coins: 500 });
  none.game.openShop();
  assert(none.game.buySkin() === false && none.game.storage.getCoins() === 500, 'buying without a preview does nothing');
});

await check('buy: a purchase that earns an achievement says so in the shop line (the capsule would be hidden behind the shop)', () => {
  const { game, shop } = makeShopGame({ coins: 5000 });
  game.achievements.unlock('piggyBank'); // 5000 монет уже дали «копилку»: здесь важен именно «гардероб»
  game.openShop();
  const regular = PAID.map((skin) => skin.id);
  for (const id of regular.slice(0, CONFIG.ACHIEVEMENTS.SKINS_SOME - 2)) shop.buy(id);
  const next = regular[CONFIG.ACHIEVEMENTS.SKINS_SOME - 2];
  tapCell(game, next);
  assert(tapButton(game, 'buy') === true && game.achievements.has('wardrobe'), 'the fifth skin gives the achievement');
  assert(game.shopWindow.message && game.shopWindow.message.includes(DICTIONARIES.en.achievements.name.wardrobe), `the line: ${game.shopWindow.message}`);
});

// ---- (в) «назад» и Esc

await check('back: the back button returns to the grid, Esc goes back one step and then closes the shop', () => {
  const { game } = makeShopGame({ coins: 500 });
  game.openShop();
  tapCell(game, DEAR.id);
  assert(tapButton(game, 'back') === true && game.shopWindow && game.shopWindow.preview === null, 'back leaves the shop open on the grid');
  assert(game.closeShopPreview() === false, 'back from the grid does nothing');
  tapCell(game, DEAR.id);
  assert(game.backFromShop() === true && game.shopWindow && game.shopWindow.preview === null, 'Esc in the preview: to the grid');
  assert(game.backFromShop() === true && game.shopWindow === null, 'Esc on the grid: the shop closes');
  assert(game.backFromShop() === false, 'nothing to close');
  assert(/game\.backFromShop\(\)/.test(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')), 'the Esc key calls backFromShop');
});

await check('back: while the preview is open a tap beside the buttons changes nothing and starts no run', () => {
  const { game } = makeShopGame({ coins: 500 });
  game.openShop();
  tapCell(game, DEAR.id);
  draw(game);
  assert(game.handleTap(3, 3) === false && game.started === 0 && game.shopWindow.preview === DEAR.id, 'a stray tap');
  assert(game.tryLaunch === Game.prototype.tryLaunch && game.tryLaunch() === false && game.started === 0, 'a restart key is refused behind the shop');
});

// ---- (г) рисование

await check('drawing: the preview shows the name, the price on the buy button and the missing coins, in both languages, inside the card', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const dict = DICTIONARIES[lang];
      for (const [label, coins, skin] of [['rich', DEAR.price, DEAR], ['poor', 3, CHEAP], ['season', 3, LIMITED]]) {
        const { game, rec } = makeShopGame({ coins });
        game.openShop();
        tapCell(game, skin.id);
        rec.state.texts.length = 0;
        draw(game);
        const texts = rec.state.texts;
        assert(texts.includes(dict.skin[skin.id]), `${lang} ${label}: the name ${dict.skin[skin.id]} (${texts})`);
        assert(texts.includes(dict.shop.buyFor.replace('{n}', skin.price)) && texts.includes(dict.shop.back), `${lang} ${label}: the buy button with the price and the back button`);
        const missing = dict.shop.missing.replace('{n}', skin.price - coins);
        assert(texts.includes(missing) === (coins < skin.price), `${lang} ${label}: the missing-coins line only when coins are missing`);
        assert(texts.includes(String(coins)), `${lang} ${label}: the balance`);
        // «ЕЩЁ {n} Д.» → регулярное выражение «ЕЩЁ \d+ Д\.»: число дней любое, остальное буква в букву.
        const [head, tail] = dict.shop.limited.split('{n}').map((part) => part.replace(/[.*+?^$()|[\]\\]/g, '\\$&'));
        const daysLeft = new RegExp(`^${head}\\d+${tail}$`);
        const limited = texts.some((text) => text === dict.shop.limitedLast || daysLeft.test(text));
        assert(limited === !!skin.limited, `${lang} ${label}: the days left only for the seasonal skin (${texts})`);
        assert(!texts.includes(dict.shop.close), `${lang} ${label}: the preview has no «close» button`);
      }
    }
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: two pictures when they are ready (the cat from behind and from the front, the same size ratio as the crop), blobs while loading', () => {
  const { game, rec } = makeShopGame({ coins: 500 });
  game.openShop();
  const r = game.renderer;
  tapCell(game, DEAR.id);
  rec.state.images.length = 0;
  draw(game);
  assert(rec.state.images.length === 0, 'nothing is ready yet: only the warm blobs, no pictures');
  const run = { ready: true, image: { name: 'run' } };
  const sit = { ready: true, image: { name: 'sit' } };
  r.skinPreviews = new Map([[DEAR.id, run]]);
  r.skinSitPreviews = new Map([[DEAR.id, sit]]);
  rec.state.images.length = 0;
  draw(game);
  const drawn = rec.state.images.filter((args) => args[0] === run.image || args[0] === sit.image);
  assert(rec.state.images.length === 2 && drawn.length === 2, `two pictures (${rec.state.images.length})`);
  const [, rx, ry, rw, rh] = rec.state.images.find((args) => args[0] === run.image);
  const [, sx, sy, sw, sh] = rec.state.images.find((args) => args[0] === sit.image);
  assert(Math.abs(rw / rh - PREVIEW_BOX.width / PREVIEW_BOX.height) < 0.001, `the run picture keeps the crop ratio (${rw / rh})`);
  assert(Math.abs(sw / sh - 300 / 360) < 0.001, 'the sitting cat keeps the 300 × 360 ratio');
  assert(Math.abs((ry + rh) - (sy + sh)) < 0.5, 'both stand on one ground line');
  assert(rx >= 36 + 4 && sx + sw <= CONFIG.CANVAS_WIDTH - 36 - 4 && rx + rw <= sx, `both inside the card and apart (${rx}..${rx + rw}, ${sx}..${sx + sw})`);
  assert(rh >= 400 && sh >= 240, 'big enough to judge the colours (the grid cell shows a cat 100 px high)');
});

await check('drawing: the buttons are on the screen, bigger than a finger, apart from each other; both cards (8 and 9 skins) have the same room', () => {
  const inside = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= CONFIG.CANVAS_WIDTH && b.y + b.h <= CONFIG.CANVAS_HEIGHT;
  for (const count of [8, 9]) {
    const { game } = makeShopGame({ coins: 500, day: count === 9 ? '2026-10-25' : '2027-03-01' });
    game.openShop();
    assert(game.shopView().skins.length === count, `the shop lists ${count} skins`);
    tapCell(game, DEAR.id);
    draw(game);
    const { buy, back } = game.renderer.shopButtons;
    assert(buy && back && inside(buy) && inside(back), `${count}: both buttons are on the screen`);
    assert(buy.h >= 64 && back.h >= 56 && buy.w >= 240 && back.w >= 200, `${count}: finger-sized buttons`);
    assert(buy.y + buy.h <= back.y, `${count}: the buttons do not overlap (${buy.y + buy.h} vs ${back.y})`);
    assert(game.renderer.hitShopButton(buy.x + buy.w / 2, buy.y + buy.h / 2).type === 'buy', `${count}: the centre of the buy button hits it`);
    assert(game.renderer.hitShopButton(back.x + back.w / 2, back.y + back.h / 2).type === 'back', `${count}: the centre of the back button hits it`);
    assert(game.renderer.hitShopButton(3, 3) === null, `${count}: a tap beside hits nothing`);
    assert(game.renderer.shopButtons.skins.length === 0 && game.renderer.shopButtons.close === null, `${count}: no grid cells and no close button behind the preview`);
    // Вернулись к сетке — кнопки превью исчезли, клетки на месте.
    game.closeShopPreview();
    draw(game);
    assert(game.renderer.shopButtons.buy === null && game.renderer.shopButtons.back === null && game.renderer.shopButtons.skins.length === count && game.renderer.shopButtons.close, `${count}: the grid has its cells and the close button back`);
  }
});

await check('drawing: the crop of the cat is wider than the hat brim, so the brim of the Halloween hat is not cut; cells use the same ratio', () => {
  const brimLeft = HAT_GEOMETRY.cx - HAT_GEOMETRY.halfBrim;
  const brimRight = HAT_GEOMETRY.cx + HAT_GEOMETRY.halfBrim;
  assert(PREVIEW_BOX.x <= brimLeft - 8 && PREVIEW_BOX.x + PREVIEW_BOX.width >= brimRight + 8, `the crop ${PREVIEW_BOX.x}..${PREVIEW_BOX.x + PREVIEW_BOX.width} must hold the brim ${brimLeft}..${brimRight} with a margin`);
  const frame = '<svg viewBox="0 0 1024 1024" width="100%" height="auto"><path fill="#ffffff" d="M0 0"/></svg>';
  const svg = skinPreviewSvg(frame, 'classic');
  assert(svg.includes(`viewBox="${PREVIEW_BOX.x} ${PREVIEW_BOX.y} ${PREVIEW_BOX.width} ${PREVIEW_BOX.height}"`) && svg.includes(`width="${PREVIEW_BOX.width}" height="${PREVIEW_BOX.height}"`), 'the preview SVG uses the crop');
  // Клетка сетки рисует ту же картинку в том же отношении сторон.
  const { game, rec } = makeShopGame({ coins: 500 });
  game.openShop();
  game.renderer.skinPreviews = new Map(SKINS.map((s) => [s.id, { ready: true, image: { id: s.id } }]));
  rec.state.images.length = 0;
  draw(game);
  assert(rec.state.images.length === SKINS.length, 'a picture in every cell');
  for (const [, , , w, h] of rec.state.images) assert(Math.abs(w / h - PREVIEW_BOX.width / PREVIEW_BOX.height) < 0.001, `a cell picture keeps the crop ratio (${w / h})`);
});

// ---- (д) загрузка превью

const RUN_SVG = readFileSync(new URL('../assets/characters/run/loaf-run-01.svg', import.meta.url), 'utf8');
const SIT_SVG = readFileSync(new URL('../assets/characters/loaf-sit.svg', import.meta.url), 'utf8');

async function withBrowserStubs(fn) {
  const saved = { fetch: globalThis.fetch, Image: globalThis.Image, create: URL.createObjectURL, error: console.error };
  const log = { fetched: [], images: [], blobs: [], errors: 0 };
  globalThis.fetch = async (url) => {
    log.fetched.push(String(url));
    return { text: async () => (String(url).includes('loaf-sit') ? SIT_SVG : RUN_SVG) };
  };
  globalThis.Image = class {
    set src(value) {
      this.url = value;
      log.images.push(this);
      setTimeout(() => this.onload?.(), 0);
    }
    get src() { return this.url; }
  };
  URL.createObjectURL = (blob) => {
    log.blobs.push(blob);
    return `blob:test/${log.blobs.length}`;
  };
  console.error = () => { log.errors += 1; };
  try {
    return await fn(log);
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.Image = saved.Image;
    URL.createObjectURL = saved.create;
    console.error = saved.error;
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

await check('previews: both cats (from behind and from the front) are made for every skin, become ready, and a second request loads nothing', async () => {
  await withBrowserStubs(async (log) => {
    const renderer = new Renderer(recordingContext().ctx);
    const ids = SKINS.map((skin) => skin.id);
    let changes = 0;
    await renderer.loadSkinPreviews(ids, () => { changes += 1; });
    await tick();
    assert(renderer.skinPreviews.size === ids.length && renderer.skinSitPreviews.size === ids.length, 'an entry for every skin in both sets');
    assert(ids.every((id) => renderer.skinPreviews.get(id).ready && renderer.skinSitPreviews.get(id).ready), 'every picture is ready');
    assert(changes === ids.length * 2, `the screen is told about every picture (${changes})`);
    assert(log.fetched.length === 2 && log.fetched.some((u) => u.includes('loaf-run')) && log.fetched.some((u) => u.includes('loaf-sit')), `the two drawings are fetched once (${log.fetched.length})`);
    const texts = await Promise.all(log.blobs.map((blob) => blob.text()));
    const runTexts = texts.filter((text) => text.includes('viewBox="325 96 390 850"'));
    assert(runTexts.length === ids.length, `${runTexts.length} run previews with the crop`);
    const sitTexts = texts.filter((text) => !text.includes('viewBox="325 96 390 850"'));
    assert(sitTexts.length === ids.length && sitTexts.every((text) => text.includes('viewBox="0 0 300 360"')), 'the sitting previews keep the drawing size');
    assert(sitTexts.some((text) => text === SIT_SVG), 'the classic cat is the drawing as it is');
    assert(sitTexts.some((text) => text.includes('#554A5E')), 'the Halloween cat is recoloured');
    const before = { fetched: log.fetched.length, images: log.images.length };
    await renderer.loadSkinPreviews(ids, () => {});
    assert(log.fetched.length === before.fetched && log.images.length === before.images, 'the second request loads nothing');
    const newcomer = ['ginger', 'brand-new'];
    await renderer.loadSkinPreviews([...newcomer], () => {});
    assert(renderer.skinPreviews.has('brand-new') && log.images.length === before.images + 2, 'only a skin that was not known is loaded');
  });
});

await check('previews: a failed load removes the entries (so it can be tried again) and never throws; no browser — nothing happens', async () => {
  await withBrowserStubs(async (log) => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const renderer = new Renderer(recordingContext().ctx);
    await renderer.loadSkinPreviews(['ginger'], () => {});
    assert(renderer.skinPreviews.size === 0 && renderer.skinSitPreviews.size === 0 && log.errors === 1, 'entries removed after an error');
    globalThis.fetch = async () => ({ text: async () => RUN_SVG });
    await renderer.loadSkinPreviews(['ginger'], () => {});
    await tick();
    assert(renderer.skinPreviews.get('ginger').ready, 'the next try works');
  });
  const saved = globalThis.Image;
  globalThis.Image = undefined;
  try {
    const renderer = new Renderer(recordingContext().ctx);
    await renderer.loadSkinPreviews(['ginger'], () => {});
    assert(renderer.skinPreviews.size === 0 || renderer.skinPreviews.get('ginger') === undefined, 'without Image nothing is loaded');
  } finally {
    globalThis.Image = saved;
  }
});

await check('previews: the game asks for them shortly after the start (not only when the shop opens) and the delay is short', () => {
  const asks = [];
  const game = Object.assign(Object.create(Game.prototype), {
    shop: { ids: () => ['classic', 'ginger'] },
    renderer: { loadSkinPreviews: (ids, done) => { asks.push({ ids, done }); } },
    requestRender() {}
  });
  game.preloadSkinPreviews();
  assert(asks.length === 1 && asks[0].ids.join() === 'classic,ginger' && typeof asks[0].done === 'function', 'preloadSkinPreviews asks the renderer');
  assert(Object.assign(Object.create(Game.prototype), { shop: { ids: () => [] } }).preloadSkinPreviews() === undefined, 'a game without a renderer ignores it');
  assert(CONFIG.SHOP.PREVIEW_PRELOAD_MS >= 500 && CONFIG.SHOP.PREVIEW_PRELOAD_MS <= 5000, 'a short delay that does not hold the launch back');
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  assert(/setTimeout\(\(\) => this\.preloadSkinPreviews\(\), CONFIG\.SHOP\.PREVIEW_PRELOAD_MS\)/.test(source), 'the constructor schedules the preload');
});

// ---- (е) строки

await check('strings: the new shop strings exist in both languages; the hints on the start screen and in the shop tell the truth', () => {
  for (const lang of ['en', 'ru']) {
    const dict = DICTIONARIES[lang];
    assert(dict.shop.buyFor.includes('{n}') && dict.shop.back.length > 0, `${lang}: buyFor and back`);
  }
  assert(/ПАЛЕЦ/.test(DICTIONARIES.ru.start.controls) && !/СЛЕВА|СПРАВА/.test(DICTIONARIES.ru.start.controls), `ru start hint: ${DICTIONARIES.ru.start.controls}`);
  assert(/FINGER/.test(DICTIONARIES.en.start.controls) && !/LEFT|RIGHT/i.test(DICTIONARIES.en.start.controls.replace(/←\/→/g, '')), `en start hint: ${DICTIONARIES.en.start.controls}`);
  assert(/A\/D/.test(DICTIONARIES.en.start.controls) && /A\/D/.test(DICTIONARIES.ru.start.controls), 'the keyboard keys stay in the hint');
  assert(!/КУПИТЬ/.test(DICTIONARIES.ru.shop.hint) && !/BUY/.test(DICTIONARIES.en.shop.hint), 'the grid hint no longer says a tap buys');
  assert(/ПОСМОТРЕТЬ/.test(DICTIONARIES.ru.shop.hint) && /PREVIEW/.test(DICTIONARIES.en.shop.hint), 'it says a tap shows the skin');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 6a checks passed');
}
