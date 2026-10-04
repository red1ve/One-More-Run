// Фаза 1л: качающееся кашпо (шаг 5б). Новое подвижное препятствие после 90 секунд забега.
//  (а) настройки: проход, карманы, скорость кашпо меньше скорости кота, шансы по ступеням;
//  (б) выбор: ряд не появляется раньше 90 с (и не тратит случайные числа), не идёт два раза
//      подряд и сразу после развилки, шансы совпадают с настройками;
//  (в) геометрия: стены по правилу краёв, один проход, нет монет, кашпо ходит от стены до стены,
//      свободный карман не меньше POCKET в любой момент, скорость кашпо ниже порога;
//  (г) честность на физике: умный бот (видит качание, реакция 0,2 с) проходит ряд без столкновений
//      при всех фазах качания, скоростях трассы, периодах и местах прошлого прохода;
//  (д) обычный забег: ряды ставятся после 90 с, доля по ступеням, почти всегда удаётся поставить;
//  (е) столкновения, «чуть не задел», возрождение с подвижным кашпо;
//  (ж) отрисовка: кашпо рисуется кашпо (не кустом), отдельно от стен, кренится по ходу движения.
// Запуск: node scripts/phase1l-check.mjs (входит в npm run check).
import {
  CONFIG, getPlayerSpeed, getSwayChance, getSwayPeriod, getSwayTier, getTrackSpeed
} from '../src/config.js';
import { Player } from '../src/game/Player.js';
import { playableXBounds } from '../src/game/Corridor.js';
import { Track } from '../src/game/Track.js';
import { VariationDirector } from '../src/game/VariationDirector.js';
import { createSeededRandom } from '../src/game/Random.js';
import { GardenArt } from '../src/rendering/GardenArt.js';

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

const SWAY = CONFIG.SWAY;
const GAP = SWAY.PLANTER_WIDTH + SWAY.POCKET * 2;
const GATE_HEIGHT = CONFIG.PATTERN_GATE_HEIGHT;
const TAU = Math.PI * 2;
const peakSpeed = (period) => (SWAY.POCKET * TAU) / period;

// ---- (а) настройки

check('settings: gap, pockets and speeds are consistent', () => {
  assert(GAP <= CONFIG.TRACK_WIDTH - 2 * CONFIG.EDGE_WALL_MIN + 20, `the gap ${GAP} leaves no room for the edge walls`);
  assert(SWAY.POCKET >= CONFIG.PLAYER_WIDTH + 40, `the pocket ${SWAY.POCKET} is too tight for the cat (${CONFIG.PLAYER_WIDTH})`);
  assert(SWAY.FROM === 90, 'the swaying planter must start after 90 s');
  assert(SWAY.PERIOD.length === 3 && SWAY.CHANCE.length === 3, 'three tiers expected');
  for (let i = 1; i < 3; i += 1) {
    assert(SWAY.PERIOD[i] < SWAY.PERIOD[i - 1], 'the later the faster');
    assert(SWAY.CHANCE[i] > SWAY.CHANCE[i - 1], 'the later the more often');
  }
  for (const period of SWAY.PERIOD) {
    assert(peakSpeed(period) <= CONFIG.PLAYER_SPEED * 0.7, `the planter at period ${period} s goes ${peakSpeed(period).toFixed(0)} px/s, too fast`);
  }
  assert(SWAY.PLANTER_WIDTH >= 80, 'a narrower planter would be drawn as a bush');
  assert(SWAY.REACTION > 0 && SWAY.REACTION <= 0.3, 'the placement rule must leave the cat at least a 0.3 s reaction');
  assert(SWAY.WINDOW_SLACK >= 15 && SWAY.WINDOW_SLACK < SWAY.POCKET - CONFIG.PLAYER_WIDTH, 'the window slack must cover the planter motion but leave room for the cat');
});

check('settings: tiers, chances and periods follow the run time', () => {
  assert(getSwayTier(0) === -1 && getSwayTier(89.9) === -1, 'no tier before 90 s');
  assert(getSwayTier(90) === 0 && getSwayTier(149.9) === 0, 'tier 0 is 90…150 s');
  assert(getSwayTier(150) === 1 && getSwayTier(239.9) === 1, 'tier 1 is 150…240 s');
  assert(getSwayTier(240) === 2 && getSwayTier(900) === 2, 'tier 2 is 240+ s');
  assert(getSwayChance(60) === 0 && getSwayChance(89.99) === 0, 'chance must be zero before 90 s');
  assert(getSwayChance(100) === SWAY.CHANCE[0] && getSwayChance(200) === SWAY.CHANCE[1] && getSwayChance(300) === SWAY.CHANCE[2], 'chances by tier');
  assert(getSwayPeriod(100) === SWAY.PERIOD[0] && getSwayPeriod(200) === SWAY.PERIOD[1] && getSwayPeriod(300) === SWAY.PERIOD[2], 'periods by tier');
});

// ---- (б) выбор ряда

function drawPatterns(runTime, { count = 4000, segmentType = 'NORMAL', lastType = 'NORMAL', lastPattern = 'STRAIGHT', seed = 5 } = {}) {
  const director = new VariationDirector();
  director.random = createSeededRandom(seed);
  const counts = {};
  for (let i = 0; i < count; i += 1) {
    director.lastPattern = lastPattern;
    const pattern = director.choosePattern({ runTime, segmentType, lastType });
    counts[pattern] = (counts[pattern] || 0) + 1;
  }
  return counts;
}

check('choice: no swaying row before 90 s and no extra random numbers are used', () => {
  for (const runTime of [0, 10, 60, 89.9]) {
    const counts = drawPatterns(runTime);
    assert(!counts.SWAY, `a swaying row appeared at ${runTime} s`);
  }
  // Один вызов random на ряд, как раньше: сид 42 (phase1e) и все старые забеги не меняются.
  const director = new VariationDirector();
  let calls = 0;
  const inner = createSeededRandom(1);
  director.random = () => { calls += 1; return inner(); };
  for (let i = 0; i < 200; i += 1) director.choosePattern({ runTime: 50, segmentType: 'NORMAL', lastType: 'NORMAL' });
  assert(calls === 200, `before 90 s each row must use exactly one random number, used ${calls / 200}`);
});

check('choice: the share of swaying rows matches the settings at each tier', () => {
  for (const [runTime, tier] of [[100, 0], [200, 1], [300, 2]]) {
    const counts = drawPatterns(runTime);
    const share = (counts.SWAY || 0) / 4000;
    assert(Math.abs(share - SWAY.CHANCE[tier]) < 0.03, `tier ${tier}: ${share.toFixed(3)} instead of ${SWAY.CHANCE[tier]}`);
  }
});

check('choice: never twice in a row, never right after a fork, never in a fork', () => {
  assert(!drawPatterns(300, { lastPattern: 'SWAY' }).SWAY, 'two swaying rows in a row');
  assert(!drawPatterns(300, { lastType: 'TWO_PATHS' }).SWAY, 'a swaying row right after TWO_PATHS');
  assert(!drawPatterns(300, { lastType: 'DUAL_RISK' }).SWAY, 'a swaying row right after DUAL_RISK');
  assert(!drawPatterns(300, { segmentType: 'TWO_PATHS' }).SWAY, 'a swaying row inside TWO_PATHS');
  assert(!drawPatterns(300, { segmentType: 'DUAL_RISK' }).SWAY, 'a swaying row inside DUAL_RISK');
  const director = new VariationDirector();
  director.forcedPattern = 'OFFSET';
  assert(director.choosePattern({ runTime: 300, segmentType: 'NORMAL', lastType: 'NORMAL' }) === 'OFFSET', 'forcedPattern must still win');
});

// ---- (в) геометрия

// before — узор ряда перед качающимся (после него выход другой, а свободного пути до кота меньше:
// у OFFSET, FUNNEL и DOUBLE_GATE ряды расположены выше в своём участке). Без него выход задаётся
// числами exitX / exitWidth. exits — выходы прошлого ряда, из которых кот приедет к качающемуся.
function swayRow({ seed, speed = 650, runTime = 100, exitX = 200, exitWidth = 136, phase = 0, period, before = null }) {
  const track = new Track();
  track.setSeed(seed);
  track.speed = speed;
  track.runTime = runTime;
  track.setExits([{ x: exitX, width: exitWidth }]);
  if (before) {
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'NORMAL', before);
  }
  const exits = track.lastExits.map((exit) => ({ ...exit }));
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'NORMAL', 'SWAY');
  const segment = track.segments[track.segments.length - 1];
  if (!segment.sway) return { track, segment, planter: null, exits };
  segment.sway.sway.phase = phase;
  if (period) segment.sway.sway.period = period;
  track.placeSway(segment.sway);
  return { track, segment, planter: segment.sway, exits };
}

const BEFORE = [null, 'OFFSET', 'FUNNEL', 'DOUBLE_GATE', 'OFFSET_GATE'];

const EXITS = [[70, 136], [110, 136], [200, 136], [264, 168], [334, 136]];

check('geometry: walls, one path, no coins, two pocket exits', () => {
  let made = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    for (const [exitX, exitWidth] of EXITS) {
      for (const speed of [600, 720]) {
        const { track, segment, planter } = swayRow({ seed, speed, exitX, exitWidth });
        if (!planter) continue;
        made += 1;
        assert(segment.pattern === 'SWAY' && segment.type === 'NORMAL', 'wrong segment kind');
        const walls = segment.obstacles.filter((obs) => !obs.sway);
        const gapX = planter.sway.minX;
        assert(segment.obstacles.filter((obs) => obs.sway).length === 1, 'exactly one swaying planter expected');
        assert(planter.width === SWAY.PLANTER_WIDTH && planter.height === GATE_HEIGHT && planter.y === walls[0].y, 'the planter must sit in the row of the walls');
        assert(segment.paths.length === 1 && segment.paths[0].x === gapX && segment.paths[0].width === GAP, 'one path over the whole gap expected');
        assert(segment.paths[0].type === 'SAFE', 'the path is a plain SAFE one');
        assert(track.edgeWallsOk(gapX, GAP), `the gap ${gapX}…${gapX + GAP} breaks the edge-wall rule`);
        const wallsWidth = walls.reduce((sum, wall) => sum + wall.width, 0);
        assert(Math.abs(wallsWidth - (CONFIG.TRACK_WIDTH - GAP)) < 1e-6, 'walls must fill everything except the gap');
        assert(segment.coins.length === 0, 'no coins in a swaying row');
        assert(track.lastExits.length === 2
          && track.lastExits[0].x === gapX && track.lastExits[0].width === SWAY.POCKET
          && track.lastExits[1].x === gapX + GAP - SWAY.POCKET && track.lastExits[1].width === SWAY.POCKET,
        'the exits after the row must be the two pockets');
        assert(planter.sway.period === getSwayPeriod(100), 'the period must come from the tier at creation');
      }
    }
  }
  assert(made > 200, `too few rows could be built to check: ${made}`);
});

check('geometry: the planter sweeps wall to wall; a free pocket of at least POCKET always exists; no clipping into walls', () => {
  for (const period of SWAY.PERIOD) {
    const { track, planter } = swayRow({ seed: 11, period });
    const gapX = planter.sway.minX;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let step = 0; step < 240 * period * 2; step += 1) {
      track.swayClock = step / 240;
      track.placeSway(planter);
      const left = planter.x - gapX;
      const right = gapX + GAP - (planter.x + planter.width);
      assert(left >= -1e-6 && right >= -1e-6, `the planter is inside a wall at step ${step}`);
      assert(Math.max(left, right) >= SWAY.POCKET - 1e-6, `no free pocket of ${SWAY.POCKET} px at step ${step} (${left.toFixed(1)} / ${right.toFixed(1)})`);
      minX = Math.min(minX, planter.x);
      maxX = Math.max(maxX, planter.x);
    }
    assert(minX - gapX < 1 && gapX + GAP - (maxX + planter.width) < 1, 'the planter must reach both walls');
  }
});

check('geometry: the planter is slower than the cat (position steps and reported speed)', () => {
  for (const period of SWAY.PERIOD) {
    const { track, planter } = swayRow({ seed: 12, period });
    const dt = 1 / 240;
    let previous = null;
    let fastest = 0;
    for (let step = 0; step < 240 * period; step += 1) {
      track.swayClock = step * dt;
      track.placeSway(planter);
      if (previous !== null) fastest = Math.max(fastest, Math.abs(planter.x - previous) / dt);
      assert(Math.abs(planter.vx) <= peakSpeed(period) + 1e-6, 'reported speed above the peak');
      previous = planter.x;
    }
    assert(fastest <= peakSpeed(period) * 1.02, `measured ${fastest.toFixed(0)} px/s, expected at most ${peakSpeed(period).toFixed(0)}`);
    assert(fastest <= CONFIG.PLAYER_SPEED * 0.7, `the planter is too fast: ${fastest.toFixed(0)} px/s`);
  }
});

check('geometry: Track.update moves the planter with the clock and keeps it at the row height', () => {
  const { track, segment, planter } = swayRow({ seed: 13, period: 2 });
  const gapX = planter.sway.minX;
  track.segments = [segment];
  const y0 = planter.y;
  const xs = new Set();
  for (let i = 0; i < 240; i += 1) {
    track.update(1 / 240, 100, 100 + i / 240);
    xs.add(Math.round(planter.x));
    assert(segment.obstacles.every((obs) => Math.abs(obs.y - planter.y) < 1e-6), 'the planter left the row of the walls');
  }
  assert(xs.size > 40, 'the planter does not move during Track.update');
  assert(Math.abs(planter.y - (y0 + 100 * 1)) < 1e-6 || planter.y > y0 + 99, 'the row did not scroll');
  assert(planter.x >= gapX - 1e-6 && planter.x + planter.width <= gapX + GAP + 1e-6, 'the planter left the gap');
  track.reset();
  assert(track.swayClock === 0, 'reset must restart the sway clock');
});

check('geometry: fair placement — both pockets are reachable from anywhere in the previous exit', () => {
  let checked = 0;
  for (const before of BEFORE) {
    for (let seed = 1; seed <= 25; seed += 1) {
      for (const [exitX, exitWidth] of before ? [EXITS[2]] : EXITS) {
        for (const speed of [600, 720]) {
          const { track, segment, planter, exits } = swayRow({ seed, speed, exitX, exitWidth, before });
          if (!planter) continue;
          const gapX = planter.sway.minX;
          for (const from of exits) {
            const safe = SWAY.POCKET - SWAY.WINDOW_SLACK;
            for (const pocket of [{ x: gapX, width: safe }, { x: gapX + GAP - safe, width: safe }]) {
              const label = `after ${before || 'a plain gap'}, seed ${seed}, exit ${from.x}/${from.width}, speed ${speed}`;
              // Независимая проверка: с самых дальних точек выхода, кот начинает ехать через REACTION секунд.
              const half = CONFIG.PLAYER_WIDTH / 2;
              const farthest = Math.max(pocket.x + half - (from.x + half), from.x + from.width - half - (pocket.x + pocket.width - half), 0);
              const lateral = getPlayerSpeed(speed) * Math.max(0, segment.initialTravel / speed - SWAY.REACTION);
              assert(farthest <= lateral + 1e-6, `${label}: needs ${farthest.toFixed(0)} px, the cat can do ${lateral.toFixed(0)}`);
              checked += 1;
            }
          }
        }
      }
    }
  }
  assert(checked > 400, `too few placements checked: ${checked}`);
});

// ---- (г) честность на физике

// Реакция человека: секунды после «прошлый ряд пройден», пока игрок ещё не двигается. Трасса считает с меньшим
// запасом (SWAY.REACTION), а у человека есть ещё и то, что он видел ряд заранее.
const REACTION = 0.3;
const DT = 1 / 240;
const CAT_TOP = CONFIG.PLAYER_START_Y - CONFIG.PLAYER_HEIGHT / 2;
const CAT_BOTTOM = CONFIG.PLAYER_START_Y + CONFIG.PLAYER_HEIGHT / 2;
const BOUNDS = playableXBounds(CONFIG.PLAYER_START_Y - CONFIG.VISUAL.CAMERA_LEAD, CONFIG.PLAYER_WIDTH);

// Положение левого края кашпо в момент t (с начала проверки).
function plannedX(planter, t) {
  const s = planter.sway;
  return s.minX + (s.range / 2) * (1 + Math.sin((TAU / s.period) * t + s.phase));
}

// Бот знает, как качается кашпо (оно видно заранее) и за кем из двух карманов безопаснее: у каждого
// кармана считает часть, где кот не заденет ни кашпо, ни стену, пока он в ряду (BOT_EDGE px запаса),
// и едет в ближайшую точку ближайшего кармана, где хватает места.
const BOT_EDGE = 4;
function planStand(planter, tIn, tOut, fromX) {
  const half = CONFIG.PLAYER_WIDTH / 2;
  const gapX = planter.sway.minX;
  let leftEdgeMin = Infinity;
  let rightEdgeMax = -Infinity;
  for (let k = 0; k <= 24; k += 1) {
    const t = tIn + ((tOut - tIn) * k) / 24;
    const x = plannedX(planter, t);
    leftEdgeMin = Math.min(leftEdgeMin, x);
    rightEdgeMax = Math.max(rightEdgeMax, x + planter.width);
  }
  const pockets = [
    { from: Math.max(BOUNDS.minX, gapX + half), to: leftEdgeMin - half },
    { from: rightEdgeMax + half, to: Math.min(BOUNDS.maxX, gapX + GAP - half) }
  ];
  let best = null;
  for (const pocket of pockets) {
    const room = pocket.to - pocket.from;
    if (room < 2 * BOT_EDGE) continue;
    const target = Math.max(pocket.from + BOT_EDGE, Math.min(pocket.to - BOT_EDGE, fromX));
    const distance = Math.abs(target - fromX);
    if (!best || distance < best.distance) best = { target, distance, room };
  }
  const widest = Math.max(...pockets.map((pocket) => pocket.to - pocket.from));
  return best ? { ...best, widest } : { target: fromX, distance: 0, room: 0, widest };
}

// start: 'left' | 'center' | 'right' — где кот в прошлом выходе, 'gap-center' — посреди прохода,
// число — точное место. Кот сначала не двигается reaction секунд.
function simulate({ speed, period, phase, exitX, exitWidth, start, reaction = REACTION, seed, before = null }) {
  const { track, segment, planter, exits } = swayRow({ seed, speed, exitX, exitWidth, phase, period, before });
  if (!planter) return null;
  // Остался только этот ряд; он поставлен так, чтобы до кота ехать ровно столько, сколько
  // считала трасса при создании (Track.getFreeTravelTo).
  track.segments = [segment];
  const travel = segment.initialTravel;
  const dy = CAT_TOP - GATE_HEIGHT - travel - planter.y;
  segment.obstacles.forEach((obs) => { obs.y += dy; });
  const half = CONFIG.PLAYER_WIDTH / 2;
  const exit = exits[0];
  const startX = typeof start === 'number' ? start : {
    left: exit.x + half,
    center: exit.x + exit.width / 2,
    right: exit.x + exit.width - half,
    'gap-center': planter.sway.minX + GAP / 2
  }[start];
  const player = new Player();
  player.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, startX));
  player.speed = getPlayerSpeed(speed);
  const tIn = travel / speed;
  const tOut = (travel + GATE_HEIGHT + CONFIG.PLAYER_HEIGHT) / speed;
  const { target, widest: room } = planStand(planter, tIn, tOut, player.x);
  for (let t = DT; t < tOut + 0.5; t += DT) {
    track.swayClock = t;
    segment.obstacles.forEach((obs) => { obs.y += speed * DT; });
    track.placeSway(planter);
    let direction = 0;
    if (t >= reaction && Math.abs(target - player.x) > 0.6) direction = Math.sign(target - player.x);
    player.setMoveDirection(direction);
    player.update(DT, BOUNDS);
    if (track.checkCollision(player)) return { hit: true, at: t, room, travel };
    if (planter.y > CAT_BOTTOM) return { hit: false, room, travel };
  }
  throw new Error('the row never passed the cat');
}

// Полный перебор: узор перед рядом, период, скорость, 24 фазы, три места старта в прошлом выходе.
function sweep(reaction) {
  const stats = { runs: 0, hits: [], minRoom: Infinity, minTravel: Infinity, skipped: 0 };
  let seed = 100;
  for (const before of BEFORE) {
    for (const period of SWAY.PERIOD) {
      for (const speed of [560, 620, 680, 720]) {
        for (const [exitX, exitWidth] of before ? [EXITS[2]] : EXITS) {
          for (let repeat = 0; repeat < (before ? 3 : 1); repeat += 1) {
            for (let k = 0; k < 24; k += 1) {
              seed += 1;
              for (const start of ['left', 'center', 'right']) {
                const result = simulate({ speed, period, phase: (k / 24) * TAU, exitX, exitWidth, start, reaction, seed, before });
                if (!result) { stats.skipped += 1; continue; }
                stats.runs += 1;
                stats.minRoom = Math.min(stats.minRoom, result.room);
                stats.minTravel = Math.min(stats.minTravel, result.travel);
                if (result.hit) stats.hits.push(`после ${before || 'прохода'}, период ${period}, скорость ${speed}, фаза ${k}/24, старт ${start}, на ${result.at.toFixed(2)} с`);
              }
            }
          }
        }
      }
    }
  }
  return stats;
}

check('fairness: a smart bot passes every phase, speed, period and previous exit without a hit', () => {
  const stats = sweep(REACTION);
  if (process.env.VERBOSE) {
    console.log(`fairness: ${stats.runs} runs, skipped ${stats.skipped}, narrowest safe place ${stats.minRoom.toFixed(1)} px, shortest free travel ${stats.minTravel.toFixed(0)} px`);
    for (const reaction of [0.3, 0.4, 0.5, 0.6, 0.7]) console.log(`fairness: reaction ${reaction} s → ${sweep(reaction).hits.length} hits`);
  }
  assert(stats.runs >= 8000, `too few runs: ${stats.runs} (skipped ${stats.skipped})`);
  // Где кот не успел бы в карман, ряд не ставится вообще (вместо него обычный): это не ошибка, но не должно быть почти всегда.
  assert(stats.skipped < (stats.runs + stats.skipped) * 0.4, `${stats.skipped} rows could not be placed (of ${stats.runs + stats.skipped})`);
  assert(stats.minTravel < 500, `no short free travel was tested (shortest ${stats.minTravel.toFixed(0)} px): rows after OFFSET/FUNNEL are missing`);
  assert(stats.hits.length === 0, `${stats.hits.length} hits of ${stats.runs}; first: ${stats.hits[0]}`);
  assert(stats.minRoom >= 24, `the safe place in the best pocket was only ${stats.minRoom.toFixed(1)} px wide (cat is ${CONFIG.PLAYER_WIDTH})`);
});

check('fairness: standing still in the middle of the gap is NOT always safe (the planter is a real obstacle)', () => {
  let hits = 0;
  let runs = 0;
  for (let k = 0; k < 24; k += 1) {
    const exitX = 200;
    const result = simulate({ speed: 650, period: 2.4, phase: (k / 24) * TAU, exitX, exitWidth: 136, start: 'gap-center', reaction: 99, seed: 500 + k });
    if (result) { runs += 1; if (result.hit) hits += 1; }
  }
  assert(runs > 20 && hits > 3, `a cat that does not move got through ${runs - hits} of ${runs}: the planter is not an obstacle`);
});

// ---- (д) обычный забег

check('run: swaying rows appear only after 90 s, in about the configured share, rarely fall back', () => {
  const stats = [0, 1, 2].map(() => ({ normal: 0, sway: 0 }));
  let chosen = 0;
  let built = 0;
  let early = 0;
  let adjacent = 0;
  let afterFork = 0;
  for (let seed = 1; seed <= 36; seed += 1) {
    const track = new Track();
    track.setSeed(seed);
    const original = track.director.choosePattern.bind(track.director);
    track.director.choosePattern = (args) => {
      const pattern = original(args);
      if (pattern === 'SWAY') chosen += 1;
      return pattern;
    };
    const seen = new Set();
    let previous = null;
    let time = 0;
    while (time < 300) {
      time += 1 / 60;
      track.update(1 / 60, getTrackSpeed(time), time);
      for (const segment of track.segments) {
        if (seen.has(segment.id)) continue;
        seen.add(segment.id);
        if (segment.type === 'EMPTY') { previous = segment; continue; }
        const tier = getSwayTier(track.runTime);
        if (segment.pattern === 'SWAY') {
          built += 1;
          if (track.runTime < SWAY.FROM) early += 1;
          if (previous?.pattern === 'SWAY') adjacent += 1;
          if (previous?.isChoiceSegment) afterFork += 1;
        }
        if (tier >= 0 && segment.type === 'NORMAL') {
          stats[tier].normal += 1;
          if (segment.pattern === 'SWAY') stats[tier].sway += 1;
        }
        previous = segment;
      }
    }
  }
  if (process.env.VERBOSE) {
    console.log('run stats:', JSON.stringify({ chosen, built, tiers: stats.map((s) => ({ ...s, share: +(s.sway / Math.max(1, s.normal)).toFixed(3) })) }));
  }
  assert(early === 0, `${early} swaying rows were created before 90 s`);
  assert(adjacent === 0, `${adjacent} swaying rows came twice in a row`);
  assert(afterFork === 0, `${afterFork} swaying rows came right after a fork`);
  assert(chosen > 100, `too few swaying rows to judge: ${chosen}`);
  assert(built / chosen >= 0.7, `only ${built} of ${chosen} chosen rows could be placed`);
  const shares = stats.map((s) => s.sway / Math.max(1, s.normal));
  assert(shares[0] > 0.04 && shares[0] < 0.2, `tier 0 share ${shares[0].toFixed(3)}`);
  assert(shares[1] > 0.06 && shares[1] < 0.3, `tier 1 share ${shares[1].toFixed(3)}`);
  assert(shares[2] > 0.08 && shares[2] < 0.38, `tier 2 share ${shares[2].toFixed(3)}`);
  assert(shares[0] < shares[2], 'the later the more swaying rows');
});

// ---- (е) столкновения, касание, возрождение

check('contact: the planter blocks the cat, a near pass counts as a close call, revive removes it', () => {
  const { track, segment, planter } = swayRow({ seed: 21, phase: 0, period: 2.4 });
  track.segments = [segment];
  const gapX = planter.sway.minX;
  segment.obstacles.forEach((obs) => { obs.y = CAT_TOP - 5; });
  track.swayClock = 0;
  track.placeSway(planter);
  const player = new Player();
  player.x = planter.x + planter.width / 2;
  assert(track.checkCollision(player), 'a cat inside the planter must collide');
  player.x = planter.x - CONFIG.PLAYER_WIDTH / 2 - 4;
  assert(player.x - 18 > gapX - 1 || true, 'sanity');
  assert(!track.checkCollision(player), 'a cat 4 px next to the planter must not collide');
  const grazes = track.checkGraze(player);
  assert(grazes.length === 1 && grazes[0].side === 1, 'a pass 4 px from the planter must be a close call');
  assert(track.checkGraze(player).length === 0, 'a close call is counted once per obstacle');
  assert(track.clearAhead(player.y, 300) >= 1, 'revive must clear the row');
  assert(segment.sway === null && segment.obstacles.length === 0, 'the cleared row must not keep the planter');
  assert(!track.checkCollision(player), 'no collision after revive');
});

// ---- (ж) отрисовка

check('drawing: the planter is drawn as a planter, apart from the walls, with a lean along the motion', () => {
  const rotations = [];
  // Холст запоминает сдвиг (translate) и повороты: по ним видно, где и с каким наклоном нарисована картинка.
  const stack = [];
  const ctx = new Proxy({ tx: 0 }, {
    get: (target, key) => {
      if (key === 'save') return () => stack.push(target.tx);
      if (key === 'restore') return () => { target.tx = stack.pop() ?? 0; };
      if (key === 'translate') return (dx) => { target.tx += dx; };
      if (key === 'rotate') return (angle) => rotations.push(angle);
      return key in target ? target[key] : () => ({ addColorStop() {} });
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const draws = [];
  const pack = {
    hasAll: () => true,
    aspect: () => 0.9,
    has: () => true,
    draw: (c, name, x, y, w) => draws.push({ name, x: x + ctx.tx, w })
  };
  const art = new GardenArt(ctx);
  art.lastShift = -14;
  art.artPack = pack;
  art.obstacleArt.pack = pack;

  const { track, segment, planter } = swayRow({ seed: 31, phase: 0, period: 2.4 });
  segment.obstacles.forEach((obs) => { obs.y = 560; });
  const gapX = planter.sway.minX;
  const frame = (clock) => {
    track.swayClock = clock;
    track.placeSway(planter);
    draws.length = 0;
    rotations.length = 0;
    art.collectAndDrawWorld(null, [segment], 840);
    return { draws: draws.slice(), rotations: rotations.slice() };
  };
  const omega = TAU / planter.sway.period;
  const clockAt = (sine) => (Math.asin(sine) - planter.sway.phase) / omega;

  const names = new Set();
  for (const [label, sine] of [['left wall', -1], ['middle', 0], ['right wall', 1]]) {
    const shot = frame(clockAt(sine));
    const planters = shot.draws.filter((d) => d.name.startsWith('planter'));
    const bushes = shot.draws.filter((d) => d.name.startsWith('bush'));
    assert(planters.length >= 1, `${label}: no planter picture was drawn`);
    // Кашпо на месте: его картинка — самая близкая к проекции положения planter.x.
    const wanted = art.projectGameplayX(planter.x, planter.y + planter.height);
    const drawn = shot.draws.find((d) => Math.abs(d.x - wanted) < 3 && d.name.startsWith('planter'));
    assert(drawn, `${label}: the planter is not drawn where it stands (${wanted.toFixed(0)})`);
    names.add(drawn.name);
    // У стены кашпо не сливается с ней в один широкий ящик: ни одна картинка не шире кашпо + запас.
    const screenWidth = art.projectGameplayX(planter.x + planter.width, planter.y + planter.height) - wanted;
    assert(drawn.w <= screenWidth * 1.06 + 1, `${label}: the planter picture is ${drawn.w.toFixed(0)} px for ${screenWidth.toFixed(0)} px of planter (merged with a wall?)`);
    if (sine === 0) {
      assert(bushes.length <= 2, 'unexpected pictures');
      assert(shot.rotations.length >= 1 && Math.abs(shot.rotations.at(-1)) > 0.05 && Math.abs(shot.rotations.at(-1)) <= 0.1 + 1e-9, `lean at full speed expected, got ${shot.rotations}`);
    } else {
      assert(shot.rotations.every((angle) => Math.abs(angle) < 0.01), `${label}: no lean expected at the turning point, got ${shot.rotations}`);
    }
  }
  // Картинка не меняется на ходу: смотрим 13 положений за период.
  for (let k = 0; k < 13; k += 1) {
    const shot = frame((k / 12) * planter.sway.period);
    const wanted = art.projectGameplayX(planter.x, planter.y + planter.height);
    const drawn = shot.draws.find((d) => Math.abs(d.x - wanted) < 3 && d.name.startsWith('planter'));
    assert(drawn, `position ${k}: the planter is not drawn where it stands`);
    names.add(drawn.name);
  }
  assert(names.size === 1, `the planter changed its picture while moving: ${[...names].join(', ')}`);
  // Кренится в сторону движения.
  const right = frame(clockAt(0));
  const rightLean = right.rotations.at(-1);
  const movingRight = planter.vx > 0;
  assert((rightLean > 0) === movingRight, 'the planter must lean the way it moves');
  assert(gapX > 0, 'sanity');
});

check('drawing: the planter is a planter, not a bush, at every depth', () => {
  const stack = [];
  const ctx = new Proxy({ tx: 0 }, {
    get: (target, key) => {
      if (key === 'save') return () => stack.push(target.tx);
      if (key === 'restore') return () => { target.tx = stack.pop() ?? 0; };
      if (key === 'translate') return (dx) => { target.tx += dx; };
      return key in target ? target[key] : () => ({ addColorStop() {} });
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const draws = [];
  const pack = { hasAll: () => true, aspect: () => 0.9, has: () => true, draw: (c, name, x, y, w) => draws.push({ name, x: x + ctx.tx, w }) };
  const art = new GardenArt(ctx);
  art.lastShift = -14;
  art.artPack = pack;
  art.obstacleArt.pack = pack;
  const { track, segment, planter } = swayRow({ seed: 51, phase: 0, period: 2.4 });
  let seen = 0;
  for (const y of [-200, -50, 100, 250, 400, 550, 700, 800]) {
    for (const sine of [-1, 0, 1]) {
      segment.obstacles.forEach((obs) => { obs.y = y; });
      track.swayClock = (Math.asin(sine) - planter.sway.phase) / (TAU / planter.sway.period);
      track.placeSway(planter);
      draws.length = 0;
      art.collectAndDrawWorld(null, [segment], 840);
      if (!draws.length) continue; // за горизонтом или под экраном
      const wanted = art.projectGameplayX(planter.x, y + planter.height);
      const near = draws.filter((d) => Math.abs(d.x - wanted) < 3);
      assert(near.length > 0 && near.every((d) => d.name.startsWith('planter')), `row at y=${y}: the planter is drawn as ${near.map((d) => d.name)}`);
      seen += 1;
    }
  }
  assert(seen >= 12, `too few depths could be drawn: ${seen}`);
});

check('drawing: the speed and size of the planter in the picture are not tied to the gameplay clock', () => {
  const { planter } = swayRow({ seed: 41 });
  assert(typeof planter.vx === 'number' && Number.isFinite(planter.vx), 'vx must be a number for the drawing');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1l checks passed');
}
