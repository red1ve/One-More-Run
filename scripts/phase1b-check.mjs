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

check('an obstacle row never passes through the cat without a hit, even at 10 FPS', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    // Кот стоит в середине сплошного ряда (прохода нет под ним).
    const crashed = (() => {
      const r = rng(seed);
      const height = r() < 0.5 ? 40 : 64;
      const player = new Player();
      const obstacles = [{ x: CONFIG.TRACK_LEFT, y: CONFIG.PLAYER_START_Y - 200 - r() * 80, width: CONFIG.TRACK_WIDTH, height }];
      const game = {
        state: 'PLAYING', runTime: 300, currentSpeed: 0, distanceScore: 0, pathReward: 0, score: 0,
        player, camera: null, feel: { update() {} }, floatingRewards: [],
        track: {
          segments: [{ obstacles }],
          update(dt, speed) { for (const obs of obstacles) obs.y += speed * dt; },
          checkPassed: () => ({}), collectCoins: () => 0, checkCollision: Track.prototype.checkCollision
        },
        keyboardInput: { isLeftPressed: () => false, isRightPressed: () => false },
        mouseInput: null, touchInput: { getTouchX: () => null }, isGameplayPaused: () => false,
        applyReward() {}, applyCoinPickup() {}, updateFloating: Game.prototype.updateFloating,
        simulateStep: Game.prototype.simulateStep, crashed: false,
        gameOver() { this.crashed = true; this.state = 'GAMEOVER'; }
      };
      for (let t = 0; t < 1.5 && !game.crashed; t += 0.1) Game.prototype.update.call(game, 0.1);
      return game.crashed;
    })();
    assert(crashed, `seed ${seed}: solid row passed through the cat`);
  }
});

check('physics substeps are small enough at max speed and the 0.1 s frame cap', () => {
  const worst = Math.max(CONFIG.TRACK_SPEED_MAX, CONFIG.PLAYER_SPEED_MAX) * 0.1;
  const steps = Math.min(CONFIG.SUBSTEP_MAX_COUNT, Math.ceil(worst / CONFIG.SUBSTEP_MAX_PX));
  assert(worst / steps <= CONFIG.SUBSTEP_MAX_PX + 0.01, `step ${worst / steps}px`);
  assert(CONFIG.SUBSTEP_MAX_PX < CONFIG.PLAYER_WIDTH, 'substep must be smaller than the cat');
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

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1b check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1b checks passed');
}
