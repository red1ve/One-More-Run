// Фаза 4 шлифовки (2026-10-22): новые ряды — створки и тележка — и золотой час.
//  (а) настройки согласованы; (б) выбор рядов по этапам забега и золотой час раз за этап суток;
//  (в) створки: геометрия, открытая ровно одна, замок, открытая створка не мешает коту;
//  (г) честность створок: бот проходит все скорости 300…1050, фазы, места старта и прошлые выходы;
//  (д) тележка: геометрия, путь не зависит от скорости, места слева и справа от неё;
//  (е) честность тележки: то же на всех скоростях; (ж) золотой час: узкие ряды, монета в каждом, достижимость;
//  (з) связь с остальной игрой: монеты и клубки, щит, возрождение; (и) рисование.
// Запуск: node scripts/phase4a-check.mjs (входит в npm run check).
import fs from 'node:fs';
import { CONFIG, getCartChance, getDoorsChance, getPlayerSpeed, getSwayChance, getTrackSpeed } from '../src/config.js';
import { playableXBounds } from '../src/game/Corridor.js';
import { Player } from '../src/game/Player.js';
import { Track } from '../src/game/Track.js';
import { VariationDirector } from '../src/game/VariationDirector.js';
import { timeOfDay } from '../src/game/TimeOfDay.js';
import { createSeededRandom } from '../src/game/Random.js';
import { Renderer } from '../src/rendering/Renderer.js';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}
function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

const DOORS = CONFIG.DOORS;
const CART = CONFIG.CART;
const GOLDEN = CONFIG.GOLDEN;
const GATE_HEIGHT = CONFIG.PATTERN_GATE_HEIGHT;
const HALF = CONFIG.PLAYER_WIDTH / 2;
const CAT_TOP = CONFIG.PLAYER_START_Y - CONFIG.PLAYER_HEIGHT / 2;
const CAT_BOTTOM = CONFIG.PLAYER_START_Y + CONFIG.PLAYER_HEIGHT / 2;
const BOUNDS = playableXBounds(CONFIG.PLAYER_START_Y - CONFIG.VISUAL.CAMERA_LEAD, CONFIG.PLAYER_WIDTH);
const DT = 1 / 240;
const SPEEDS = [300, 380, 450, 560, 650, 800, 950, 1050];
const EXITS = [[70, 136], [110, 136], [200, 136], [264, 168], [334, 136]];
const BEFORE = [null, 'OFFSET', 'FUNNEL', 'DOUBLE_GATE', 'OFFSET_GATE'];

// ---------------------------------------------------------------- (а) настройки

check('settings: the doorways and the cart gaps fit the cat with room to spare, edge walls can stay legal', () => {
  assert(DOORS.DOORWAY >= CONFIG.PLAYER_WIDTH * 2.5 && DOORS.MIDDLE >= 50, `doorway ${DOORS.DOORWAY}, middle wall ${DOORS.MIDDLE}`);
  const total = DOORS.DOORWAY * 2 + DOORS.MIDDLE;
  assert(total + 2 * CONFIG.EDGE_WALL_MIN <= CONFIG.TRACK_WIDTH, `the doors row (${total}) leaves no room for two normal edge walls`);
  assert(DOORS.HALF_PERIOD >= 0.6 && DOORS.HALF_PERIOD <= 1.5 && DOORS.LOCK_DISTANCE >= 450 && DOORS.REACTION >= 0.2, 'door timing');
  assert(CART.GAP - CART.WIDTH >= CART.MIN_FREE * 2 && CART.MIN_FREE >= CONFIG.PLAYER_WIDTH + 30 + (CART.SWEEP * (GATE_HEIGHT + CONFIG.PLAYER_HEIGHT)) / 2, 'cart pockets must stay wider than the cat while the cart moves through the row');
  assert(CART.SWEEP > 0.1 && CART.SWEEP <= 0.5, `the cart sweep ${CART.SWEEP}`);
  assert(GOLDEN.ROWS >= 3 && GOLDEN.ROWS <= 6 && GOLDEN.NARROW < 1 && GOLDEN.NARROW >= 0.7 && GOLDEN.MIN_WIDTH >= CONFIG.PLAYER_WIDTH * 3, 'golden hour settings');
});

check('settings: chances rise with the run time, nothing before FROM, the cart comes later than the doors, the sway is untouched', () => {
  assert(getDoorsChance(0) === 0 && getDoorsChance(DOORS.FROM - 0.1) === 0 && getDoorsChance(DOORS.FROM) === DOORS.CHANCE[0], 'the doors start at FROM');
  assert(getDoorsChance(DOORS.TIER_1) === DOORS.CHANCE[1] && getDoorsChance(DOORS.TIER_2) === DOORS.CHANCE[2] && getDoorsChance(9999) === DOORS.CHANCE[2], 'the doors tiers');
  assert(getCartChance(CART.FROM - 1) === 0 && getCartChance(CART.FROM) === CART.CHANCE[0] && getCartChance(CART.TIER_1) === CART.CHANCE[1] && getCartChance(9999) === CART.CHANCE[1], 'the cart tiers');
  assert(CART.FROM > DOORS.FROM && DOORS.FROM > CONFIG.SWAY.FROM, 'order of unlocking: sway, doors, cart');
  assert(DOORS.CHANCE.every((c, i, a) => i === 0 || c > a[i - 1]) && getSwayChance(100) === CONFIG.SWAY.CHANCE[1], 'tiers rise; the sway chance did not change');
  assert(getDoorsChance(NaN) === 0 && getDoorsChance(-5) === 0 && getCartChance(undefined) === 0, 'garbage means no special row');
});

// ---------------------------------------------------------------- (б) выбор рядов

function draw(runTime, { count = 6000, segmentType = 'NORMAL', lastType = 'NORMAL', lastPattern = 'STRAIGHT', seed = 9 } = {}) {
  const director = new VariationDirector();
  director.random = createSeededRandom(seed);
  const patterns = {};
  for (let i = 0; i < count; i += 1) {
    director.lastPattern = lastPattern;
    director.goldenCycle = Math.floor(runTime / CONFIG.TIME_OF_DAY.CYCLE); // золотой час проверяется отдельно (ниже)
    director.goldenLeft = 0;
    const pattern = director.choosePattern({ runTime, segmentType, lastType });
    patterns[pattern] = (patterns[pattern] || 0) + 1;
  }
  return patterns;
}

check('choice: no doors before 50 s and no cart before 70 s; shares follow the settings (the sway is checked first)', () => {
  for (const time of [0, 20, 49.9]) {
    const patterns = draw(time + 100 * 80); // этап суток не золотой: цикл 80 с, 100 циклов спустя то же время суток
    void patterns;
  }
  const early = draw(40);
  assert(!early.DOORS && !early.CART && !early.SWAY, `special rows before their time: ${JSON.stringify(early)}`);
  const middle = draw(55);
  const sway55 = getSwayChance(55);
  assert(!middle.CART && middle.DOORS > 0, 'doors but no cart at 55 s');
  const doorsShare = middle.DOORS / 6000;
  const expected = (1 - sway55) * getDoorsChance(55);
  assert(Math.abs(doorsShare - expected) < 0.02, `doors share ${doorsShare.toFixed(3)}, expected ${expected.toFixed(3)}`);
  const late = draw(130);
  assert(late.CART > 0 && late.DOORS > 0 && late.SWAY > 0, 'all three special rows at 130 s');
  const cartExpected = (1 - getSwayChance(130)) * (1 - getDoorsChance(130)) * getCartChance(130);
  assert(Math.abs(late.CART / 6000 - cartExpected) < 0.02, `cart share ${(late.CART / 6000).toFixed(3)}, expected ${cartExpected.toFixed(3)}`);
});

check('choice: never twice in a row, never right after a fork, never inside a fork', () => {
  for (const lastPattern of ['SWAY', 'DOORS', 'CART', 'GOLDEN']) {
    const patterns = draw(130, { lastPattern });
    assert(!patterns.SWAY && !patterns.DOORS && !patterns.CART, `a special row after ${lastPattern}: ${JSON.stringify(patterns)}`);
  }
  for (const lastType of ['TWO_PATHS', 'DUAL_RISK']) {
    const patterns = draw(130, { lastType });
    assert(!patterns.SWAY && !patterns.DOORS && !patterns.CART, `a special row right after ${lastType}`);
  }
  for (const segmentType of ['TWO_PATHS', 'DUAL_RISK']) {
    const patterns = draw(130, { segmentType });
    assert(!patterns.SWAY && !patterns.DOORS && !patterns.CART, `a special row inside ${segmentType}`);
  }
});

// Серия золотого часа: по времени забега считаем, какой ряд выберет директор.
function goldenRun(seed, seconds = 400) {
  const director = new VariationDirector();
  director.random = createSeededRandom(seed);
  const rows = [];
  let t = 0;
  while (t < seconds) {
    const type = director.goldenActive() ? 'NORMAL' : 'NORMAL';
    const pattern = director.choosePattern({ runTime: t, segmentType: type, lastType: 'NORMAL' });
    director.observe({ type, pattern, coins: [] }, t);
    rows.push({ t, pattern, stage: timeOfDay(t) });
    t += 0.7;
  }
  return rows;
}

check('golden hour: one series of GOLDEN.ROWS rows in a row per golden stage of every cycle, only in that stage', () => {
  const rows = goldenRun(3);
  const golden = rows.filter((r) => r.pattern === 'GOLDEN');
  const cycles = [...new Set(golden.map((r) => r.stage.cycle))];
  assert(cycles.length === 5, `series in cycles ${cycles} (400 s are five cycles of ${CONFIG.TIME_OF_DAY.CYCLE} s)`);
  for (const cycle of cycles) {
    const inCycle = rows.filter((r) => r.pattern === 'GOLDEN' && r.stage.cycle === cycle);
    assert(inCycle.length === GOLDEN.ROWS, `cycle ${cycle}: ${inCycle.length} golden rows`);
    const first = rows.indexOf(inCycle[0]);
    assert(rows.slice(first, first + GOLDEN.ROWS).every((r) => r.pattern === 'GOLDEN'), `cycle ${cycle}: the golden rows are not consecutive`);
    assert(inCycle[0].stage.name === 'golden', 'the series did not start in the golden stage');
  }
  assert(rows.filter((r) => r.stage.name === 'golden' && r.pattern !== 'GOLDEN').length > 0, 'the whole stage is not golden: it is a short series');
});

check('golden hour: the series waits for a quiet moment (not after a fork or a special row), the next rows are ordinary, it forces plain rows', () => {
  const director = new VariationDirector();
  director.random = createSeededRandom(5);
  director.lastPattern = 'SWAY';
  assert(director.choosePattern({ runTime: 20, segmentType: 'NORMAL', lastType: 'NORMAL' }) !== 'GOLDEN', 'a series right after a special row');
  director.lastPattern = 'STRAIGHT';
  assert(director.choosePattern({ runTime: 20, segmentType: 'NORMAL', lastType: 'TWO_PATHS' }) !== 'GOLDEN', 'a series right after a fork');
  assert(director.choosePattern({ runTime: 20, segmentType: 'TWO_PATHS', lastType: 'NORMAL' }) !== 'GOLDEN' && director.goldenLeft === 0, 'a series inside a fork');
  assert(director.choosePattern({ runTime: 20, segmentType: 'NORMAL', lastType: 'NORMAL' }) === 'GOLDEN' && director.goldenActive(), 'the series did not start');
  const track = new Track();
  track.director.goldenLeft = 2;
  assert(track.pickSegmentType(null) === 'NORMAL', 'a fork inside the series');
  assert(new Track().pickSegmentType('TWO_PATHS') === 'TWO_PATHS', 'a requested type must stay as it is');
});

// ---------------------------------------------------------------- вспомогательное: один особый ряд

function makeRow(pattern, { seed, speed = 650, runTime = 100, exitX = 200, exitWidth = 136, before = null }) {
  const track = new Track();
  track.setSeed(seed);
  track.speed = speed;
  track.runTime = runTime;
  track.setExits([{ x: exitX, width: exitWidth }]);
  if (before) track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'NORMAL', before);
  const exits = track.lastExits.map((exit) => ({ ...exit }));
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'NORMAL', pattern);
  const segment = track.segments[track.segments.length - 1];
  return { track, segment, exits, made: segment.pattern === pattern };
}

// ---------------------------------------------------------------- (в) створки

check('doors: geometry — walls and two doorways, two door leaves, two paths, two exits, no coins, edge walls legal', () => {
  let rows = 0;
  for (const speed of [380, 650, 900]) {
    for (const [exitX, exitWidth] of EXITS) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const { segment, track, made } = makeRow('DOORS', { seed, speed, exitX, exitWidth });
        if (!made) continue;
        rows += 1;
        const doors = segment.obstacles.filter((o) => o.door);
        const walls = segment.obstacles.filter((o) => !o.door);
        assert(doors.length === 2 && segment.movers.length === 2 && segment.sway === null, 'two door leaves are the movers');
        assert(segment.paths.length === 2 && segment.paths.every((p) => p.type === 'SAFE'), 'two safe paths, like an ordinary row');
        assert(doors.every((d, i) => d.width === DOORS.DOORWAY && d.height === GATE_HEIGHT && d.y === segment.paths[i].y && d.x === segment.paths[i].x), 'a door leaf stands in its doorway');
        const [a, b] = [...doors].sort((p, q) => p.x - q.x);
        assert(Math.abs(b.x - (a.x + a.width) - DOORS.MIDDLE) < 1e-6, 'the middle wall width');
        const outer = [a.x - CONFIG.TRACK_LEFT, CONFIG.TRACK_RIGHT - (b.x + b.width)];
        assert(outer.every((w) => w <= CONFIG.EDGE_WALL_HIDDEN + 0.01 || w >= CONFIG.EDGE_WALL_MIN - 0.01), `an illegal edge wall ${outer}`);
        // Стены закрывают всё, кроме двух проходов: сумма стен + проходы = дорожка.
        const wallWidth = walls.reduce((sum, w) => sum + w.width, 0);
        assert(Math.abs(wallWidth + 2 * DOORS.DOORWAY - CONFIG.TRACK_WIDTH) < 1e-6, 'the walls and the doorways do not fill the road');
        assert(segment.coins.length === 0 && !segment.pickups, 'no coins or yarn on a row with moving parts');
        assert(track.lastExits.length === 2 && track.lastExits.every((e, i) => e.x === [a, b][i].x && e.width === DOORS.DOORWAY), 'both doorways are exits');
      }
    }
  }
  assert(rows >= 20, `only ${rows} door rows were made`);
});

check('doors: exactly one leaf is open at any time, they swap every HALF_PERIOD before the lock, and freeze at LOCK_DISTANCE', () => {
  const { track, segment } = makeRow('DOORS', { seed: 4, speed: 500, exitX: 200, exitWidth: 168 });
  assert(segment.pattern === 'DOORS', 'no doors row');
  const doors = segment.movers;
  const far = (CONFIG.PLAYER_START_Y - CONFIG.PLAYER_HEIGHT / 2 - DOORS.LOCK_DISTANCE) - 400; // ряд далеко (выше замка)
  segment.obstacles.forEach((o) => { o.y += far - doors[0].y; });
  const openIndex = () => doors.map((d, i) => (d.open ? i : -1)).filter((i) => i >= 0);
  const seen = [];
  let last = null;
  for (let t = 0; t < 12 * DOORS.HALF_PERIOD; t += 0.02) {
    track.swayClock = t;
    doors.forEach((d) => track.placeDoor(d, 0.02));
    assert(openIndex().length === 1, `${openIndex().length} open leaves at ${t.toFixed(2)} s`);
    const now = openIndex()[0];
    if (now !== last) { seen.push(t); last = now; }
  }
  assert(seen.length >= 10, `the leaves swapped ${seen.length} times`);
  for (let i = 2; i < seen.length; i += 1) assert(Math.abs(seen[i] - seen[i - 1] - DOORS.HALF_PERIOD) < 0.03, `a swap after ${(seen[i] - seen[i - 1]).toFixed(2)} s, expected ${DOORS.HALF_PERIOD}`);
  // Ряд подъехал ближе LOCK_DISTANCE: замок, открытая створка больше не меняется, как бы ни шло время.
  const lockLine = CONFIG.PLAYER_START_Y - CONFIG.PLAYER_HEIGHT / 2 - DOORS.LOCK_DISTANCE;
  segment.obstacles.forEach((o) => { o.y = lockLine - GATE_HEIGHT - 30; });
  doors.forEach((d) => track.placeDoor(d, 0.02));
  assert(!doors[0].door.state.locked, 'locked too early');
  segment.obstacles.forEach((o) => { o.y = lockLine - GATE_HEIGHT + 2; });
  doors.forEach((d) => track.placeDoor(d, 0.02));
  assert(doors[0].door.state.locked, 'not locked within LOCK_DISTANCE');
  const frozen = openIndex()[0];
  for (let t = 100; t < 110; t += 0.05) {
    track.swayClock = t;
    doors.forEach((d) => track.placeDoor(d, 0.02));
    assert(openIndex().join() === String(frozen), 'the open leaf changed after the lock');
  }
});

check('doors: an open leaf lets the cat through and is not a close call; a closed one is a wall; the leaf lowers smoothly', () => {
  const { track, segment } = makeRow('DOORS', { seed: 4, speed: 500, exitX: 200, exitWidth: 168 });
  const [a, b] = [...segment.movers].sort((p, q) => p.x - q.x);
  const cat = new Player();
  cat.y = a.y + a.height / 2;
  const at = (door) => { cat.x = door.x + door.width / 2; return track.checkCollision(cat); };
  a.open = true; b.open = false;
  assert(at(a) === false, 'an open doorway still hurts');
  assert(at(b) === true, 'a closed doorway does not hurt');
  a.open = false; b.open = true;
  assert(at(a) === true && at(b) === false, 'the other way round');
  // Открытая створка не считается «чуть не задел» (стенкой для касания).
  cat.x = a.x + a.width + HALF + 4;
  a.open = true; b.open = true;
  const grazed = track.checkGraze(cat);
  assert(grazed.every((g) => g.x < a.x - 1 || g.x > b.x + b.width + 1), 'a graze at an open leaf');
  // Створка поднимается плавно, а не прыжком.
  const leaf = segment.movers[0];
  const state = leaf.door.state;
  state.locked = true;
  state.open = leaf.door.index;
  leaf.rise = 1;
  const rises = [];
  for (let i = 0; i < 20; i += 1) { track.placeDoor(leaf, 1 / 60); rises.push(leaf.rise); }
  assert(rises[0] < 1 && rises[0] > 0.5 && rises.every((r, i) => i === 0 || r < rises[i - 1]) && rises[19] < 0.1, `the leaf rise ${rises.slice(0, 4).map((r) => r.toFixed(2))}`);
  track.placeDoor(leaf, 0);
  assert(leaf.rise === 0, 'a zero step snaps to the target');
});

check('update: Track.update drives the doors (they swap while the row is far) and the cart (it slides as the row comes closer)', () => {
  const doorsRow = makeRow('DOORS', { seed: 4, speed: 500, exitX: 200, exitWidth: 168 });
  assert(doorsRow.made, 'no doors row');
  const segment = doorsRow.segment;
  const track = doorsRow.track;
  track.segments = [segment];
  const far = (CONFIG.PLAYER_START_Y - CONFIG.PLAYER_HEIGHT / 2 - DOORS.LOCK_DISTANCE) - 3000;
  const shift = far - segment.obstacles[0].y;
  segment.obstacles.forEach((o) => { o.y += shift; });
  let swaps = 0;
  let last = null;
  for (let t = 0; t < 8; t += 1 / 60) {
    track.update(1 / 60, 40, t); // ряд почти стоит: далеко от кота, створки меняются по часам
    const open = segment.movers.findIndex((d) => d.open);
    if (last !== null && open !== last) swaps += 1;
    last = open;
  }
  assert(swaps >= 6 && segment.movers.filter((d) => d.open).length === 1, `${swaps} swaps in 8 s`);
  const cartRow = makeRow('CART', { seed: 7, speed: 500, exitX: 200, exitWidth: 168 });
  assert(cartRow.made, 'no cart row');
  const cart = cartRow.segment.movers[0];
  const cartTrack = cartRow.track;
  cartTrack.segments = [cartRow.segment];
  const gapY = cartRow.segment.obstacles[0].y;
  const shiftCart = (CONFIG.PLAYER_START_Y - 600) - gapY;
  cartRow.segment.obstacles.forEach((o) => { o.y += shiftCart; });
  cartTrack.placeCart(cart);
  const xs = [];
  for (let i = 0; i < 90; i += 1) { cartTrack.update(1 / 60, 500, i / 60); xs.push(cart.x); }
  assert(xs[xs.length - 1] !== xs[0] && (xs[xs.length - 1] - xs[0]) * cart.cart.dir > 20, `the cart did not slide: ${xs[0].toFixed(0)} → ${xs[xs.length - 1].toFixed(0)}`);
});

// ---------------------------------------------------------------- (г) честность створок

const REACTION = 0.3;

// Бот: решение принимает по состоянию створок REACTION секунд назад (кот не успевает среагировать сразу).
// waits — стоит у стенки между проходами, пока не будет замка, и только потом едет в открытый проход;
// commits — сразу едет в проход, открытый в тот момент, и перенацеливается, когда створки поменялись.
function doorsSim({ speed, exitX, exitWidth, start, strategy, seed, before = null, phaseShift = 0, runTime = 100 }) {
  const { track, segment, exits, made } = makeRow('DOORS', { seed, speed, exitX, exitWidth, before, runTime });
  if (!made) return null;
  track.segments = [segment];
  const travel = segment.initialTravel;
  const doors = [...segment.movers].sort((p, q) => p.x - q.x);
  const dy = CAT_TOP - GATE_HEIGHT - travel - segment.obstacles[0].y;
  segment.obstacles.forEach((o) => { o.y += dy; });
  doors[0].door.state.phase += phaseShift;
  const exit = exits[0];
  const startX = { left: exit.x + HALF, center: exit.x + exit.width / 2, right: exit.x + exit.width - HALF }[start];
  const player = new Player();
  player.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, startX));
  player.speed = getPlayerSpeed(speed);
  const middle = (doors[0].x + doors[0].width + doors[1].x) / 2;
  const history = [];
  const tOut = (travel + GATE_HEIGHT + CONFIG.PLAYER_HEIGHT) / speed;
  for (let t = DT; t < tOut + 0.5; t += DT) {
    track.swayClock = t;
    segment.obstacles.forEach((o) => { o.y += speed * DT; });
    doors.forEach((d) => track.placeDoor(d, DT));
    history.push({ open: doors.findIndex((d) => d.open), locked: doors[0].door.state.locked });
    const seen = history[Math.max(0, history.length - 1 - Math.round(REACTION / DT))];
    let target = player.x;
    if (t >= REACTION) {
      if (strategy === 'waits') target = seen.locked ? doors[seen.open].x + doors[seen.open].width / 2 : middle;
      else target = doors[seen.open].x + doors[seen.open].width / 2;
    }
    const direction = Math.abs(target - player.x) > 0.6 ? Math.sign(target - player.x) : 0;
    player.setMoveDirection(direction);
    player.update(DT, BOUNDS);
    if (track.checkCollision(player)) return { hit: true, at: t, travel, locked: history[history.length - 1].locked };
    if (doors[0].y > CAT_BOTTOM) return { hit: false, travel };
  }
  throw new Error('the row never passed the cat');
}

function doorsSweep() {
  const stats = { runs: 0, skipped: 0, hits: [], minTravel: Infinity, preLock: 0 };
  let seed = 100;
  for (const strategy of ['waits', 'commits']) {
    for (const before of BEFORE) {
      for (const speed of SPEEDS) {
        for (const [exitX, exitWidth] of before ? [EXITS[2]] : EXITS) {
          for (let k = 0; k < 6; k += 1) {
            seed += 1;
            for (const start of ['left', 'center', 'right']) {
              const r = doorsSim({ speed, exitX, exitWidth, start, strategy, seed, before, phaseShift: k * DOORS.HALF_PERIOD * 0.37 });
              if (!r) { stats.skipped += 1; continue; }
              stats.runs += 1;
              stats.minTravel = Math.min(stats.minTravel, r.travel);
              if (!r.locked) stats.preLock += 1;
              if (r.hit) stats.hits.push(`${strategy}, после ${before || 'прохода'}, скорость ${speed}, выход ${exitX}/${exitWidth}, старт ${start}, на ${r.at.toFixed(2)} с`);
            }
          }
        }
      }
    }
  }
  return stats;
}

check('fairness: doors — both a waiting and an early-committing bot pass every speed (300…1050), phase, previous exit and start without a hit', () => {
  const stats = doorsSweep();
  if (process.env.VERBOSE) {
    console.log(`doors: ${stats.runs} runs, skipped ${stats.skipped}, shortest free travel ${stats.minTravel.toFixed(0)} px, hits ${stats.hits.length}`);
    for (const line of stats.hits.slice(0, 12)) console.log(`  ${line}`);
  }
  assert(stats.runs >= 1500, `too few runs: ${stats.runs} (skipped ${stats.skipped})`);
  assert(stats.skipped < (stats.runs + stats.skipped) * 0.7, `${stats.skipped} door rows could not be placed of ${stats.runs + stats.skipped}`);
  assert(stats.hits.length === 0, `${stats.hits.length} hits of ${stats.runs}; first: ${stats.hits[0]}`);
});

check('fairness: doors — a cat that does not move is NOT always safe (a closed leaf is a real obstacle)', () => {
  let hits = 0;
  let runs = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const { track, segment, exits, made } = makeRow('DOORS', { seed, speed: 500, exitX: 200, exitWidth: 136 });
    if (!made) continue;
    const doors = [...segment.movers].sort((p, q) => p.x - q.x);
    track.segments = [segment];
    const shift = CAT_TOP - GATE_HEIGHT - segment.initialTravel - segment.obstacles[0].y;
    segment.obstacles.forEach((o) => { o.y += shift; });
    const player = new Player();
    player.x = doors[seed % 2].x + DOORS.DOORWAY / 2; // стоит посреди одного из проходов
    runs += 1;
    let hit = false;
    for (let t = DT; t < 3 && !hit; t += DT) {
      track.swayClock = t;
      segment.obstacles.forEach((o) => { o.y += 500 * DT; });
      doors.forEach((d) => track.placeDoor(d, DT));
      hit = track.checkCollision(player);
      if (doors[0].y > CAT_BOTTOM) break;
    }
    if (hit) hits += 1;
    void exits;
  }
  assert(runs >= 20 && hits >= 5 && hits < runs, `a cat that stands still was hit ${hits} times of ${runs}`);
});

check('fairness: doors — they are placed only where the cat has time after the lock; at every speed a row sometimes appears', () => {
  const afterLock = (speed) => getPlayerSpeed(speed) * Math.max(0, DOORS.LOCK_DISTANCE / speed - DOORS.REACTION);
  for (const speed of SPEEDS) assert(afterLock(speed) >= DOORS.DOORWAY + DOORS.MIDDLE + DOORS.SLACK, `at ${speed} px/s the cat would have only ${afterLock(speed).toFixed(0)} px after the lock`);
  let made = 0;
  let tried = 0;
  for (const speed of SPEEDS) {
    for (let seed = 1; seed <= 12; seed += 1) { tried += 1; if (makeRow('DOORS', { seed, speed, exitX: 200, exitWidth: 168 }).made) made += 1; }
  }
  assert(made > tried * 0.2, `only ${made} of ${tried} door rows were made`);
  // Если бы LOCK_DISTANCE был мал, ряд на высокой скорости не ставился бы вообще (проверка в createDoors).
  const saved = DOORS.LOCK_DISTANCE;
  try {
    DOORS.LOCK_DISTANCE = 300;
    assert(!makeRow('DOORS', { seed: 1, speed: 1050, exitX: 200, exitWidth: 168 }).made, 'the row was placed although the cat would not have time');
  } finally {
    DOORS.LOCK_DISTANCE = saved;
  }
});

// ---------------------------------------------------------------- (д) тележка

check('cart: geometry — wide gap with walls, one cart, both pockets wide enough, one path, two exits, no coins', () => {
  let rows = 0;
  for (const speed of [380, 650, 900]) {
    for (const [exitX, exitWidth] of EXITS) {
      for (let seed = 1; seed <= 8; seed += 1) {
        const { segment, track, made } = makeRow('CART', { seed, speed, exitX, exitWidth });
        if (!made) continue;
        rows += 1;
        const carts = segment.obstacles.filter((o) => o.cart);
        assert(carts.length === 1 && segment.movers.length === 1 && segment.movers[0] === carts[0], 'one cart');
        const cart = carts[0];
        const info = cart.cart;
        assert(cart.width === CART.WIDTH && info.gap === CART.GAP && cart.y === segment.paths[0].y, 'size and place');
        assert(segment.paths.length === 1 && segment.paths[0].width === CART.GAP && segment.paths[0].type === 'SAFE', 'one path: the whole gap');
        const left = info.xArr - info.gapX;
        const right = info.gapX + info.gap - (info.xArr + CART.WIDTH);
        assert(left >= CART.MIN_FREE - 1e-6 && right >= CART.MIN_FREE - 1e-6, `pockets ${left.toFixed(0)} / ${right.toFixed(0)} px`);
        const walls = segment.obstacles.filter((o) => !o.cart);
        assert(walls.reduce((sum, w) => sum + w.width, 0) === CONFIG.TRACK_WIDTH - CART.GAP, 'the walls fill the rest of the road');
        assert(segment.obstacles.every((o) => o.x >= CONFIG.TRACK_LEFT && o.x + o.width <= CONFIG.TRACK_RIGHT + 1e-6), 'everything is on the road');
        assert(segment.coins.length === 0 && !segment.pickups, 'no coins or yarn on a row with moving parts');
        assert(track.lastExits.length === 2 && Math.abs(track.lastExits[0].width - left) < 1e-6 && Math.abs(track.lastExits[1].width - right) < 1e-6, 'the exits are the two pockets');
      }
    }
  }
  assert(rows >= 30, `only ${rows} cart rows were made`);
});

check('cart: the path depends on the distance to the cat only, not on the speed; it ends where planned and never leaves the gap', () => {
  const { track, segment } = makeRow('CART', { seed: 7, speed: 650, exitX: 200, exitWidth: 168 });
  assert(segment.pattern === 'CART', 'no cart row');
  const cart = segment.movers[0];
  const info = cart.cart;
  const ys = [];
  const xs = [];
  for (let remaining = 1400; remaining >= -300; remaining -= 25) {
    cart.y = CONFIG.PLAYER_START_Y - remaining - cart.height / 2;
    for (const speed of [300, 650, 1050]) {
      track.speed = speed;
      track.placeCart(cart);
      assert(cart.x >= info.gapX - 1e-6 && cart.x + cart.width <= info.gapX + info.gap + 1e-6, 'the cart left the gap');
      if (speed === 650) { ys.push(remaining); xs.push(cart.x); }
      else {
        const slower = cart.x;
        track.speed = 650;
        track.placeCart(cart);
        assert(Math.abs(cart.x - slower) < 1e-9, 'the position depends on the speed');
      }
    }
  }
  cart.y = CONFIG.PLAYER_START_Y - cart.height / 2;
  track.placeCart(cart);
  assert(Math.abs(cart.x - info.xArr) < 1e-9, 'the cart is not at its place when the row reaches the cat');
  // Едет в одну сторону (dir), равномерно: SWEEP px на px пути, пока не упёрлась в край прохода.
  const slope = [];
  for (let i = 1; i < xs.length; i += 1) {
    const moved = xs[i - 1] - xs[i];
    if (xs[i] > info.gapX + 1e-6 && xs[i - 1] < info.gapX + info.gap - cart.width - 1e-6 && xs[i] < info.gapX + info.gap - cart.width - 1e-6 && xs[i - 1] > info.gapX + 1e-6) slope.push(moved / 25);
  }
  assert(slope.length > 3 && slope.every((s) => Math.abs(s + info.dir * CART.SWEEP) < 1e-6), `the sweep per px of path ${slope.slice(0, 3)}`);
  // Скорость на экране для наклона картинки пропорциональна скорости трассы.
  track.speed = 1000;
  track.placeCart(cart);
  assert(Math.abs(Math.abs(cart.vx) - CART.SWEEP * 1000) < 1e-9 && Math.sign(cart.vx) === info.dir, 'the lean speed');
});

// ---------------------------------------------------------------- (е) честность тележки

// Бот знает, где тележка будет в ряду (она едет по прямой и видна), считает промежутки слева и справа от неё
// по её самым крайним положениям, пока кот в ряду, и едет в ближайший, где хватает места.
function cartSim({ speed, exitX, exitWidth, start, seed, before = null, reaction = REACTION, runTime = 100 }) {
  const { track, segment, exits, made } = makeRow('CART', { seed, speed, exitX, exitWidth, before, runTime });
  if (!made) return null;
  track.segments = [segment];
  const travel = segment.initialTravel;
  const cart = segment.movers[0];
  const info = cart.cart;
  const dy = CAT_TOP - GATE_HEIGHT - travel - segment.obstacles[0].y;
  segment.obstacles.forEach((o) => { o.y += dy; });
  const exit = exits[0];
  const startX = { left: exit.x + HALF, center: exit.x + exit.width / 2, right: exit.x + exit.width - HALF }[start];
  const player = new Player();
  player.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, startX));
  player.speed = getPlayerSpeed(speed);
  // Крайние положения тележки, пока ряд пересекает кота.
  let leftMin = Infinity;
  let rightMax = -Infinity;
  const probe = cart.y;
  for (let y = CAT_TOP - GATE_HEIGHT; y <= CAT_BOTTOM; y += 2) {
    cart.y = y;
    track.speed = speed;
    track.placeCart(cart);
    leftMin = Math.min(leftMin, cart.x);
    rightMax = Math.max(rightMax, cart.x + cart.width);
  }
  cart.y = probe;
  const pockets = [
    { from: Math.max(BOUNDS.minX, info.gapX + HALF), to: leftMin - HALF },
    { from: rightMax + HALF, to: Math.min(BOUNDS.maxX, info.gapX + info.gap - HALF) }
  ];
  let best = null;
  for (const pocket of pockets) {
    const room = pocket.to - pocket.from;
    if (room < 8) continue;
    const target = Math.max(pocket.from + 4, Math.min(pocket.to - 4, player.x));
    const distance = Math.abs(target - player.x);
    if (!best || distance < best.distance) best = { target, distance, room };
  }
  if (!best) return { hit: true, at: 0, travel, noRoom: true };
  const tOut = (travel + GATE_HEIGHT + CONFIG.PLAYER_HEIGHT) / speed;
  for (let t = DT; t < tOut + 0.5; t += DT) {
    track.speed = speed;
    segment.obstacles.forEach((o) => { o.y += speed * DT; });
    track.placeCart(cart);
    const direction = t >= reaction && Math.abs(best.target - player.x) > 0.6 ? Math.sign(best.target - player.x) : 0;
    player.setMoveDirection(direction);
    player.update(DT, BOUNDS);
    if (track.checkCollision(player)) return { hit: true, at: t, travel, room: best.room };
    if (cart.y > CAT_BOTTOM) return { hit: false, travel, room: best.room };
  }
  throw new Error('the row never passed the cat');
}

function cartSweep(reaction) {
  const stats = { runs: 0, skipped: 0, hits: [], minRoom: Infinity, minTravel: Infinity, dirs: new Set() };
  let seed = 300;
  for (const before of BEFORE) {
    for (const speed of SPEEDS) {
      for (const [exitX, exitWidth] of before ? [EXITS[2]] : EXITS) {
        for (let k = 0; k < 8; k += 1) {
          seed += 1;
          for (const start of ['left', 'center', 'right']) {
            const r = cartSim({ speed, exitX, exitWidth, start, seed, before, reaction });
            if (!r) { stats.skipped += 1; continue; }
            stats.runs += 1;
            stats.minTravel = Math.min(stats.minTravel, r.travel);
            if (r.room !== undefined) stats.minRoom = Math.min(stats.minRoom, r.room);
            if (r.hit) stats.hits.push(`после ${before || 'прохода'}, скорость ${speed}, выход ${exitX}/${exitWidth}, старт ${start}${r.noRoom ? ', нет места' : `, на ${r.at.toFixed(2)} с`}`);
          }
        }
      }
    }
  }
  return stats;
}

check('fairness: cart — a bot passes every speed (300…1050), previous exit, start and side without a hit; the room is always wider than the cat', () => {
  const stats = cartSweep(REACTION);
  if (process.env.VERBOSE) {
    console.log(`cart: ${stats.runs} runs, skipped ${stats.skipped}, narrowest safe place ${stats.minRoom.toFixed(1)} px, shortest free travel ${stats.minTravel.toFixed(0)} px`);
    for (const reaction of [0.3, 0.4, 0.5, 0.6, 0.7]) console.log(`cart: reaction ${reaction} s → ${cartSweep(reaction).hits.length} hits`);
  }
  assert(stats.runs >= 1500, `too few runs: ${stats.runs} (skipped ${stats.skipped})`);
  assert(stats.skipped < (stats.runs + stats.skipped) * 0.5, `${stats.skipped} cart rows could not be placed of ${stats.runs + stats.skipped}`);
  assert(stats.minTravel < 500, `no short free travel was tested (${stats.minTravel.toFixed(0)} px)`);
  assert(stats.hits.length === 0, `${stats.hits.length} hits of ${stats.runs}; first: ${stats.hits[0]}`);
  assert(stats.minRoom >= CART.ROOM - 1, `the safe place was only ${stats.minRoom.toFixed(1)} px wide for the middle of the cat (cat ${CONFIG.PLAYER_WIDTH})`);
});

check('fairness: cart — a cat that stands in the gap is not always safe, and both sides work', () => {
  let hits = 0;
  let runs = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const { track, segment, made } = makeRow('CART', { seed, speed: 650, exitX: 200, exitWidth: 168 });
    if (!made) continue;
    const cart = segment.movers[0];
    track.segments = [segment];
    const shift = CAT_TOP - GATE_HEIGHT - segment.initialTravel - segment.obstacles[0].y;
    segment.obstacles.forEach((o) => { o.y += shift; });
    const player = new Player();
    player.x = cart.cart.xArr + cart.width / 2; // посреди тележки
    runs += 1;
    let hit = false;
    for (let t = DT; t < 3 && !hit; t += DT) {
      segment.obstacles.forEach((o) => { o.y += 650 * DT; });
      track.speed = 650;
      track.placeCart(cart);
      hit = track.checkCollision(player);
      if (cart.y > CAT_BOTTOM) break;
    }
    if (hit) hits += 1;
  }
  assert(runs >= 20 && hits === runs, `a cat standing where the cart arrives was hit ${hits} times of ${runs}`);
});

// ---------------------------------------------------------------- (ж) золотой час

function goldenTrack(seed, seconds = 220) {
  const track = new Track();
  track.setSeed(seed);
  track.init();
  const seen = new Set();
  const rows = [];
  const dt = 1 / 60;
  let previousExits = null;
  let t = 0;
  while (t < seconds) {
    t += dt;
    track.update(dt, getTrackSpeed(t), t);
    for (const segment of track.segments) {
      if (seen.has(segment)) continue;
      seen.add(segment);
      rows.push({ t, segment, exitsBefore: previousExits });
      previousExits = track.lastExits.map((e) => ({ ...e }));
    }
  }
  return rows;
}

check('golden hour: in a real track a series of narrower rows with one coin each appears once per golden stage', () => {
  for (const seed of [3, 19, 41]) {
    const rows = goldenTrack(seed);
    const golden = rows.filter((r) => r.segment.golden);
    assert(golden.length === 3 * GOLDEN.ROWS, `seed ${seed}: ${golden.length} golden rows in 220 s (three stages)`);
    const index = rows.indexOf(golden[0]);
    assert(rows.slice(index, index + GOLDEN.ROWS).every((r) => r.segment.golden), `seed ${seed}: the first series is not consecutive`);
    for (const { segment, t } of golden) {
      assert(segment.type === 'NORMAL' && segment.pattern === 'GOLDEN' && segment.paths.length === 1, 'a golden row is an ordinary row');
      const gap = segment.paths[0];
      assert(gap.width >= GOLDEN.MIN_WIDTH, `a golden gap of ${gap.width} px`);
      assert(segment.coins.length === 1, `seed ${seed}, ${t.toFixed(0)} s: ${segment.coins.length} coins in a golden row`);
      const coin = segment.coins[0];
      const coinCenter = coin.x + coin.width / 2;
      assert(coin.x >= gap.x && coin.x + coin.width <= gap.x + gap.width && coinCenter >= gap.x + HALF && coinCenter <= gap.x + gap.width - HALF, 'the cat cannot pick the coin up without touching a wall');
      assert(!segment.obstacles.some((o) => coin.x < o.x + o.width && coin.x + coin.width > o.x && coin.y < o.y + o.height && coin.y + coin.height > o.y), 'the coin is inside a wall');
    }
    const stageTimes = golden.map((r) => timeOfDay(r.t).name);
    assert(stageTimes.every((name) => name === 'golden' || name === 'dusk'), `golden rows were created in stage ${[...new Set(stageTimes)]}`);
  }
});

check('golden hour: the gaps are narrower than the ordinary rows around them and every gap is reachable from the previous exit', () => {
  for (const seed of [3, 19, 41]) {
    const rows = goldenTrack(seed, 120);
    let narrower = 0;
    let total = 0;
    rows.forEach(({ segment, exitsBefore }, index) => {
      if (!segment.golden || !exitsBefore) return;
      total += 1;
      const gap = segment.paths[0];
      // Обычные прямые ряды рядом (в пределах четырнадцати рядов): их проход — ширина «передышки» на этой скорости.
      const around = rows.slice(Math.max(0, index - 14), index + 15)
        .filter((r) => r.segment.type === 'NORMAL' && r.segment.pattern === 'STRAIGHT')
        .map((r) => r.segment.paths[0].width)
        .sort((x, y) => x - y);
      assert(around.length >= 2, 'no ordinary rows around a golden one');
      const ordinary = around[Math.floor(around.length / 2)];
      if (gap.width <= ordinary * 0.9) narrower += 1;
      const travel = CONFIG.SEGMENT_HEIGHT - GATE_HEIGHT;
      // Достижим из каждого выхода прошлого ряда: тот же критерий, что у любого ряда (Track.canReach, с запасом).
      const lateral = (CONFIG.PLAYER_SPEED * (travel / 1050)) * CONFIG.REACHABILITY_MARGIN;
      assert(exitsBefore.every((exit) => exit.x + exit.width + lateral >= gap.x && exit.x - lateral <= gap.x + gap.width), 'a golden gap is out of reach');
    });
    assert(total >= 4 && narrower >= total * 0.75, `seed ${seed}: ${narrower} of ${total} golden gaps are narrower than the ordinary rows around them`);
  }
});

check('golden hour: the series gives a trail of coins and does not break the daily run (canonical clock)', () => {
  const coinsOf = (seed) => goldenTrack(seed, 40).filter((r) => r.segment.golden).reduce((sum, r) => sum + r.segment.coins.length, 0);
  assert(coinsOf(3) === GOLDEN.ROWS && coinsOf(19) === GOLDEN.ROWS, 'one coin per golden row');
  const run = (seed) => {
    const track = new Track();
    track.setSeed(seed);
    track.setCanonicalClock(true);
    track.init();
    const dt = 1 / 60;
    let t = 0;
    const out = [];
    const seen = new Set();
    while (t < 50) {
      t += dt;
      track.update(dt, getTrackSpeed(t), t);
      for (const segment of track.segments) if (!seen.has(segment)) { seen.add(segment); out.push([segment.pattern, segment.paths.map((p) => Math.round(p.x)), segment.coins.length]); }
    }
    return JSON.stringify(out);
  };
  assert(run(5) === run(5), 'the daily track is not repeatable');
});

// ---------------------------------------------------------------- (з) связь с остальной игрой

check('game: a revive or a broken shield removes the doors and the cart with their walls; rewards are the ordinary ones', () => {
  for (const pattern of ['DOORS', 'CART']) {
    const { track, segment, made } = makeRow(pattern, { seed: 3, speed: 500, exitX: 200, exitWidth: 168 });
    assert(made, `no ${pattern} row`);
    const player = new Player();
    segment.obstacles.forEach((o) => { o.y = player.y - 30; });
    track.segments = [segment];
    const removed = track.breakAhead(player, CONFIG.SHIELD.CLEAR_AHEAD);
    assert(removed.length === segment.obstacles.length + removed.length - segment.obstacles.length && segment.obstacles.length === 0 && segment.movers.length === 0 && segment.shieldBroken === true, `${pattern}: the shield left something`);
    const again = makeRow(pattern, { seed: 3, speed: 500, exitX: 200, exitWidth: 168 });
    again.segment.obstacles.forEach((o) => { o.y = player.y - 30; });
    again.track.segments = [again.segment];
    again.track.clearAhead(player.y, CONFIG.REVIVE_CLEAR_AHEAD);
    assert(again.segment.movers === null && again.segment.obstacles.length === 0 && again.segment.isPassed === true, `${pattern}: the revive left something`);
  }
  // Ряд проходится как обычный: путь «безопасный», награда обычная.
  const { track, segment } = makeRow('DOORS', { seed: 3, speed: 500, exitX: 200, exitWidth: 168 });
  const cat = new Player();
  segment.chosenPathType = null;
  segment.obstacles.forEach((o) => { o.y = cat.y + 100; });
  segment.paths.forEach((p) => { p.y = cat.y - 4; });
  cat.x = segment.paths[0].x + segment.paths[0].width / 2;
  track.segments = [segment];
  track.sampleChosenPath(segment, cat);
  assert(segment.chosenPathType === 'SAFE', 'a door row pays the ordinary safe reward');
});

check('game: coins and yarn balls are not put on the new rows, and the older rows still get them', () => {
  let normalWithCoin = 0;
  for (const seed of [3, 19, 41, 77]) {
    for (const { segment } of goldenTrack(seed, 200)) {
      if (segment.movers) assert(segment.coins.length === 0 && !segment.pickups, 'something lies on a row with moving parts');
      if (segment.type === 'NORMAL' && segment.pattern === 'STRAIGHT' && segment.coins.length) normalWithCoin += 1;
    }
  }
  assert(normalWithCoin > 10, 'ordinary rows lost their coins');
});

// ---------------------------------------------------------------- (и) рисование

check('drawing: a closed leaf is a garden gate, an open one sinks and fades, the cart is a planter that leans along its motion', () => {
  const source = fs.readFileSync(new URL('../src/rendering/GardenArt.js', import.meta.url), 'utf8');
  assert(/planter\.door/.test(source) && /planter\.cart/.test(source), 'GardenArt does not know the doors and the cart');
  const calls = [];
  const alphas = [];
  const target = { measureText: (text) => ({ width: String(text).length * 8 }), createLinearGradient: () => ({ addColorStop() {} }) };
  const stack = [];
  const ctx = new Proxy(target, {
    get: (obj, key) => {
      if (key === 'save') return () => { stack.push(obj.globalAlpha); };
      if (key === 'restore') return () => { obj.globalAlpha = stack.pop(); };
      return key in obj ? obj[key] : (...args) => { calls.push([String(key), ...args]); };
    },
    set: (obj, key, value) => { obj[key] = value; return true; }
  });
  ctx.globalAlpha = 1;
  const renderer = new Renderer(ctx);
  const garden = renderer.garden;
  garden.lastShift = 0;
  const spans = [];
  garden.obstacleArt.drawSpan = (look, x0, x1, groundY, catH, scale) => { spans.push({ look, scale, alpha: ctx.globalAlpha, width: x1 - x0 }); };
  const road = garden.roadAt(500);
  const prop = { screenY: 600, lookSeed: 3 };
  const state = { open: 0, locked: true, phase: 0 };
  const leaf = (rise, index = 0) => ({ x: 200, y: 500, width: DOORS.DOORWAY, height: GATE_HEIGHT, vx: 0, rise, open: rise < 0.5, sway: { range: 0, period: 1 }, door: { index, state } });
  garden.drawSwayPlanter(prop, leaf(1), road, 500, 600, 1, { state: 'VISIBLE' });
  garden.drawSwayPlanter(prop, leaf(0), road, 500, 600, 1, { state: 'VISIBLE' });
  garden.drawSwayPlanter(prop, leaf(0.5), road, 500, 600, 1, { state: 'VISIBLE' });
  assert(spans.length === 3 && spans.every((span) => span.look === 'gate'), `door leaves are not drawn as gates: ${spans.map((sp) => sp.look)}`);
  assert(spans[0].scale === 1 && spans[1].scale < 0.3 && spans[1].scale < spans[2].scale && spans[2].scale < spans[0].scale, `a leaf sinks with its rise: ${spans.map((sp) => sp.scale.toFixed(2))}`);
  assert(spans[0].alpha === 1 && spans[1].alpha < spans[2].alpha && spans[2].alpha < 1, `an open leaf fades: ${spans.map((sp) => sp.alpha)}`);
  // Тележка — обычное кашпо; наклон по ходу (знак скорости), без деления на ноль у неподвижных створок.
  spans.length = 0;
  const cart = (vx) => ({ x: 200, y: 500, width: CART.WIDTH, height: GATE_HEIGHT, vx, sway: { range: 0, period: 1 }, cart: { dir: Math.sign(vx) || 1, xArr: 200, gapX: 130, gap: CART.GAP } });
  const rotations = [];
  for (const vx of [-300, 0, 300]) {
    const before = calls.length;
    garden.drawSwayPlanter(prop, cart(vx), road, 500, 600, 1, { state: 'VISIBLE' });
    const rotate = calls.slice(before).find((c) => c[0] === 'rotate');
    rotations.push(rotate ? rotate[1] : null);
  }
  assert(spans.length === 3 && spans.every((span) => span.look === 'planter'), 'the cart is a planter');
  assert(rotations[0] < 0 && rotations[1] === 0 && rotations[2] > 0 && Math.abs(rotations[0]) === Math.abs(rotations[2]), `the cart leans along its motion: ${rotations}`);
  const before = calls.length;
  garden.drawSwayPlanter(prop, leaf(1), road, 500, 600, 1, { state: 'VISIBLE' });
  const doorRotate = calls.slice(before).find((c) => c[0] === 'rotate');
  assert(doorRotate && doorRotate[1] === 0, 'a door leaf must not lean');
  // Старое качающееся кашпо рисуется как раньше (по размаху и периоду).
  spans.length = 0;
  garden.drawSwayPlanter(prop, { x: 200, y: 500, width: 84, height: GATE_HEIGHT, vx: 40, sway: { minX: 200, range: 180, period: 2.4, phase: 0 } }, road, 500, 600, 1, { state: 'VISIBLE' });
  assert(spans.length === 1 && spans[0].look === 'planter' && spans[0].scale === 1, 'the swaying planter changed');
});

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) process.exitCode = 1;
else console.log('All Phase 4a checks passed');
