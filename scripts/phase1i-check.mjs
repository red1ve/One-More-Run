// Платформа Яндекса: облачное сохранение, таблица лидеров, оценка игры, ярлык, вход в аккаунт.
// Настоящего SDK локально нет, поэтому проверяем на поддельном: успех, отказ, ошибка, лимиты.
//  (а) облако: загрузка и запись (склейка частых записей), слияние с локальными данными без потерь;
//  (б) таблица лидеров: разбор ответа, ошибки, кэш, вход в аккаунт, окно и нажатия;
//  (в) оценка игры: один запрос за сессию, только после нового рекорда и только когда разрешено;
//  (г) ярлык: кнопка только когда платформа разрешает;
//  (д) рисование: кнопки и окно помещаются на экране, строки есть на двух языках.
// Запуск: node scripts/phase1i-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Shop } from '../src/game/Shop.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { StorageService } from '../src/services/StorageService.js';
import { YandexService } from '../src/services/YandexService.js';

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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Служба с поддельным SDK; sdkParts дополняют или заменяют части SDK.
async function makeService(sdkParts = {}, configOverrides = {}) {
  const sdk = {
    features: { LoadingAPI: { ready() {} }, GameplayAPI: { start() {}, stop() {} } },
    isAvailableMethod: async () => true,
    on() {},
    ...sdkParts
  };
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: { ...CONFIG.YANDEX, ...configOverrides },
    logger: { warn() {} }
  });
  await service.init();
  return { service, sdk };
}

function fakePlayer(over = {}) {
  const calls = { getData: [], setData: [] };
  const player = {
    calls,
    stored: {},
    isAuthorized: () => true,
    async getData(keys) { calls.getData.push(keys); return { ...this.stored }; },
    async setData(data, flush) { calls.setData.push([data, flush]); this.stored = { ...data }; },
    ...over
  };
  return player;
}

// ---- (а) облако

await check('cloud: loads the saved data through getPlayer({ scopes: false }) and getData(keys)', async () => {
  const player = fakePlayer();
  player.stored = { bestScore: 900, coins: 12 };
  let playerArgs = null;
  const { service } = await makeService({ getPlayer: async (options) => { playerArgs = options; return player; } });
  const data = await service.loadCloudData();
  assert(data && data.bestScore === 900 && data.coins === 12, 'data not returned');
  assert(playerArgs && playerArgs.scopes === false, 'the player must be requested without personal-data scopes');
  assert(JSON.stringify(player.calls.getData[0]) === JSON.stringify(CONFIG.YANDEX.CLOUD_KEYS), 'wrong keys requested');
});

await check('cloud: every failure gives "no data" and never throws; a failed player is retried next time', async () => {
  let attempts = 0;
  const player = fakePlayer();
  const { service } = await makeService({
    getPlayer: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return player;
    }
  });
  assert(await service.loadCloudData() === null, 'a failing getPlayer must give null');
  player.stored = { bestScore: 5 };
  const second = await service.loadCloudData();
  assert(second && second.bestScore === 5 && attempts === 2, 'the player must be requested again after a failure');

  const broken = await makeService({ getPlayer: async () => fakePlayer({ getData: async () => { throw new Error('boom'); } }) });
  assert(await broken.service.loadCloudData() === null, 'a failing getData must give null');
  const noMethod = await makeService({});
  assert(await noMethod.service.loadCloudData() === null, 'an SDK without getPlayer must give null');
  const standalone = new YandexService({ environment: {}, document: null, config: { ...CONFIG.YANDEX }, logger: { warn() {} } });
  await standalone.init();
  assert(await standalone.loadCloudData() === null && standalone.saveCloudData({ bestScore: 1 }) === false, 'standalone mode has no cloud');
  const odd = await makeService({ getPlayer: async () => fakePlayer({ getData: async () => 'not an object' }) });
  assert(await odd.service.loadCloudData() === null, 'a non-object answer must give null');
});

await check('cloud: saves immediately the first time, then glues quick saves into one with the latest state', async () => {
  const player = fakePlayer();
  const { service } = await makeService({ getPlayer: async () => player }, { CLOUD_SAVE_MIN_INTERVAL_MS: 60 });
  assert(service.saveCloudData({ bestScore: 1 }) === true);
  await wait(10);
  assert(player.calls.setData.length === 1 && player.calls.setData[0][0].bestScore === 1, 'first save must go at once');
  assert(player.calls.setData[0][1] === true, 'the data must be flushed to the server');
  service.saveCloudData({ bestScore: 2 });
  service.saveCloudData({ bestScore: 3 });
  service.saveCloudData({ bestScore: 4 });
  await wait(15);
  assert(player.calls.setData.length === 1, 'quick saves must wait for the platform limit');
  await wait(90);
  assert(player.calls.setData.length === 2 && player.calls.setData[1][0].bestScore === 4, `expected one glued save with the latest data, got ${JSON.stringify(player.calls.setData)}`);
});

await check('cloud: a failing setData is swallowed', async () => {
  const { service } = await makeService({ getPlayer: async () => fakePlayer({ setData: async () => { throw new Error('limit'); } }) });
  service.saveCloudData({ bestScore: 1 });
  await wait(10);
  assert(service.saveCloudData(null) === false && service.saveCloudData('x') === false, 'garbage must be refused');
});

// Настоящее хранилище на подставной памяти: stored[ключ] читает записанное значение.
function makeCloudGame(over = {}) {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); }
  };
  const storage = new StorageService();
  storage.setCoinCounters(5, 0);
  const stored = new Proxy({}, {
    get: (_, key) => {
      const raw = memory.get(`one_more_run_${String(key)}`);
      return raw === undefined ? undefined : JSON.parse(raw);
    }
  });
  const game = Object.assign(Object.create(Game.prototype), {
    bestScore: 100,
    coins: 5,
    choiceHintSeen: false,
    riskHintSeen: false,
    isRunning: true,
    storage,
    shop: new Shop(storage),
    renderer: null,
    platform: null,
    ...over
  });
  return { game, stored };
}

await check('cloud merge: the bigger number wins, hints are kept if seen anywhere, nothing is lost', () => {
  const { game, stored } = makeCloudGame();
  assert(game.applyCloudData({ bestScore: 900, coins: 40, choiceHintSeen: true, riskHintSeen: true }) === true);
  assert(game.bestScore === 900 && stored.bestScore === 900, 'a better cloud record must win');
  assert(game.coins === 40 && stored.coins === 40, 'more cloud coins must win');
  assert(game.choiceHintSeen && game.riskHintSeen && stored.choiceHintSeen === true, 'hints seen on another device stay seen');
  assert(game.applyCloudData({ bestScore: 10, coins: 1 }) === false, 'a worse cloud must change nothing');
  assert(game.bestScore === 900 && game.coins === 40, 'local data must not shrink');
});

await check('cloud merge: garbage in the cloud is ignored', () => {
  const { game } = makeCloudGame();
  for (const bad of [null, undefined, 'x', 5, [], {}, { bestScore: 'abc', coins: -5 }, { bestScore: NaN, coins: Infinity }, { choiceHintSeen: 'yes' }]) {
    game.applyCloudData(bad);
  }
  assert(game.bestScore === 100 && game.coins === 5 && game.choiceHintSeen === false, 'garbage must not change local data');
  game.applyCloudData({ bestScore: 12.9 });
  assert(game.bestScore === 100, 'a smaller fractional record is still smaller');
  game.applyCloudData({ bestScore: 250.7 });
  assert(game.bestScore === 250, 'a fractional record is floored');
});

await check('cloud sync: merged data goes back to the cloud; no cloud means no change', async () => {
  const saved = [];
  const { game } = makeCloudGame({
    platform: {
      loadCloudData: async () => ({ bestScore: 700, coins: 2 }),
      saveCloudData: (data) => { saved.push(data); return true; }
    }
  });
  assert(await game.syncCloud() === true);
  assert(game.bestScore === 700 && game.coins === 5, 'merged locally');
  assert(saved.length === 1 && saved[0].bestScore === 700 && saved[0].coins === 5, 'the merged state must be pushed back');
  const offline = makeCloudGame({ platform: { loadCloudData: async () => null, saveCloudData() { throw new Error('must not save'); } } });
  assert(await offline.game.syncCloud() === false, 'no cloud data means nothing to merge');
  const broken = makeCloudGame({ platform: { loadCloudData: async () => { throw new Error('x'); } } });
  assert(await broken.game.syncCloud() === false, 'a failing platform must not break the game');
});

await check('cloud: the game saves a snapshot at Game Over with record, coins and hints', () => {
  const saved = [];
  const log = console.log;
  console.log = () => {};
  try {
    const game = Object.assign(Object.create(Game.prototype), {
      state: 'PLAYING', distanceScore: 300, pathReward: 200, bestScore: 10, choiceHintSeen: true, riskHintSeen: false,
      reviveUsed: false, multiplier: 1, riskStreak: 0, player: { x: 1, y: 1 }, feel: null,
      storage: { set() {} },
      shop: { snapshot: () => ({ coins: 9, coinsEarned: 12, coinsSpent: 3, skinsOwned: ['classic', 'ginger'], skinSelected: 'ginger' }) },
      platform: {
        completedRuns: 0,
        submitScore: async () => true,
        recordRunCompleted() { this.completedRuns += 1; },
        saveCloudData(data) { saved.push(data); return true; }
      },
      syncGameplayLifecycle() {}
    });
    game.gameOver();
    assert(game.state === 'GAMEOVER' && game.isNewBest === true);
    assert(saved.length === 1, 'exactly one cloud save at Game Over');
    assert(saved[0].bestScore === 500 && saved[0].coins === 9 && saved[0].choiceHintSeen === true && saved[0].riskHintSeen === false, `bad snapshot ${JSON.stringify(saved[0])}`);
    assert(saved[0].coinsEarned === 12 && saved[0].coinsSpent === 3 && saved[0].skinsOwned.join() === 'classic,ginger' && saved[0].skinSelected === 'ginger', 'the snapshot must carry the shop data');
  } finally {
    console.log = log;
  }
});

// ---- (б) таблица лидеров

const entry = (rank, score, name) => ({ rank, score, player: { publicName: name } });

await check('leaderboard: asks for the right table and options, parses places, marks "you" and the gap', async () => {
  let asked = null;
  const player = fakePlayer();
  const { service } = await makeService({
    getPlayer: async () => player,
    leaderboards: {
      getEntries: async (name, options) => {
        asked = [name, options];
        return { userRank: 37, entries: [entry(1, 21400, 'Мурка'), entry(2, 19550, ' Barsik '), entry(36, 520, 'Cookie'), entry(37, 500, ''), entry(38, 480, undefined)] };
      }
    }
  });
  const result = await service.getLeaderboard();
  assert(asked[0] === CONFIG.YANDEX.LEADERBOARD_NAME, 'wrong table name');
  assert(asked[1].quantityTop === CONFIG.YANDEX.LEADERBOARD_TOP && asked[1].includeUser === true && asked[1].quantityAround === CONFIG.YANDEX.LEADERBOARD_AROUND, 'wrong options');
  assert(result.ok && result.entries.length === 5 && result.userRank === 37, 'not parsed');
  assert(result.entries[1].name === 'Barsik', 'names are trimmed');
  assert(result.entries[2].gapBefore === true && result.entries[3].gapBefore === false && result.entries[1].gapBefore === false, 'the gap between the top and the places around the player must be marked');
  assert(result.entries[3].isYou === true && result.entries.filter((item) => item.isYou).length === 1, 'exactly one row is "you"');
  assert(result.entries[3].name === '' && result.entries[4].name === '', 'missing names become empty strings');
  assert(result.authorized === true, 'authorization is read from the player');
});

await check('leaderboard: places from 0 are shifted to start at 1; garbage entries are dropped; duplicates ignored', async () => {
  const { service } = await makeService({
    getPlayer: async () => fakePlayer({ isAuthorized: () => false }),
    leaderboards: {
      getEntries: async () => ({
        userRank: 0,
        entries: [entry(0, 300, 'A'), entry(1, 200, 'B'), entry(1, 999, 'dup'), { rank: 'x', score: 5 }, { rank: 2 }, null, entry(-3, 1, 'neg'), entry(2, 100.9, 'C')]
      })
    }
  });
  const result = await service.getLeaderboard();
  assert(result.ok && result.entries.map((item) => item.rank).join() === '1,2,3', `ranks ${result.entries.map((item) => item.rank)}`);
  assert(result.entries.map((item) => item.name).join() === 'A,B,C' && result.entries[2].score === 100, 'garbage and duplicates must be dropped');
  assert(result.userRank === null && result.authorized === false, 'userRank 0 means "not on the board"');
});

await check('leaderboard: errors and missing support never throw; the answer is cached for a while', async () => {
  let calls = 0;
  const { service } = await makeService({
    getPlayer: async () => fakePlayer(),
    leaderboards: { getEntries: async () => { calls += 1; return { entries: [entry(1, 5, 'A')], userRank: 0 }; } }
  });
  assert(service.canShowLeaderboard() === true);
  await service.getLeaderboard();
  await service.getLeaderboard();
  assert(calls === 1, 'the second request inside the cache time must not hit the platform');

  const failing = await makeService({ getPlayer: async () => fakePlayer(), leaderboards: { getEntries: async () => { throw new Error('x'); } } });
  const bad = await failing.service.getLeaderboard();
  assert(bad.ok === false && bad.reason === 'error', 'a failing platform gives { ok: false }');

  const none = await makeService({});
  assert(none.service.canShowLeaderboard() === false, 'no leaderboards in the SDK means no button');
  assert((await none.service.getLeaderboard()).ok === false);

  const standalone = new YandexService({ environment: {}, document: null, config: { ...CONFIG.YANDEX }, logger: { warn() {} } });
  await standalone.init();
  assert(standalone.canShowLeaderboard() === false && (await standalone.getLeaderboard()).ok === false, 'standalone: no leaderboard');
  const dev = new YandexService({ environment: {}, document: null, config: { ...CONFIG.YANDEX, DEV_PLATFORM_STUB: true }, logger: { warn() {} } });
  await dev.init();
  const fake = await dev.getLeaderboard({ myBest: 321 });
  assert(dev.canShowLeaderboard() === true && fake.ok && fake.entries.some((item) => item.isYou && item.score === 321), 'the dev stub shows a table with the player in it');
});

await check('auth: signing in resets the player, the table cache and the last sent score', async () => {
  let authorized = false;
  let dialogs = 0;
  const { service } = await makeService({
    getPlayer: async () => fakePlayer({ isAuthorized: () => authorized }),
    auth: { openAuthDialog: async () => { dialogs += 1; authorized = true; } },
    leaderboards: { getEntries: async () => ({ entries: [entry(1, 5, 'A')], userRank: 0 }) }
  });
  const before = await service.getLeaderboard();
  assert(before.authorized === false, 'not signed in yet');
  service.lastSubmittedScore = 500;
  assert(await service.openAuth() === true && dialogs === 1, 'sign-in did not report success');
  assert(service.lastSubmittedScore === null, 'after signing in the best score must be submittable again');
  assert((await service.getLeaderboard()).authorized === true, 'the table must be requested again after signing in');

  const declined = await makeService({ getPlayer: async () => fakePlayer(), auth: { openAuthDialog: async () => { throw new Error('closed'); } } });
  assert(await declined.service.openAuth() === false, 'a closed dialog is not a success');
  const noAuth = await makeService({});
  assert(await noAuth.service.openAuth() === false, 'an SDK without auth gives false');
});

function makeBoardGame(over = {}) {
  const calls = { load: 0, auth: 0, submit: [], sync: 0, launched: 0 };
  const platform = {
    canShowLeaderboard: () => true,
    getLeaderboard: async () => { calls.load += 1; return { ok: true, entries: [{ rank: 1, score: 9, name: 'A', isYou: false, gapBefore: false }], userRank: null, authorized: false }; },
    openAuth: async () => { calls.auth += 1; return true; },
    submitScore: async (score) => { calls.submit.push(score); return true; },
    loadCloudData: async () => { calls.sync += 1; return null; },
    ...over
  };
  const game = Object.assign(Object.create(Game.prototype), {
    state: 'START', isRunning: true, bestScore: 321, leaderboard: null, platform,
    storage: { set() {}, getCoins: () => 0 },
    renderer: {
      hits: {},
      hitPlatformButton(x, y) { return this.hits[`${x},${y}`] ?? null; },
      hitLeaderboardButton(x, y) { return this.hits[`lb${x},${y}`] ?? null; },
      hitSoundButton() { return null; }
    },
    render() {},
    start() { calls.launched += 1; }
  });
  return { game, calls, platform };
}

await check('leaderboard window: opens loading, fills in, shows errors and "empty", ignores an answer after closing', async () => {
  const { game, calls } = makeBoardGame();
  assert(game.openLeaderboard() === true && game.leaderboard.status === 'loading');
  assert(game.openLeaderboard() === false, 'a second open does nothing');
  await wait(5);
  assert(game.leaderboard.status === 'ready' && game.leaderboard.entries.length === 1 && game.leaderboard.authorized === false && calls.load === 1);
  assert(game.closeLeaderboard() === true && game.leaderboard === null && game.closeLeaderboard() === false);

  const slow = makeBoardGame({ getLeaderboard: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, entries: [], userRank: null, authorized: true }), 20)) });
  let renders = 0;
  slow.game.isRunning = false; // стартовый экран: перерисовка по событиям, её можно сосчитать
  slow.game.render = () => { renders += 1; };
  slow.game.openLeaderboard();
  slow.game.closeLeaderboard();
  const rendersAfterClose = renders;
  await wait(40);
  assert(slow.game.leaderboard === null, 'a late answer must not reopen the window');
  assert(renders === rendersAfterClose, 'a late answer for a closed window must not redraw the screen');

  const empty = makeBoardGame({ getLeaderboard: async () => ({ ok: true, entries: [], userRank: null, authorized: true }) });
  empty.game.openLeaderboard();
  await wait(5);
  assert(empty.game.leaderboard.status === 'empty');
  const failed = makeBoardGame({ getLeaderboard: async () => ({ ok: false, reason: 'error' }) });
  failed.game.openLeaderboard();
  await wait(5);
  assert(failed.game.leaderboard.status === 'error');
  const thrown = makeBoardGame({ getLeaderboard: async () => { throw new Error('x'); } });
  thrown.game.openLeaderboard();
  await wait(5);
  assert(thrown.game.leaderboard.status === 'error', 'a throwing platform shows the error text');
  const unavailable = makeBoardGame({ canShowLeaderboard: () => false });
  assert(unavailable.game.openLeaderboard() === false && unavailable.game.leaderboard === null, 'no window without a leaderboard');
});

await check('leaderboard window: taps go only to the window and never start a run; Esc and Space cannot start a run behind it', async () => {
  const { game, calls } = makeBoardGame();
  game.renderer.hits['10,10'] = 'leaderboard';
  assert(game.handleTap(10, 10) === false && game.leaderboard, 'the button must open the table');
  game.renderer.hits['20,20'] = 'leaderboard';
  assert(game.handleTap(300, 300) === false && game.handleTap(20, 20) === false, 'taps elsewhere do nothing');
  assert(calls.launched === 0 && game.tryLaunch() === false && calls.launched === 0, 'no run may start while the window is open');
  game.renderer.hits['lb5,5'] = 'close';
  game.handleTap(5, 5);
  assert(game.leaderboard === null, 'the close button closes the window');
  game.handleTap(300, 300);
  assert(calls.launched === 1, 'after closing a tap on the screen starts the run again');
});

await check('leaderboard window: Game.render draws it over START and Game Over, and only while it is open', () => {
  const drawn = [];
  const renderer = {
    clear() {}, drawBackdrop() {}, drawFarWorld() {}, beginWorld() {}, drawWorld() {}, drawSegments() {}, drawPlayer() {},
    drawParticles() {}, drawFloatingRewards() {}, endWorld() {}, drawFlash() {}, drawHUD() {}, drawTimeOfDay() {}, drawStageToast() {},
    drawStartScreen() { drawn.push('start'); }, drawGameOver() { drawn.push('over'); }, drawPause() {}, drawChoiceHint() {},
    drawLeaderboard(board) { drawn.push(`board:${board.status}`); }
  };
  const make = (state, leaderboard) => Object.assign(Object.create(Game.prototype), {
    state, leaderboard, renderer, camera: null, feel: null, track: { segments: [] }, player: { y: 840 }, floatingRewards: [],
    score: 0, multiplier: 1, bestScore: 0, riskStreak: 0, coins: 0, userPaused: false, platform: null, choiceHintSeen: true,
    distanceScore: 0, pathReward: 0, audio: null
  });
  make('START', null).render();
  assert(drawn.join() === 'start', `closed window drew ${drawn}`);
  drawn.length = 0;
  make('START', { status: 'ready' }).render();
  assert(drawn.join() === 'start,board:ready', `START with the window drew ${drawn}`);
  drawn.length = 0;
  make('GAMEOVER', { status: 'loading' }).render();
  assert(drawn.join() === 'over,board:loading', `Game Over with the window drew ${drawn}`);
});

await check('leaderboard window: signing in sends the best score, syncs the cloud and reloads the table once', async () => {
  const { game, calls } = makeBoardGame();
  game.openLeaderboard();
  await wait(5);
  const loadsBefore = calls.load;
  const first = game.signIn();
  assert(await game.signIn() === false, 'a second tap while signing in is ignored');
  assert(await first === true);
  assert(calls.auth === 1 && calls.submit.join() === '321', `auth ${calls.auth}, submitted ${calls.submit}`);
  assert(calls.sync === 1 && calls.load === loadsBefore + 1, 'cloud synced and table reloaded once');
  const declined = makeBoardGame({ openAuth: async () => false });
  declined.game.openLeaderboard();
  await wait(5);
  assert(await declined.game.signIn() === false && declined.calls.submit.length === 0, 'a declined sign-in changes nothing');
  assert(declined.game.leaderboard.signingIn === false, 'the button is usable again after a declined sign-in');
});

await check('platform buttons: opened from START and Game Over, but not right after the crash or during an ad', async () => {
  const { game } = makeBoardGame();
  game.renderer.hits['1,1'] = 'leaderboard';
  assert(game.handleTap(1, 1) === false && game.leaderboard, 'START: the button opens the table');
  game.closeLeaderboard();
  Object.assign(game, { state: 'GAMEOVER', feel: { gameOverAge: 0.1 } });
  game.handleTap(1, 1);
  assert(game.leaderboard === null, 'right after the crash the button must not react');
  game.feel.gameOverAge = 5;
  game.handleTap(1, 1);
  assert(game.leaderboard, 'later it opens');
  game.closeLeaderboard();
  game.rewardPending = true;
  game.handleTap(1, 1);
  assert(game.leaderboard === null, 'during an ad nothing opens');
  Object.assign(game, { state: 'PLAYING', rewardPending: false });
  assert(game.handlePlatformTap(1, 1) === false, 'during a run the platform buttons do not exist');
});

// ---- (в) оценка игры

await check('review: asked once per session, only when the platform allows, and every answer is handled', async () => {
  let asked = 0;
  let can = { value: true };
  const { service } = await makeService({
    feedback: { canReview: async () => can, requestReview: async () => { asked += 1; return { feedbackSent: true }; } }
  });
  can = { value: false, reason: 'NO_AUTH' };
  const denied = await service.requestReview();
  assert(denied.asked === false && denied.reason === 'NO_AUTH' && asked === 0, 'must not ask when the platform says no');
  can = { value: true };
  const done = await service.requestReview();
  assert(done.asked === true && done.sent === true && asked === 1, 'must ask when allowed');
  const again = await service.requestReview();
  assert(again.asked === false && again.reason === 'ALREADY_ASKED' && asked === 1, 'only once per session');

  const old = await makeService({ feedback: { canReview: async () => ({ value: true }), requestReview: async () => ({ sentFeedback: false }) } });
  const closed = await old.service.requestReview();
  assert(closed.asked === true && closed.sent === false, 'a closed popup is reported as not sent');
  const broken = await makeService({ feedback: { canReview: async () => { throw new Error('x'); }, requestReview: async () => ({}) } });
  assert((await broken.service.requestReview()).asked === false, 'errors are swallowed');
  const none = await makeService({});
  assert((await none.service.requestReview()).reason === 'UNAVAILABLE', 'no feedback API in the SDK');
});

await check('review: the game asks after a new best from the third run of the session, never earlier, never over a new run', () => {
  const realSetTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = (fn) => { timers.push(fn); return { unref() {} }; };
  try {
    let requests = 0;
    const make = (over = {}) => Object.assign(Object.create(Game.prototype), {
      state: 'GAMEOVER', isNewBest: true, hidden: false, platformPaused: false, adPaused: false, rewardPending: false, launchPending: false,
      platform: { completedRuns: 3, requestReview: async () => { requests += 1; return { asked: true }; } },
      ...over
    });
    assert(make({ isNewBest: false }).maybeAskForReview() === false, 'no record, no request');
    assert(make({ platform: { completedRuns: CONFIG.YANDEX.REVIEW_AFTER_RUNS - 1 } }).maybeAskForReview() === false, 'too early in the session');
    assert(timers.length === 0, 'nothing may be scheduled in those cases');
    const game = make();
    assert(game.maybeAskForReview() === true && timers.length === 1, 'record on the third run schedules the request');
    timers.pop()();
    assert(requests === 1, 'the request goes out');
    const restarted = make();
    restarted.maybeAskForReview();
    restarted.state = 'PLAYING';
    timers.pop()();
    assert(requests === 1, 'a player who already restarted must not be interrupted');
    const watching = make();
    watching.maybeAskForReview();
    watching.rewardPending = true;
    timers.pop()();
    assert(requests === 1, 'not during an ad');
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

// ---- (г) ярлык

await check('shortcut: shown only when allowed; accepting hides it, declining keeps it; errors are swallowed', async () => {
  let canShow = false;
  let outcome = 'accepted';
  const { service } = await makeService({ shortcut: { canShowPrompt: async () => ({ canShow }), showPrompt: async () => ({ outcome }) } });
  assert(await service.canShowShortcut() === false, 'platform says no');
  canShow = true;
  assert(await service.canShowShortcut() === true, 'platform says yes');
  assert((await service.showShortcut()).accepted === true);
  outcome = 'denied';
  assert((await service.showShortcut()).accepted === false);
  const broken = await makeService({ shortcut: { canShowPrompt: async () => { throw new Error('x'); }, showPrompt: async () => { throw new Error('y'); } } });
  assert(await broken.service.canShowShortcut() === false && (await broken.service.showShortcut()).accepted === false);
  const none = await makeService({});
  assert(await none.service.canShowShortcut() === false && (await none.service.showShortcut()).accepted === false, 'no shortcut API');

  const game = Object.assign(Object.create(Game.prototype), {
    isRunning: true, shortcutAvailable: true, render() {},
    platform: { showShortcut: async () => ({ accepted: false }) }
  });
  await game.addShortcut();
  assert(game.shortcutAvailable === true, 'declined: the button stays');
  game.platform.showShortcut = async () => ({ accepted: true });
  await game.addShortcut();
  assert(game.shortcutAvailable === false, 'accepted: the button is gone');
});

await check('platform start-up: cloud merged and shortcut checked once the SDK is ready; a failing platform is harmless', async () => {
  const { game } = makeCloudGame({
    shortcutAvailable: false,
    render() {},
    platform: { loadCloudData: async () => ({ bestScore: 999 }), saveCloudData: () => true, canShowShortcut: async () => true }
  });
  await game.onPlatformReady();
  assert(game.bestScore === 999 && game.shortcutAvailable === true);
  const failing = makeCloudGame({
    shortcutAvailable: false,
    render() {},
    platform: { loadCloudData: async () => { throw new Error('x'); }, canShowShortcut: async () => { throw new Error('y'); } }
  });
  await failing.game.onPlatformReady();
  assert(failing.game.shortcutAvailable === false && failing.game.bestScore === 100, 'errors change nothing');
  const bare = makeCloudGame({ platform: null, render() {} });
  await bare.game.onPlatformReady();
});

// ---- (д) рисование и строки

const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 9 }) }, {
  get: (target, key) => (key in target ? target[key] : () => ({ addColorStop() {} })),
  set: (target, key, value) => { target[key] = value; return true; }
});
const texts = [];
const recordingCtx = new Proxy(ctx, {
  get: (target, key) => (key === 'fillText' ? (text) => { texts.push(String(text)); } : target[key]),
  set: (target, key, value) => { target[key] = value; return true; }
});

function insideCanvas(rect) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= CONFIG.CANVAS_WIDTH && rect.y + rect.h <= CONFIG.CANVAS_HEIGHT;
}

await check('screens: platform buttons fit on START and Game Over, never overlap the sound row, and only appear when allowed', () => {
  const renderer = new Renderer(ctx);
  renderer.drawHUD(0, 1, 0, 0, 0, null, false, false, false);
  renderer.drawStartScreen(false, 0.5, { leaderboard: true, shortcut: true });
  const both = renderer.platformButtons;
  assert(both.leaderboard && both.shortcut, 'both buttons are drawn');
  assert(insideCanvas(both.leaderboard) && insideCanvas(both.shortcut), 'START: buttons are outside the screen');
  assert(both.leaderboard.x + both.leaderboard.w <= both.shortcut.x, 'the two buttons overlap');
  const sound = renderer.soundButtons;
  assert(both.leaderboard.y >= sound.mute.y + sound.mute.h - 12, 'the buttons overlap the sound row');
  const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  assert(renderer.hitPlatformButton(...centre(both.leaderboard)) === 'leaderboard' && renderer.hitPlatformButton(...centre(both.shortcut)) === 'shortcut', 'hit areas');
  assert(renderer.hitPlatformButton(5, 5) === null);

  renderer.drawStartScreen(false, 0.5, { leaderboard: true });
  assert(Object.keys(renderer.platformButtons).join() === 'leaderboard', 'only the allowed button is drawn');
  renderer.drawStartScreen(false, 0.5, {});
  assert(renderer.platformButtons === null && renderer.hitPlatformButton(270, 748) === null, 'nothing without platform support');
  renderer.drawStartScreen(false, 0.5);
  assert(renderer.platformButtons === null, 'old callers still work');

  for (const offerRevive of [false, true]) {
    renderer.drawHUD(0, 1, 0, 0, 0, null, false, false, false);
    renderer.drawGameOver(120, 300, 5, 1, { offerRevive, leaderboard: true, muted: false, volume: 0.5 });
    assert(insideCanvas(renderer.platformButtons.leaderboard), `Game Over (revive offered: ${offerRevive}): the button is outside the screen`);
    assert(renderer.platformButtons.leaderboard.y >= renderer.soundButtons.mute.y + renderer.soundButtons.mute.h - 12, 'overlaps the sound row');
  }
  renderer.drawHUD(0, 1, 0, 0, 0, null, false, true, true);
  assert(renderer.platformButtons === null && renderer.leaderboardButtons === null, 'old buttons must not stay active after the screen changes');
});

await check('screens: the leaderboard window draws every state, keeps its buttons on screen and cuts long names', () => {
  texts.length = 0;
  const renderer = new Renderer(recordingCtx);
  const board = {
    status: 'ready', authorized: true, signingIn: false,
    entries: [
      { rank: 1, score: 21400, name: 'Мурка', isYou: false, gapBefore: false },
      { rank: 2, score: 19550, name: 'A very very very long player name that must be cut', isYou: false, gapBefore: false },
      { rank: 36, score: 520, name: '', isYou: false, gapBefore: true },
      { rank: 37, score: 500, name: '', isYou: true, gapBefore: false }
    ]
  };
  renderer.drawLeaderboard(board);
  assert(renderer.leaderboardButtons.close && insideCanvas(renderer.leaderboardButtons.close), 'the close button must be on screen');
  assert(!renderer.leaderboardButtons.signin, 'a signed-in player has no sign-in button');
  assert(texts.includes('Мурка') && texts.includes('21400') && texts.includes('37') && texts.includes('…'), 'rows, scores, places and the gap mark are drawn');
  assert(texts.some((text) => text.startsWith('A very') && text.endsWith('…') && text.length < 40), 'a long name must be cut with an ellipsis');
  assert(texts.some((text) => text === 'YOU' || text === 'ВЫ'), 'your own row without a name is labelled');
  assert(renderer.hitLeaderboardButton(renderer.leaderboardButtons.close.x + 3, renderer.leaderboardButtons.close.y + 3) === 'close');
  assert(renderer.hitLeaderboardButton(3, 3) === null);

  renderer.drawLeaderboard({ ...board, authorized: false });
  assert(renderer.leaderboardButtons.signin && insideCanvas(renderer.leaderboardButtons.signin), 'a guest sees the sign-in button');
  const signin = renderer.leaderboardButtons.signin;
  const close = renderer.leaderboardButtons.close;
  assert(signin.y + signin.h <= close.y, 'sign-in and close buttons overlap');
  assert(renderer.hitLeaderboardButton(signin.x + 3, signin.y + 3) === 'signin');
  for (const status of ['loading', 'empty', 'error']) {
    texts.length = 0;
    renderer.drawLeaderboard({ status, entries: [], authorized: true });
    assert(texts.length >= 2 && renderer.leaderboardButtons.close, `${status}: the window must say something and be closable`);
  }
  renderer.drawLeaderboard({ status: 'loading', entries: [], authorized: false });
  assert(!renderer.leaderboardButtons.signin, 'no sign-in button while loading');
});

await check('strings and wiring: new texts in both languages, dev stub, Esc and platform-ready hook in main.js', () => {
  for (const lang of ['en', 'ru']) {
    const dict = JSON.parse(readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    for (const key of ['button', 'title', 'loading', 'empty', 'error', 'player', 'you', 'signinHint', 'signin', 'close']) {
      assert(dict.leaderboard?.[key], `${lang}: leaderboard.${key} missing`);
    }
    assert(dict.shortcut?.button, `${lang}: shortcut.button missing`);
  }
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(main.includes('DEV_PLATFORM_STUB') && main.includes('onPlatformReady()') && main.includes('closeLeaderboard()'), 'main.js is not wired');
  assert(CONFIG.YANDEX.DEV_PLATFORM_STUB === false, 'the dev stub must be off in the real game');
  assert(CONFIG.YANDEX.CLOUD_SAVE_MIN_INTERVAL_MS >= 3000, 'cloud saves must respect the platform limit of 100 requests per 5 minutes');
  const yandex = readFileSync(new URL('../src/services/YandexService.js', import.meta.url), 'utf8');
  assert(!/ysdk\.getLeaderboards/.test(yandex), 'the deprecated ysdk.getLeaderboards must not be used');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1i check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1i checks passed');
}
// Таймеры службы не должны держать проверку живой.
process.exit(failed.length ? 1 : 0);
