// Фаза 1н: магазин скинов и честные монеты (шаг 6б).
//  (а) хранилище монет: два счётчика (заработано / потрачено), перенос старого сохранения, трата;
//  (б) правила магазина: покупка, выбор, цены, порча данных;
//  (в) облако: слияние двух устройств без потерь и без «возвращения» потраченного;
//  (г) игра: открытие окна, нажатия, покупка, подсказка «не хватает», облако, скин на коте;
//  (д) рисование: окно и кнопки помещаются на экране, нажимаются, строки есть на двух языках;
//  (е) сидящий кот в окраске скина; экономика: цены против монет, которые выпадают на трассе.
// Запуск: node scripts/phase1n-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { CONFIG, getTrackSpeed } from '../src/config.js';
import { Daily } from '../src/game/Daily.js';
import { Game } from '../src/game/Game.js';
import { Quests } from '../src/game/Quests.js';
import { Shop } from '../src/game/Shop.js';
import { Track } from '../src/game/Track.js';
import { DICTIONARIES } from '../src/localization/i18n.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { SKINS, sitSvg } from '../src/rendering/SkinArt.js';
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

// Подставная память браузера и хранилище поверх неё. memory — то, что «лежит в localStorage».
function makeStorage(initial = {}) {
  const memory = new Map(Object.entries(initial).map(([key, value]) => [`one_more_run_${key}`, JSON.stringify(value)]));
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); }
  };
  const storage = new StorageService();
  const raw = (key) => (memory.has(`one_more_run_${key}`) ? JSON.parse(memory.get(`one_more_run_${key}`)) : undefined);
  return { storage, memory, raw };
}

// ---- (а) монеты

await check('coins: two counters, balance is the difference, old saves keep their coins', () => {
  const old = makeStorage({ coins: 12 });
  assert(old.storage.getCoins() === 12, 'a save with only the old "coins" key must keep its coins');
  assert(old.storage.addCoins(3) === 15 && old.raw('coinsEarned') === 15 && old.raw('coinsSpent') === 0, 'the old number becomes "earned"');
  assert(old.storage.spendCoins(5) === true && old.storage.getCoins() === 10, 'spending lowers the balance');
  assert(old.raw('coinsEarned') === 15 && old.raw('coinsSpent') === 5 && old.raw('coins') === 10, 'earned stays, spent grows, the old key mirrors the balance');
  assert(new StorageService().getCoins() === 10, 'the counters survive a restart');
});

await check('coins: cannot spend more than the balance, nothing odd happens with bad amounts', () => {
  const { storage } = makeStorage();
  storage.addCoins(7);
  assert(storage.spendCoins(8) === false && storage.getCoins() === 7, 'spending more than owned must fail and change nothing');
  for (const bad of [0, -3, NaN, 'x', null, undefined, Infinity]) {
    assert(storage.spendCoins(bad) === false && storage.getCoins() === 7, `spendCoins(${String(bad)}) must be refused`);
    storage.addCoins(bad);
    assert(storage.getCoins() === 7, `addCoins(${String(bad)}) must change nothing`);
  }
  assert(storage.spendCoins(7) === true && storage.getCoins() === 0, 'the exact balance can be spent');
  assert(storage.spendCoins(1) === false, 'an empty purse cannot pay');
  assert(storage.addCoins(2.9) === 2, 'fractions are floored');
});

await check('coins: broken saved numbers never make the balance negative or fractional', () => {
  for (const bad of [{ coinsEarned: 5, coinsSpent: 50 }, { coinsEarned: -4, coinsSpent: 0 }, { coinsEarned: 'abc', coinsSpent: 'x' }, { coinsEarned: 3.7, coinsSpent: 1.2 }]) {
    const { storage } = makeStorage(bad);
    const balance = storage.getCoins();
    assert(Number.isInteger(balance) && balance >= 0, `${JSON.stringify(bad)} gave ${balance}`);
  }
  const { storage } = makeStorage();
  storage.setCoinCounters(10, 99);
  assert(storage.getCoins() === 0, 'spent is capped at earned');
});

// ---- (б) правила магазина

await check('shop: the price list matches the skins, starts free and rises', () => {
  const prices = CONFIG.SHOP.SKINS;
  assert([...prices.map((s) => s.id)].sort().join() === [...SKINS.map((s) => s.id)].sort().join(), 'ids must match SkinArt.SKINS');
  assert(prices[0].id === CONFIG.SHOP.DEFAULT_SKIN && prices[0].price === 0, 'the default skin is free');
  for (let i = 1; i < prices.length; i += 1) {
    assert(Number.isInteger(prices[i].price) && prices[i].price > prices[i - 1].price, `price of ${prices[i].id} must exceed the previous one`);
  }
});

await check('shop: buying spends exactly the price, owns and wears the skin; no double buying', () => {
  const { storage, raw } = makeStorage();
  storage.addCoins(50);
  const shop = new Shop(storage);
  assert(shop.owned().join() === 'classic' && shop.selected() === 'classic', 'a new player owns only the default skin');
  const ginger = shop.buy('ginger');
  assert(ginger.ok && shop.balance() === 40 && shop.isOwned('ginger') && shop.selected() === 'ginger', 'buy ginger');
  assert(raw('skinsOwned').includes('ginger') && raw('skinSelected') === 'ginger', 'stored');
  const again = shop.buy('ginger');
  assert(!again.ok && again.reason === 'owned' && shop.balance() === 40, 'a skin cannot be bought twice');
  const tux = shop.buy('tuxedo');
  assert(!tux.ok && tux.reason === 'poor' && tux.missing === 20 && shop.balance() === 40 && !shop.isOwned('tuxedo'), 'a poor purchase changes nothing and says how much is missing');
  const unknown = shop.buy('unicorn');
  assert(!unknown.ok && unknown.reason === 'unknown' && shop.balance() === 40, 'an unknown skin cannot be bought');
  assert(shop.buy('honey').ok && shop.balance() === 15, 'a second skin');
  assert(shop.owned().join() === 'classic,ginger,honey', `owned in shop order: ${shop.owned()}`);
});

await check('shop: only owned skins can be worn; broken saves fall back to the default skin', () => {
  const { storage } = makeStorage();
  storage.addCoins(100);
  const shop = new Shop(storage);
  assert(shop.select('snow') === false && shop.selected() === 'classic', 'cannot wear a skin that is not bought');
  shop.buy('snow');
  assert(shop.select('classic') === true && shop.selected() === 'classic' && shop.select('snow') === true && shop.selected() === 'snow', 'wear and take off');
  for (const garbage of ['dragon', 7, null, ['x'], { a: 1 }]) {
    storage.set('skinSelected', garbage);
    assert(shop.selected() === 'classic', `selected ${JSON.stringify(garbage)} must fall back`);
  }
  storage.set('skinSelected', 'tuxedo'); // не куплен
  assert(shop.selected() === 'classic', 'a selected skin that is not owned must fall back');
  for (const garbage of ['x', 5, { a: 1 }, ['ghost', 'honey', 7]]) {
    storage.set('skinsOwned', garbage);
    assert(shop.owned().includes('classic') && shop.owned().every((id) => shop.isKnown(id)), `owned ${JSON.stringify(garbage)} must be cleaned`);
  }
  assert(shop.list().length === CONFIG.SHOP.SKINS.length && shop.list().filter((s) => s.selected).length === 1, 'exactly one skin is shown as worn');
});

// ---- (в) облако

await check('cloud: a new device takes everything from the cloud, a stale cloud changes nothing', () => {
  const a = makeStorage();
  a.storage.addCoins(60);
  const shopA = new Shop(a.storage);
  shopA.buy('ginger');
  shopA.buy('honey');
  const cloud = shopA.snapshot();
  assert(cloud.coins === 25 && cloud.coinsEarned === 60 && cloud.coinsSpent === 35 && cloud.skinsOwned.join() === 'classic,ginger,honey' && cloud.skinSelected === 'honey', JSON.stringify(cloud));

  const b = makeStorage();
  const shopB = new Shop(b.storage);
  assert(shopB.merge(cloud) === true, 'the new device must change');
  assert(shopB.balance() === 25 && shopB.owned().join() === 'classic,ginger,honey' && shopB.selected() === 'honey', 'the new device sees the same purse and wardrobe');
  assert(shopB.merge(cloud) === false, 'merging the same data twice changes nothing');
  assert(shopB.merge({ coinsEarned: 10, coinsSpent: 0, skinsOwned: ['classic'], skinSelected: 'classic' }) === false && shopB.balance() === 25, 'an older cloud must change nothing');
});

await check('cloud: spent coins never come back; earnings on two devices do not duplicate or vanish', () => {
  const a = makeStorage();
  a.storage.addCoins(40);
  const shopA = new Shop(a.storage);
  const early = shopA.snapshot(); // облако до покупки
  shopA.buy('ginger');
  const afterBuy = shopA.snapshot();

  const b = makeStorage();
  const shopB = new Shop(b.storage);
  shopB.merge(early);
  assert(shopB.balance() === 40, 'device B sees the early state');
  shopB.merge(afterBuy);
  assert(shopB.balance() === 30 && shopB.isOwned('ginger'), 'the purchase made on A must reach B with its cost');
  shopB.merge(early); // старые данные пришли позже
  assert(shopB.balance() === 30 && shopB.isOwned('ginger'), 'an old snapshot must not give the coins back');
  b.storage.addCoins(5);
  assert(shopB.balance() === 35, 'new earnings on B add up');
  shopA.merge(shopB.snapshot());
  assert(shopA.balance() === 35 && shopA.isOwned('ginger'), 'A gets B earnings back');
});

await check('cloud: coins can not go negative when two devices bought different skins', () => {
  const a = makeStorage();
  a.storage.addCoins(30);
  new Shop(a.storage).buy('ginger'); // 10
  const snapA = new Shop(a.storage).snapshot();
  const b = makeStorage();
  b.storage.addCoins(30);
  const shopB = new Shop(b.storage);
  shopB.buy('honey'); // 25
  shopB.merge(snapA);
  assert(shopB.balance() >= 0 && shopB.isOwned('ginger') && shopB.isOwned('honey'), 'both skins are kept, the balance stays non-negative');
});

await check('cloud: garbage and contradictions are ignored; an old client coin number counts as earned', () => {
  const { storage } = makeStorage();
  storage.addCoins(20);
  const shop = new Shop(storage);
  for (const bad of [null, undefined, 'x', 5, [], {}, { coinsEarned: 'abc' }, { skinsOwned: 'ginger' }, { skinsOwned: [null, 3, 'ghost'] }, { skinSelected: 'dragon' }, { coinsEarned: -5, coinsSpent: -1 }]) {
    shop.merge(bad);
    assert(shop.balance() === 20 && shop.owned().join() === 'classic', `${JSON.stringify(bad)} must change nothing`);
  }
  // Противоречие: «потрачено 100 из 3» не должно обнулить игрока.
  shop.merge({ coinsEarned: 3, coinsSpent: 100 });
  assert(shop.balance() === 20, 'spent > earned in the cloud must be ignored');
  // Старая версия игры присылала только баланс.
  assert(shop.merge({ coins: 55 }) === true && shop.balance() === 55, 'a number from an old client is read as earned');
  // Выбор берётся из облака, только если здесь игрок ещё ничего не выбирал и скин куплен.
  const fresh = makeStorage();
  const shopFresh = new Shop(fresh.storage);
  shopFresh.merge({ skinsOwned: ['classic', 'snow'], skinSelected: 'snow' });
  assert(shopFresh.selected() === 'snow', 'a new device adopts the cloud choice');
  const chosen = makeStorage();
  const shopChosen = new Shop(chosen.storage);
  shopChosen.select('classic');
  shopChosen.merge({ skinsOwned: ['classic', 'snow'], skinSelected: 'snow' });
  assert(shopChosen.selected() === 'classic', 'a choice made on this device is kept');
  const notOwned = makeStorage();
  const shopNotOwned = new Shop(notOwned.storage);
  shopNotOwned.merge({ skinsOwned: ['classic'], skinSelected: 'snow' });
  assert(shopNotOwned.selected() === 'classic', 'a cloud choice that is not owned is ignored');
});

// ---- (г) игра

const noisy = new Proxy({ measureText: (text) => ({ width: String(text).length * 9 }) }, {
  get: (target, key) => (key in target ? target[key] : () => ({ addColorStop() {} })),
  set: (target, key, value) => { target[key] = value; return true; }
});

function makeShopGame({ coins = 0, state = 'START' } = {}) {
  const env = makeStorage();
  env.storage.addCoins(coins);
  const log = { skins: [], saves: [], sounds: [], renders: 0, previews: 0 };
  const renderer = new Renderer(noisy);
  renderer.setSkin = (id) => { renderer.skinRequest = (renderer.skinRequest || 0) + 1; log.skins.push(id); return Promise.resolve(true); };
  renderer.loadSkinPreviews = () => { log.previews += 1; return Promise.resolve(); };
  const game = Object.assign(Object.create(Game.prototype), {
    state,
    isRunning: false,
    hidden: false,
    storage: env.storage,
    shop: new Shop(env.storage),
    daily: new Daily(env.storage),
    quests: new Quests(env.storage),
    clockOffset: 0,
    shopWindow: null,
    leaderboard: null,
    coins: env.storage.getCoins(),
    bestScore: 10,
    choiceHintSeen: true,
    riskHintSeen: true,
    renderer,
    audio: { play: (name) => log.sounds.push(name), muted: false },
    haptics: { pulse() {} },
    platform: { saveCloudData: (data) => { log.saves.push(data); return true; } },
    started: 0,
    requestRender() { log.renders += 1; },
    start() { this.started += 1; },
    gameOverInputLocked: () => false,
    handleSoundTap: () => false,
    handlePlatformTap: Game.prototype.handlePlatformTap
  });
  return { game, log, env };
}

// Нажатие на клетку скина: handleShopTap возвращает, изменилось ли что-то (handleTap по общим правилам всегда false).
function tapCell(game, id) {
  const cell = game.renderer.shopButtons.skins.find((s) => s.id === id);
  return game.handleShopTap(cell.x + cell.w / 2, cell.y + cell.h / 2);
}

await check('game: the shop opens only on the start and game over screens, and loads previews', () => {
  const start = makeShopGame();
  assert(start.game.openShop() === true && start.game.shopWindow && start.log.previews === 1, 'opens on START and asks for previews');
  assert(start.game.openShop() === false, 'cannot open twice');
  const over = makeShopGame({ state: 'GAMEOVER' });
  assert(over.game.openShop() === true, 'opens on GAMEOVER');
  const playing = makeShopGame({ state: 'PLAYING' });
  assert(playing.game.openShop() === false && !playing.game.shopWindow, 'never during a run');
});

await check('game: while the shop is open taps belong to it; a restart is refused; close works', () => {
  const { game } = makeShopGame({ coins: 12 });
  game.openShop();
  game.renderer.drawShop(game.shopView());
  assert(game.tryLaunch() === false && game.started === 0, 'a restart key must not start a run behind the shop');
  assert(game.handleTap(5, 5) === false && game.started === 0 && game.shopWindow, 'a tap outside the buttons must not start a run');
  const close = game.renderer.shopButtons.close;
  game.handleTap(close.x + close.w / 2, close.y + close.h / 2);
  assert(game.shopWindow === null, 'the close button closes the window');
  assert(game.tryLaunch() === true && game.started === 1, 'the game starts again after closing');
});

await check('game: tapping an unbought skin buys and wears it, saves to the cloud; tapping a bought one wears it', () => {
  const { game, log } = makeShopGame({ coins: 30 });
  game.openShop();
  game.renderer.drawShop(game.shopView());
  assert(tapCell(game, 'ginger') === true, 'the purchase must report a change');
  assert(game.coins === 20 && game.shop.selected() === 'ginger' && log.skins.at(-1) === 'ginger', 'bought, coins down, skin put on the cat');
  assert(log.sounds.includes('buy'), 'a purchase sound');
  assert(log.saves.length === 1 && log.saves[0].coinsSpent === 10 && log.saves[0].skinSelected === 'ginger' && log.saves[0].skinsOwned.includes('ginger'), 'the purchase goes to the cloud at once');
  game.renderer.drawShop(game.shopView());
  assert(tapCell(game, 'classic') === true && game.shop.selected() === 'classic' && log.skins.at(-1) === 'classic', 'wearing the free skin back');
  assert(log.saves.length === 1 && game.coins === 20, 'wearing costs nothing and needs no cloud write');
  assert(tapCell(game, 'ginger') === true && game.shop.selected() === 'ginger' && game.coins === 20, 'wearing a bought skin again is free');
});

await check('game: not enough coins shows how many are missing, spends nothing, then the note fades', async () => {
  const saved = CONFIG.SHOP.MESSAGE_SECONDS;
  CONFIG.SHOP.MESSAGE_SECONDS = 0.03;
  try {
    const { game, log } = makeShopGame({ coins: 7 });
    game.openShop();
    game.renderer.drawShop(game.shopView());
    assert(tapCell(game, 'honey') === false, 'a poor purchase reports no change');
    assert(game.coins === 7 && game.shop.owned().join() === 'classic' && log.saves.length === 0, 'nothing is spent, nothing is saved');
    assert(game.shopWindow.message && game.shopView().message.includes('18'), `message: ${game.shopWindow.message}`);
    assert(log.sounds.includes('nope') && !log.sounds.includes('buy'), 'a soft "no" sound');
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert(game.shopWindow.message === null, 'the note must fade');
  } finally {
    CONFIG.SHOP.MESSAGE_SECONDS = saved;
  }
});

await check('game: the shop button is part of the start and game over screens', () => {
  const { game } = makeShopGame();
  game.renderer.drawStartScreen(false, 0.5, { shop: true, leaderboard: false, shortcut: false });
  const button = game.renderer.platformButtons.shop;
  assert(button, 'the shop button is drawn');
  game.handleTap(button.x + button.w / 2, button.y + button.h / 2);
  assert(game.shopWindow, 'tapping the button opens the shop');
});

await check('game: the cloud snapshot carries coins, skins and the choice; a cloud choice puts the skin on the cat', () => {
  const { game, log } = makeShopGame({ coins: 40 });
  game.shop.buy('ginger');
  const snapshot = game.cloudSnapshot();
  assert(snapshot.bestScore === 10 && snapshot.coins === 30 && snapshot.coinsEarned === 40 && snapshot.coinsSpent === 10, JSON.stringify(snapshot));
  assert(snapshot.skinsOwned.join() === 'classic,ginger' && snapshot.skinSelected === 'ginger' && snapshot.choiceHintSeen === true, 'the snapshot has the wardrobe and hints');
  assert(CONFIG.YANDEX.CLOUD_KEYS.every((key) => key in snapshot), 'every cloud key has a value in the snapshot');
  assert(Object.keys(snapshot).every((key) => CONFIG.YANDEX.CLOUD_KEYS.includes(key)), 'the snapshot has no key that is not requested back');

  const other = makeShopGame();
  other.game.applyCloudData({ coinsEarned: 90, coinsSpent: 25, skinsOwned: ['classic', 'tuxedo'], skinSelected: 'tuxedo' });
  assert(other.game.coins === 65 && other.game.shop.selected() === 'tuxedo', 'the merged purse and wardrobe');
  assert(other.log.skins.at(-1) === 'tuxedo', 'the cat puts the skin on after the cloud sync');
  void log;
});

await check('game: a saved skin is put on the cat when the game starts', () => {
  const env = makeStorage();
  env.storage.addCoins(20);
  const shop = new Shop(env.storage);
  shop.buy('ginger');
  const calls = [];
  const game = Object.assign(Object.create(Game.prototype), {
    shop, renderer: { setSkin: (id) => { calls.push(id); return Promise.resolve(true); } }, requestRender() {}
  });
  game.applySelectedSkin();
  assert(calls.join() === 'ginger', `expected the saved skin, got ${calls}`);
  const fresh = Object.assign(Object.create(Game.prototype), {
    shop: new Shop(makeStorage().storage), renderer: { setSkin: (id) => { calls.push(id); return Promise.resolve(true); } }, requestRender() {}
  });
  fresh.applySelectedSkin();
  assert(calls.length === 1, 'a player with the default skin needs no recolouring');
  // Конструктор нужен настоящий холст, поэтому его проверяем по тексту: скин надевается при запуске.
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const constructorText = source.slice(source.indexOf('constructor(canvas'), source.indexOf('  unlockAudio()'));
  assert(/this\.shop = new Shop\(this\.storage\)/.test(constructorText) && /this\.applySelectedSkin\(\)/.test(constructorText), 'the constructor must create the shop and put the saved skin on the cat');
});

// ---- (д) рисование

const inside = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= CONFIG.CANVAS_WIDTH && r.y + r.h <= CONFIG.CANVAS_HEIGHT;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

await check('drawing: the shop window fits the screen, every skin can be tapped, the cells do not overlap', () => {
  const renderer = new Renderer(noisy);
  const view = { skins: new Shop(makeStorage().storage).list(), balance: 12, message: null };
  renderer.drawShop(view);
  const cells = renderer.shopButtons.skins;
  assert(cells.length === CONFIG.SHOP.SKINS.length, 'one cell per skin');
  for (const cell of cells) {
    assert(inside(cell), `${cell.id} sticks out of the screen`);
    assert(cell.w >= 44 && cell.h >= 44, `${cell.id} is too small for a finger`);
    assert(renderer.hitShopButton(cell.x + cell.w / 2, cell.y + cell.h / 2)?.id === cell.id, `${cell.id}: its centre must hit it`);
  }
  for (let i = 0; i < cells.length; i += 1) for (let j = i + 1; j < cells.length; j += 1) assert(!overlap(cells[i], cells[j]), `${cells[i].id} overlaps ${cells[j].id}`);
  const close = renderer.shopButtons.close;
  assert(inside(close) && close.h >= 44, 'the close button is on screen and big enough');
  assert(renderer.hitShopButton(close.x + close.w / 2, close.y + close.h / 2)?.type === 'close', 'the close button hits');
  assert(cells.every((cell) => !overlap(cell, close)), 'no cell under the close button');
  assert(renderer.hitShopButton(2, 2) === null, 'a tap outside hits nothing');
  renderer.drawShop({ ...view, message: 'x' });
  assert(renderer.shopButtons.skins.length === cells.length, 'drawing with a note keeps the same cells');
});

await check('drawing: start and game over buttons stay on screen and clear of the sound row and the card', () => {
  const renderer = new Renderer(noisy);
  renderer.drawStartScreen(false, 0.5, { shop: true, leaderboard: true, shortcut: true });
  const names = Object.keys(renderer.platformButtons);
  assert(names.join() === 'shop,leaderboard,shortcut', `buttons ${names}`);
  const all = Object.values(renderer.platformButtons);
  all.forEach((r) => assert(inside(r) && r.h >= 44, 'a start button is off screen or too small'));
  for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) assert(!overlap(all[i], all[j]), 'start buttons overlap');
  Object.values(renderer.soundButtons).forEach((s) => all.forEach((r) => assert(!overlap(s, r), 'a start button overlaps the sound row')));

  for (const [revive, double] of [[false, false], [true, false], [true, true]]) {
    renderer.drawGameOver(120, 500, 7, 1, { offerRevive: revive, offerDouble: double, leaderboard: true });
    const buttons = Object.values(renderer.platformButtons);
    assert(buttons.length === 2, 'shop and leaderboard are on the game over screen');
    buttons.forEach((r) => assert(inside(r) && r.h >= 44, `game over (${revive}/${double}): a button is off screen`));
    Object.values(renderer.soundButtons).forEach((s) => buttons.forEach((r) => assert(!overlap(s, r), `game over (${revive}/${double}): a button overlaps the sound row`)));
    Object.values(renderer.gameOverButtons).forEach((g) => buttons.forEach((r) => assert(!overlap(g, r), `game over (${revive}/${double}): a button overlaps an offer`)));
  }
});

await check('strings: the shop and every skin name exist in both languages', () => {
  for (const lang of ['en', 'ru']) {
    const dict = DICTIONARIES[lang];
    for (const key of ['button', 'title', 'hint', 'selected', 'owned', 'missing', 'close']) assert(dict.shop?.[key], `${lang}: shop.${key}`);
    for (const { id } of CONFIG.SHOP.SKINS) assert(dict.skin?.[id], `${lang}: skin.${id}`);
    assert(dict.shop.missing.includes('{n}'), `${lang}: shop.missing needs {n}`);
  }
});

// ---- (е) сидящий кот и экономика

await check('sitting cat: every skin recolours the sitting cat, the shape never changes', () => {
  const svg = readFileSync(new URL('../assets/characters/loaf-sit.svg', import.meta.url), 'utf8');
  assert((svg.match(/data-part=/g) || []).length >= 11, 'the sitting cat parts must be tagged');
  assert(sitSvg(svg, 'classic') === svg && sitSvg(svg, 'nobody') === svg, 'classic and unknown skins return the picture as it is');
  const original = [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);
  const shapes = (text) => [...text.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]).slice(0, original.length).join('|');
  const seen = new Set([svg]);
  for (const { id } of CONFIG.SHOP.SKINS.filter((s) => s.id !== 'classic')) {
    const out = sitSvg(svg, id);
    assert(out !== svg && !seen.has(out), `${id}: the sitting cat must look different`);
    seen.add(out);
    assert(shapes(out) === shapes(svg), `${id}: the outline paths changed`);
    assert(out.trimEnd().endsWith('</svg>') && out.split('<g').length === out.split('</g>').length, `${id}: broken SVG`);
    assert([...out.matchAll(/fill="(#[0-9a-fA-F]+)"/g)].every((m) => /^#[0-9a-fA-F]{6}$/.test(m[1])), `${id}: a fill is not a six-digit colour`);
  }
  const ellipses = (id) => (sitSvg(svg, id).match(/<ellipse/g) || []).length - (svg.match(/<ellipse/g) || []).length;
  assert(ellipses('tuxedo') === 2, 'the tuxedo needs a light muzzle and a light bib so the dark face stays readable');
  assert(ellipses('calico') === 2, 'the calico has two body patches');
  const siamese = sitSvg(svg, 'siamese');
  assert(/data-part="earFolded"[^>]*fill="#5A4036"/.test(siamese) && /data-part="tail"[^>]*fill="#5A4036"/.test(siamese), 'siamese has dark ears and tail');
});

await check('economy: the prices fit the coins the track really offers', () => {
  let available30 = 0;
  let available60 = 0;
  const seeds = 40;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const track = new Track();
    track.setSeed(seed);
    const seen = new Set();
    let time = 0;
    while (time < 60) {
      time += 1 / 60;
      track.update(1 / 60, getTrackSpeed(time), time);
      for (const segment of track.segments) {
        if (seen.has(segment.id)) continue;
        seen.add(segment.id);
        // Ряд появляется примерно за 1,4 с до того, как кот до него доедет.
        if (time + 1.4 <= 30) available30 += segment.coins.length;
        if (time + 1.4 <= 60) available60 += segment.coins.length;
      }
    }
  }
  available30 /= seeds;
  available60 /= seeds;
  if (process.env.VERBOSE) console.log(`economy: ${available30.toFixed(2)} coins in the first 30 s, ${available60.toFixed(2)} in 60 s`);
  assert(available30 > 0.8 && available60 > 3, `the track offers ${available30.toFixed(2)} / ${available60.toFixed(2)} coins: re-check the prices in CONFIG.SHOP`);
  const prices = CONFIG.SHOP.SKINS.map((s) => s.price);
  const pickup = 0.6; // игрок подбирает примерно 60% лежащих монет
  const first = prices[1];
  const total = prices.reduce((sum, price) => sum + price, 0);
  assert(first / (pickup * available30) <= 12, `the first skin takes ${(first / (pickup * available30)).toFixed(1)} short runs: too long for a newcomer`);
  assert(first / (pickup * available30) >= 4, 'the first skin must not be instant');
  assert(total / (pickup * available60) <= 220, `all skins take ${(total / (pickup * available60)).toFixed(0)} minute-long runs: too long`);
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1n checks passed');
}
