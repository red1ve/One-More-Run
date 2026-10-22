// Фаза 5а: достижения (десять целей на всё время игры, без монет: значок и плашка).
//  (а) настройки и строки: числа целей разумны, у каждого достижения есть название и описание на двух языках;
//  (б) модуль: выдача один раз, порядок, мусор в сохранении, серия дней с заданиями;
//  (в) накопительные цели: порог ровно на границе, повторно не выдаются, мусорная сводка ничего не ломает;
//  (г) облако: слияние объединяет, серия дней ведёт себя как серия забега дня, ключи совпадают с запрошенными;
//  (д) игра: каждое достижение выдаётся в нужный момент (не раньше), плашка, звук, окно, старые данные без плашки;
//  (е) рисование: кнопка в любой комбинации кнопок, окно на двух языках, плашка.
// Запуск: node scripts/phase5a-check.mjs (входит в npm run check).
import { CONFIG } from '../src/config.js';
import { ACHIEVEMENT_IDS, Achievements, achievementNumber } from '../src/game/Achievements.js';
import { Daily } from '../src/game/Daily.js';
import { Game } from '../src/game/Game.js';
import { Quests } from '../src/game/Quests.js';
import { Shop } from '../src/game/Shop.js';
import { Track } from '../src/game/Track.js';
import { DICTIONARIES, getLanguage, setLanguage } from '../src/localization/i18n.js';
import { Renderer } from '../src/rendering/Renderer.js';
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

const DAY = '2026-10-05';
const days = (from, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));

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
  return { storage, raw, memory };
}

const CFG = CONFIG.ACHIEVEMENTS;
const REGULAR = CONFIG.SHOP.SKINS.filter((skin) => !skin.limited).map((skin) => skin.id);
const EMPTY_STATS = { coinsEarned: 0, skins: 1, skinsTotal: REGULAR.length, dailyStreak: 0, questStreak: 0 };

// ---- (а) настройки и строки

await check('config: the goals are whole numbers that fit the game (risk, close calls, multiplier, skins, days)', () => {
  for (const key of ['CLEAN_SECONDS', 'GRAZE_COMBO', 'RISK_STREAK', 'SURVIVE_SECONDS', 'COINS_TOTAL', 'SKINS_SOME', 'DAILY_STREAK', 'QUEST_DAYS']) {
    assert(Number.isInteger(CFG[key]) && CFG[key] > 0, `${key} is a positive whole number`);
  }
  assert(CFG.TOAST_SECONDS >= 2 && CFG.TOAST_SECONDS <= 5, 'the toast stays long enough to read and short enough not to block the view');
  assert(ACHIEVEMENT_IDS.length === 10 && new Set(ACHIEVEMENT_IDS).size === 10, 'ten different achievements (the owner approved ten)');
  // Узкие проходы подряд: серия растит множитель только со 2-го, значит, 3 подряд — настоящая серия, а не случайность.
  assert(CFG.RISK_STREAK > CONFIG.RISK_STREAK_TO_GROW, 'a risk streak goal is longer than the streak that already grows the multiplier');
  // «Впритирку» подряд не больше, чем даёт серия (больше BONUS_MAX шагов серии не растёт, а число считается без предела).
  assert(CFG.GRAZE_COMBO >= 3 && CFG.GRAZE_COMBO <= 8, 'a close-call goal is a real streak but not absurd');
  // Предельный множитель достижим целым числом шагов.
  const steps = (CONFIG.MULTIPLIER_MAX - CONFIG.MULTIPLIER_START) / CONFIG.MULTIPLIER_STEP;
  assert(Number.isInteger(steps) && steps >= 4, `the top multiplier ${CONFIG.MULTIPLIER_MAX} is reached in whole steps (${steps})`);
  // Скины: «несколько» меньше «всех» (без сезонного), монеты за всё время меньше цены всех скинов вместе.
  assert(CFG.SKINS_SOME < REGULAR.length, 'some skins is fewer than all of them');
  assert(REGULAR.length === CONFIG.SHOP.SKINS.length - 1 && !REGULAR.includes('halloween'), 'the seasonal skin is not part of "all skins"');
  const allPrices = CONFIG.SHOP.SKINS.filter((skin) => !skin.limited).reduce((sum, skin) => sum + skin.price, 0);
  assert(CFG.COINS_TOTAL < allPrices, 'the coin goal is reached before the last skin is bought');
  // Серии дней: хотя бы два дня, иначе это не серия. Забег без монет короче забега, который нужно пережить, а «долгий забег» — дольше.
  assert(CFG.QUEST_DAYS >= 2 && CFG.DAILY_STREAK >= 2, 'a streak of days is at least two days');
  assert(CFG.SURVIVE_SECONDS > CFG.CLEAN_SECONDS, 'a long run is longer than a clean run');
});

await check('strings: every achievement has a name and a description in both languages, the number is where the description needs it', () => {
  for (const lang of ['en', 'ru']) {
    const dict = DICTIONARIES[lang].achievements;
    for (const key of ['button', 'title', 'count', 'close', 'toast', 'progress']) assert(typeof dict[key] === 'string' && dict[key].length > 0, `${lang}: ${key}`);
    assert(dict.toast.includes('{name}') && dict.count.includes('{done}') && dict.count.includes('{total}'), `${lang}: placeholders`);
    assert(Object.keys(dict.name).sort().join() === ACHIEVEMENT_IDS.slice().sort().join(), `${lang}: a name for every achievement and no extra`);
    assert(Object.keys(dict.desc).sort().join() === ACHIEVEMENT_IDS.slice().sort().join(), `${lang}: a description for every achievement and no extra`);
    assert(new Set(Object.values(dict.name)).size === ACHIEVEMENT_IDS.length, `${lang}: names are different`);
    for (const id of ACHIEVEMENT_IDS) {
      const hasSlot = dict.desc[id].includes('{n}');
      assert(hasSlot === (achievementNumber(id) !== null), `${lang}: ${id} description ${hasSlot ? 'has' : 'lacks'} a number slot`);
      assert(dict.name[id] === dict.name[id].toUpperCase(), `${lang}: ${id} name is in capitals like the other screens`);
      assert(dict.desc[id].length <= 31, `${lang}: ${id} description "${dict.desc[id]}" is too long for its row`);
    }
  }
  assert(/[А-Яа-я]/.test(DICTIONARIES.ru.achievements.toast) && !/[А-Яа-я]/.test(DICTIONARIES.en.achievements.toast), 'each language reads in its own letters');
  assert(achievementNumber('fullWardrobe') === null && achievementNumber('topMultiplier') === CONFIG.MULTIPLIER_MAX && achievementNumber('piggyBank') === CFG.COINS_TOTAL, 'numbers come from the config');
  assert(achievementNumber('nonsense') === null, 'an unknown achievement has no number');
});

// ---- (б) модуль

await check('module: an achievement is given once, in the order of the window, and junk in the storage is ignored', () => {
  const { storage, raw } = makeStorage();
  const ach = new Achievements(storage);
  assert(ach.owned().length === 0 && ach.summary().done === 0 && ach.summary().total === 10, 'nothing at the start');
  assert(ach.unlock('weekStreak') === true && ach.unlock('weekStreak') === false, 'the second time it is not new');
  assert(ach.unlock('longRun') === true, 'another one');
  assert(ach.owned().join() === 'longRun,weekStreak' && raw('achievements').join() === 'longRun,weekStreak', 'saved in the order of the window, not of the receiving');
  assert(ach.unlock('nonsense') === false && ach.unlock(undefined) === false && ach.unlock(5) === false && ach.owned().length === 2, 'an unknown name is refused');
  assert(ach.has('longRun') && !ach.has('bold') && ach.summary().done === 2, 'has() and summary()');
  for (const junk of ['text', 7, { a: 1 }, null, [3, null, 'x', 'longRun']]) {
    const { storage: bad } = makeStorage({ achievements: junk });
    const owned = new Achievements(bad).owned();
    assert(owned.join() === (Array.isArray(junk) ? 'longRun' : ''), `junk ${JSON.stringify(junk)} gives "${owned}"`);
  }
});

await check('module: the streak of days with every quest done grows by a day, restarts after a gap and ignores a day from the future', () => {
  const { storage, raw } = makeStorage();
  const ach = new Achievements(storage);
  assert(ach.questStreakAt(DAY) === 0 && ach.noteQuestsDone('nonsense') === 0 && ach.noteQuestsDone(undefined) === 0, 'a wrong date does nothing');
  const [d1, d2, d3, d4, d5, d6] = days(DAY, 6);
  assert(ach.noteQuestsDone(d1) === 1 && ach.noteQuestsDone(d1) === 1, 'the first day, and the same day again does not grow it');
  assert(ach.noteQuestsDone(d2) === 2 && ach.noteQuestsDone(d2) === 2, 'the next day grows it, and the same day again keeps it (does not grow, does not restart)');
  assert(ach.noteQuestsDone(d3) === 3 && ach.noteQuestsDone(d3) === 3, 'and the next one');
  assert(ach.questStreakAt(d3) === 3 && ach.questStreakAt(d4) === 3, 'a streak lives today and tomorrow');
  assert(ach.questStreakAt(d5) === 0, 'two days later it is over');
  assert(ach.noteQuestsDone(d5) === 1 && raw('achQuestStreak') === 1 && raw('achQuestDay') === d5, 'after a gap it starts over');
  assert(ach.noteQuestsDone(d1) === 1 && raw('achQuestDay') === d5, 'a day before the last one (the clock was moved back) changes nothing');
  assert(ach.noteQuestsDone(d6) === 2, 'and the streak goes on');
  // Конец месяца и года не рвёт серию.
  const { storage: boundary } = makeStorage();
  const edge = new Achievements(boundary);
  edge.noteQuestsDone('2026-12-31');
  assert(edge.noteQuestsDone('2027-01-01') === 2, 'the year boundary keeps the streak');
});

// ---- (в) накопительные цели

await check('goals: every cumulative goal is reached exactly at its number, only once, and a junk summary breaks nothing', () => {
  const cases = [
    ['piggyBank', 'coinsEarned', CFG.COINS_TOTAL],
    ['wardrobe', 'skins', CFG.SKINS_SOME],
    ['fullWardrobe', 'skins', REGULAR.length],
    ['diligent', 'questStreak', CFG.QUEST_DAYS],
    ['weekStreak', 'dailyStreak', CFG.DAILY_STREAK]
  ];
  for (const [id, key, target] of cases) {
    const { storage } = makeStorage();
    const ach = new Achievements(storage);
    const before = ach.evaluate({ ...EMPTY_STATS, [key]: target - 1 });
    assert(!before.includes(id) && !ach.has(id), `${id}: one short is not enough`);
    const reached = ach.evaluate({ ...EMPTY_STATS, [key]: target });
    assert(reached.includes(id) && ach.has(id), `${id}: reached at ${target}`);
    assert(!ach.evaluate({ ...EMPTY_STATS, [key]: target + 5 }).includes(id), `${id}: not given twice`);
    assert(!ach.evaluate({ ...EMPTY_STATS, [key]: 0 }).includes(id) && ach.has(id), `${id}: a received one stays when the number drops (spent coins, a broken streak)`);
  }
  const { storage } = makeStorage();
  const ach = new Achievements(storage);
  for (const junk of [undefined, null, {}, { coinsEarned: 'abc', skins: -4, skinsTotal: NaN, dailyStreak: Infinity, questStreak: null }]) {
    const earned = ach.evaluate(junk || {});
    assert(Array.isArray(earned) && earned.length === 0, `junk summary gives ${JSON.stringify(earned)}`);
  }
  assert(new Achievements(makeStorage().storage).evaluate({ ...EMPTY_STATS, skins: 0, skinsTotal: 0 }).includes('fullWardrobe') === false, 'with no skins at all "all skins" is not done by zero');
});

await check('list: in-run goals have no counter, cumulative ones show the progress capped by the goal, a received one shows the goal', () => {
  const { storage } = makeStorage();
  const ach = new Achievements(storage);
  const items = ach.list({ ...EMPTY_STATS, coinsEarned: 120, skins: 3, dailyStreak: 20 });
  assert(items.map((item) => item.id).join() === ACHIEVEMENT_IDS.join(), 'the order of the window');
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  for (const id of ['longRun', 'bold', 'closeCalls', 'cleanRun', 'topMultiplier']) assert(byId[id].progress === null && byId[id].target === null, `${id}: no counter`);
  assert(byId.piggyBank.progress === 120 && byId.piggyBank.target === CFG.COINS_TOTAL, 'coins: 120 of the goal');
  assert(byId.wardrobe.progress === 3 && byId.fullWardrobe.target === REGULAR.length, 'skins');
  assert(byId.weekStreak.progress === CFG.DAILY_STREAK && byId.weekStreak.done === false, 'the progress never exceeds the goal (the streak is 20, the goal 7), and it is not "done" until given');
  assert(byId.longRun.number === CFG.SURVIVE_SECONDS && byId.fullWardrobe.number === null, 'the number for the description');
  ach.unlock('piggyBank');
  const after = ach.list({ ...EMPTY_STATS, coinsEarned: 0 });
  assert(after.find((item) => item.id === 'piggyBank').done && after.find((item) => item.id === 'piggyBank').progress === CFG.COINS_TOTAL, 'a received goal shows the goal even if the coins are spent');
});

// ---- (г) облако

await check('cloud: the list of received achievements is merged as a union, the quest streak follows the daily streak rules, nothing is lost', () => {
  const [d1, d2, d3, d4] = days(DAY, 4);
  const { storage } = makeStorage();
  const ach = new Achievements(storage);
  ach.unlock('bold');
  assert(ach.merge({ achievements: ['cleanRun', 'bold', 'nonsense'] }, d1) === true && ach.owned().join() === 'bold,cleanRun', 'union, unknown dropped');
  assert(ach.merge({ achievements: ['bold'] }, d1) === false && ach.merge({ achievements: [] }, d1) === false, 'merging the same or less is not a change');
  assert(ach.merge(null, d1) === false && ach.merge('x', d1) === false && ach.merge({ achievements: 'longRun' }, d1) === false, 'junk is not a change');
  // Серия дней: вычисляется как у забега дня.
  ach.noteQuestsDone(d2);
  assert(ach.merge({ achQuestDay: d3, achQuestStreak: 5 }, d3) === true && ach.questState().day === d3 && ach.questState().streak === 5, 'a later day wins');
  assert(ach.merge({ achQuestDay: d2, achQuestStreak: 9 }, d3) === false && ach.questState().streak === 5, 'an earlier day is ignored');
  assert(ach.merge({ achQuestDay: d3, achQuestStreak: 7 }, d3) === true && ach.questState().streak === 7, 'the same day: the bigger streak');
  assert(ach.merge({ achQuestDay: d3, achQuestStreak: 2 }, d3) === false, 'the same day: a smaller one is ignored');
  assert(ach.merge({ achQuestDay: d4, achQuestStreak: 4 }, d3) === false && ach.questState().day === d3, 'a day from the future (somebody else\'s clock) is ignored');
  assert(ach.merge({ achQuestDay: 'abc', achQuestStreak: 4 }, d3) === false, 'a wrong day is ignored');
  assert(ach.merge({ achQuestDay: d3, achQuestStreak: 7 }, d3) === false, 'the same data again is not a change');
});

await check('cloud: the snapshot carries exactly the new keys and they are requested back from the cloud', () => {
  const { storage } = makeStorage();
  const ach = new Achievements(storage);
  assert(Object.keys(ach.snapshot()).sort().join() === 'achQuestDay,achQuestStreak,achievements', 'the keys');
  const empty = ach.snapshot();
  assert(empty.achievements.length === 0 && empty.achQuestDay === null && empty.achQuestStreak === 0, 'an empty snapshot');
  ach.unlock('diligent');
  ach.noteQuestsDone(DAY);
  const filled = ach.snapshot();
  assert(filled.achievements.join() === 'diligent' && filled.achQuestDay === DAY && filled.achQuestStreak === 1, JSON.stringify(filled));
  for (const key of Object.keys(filled)) assert(CONFIG.YANDEX.CLOUD_KEYS.includes(key), `${key} is requested back from the cloud`);
});

// ---- (д) игра

function makeGame({ state = 'PLAYING', coins = 0, day = DAY, extra = {} } = {}) {
  const env = makeStorage();
  env.storage.addCoins(coins);
  const calls = { sounds: [], saved: [], pulses: [] };
  const game = Object.assign(Object.create(Game.prototype), {
    state,
    isRunning: true,
    hidden: false,
    storage: env.storage,
    shop: new Shop(env.storage),
    daily: new Daily(env.storage),
    quests: new Quests(env.storage),
    achievements: new Achievements(env.storage),
    clockOffset: 0,
    devDay: day,
    shopWindow: null,
    questsWindow: null,
    achievementsWindow: null,
    leaderboard: null,
    launchPending: false,
    rewardPending: false,
    dailyRun: false,
    dailyPending: false,
    dailyResult: null,
    userPaused: false,
    coins: env.storage.getCoins(),
    bestScore: 10,
    choiceHintSeen: true,
    riskHintSeen: true,
    score: 0,
    distanceScore: 0,
    pathReward: 0,
    multiplier: 1,
    riskStreak: 0,
    runTime: 0,
    runCoins: 0,
    reviveUsed: false,
    isNewBest: false,
    floatingRewards: [],
    questToasts: [],
    questWatch: [],
    achievementToasts: [],
    achRunWatch: { longRun: true, cleanRun: true },
    lastCoinAt: 0,
    runMaxMultiplier: 1,
    questRunCounted: false,
    fromMenu: false,
    player: { x: 270, y: 800, reset() {}, invulnerable: 0 },
    track: new Track(),
    feel: null,
    camera: null,
    audio: { play: (name) => calls.sounds.push(name), muted: false },
    haptics: { pulse: (name) => calls.pulses.push(name) },
    platform: {
      completedRuns: 0,
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
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
// Конец забега без вывода в консоль.
function endRun(game, { seconds, score = 0 }) {
  quiet(() => {
    game.state = 'PLAYING';
    game.runTime = seconds;
    game.distanceScore = score;
    game.pathReward = 0;
    game.gameOver();
  });
}
const ids = (game) => game.achievementToasts.map((toast) => toast.id).join();

await check('game: three narrow paths in a row give "bold cat" at the third and not earlier; a safe choice or a plain row breaks the count', () => {
  const { game, calls } = makeGame();
  game.applyReward('RISKY', true, true);
  game.applyReward('RISKY', true, true);
  assert(!game.achievements.has('bold') && game.achievementToasts.length === 0, 'two are not enough');
  game.applyReward('RISKY', true, true);
  assert(game.achievements.has('bold') && ids(game) === 'bold', 'the third gives it, with a toast');
  assert(game.achievementToasts[0].age === 0 && calls.sounds.includes('buy') && calls.pulses.includes('best'), 'a sound and a pulse');
  game.applyReward('RISKY', true, true);
  game.applyReward('RISKY', true, true);
  assert(game.achievementToasts.length === 1, 'not given twice');
  // Серия обрывается безопасным выбором.
  const other = makeGame().game;
  other.applyReward('RISKY', true, true);
  other.applyReward('RISKY', true, true);
  other.applyReward('SAFE', false, true);
  other.applyReward('RISKY', true, true);
  other.applyReward('RISKY', true, true);
  assert(!other.achievements.has('bold'), '2 + safe + 2 is not 3 in a row');
});

await check('game: the top multiplier is given at the very step that reaches it, and not at the step before', () => {
  const { game } = makeGame();
  let calls = 0;
  while (game.multiplier < CONFIG.MULTIPLIER_MAX && calls < 50) {
    assert(!game.achievements.has('topMultiplier'), `not yet at x${game.multiplier}`);
    game.applyReward('RISKY', true, true);
    calls += 1;
  }
  assert(game.multiplier === CONFIG.MULTIPLIER_MAX && game.achievements.has('topMultiplier'), `x${game.multiplier} gives it`);
  assert(ids(game).includes('topMultiplier'), 'with a toast');
});

await check('game: five close calls in a row give "close shave"; a pause longer than the combo window starts the count again', () => {
  const { game } = makeGame();
  const graze = () => game.applyGraze({ x: 1, y: 1, side: 1 });
  for (let i = 0; i < CFG.GRAZE_COMBO - 1; i += 1) {
    game.runTime += 1;
    graze();
  }
  assert(!game.achievements.has('closeCalls'), 'four are not enough');
  game.runTime += CONFIG.GRAZE.COMBO_WINDOW + 0.5;
  graze();
  assert(game.grazeCombo === 1 && !game.achievements.has('closeCalls'), 'a long pause breaks the combo');
  for (let i = 0; i < CFG.GRAZE_COMBO - 1; i += 1) {
    game.runTime += 1;
    graze();
  }
  assert(game.achievements.has('closeCalls') && ids(game) === 'closeCalls', 'five within the window give it');
});

await check('game: a minute without a coin gives "clean run", a coin starts the count again, once given it is not given twice', () => {
  const { game } = makeGame();
  game.runTime = CFG.CLEAN_SECONDS - 0.1;
  game.updateAchievements();
  assert(!game.achievements.has('cleanRun'), 'a tenth of a second short');
  game.runTime = 12;
  game.applyCoinPickup(1);
  game.runTime = 12 + CFG.CLEAN_SECONDS - 0.1;
  game.updateAchievements();
  assert(!game.achievements.has('cleanRun'), 'a coin at 12 s: the minute starts from it');
  game.runTime = 12 + CFG.CLEAN_SECONDS;
  game.updateAchievements();
  assert(game.achievements.has('cleanRun') && ids(game) === 'cleanRun', 'given a whole minute after the coin');
  game.achRunWatch.longRun = false; // 92 секунды — это уже «долгий забег»; здесь проверяется только «без монет»
  game.runTime += 50;
  game.updateAchievements();
  assert(game.achievementToasts.length === 1 && game.achRunWatch.cleanRun === false, 'the check stops after it is given');
});

await check('game: 80 seconds give "long run" (the start offset of the dev mode does not count), not a second earlier', () => {
  const { game } = makeGame();
  game.runTime = CFG.SURVIVE_SECONDS - 0.1;
  game.lastCoinAt = game.runTime; // чтобы не мешал «забег без монет»
  game.updateAchievements();
  assert(!game.achievements.has('longRun'), '79.9 s');
  game.runTime = CFG.SURVIVE_SECONDS;
  game.lastCoinAt = game.runTime;
  game.updateAchievements();
  assert(game.achievements.has('longRun') && ids(game) === 'longRun', '80 s');
  const dev = makeGame().game;
  dev.devStartTime = 100;
  dev.runTime = 100 + CFG.SURVIVE_SECONDS - 0.1;
  dev.lastCoinAt = dev.runTime;
  dev.updateAchievements();
  assert(!dev.achievements.has('longRun'), 'a run that started at the 100th second needs 80 more seconds');
  dev.runTime = 100 + CFG.SURVIVE_SECONDS;
  dev.lastCoinAt = dev.runTime;
  dev.updateAchievements();
  assert(dev.achievements.has('longRun'), '...and has them at 180');
});

await check('game: start() watches only what is not received yet and clears old toasts; the count of the clean run starts at the start', () => {
  const { game } = makeGame({ state: 'GAMEOVER' });
  game.achievementToasts = [{ id: 'bold', age: 1 }];
  game.achievements.unlock('longRun');
  game.start();
  assert(game.achievementToasts.length === 0, 'old toasts are gone');
  assert(game.achRunWatch.longRun === false && game.achRunWatch.cleanRun === true, 'longRun is received, cleanRun is still watched');
  assert(game.lastCoinAt === game.runTime, 'the clean run counts from the start of the run');
  const dev = makeGame({ state: 'GAMEOVER' }).game;
  dev.devStartTime = 100;
  dev.start();
  assert(dev.lastCoinAt === 100 && dev.runTime === 100, 'also with the start offset of the dev mode');
  // Выход в меню с экрана проигрыша тоже убирает плашки.
  const menu = makeGame({ state: 'GAMEOVER' }).game;
  menu.achievementToasts = [{ id: 'bold', age: 1 }];
  menu.player.reset = () => {};
  menu.track.setSeed = () => {};
  menu.openMenu();
  assert(menu.achievementToasts.length === 0, 'the menu has no old toasts');
});

await check('game: the coin goal counts everything earned (pick-ups, quests, daily runs), spending does not take it back', () => {
  // Задания дня без «собери монеты»: иначе награда за него сама прибавила бы монет (она тоже считается, но здесь она мешает).
  const saved = CONFIG.QUESTS.POOL;
  CONFIG.QUESTS.POOL = { runs: [3, null, null], survive: [null, 50, null], score: [null, null, 1800] };
  try {
    const { game } = makeGame({ coins: CFG.COINS_TOTAL - 5 });
    game.applyCoinPickup(4);
    assert(!game.achievements.has('piggyBank'), 'one short');
    game.applyCoinPickup(1);
    assert(game.achievements.has('piggyBank') && ids(game) === 'piggyBank', 'reached by a coin');
    const spent = makeGame({ coins: CFG.COINS_TOTAL - 1 }).game;
    spent.storage.spendCoins(CFG.COINS_TOTAL - 1);
    spent.applyCoinPickup(1);
    assert(spent.achievements.has('piggyBank'), 'what counts is what was earned, not the balance: 499 spent + 1 picked up is 500 earned');
    // Награда за задание и за забег дня — тоже заработанные монеты.
    const reward = makeGame({ coins: CFG.COINS_TOTAL - 3 }).game;
    reward.storage.addCoins(2);
    assert(!reward.checkAchievements().includes('piggyBank'), 'one short again');
    reward.storage.addCoins(1);
    assert(reward.checkAchievements().includes('piggyBank'), 'a reward that arrives without a pick-up is counted at the next check (game over, purchase)');
  } finally {
    CONFIG.QUESTS.POOL = saved;
  }
});

await check('game: buying skins gives "wardrobe" and "full wardrobe"; the seasonal skin does not count; a shop purchase tells it in the shop line and saves to the cloud', () => {
  const { game, calls } = makeGame({ state: 'START', coins: 2000 });
  game.shopWindow = { message: null };
  game.requestRender = () => {};
  game.applySelectedSkin = () => {};
  const buy = (id) => game.tapSkin(id);
  const regularBuyable = REGULAR.filter((id) => id !== 'classic');
  for (const id of regularBuyable.slice(0, CFG.SKINS_SOME - 2)) buy(id);
  assert(!game.achievements.has('wardrobe'), `${CFG.SKINS_SOME - 1} skins (the free one counts) are not enough`);
  buy('halloween');
  assert(!game.achievements.has('wardrobe'), 'the seasonal skin is not counted');
  assert(game.shop.isOwned('halloween') || !game.shop.availability('halloween').available, 'the seasonal skin was bought (or the season is over; it must not matter)');
  buy(regularBuyable[CFG.SKINS_SOME - 2]);
  assert(game.achievements.has('wardrobe'), `${CFG.SKINS_SOME} skins give it`);
  assert(game.shopWindow.message?.includes(DICTIONARIES.en.achievements.name.wardrobe) && game.achievementToasts.length === 0, `the shop line says it, there is no toast: ${game.shopWindow.message}`);
  assert(calls.saved.at(-1).achievements.includes('wardrobe'), 'the purchase goes to the cloud together with the new achievement');
  for (const id of regularBuyable) if (!game.shop.isOwned(id)) buy(id);
  assert(game.achievements.has('fullWardrobe'), 'every regular skin gives "full wardrobe"');
  // Сезонный скин без остальных «все скины» не даёт.
  const some = makeGame({ state: 'START', coins: 2000 }).game;
  some.shopWindow = { message: null };
  some.requestRender = () => {};
  some.applySelectedSkin = () => {};
  some.tapSkin('halloween');
  some.tapSkin('ginger');
  assert(!some.achievements.has('fullWardrobe') && !some.achievements.has('wardrobe'), 'classic + ginger + halloween is not five regular skins');
});

await check('game: seven daily runs on seven days in a row give "week of runs"; a missed day starts it over', () => {
  const week = days(DAY, CFG.DAILY_STREAK);
  const { game } = makeGame();
  game.achievements.merge({}, DAY);
  week.slice(0, -1).forEach((day) => {
    game.devDay = day;
    game.dailyRun = true;
    endRun(game, { seconds: 15, score: 100 });
  });
  assert(!game.achievements.has('weekStreak'), `${CFG.DAILY_STREAK - 1} days are not enough`);
  game.devDay = week.at(-1);
  game.dailyRun = true;
  endRun(game, { seconds: 15, score: 100 });
  assert(game.achievements.has('weekStreak') && game.achievementToasts.some((toast) => toast.id === 'weekStreak'), 'the last day gives it, with a toast on the game over screen');
  const broken = makeGame().game;
  week.forEach((day, index) => {
    if (index === 3) return; // пропущенный день
    broken.devDay = day;
    broken.dailyRun = true;
    endRun(broken, { seconds: 15, score: 100 });
  });
  assert(!broken.achievements.has('weekStreak'), 'a missed day breaks the streak');
});

await check('game: all three daily quests done on three days in a row give "busy cat"; a day without them breaks it; quests of one day count once', () => {
  const pool = { coins: [1, null, null], graze: [null, 1, null], survive: [null, null, 1] };
  const saved = CONFIG.QUESTS.POOL;
  CONFIG.QUESTS.POOL = pool;
  try {
    const finishDay = (game, day, { skip = null } = {}) => {
      game.devDay = day;
      for (const kind of ['coins', 'graze', 'survive']) if (kind !== skip) game.recordQuest(kind, 1);
    };
    const [d1, d2, d3, d4] = days(DAY, 4);
    const { game } = makeGame();
    finishDay(game, d1);
    assert(game.achievements.questState().streak === 1 && !game.achievements.has('diligent'), 'day 1 of 3');
    finishDay(game, d2, { skip: 'survive' });
    assert(game.achievements.questState().streak === 1, 'two of three quests do not count as a day');
    game.recordQuest('survive', 1);
    assert(game.achievements.questState().streak === 2 && !game.achievements.has('diligent'), 'day 2 of 3 once the last quest is done');
    finishDay(game, d3);
    assert(game.achievements.has('diligent') && game.achievementToasts.some((toast) => toast.id === 'diligent'), 'day 3 gives it');
    const broken = makeGame().game;
    finishDay(broken, d1);
    finishDay(broken, d3);
    finishDay(broken, d4);
    assert(!broken.achievements.has('diligent') && broken.achievements.questState().streak === 2, 'a day without quests between: the streak is 2, not 3');
  } finally {
    CONFIG.QUESTS.POOL = saved;
  }
});

await check('game: toasts go one after another and fade after the set time', () => {
  const { game } = makeGame();
  const life = CFG.TOAST_SECONDS;
  game.onAchievement('bold');
  game.onAchievement('cleanRun');
  assert(game.achievementToasts.length === 2, 'two in the queue');
  game.updateAchievementToast(life / 2);
  assert(game.achievementToasts[0].age === life / 2 && game.achievementToasts[1].age === 0, 'only the first one ages');
  game.updateAchievementToast(life / 2);
  assert(game.achievementToasts.length === 1 && game.achievementToasts[0].id === 'cleanRun' && game.achievementToasts[0].age === 0, 'the second starts fresh');
  game.updateAchievementToast(life);
  assert(game.achievementToasts.length === 0, 'the queue is empty');
  game.updateAchievementToast(1);
});

await check('game: what was earned before this version, or on another device, is given without a toast; nothing is taken from the cloud away', () => {
  const { game, calls } = makeGame({ coins: 0 });
  const changed = game.applyCloudData({ coinsEarned: CFG.COINS_TOTAL + 50, coinsSpent: 0, achievements: ['longRun'], achQuestDay: DAY, achQuestStreak: 2 });
  assert(changed === true, 'the data changed');
  assert(game.achievements.has('piggyBank') && game.achievements.has('longRun'), 'the coin goal and the received one are both there');
  assert(game.achievementToasts.length === 0 && !calls.sounds.includes('buy'), 'no toast, no sound');
  assert(game.achievements.questState().streak === 2, 'the quest streak came too');
  assert(game.applyCloudData({ coinsEarned: CFG.COINS_TOTAL + 50 }) === false, 'the same data again changes nothing');
  const snapshot = game.cloudSnapshot();
  assert(snapshot.achievements.join() === 'longRun,piggyBank' && snapshot.achQuestStreak === 2, JSON.stringify(snapshot.achievements));
  assert(CONFIG.YANDEX.CLOUD_KEYS.every((key) => key in snapshot) && Object.keys(snapshot).every((key) => CONFIG.YANDEX.CLOUD_KEYS.includes(key)), 'the snapshot and the requested keys match');
  // Тихая проверка: ничего не выдаёт повторно и не шумит.
  assert(game.checkAchievements({ silent: true }).length === 0, 'nothing new');
});

await check('game: the window opens only from the start screen, blocks a launch, closes with its button and only with it; no window opens over another', () => {
  const recording = recordingContext();
  const { game } = makeGame({ state: 'START' });
  game.renderer = new Renderer(recording.ctx);
  game.handleSoundTap = () => false;
  assert(game.openAchievements() === true && game.achievementsWindow !== null, 'opened');
  assert(game.openAchievements() === false, 'not twice');
  assert(game.openQuests() === false && game.openShop() === false, 'no other window over it');
  assert(game.tryLaunch() === false && game.state === 'START', 'no launch behind the window');
  assert(game.startDaily() === false && game.dailyPending === false, 'no daily run behind the window');
  game.renderer.drawAchievements(game.achievementsView());
  const close = game.renderer.achievementsButtons.close;
  game.handleTap(10, 10);
  assert(game.achievementsWindow !== null && game.state === 'START', 'a tap beside the button keeps the window and starts nothing');
  game.handleTap(close.x + close.w / 2, close.y + close.h / 2);
  assert(game.achievementsWindow === null && game.state === 'START', 'the close button closes it');
  assert(game.closeAchievements() === false, 'closing a closed window does nothing');
  for (const state of ['PLAYING', 'GAMEOVER']) assert(makeGame({ state }).game.openAchievements() === false, `${state}: no window`);
  const shop = makeGame({ state: 'START' }).game;
  shop.shopWindow = { message: null };
  assert(shop.openAchievements() === false, 'not over the shop');
  const quests = makeGame({ state: 'START' }).game;
  quests.questsWindow = {};
  assert(quests.openAchievements() === false, 'not over the quests');
  const board = makeGame({ state: 'START' }).game;
  board.leaderboard = { status: 'ready' };
  assert(board.openAchievements() === false, 'not over the leaderboard');
  assert(game.tryLaunch() === true && game.state === 'PLAYING', 'with the window closed a launch works');
  // Нажатие на кнопку «достижения» на стартовом экране открывает окно.
  const start = makeGame({ state: 'START' }).game;
  start.renderer = new Renderer(recordingContext().ctx);
  start.handleSoundTap = () => false;
  start.renderer.drawStartScreen(false, 0.5, { shop: true, quests: { done: 0, total: 3 }, achievements: start.achievementsSummary() });
  const button = start.renderer.platformButtons.achievements;
  assert(button, 'the button is drawn');
  start.handleTap(button.x + button.w / 2, button.y + button.h / 2);
  assert(start.achievementsWindow !== null, 'tapping the button opens the window');
});

await check('game: a game without the module ignores achievements instead of failing', () => {
  const bare = Object.assign(Object.create(Game.prototype), {});
  assert(bare.updateAchievements() === undefined && bare.updateAchievementToast(1) === undefined, 'frame hooks');
  assert(bare.checkAchievements().length === 0 && bare.unlockAchievement('bold') === false && bare.achievementsSummary() === null, 'checks');
  assert(bare.openAchievements() === false && bare.closeAchievements() === false, 'window');
  assert(bare.noteQuestsForAchievements() === undefined, 'quests hook');
});

// ---- (е) рисование

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

function spyRenderer() {
  const { ctx, texts } = recordingContext();
  const renderer = new Renderer(ctx);
  const lines = [];
  const pills = [];
  const fit = renderer.fitText.bind(renderer);
  renderer.fitText = (text, x, y, weight, size, maxWidth, color, align) => {
    lines.push({ text: String(text), x, y, size, maxWidth, align });
    return fit(text, x, y, weight, size, maxWidth, color, align);
  };
  const pill = renderer.screenPill.bind(renderer);
  renderer.screenPill = (cx, cy, w, h, fill) => {
    pills.push({ cx, cy, w, h, fill });
    return pill(cx, cy, w, h, fill);
  };
  return { renderer, texts, lines, pills };
}

await check('drawing: the achievements button joins the others — in every combination all buttons fit and none overlap the daily button, the sound row or each other', () => {
  const { renderer } = spyRenderer();
  const daily = { played: false, reward: 5, streak: 0, best: 0 };
  for (let mask = 0; mask < 64; mask += 1) {
    const show = {
      shop: !!(mask & 1), quests: (mask & 2) ? { done: 1, total: 3 } : undefined, leaderboard: !!(mask & 4), shortcut: !!(mask & 8),
      daily: (mask & 16) ? daily : undefined, achievements: (mask & 32) ? { done: 2, total: 10 } : undefined
    };
    renderer.drawStartScreen(false, 0.5, show);
    const buttons = renderer.platformButtons || {};
    const names = Object.keys(buttons).sort().join();
    const expected = ['shop', 'quests', 'achievements', 'leaderboard', 'shortcut'].filter((name) => (name === 'quests' || name === 'achievements' ? show[name] : show[name])).sort().join();
    assert(names === expected, `mask ${mask}: buttons ${names}, expected ${expected}`);
    const rects = Object.values(buttons);
    for (const r of rects) assert(inside(r) && r.h >= 44 && r.w >= 190, `mask ${mask}: a button is off screen or too small ${JSON.stringify(r)}`);
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => assert(!overlap(a, b), `mask ${mask}: two buttons overlap`)));
    for (const s of Object.values(renderer.soundButtons || {})) rects.forEach((r) => assert(!overlap(s, r), `mask ${mask}: a button touches the sound row`));
    if (renderer.dailyButton) rects.forEach((r) => assert(!overlap(r, renderer.dailyButton), `mask ${mask}: a button touches the daily button`));
    if (buttons.achievements) {
      const r = buttons.achievements;
      assert(renderer.hitPlatformButton(r.x + r.w / 2, r.y + r.h / 2) === 'achievements', `mask ${mask}: the achievements button is hit by its centre`);
    }
  }
});

await check('drawing: the button reads "achievements" in both languages and turns green only when all of them are received', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const { renderer, texts, pills } = spyRenderer();
      const draw = (summary) => {
        texts.length = 0;
        pills.length = 0;
        renderer.drawStartScreen(false, 0.5, { achievements: summary });
        return { text: texts.join('|'), green: pills.filter((p) => p.fill === CONFIG.COLORS.SafeLawn).length };
      };
      const some = draw({ done: 3, total: 10 });
      assert(some.text.includes(DICTIONARIES[lang].achievements.button) && some.green === 0, `${lang}: ${some.text}`);
      const all = draw({ done: 10, total: 10 });
      assert(all.green === 1, `${lang}: all received turns the button green (${all.green} green pills)`);
    }
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: the window — ten rows with a name, a description with its number, counters only for unfinished cumulative goals; everything inside the card; the close button works', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const dict = DICTIONARIES[lang].achievements;
      const { renderer, lines, pills } = spyRenderer();
      const { storage } = makeStorage();
      const ach = new Achievements(storage);
      ach.unlock('bold');
      ach.unlock('piggyBank');
      const items = ach.list({ ...EMPTY_STATS, coinsEarned: 120, skins: 3, questStreak: 1 });
      const view = { items, done: 2, total: 10 };
      renderer.drawAchievements(view);
      const text = lines.map((l) => l.text);
      assert(text.includes(dict.title) && text.includes(dict.count.replace('{done}', '2').replace('{total}', '10')), `${lang}: title and count`);
      for (const item of items) {
        assert(text.includes(dict.name[item.id]), `${lang}: the name of ${item.id}`);
        assert(text.includes(dict.desc[item.id].replace('{n}', String(item.number))), `${lang}: the description of ${item.id} with its number`);
      }
      const progress = (p, n) => dict.progress.replace('{p}', String(p)).replace('{n}', String(n));
      assert(text.includes(progress(3, CFG.SKINS_SOME)) && text.includes(progress(1, CFG.QUEST_DAYS)) && text.includes(progress(0, CFG.DAILY_STREAK)), `${lang}: counters of unfinished cumulative goals: ${text.filter((s) => s.includes('/'))}`);
      assert(!text.includes(progress(CFG.COINS_TOTAL, CFG.COINS_TOTAL)) && text.filter((s) => / \/ /.test(s)).length === 4, `${lang}: a received goal and the in-run goals show no counter (${text.filter((s) => / \/ /.test(s))})`);
      // Всё внутри карточки, строки идут сверху вниз.
      const cardTop = 80;
      const cardBottom = 80 + 800;
      for (const l of lines) assert(l.y > cardTop && l.y < cardBottom && l.maxWidth <= CONFIG.CANVAS_WIDTH - 72, `${lang}: "${l.text}" sits outside the card (y ${l.y}, width ${l.maxWidth})`);
      const nameLines = ACHIEVEMENT_IDS.map((id) => lines.find((l) => l.text === dict.name[id]));
      nameLines.forEach((l, i) => assert(i === 0 || l.y > nameLines[i - 1].y, `${lang}: rows go top to bottom`));
      for (const p of pills) assert(p.cx - p.w / 2 >= 36 && p.cx + p.w / 2 <= CONFIG.CANVAS_WIDTH - 36 && p.cy + p.h / 2 < cardBottom, `${lang}: a pill leaves the card ${JSON.stringify(p)}`);
      // Название не заходит под числа справа; последняя строка не заходит под кнопку.
      for (const item of items) {
        if (item.done || !item.target) continue;
        const name = lines.find((l) => l.text === dict.name[item.id]);
        const numbers = lines.find((l) => l.text === progress(item.progress, item.target));
        assert(name.align === 'left' && numbers.align === 'right' && name.x + name.maxWidth <= numbers.x - numbers.maxWidth, `${lang}: the name of ${item.id} runs under its counter`);
      }
      const close = renderer.achievementsButtons.close;
      const lastDesc = lines.find((l) => l.text === dict.desc[ACHIEVEMENT_IDS.at(-1)].replace('{n}', String(CFG.DAILY_STREAK)));
      assert(lastDesc.y + 12 < close.y, `${lang}: the last row (text at ${lastDesc.y}) must end above the close button (${close.y})`);
      assert(inside(close) && close.h >= 44 && close.w >= 200, `${lang}: close button ${JSON.stringify(close)}`);
      assert(renderer.hitAchievementsButton(close.x + close.w / 2, close.y + close.h / 2) === true, `${lang}: the centre hits`);
      assert(renderer.hitAchievementsButton(close.x - 40, close.y + close.h / 2) === false && renderer.hitAchievementsButton(10, 10) === false, `${lang}: beside does not`);
      // Полученные строки с галочкой, остальные с пустым кружком: рисуются разные значки.
      const green = pills.filter((p) => p.fill === CONFIG.COLORS.SafeLawn).length;
      assert(green === 0, `${lang}: the received rows are tinted, not drawn with a green pill`);
    }
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: the toast uses the name of the achievement in both languages and stands apart from the other toasts on every screen', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const dict = DICTIONARIES[lang].achievements;
      for (const state of ['PLAYING', 'GAMEOVER']) {
        for (const other of [{}, { notice: { key: 'over.noReward', age: 0.5 } }, { questToasts: [{ reward: 3, age: 0.5 }] }, { notice: { key: 'over.noReward', age: 0.5 }, questToasts: [{ reward: 3, age: 0.5 }] }]) {
          const tops = [];
          const { game } = makeGame({ state, extra: { ...other, achievementToasts: [{ id: 'closeCalls', age: 1 }], stageToast: null, renderScale: () => 1 } });
          const spy = spyRenderer();
          const stage = spy.renderer.drawStageToast.bind(spy.renderer);
          spy.renderer.drawStageToast = (text, alpha, top) => { tops.push({ text, top }); return stage(text, alpha, top); };
          for (const name of ['clear', 'drawBackdrop', 'drawFarWorld', 'beginWorld', 'setRecordMarker', 'drawWorld', 'drawSegments', 'drawPlayer', 'drawParticles', 'drawFloatingRewards', 'endWorld', 'drawTimeOfDay', 'drawFlash', 'drawHUD', 'drawGameOver', 'drawPause', 'drawChoiceHint', 'setScale']) spy.renderer[name] = () => {};
          game.renderer = spy.renderer;
          game.render();
          const toast = tops.find((entry) => entry.text === dict.toast.replace('{name}', dict.name.closeCalls));
          assert(toast, `${lang} ${state}: the achievement toast is drawn (${JSON.stringify(tops)})`);
          assert(toast.top >= 0 && toast.top + 44 <= CONFIG.CANVAS_HEIGHT, `${lang} ${state}: the toast is on screen (${toast.top})`);
          for (const entry of tops) {
            if (entry === toast) continue;
            assert(Math.abs(entry.top - toast.top) >= 44, `${lang} ${state}: the toast at ${toast.top} overlaps another at ${entry.top} (${entry.text})`);
          }
        }
      }
    }
  } finally {
    setLanguage(saved);
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 5a checks passed');
}
