// Фаза 1д: проекция для рисования меняется, а игра — нет.
// Один и тот же забег (seed 42, одинаковые нажатия) на настоящем коде игры
// (Game.update, Player, Track, WorldCamera) без отрисовки. Сравниваются момент
// столкновения, число пройденных препятствий, очки и монеты с эталоном,
// записанным ДО изменения проекции. Если игру меняют намеренно — эталон обновить:
//   node scripts/phase1e-check.mjs --print
// Запуск: node scripts/phase1e-check.mjs (входит в npm run check).
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Player } from '../src/game/Player.js';
import { Track } from '../src/game/Track.js';
import { WorldCamera } from '../src/rendering/WorldCamera.js';

const SEED = 42;
const MAX_SECONDS = 90;

// Нажатия по расписанию: влево 0.5 с, пауза 0.7 с, вправо 0.5 с, пауза 0.7 с…
function scheduledPress(time) {
  const phase = time % 2.4;
  if (phase < 0.5) return -1;
  if (phase >= 1.2 && phase < 1.7) return 1;
  return 0;
}

// «Автопилот»: смотрит только на препятствия в игровом мире (не на картинку)
// и ведёт кота к середине самого широкого прохода ближайшего ряда впереди.
function autopilotPress(game) {
  const player = game.player;
  const top = player.y - player.height / 2;
  let rowY = -Infinity;
  const row = [];
  for (const segment of game.track.segments) {
    for (const obs of segment.obstacles) {
      const bottom = obs.y + obs.height;
      if (bottom > top || bottom < top - 420) continue;
      if (bottom > rowY + 1) {
        rowY = bottom;
        row.length = 0;
      }
      if (Math.abs(bottom - rowY) <= 1) row.push(obs);
    }
  }
  if (!row.length) return 0;
  row.sort((a, b) => a.x - b.x);
  let best = null;
  let from = CONFIG.TRACK_LEFT;
  for (const obs of [...row, { x: CONFIG.TRACK_RIGHT, width: 0 }]) {
    const width = obs.x - from;
    if (!best || width > best.width) best = { center: from + width / 2, width };
    from = Math.max(from, obs.x + obs.width);
  }
  const dx = best.center - player.x;
  return Math.abs(dx) > 8 ? Math.sign(dx) : 0;
}

function makeGame(pressFor) {
  const game = Object.create(Game.prototype);
  let coins = 0;
  Object.assign(game, {
    state: 'PLAYING', runSeed: SEED, player: new Player(), track: new Track(), camera: new WorldCamera(),
    // Эффекты (искры, тряска, звук) на игру не влияют: любая их функция ничего не делает.
    feel: new Proxy({}, { get: () => () => {} }), audio: new Proxy({}, { get: () => () => {} }),
    floatingRewards: [], riskHintSeen: true,
    storage: { set() {}, getCoins: () => coins, addCoins(n) { coins += n; return coins; } },
    mouseInput: null, touchInput: { getTouchX: () => null, reset() {} },
    isGameplayPaused: () => false, crashed: false,
    gameOver() { this.crashed = true; this.state = 'GAMEOVER'; }
  });
  game.keyboardInput = {
    isLeftPressed: () => pressFor(game) < 0,
    isRightPressed: () => pressFor(game) > 0,
    reset() {}
  };
  // Как в Game.start, только без звука, анимации и рекламы.
  game.score = 0; game.distanceScore = 0; game.pathReward = 0;
  game.multiplier = CONFIG.MULTIPLIER_START; game.riskStreak = 0;
  game.currentSpeed = CONFIG.TRACK_SPEED_START; game.runTime = 0;
  game.runCoins = 0; game.invulnerableTime = 0;
  game.player.reset();
  game.track.setSeed(SEED);
  game.track.reset();
  game.camera.reset();
  return game;
}

function run(mode, dt) {
  const game = makeGame(mode === 'schedule' ? (g) => scheduledPress(g.runTime) : autopilotPress);
  const passed = new WeakSet();
  let passedCount = 0;
  let clock = 0;
  while (!game.crashed && clock < MAX_SECONDS) {
    Game.prototype.update.call(game, dt);
    clock += dt;
    for (const segment of game.track.segments) {
      for (const obs of segment.obstacles) {
        if (!passed.has(obs) && obs.y > game.player.y + game.player.height / 2) {
          passed.add(obs);
          passedCount += 1;
        }
      }
    }
  }
  return {
    crashAt: game.crashed ? Number(game.runTime.toFixed(4)) : null,
    passed: passedCount,
    score: game.score,
    coins: game.runCoins
  };
}

const RUNS = [];
for (const mode of ['schedule', 'autopilot']) {
  for (const fps of [60, 10, 120]) RUNS.push({ mode, fps, ...run(mode, 1 / fps) });
}

// Эталон: записан на коде ДО изменения проекции рисования (Фаза 1д). Строки autopilot
// обновлены 2026-10-01 вместе с намеренным сужением проходов (игра стала сложнее: бот
// вылетает раньше) и правилом стен у краёв дорожки; schedule не изменился.
const EXPECTED = [
  { mode: 'schedule', fps: 60, crashAt: 6.05, passed: 2, score: 70, coins: 0 },
  { mode: 'schedule', fps: 10, crashAt: 6.05, passed: 2, score: 70, coins: 0 },
  { mode: 'schedule', fps: 120, crashAt: 6.0583, passed: 2, score: 70, coins: 0 },
  { mode: 'autopilot', fps: 60, crashAt: 39.75, passed: 81, score: 637, coins: 0 },
  { mode: 'autopilot', fps: 10, crashAt: 73.46, passed: 232, score: 1414, coins: 4 },
  { mode: 'autopilot', fps: 120, crashAt: 30.5333, passed: 48, score: 475, coins: 0 }
];

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(RUNS.map(({ mode, fps, crashAt, passed, score, coins }) => ({ mode, fps, crashAt, passed, score, coins }))));
  process.exit(0);
}

const results = [];
for (const r of RUNS) {
  const e = EXPECTED.find((x) => x.mode === r.mode && x.fps === r.fps);
  const same = e && e.crashAt === r.crashAt && e.passed === r.passed && e.score === r.score && e.coins === r.coins;
  const text = `${r.mode} ${r.fps} FPS: столкновение ${r.crashAt ?? '—'} с, пройдено ${r.passed}, очки ${r.score}, монеты ${r.coins}`;
  results.push(same ? `OK  ${text}` : `FAIL ${text} (эталон: ${JSON.stringify(e)})`);
}
console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) {
  console.log('\nЗабег отличается от эталона: игра изменилась');
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1e checks passed (забег совпал с эталоном)');
}
