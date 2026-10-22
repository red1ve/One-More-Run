// Фаза 2а (шлифовка, 2026-10-19): клубок-щит, лента рекорда, пузырь множителя.
//  (а) клубок: редкий, не раньше FIRST_AT, не чаще MIN_GAP, лежит на дороге, не в стене и не на монете;
//  (б) клубок не сдвигает трассу: с тем же seed ряды те же с клубками и без них, клубки на тех же местах;
//  (в) подбор и щит: одна ошибка (удар ломает щит, препятствия перед котом разлетаются, наград за ряд нет,
//      множитель и серия остаются), краткая неуязвимость, второй удар заканчивает забег, щит гаснет сам;
//  (г) лента рекорда: время лучшего забега хранится, сливается по большему, лента стоит там, где он закончился;
//  (д) пузырь множителя: появляется, когда множитель меняется, и гаснет.
// Запуск: node scripts/phase2a-check.mjs (входит в npm run check).
import fs from 'node:fs';
import { CONFIG, getTrackDistance, getTrackSpeed } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Player } from '../src/game/Player.js';
import { Track } from '../src/game/Track.js';
import { Renderer } from '../src/rendering/Renderer.js';

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

const SHIELD = CONFIG.SHIELD;
const SEEDS = [3, 19, 41, 77];

// Трасса без игры: ряды создаются, пока бежит время; каждый клубок запоминается в момент появления.
function simulate(seed, seconds) {
  const track = new Track();
  track.setSeed(seed);
  track.init();
  const seen = new Set();
  const yarns = [];
  const dt = 1 / 60;
  let t = 0;
  while (t < seconds) {
    t += dt;
    track.update(dt, getTrackSpeed(t), t);
    for (const segment of track.segments) {
      for (const pickup of segment.pickups || []) {
        if (seen.has(pickup)) continue;
        seen.add(pickup);
        const walls = track.segments.flatMap((s) => s.obstacles).map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
        yarns.push({ t, pickup: { ...pickup }, coins: segment.coins.map((c) => ({ x: c.x, y: c.y, width: c.width, height: c.height })), walls });
      }
    }
  }
  return { track, yarns };
}

const fingerprint = (track) => JSON.stringify(track.segments.map((s) => ({
  type: s.type,
  y: Math.round(s.y * 100) / 100,
  obstacles: s.obstacles.map((o) => [o.x, Math.round(o.y * 100) / 100, o.width, o.height]),
  paths: s.paths.map((p) => [p.x, p.width, p.type]),
  coins: s.coins.map((c) => [c.x, Math.round(c.y * 100) / 100])
})));

const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// ---------------------------------------------------------------- (а) появление клубка

await check('shield settings stay in a sensible range (10–15 s, one mistake, rare)', () => {
  assert(SHIELD.DURATION >= 10 && SHIELD.DURATION <= 15, `DURATION ${SHIELD.DURATION}`);
  assert(SHIELD.BLINK_LAST > 0 && SHIELD.BLINK_LAST < SHIELD.DURATION, 'blinking is a short tail of the shield');
  assert(SHIELD.MIN_GAP >= 30 && SHIELD.CHANCE > 0 && SHIELD.CHANCE <= 0.5 && SHIELD.FIRST_AT >= 15, 'a rare pickup');
  assert(SHIELD.CLEAR_AHEAD >= CONFIG.PLAYER_HEIGHT * 4 && SHIELD.GRACE >= 0.1 && SHIELD.GRACE <= 1, 'the explosion clears the way and the grace is brief');
  assert(SHIELD.SIZE >= 20 && SHIELD.SIZE <= 40 && SHIELD.DRAW_SIZE >= SHIELD.SIZE, 'size');
});

await check('yarn balls are rare: not before FIRST_AT, never closer than MIN_GAP, a few in a long run', () => {
  for (const seed of SEEDS) {
    const { yarns } = simulate(seed, 240);
    assert(yarns.length >= 2 && yarns.length <= 8, `seed ${seed}: ${yarns.length} yarn balls in 240 s`);
    assert(yarns[0].t >= SHIELD.FIRST_AT - 0.05, `seed ${seed}: the first yarn appeared at ${yarns[0].t.toFixed(1)} s`);
    for (let i = 1; i < yarns.length; i += 1) {
      assert(yarns[i].t - yarns[i - 1].t >= SHIELD.MIN_GAP - 0.05, `seed ${seed}: yarn balls ${(yarns[i].t - yarns[i - 1].t).toFixed(1)} s apart`);
    }
  }
});

await check('a yarn ball lies on the road, outside walls, away from coins', () => {
  let total = 0;
  for (const seed of SEEDS) {
    for (const { pickup, coins, walls } of simulate(seed, 200).yarns) {
      total += 1;
      assert(pickup.kind === 'YARN' && pickup.width === SHIELD.SIZE && pickup.height === SHIELD.SIZE, 'kind and size');
      assert(pickup.x >= CONFIG.TRACK_LEFT && pickup.x + pickup.width <= CONFIG.TRACK_RIGHT, `seed ${seed}: x ${pickup.x} is off the road`);
      assert(!walls.some((wall) => overlap(pickup, wall)), `seed ${seed}: a yarn ball inside a wall`);
      assert(!coins.some((coin) => overlap(pickup, coin)), `seed ${seed}: a yarn ball on a coin`);
    }
  }
  assert(total >= 8, `too few yarn balls to judge: ${total}`);
});

// ---------------------------------------------------------------- (б) клубок не сдвигает трассу

await check('yarn balls do not move the track: the same rows with and without them, the same places for one seed', () => {
  const saved = SHIELD.CHANCE;
  try {
    for (const seed of SEEDS) {
      SHIELD.CHANCE = 0;
      const without = simulate(seed, 150);
      assert(without.yarns.length === 0, 'no yarn balls at zero chance');
      SHIELD.CHANCE = saved;
      const withYarn = simulate(seed, 150);
      assert(withYarn.yarns.length > 0, `seed ${seed}: the comparison needs yarn balls`);
      assert(fingerprint(without.track) === fingerprint(withYarn.track), `seed ${seed}: the track changed because of yarn balls`);
      const again = simulate(seed, 150);
      assert(JSON.stringify(withYarn.yarns.map((y) => [y.t, y.pickup.x, y.pickup.y])) === JSON.stringify(again.yarns.map((y) => [y.t, y.pickup.x, y.pickup.y])), `seed ${seed}: yarn balls moved between two runs`);
    }
  } finally {
    SHIELD.CHANCE = saved;
  }
});

// ---------------------------------------------------------------- (в) подбор и щит

// «Игра» для simulateStep: настоящие Game.simulateStep, Player и Track.checkCollision / breakAhead.
function makeShieldGame({ shieldTime = 0, segments, pickups = [] }) {
  const player = new Player();
  player.x = CONFIG.TRACK_LEFT + CONFIG.TRACK_WIDTH / 2;
  const events = [];
  const track = {
    segments: segments(player),
    update(dt, speed) {
      for (const segment of this.segments) {
        for (const obs of segment.obstacles) obs.y += speed * dt;
        for (const pickup of segment.pickups || []) pickup.y += speed * dt;
      }
    },
    checkPassed: () => ({}),
    collectCoins: () => 0,
    collectPickups: Track.prototype.collectPickups,
    rectsOverlap: Track.prototype.rectsOverlap,
    checkCollision: Track.prototype.checkCollision,
    breakAhead: Track.prototype.breakAhead
  };
  void pickups;
  const game = {
    state: 'PLAYING', runTime: 30, currentSpeed: 0, distanceScore: 0, pathReward: 0, score: 0, multiplier: 2, riskStreak: 3,
    player, camera: null, floatingRewards: [], invulnerableTime: 0, shieldTime,
    feel: {
      update() {},
      onYarn() { events.push('yarn'); },
      onShieldBreak() { events.push('break'); },
      onShieldEnd() { events.push('end'); }
    },
    track, events,
    isGameplayPaused: () => false,
    applyReward() {}, applyCoinPickup() {},
    applyYarnPickup: Game.prototype.applyYarnPickup,
    breakShield: Game.prototype.breakShield,
    simulateStep: Game.prototype.simulateStep,
    crashed: false,
    gameOver() { this.crashed = true; this.state = 'GAMEOVER'; }
  };
  return game;
}

const wallAt = (player, dy, height = 40) => ({ x: CONFIG.TRACK_LEFT, y: player.y + dy, width: CONFIG.TRACK_WIDTH, height });
const stepFor = (game, seconds) => {
  let hit = false;
  for (let t = 0; t < seconds - 1e-9 && !hit; t += 1 / 60) hit = game.simulateStep(1 / 60);
  return hit;
};

await check('picking up a yarn ball gives the shield; a second one refills it; far balls stay', () => {
  const near = (player) => ({ x: player.x - 13, y: player.y - 13, width: 26, height: 26, collected: false, kind: 'YARN' });
  const far = (player) => ({ x: player.x - 13, y: player.y - 400, width: 26, height: 26, collected: false, kind: 'YARN' });
  const game = makeShieldGame({ segments: (player) => [{ obstacles: [], pickups: [near(player), far(player)] }] });
  assert(game.simulateStep(1 / 60) === false, 'no crash');
  // В тот же шаг щит уже потратил один кадр.
  assert(Math.abs(game.shieldTime - (SHIELD.DURATION - 1 / 60)) < 1e-9 && game.events.join() === 'yarn', `shield ${game.shieldTime}, events ${game.events}`);
  const [pickedUp, left] = game.track.segments[0].pickups;
  assert(pickedUp.collected === true && left.collected === false, 'only the near ball is collected');
  // Щит почти кончился, подобран новый клубок: время полное.
  game.shieldTime = 1.5;
  game.track.segments[0].pickups.push({ x: game.player.x - 13, y: game.player.y - 13, width: 26, height: 26, collected: false, kind: 'YARN' });
  game.simulateStep(1 / 60);
  assert(Math.abs(game.shieldTime - (SHIELD.DURATION - 1 / 60)) < 1e-9, `refilled to ${game.shieldTime}`);
  // Собранный клубок второй раз не подбирается.
  game.shieldTime = 5;
  game.simulateStep(1 / 60);
  assert(game.shieldTime < 5 && game.events.filter((e) => e === 'yarn').length === 2, 'a collected ball is not picked up again');
});

await check('the shield is ONE mistake: the hit breaks it, walls near the cat explode, the run goes on, a second hit ends it', () => {
  const walls = {};
  const game = makeShieldGame({
    shieldTime: SHIELD.DURATION,
    segments: (player) => {
      walls.onCat = wallAt(player, -10);
      walls.ahead = wallAt(player, -SHIELD.CLEAR_AHEAD + 80);
      walls.far = wallAt(player, -SHIELD.CLEAR_AHEAD - 200);
      return [{ obstacles: [walls.onCat, walls.ahead, walls.far], paths: [], coins: [], type: 'NORMAL', isPassed: false }];
    }
  });
  const segment = game.track.segments[0];
  assert(game.simulateStep(1 / 60) === false && !game.crashed, 'the first hit does not end the run');
  assert(game.shieldTime === 0 && game.events.includes('break'), 'the shield is spent');
  assert(!segment.obstacles.includes(walls.onCat) && !segment.obstacles.includes(walls.ahead), 'the wall and the one just ahead exploded');
  assert(segment.obstacles.includes(walls.far), 'a wall far ahead is left alone');
  assert(segment.shieldBroken === true, 'the row is marked as broken (no reward)');
  assert(game.multiplier === 2 && game.riskStreak === 3, 'the multiplier and the streak are kept');
  assert(game.invulnerableTime > 0 && game.invulnerableTime <= SHIELD.GRACE, `grace ${game.invulnerableTime}`);
  // Пока кот неуязвим, он не разбивается; потом новая стена на нём — конец забега (щита больше нет).
  assert(stepFor(game, SHIELD.GRACE + 0.1) === false, 'no crash during the grace time');
  segment.obstacles.push(wallAt(game.player, -10));
  assert(game.simulateStep(1 / 60) === true, 'the second hit ends the run');
  assert(game.events.filter((e) => e === 'break').length === 1, 'the shield broke once');
});

await check('without a shield a hit ends the run at once; an unused shield goes out by itself after DURATION', () => {
  const plain = makeShieldGame({ segments: (player) => [{ obstacles: [wallAt(player, -10)], paths: [], coins: [], type: 'NORMAL', isPassed: false }] });
  assert(plain.simulateStep(1 / 60) === true, 'hit without a shield');
  const fading = makeShieldGame({ shieldTime: 0.1, segments: () => [{ obstacles: [], paths: [], coins: [], type: 'NORMAL', isPassed: false }] });
  stepFor(fading, 0.2);
  assert(fading.shieldTime === 0 && fading.events.join() === 'end', `events ${fading.events}`);
  fading.track.segments[0].obstacles.push(wallAt(fading.player, -10));
  assert(fading.simulateStep(1 / 60) === true, 'after the shield went out a hit ends the run');
  const full = makeShieldGame({ shieldTime: SHIELD.DURATION, segments: () => [{ obstacles: [], paths: [], coins: [], type: 'NORMAL', isPassed: false }] });
  stepFor(full, SHIELD.DURATION - 1);
  assert(full.shieldTime > 0.9 && full.shieldTime < 1.1, `after ${SHIELD.DURATION - 1} s the shield has ${full.shieldTime.toFixed(2)} s left`);
});

await check('a row whose walls the shield broke pays no reward, and a sway planter in it is removed too', () => {
  const player = new Player();
  const path = { x: 100, y: player.y - 400, width: 90, height: 56, type: 'RISKY' };
  const make = (broken) => {
    const track = new Track();
    const far = { x: CONFIG.TRACK_LEFT, y: player.y + 300, width: 60, height: 40 };
    track.segments = [{ isPassed: false, type: 'TWO_PATHS', isChoiceSegment: true, pattern: 'STRAIGHT', chosenPathType: 'RISKY', paths: [path], obstacles: [far], coins: [], shieldBroken: broken }];
    return track;
  };
  assert(make(false).checkPassed(player).rewardType === 'RISKY', 'control: a normal row pays');
  const broken = make(true);
  const result = broken.checkPassed(player);
  assert(result.rewardType === null && broken.segments[0].isPassed === true, 'a broken row pays nothing and counts as passed');
  // Качающееся кашпо убирается вместе со стенами.
  const planter = { x: 200, y: player.y - 20, width: 40, height: 40, sway: { minX: 200, range: 20, period: 3, phase: 0 } };
  const track = new Track();
  track.segments = [{ isPassed: false, obstacles: [planter, { x: CONFIG.TRACK_LEFT, y: player.y - 20, width: 100, height: 40 }], paths: [], coins: [], sway: planter, type: 'NORMAL' }];
  const removed = track.breakAhead(player, SHIELD.CLEAR_AHEAD);
  assert(removed.length === 2 && track.segments[0].sway === null && track.segments[0].isPassed === true, 'the planter is gone and the empty row counts as passed');
  // Подписи пути в разбитой зоне убираются, а в дальнем ряду остаются.
  const near = { x: 100, y: player.y - 30, width: 90, height: 56, type: 'RISKY' };
  const distant = { x: 100, y: player.y - SHIELD.CLEAR_AHEAD - 400, width: 90, height: 56, type: 'SAFE' };
  const labelled = new Track();
  labelled.segments = [{ isPassed: false, obstacles: [{ x: CONFIG.TRACK_LEFT, y: player.y - 30, width: 60, height: 40 }, { x: CONFIG.TRACK_LEFT, y: distant.y, width: 60, height: 40 }], paths: [near, distant], coins: [], type: 'TWO_PATHS' }];
  labelled.breakAhead(player, SHIELD.CLEAR_AHEAD);
  assert(labelled.segments[0].paths.length === 1 && labelled.segments[0].paths[0] === distant, 'the label of the exploded row is gone, the far one stays');
});

await check('the shield and the bubble are reset at the start of a run and on the way to the menu', () => {
  const source = fs.readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  start() {'), source.indexOf('  // ---- чёткость холста'));
  const menu = source.slice(source.indexOf('  openMenu() {'), source.indexOf('  // --- Забег дня'));
  for (const [name, text] of [['start', start], ['openMenu', menu]]) {
    assert(/this\.shieldTime = 0;/.test(text) && /this\.multBubble = null;/.test(text), `${name} does not reset the shield and the bubble`);
  }
});

// ---------------------------------------------------------------- (г) лента рекорда

function makeScoreStub(extra = {}) {
  const writes = [];
  return {
    writes,
    state: 'PLAYING', distanceScore: 100, pathReward: 20, bestScore: 80, runTime: 47.84, dailyRun: false, reviveUsed: true,
    player: { x: 0, y: 0 }, feel: { onGameOver() {}, onNewBest() {} },
    storage: { set(key, value) { writes.push([key, value]); } },
    multiplier: 1, riskStreak: 0,
    cloudSnapshot() { return {}; },
    ...extra
  };
}

await check('the time of the best run is saved with a new best only (never for a worse run or the daily run)', () => {
  const better = makeScoreStub();
  Game.prototype.gameOver.call(better);
  assert(better.bestRunTime === 47.8 && better.writes.some(([k, v]) => k === 'bestRunTime' && v === 47.8), 'saved to a tenth of a second');
  const worse = makeScoreStub({ bestScore: 500, bestRunTime: 90 });
  Game.prototype.gameOver.call(worse);
  assert(worse.bestRunTime === 90 && worse.writes.length === 0, 'a worse run changes nothing');
  const daily = makeScoreStub({ dailyRun: true, bestRunTime: 90, finishDailyRun() {} });
  Game.prototype.gameOver.call(daily);
  assert(daily.bestRunTime === 90 && !daily.writes.some(([k]) => k === 'bestRunTime'), 'the daily run does not touch it');
  assert(CONFIG.YANDEX.CLOUD_KEYS.includes('bestRunTime'), 'the cloud keeps it');
});

await check('the cloud merges the best run time by the larger value and ignores garbage', () => {
  const stub = (bestRunTime) => ({
    bestScore: 100, bestRunTime, storage: { sets: [], set(key, value) { this.sets.push([key, value]); } },
    shop: { selected: () => 'classic', merge: () => false, snapshot: () => ({}) },
    daily: { merge: () => false, snapshot: () => ({}) },
    quests: { merge: () => false, snapshot: () => ({}) },
    todayKey: () => '2026-10-19', choiceHintSeen: true, riskHintSeen: true
  });
  const game = stub(40);
  assert(Game.prototype.applyCloudData.call(game, { bestRunTime: 75.55 }) === true && game.bestRunTime === 75.6 && game.storage.sets.some(([k, v]) => k === 'bestRunTime' && v === 75.6), 'a longer run from the cloud wins');
  const kept = stub(80);
  assert(Game.prototype.applyCloudData.call(kept, { bestRunTime: 20 }) === false && kept.bestRunTime === 80, 'a shorter one does not replace it');
  for (const garbage of ['abc', -5, NaN, null, undefined, {}, Infinity]) {
    const g = stub(33);
    Game.prototype.applyCloudData.call(g, { bestRunTime: garbage });
    assert(g.bestRunTime === 33, `garbage ${String(garbage)} changed the time`);
  }
  assert(Game.prototype.cloudSnapshot.call(stub(61.2)).bestRunTime === 61.2, 'the snapshot carries it to the cloud');
});

await check('the record ribbon stands where the best run ended: far away hidden, then comes down to the cat, then goes behind it', () => {
  const marker = (extra) => Game.prototype.recordMarkerY.call({
    dailyRun: false, state: 'PLAYING', bestRunTime: 40, runTime: 38.5, player: { y: 840 },
    recordMarkerActive: Game.prototype.recordMarkerActive, recordMarkerAhead: Game.prototype.recordMarkerAhead, ...extra
  });
  const ahead = getTrackDistance(40) - getTrackDistance(38.5);
  assert(ahead > 0 && ahead < CONFIG.RECORD_MARKER.SHOW_AHEAD, 'the test case is inside the view distance');
  assert(Math.abs(marker({}) - (840 - ahead)) < 1e-6, 'y = cat y − the path left to run');
  assert(marker({ runTime: 5, bestRunTime: 60 }) === null, 'far away: not shown');
  assert(Math.abs(marker({ runTime: 40 }) - 840) < 1e-6, 'at the moment the best run ended it is on the cat');
  assert(marker({ runTime: 41 }) > 840, 'afterwards it is behind the cat');
  assert(marker({ dailyRun: true }) === null && marker({ state: 'GAMEOVER' }) === null && marker({ state: 'START' }) === null, 'only in a normal run');
  assert(marker({ bestRunTime: 0 }) === null && marker({ bestRunTime: CONFIG.RECORD_MARKER.MIN_TIME - 1 }) === null, 'no ribbon for no or a very short best run');
  assert(marker({ bestRunTime: undefined }) === null, 'a game without the number');
});

await check('the ribbon moves with the track: after running from t0 to the best time it reaches the cat', () => {
  // Лента — точка трассы: сдвигается на путь трассы за кадр, как ряды (Track.update).
  const dt = 1 / 60;
  const best = 38;
  let t = 12;
  const stub = { dailyRun: false, state: 'PLAYING', bestRunTime: best, runTime: t, player: { y: 840 } };
  stub.recordMarkerActive = Game.prototype.recordMarkerActive;
  stub.recordMarkerAhead = Game.prototype.recordMarkerAhead;
  let y = 840 - Game.prototype.recordMarkerAhead.call(stub); // где лента в начале (может быть далеко за кадром)
  while (t < best) {
    t += dt;
    y += getTrackSpeed(t) * dt;
    stub.runTime = t;
  }
  // Допуск — полтора кадра пути трассы: время идёт шагами, и лента доходит до кота с точностью до одного шага.
  const tolerance = getTrackSpeed(best) * dt * 1.5;
  assert(Math.abs(y - 840) < tolerance, `the ribbon is ${(y - 840).toFixed(1)} px from the cat when the best time comes (allowed ${tolerance.toFixed(1)})`);
});

await check('the ribbon gives a few soft sparks once when the cat crosses it', () => {
  const events = [];
  const stub = { dailyRun: false, state: 'PLAYING', bestRunTime: 20, runTime: 18, recordPassed: false, player: { x: 270, y: 840 }, feel: { onRecordMarker: () => events.push('spark') } };
  stub.recordMarkerActive = Game.prototype.recordMarkerActive;
  stub.recordMarkerAhead = Game.prototype.recordMarkerAhead;
  for (let t = 18; t < 22; t += 1 / 60) {
    stub.runTime = t;
    Game.prototype.checkRecordMarker.call(stub);
  }
  assert(events.length === 1, `${events.length} sparks`);
  const daily = { ...stub, dailyRun: true, recordPassed: false, runTime: 25 };
  Game.prototype.checkRecordMarker.call(daily);
  assert(events.length === 1 && daily.recordPassed === false, 'no sparks in the daily run');
});

// ---------------------------------------------------------------- (д) пузырь множителя

function makeBubbleStub() {
  return {
    multiplier: CONFIG.MULTIPLIER_START, riskStreak: 0, pathReward: 0, distanceScore: 0, score: 0,
    player: { x: 270, y: 840 }, floatingRewards: [], runMaxMultiplier: 1, choiceHintSeen: true, riskHintSeen: true,
    storage: { set() {} }, multBubble: null, recordQuest() {}
  };
}

await check('the multiplier bubble shows when the multiplier changes (up or reset) and never when it stays', () => {
  const game = makeBubbleStub();
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    const before = game.multiplier;
    game.multBubble = null;
    Game.prototype.applyReward.call(game, 'RISKY', true, true);
    const changed = game.multiplier !== before;
    assert((game.multBubble !== null) === changed, `risky pass ${i + 1}: multiplier ${before} → ${game.multiplier}, bubble ${JSON.stringify(game.multBubble)}`);
    if (changed) {
      assert(game.multBubble.value === game.multiplier && game.multBubble.up === true && game.multBubble.age === 0, 'the bubble carries the new value');
      seen.push(game.multiplier);
    }
  }
  assert(seen.length >= 2 && seen.includes(CONFIG.MULTIPLIER_MAX), `multipliers seen: ${seen}`);
  game.multBubble = null;
  Game.prototype.applyReward.call(game, 'SAFE', false, true);
  assert(game.multiplier === CONFIG.MULTIPLIER_START && game.multBubble?.up === false && game.multBubble.value === CONFIG.MULTIPLIER_START, 'losing the streak shows the reset');
  game.multBubble = null;
  Game.prototype.applyReward.call(game, 'SAFE', false, true);
  assert(game.multBubble === null, 'a safe choice at x1.0 changes nothing, no bubble');
  game.multBubble = null;
  Game.prototype.applyReward.call(game, 'SAFE', false, false);
  assert(game.multBubble === null, 'a plain row has no bubble');
});

await check('the bubble lives MULT_BUBBLE.LIFE seconds with the run and is gone afterwards', () => {
  const game = { multBubble: { value: 1.5, up: true, age: 0 } };
  const life = CONFIG.MULT_BUBBLE.LIFE;
  assert(life >= 1 && life <= 2.5, `LIFE ${life}`);
  for (let t = 0; t < life - 0.2; t += 0.1) Game.prototype.updateMultBubble.call(game, 0.1);
  assert(game.multBubble !== null, 'still on the screen');
  for (let t = 0; t < 0.4; t += 0.1) Game.prototype.updateMultBubble.call(game, 0.1);
  assert(game.multBubble === null, 'gone');
  Game.prototype.updateMultBubble.call(game, 0.1);
  assert(game.multBubble === null, 'nothing to update is fine');
});

// ---------------------------------------------------------------- рисование

function makeRenderer() {
  const calls = [];
  const target = {
    measureText: (text) => ({ width: String(text).length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} })
  };
  const ctx = new Proxy(target, {
    get: (obj, key) => {
      if (key in obj) return obj[key];
      return (...args) => { calls.push([String(key), ...args]); };
    },
    set: (obj, key, value) => { obj[key] = value; return true; }
  });
  return { renderer: new Renderer(ctx), calls };
}

await check('drawing: the shield ring (full, blinking), the bubble (both sides) and the ribbon do not throw and stay on the screen', () => {
  const { renderer, calls } = makeRenderer();
  const player = { x: 270, y: 840, invulnerable: 0 };
  for (const left of [SHIELD.DURATION, SHIELD.BLINK_LAST - 0.5, 0.2]) {
    for (const time of [0, 0.1, 0.2, 0.3]) renderer.drawShieldRing(player, { left, total: SHIELD.DURATION }, time);
  }
  assert(calls.some((c) => c[0] === 'ellipse'), 'the ring is drawn as an ellipse');
  for (const x of [60, 270, 500]) {
    calls.length = 0;
    renderer.drawMultBubble({ value: 2.5, up: true, age: 0.4 }, { x, y: 840 });
    const move = calls.find((c) => c[0] === 'translate');
    assert(move && move[1] > 40 && move[1] < renderer.width - 40 && move[2] > 60 && move[2] < 900, `bubble at ${move?.slice(1)} for the cat at x ${x}`);
  }
  renderer.drawMultBubble({ value: 1, up: false, age: 1.4 }, { x: 270, y: 840 });
  renderer.setRecordMarker(300);
  assert(renderer.garden.recordMarkerY === 300, 'the ribbon y reaches the garden');
  renderer.setRecordMarker(null);
  renderer.setRecordMarker(Number.NaN);
  assert(renderer.garden.recordMarkerY === null, 'no ribbon');
});

await check('drawing: the yarn ball and the record ribbon are part of the world and do not throw', () => {
  const { renderer } = makeRenderer();
  const garden = renderer.garden;
  garden.lastShift = 0;
  const pickup = { x: 250, y: 400, width: SHIELD.SIZE, height: SHIELD.SIZE, collected: false, kind: 'YARN' };
  garden.drawYarn(pickup);
  garden.drawYarn({ ...pickup, collected: true });
  garden.drawYarn(null);
  garden.resetWorldProps();
  garden.collectYarn([{ pickups: [pickup, { ...pickup, collected: true }] }, { pickups: undefined }, {}]);
  assert(garden.worldProps.filter((p) => p.kind === 'yarn').length <= 1, 'a collected ball is not drawn');
  garden.recordMarkerY = 400;
  garden.collectRecordMarker();
  garden.recordMarkerY = null;
  garden.collectRecordMarker();
  const ribbons = garden.worldProps.filter((p) => p.kind === 'record');
  assert(ribbons.length <= 1, 'one ribbon at most');
  for (const prop of garden.worldProps) garden.drawWorldProp(prop);
});

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) process.exitCode = 1;
else console.log('All Phase 2a checks passed');
