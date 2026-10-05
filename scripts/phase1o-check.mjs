// Фаза 1о: забег дня и серия дней (шаг 6в).
//  (а) дата: игровой день по Москве, граница суток, високосный год, проверка строки-даты;
//  (б) зерно трассы и награда: один день — одно зерно, разные дни — разные; награда по серии;
//  (в) серия: первый забег дня, повторы, следующий день, пропуск, часы «из будущего», мусор;
//  (г) облако: слияние забега дня между устройствами;
//  (д) трасса: у всех в один день одна и та же, при любой частоте кадров; помощь поэтому одна для всех;
//  (е) игра: запуск, рекорд и таблица не трогаются, награда один раз, серверное время, нажатие кнопки;
//  (ж) рисование: кнопка на стартовом экране и итог на экране проигрыша; строки на двух языках;
//  (з) YandexService.getServerTime.
// Запуск: node scripts/phase1o-check.mjs (входит в npm run check).
import { CONFIG, getAssist, getTimeAtDistance, getTrackDistance } from '../src/config.js';
import { Daily, dailyReward, dailySeed, gameDay, isDay, previousDay } from '../src/game/Daily.js';
import { Game } from '../src/game/Game.js';
import { Shop } from '../src/game/Shop.js';
import { Track } from '../src/game/Track.js';
import { DICTIONARIES, getLanguage, setLanguage } from '../src/localization/i18n.js';
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

// Подставная память браузера и хранилище поверх неё.
function makeStorage(initial = {}) {
  const memory = new Map(Object.entries(initial).map(([key, value]) => [`one_more_run_${key}`, JSON.stringify(value)]));
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); }
  };
  const storage = new StorageService();
  const raw = (key) => (memory.has(`one_more_run_${key}`) ? JSON.parse(memory.get(`one_more_run_${key}`)) : undefined);
  return { storage, raw };
}

// ---- (а) дата

await check('date: the game day changes at midnight Moscow time, across month, year and leap day', () => {
  const at = (iso) => gameDay(Date.parse(iso));
  assert(at('2026-10-05T20:59:59Z') === '2026-10-05' && at('2026-10-05T21:00:00Z') === '2026-10-06', 'the day changes at 21:00 UTC (00:00 Moscow)');
  assert(at('2026-12-31T21:00:00Z') === '2027-01-01', 'new year');
  assert(at('2028-02-28T21:00:00Z') === '2028-02-29' && at('2028-02-29T21:00:00Z') === '2028-03-01', 'leap day');
  assert(at('2027-02-28T21:00:00Z') === '2027-03-01', 'a year without a leap day');
  assert(gameDay(Date.parse('2026-10-05T12:00:00Z'), 0) === '2026-10-05' && gameDay(Date.parse('2026-10-05T23:30:00Z'), 0) === '2026-10-05', 'an explicit offset is honoured');
  for (const bad of [NaN, undefined, 'abc', Infinity, {}]) assert(gameDay(bad) === null, `gameDay(${String(bad)}) must be null`);
});

await check('date: only real calendar dates are accepted; the previous day crosses month and year', () => {
  for (const good of ['2026-10-05', '2028-02-29', '2026-12-31', '2000-01-01']) assert(isDay(good), `${good} is a day`);
  for (const bad of ['2026-02-31', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-5', '2026-10-5', 20261005, null, undefined, '', '2026-10-05T00:00:00Z', ' 2026-10-05']) {
    assert(!isDay(bad), `${JSON.stringify(bad)} is not a day`);
  }
  assert(previousDay('2026-03-01') === '2026-02-28' && previousDay('2028-03-01') === '2028-02-29', 'month and leap day');
  assert(previousDay('2027-01-01') === '2026-12-31' && previousDay('2026-10-05') === '2026-10-04', 'year and plain day');
});

// ---- (б) зерно и награда

await check('seed: one day gives one seed, different days give different seeds', () => {
  assert(dailySeed('2026-10-05') === dailySeed('2026-10-05'), 'the same day, the same seed');
  const seeds = new Set();
  let day = '2026-10-05';
  for (let i = 0; i < 120; i += 1) {
    const seed = dailySeed(day);
    assert(Number.isInteger(seed) && seed >= 1 && seed <= 4294967295, `seed ${seed} of ${day} is not a 32-bit positive integer`);
    seeds.add(seed);
    day = gameDay(Date.parse(`${day}T00:00:00Z`) + 86400000, 0);
  }
  assert(seeds.size === 120, `only ${seeds.size} different seeds in 120 days`);
});

await check('reward: 5, 7, 9, 11, 13, 15 and then 15; never more than the maximum, never less than the base', () => {
  const rewards = [1, 2, 3, 4, 5, 6, 7, 8, 30].map(dailyReward);
  assert(rewards.join() === '5,7,9,11,13,15,15,15,15', `rewards ${rewards}`);
  for (const bad of [0, -3, NaN, undefined, 'x']) assert(dailyReward(bad) === CONFIG.DAILY.REWARD_BASE, `dailyReward(${String(bad)}) must be the base`);
  assert(rewards.slice(0, 7).reduce((a, b) => a + b, 0) === 75, 'a week of streak pays 75');
  assert(dailyReward(1) + dailyReward(2) >= CONFIG.SHOP.SKINS[1].price, 'two daily runs pay for the first skin');
  assert(dailyReward(1) < CONFIG.SHOP.SKINS[1].price, 'one daily run alone does not buy the first skin: the streak matters');
});

// ---- (в) серия

await check('streak: the first run of a day pays and starts a streak; replays pay nothing but keep the best of the day', () => {
  const { storage, raw } = makeStorage();
  const daily = new Daily(storage);
  assert(daily.nextReward('2026-10-05') === 5 && daily.streakAt('2026-10-05') === 0 && !daily.playedToday('2026-10-05'), 'a new player: reward 5, no streak');
  const first = daily.complete(120, '2026-10-05');
  assert(first.reward === 5 && first.streak === 1 && first.best === 120 && first.first === true, JSON.stringify(first));
  assert(raw('dailyDay') === '2026-10-05' && raw('dailyStreak') === 1 && raw('dailyBest') === 120, 'saved');
  assert(daily.playedToday('2026-10-05') && daily.nextReward('2026-10-05') === 0 && daily.bestToday('2026-10-05') === 120, 'after the run: played, nothing more to earn');
  const worse = daily.complete(90, '2026-10-05');
  assert(worse.reward === 0 && worse.first === false && worse.best === 120 && worse.streak === 1, 'a worse replay changes nothing');
  const better = daily.complete(300, '2026-10-05');
  assert(better.reward === 0 && better.best === 300 && daily.bestToday('2026-10-05') === 300, 'a better replay raises the best of the day only');
  assert(new Daily(storage).state().streak === 1 && new Daily(storage).bestToday('2026-10-05') === 300, 'survives a restart');
});

await check('streak: the next day continues it, a skipped day breaks it, month and year borders work', () => {
  const { storage } = makeStorage();
  const daily = new Daily(storage);
  daily.complete(100, '2026-10-30');
  assert(daily.streakAt('2026-10-31') === 1 && daily.nextReward('2026-10-31') === 7, 'the next morning: the streak is alive, 7 coins waiting');
  const second = daily.complete(50, '2026-10-31');
  assert(second.streak === 2 && second.reward === 7 && second.best === 50, 'the best of the day starts over each day');
  const third = daily.complete(10, '2026-11-01'); // через границу месяца
  assert(third.streak === 3 && third.reward === 9, 'across the month border');
  assert(daily.streakAt('2026-11-03') === 0 && daily.nextReward('2026-11-03') === 5, 'a missed day breaks the streak');
  const again = daily.complete(10, '2026-11-03');
  assert(again.streak === 1 && again.reward === 5 && again.first, 'starting over pays the base reward');
  const { storage: year } = makeStorage();
  const yearly = new Daily(year);
  yearly.complete(1, '2026-12-31');
  assert(yearly.complete(1, '2027-01-01').streak === 2, 'across the year border');
  let streak = 0;
  const { storage: week } = makeStorage();
  const weekly = new Daily(week);
  let day = '2026-10-01';
  for (let i = 0; i < 9; i += 1) {
    streak = weekly.complete(1, day).streak;
    day = gameDay(Date.parse(`${day}T00:00:00Z`) + 86400000, 0);
  }
  assert(streak === 9, 'nine days in a row');
});

await check('streak: a day from the future, a wrong date and bad scores change nothing harmful', () => {
  const { storage, raw } = makeStorage({ dailyDay: '2026-10-10', dailyStreak: 4, dailyBest: 50 });
  const daily = new Daily(storage);
  const early = daily.complete(999, '2026-10-05');
  assert(early.reward === 0 && early.first === false, 'no reward while the saved day is in the future (device clock was set back)');
  assert(raw('dailyDay') === '2026-10-10' && raw('dailyStreak') === 4 && raw('dailyBest') === 50, 'the saved state stays as it was');
  assert(daily.complete(5, 'not-a-date') === null && daily.complete(5, undefined) === null, 'a wrong date means no result');
  const { storage: fresh } = makeStorage();
  const clean = new Daily(fresh);
  for (const bad of [NaN, -5, undefined, 'abc', Infinity]) assert(clean.complete(bad, '2026-10-05').best === 0, `score ${String(bad)} counts as 0`);
  assert(makeStorage({ dailyDay: 'x', dailyStreak: 'y', dailyBest: 'z' }).storage && new Daily(new StorageService()).state().day === null, 'garbage in the save means "never played"');
  const { storage: broken } = makeStorage({ dailyDay: '2026-10-05', dailyStreak: -7, dailyBest: 'q' });
  const state = new Daily(broken).state();
  assert(state.streak === 1 && state.best === 0, 'a broken streak or best is repaired');
});

// ---- (г) облако

await check('cloud: the later day wins, the same day takes the bigger numbers, old and future days are ignored', () => {
  const today = '2026-10-05';
  const { storage } = makeStorage({ dailyDay: '2026-10-04', dailyStreak: 3, dailyBest: 500 });
  const daily = new Daily(storage);
  assert(daily.merge({ dailyDay: '2026-10-05', dailyStreak: 4, dailyBest: 80 }, today) === true, 'a later day is taken');
  assert(daily.state().day === '2026-10-05' && daily.state().streak === 4 && daily.state().best === 80, 'taken as it is');
  assert(daily.merge({ dailyDay: '2026-10-05', dailyStreak: 4, dailyBest: 80 }, today) === false, 'the same data twice changes nothing');
  assert(daily.merge({ dailyDay: '2026-10-05', dailyStreak: 6, dailyBest: 200 }, today) === true && daily.state().streak === 6 && daily.state().best === 200, 'the same day: bigger numbers win');
  assert(daily.merge({ dailyDay: '2026-10-05', dailyStreak: 2, dailyBest: 10 }, today) === false && daily.state().streak === 6, 'smaller numbers change nothing');
  assert(daily.merge({ dailyDay: '2026-10-01', dailyStreak: 99, dailyBest: 9999 }, today) === false && daily.state().streak === 6, 'an older day is ignored');
  assert(daily.merge({ dailyDay: '2026-10-09', dailyStreak: 99, dailyBest: 9999 }, today) === false && daily.state().day === '2026-10-05', 'a day from the future is ignored');
  const { storage: fresh } = makeStorage();
  assert(new Daily(fresh).merge({ dailyDay: '2026-10-04', dailyStreak: 5, dailyBest: 40 }, today) === true, 'a new device takes the cloud');
  assert(new Daily(fresh).streakAt(today) === 5, 'and the streak is still alive the next morning');
});

await check('cloud: garbage never changes anything; a streak below 1 is repaired; the snapshot round-trips', () => {
  const { storage } = makeStorage({ dailyDay: '2026-10-05', dailyStreak: 2, dailyBest: 70 });
  const daily = new Daily(storage);
  for (const bad of [null, undefined, 'x', 5, [], {}, { dailyDay: 'x' }, { dailyDay: '2026-02-31' }, { dailyDay: 20261005 }]) {
    assert(daily.merge(bad, '2026-10-05') === false, `${JSON.stringify(bad)} must be ignored`);
  }
  assert(daily.merge({ dailyDay: '2026-10-05', dailyStreak: 2, dailyBest: 70 }, 'not-a-date') === false, 'no merge without a trusted today');
  assert(JSON.stringify(daily.state()) === JSON.stringify({ day: '2026-10-05', streak: 2, best: 70 }), 'nothing changed');
  const snap = daily.snapshot();
  assert(snap.dailyDay === '2026-10-05' && snap.dailyStreak === 2 && snap.dailyBest === 70, JSON.stringify(snap));
  // Дальше новые хранилища (каждое подменяет общую память браузера, поэтому прежнее больше не трогаем).
  const { storage: other } = makeStorage();
  const target = new Daily(other);
  target.merge({ dailyDay: '2026-10-05', dailyStreak: -4, dailyBest: 'abc' }, '2026-10-05');
  assert(target.state().streak === 1 && target.state().best === 0, 'a streak below 1 becomes 1, a bad best becomes 0');
  const empty = new Daily(makeStorage().storage).snapshot();
  assert(empty.dailyDay === null && empty.dailyStreak === 0 && empty.dailyBest === 0, 'an empty snapshot');
  assert(['dailyDay', 'dailyStreak', 'dailyBest'].every((key) => CONFIG.YANDEX.CLOUD_KEYS.includes(key)), 'the keys are requested back from the cloud');
});

// ---- (д) трасса

// Подпись трассы: что стоит в первых рядах (смещения от начала ряда, чтобы не зависеть от кадра создания).
function trackSignature(seed, assist, fps, seconds = 40, canonical = true) {
  const track = new Track();
  track.setSeed(seed);
  track.setAssist(assist);
  track.setCanonicalClock(canonical);
  track.reset();
  const seen = new Set();
  const rows = [];
  let time = 0;
  const dt = 1 / fps;
  while (time < seconds) {
    time += dt;
    const speed = 300 + 420 * (1 - Math.exp(-time / 70));
    track.update(dt, speed, time);
    for (const segment of track.segments) {
      if (seen.has(segment.id)) continue;
      seen.add(segment.id);
      rows.push([
        segment.id, segment.type, segment.pattern,
        segment.obstacles.map((o) => [o.x, o.width, Math.round(o.y - segment.y)]),
        segment.coins.map((c) => [c.x, Math.round(c.y - segment.y)])
      ]);
    }
  }
  return JSON.stringify(rows.slice(0, 18));
}

await check('track: the daily track is the same for everyone at any frame rate; another day or another help makes another track', () => {
  const seed = dailySeed('2026-10-05');
  const base = trackSignature(seed, CONFIG.DAILY.ASSIST, 60);
  assert(base.length > 800, 'the signature must contain real rows');
  for (const fps of [10, 30, 120]) assert(trackSignature(seed, CONFIG.DAILY.ASSIST, fps) === base, `the track differs at ${fps} FPS`);
  // Много дней и «неудобные» частоты кадров: ряд создаётся на разное расстояние после границы.
  let day = '2026-10-05';
  for (let i = 0; i < 8; i += 1) {
    const reference = trackSignature(dailySeed(day), CONFIG.DAILY.ASSIST, 120, 60);
    for (const fps of [7, 24, 45, 59, 90, 144]) {
      assert(trackSignature(dailySeed(day), CONFIG.DAILY.ASSIST, fps, 60) === reference, `${day}: the track differs at ${fps} FPS`);
    }
    day = gameDay(Date.parse(`${day}T00:00:00Z`) + 86400000, 0);
  }
  assert(trackSignature(dailySeed('2026-10-06'), CONFIG.DAILY.ASSIST, 60) !== base, 'another day must give another track');
  // Поэтому помощь новичку в забеге дня одна для всех: с разной помощью проходы разной ширины, трассы расходятся.
  assert(trackSignature(seed, 0, 60) !== base && trackSignature(seed, 1, 60) !== base, 'a different assist makes a different track');
  assert(CONFIG.DAILY.ASSIST > 0 && CONFIG.DAILY.ASSIST < 1, 'the daily help is a fixed middle value');
});

await check('track: the ideal moment of a row follows from the distance; the inverse of the distance is exact', () => {
  assert(getTrackDistance(0) === 0 && getTimeAtDistance(0) === 0, 'zero is zero');
  let previous = -1;
  for (const t of [0.5, 1, 5, 17.3, 60, 120, 400, 2000]) {
    const d = getTrackDistance(t);
    assert(d > previous, 'the distance grows');
    previous = d;
    assert(Math.abs(getTimeAtDistance(d) - t) < 1e-6, `time at the distance of ${t} s is ${getTimeAtDistance(d)}`);
    assert(getTimeAtDistance(d) === getTimeAtDistance(d), 'the same answer every time');
  }
  // Скорость в идеальный момент n-го ряда — настоящая скорость трассы, а сам момент не зависит от кадров.
  const track = new Track();
  assert(track.firstTriggerDistance === 240 && track.createdByUpdate === 0, `first trigger ${track.firstTriggerDistance}`);
  assert(track.canonical === false, 'ordinary runs keep the real clock');
});

// ---- (е) игра

function makeGame({ state = 'START', best = 10, coins = 0, extra = {} } = {}) {
  const env = makeStorage();
  env.storage.addCoins(coins);
  const calls = { submitted: [], saved: [], sounds: [], launched: 0, reviews: 0 };
  const game = Object.assign(Object.create(Game.prototype), {
    state,
    isRunning: true,
    hidden: false,
    storage: env.storage,
    shop: new Shop(env.storage),
    daily: new Daily(env.storage),
    clockOffset: 0,
    shopWindow: null,
    leaderboard: null,
    launchPending: false,
    rewardPending: false,
    dailyRun: false,
    dailyPending: false,
    dailyResult: null,
    userPaused: false,
    coins: env.storage.getCoins(),
    bestScore: best,
    choiceHintSeen: true,
    riskHintSeen: true,
    distanceScore: 300,
    pathReward: 200,
    multiplier: 1,
    riskStreak: 0,
    reviveUsed: false,
    isNewBest: false,
    player: { x: 1, y: 1, reset() {}, invulnerable: 0 },
    track: new Track(),
    feel: null,
    camera: null,
    audio: { play: (name) => calls.sounds.push(name), muted: false },
    haptics: { pulse() {} },
    platform: {
      completedRuns: 0,
      submitScore: async (score) => { calls.submitted.push(score); return true; },
      requestReview: async () => { calls.reviews += 1; return { asked: true }; },
      recordRunCompleted() { this.completedRuns += 1; },
      saveCloudData: (data) => { calls.saved.push(data); return true; }
    },
    renderer: null,
    syncGameplayLifecycle() {},
    gameOverInputLocked: () => false,
    ...extra
  });
  return { game, calls, env };
}

// Забег дня до проигрыша со счётом score (start() обнуляет очки, поэтому счёт ставим после него).
function playDaily(game, score) {
  const log = console.log;
  console.log = () => {};
  try {
    game.state = 'START';
    game.dailyPending = true;
    game.start();
    game.distanceScore = score;
    game.pathReward = 0;
    game.gameOver();
  } finally {
    console.log = log;
  }
}

await check('game: the daily run starts with the seed of today and the fixed help; a normal run after it is normal again', () => {
  const { game } = makeGame({ best: 5000 });
  game.devDay = '2026-10-05';
  assert(game.startDaily() === true && game.state === 'PLAYING' && game.dailyRun === true, 'the daily run starts');
  assert(game.track.seed === dailySeed('2026-10-05'), `track seed ${game.track.seed}`);
  assert(game.track.assist === CONFIG.DAILY.ASSIST, `help ${game.track.assist} (a player with a big record must not get a harder track)`);
  assert(game.dailyPending === false, 'the flag is spent');
  assert(game.track.canonical === true, 'the daily track is built at the ideal moments, so it is the same at any frame rate');
  game.state = 'GAMEOVER';
  assert(game.tryLaunch() === true && game.state === 'PLAYING', 'the next run starts');
  assert(game.dailyRun === false && game.track.seed === null && game.track.canonical === false, 'an ordinary restart is an ordinary run with a random track and the real clock');
  assert(game.track.assist === getAssist(5000), 'and the normal help for this player');
  const { game: newcomer } = makeGame({ best: 0 });
  newcomer.devDay = '2026-10-05';
  newcomer.startDaily();
  assert(newcomer.track.assist === CONFIG.DAILY.ASSIST, 'a newcomer gets the same fixed help, so the track is the same as for everyone');
});

await check('game: the daily run can only be started from the start screen and not over a window', () => {
  for (const state of ['PLAYING', 'GAMEOVER']) {
    const { game } = makeGame({ state });
    assert(game.startDaily() === false && game.dailyPending === false && game.dailyRun === false, `${state}: refused, nothing left behind`);
  }
  const shop = makeGame();
  shop.game.shopWindow = { message: null };
  assert(shop.game.startDaily() === false && shop.game.state === 'START' && shop.game.dailyPending === false, 'refused behind the shop');
  const board = makeGame();
  board.game.leaderboard = { status: 'ready' };
  assert(board.game.startDaily() === false && board.game.dailyPending === false, 'refused behind the leaderboard');
  const busy = makeGame();
  busy.game.launchPending = true;
  assert(busy.game.startDaily() === false && busy.game.dailyPending === false, 'while an ad is about to start: refused and the flag does not linger');
  busy.game.launchPending = false;
  busy.game.start();
  assert(busy.game.dailyRun === false, 'a later ordinary run is not a daily one');
});

await check('game: a daily run keeps the record, the leaderboard and the rating request untouched', () => {
  const { game, calls } = makeGame({ best: 100 });
  game.devDay = '2026-10-05';
  game.platform.completedRuns = 10;
  game.startDaily();
  game.distanceScore = 4000;
  game.pathReward = 1000;
  const log = console.log;
  console.log = () => {};
  try {
    game.gameOver();
  } finally {
    console.log = log;
  }
  assert(game.state === 'GAMEOVER' && game.bestScore === 100 && game.isNewBest === false, 'the record stays 100 even though the run scored 5000');
  assert(game.storage.get('bestScore', 0) === 0 || game.storage.get('bestScore', 0) !== 5000, 'the saved record is not overwritten');
  assert(calls.submitted.length === 0, 'nothing is sent to the leaderboard');
  assert(game.maybeAskForReview() === false && calls.reviews === 0, 'no rating request after a daily run');
  assert(game.dailyResult.best === 5000 && game.dailyResult.first === true, 'the best of the day is recorded');

  const normal = makeGame({ best: 100 });
  normal.game.distanceScore = 4000;
  normal.game.pathReward = 1000;
  console.log = () => {};
  try {
    normal.game.gameOver();
  } finally {
    console.log = log;
  }
  assert(normal.game.bestScore === 5000 && normal.game.isNewBest === true && normal.calls.submitted.join() === '5000', 'an ordinary run still sets the record and goes to the table');
});

await check('game: the reward is paid once per day, counts as earned coins, goes to the cloud, and a revive does not pay twice', () => {
  const { game, calls } = makeGame({ coins: 3 });
  game.devDay = '2026-10-05';
  playDaily(game, 500);
  assert(game.coins === 8 && game.storage.getCoins() === 8, `coins ${game.coins}: 3 + the reward of 5`);
  assert(game.dailyResult.reward === 5 && game.dailyResult.streak === 1 && game.dailyResult.first, JSON.stringify(game.dailyResult));
  assert(game.storage.coinCounters().earned === 8, 'the reward is "earned"');
  assert(calls.sounds.includes('buy'), 'a reward sound');
  const saved = calls.saved.at(-1);
  assert(saved.dailyDay === '2026-10-05' && saved.dailyStreak === 1 && saved.dailyBest === 500 && saved.coins === 8, `cloud snapshot ${JSON.stringify(saved)}`);
  // Возрождение: тот же забег заканчивается второй раз, уже с большим счётом.
  const log = console.log;
  console.log = () => {};
  try {
    game.state = 'PLAYING';
    game.distanceScore = 1100;
    game.pathReward = 0;
    game.gameOver();
  } finally {
    console.log = log;
  }
  assert(game.coins === 8, 'no second payment for the same day');
  assert(game.dailyResult.reward === 5 && game.dailyResult.best === 1100 && game.dailyResult.first, 'the note about the reward stays and the best of the day grows');
  // Новый забег того же дня: награды нет.
  playDaily(game, 200);
  assert(game.coins === 8 && game.dailyResult.reward === 0 && game.dailyResult.first === false && game.dailyResult.best === 1100, 'a replay pays nothing and keeps the best of the day');
  // Следующий день: серия растёт.
  game.devDay = '2026-10-06';
  playDaily(game, 300);
  assert(game.dailyResult.streak === 2 && game.dailyResult.reward === 7 && game.coins === 15, `day two: streak ${game.dailyResult.streak}, coins ${game.coins}`);
  assert(game.storage.coinCounters().earned === 15 && game.storage.coinCounters().spent === 0, 'rewards are earned coins');
});

await check('game: the server clock decides what "today" is; bad answers are ignored', async () => {
  const noon = Date.parse('2026-10-05T09:00:00Z');
  const { game } = makeGame({ extra: { platform: { getServerTime: async () => noon + 3 * 86400000 } } });
  assert(await game.syncClock() === true, 'a good server time is taken');
  assert(Math.abs(game.nowMs() - (noon + 3 * 86400000)) < 5000, 'now follows the server');
  assert(game.todayKey() === '2026-10-08', `today ${game.todayKey()}`);
  const offsetBefore = game.clockOffset;
  for (const bad of [null, undefined, NaN, 0, -5, 'x', Infinity]) {
    game.platform = { getServerTime: async () => bad };
    assert(await game.syncClock() === false && game.clockOffset === offsetBefore, `${String(bad)} must be ignored`);
  }
  game.platform = { getServerTime: async () => { throw new Error('offline'); } };
  assert(await game.syncClock() === false && game.clockOffset === offsetBefore, 'a failing platform must not change the clock');
  game.platform = null;
  assert(await game.syncClock() === false, 'no platform: the device clock stays');
  const { game: plain } = makeGame();
  assert(plain.todayKey() === gameDay(Date.now()), 'without a server the device clock is used');
  plain.devDay = '2030-01-01';
  assert(plain.todayKey() === '2030-01-01', 'the developer day wins');
});

await check('game: the view for the button follows the day; the cloud brings a streak from another device', () => {
  const { game } = makeGame();
  game.devDay = '2026-10-05';
  assert(JSON.stringify(game.dailyView()) === JSON.stringify({ played: false, reward: 5, streak: 0, best: 0 }), JSON.stringify(game.dailyView()));
  playDaily(game, 500);
  assert(JSON.stringify(game.dailyView()) === JSON.stringify({ played: true, reward: 0, streak: 1, best: 500 }), JSON.stringify(game.dailyView()));
  game.devDay = '2026-10-06';
  assert(JSON.stringify(game.dailyView()) === JSON.stringify({ played: false, reward: 7, streak: 1, best: 0 }), 'next morning: 7 coins wait and the streak is alive');
  game.devDay = '2026-10-09';
  assert(game.dailyView().streak === 0 && game.dailyView().reward === 5, 'after a break: the streak is gone');
  const other = makeGame();
  other.game.devDay = '2026-10-05';
  assert(other.game.applyCloudData({ dailyDay: '2026-10-04', dailyStreak: 4, dailyBest: 10 }) === true, 'the cloud changes a new device');
  assert(other.game.dailyView().streak === 4 && other.game.dailyView().reward === 13, 'the streak from the other device is alive: the 5th day pays 13');
  assert(other.game.applyCloudData({ dailyDay: '2027-01-01', dailyStreak: 50, dailyBest: 1 }) === false, 'a day from the future is ignored');
});

// ---- (ж) рисование

function recordingContext() {
  const texts = [];
  const ctx = new Proxy({ texts, measureText: (text) => ({ width: String(text).length * 9 }) }, {
    get: (target, key) => {
      if (key === 'fillText') return (text) => texts.push(String(text));
      return key in target ? target[key] : () => ({ addColorStop() {} });
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });
  return { ctx, texts };
}
const inside = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= CONFIG.CANVAS_WIDTH && r.y + r.h <= CONFIG.CANVAS_HEIGHT;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

await check('drawing: the daily button sits inside the start card, is big enough, and clears the sound and platform rows', () => {
  const { ctx } = recordingContext();
  const renderer = new Renderer(ctx);
  const show = { shop: true, leaderboard: true, shortcut: true, daily: { played: false, reward: 5, streak: 0, best: 0 } };
  renderer.drawStartScreen(false, 0.5, show);
  const button = renderer.dailyButton;
  assert(button && inside(button) && button.h >= 44 && button.w >= 200, `button ${JSON.stringify(button)}`);
  assert(renderer.hitDailyButton(button.x + button.w / 2, button.y + button.h / 2), 'its centre hits');
  assert(!renderer.hitDailyButton(button.x - 30, button.y + button.h / 2) && !renderer.hitDailyButton(20, 20), 'a tap beside it does not');
  Object.values(renderer.platformButtons).forEach((r) => {
    assert(inside(r) && !overlap(r, button), 'a platform button is off screen or touches the daily button');
  });
  Object.values(renderer.soundButtons).forEach((s) => assert(!overlap(s, button), 'the sound row touches the daily button'));
  renderer.drawStartScreen(false, 0.5, { shop: true });
  assert(renderer.dailyButton === null && renderer.hitDailyButton(200, 600) === false, 'without the daily info there is no button and the old layout');
});

await check('drawing: the button text follows the state — fresh, streak alive, played today — in both languages', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const dict = DICTIONARIES[lang].daily;
      const { ctx, texts } = recordingContext();
      const renderer = new Renderer(ctx);
      const draw = (daily) => {
        texts.length = 0;
        renderer.drawStartScreen(false, 0.5, { daily });
        return texts.join('|');
      };
      const fresh = draw({ played: false, reward: 5, streak: 0, best: 0 });
      assert(fresh.includes(dict.button) && fresh.includes(dict.subFresh.replace('{n}', '5')) && !fresh.includes('•  S') && !/СЕРИЯ|STREAK/.test(fresh), `${lang} fresh: ${fresh}`);
      const alive = draw({ played: false, reward: 11, streak: 4, best: 0 });
      assert(alive.includes(dict.subStreak.replace('{n}', '11').replace('{s}', '4')), `${lang} streak: ${alive}`);
      const done = draw({ played: true, reward: 0, streak: 4, best: 1234 });
      assert(done.includes(dict.subDone.replace('{n}', '1234').replace('{s}', '4')), `${lang} done: ${done}`);
    }
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: the game over screen of a daily run shows the reward or the title and the best of the day, not the record', () => {
  const saved = getLanguage();
  try {
    setLanguage('en');
    const { ctx, texts } = recordingContext();
    const renderer = new Renderer(ctx);
    const text = (extras) => {
      texts.length = 0;
      renderer.drawGameOver(120, 500, 7, 1, { leaderboard: true, ...extras });
      return texts.join('|');
    };
    const paid = text({ daily: { reward: 7, streak: 2, best: 120, first: true } });
    assert(paid.includes('+7 COINS  •  STREAK 2') && paid.includes("TODAY'S BEST 120"), paid);
    assert(!paid.includes('BEST 500') && !paid.includes('NEW BEST') && !/TO NEW BEST/.test(paid), 'no record text after a daily run');
    const replay = text({ daily: { reward: 0, streak: 2, best: 300, first: false } });
    assert(replay.includes('DAILY RUN') && replay.includes("TODAY'S BEST 300") && !replay.includes('+0'), replay);
    const normal = text({ isNewBest: false });
    assert(normal.includes('BEST 500') && !normal.includes('DAILY RUN'), 'an ordinary game over is unchanged');
    // Места кнопок на экране проигрыша от забега дня не зависят.
    text({ daily: { reward: 7, streak: 2, best: 120, first: true } });
    const withDaily = JSON.stringify(renderer.platformButtons);
    text({});
    assert(withDaily === JSON.stringify(renderer.platformButtons), 'the buttons keep their places');
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: tapping the daily button starts a daily run, any other tap an ordinary one', () => {
  const { ctx } = recordingContext();
  const { game } = makeGame();
  game.renderer = new Renderer(ctx);
  game.handleSoundTap = () => false;
  game.devDay = '2026-10-05';
  game.renderer.drawStartScreen(false, 0.5, { daily: game.dailyView() });
  const b = game.renderer.dailyButton;
  game.handleTap(b.x + b.w / 2, b.y + b.h / 2);
  assert(game.state === 'PLAYING' && game.dailyRun === true, 'the button starts the daily run');

  const { game: other } = makeGame();
  other.renderer = new Renderer(ctx);
  other.handleSoundTap = () => false;
  other.devDay = '2026-10-05';
  other.renderer.drawStartScreen(false, 0.5, { daily: other.dailyView() });
  other.handleTap(10, 10);
  assert(other.state === 'PLAYING' && other.dailyRun === false, 'a tap elsewhere starts an ordinary run');

  const { game: sheltered } = makeGame();
  sheltered.renderer = new Renderer(ctx);
  sheltered.handleSoundTap = () => false;
  sheltered.renderer.drawStartScreen(false, 0.5, { daily: sheltered.dailyView() });
  sheltered.shopWindow = { message: null };
  sheltered.renderer.shopButtons = { close: null, skins: [] };
  const sb = sheltered.renderer.dailyButton;
  sheltered.handleTap(sb.x + sb.w / 2, sb.y + sb.h / 2);
  assert(sheltered.state === 'START' && sheltered.dailyRun === false, 'with the shop open the daily button is out of reach');
});

await check('strings: the daily texts exist in both languages with the right placeholders', () => {
  const need = { button: [], title: [], subFresh: ['{n}'], subStreak: ['{n}', '{s}'], subDone: ['{n}', '{s}'], reward: ['{n}', '{s}'], todayBest: ['{n}'] };
  for (const lang of ['en', 'ru']) {
    for (const [key, placeholders] of Object.entries(need)) {
      const text = DICTIONARIES[lang].daily?.[key];
      assert(text, `${lang}: daily.${key} is missing`);
      for (const p of placeholders) assert(text.includes(p), `${lang}: daily.${key} needs ${p}`);
    }
  }
});

// ---- (з) время сервера

function makeYandex(sdk, ready = true) {
  const service = new YandexService({ config: { ...CONFIG.YANDEX }, logger: { warn() {}, error() {}, info() {}, log() {}, debug() {} } });
  if (ready) {
    service.state = 'ready';
    service.ysdk = sdk;
  }
  return service;
}

await check('platform: getServerTime reads ysdk.serverTime (number or promise) and says null for anything else', async () => {
  const ms = Date.parse('2026-10-05T12:00:00Z');
  assert(await makeYandex({ serverTime: () => ms }).getServerTime() === ms, 'a number');
  assert(await makeYandex({ serverTime: async () => ms }).getServerTime() === ms, 'a promise');
  assert(await makeYandex({ serverTime: () => String(ms) }).getServerTime() === ms, 'a numeric string is read as a number');
  for (const bad of [NaN, 0, -1, 'abc', undefined, null, {}, Infinity]) {
    assert(await makeYandex({ serverTime: () => bad }).getServerTime() === null, `${String(bad)} must give null`);
  }
  assert(await makeYandex({ serverTime: () => { throw new Error('x'); } }).getServerTime() === null, 'a throwing SDK gives null');
  assert(await makeYandex({ serverTime: async () => { throw new Error('x'); } }).getServerTime() === null, 'a rejected promise gives null');
  assert(await makeYandex({}).getServerTime() === null, 'an SDK without serverTime gives null');
  assert(await makeYandex(null, false).getServerTime() === null, 'no SDK at all gives null');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1o checks passed');
}
