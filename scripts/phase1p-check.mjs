// Фаза 1п: задания на день (шаг 6г).
//  (а) выбор: набор дня одинаков у всех, виды не повторяются, цели из пула, настройки разумны;
//  (б) прогресс и награда: суммируемые и «лучший за забег» задания, награда один раз, новый день, мусор в сохранении;
//  (в) облако: слияние между устройствами, награда не выдаётся второй раз;
//  (г) игра: события (монеты, риск, «впритирку», секунды, очки, множитель), конец забега, возрождение, плашки, окно;
//  (д) рисование: кнопка на стартовом экране, окно заданий, плашка «выполнено»;
//  (е) строки на двух языках.
// Запуск: node scripts/phase1p-check.mjs (входит в npm run check).
import { CONFIG } from '../src/config.js';
import { Daily, gameDay, msUntilNextDay } from '../src/game/Daily.js';
import { Game } from '../src/game/Game.js';
import { QUEST_MODES, Quests, questsFor } from '../src/game/Quests.js';
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
const DAY2 = '2026-10-06';

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

// Пул заданий на время одной проверки: тогда набор дня известен заранее.
function withPool(pool, fn) {
  const saved = CONFIG.QUESTS.POOL;
  CONFIG.QUESTS.POOL = pool;
  try {
    return fn();
  } finally {
    CONFIG.QUESTS.POOL = saved;
  }
}
// Монеты (3), «впритирку» (5), продержаться секунд (30).
const POOL_COINS = { coins: [3, null, null], graze: [null, 5, null], survive: [null, null, 30] };
// Сыграть забегов (2), узкий путь (3), множитель ×2.
const POOL_RISK = { runs: [2, null, null], risk: [null, 3, null], multiplier: [null, null, 2] };
// Забег дня, очки (400), продержаться секунд (15).
const POOL_SCORE = { daily: [1, null, null], score: [null, 400, null], survive: [null, null, 15] };

const questOf = (game, kind) => game.quests.list(game.todayKey()).find((q) => q.kind === kind);

// ---- (а) выбор заданий

await check('selection: three quests from easy to hard, different kinds, goals from the pool, rewards 3 / 5 / 8; the same for the same day', () => {
  const quests = questsFor(DAY);
  assert(quests.length === 3, `${quests.length} quests`);
  assert(quests.map((q) => q.tier).join() === '0,1,2', 'ordered from easy to hard');
  assert(new Set(quests.map((q) => q.kind)).size === 3, 'three different kinds');
  for (const q of quests) {
    assert(CONFIG.QUESTS.POOL[q.kind][q.tier] === q.target, `${q.kind}: the goal ${q.target} must come from the pool`);
    assert(q.reward === CONFIG.QUESTS.REWARDS[q.tier], 'the reward follows the tier');
  }
  assert(quests.map((q) => q.reward).join() === '3,5,8', `rewards ${quests.map((q) => q.reward)}`);
  assert(JSON.stringify(questsFor(DAY)) === JSON.stringify(quests), 'the same day, the same quests');
  assert(JSON.stringify(questsFor(DAY2)) !== JSON.stringify(quests) || JSON.stringify(questsFor('2026-10-07')) !== JSON.stringify(quests), 'other days differ');
});

await check('selection: over a year every kind shows up, each quest suits its tier, no kind twice in a day, days differ', () => {
  const total = {};
  const perTier = [{}, {}, {}];
  const sets = new Set();
  let day = '2026-01-01';
  for (let i = 0; i < 365; i += 1) {
    const quests = questsFor(day);
    assert(quests.length === 3 && new Set(quests.map((q) => q.kind)).size === 3, `${day}: ${JSON.stringify(quests.map((q) => q.kind))}`);
    for (const q of quests) {
      assert(CONFIG.QUESTS.POOL[q.kind][q.tier] != null, `${day}: ${q.kind} must not appear in tier ${q.tier}`);
      total[q.kind] = (total[q.kind] || 0) + 1;
      perTier[q.tier][q.kind] = (perTier[q.tier][q.kind] || 0) + 1;
    }
    sets.add(quests.map((q) => `${q.kind}:${q.target}`).join('|'));
    day = gameDay(Date.parse(`${day}T00:00:00Z`) + 86400000, 0);
  }
  for (const kind of Object.keys(CONFIG.QUESTS.POOL)) assert((total[kind] || 0) >= 40, `${kind} appeared only ${total[kind] || 0} times a year`);
  // Внутри сложности виды выпадают примерно поровну (не меньше трети от равной доли).
  perTier.forEach((counts, tier) => {
    const kinds = Object.keys(CONFIG.QUESTS.POOL).filter((kind) => CONFIG.QUESTS.POOL[kind][tier] != null);
    for (const kind of kinds) assert((counts[kind] || 0) >= 365 / kinds.length / 3, `tier ${tier}: ${kind} only ${counts[kind] || 0} times`);
  });
  assert(sets.size >= 120, `only ${sets.size} different sets in a year`);
});

await check('selection: a wrong date gives no quests', () => {
  for (const bad of [null, undefined, '', 'abc', '2026-02-31', 20261005, '2026-10-5', NaN]) assert(questsFor(bad).length === 0, `${String(bad)} must give no quests`);
});

await check('config: goals grow with the difficulty, rewards grow, every tier has enough kinds, goals stay friendly to a newcomer', () => {
  const cfg = CONFIG.QUESTS;
  const kinds = Object.keys(cfg.POOL);
  assert(Object.keys(QUEST_MODES).sort().join() === kinds.slice().sort().join(), 'every kind has a mode and every mode a kind');
  for (const kind of kinds) {
    assert(cfg.POOL[kind].length === cfg.REWARDS.length, `${kind}: one goal per tier`);
    const goals = cfg.POOL[kind].filter((goal) => goal != null);
    assert(goals.length >= 1 && goals.every((goal) => Number.isInteger(goal) && goal > 0), `${kind}: goals are positive whole numbers`);
    if (kind !== 'daily') assert(goals.every((goal, i) => i === 0 || goal > goals[i - 1]), `${kind}: goals ${goals} must grow`);
    assert(['sum', 'best'].includes(QUEST_MODES[kind]), `${kind}: a known mode`);
  }
  assert(cfg.REWARDS.every((reward, i) => Number.isInteger(reward) && reward > 0 && (i === 0 || reward > cfg.REWARDS[i - 1])), 'rewards grow');
  assert(cfg.REWARDS.reduce((a, b) => a + b, 0) <= 20, 'a whole day of quests stays a modest income next to the shop prices');
  // Для выбора без повторов в сложности i должно быть не меньше (число сложностей − i) видов.
  cfg.REWARDS.forEach((_, tier) => {
    const options = kinds.filter((kind) => cfg.POOL[kind][tier] != null).length;
    assert(options >= cfg.REWARDS.length - tier, `tier ${tier} has only ${options} kinds`);
  });
  // Новичок: забег 30–40 секунд, 400–800 очков, около монеты за забег (scripts/_measure в заметках шага 6г).
  assert(cfg.POOL.survive[0] <= 35 && cfg.POOL.score[0] <= 500 && cfg.POOL.coins[0] <= 4 && cfg.POOL.runs[0] <= 4, 'the easy goals are within reach of a newcomer');
  assert(cfg.MIN_RUN_SECONDS >= 5 && cfg.MIN_RUN_SECONDS <= 15 && cfg.TOAST_SECONDS >= 2, 'run minimum and toast time');
});

// ---- (б) прогресс и награда

await check('progress: summed quests add up over events, pay once at the goal, and later events change nothing', () => {
  withPool(POOL_COINS, () => {
    const { storage } = makeStorage();
    const quests = new Quests(storage);
    assert(quests.record('coins', 1, DAY).length === 0 && quests.list(DAY)[0].progress === 1, 'one coin: 1 of 3');
    assert(quests.record('coins', 1, DAY).length === 0 && quests.list(DAY)[0].progress === 2, 'two coins');
    assert(storage.getCoins() === 0, 'nothing is paid before the goal');
    const done = quests.record('coins', 1, DAY);
    assert(done.length === 1 && done[0].kind === 'coins' && done[0].reward === 3 && done[0].done, JSON.stringify(done));
    assert(storage.getCoins() === 3, `the reward of 3 is paid: ${storage.getCoins()}`);
    assert(quests.record('coins', 5, DAY).length === 0 && storage.getCoins() === 3, 'a claimed quest never pays twice');
    const listed = quests.list(DAY)[0];
    assert(listed.done && listed.progress === 3, 'shown as done with a full bar');
    assert(JSON.stringify(quests.summary(DAY)) === JSON.stringify({ done: 1, total: 3 }), JSON.stringify(quests.summary(DAY)));
    quests.record('graze', 2, DAY);
    assert(quests.list(DAY)[1].progress === 2 && !quests.list(DAY)[1].done, 'another quest is separate');
  });
});

await check('progress: "best of one run" quests keep the best value, not the sum', () => {
  withPool(POOL_COINS, () => {
    const { storage } = makeStorage();
    const quests = new Quests(storage);
    assert(quests.record('survive', 12, DAY).length === 0 && quests.list(DAY)[2].progress === 12, 'a run of 12 s');
    quests.record('survive', 8, DAY);
    assert(quests.list(DAY)[2].progress === 12, 'a worse run does not lower it and does not add');
    quests.record('survive', 20, DAY);
    assert(quests.list(DAY)[2].progress === 20, 'a better run raises it to 20, not 32');
    const done = quests.record('survive', 31, DAY);
    assert(done.length === 1 && done[0].reward === 8 && storage.getCoins() === 8, 'the goal of 30 is reached by one run');
    assert(quests.record('survive', 99, DAY).length === 0 && storage.getCoins() === 8, 'no second payment');
  });
});

await check('progress: one big event pays once and the bar stops at the goal', () => {
  withPool(POOL_COINS, () => {
    const { storage } = makeStorage();
    const quests = new Quests(storage);
    const big = quests.record('coins', 50, DAY);
    assert(big.length === 1 && storage.getCoins() === 3 && big[0].progress === 3, 'fifty coins at once: one payment of 3 and a full bar, not 50');
    assert(quests.list(DAY)[0].progress === 3, 'progress never exceeds the goal');
    assert(storage.coinCounters().earned === 3 && storage.coinCounters().spent === 0, 'the reward is "earned" money');
  });
});

await check('progress: other kinds, bad amounts and bad days change nothing', () => {
  withPool(POOL_COINS, () => {
    const { storage, memory } = makeStorage();
    const quests = new Quests(storage);
    assert(quests.record('risk', 3, DAY).length === 0 && quests.record('multiplier', 3, DAY).length === 0 && quests.record('nonsense', 3, DAY).length === 0, 'a kind that is not among today\'s quests is ignored');
    for (const bad of [0, -3, NaN, Infinity, -Infinity, undefined, null, 'abc', {}, [], 0.4]) {
      assert(quests.record('coins', bad, DAY).length === 0, `amount ${String(bad)} must not complete anything`);
    }
    for (const badDay of [null, undefined, '', 'x', '2026-02-31']) assert(quests.record('coins', 9, badDay).length === 0, `day ${String(badDay)}`);
    assert(storage.getCoins() === 0 && quests.list(DAY)[0].progress === 0, 'nothing was counted or paid');
    assert(![...memory.keys()].some((key) => key.includes('quest')), 'and nothing was even written');
    assert(quests.record('coins', '2', DAY).length === 0 && quests.list(DAY)[0].progress === 2, 'a numeric string counts as the number');
    const { storage: fresh } = makeStorage();
    const rounding = new Quests(fresh);
    rounding.record('coins', 1.9, DAY);
    assert(rounding.list(DAY)[0].progress === 1, 'a fraction is rounded down: 1.9 counts as 1');
  });
});

await check('progress: a new day starts clean — yesterday\'s progress and claims are gone and the new set is used', () => {
  const { storage } = makeStorage();
  const quests = new Quests(storage);
  withPool(POOL_COINS, () => {
    quests.record('coins', 3, DAY);
    quests.record('graze', 3, DAY);
    assert(quests.summary(DAY).done === 1 && quests.list(DAY)[1].progress === 3, 'a busy day');
    assert(quests.summary(DAY2).done === 0 && quests.list(DAY2).every((q) => q.progress === 0 && !q.done), 'the next day is empty');
    assert(quests.record('coins', 3, DAY2).length === 1 && storage.getCoins() === 6, 'and pays again: 3 + 3');
    // Возврат на прошлый день (часы переводили назад) не воскрешает прошлое: запись теперь про DAY2.
    assert(quests.summary(DAY).done === 0, 'the saved day is DAY2, so DAY looks empty');
  });
  // Настоящий набор: на другой день, как правило, другие задания.
  const first = questsFor(DAY).map((q) => q.kind).join();
  const days = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => questsFor(d).map((q) => q.kind).join());
  assert(days.some((set) => set !== first), 'the set changes from day to day');
});

await check('progress: saved across restarts; watch lists only unfinished "one run" quests', () => {
  withPool(POOL_COINS, () => {
    const { storage, raw } = makeStorage();
    new Quests(storage).record('coins', 2, DAY);
    assert(raw('questDay') === DAY && raw('questProgress').coins === 2 && Array.isArray(raw('questClaimed')), 'saved');
    const again = new Quests(storage);
    assert(again.list(DAY)[0].progress === 2, 'a new object sees the progress');
    assert(JSON.stringify(again.watch(DAY)) === JSON.stringify([{ kind: 'survive', target: 30 }]), JSON.stringify(again.watch(DAY)));
    again.record('survive', 30, DAY);
    assert(again.watch(DAY).length === 0, 'a finished quest is no longer watched');
    assert(new Quests(storage).watch(DAY2).length === 1, 'a new day watches it again');
  });
});

await check('progress: garbage in the save is repaired and never crashes', () => {
  withPool(POOL_COINS, () => {
    for (const bad of [
      { questDay: DAY, questProgress: 'x', questClaimed: 5 },
      { questDay: DAY, questProgress: [1, 2], questClaimed: { a: 1 } },
      { questDay: DAY, questProgress: { coins: -4, graze: 'abc', survive: NaN, unknown: 7 }, questClaimed: ['nope', 7, null] },
      { questDay: 'not-a-day', questProgress: { coins: 2 }, questClaimed: ['coins'] },
      { questDay: 20261005, questProgress: null, questClaimed: null }
    ]) {
      const { storage } = makeStorage(bad);
      const quests = new Quests(storage);
      const list = quests.list(DAY);
      assert(list.length === 3 && list.every((q) => q.progress === 0 && !q.done), `garbage ${JSON.stringify(bad)} must read as an empty day`);
      assert(quests.summary(DAY).done === 0 && quests.snapshot().questProgress && Array.isArray(quests.snapshot().questClaimed), 'summary and snapshot work');
      assert(quests.snapshot().questClaimed.length === 0, 'garbage claims are not passed on to the cloud');
      assert(quests.record('coins', 1, DAY).length === 0 && quests.list(DAY)[0].progress === 1, 'and counting works from there');
    }
    // Остаток хорошего: плохой прогресс по одному виду не портит другие.
    const { storage } = makeStorage({ questDay: DAY, questProgress: { coins: 2, graze: 'oops' }, questClaimed: [] });
    const list = new Quests(storage).list(DAY);
    assert(list[0].progress === 2 && list[1].progress === 0, 'one bad number does not spoil the others');
  });
});

// ---- (в) облако

await check('cloud: the same day takes the bigger progress and joins claims; other days and garbage are ignored', () => {
  withPool(POOL_COINS, () => {
    const { storage } = makeStorage();
    const quests = new Quests(storage);
    quests.record('coins', 2, DAY);
    quests.record('survive', 10, DAY);
    assert(quests.merge({ questDay: DAY, questProgress: { coins: 1, survive: 25, graze: 4 }, questClaimed: [] }, DAY) === true, 'something changed');
    const list = quests.list(DAY);
    assert(list[0].progress === 2 && list[2].progress === 25 && list[1].progress === 4, `max per kind: ${JSON.stringify(list.map((q) => q.progress))}`);
    assert(quests.merge({ questDay: DAY, questProgress: { coins: 1, survive: 25, graze: 4 }, questClaimed: [] }, DAY) === false, 'the same data twice changes nothing');
    assert(quests.merge({ questDay: DAY, questProgress: {}, questClaimed: ['coins'] }, DAY) === true && quests.list(DAY)[0].done, 'a claim made on another device is joined');
    assert(quests.merge({ questDay: DAY, questProgress: { coins: 99 }, questClaimed: [] }, DAY) === false && quests.list(DAY)[0].done, 'a claim is never taken back');
    assert(quests.merge({ questDay: '2026-10-04', questProgress: { coins: 3 }, questClaimed: ['survive'] }, DAY) === false, 'an older day is ignored');
    assert(quests.merge({ questDay: '2026-10-09', questProgress: { coins: 3 }, questClaimed: ['survive'] }, DAY) === false, 'a day from the future is ignored');
    for (const bad of [null, undefined, 'x', 5, [], {}, { questDay: 'x' }, { questDay: DAY2 }]) assert(quests.merge(bad, DAY) === false, `${JSON.stringify(bad)} must be ignored`);
    assert(quests.merge({ questDay: DAY, questProgress: { coins: 1 }, questClaimed: [] }, 'not-a-day') === false, 'no merge without a trusted today');
    assert(!quests.list(DAY)[2].done, 'nothing else was claimed by accident');
    quests.merge({ questDay: DAY, questProgress: { survive: 99999 }, questClaimed: [] }, DAY);
    assert(quests.snapshot().questProgress.survive === 30 && !quests.list(DAY)[2].done, 'an absurd number from the cloud is cut to the goal and does not complete the quest by itself');
  });
});

await check('cloud: a new device takes today\'s cloud progress; an old local day is replaced; claims from the cloud do not pay again', () => {
  withPool(POOL_COINS, () => {
    const { storage } = makeStorage({ questDay: '2026-10-01', questProgress: { coins: 2 }, questClaimed: ['survive'] });
    const quests = new Quests(storage);
    assert(quests.merge({ questDay: DAY, questProgress: { coins: 1, graze: 3 }, questClaimed: ['coins'] }, DAY) === true, 'taken');
    const list = quests.list(DAY);
    assert(list[0].done && list[1].progress === 3 && !list[2].done, 'cloud state, not the old local day');
    assert(storage.getCoins() === 0, 'merging never pays: the coins of a claimed quest come with the shared coin counters');
    const snap = quests.snapshot();
    assert(snap.questDay === DAY && snap.questProgress.graze === 3 && snap.questClaimed.join() === 'coins', JSON.stringify(snap));
    const { storage: other } = makeStorage();
    const target = new Quests(other);
    target.merge(snap, DAY);
    assert(JSON.stringify(target.snapshot()) === JSON.stringify(snap), 'the snapshot round-trips');
    const empty = new Quests(makeStorage().storage).snapshot();
    assert(empty.questDay === null && Object.keys(empty.questProgress).length === 0 && empty.questClaimed.length === 0, 'an empty snapshot');
    assert(['questDay', 'questProgress', 'questClaimed'].every((key) => CONFIG.YANDEX.CLOUD_KEYS.includes(key)), 'the keys are requested back from the cloud');
    // Запись, где у полученного задания остался прогресс (так мог записать старый код): слияние с тем же не меняет ничего.
    const { storage: leftover } = makeStorage({ questDay: DAY, questProgress: { coins: 2, graze: 1 }, questClaimed: ['coins'] });
    const kept = new Quests(leftover);
    assert(kept.list(DAY)[0].done && kept.list(DAY)[1].progress === 1, 'the claimed quest is done, the other one keeps its progress');
    assert(kept.merge({ questDay: DAY, questProgress: { coins: 2, graze: 1 }, questClaimed: ['coins'] }, DAY) === false, 'merging the same data is not a change');
    assert(!('coins' in kept.snapshot().questProgress), 'a finished quest has no progress to pass on');
  });
});

// ---- (г) игра

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
    clockOffset: 0,
    devDay: day,
    shopWindow: null,
    questsWindow: null,
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

// Конец забега без вывода в консоль.
function endRun(game, { seconds, score = 0 }) {
  const log = console.log;
  console.log = () => {};
  try {
    game.state = 'PLAYING';
    game.runTime = seconds;
    game.distanceScore = score;
    game.pathReward = 0;
    game.gameOver();
  } finally {
    console.log = log;
  }
}
// Новый забег (start() обнуляет состояние забега, как в настоящей игре).
function beginRun(game, { daily = false } = {}) {
  game.state = 'GAMEOVER';
  game.dailyPending = daily;
  game.start();
}

await check('game: coins and close calls reach the quests; the goal pays at once with a toast, a sound and a pulse', () => {
  withPool(POOL_COINS, () => {
    const { game, calls } = makeGame({ coins: 4 });
    game.applyCoinPickup(2);
    assert(questOf(game, 'coins').progress === 2 && game.questToasts.length === 0, 'two coins: no toast yet');
    game.applyCoinPickup(1);
    assert(questOf(game, 'coins').done, 'three coins: the quest is done');
    assert(game.questToasts.length === 1 && game.questToasts[0].reward === 3 && game.questToasts[0].age === 0, JSON.stringify(game.questToasts));
    assert(game.coins === 10 && game.storage.getCoins() === 10, `4 + 3 picked up + 3 reward = 10, got ${game.coins}`);
    assert(game.storage.coinCounters().earned === 10 && game.storage.coinCounters().spent === 0, 'earned coins');
    assert(calls.sounds.includes('buy') && calls.pulses.includes('best'), 'a sound and a pulse');
    game.applyCoinPickup(5);
    assert(game.questToasts.length === 1 && game.coins === 15, 'more coins give coins only, no second toast');
    for (let i = 0; i < 4; i += 1) game.applyGraze({ x: 1, y: 1, side: 1 });
    assert(questOf(game, 'graze').progress === 4 && game.questToasts.length === 1, 'four close calls of five');
    game.applyGraze({ x: 1, y: 1, side: -1 });
    assert(questOf(game, 'graze').done && game.questToasts.length === 2 && game.questToasts[1].reward === 5 && game.coins === 20, `the fifth: reward 5, coins ${game.coins}`);
  });
});

await check('game: only intentional risk passes count; the multiplier quest follows the real multiplier', () => {
  withPool(POOL_RISK, () => {
    const { game } = makeGame();
    game.questWatch = game.quests.watch(DAY);
    assert(JSON.stringify(game.questWatch) === JSON.stringify([{ kind: 'multiplier', target: 2 }]), 'the multiplier quest is watched');
    game.applyReward('SAFE', false, false);
    game.applyReward('SAFE', false, true);
    assert(questOf(game, 'risk').progress === 0, 'safe passes are not risk');
    game.applyReward('RISKY', true, true);
    game.applyReward('RISKY', true, true);
    assert(questOf(game, 'risk').progress === 2 && game.multiplier === 1.5 && game.runMaxMultiplier === 1.5, `two risks: x${game.multiplier}`);
    game.updateQuests();
    assert(!questOf(game, 'multiplier').done, 'x1.5 is not x2');
    game.applyReward('RISKY', true, true);
    assert(questOf(game, 'risk').done && game.multiplier === 2 && game.runMaxMultiplier === 2, 'the third risk: the narrow-path quest is done and the multiplier is x2');
    game.updateQuests();
    assert(questOf(game, 'multiplier').done, 'the multiplier quest completes in the run');
    assert(game.questToasts.length === 2 && game.questWatch.length === 0, 'two toasts, nothing left to watch');
    // Множитель потом падает, а лучший за забег остаётся.
    game.applyReward('SAFE', false, true);
    assert(game.multiplier === 1 && game.runMaxMultiplier === 2, 'the best multiplier of the run is remembered');
  });
});

await check('game: a goal reached in the very frame of the defeat still counts at game over (the in-run check no longer runs then)', () => {
  withPool(POOL_RISK, () => {
    const { game } = makeGame();
    game.questWatch = game.quests.watch(DAY);
    for (let i = 0; i < 3; i += 1) game.applyReward('RISKY', true, true);
    assert(game.runMaxMultiplier === 2 && !questOf(game, 'multiplier').done, 'x2 reached, but the per-frame check has not run yet');
    endRun(game, { seconds: 12 });
    assert(questOf(game, 'multiplier').done && game.coins === 5 + 8, `the multiplier quest completes at game over: coins ${game.coins}`);
  });
  withPool(POOL_COINS, () => {
    const { game } = makeGame();
    game.questWatch = game.quests.watch(DAY);
    endRun(game, { seconds: 30 });
    assert(questOf(game, 'survive').done, 'the last second of the run counts too');
  });
});

await check('game: seconds and points complete in the run at the moment the goal is reached, once, and cost nothing before that', () => {
  withPool(POOL_SCORE, () => {
    const { game } = makeGame();
    game.questWatch = game.quests.watch(DAY);
    assert(game.questWatch.length === 2, 'score and seconds are watched');
    // Пока цель не достигнута, хранилище не трогается (проверка идёт каждый кадр).
    let reads = 0;
    const originalGet = game.storage.get.bind(game.storage);
    game.storage.get = (...args) => { reads += 1; return originalGet(...args); };
    game.runTime = 14.9;
    for (let i = 0; i < 500; i += 1) game.updateQuests();
    assert(reads === 0 && game.questToasts.length === 0, `the per-frame check must not touch the storage (${reads} reads)`);
    game.runTime = 15;
    game.updateQuests();
    assert(questOf(game, 'survive').done && game.questToasts.length === 1 && game.questToasts[0].reward === 8, 'survive 15 s is done at 15.0');
    assert(game.questWatch.length === 1 && game.questWatch[0].kind === 'score', 'it is not watched any more');
    for (let i = 0; i < 5; i += 1) game.updateQuests();
    assert(game.questToasts.length === 1 && game.coins === 8, 'and it pays only once');
    game.distanceScore = 399;
    game.updateQuests();
    assert(!questOf(game, 'score').done, '399 is not 400');
    game.pathReward = 1;
    game.updateQuests();
    assert(questOf(game, 'score').done && game.questToasts.length === 2 && game.coins === 13, 'points count distance and path rewards together: 400 pays 5');
    // Разработческий старт с середины (?start=100): секунды считаются от него.
    const { game: dev } = makeGame();
    dev.devStartTime = 100;
    dev.runTime = 105;
    assert(dev.questRunValue('survive') === 5, 'seconds are counted from the dev start');
    assert(dev.questRunValue('nonsense') === 0, 'an unknown kind is 0');
  });
});

await check('game: at the end of a run the best values count; a short run, a revive and a normal run do not count wrongly', () => {
  withPool(POOL_COINS, () => {
    const { game } = makeGame();
    endRun(game, { seconds: 12, score: 100 });
    assert(questOf(game, 'survive').progress === 12, 'the best time of the day so far: 12');
    endRun(game, { seconds: 8, score: 100 });
    assert(questOf(game, 'survive').progress === 12, 'a shorter run does not lower it');
    endRun(game, { seconds: 31, score: 100 });
    assert(questOf(game, 'survive').done && game.questToasts.length === 1, 'a run of 31 s finishes "survive 30" at game over');
  });
  withPool(POOL_RISK, () => {
    const { game } = makeGame();
    endRun(game, { seconds: CONFIG.QUESTS.MIN_RUN_SECONDS - 0.5 });
    assert(questOf(game, 'runs').progress === 0, 'an instant defeat is not a played run');
    endRun(game, { seconds: 12 });
    assert(questOf(game, 'runs').progress === 1 && game.questRunCounted === true, 'a real run counts');
    endRun(game, { seconds: 20 }); // возрождение: тот же забег кончается второй раз
    assert(questOf(game, 'runs').progress === 1, 'a revive does not count the same run twice');
    beginRun(game);
    assert(game.questRunCounted === false, 'a new run can be counted');
    endRun(game, { seconds: 12 });
    assert(questOf(game, 'runs').done && game.questToasts.length === 1 && game.coins === 3, 'the second run completes "play 2 runs"');
    // Первый конец забега короче минимума, потом возрождение и «настоящий» конец: считается один раз.
    const { game: revived } = makeGame();
    endRun(revived, { seconds: 4 });
    endRun(revived, { seconds: 15 });
    assert(questOf(revived, 'runs').progress === 1, 'a revive after a very short first defeat still counts once');
  });
  withPool(POOL_SCORE, () => {
    const { game } = makeGame();
    endRun(game, { seconds: 12, score: 300 });
    assert(questOf(game, 'daily').progress === 0 && !questOf(game, 'daily').done, 'an ordinary run is not the daily run');
    assert(questOf(game, 'score').progress === 300 && questOf(game, 'survive').progress === 12, 'but its best time and score count');
    beginRun(game, { daily: true });
    endRun(game, { seconds: CONFIG.QUESTS.MIN_RUN_SECONDS - 1, score: 50 });
    assert(!questOf(game, 'daily').done, 'a daily run that ends at once does not count');
    beginRun(game, { daily: true });
    assert(game.dailyRun === true, 'a daily run');
    endRun(game, { seconds: 12, score: 50 });
    assert(questOf(game, 'daily').done && game.questToasts.some((toast) => toast.reward === 3), 'a real daily run completes the quest');
  });
});

await check('game: quest coins go to the cloud snapshot saved at game over; the record and the leaderboard are untouched', () => {
  withPool(POOL_COINS, () => {
    const { game, calls } = makeGame({ coins: 1, extra: { bestScore: 500 } });
    game.platform.submitScore = async () => true;
    endRun(game, { seconds: 31, score: 100 });
    assert(game.bestScore === 500 && game.isNewBest === false, 'no record change');
    const saved = calls.saved.at(-1);
    assert(saved && saved.questDay === DAY && saved.questClaimed.join() === 'survive', JSON.stringify(saved));
    assert(saved.coinsEarned === 1 + 8 && saved.coins === 9, `the reward is in the saved coins: ${JSON.stringify(saved)}`);
  });
});

await check('game: start() clears old toasts and rebuilds the watch from the quests that are still open', () => {
  withPool(POOL_COINS, () => {
    const { game } = makeGame();
    game.questToasts = [{ reward: 3, age: 1 }];
    game.runMaxMultiplier = 4;
    game.questRunCounted = true;
    game.state = 'GAMEOVER';
    game.start();
    assert(game.questToasts.length === 0 && game.runMaxMultiplier === 1 && game.questRunCounted === false, 'a clean slate');
    assert(JSON.stringify(game.questWatch) === JSON.stringify([{ kind: 'survive', target: 30 }]), 'the open quest is watched');
    game.quests.record('survive', 30, DAY);
    game.state = 'GAMEOVER';
    game.start();
    assert(game.questWatch.length === 0, 'a finished quest is not watched in the next run');
  });
});

await check('game: toasts go one after another and fade after the set time; time stands still outside the run', () => {
  const { game } = makeGame();
  const life = CONFIG.QUESTS.TOAST_SECONDS;
  game.onQuestDone({ reward: 3 });
  game.onQuestDone({ reward: 5 });
  assert(game.questToasts.length === 2, 'two in the queue');
  game.updateQuestToast(life / 2);
  assert(game.questToasts[0].age === life / 2 && game.questToasts[1].age === 0, 'only the first one ages');
  game.updateQuestToast(life / 2);
  assert(game.questToasts.length === 1 && game.questToasts[0].reward === 5 && game.questToasts[0].age === 0, 'the first is gone, the second starts fresh');
  game.updateQuestToast(life);
  assert(game.questToasts.length === 0, 'the queue is empty');
  game.updateQuestToast(1);
  const bare = Object.assign(Object.create(Game.prototype), {});
  bare.updateQuestToast(1);
  bare.updateQuests();
  assert(bare.recordQuest('coins', 1).length === 0 && bare.finishQuestRun(10) === undefined, 'a game without quests ignores them');
});

await check('game: the quests window opens only from the start screen, blocks a launch, closes with its button and only with it', () => {
  const recording = recordingContext();
  const { game } = makeGame({ state: 'START' });
  game.renderer = new Renderer(recording.ctx);
  game.handleSoundTap = () => false;
  assert(game.openQuests() === true && game.questsWindow !== null, 'opened');
  assert(game.openQuests() === false, 'not twice');
  assert(game.tryLaunch() === false && game.state === 'START', 'no launch behind the window');
  assert(game.startDaily() === false && game.dailyPending === false, 'no daily run behind the window');
  game.renderer.drawQuests(game.questsView());
  const close = game.renderer.questsButtons.close;
  game.handleTap(10, 10);
  assert(game.questsWindow !== null && game.state === 'START', 'a tap beside the button keeps the window and starts nothing');
  game.handleTap(close.x + close.w / 2, close.y + close.h / 2);
  assert(game.questsWindow === null && game.state === 'START', 'the close button closes it');
  assert(game.closeQuests() === false, 'closing a closed window does nothing');
  for (const state of ['PLAYING', 'GAMEOVER']) {
    const other = makeGame({ state }).game;
    assert(other.openQuests() === false && other.questsWindow === null, `${state}: no window`);
  }
  const shop = makeGame({ state: 'START' }).game;
  shop.shopWindow = { message: null };
  assert(shop.openQuests() === false, 'not over the shop');
  const board = makeGame({ state: 'START' }).game;
  board.leaderboard = { status: 'ready' };
  assert(board.openQuests() === false, 'not over the leaderboard');
  assert(game.tryLaunch() === true && game.state === 'PLAYING', 'with the window closed a launch works');
});

await check('game: the window shows the minutes to the next Moscow midnight', () => {
  const { game } = makeGame({ state: 'START' });
  const noonMoscow = Date.parse('2026-10-05T09:00:00Z'); // 12:00 по Москве
  game.nowMs = () => noonMoscow;
  assert(game.questsView().resetMinutes === 12 * 60, `${game.questsView().resetMinutes} minutes at noon`);
  game.nowMs = () => noonMoscow + 30000;
  assert(game.questsView().resetMinutes === 12 * 60, 'an unfinished minute is rounded up: 11 h 59.5 min says 720');
  game.nowMs = () => noonMoscow;
  game.nowMs = () => Date.parse('2026-10-05T20:59:30Z');
  assert(game.questsView().resetMinutes === 1, 'half a minute before midnight still says 1 minute');
  game.nowMs = () => Date.parse('2026-10-05T21:00:00Z');
  assert(game.questsView().resetMinutes === 24 * 60, 'right after midnight: 24 hours');
  assert(msUntilNextDay(Date.parse('2026-10-05T20:59:59Z')) === 1000 && msUntilNextDay(NaN) === 0, 'the helper');
  assert(msUntilNextDay(Date.parse('2026-10-05T21:00:00Z')) === 86400000 && msUntilNextDay(0, 0) === 86400000, 'a whole day right at midnight');
});

await check('game: the cloud brings quests from another device and the snapshot carries them; today comes from the server clock', () => {
  withPool(POOL_COINS, () => {
    const { game } = makeGame();
    game.quests.record('coins', 1, DAY);
    assert(game.applyCloudData({ questDay: DAY, questProgress: { coins: 2, graze: 3 }, questClaimed: ['survive'] }) === true, 'changed');
    assert(questOf(game, 'coins').progress === 2 && questOf(game, 'graze').progress === 3 && questOf(game, 'survive').done, 'merged');
    assert(game.coins === 0, 'merging pays nothing');
    assert(game.applyCloudData({ questDay: '2026-09-30', questProgress: { coins: 3 }, questClaimed: ['coins'] }) === false, 'an old day changes nothing');
    const snapshot = game.cloudSnapshot();
    assert(snapshot.questDay === DAY && snapshot.questProgress.graze === 3 && snapshot.questClaimed.join() === 'survive', JSON.stringify(snapshot));
    // «Сегодня» берётся из той же даты, что и у забега дня (серверные часы Яндекса, UTC+3).
    const live = makeGame({ day: undefined }).game;
    live.devDay = undefined;
    live.clockOffset = 0;
    live.nowMs = () => Date.parse('2026-10-05T22:00:00Z');
    assert(live.todayKey() === '2026-10-06', 'after 21:00 UTC it is already the next game day');
  });
});

// ---- (д) рисование

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

// Рисовальщик, который запоминает вызовы fitText и screenPill.
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

await check('drawing: the quests button joins the others — in every combination all buttons fit and none overlap the daily button, the sound row or each other', () => {
  const { renderer } = spyRenderer();
  const daily = { played: false, reward: 5, streak: 0, best: 0 };
  for (let mask = 0; mask < 32; mask += 1) {
    const show = { shop: !!(mask & 1), quests: (mask & 2) ? { done: 1, total: 3 } : undefined, leaderboard: !!(mask & 4), shortcut: !!(mask & 8), daily: (mask & 16) ? daily : undefined };
    renderer.drawStartScreen(false, 0.5, show);
    const buttons = renderer.platformButtons || {};
    const names = Object.keys(buttons).sort().join();
    const expected = ['shop', 'quests', 'leaderboard', 'shortcut'].filter((name) => (name === 'quests' ? show.quests : show[name])).sort().join();
    assert(names === expected, `mask ${mask}: buttons ${names}, expected ${expected}`);
    const rects = Object.values(buttons);
    for (const r of rects) assert(inside(r) && r.h >= 44 && r.w >= 190, `mask ${mask}: a button is off screen or too small ${JSON.stringify(r)}`);
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => assert(!overlap(a, b), `mask ${mask}: two buttons overlap`)));
    for (const s of Object.values(renderer.soundButtons || {})) rects.forEach((r) => assert(!overlap(s, r), `mask ${mask}: a button touches the sound row`));
    if (renderer.dailyButton) rects.forEach((r) => assert(!overlap(r, renderer.dailyButton), `mask ${mask}: a button touches the daily button`));
    assert(renderer.hitPlatformButton(buttons.quests ? buttons.quests.x + buttons.quests.w / 2 : -5, buttons.quests ? buttons.quests.y + buttons.quests.h / 2 : -5) === (buttons.quests ? 'quests' : null), `mask ${mask}: the quests button is hit by its centre`);
  }
});

await check('drawing: the button says done/total in both languages and turns green only when every quest is done', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const { renderer, texts, pills } = spyRenderer();
      const word = DICTIONARIES[lang].quest.button.split(' ')[0];
      const draw = (quests) => {
        texts.length = 0;
        pills.length = 0;
        renderer.drawStartScreen(false, 0.5, { quests });
        return { text: texts.join('|'), green: pills.filter((p) => p.fill === CONFIG.COLORS.SafeLawn).length };
      };
      const some = draw({ done: 1, total: 3 });
      assert(some.text.includes(`${word} 1/3`) && some.green === 0, `${lang}: ${some.text}`);
      const none = draw({ done: 0, total: 3 });
      assert(none.text.includes(`${word} 0/3`) && none.green === 0, `${lang}: nothing done`);
      const all = draw({ done: 3, total: 3 });
      assert(all.text.includes(`${word} 3/3`) && all.green === 1, `${lang}: all done turns the button green (${all.green} green pills)`);
    }
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: the quests window — three rows with title, scope, reward or "done", numbers; everything inside the card; the close button works', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const dict = DICTIONARIES[lang].quest;
      const { renderer, lines, pills } = spyRenderer();
      const view = {
        resetMinutes: 5 * 60 + 12,
        quests: [
          { kind: 'coins', mode: 'sum', tier: 0, target: 3, reward: 3, progress: 3, done: true },
          { kind: 'survive', mode: 'best', tier: 1, target: 50, reward: 5, progress: 20, done: false },
          { kind: 'multiplier', mode: 'best', tier: 2, target: 3, reward: 8, progress: 0, done: false }
        ]
      };
      renderer.drawQuests(view);
      const text = lines.map((l) => l.text);
      assert(text.includes(dict.title) && text.includes(dict.reset.replace('{h}', '5').replace('{m}', '12')), `${lang}: title and countdown`);
      for (const q of view.quests) assert(text.includes(dict.kind[q.kind]), `${lang}: the title of ${q.kind}`);
      assert(text.filter((s) => s === dict.scopeDay).length === 1 && text.filter((s) => s === dict.scopeRun).length === 2, `${lang}: scope lines`);
      assert(text.filter((s) => s === dict.done).length === 1 && !text.includes('+3') && text.includes('+5') && text.includes('+8'), `${lang}: a done quest says "done", open ones show their reward: ${text}`);
      assert(text.includes(dict.progress.replace('{p}', '3').replace('{n}', '3')), `${lang}: 3 / 3`);
      assert(text.includes(dict.progressSeconds.replace('{p}', '20').replace('{n}', '50')), `${lang}: seconds`);
      assert(text.includes(dict.progressMultiplier.replace('{p}', '1').replace('{n}', '3')), `${lang}: the multiplier shows at least x1`);
      // Всё внутри карточки, строки идут сверху вниз, ничего не выходит за экран.
      const cardTop = 80;
      const cardBottom = 80 + 800;
      for (const l of lines) assert(l.y > cardTop && l.y < cardBottom && l.maxWidth <= CONFIG.CANVAS_WIDTH - 72, `${lang}: "${l.text}" sits outside the card (y ${l.y}, width ${l.maxWidth})`);
      const titles = view.quests.map((q) => lines.find((l) => l.text === dict.kind[q.kind]).y);
      assert(titles[0] < titles[1] && titles[1] < titles[2], `${lang}: rows go top to bottom`);
      for (const p of pills) assert(p.cx - p.w / 2 >= 36 && p.cx + p.w / 2 <= CONFIG.CANVAS_WIDTH - 36 && p.cy + p.h / 2 < cardBottom, `${lang}: a pill leaves the card ${JSON.stringify(p)}`);
      // Название слева, награда справа: текст названия не заходит под капсулу награды.
      const pillLeft = Math.min(...pills.filter((p) => p.w === 116).map((p) => p.cx - p.w / 2));
      for (const q of view.quests) {
        const title = lines.find((l) => l.text === dict.kind[q.kind]);
        assert(title.align === 'left' && title.x + title.maxWidth <= pillLeft, `${lang}: the title of ${q.kind} runs under the reward pill`);
      }
      const close = renderer.questsButtons.close;
      assert(inside(close) && close.h >= 44 && close.w >= 200, `${lang}: close button ${JSON.stringify(close)}`);
      assert(renderer.hitQuestsButton(close.x + close.w / 2, close.y + close.h / 2) === true, `${lang}: the centre hits`);
      assert(renderer.hitQuestsButton(close.x - 40, close.y + close.h / 2) === false && renderer.hitQuestsButton(10, 10) === false, `${lang}: beside does not`);
      // Меньше часа: только минуты.
      lines.length = 0;
      renderer.drawQuests({ ...view, resetMinutes: 25 });
      assert(lines.some((l) => l.text === dict.resetMin.replace('{m}', '25')), `${lang}: under an hour shows minutes only`);
    }
  } finally {
    setLanguage(saved);
  }
});

await check('drawing: the progress bar and the pills are drawn for every state without errors (empty day, full day, odd numbers)', () => {
  const { renderer } = spyRenderer();
  const kinds = Object.keys(CONFIG.QUESTS.POOL);
  const make = (kind, tier, progress, done) => ({ kind, mode: QUEST_MODES[kind], tier, target: CONFIG.QUESTS.POOL[kind][tier] ?? 1, reward: CONFIG.QUESTS.REWARDS[tier], progress, done });
  for (const kind of kinds) {
    const tier = CONFIG.QUESTS.POOL[kind].findIndex((goal) => goal != null);
    for (const [progress, done] of [[0, false], [1, false], [CONFIG.QUESTS.POOL[kind][tier], true]]) {
      renderer.drawQuests({ resetMinutes: 1, quests: [make(kind, tier, progress, done)] });
    }
  }
  renderer.drawQuests({ resetMinutes: 1440, quests: [] });
  renderer.drawQuests({ resetMinutes: 90, quests: [make('coins', 0, 99, false), make('coins', 1, -5, false)] });
});

await check('drawing: the "quest done" toast sits under the time-of-day toast in a run, above the card on the game over screen, and nowhere else', () => {
  const saved = getLanguage();
  try {
    setLanguage('en');
    const toastCalls = [];
    const renderer = new Proxy({}, {
      get: (_, name) => (...args) => {
        if (name === 'drawStageToast') toastCalls.push(args);
      }
    });
    const fresh = (state, extra = {}) => makeGame({
      state,
      extra: { renderer, stageToast: null, ...extra }
    }).game;
    const run = (game) => { toastCalls.length = 0; game.render(); return toastCalls.slice(); };

    const playing = fresh('PLAYING');
    playing.questToasts = [{ reward: 5, age: CONFIG.QUESTS.TOAST_SECONDS / 2 }];
    let calls = run(playing);
    assert(calls.length === 1 && calls[0][0] === 'QUEST DONE  +5' && calls[0][1] === 1 && calls[0][2] === 176, `run: ${JSON.stringify(calls)}`);
    playing.stageToast = { name: 'dusk', age: 1 };
    calls = run(playing);
    assert(calls.length === 2 && calls[0][2] === undefined && calls[1][2] === 176, 'with the stage toast on screen the quest toast is the lower one');

    playing.stageToast = null;
    playing.questToasts = [{ reward: 5, age: 0 }];
    assert(run(playing)[0][1] === 0, 'it fades in from nothing');
    playing.questToasts = [{ reward: 5, age: CONFIG.QUESTS.TOAST_SECONDS - 0.25 }];
    const fading = run(playing)[0][1];
    assert(fading > 0 && fading < 1, `and fades out (${fading})`);

    playing.userPaused = true;
    assert(run(playing).length === 0, 'not over the pause screen');
    playing.userPaused = false;

    const over = fresh('GAMEOVER');
    over.questToasts = [{ reward: 8, age: 1 }];
    calls = run(over);
    assert(calls.length === 1 && calls[0][0] === 'QUEST DONE  +8' && calls[0][2] === 124, `game over: ${JSON.stringify(calls)}`);

    const start = fresh('START');
    start.questToasts = [{ reward: 8, age: 1 }];
    assert(run(start).length === 0, 'never on the start screen');
    const empty = fresh('PLAYING');
    assert(run(empty).length === 0, 'nothing to show, nothing drawn');
  } finally {
    setLanguage(saved);
  }
});

// ---- (ж) возврат в меню с экрана проигрыша (без него забег дня и задания после первого забега недостижимы)

await check('menu: from the game over screen the start screen comes back clean — score, run state, toasts and the daily flag are reset', () => {
  const { game } = makeGame({ state: 'GAMEOVER' });
  let trackResets = 0;
  const originalReset = game.track.reset.bind(game.track);
  game.track.reset = () => { trackResets += 1; originalReset(); };
  Object.assign(game, {
    score: 500, distanceScore: 300, pathReward: 200, multiplier: 3, riskStreak: 4, runTime: 40, floatingRewards: [{}],
    questToasts: [{ reward: 3, age: 1 }], stageToast: { name: 'dusk', age: 1 }, dailyRun: true, dailyResult: { reward: 5 }, isNewBest: true
  });
  game.track.setSeed(123);
  game.track.setCanonicalClock(true);
  let syncs = 0;
  game.syncGameplayLifecycle = () => { syncs += 1; };
  assert(game.openMenu() === true && game.state === 'START' && game.fromMenu === true, 'back on the start screen');
  assert(game.score === 0 && game.distanceScore === 0 && game.pathReward === 0 && game.multiplier === 1 && game.riskStreak === 0 && game.runTime === 0, 'the numbers of the run are zero');
  assert(game.floatingRewards.length === 0 && game.questToasts.length === 0 && game.stageToast === null && game.isNewBest === false, 'floats, toasts and the new-best flag are gone');
  assert(game.dailyRun === false && game.dailyResult === null, 'the daily run is over');
  assert(syncs === 1, 'the platform is told that gameplay is not active');
  assert(trackResets === 1 && game.track.seed === null && game.track.canonical === false, 'a fresh ordinary track stands behind the card');
  assert(game.openMenu() === false, 'not twice (it is the start screen now)');
});

await check('menu: only from the game over screen, not during an ad and not over a window', () => {
  for (const state of ['START', 'PLAYING']) {
    const { game } = makeGame({ state });
    assert(game.openMenu() === false && game.state === state && game.fromMenu === false, `${state}: refused`);
  }
  for (const [name, patch] of [['an ad about to start', { launchPending: true }], ['a rewarded ad', { rewardPending: true }], ['the shop', { shopWindow: { message: null } }], ['the quests', { questsWindow: {} }], ['the leaderboard', { leaderboard: { status: 'ready' } }]]) {
    const { game } = makeGame({ state: 'GAMEOVER', extra: patch });
    assert(game.openMenu() === false && game.state === 'GAMEOVER', `refused over ${name}`);
  }
});

await check('menu: from there the quests window opens and a daily run can be started (the point of the button)', () => {
  withPool(POOL_COINS, () => {
    const { game } = makeGame({ state: 'GAMEOVER' });
    game.renderer = new Renderer(recordingContext().ctx);
    game.handleSoundTap = () => false;
    assert(game.openQuests() === false, 'not from the game over screen itself');
    game.openMenu();
    assert(game.openQuests() === true, 'the quests window opens from the menu');
    game.closeQuests();
    assert(game.startDaily() === true && game.state === 'PLAYING' && game.dailyRun === true && game.fromMenu === false, 'a daily run starts from the menu');
  });
  const { game } = makeGame({ state: 'GAMEOVER' });
  game.openMenu();
  assert(game.tryLaunch() === true && game.state === 'PLAYING' && game.dailyRun === false && game.fromMenu === false, 'any other start is an ordinary run');
});

await check('menu: the way through the menu does not skip the interstitial; the very first start still has none', async () => {
  const adAudio = { play() {}, muted: false, setAdPaused() {}, setHidden() {} };
  const makeAdGame = (state, extra = {}) => {
    const shown = { count: 0 };
    const platform = {
      completedRuns: 3,
      shouldShowInterstitial: () => true,
      showInterstitial: () => { shown.count += 1; return Promise.resolve({ attempted: true, wasShown: true }); },
      saveCloudData: () => true,
      recordRunCompleted() {}
    };
    const made = makeGame({ state, extra: { audio: adAudio, platform, ...extra } });
    return { ...made, shown };
  };
  // Самый первый запуск после загрузки: без рекламы, даже если платформа считает, что пора.
  const first = makeAdGame('START');
  assert(first.game.tryLaunch() === true && first.game.state === 'PLAYING' && first.shown.count === 0, 'the first start has no ad');
  // Проигрыш — меню — играть: реклама показывается, как при обычном перезапуске.
  const via = makeAdGame('GAMEOVER');
  via.game.openMenu();
  assert(via.game.tryLaunch() === true && via.game.state === 'START' && via.game.launchPending === true && via.shown.count === 1, 'the ad is shown first');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(via.game.state === 'PLAYING' && via.game.launchPending === false && via.game.fromMenu === false, 'then the run starts');
  // Прямо с экрана проигрыша всё как раньше.
  const direct = makeAdGame('GAMEOVER');
  assert(direct.game.tryLaunch() === true && direct.shown.count === 1 && direct.game.launchPending === true, 'a restart from the game over screen is as before');
  // Забег дня через меню тоже идёт после рекламы, и флаг забега дня не теряется и не залипает.
  const daily = makeAdGame('GAMEOVER');
  daily.game.openMenu();
  assert(daily.game.startDaily() === true && daily.game.launchPending === true && daily.game.dailyPending === true, 'the daily run waits for the ad');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(daily.game.state === 'PLAYING' && daily.game.dailyRun === true && daily.game.dailyPending === false, 'and then starts as a daily run');
  // Реклама закончилась, пока вкладка скрыта: запуск отменён, флаг забега дня не остаётся висеть.
  const hidden = makeAdGame('GAMEOVER');
  hidden.game.openMenu();
  hidden.game.hidden = true;
  hidden.game.startDaily();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(hidden.game.state === 'START' && hidden.game.launchPending === false && hidden.game.dailyPending === false, 'a cancelled start leaves nothing behind');
  hidden.game.hidden = false;
  hidden.game.platform = { ...hidden.game.platform, shouldShowInterstitial: () => false };
  assert(hidden.game.tryLaunch() === true && hidden.game.dailyRun === false, 'the next ordinary start is not a daily run');
  // Реклама закончилась во время паузы платформы, а потом вкладка скрылась: то же самое.
  const paused = makeAdGame('GAMEOVER');
  paused.game.openMenu();
  paused.game.platformPaused = true;
  paused.game.startDaily();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(paused.game.launchPending === true && paused.game.state === 'START', 'the start waits while the platform is paused');
  paused.game.setHidden(true);
  assert(paused.game.launchPending === false && paused.game.dailyPending === false, 'hiding the tab cancels the start and the daily flag');
});

await check('menu: the button is tapped like the other platform buttons and obeys the same input lock', () => {
  const recording = recordingContext();
  const { game } = makeGame({ state: 'GAMEOVER' });
  game.renderer = new Renderer(recording.ctx);
  game.handleSoundTap = () => false;
  const draw = () => game.renderer.drawGameOver(100, 50, 0, 1, { leaderboard: true, menu: true });
  draw();
  const menu = game.renderer.platformButtons.menu;
  game.gameOverInputLocked = () => true;
  game.handleTap(menu.x + menu.w / 2, menu.y + menu.h / 2);
  assert(game.state === 'GAMEOVER', 'in the first moments after the defeat a tap changes nothing');
  game.gameOverInputLocked = () => false;
  game.rewardPending = true;
  game.handleTap(menu.x + menu.w / 2, menu.y + menu.h / 2);
  assert(game.state === 'GAMEOVER', 'and during a rewarded ad');
  game.rewardPending = false;
  game.handleTap(menu.x + menu.w / 2, menu.y + menu.h / 2);
  assert(game.state === 'START' && game.fromMenu === true, 'a tap on the button returns to the start screen');
});

await check('menu: the game over screen is drawn with the menu button', () => {
  const calls = [];
  const renderer = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, args]); } });
  const { game } = makeGame({ state: 'GAMEOVER', extra: { renderer } });
  game.render();
  const over = calls.find(([name]) => name === 'drawGameOver');
  assert(over && over[1][4].menu === true, 'Game.render asks for the menu button on the game over screen');
});

await check('menu: the start screen after the menu is drawn like a fresh one (start card, daily capsule, quests)', () => {
  const calls = [];
  const renderer = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, args]); } });
  const { game } = makeGame({ state: 'GAMEOVER', extra: { renderer } });
  game.openMenu();
  calls.length = 0;
  game.render();
  const start = calls.find(([name]) => name === 'drawStartScreen');
  assert(start && start[1][2].quests && start[1][2].daily && start[1][2].shop === true, 'the start screen is drawn with the quests and the daily capsule');
  assert(!calls.some(([name]) => name === 'drawGameOver' || name === 'drawTimeOfDay'), 'no game over card and no night veil left over');
});

await check('drawing: the game over buttons — shop, leaderboard and menu fit in one row on every layout, none overlap each other or the sound row', () => {
  const saved = getLanguage();
  try {
    for (const lang of ['en', 'ru']) {
      setLanguage(lang);
      const { renderer, lines } = spyRenderer();
      for (const leaderboard of [true, false]) {
        for (const [offerRevive, offerDouble] of [[false, false], [true, false], [true, true]]) {
          lines.length = 0;
          renderer.drawGameOver(120, 500, 7, 1, { leaderboard, menu: true, offerRevive, offerDouble, muted: false });
          const buttons = renderer.platformButtons;
          const names = Object.keys(buttons).sort().join();
          assert(names === (leaderboard ? 'leaderboard,menu,shop' : 'menu,shop'), `${lang}: buttons ${names}`);
          const rects = Object.values(buttons);
          for (const r of rects) assert(inside(r) && r.h >= 44 && r.w >= 150, `${lang}: a button is off screen or too small ${JSON.stringify(r)} (offers ${offerRevive}/${offerDouble})`);
          assert(new Set(rects.map((r) => r.y)).size === 1, `${lang}: one row`);
          rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => assert(!overlap(a, b), `${lang}: two buttons overlap`)));
          for (const s of Object.values(renderer.soundButtons)) rects.forEach((r) => assert(!overlap(s, r), `${lang}: a button touches the sound row`));
          const label = DICTIONARIES[lang].menu.button;
          assert(lines.some((l) => l.text === label), `${lang}: the menu label "${label}" is drawn`);
          if (leaderboard) {
            for (const l of lines.filter((line) => [DICTIONARIES[lang].shop.button, DICTIONARIES[lang].leaderboard.button, label].includes(line.text))) assert(l.maxWidth <= 156 - 16, `${lang}: "${l.text}" must fit its button (${l.maxWidth})`);
          }
          const menu = buttons.menu;
          assert(renderer.hitPlatformButton(menu.x + menu.w / 2, menu.y + menu.h / 2) === 'menu', `${lang}: the centre of the menu button hits it`);
        }
      }
      // Без кнопки «в меню» (как раньше) экран проигрыша не меняется.
      renderer.drawGameOver(120, 500, 7, 1, { leaderboard: true });
      assert(Object.keys(renderer.platformButtons).sort().join() === 'leaderboard,shop', `${lang}: without the menu flag nothing changes`);
      // На стартовом экране кнопки «в меню» нет.
      renderer.drawStartScreen(false, 0.5, { shop: true, quests: { done: 0, total: 3 }, leaderboard: true, shortcut: true });
      assert(!('menu' in renderer.platformButtons), `${lang}: no menu button on the start screen`);
    }
  } finally {
    setLanguage(saved);
  }
});

// ---- (е) строки

await check('strings: the menu button exists in both languages', () => {
  for (const lang of ['en', 'ru']) assert(DICTIONARIES[lang].menu?.button, `${lang}: menu.button is missing`);
  assert(DICTIONARIES.en.menu.button !== DICTIONARIES.ru.menu.button, 'the two languages differ');
});

await check('strings: the quest texts exist in both languages with the right placeholders; every kind has a title', () => {
  const need = {
    button: ['{done}', '{total}'], title: [], reset: ['{h}', '{m}'], resetMin: ['{m}'], scopeDay: [], scopeRun: [], done: [], close: [],
    toast: ['{n}'], progress: ['{p}', '{n}'], progressSeconds: ['{p}', '{n}'], progressMultiplier: ['{p}', '{n}']
  };
  for (const lang of ['en', 'ru']) {
    for (const [key, placeholders] of Object.entries(need)) {
      const text = DICTIONARIES[lang].quest?.[key];
      assert(text, `${lang}: quest.${key} is missing`);
      for (const p of placeholders) assert(text.includes(p), `${lang}: quest.${key} needs ${p}`);
    }
    for (const kind of Object.keys(CONFIG.QUESTS.POOL)) assert(DICTIONARIES[lang].quest.kind?.[kind], `${lang}: quest.kind.${kind} is missing`);
    // Названия без чисел: в русском у числительных меняются окончания, поэтому число стоит отдельно.
    for (const [kind, title] of Object.entries(DICTIONARIES[lang].quest.kind)) assert(!/\d|\{/.test(title), `${lang}: the title of ${kind} must not hold a number`);
  }
  assert(/[А-Яа-я]/.test(DICTIONARIES.ru.quest.toast) && !/[А-Яа-я]/.test(DICTIONARIES.en.quest.toast), 'each language reads in its own letters');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1p checks passed');
}
