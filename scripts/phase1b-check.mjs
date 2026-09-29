// Фаза 1б: проверки геймплея.
// Запуск: node scripts/phase1b-check.mjs (входит в npm run check).
import { CONFIG, getPlayerSpeed, getTrackSpeed } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Player } from '../src/game/Player.js';
import { Track } from '../src/game/Track.js';

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

// Простой повторяемый генератор случайных чисел.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Минимальная «игра»: настоящие Game.update / simulateStep, Player и
// Track.checkCollision, но трасса — один ряд с проходом, без генератора.
function makeScenario(seed, runTime) {
  const r = rng(seed);
  const gapW = 96 + r() * 60;
  const gapX = CONFIG.TRACK_LEFT + 20 + r() * (CONFIG.TRACK_WIDTH - gapW - 40);
  const rowY = CONFIG.PLAYER_START_Y - 260 - r() * 120;
  const height = r() < 0.5 ? 40 : 64;
  const obstacles = [
    { x: CONFIG.TRACK_LEFT, y: rowY, width: gapX - CONFIG.TRACK_LEFT, height },
    { x: gapX + gapW, y: rowY, width: CONFIG.TRACK_RIGHT - gapX - gapW, height }
  ];
  const player = new Player();
  player.x = CONFIG.TRACK_LEFT + 40 + r() * (CONFIG.TRACK_WIDTH - 80);
  const holdRight = r() < 0.5;
  // Отпускание клавиши на границе кадра 10 FPS: оба режима видят его одновременно,
  // и сравнивается именно физика, а не задержка ввода.
  const releaseAt = 0.1 * (1 + Math.floor(r() * 6));
  const track = {
    segments: [{ obstacles }],
    update(dt, speed) {
      for (const obs of obstacles) obs.y += speed * dt;
    },
    checkPassed: () => ({}),
    collectCoins: () => 0,
    checkCollision: Track.prototype.checkCollision
  };
  let clock = 0;
  const game = {
    state: 'PLAYING',
    runTime,
    currentSpeed: 0,
    distanceScore: 0,
    pathReward: 0,
    score: 0,
    player,
    track,
    camera: null,
    feel: { update() {} },
    floatingRewards: [],
    keyboardInput: {
      // 1e-6: время копится из мелких шагов, 0.3 может стать 0.29999.
      isLeftPressed: () => !holdRight && clock < releaseAt - 1e-6,
      isRightPressed: () => holdRight && clock < releaseAt - 1e-6
    },
    mouseInput: null,
    touchInput: { getTouchX: () => null },
    isGameplayPaused: () => false,
    applyReward() {},
    applyCoinPickup() {},
    updateFloating: Game.prototype.updateFloating,
    simulateStep: Game.prototype.simulateStep,
    crashed: false,
    gameOver() { this.crashed = true; this.state = 'GAMEOVER'; }
  };
  return {
    run(dt, seconds = 1.6) {
      for (clock = 0; clock < seconds && !game.crashed; clock += dt) {
        Game.prototype.update.call(game, dt);
      }
      return game.crashed;
    }
  };
}

check('low FPS (10) gives the same crash outcome as 120 FPS', () => {
  let mismatches = 0;
  const total = 400;
  for (let seed = 1; seed <= total; seed += 1) {
    const runTime = (seed % 5) * 60;
    const fine = makeScenario(seed, runTime).run(1 / 120);
    const coarse = makeScenario(seed, runTime).run(0.1);
    if (fine !== coarse) mismatches += 1;
  }
  // С делением кадра исход совпадает полностью (без него — 2 из 400 расходятся).
  assert(mismatches === 0, `mismatches ${mismatches}/${total}`);
});

function makeSolidRowGame(rowY, rowHeight, runTime) {
  const player = new Player();
  const obstacles = [{ x: CONFIG.TRACK_LEFT, y: rowY, width: CONFIG.TRACK_WIDTH, height: rowHeight }];
  const game = {
    state: 'PLAYING', runTime, currentSpeed: 0, distanceScore: 0, pathReward: 0, score: 0,
    player, camera: null, feel: { update() {} }, floatingRewards: [],
    track: {
      segments: [{ obstacles }],
      update(dt, speed) { for (const obs of obstacles) obs.y += speed * dt; },
      checkPassed: () => ({}), collectCoins: () => 0, checkCollision: Track.prototype.checkCollision
    },
    keyboardInput: { isLeftPressed: () => false, isRightPressed: () => false },
    mouseInput: null, touchInput: { getTouchX: () => null }, isGameplayPaused: () => false,
    applyReward() {}, applyCoinPickup() {}, updateFloating: Game.prototype.updateFloating,
    simulateStep: Game.prototype.simulateStep, steps: 0, crashed: false,
    gameOver() { this.crashed = true; this.state = 'GAMEOVER'; }
  };
  return game;
}

check('a thin row never passes through the cat at 10 FPS and max speed', () => {
  // Ряд 10 px + кот 36 px = окно 46 px, а за кадр 0.1 с мир сдвигается на 72 px:
  // без деления кадра часть рядов «проскакивала» бы сквозь кота.
  for (let offset = 0; offset < 72; offset += 3) {
    const game = makeSolidRowGame(CONFIG.PLAYER_START_Y - 160 - offset, 10, 1000);
    for (let t = 0; t < 1.5 && !game.crashed; t += 0.1) Game.prototype.update.call(game, 0.1);
    assert(game.crashed, `row at offset ${offset} passed through the cat`);
  }
});

check('a long frame is split into small physics steps', () => {
  const game = makeSolidRowGame(-5000, 10, 1000);
  const step = Game.prototype.simulateStep;
  const moves = [];
  game.simulateStep = function counted(dt) {
    moves.push(Math.max(getTrackSpeed(this.runTime), this.player.speed) * dt);
    return step.call(this, dt);
  };
  Game.prototype.update.call(game, 0.1);
  assert(moves.length > 1, `only ${moves.length} step(s) for a 0.1 s frame`);
  assert(Math.max(...moves) <= CONFIG.SUBSTEP_MAX_PX + 0.5, `step ${Math.max(...moves).toFixed(1)} px`);
  assert(CONFIG.SUBSTEP_MAX_PX < CONFIG.PLAYER_WIDTH, 'substep must be smaller than the cat');
  const smooth = makeSolidRowGame(-5000, 10, 0);
  let smoothSteps = 0;
  smooth.simulateStep = function counted(dt) { smoothSteps += 1; return step.call(this, dt); };
  Game.prototype.update.call(smooth, 1 / 60);
  assert(smoothSteps === 1, 'a normal 60 FPS frame stays one step');
});

check('cat strafe speed grows with the track, never below the generator assumption', () => {
  assert(getPlayerSpeed(getTrackSpeed(0)) === CONFIG.PLAYER_SPEED, 'start speed');
  assert(Math.abs(getPlayerSpeed(CONFIG.TRACK_SPEED_MAX) - CONFIG.PLAYER_SPEED_MAX) < 1e-9, 'max speed');
  let prev = 0;
  for (let t = 0; t <= 300; t += 10) {
    const v = getPlayerSpeed(getTrackSpeed(t));
    assert(v >= prev - 1e-9, 'monotonic');
    assert(v >= CONFIG.PLAYER_SPEED, 'never slower than the reachability assumption');
    prev = v;
  }
});

check('generator never falls back to widened or empty rows over long runs', () => {
  const original = Track.prototype.placeReachableGap;
  const stats = { calls: 0, widened: 0 };
  Track.prototype.placeReachableGap = function patched(minWidth, y, preferred) {
    const gap = original.call(this, minWidth, y, preferred);
    stats.calls += 1;
    if (gap.width > minWidth) stats.widened += 1;
    return gap;
  };
  try {
    for (let run = 0; run < 8; run += 1) {
      const track = new Track();
      track.setSeed(run + 1);
      track.init();
      for (let time = 0; time < 240; time += 1 / 30) {
        track.update(1 / 30, getTrackSpeed(time), time);
      }
    }
  } finally {
    Track.prototype.placeReachableGap = original;
  }
  assert(stats.calls > 300, `too few rows generated: ${stats.calls}`);
  assert(stats.widened === 0, `${stats.widened}/${stats.calls} rows had to be widened`);
});

check('same run seed gives the same track, different seeds differ', () => {
  const build = (seed) => {
    const track = new Track();
    track.setSeed(seed);
    track.init();
    for (let time = 0; time < 90; time += 1 / 30) track.update(1 / 30, getTrackSpeed(time), time);
    return JSON.stringify(track.segments.map((segment) => [segment.type, segment.obstacles, segment.coins.length]));
  };
  assert(build(42) === build(42), 'same seed produced different tracks');
  assert(build(42) !== build(43), 'different seeds produced the same track');
});

function makeReviveGame() {
  const player = new Player();
  const row = (y) => ({ obstacles: [{ x: CONFIG.TRACK_LEFT, y, width: CONFIG.TRACK_WIDTH, height: 40 }], paths: [{ x: 0, y, width: 1, height: 40, type: 'SAFE' }], coins: [], isPassed: false });
  const track = new Track();
  // Три сплошных ряда: у кота, в 300 px и в 1200 px впереди.
  track.segments = [row(CONFIG.PLAYER_START_Y - 30), row(CONFIG.PLAYER_START_Y - 300), row(CONFIG.PLAYER_START_Y - 1200)];
  track.update = function update(dt, speed) {
    for (const segment of this.segments) for (const obs of segment.obstacles) obs.y += speed * dt;
  };
  track.checkPassed = () => ({});
  track.collectCoins = () => 0;
  let recorded = 0;
  let submitted = 0;
  const game = {
    state: 'PLAYING', runTime: 0, currentSpeed: 0, distanceScore: 0, pathReward: 0, score: 0,
    bestScore: 0, multiplier: 1, riskStreak: 0, reviveUsed: false, invulnerableTime: 0,
    player, track, camera: null, floatingRewards: [],
    feel: { update() {}, onGameOver() {}, onNewBest() {} },
    storage: { set() {} },
    platform: { submitScore() { submitted += 1; }, recordRunCompleted() { recorded += 1; } },
    keyboardInput: { isLeftPressed: () => false, isRightPressed: () => false, reset() {} },
    mouseInput: null, touchInput: { getTouchX: () => null }, isGameplayPaused: () => false,
    applyReward() {}, applyCoinPickup() {},
    updateFloating: Game.prototype.updateFloating,
    simulateStep: Game.prototype.simulateStep,
    gameOver: Game.prototype.gameOver,
    canRevive: Game.prototype.canRevive,
    revive: Game.prototype.revive
  };
  const tick = (seconds) => {
    for (let t = 0; t < seconds - 1e-9 && game.state === 'PLAYING'; t += 1 / 60) {
      Game.prototype.update.call(game, 1 / 60);
    }
  };
  return { game, track, tick, recorded: () => recorded, submitted: () => submitted };
}

check('revive works once, clears rows ahead and grants short invulnerability', () => {
  const originalLog = console.log;
  console.log = () => {};
  try {
    const { game, track, tick, recorded, submitted } = makeReviveGame();
    tick(0.5);
    assert(game.state === 'GAMEOVER', 'cat should crash into the row at its feet');
    game.launchPending = true;
    assert(!game.canRevive(), 'no revive while a restart (and its ad) is pending');
    game.launchPending = false;
    game.isGameplayPaused = () => true;
    assert(!game.canRevive(), 'no revive while paused or during an ad');
    game.isGameplayPaused = () => false;
    assert(game.canRevive(), 'first revive is available');
    assert(game.revive() === true, 'revive should succeed');
    assert(game.state === 'PLAYING', 'revive resumes play');
    assert(track.segments[0].obstacles.length === 0 && track.segments[1].obstacles.length === 0, 'near rows cleared');
    assert(track.segments[2].obstacles.length === 1, 'far row kept');
    assert(Math.abs(game.invulnerableTime - CONFIG.REVIVE_INVULNERABLE_SECONDS) < 1e-9, 'invulnerable');
    // Ставим дальний ряд прямо на кота: пока кот неуязвим, удара нет.
    track.segments[2].obstacles[0].y = CONFIG.PLAYER_START_Y - 20;
    tick(1.0);
    assert(game.state === 'PLAYING', 'no crash while invulnerable');
    // Этот ряд уезжает за спину; после 2 с неуязвимость должна закончиться.
    tick(1.5);
    assert(game.invulnerableTime === 0 && game.player.invulnerable === 0, 'invulnerability ends after 2 s');
    track.segments.push({ obstacles: [{ x: CONFIG.TRACK_LEFT, y: CONFIG.PLAYER_START_Y - 30, width: CONFIG.TRACK_WIDTH, height: 40 }], paths: [], coins: [], isPassed: false });
    tick(1.0);
    assert(game.state === 'GAMEOVER', 'second crash ends the run');
    assert(!game.canRevive() && game.revive() === false, 'only one revive per run');
    assert(recorded() === 1, `run counted ${recorded()} times for ad pacing`);
    assert(track.segments[0].isPassed && track.segments[0].paths.length === 0, 'cleared rows give no reward');
    assert(submitted() <= 1, `best score submitted ${submitted()} times`);
  } finally {
    console.log = originalLog;
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1b check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1b checks passed');
}
