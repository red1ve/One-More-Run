// Время суток в забеге: день → золотой час → вечер → ночь → рассвет (только вид).
//  (а) этапы по времени забега, цикл, ключи смены, плавные переходы без скачков;
//  (б) читаемость: даже самый тёмный момент остаётся светлым (препятствия и проходы видны);
//  (в) игра: плашка нового этапа ровно один раз на этап, не на старте, живёт заданное время;
//  (г) рисование: днём ничего, ночью вуаль и светлячки, состояние холста не «утекает»;
//  (д) звук, вибрация и строки на двух языках.
// Запуск: node scripts/phase1k-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { GameFeel } from '../src/game/GameFeel.js';
import { stageName, timeOfDay } from '../src/game/TimeOfDay.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { AudioService } from '../src/services/AudioService.js';

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
const TOD = CONFIG.TIME_OF_DAY;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const sameLook = (a, b, eps = 1e-9) => a.tint.every((value, i) => close(value, b.tint[i], eps))
  && a.wash.color.every((value, i) => close(value, b.wash.color[i], eps)) && close(a.wash.alpha, b.wash.alpha, eps)
  && a.glow.color.every((value, i) => close(value, b.glow.color[i], eps)) && close(a.glow.alpha, b.glow.alpha, eps)
  && close(a.vignette, b.vignette, eps) && close(a.fireflies, b.fireflies, eps);
const stageLook = (name) => TOD.STAGES.find((stage) => stage.name === name).look;

// ---- (а) этапы и переходы

check('stages: day, golden hour, dusk, night, dawn at the configured seconds, then the cycle repeats', () => {
  const expect = [
    [0, 'day', 0], [59.9, 'day', 0], [60, 'golden', 1], [119.9, 'golden', 1], [120, 'dusk', 2], [179.9, 'dusk', 2],
    [180, 'night', 3], [259.9, 'night', 3], [260, 'dawn', 4], [299.9, 'dawn', 4],
    [300, 'day', 0], [359.9, 'day', 0], [360, 'golden', 1], [480, 'night', 3], [600, 'day', 0]
  ];
  for (const [time, name, index] of expect) {
    const stage = timeOfDay(time);
    assert(stage.name === name && stage.index === index, `at ${time} s expected ${name}, got ${stage.name}`);
  }
  assert(timeOfDay(0).cycle === 0 && timeOfDay(299.9).cycle === 0 && timeOfDay(300).cycle === 1 && timeOfDay(650).cycle === 2, 'cycle numbers');
  assert(TOD.STAGES.map((stage) => stage.name).join() === 'day,golden,dusk,night,dawn', 'the five stages in order');
  for (const bad of [NaN, -5, undefined, null, 'x', {}]) {
    const stage = timeOfDay(bad);
    assert(stage.name === 'day' && stage.cycle === 0 && stage.key === 0, `garbage ${String(bad)} must mean the start of a run`);
  }
});

check('stages: the key changes exactly when a stage changes and never goes back (a toast is due at every change)', () => {
  let previous = timeOfDay(0).key;
  const changes = [];
  for (let time = 0; time <= 700; time += 1 / 60) {
    const key = timeOfDay(time).key;
    assert(key >= previous, `the key went back at ${time.toFixed(2)} s`);
    if (key !== previous) changes.push([Math.round(time), stageName(key)]);
    previous = key;
  }
  assert(changes.map((item) => item.join(':')).join() === '60:golden,120:dusk,180:night,260:dawn,300:day,360:golden,420:dusk,480:night,560:dawn,600:day,660:golden', `changes ${JSON.stringify(changes)}`);
  assert(stageName(0) === 'day' && stageName(13) === 'night' && stageName(21) === 'golden' && stageName(24) === 'dawn', 'stageName reads the stage from the key (cycle * 10 + index)');
});

check('transitions: a run starts as plain day, every stage grows out of the previous one over BLEND seconds, no jumps', () => {
  assert(sameLook(timeOfDay(0).look, stageLook('day')) && sameLook(timeOfDay(30).look, stageLook('day')), 'the first minute is plain day');
  assert(timeOfDay(0).look.tint.every((value) => value === 255) && timeOfDay(0).look.fireflies === 0, 'day has no tint and no fireflies');
  const names = TOD.STAGES.map((stage) => stage.name);
  TOD.STAGES.slice(1).forEach((stage, i) => {
    const before = stageLook(names[i]);
    assert(sameLook(timeOfDay(stage.from).look, before), `${stage.name}: must start exactly where ${names[i]} ended`);
    assert(sameLook(timeOfDay(stage.from + TOD.BLEND).look, stage.look), `${stage.name}: must be fully there after BLEND seconds`);
    assert(sameLook(timeOfDay(stage.from + TOD.BLEND + 20).look, stage.look), `${stage.name}: stays put until the next stage`);
  });
  assert(sameLook(timeOfDay(TOD.CYCLE).look, stageLook('dawn')), 'at the end of the cycle the day grows out of dawn');
  assert(sameLook(timeOfDay(TOD.CYCLE + TOD.BLEND).look, stageLook('day')), 'and is plain day again after BLEND seconds');
  let worst = 0;
  let last = timeOfDay(0).look;
  for (let time = 1 / 60; time <= 620; time += 1 / 60) {
    const look = timeOfDay(time).look;
    for (let i = 0; i < 3; i += 1) {
      worst = Math.max(worst, Math.abs(look.tint[i] - last.tint[i]), Math.abs(look.wash.color[i] - last.wash.color[i]));
    }
    worst = Math.max(worst, Math.abs(look.vignette - last.vignette) * 255, Math.abs(look.fireflies - last.fireflies) * 20, Math.abs(look.wash.alpha - last.wash.alpha) * 255);
    last = look;
  }
  assert(worst < 1.2, `a colour jumps by ${worst.toFixed(2)} in one frame`);
});

// ---- (б) читаемость

check('readability: at every moment of the cycle the picture stays bright enough to see obstacles and gaps', () => {
  let darkest = Infinity;
  for (let time = 0; time <= TOD.CYCLE + 20; time += 0.25) {
    const look = timeOfDay(time).look;
    const channels = Math.min(...look.tint);
    const luminance = (0.2126 * look.tint[0] + 0.7152 * look.tint[1] + 0.0722 * look.tint[2]) / 255;
    darkest = Math.min(darkest, luminance);
    assert(channels >= 140, `at ${time} s a tint channel is ${channels.toFixed(0)}: too dark`);
    assert(luminance >= 0.6, `at ${time} s the tint brightness is ${luminance.toFixed(2)}: too dark`);
    assert(look.vignette <= 0.4 && look.wash.alpha <= 0.3 && look.glow.alpha <= 0.3, `at ${time} s an overlay is too strong`);
    assert(look.fireflies >= 0 && look.fireflies <= 20, 'a sane number of fireflies');
  }
  assert(darkest < 1, 'sanity');
  assert(timeOfDay(200).look.fireflies > 10 && timeOfDay(100).look.fireflies === 0, 'fireflies only at night (and a few at dawn)');
});

// ---- (в) игра: плашка этапа

function makeStageGame(over = {}) {
  const calls = { stage: 0 };
  const game = Object.assign(Object.create(Game.prototype), {
    runTime: 0, stageKey: 0, stageToast: null,
    feel: { onStage() { calls.stage += 1; } },
    ...over
  });
  return { game, calls };
}

check('toast: one per stage change, none at the start of a run, gone after TOAST_SECONDS', () => {
  const { game, calls } = makeStageGame();
  const shown = [];
  for (let step = 0; step < 60 * 130; step += 1) {
    game.runTime = step / 60;
    const before = game.stageToast;
    game.updateStage(1 / 60);
    if (game.stageToast && game.stageToast !== before) shown.push([Math.round(game.runTime), game.stageToast.name]);
  }
  assert(shown.map((item) => item.join(':')).join() === '60:golden,120:dusk', `toasts ${JSON.stringify(shown)}`);
  assert(calls.stage === 2, 'the sound/vibration hook fires once per change');

  const fresh = makeStageGame();
  fresh.game.runTime = 5;
  fresh.game.updateStage(1 / 60);
  assert(fresh.game.stageToast === null && fresh.calls.stage === 0, 'no toast at the start of a run');

  const life = makeStageGame();
  life.game.runTime = 60;
  life.game.updateStage(0);
  assert(life.game.stageToast && life.game.stageToast.age === 0, 'a new toast starts at age 0');
  let elapsed = 0;
  while (life.game.stageToast && elapsed < 10) {
    life.game.runTime += 0.1;
    life.game.updateStage(0.1);
    elapsed += 0.1;
  }
  assert(!life.game.stageToast && Math.abs(elapsed - TOD.TOAST_SECONDS) < 0.15, `the toast lived ${elapsed.toFixed(1)} s`);
});

check('toast: a long run shows the repeating stages again, and a new run starts clean', () => {
  const { game } = makeStageGame();
  const names = [];
  for (let time = 0; time <= 420; time += 0.5) {
    game.runTime = time;
    const before = game.stageToast;
    game.updateStage(0.5);
    if (game.stageToast && game.stageToast !== before) names.push(game.stageToast.name);
  }
  assert(names.join() === 'golden,dusk,night,dawn,day,golden,dusk', `names ${names}`);
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  start() {'), source.indexOf('  loop(timestamp)'));
  assert(/this\.stageKey = timeOfDay\(this\.runTime \+ \(this\.todOffset \|\| 0\)\)\.key/.test(start) && /this\.stageToast = null/.test(start), 'start() must reset the stage');
  assert(/this\.updateStage\?\.\(deltaTime\)/.test(source), 'update() must age the toast and detect new stages');
});

check('dev offset: ?tod shifts the look of the whole run without a toast at the start, and does not touch the real run time', () => {
  const { game, calls } = makeStageGame({ todOffset: 200 });
  game.stageKey = timeOfDay(200).key; // как делает start()
  game.runTime = 0;
  game.updateStage(1 / 60);
  assert(game.stageToast === null && calls.stage === 0, 'a run that starts in the night shows no toast');
  game.runTime = 60; // 260 s в цикле: рассвет
  game.updateStage(1 / 60);
  assert(game.stageToast && game.stageToast.name === 'dawn', 'the stages follow the shifted clock');
  assert(game.runTime === 60, 'the real run time (speed, difficulty) is untouched');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(/get\('tod'\)/.test(main) && /game\.todOffset/.test(main), 'main.js reads ?tod in dev');
  assert(/import\.meta\.env\?\.DEV/.test(main.slice(0, main.indexOf("get('tod')"))), 'only in dev');
});

// ---- (г) рисование

function recordingContext() {
  const calls = [];
  const sets = [];
  let saves = 0;
  const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 12 }) }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'save') return () => { saves += 1; calls.push('save'); };
      if (key === 'restore') return () => { saves -= 1; calls.push('restore'); };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push(key); return args; };
    },
    set(target, key, value) {
      target[key] = value;
      if (key === 'globalCompositeOperation') sets.push(value);
      return true;
    }
  });
  return { ctx, calls, sets, saveDepth: () => saves };
}

check('drawing: day paints nothing; night paints the veil, the fade at the edges and fireflies; the canvas state does not leak', () => {
  const day = recordingContext();
  new Renderer(day.ctx).drawTimeOfDay(timeOfDay(10).look, 3);
  assert(day.calls.filter((name) => name === 'fillRect').length === 0 && day.calls.filter((name) => name === 'arc').length === 0, 'plain day must draw nothing at all');

  const night = recordingContext();
  new Renderer(night.ctx).drawTimeOfDay(timeOfDay(200).look, 3);
  assert(night.sets.join() === 'multiply,source-over', `composite modes ${night.sets}`);
  assert(night.calls.filter((name) => name === 'fillRect').length >= 4, 'veil, wash, glow and edge fade');
  assert(night.calls.filter((name) => name === 'arc').length === 2 * Math.ceil(timeOfDay(200).look.fireflies), 'two circles (halo and core) per firefly');
  assert(night.saveDepth() === 0 && night.calls[0] === 'save' && night.calls.at(-1) === 'restore', 'save and restore must be balanced');

  const dusk = recordingContext();
  new Renderer(dusk.ctx).drawTimeOfDay(timeOfDay(140).look, 3);
  assert(dusk.calls.filter((name) => name === 'arc').length === 0, 'no fireflies at dusk');

  const fade = recordingContext();
  new Renderer(fade.ctx).drawFireflies(0.5, 1);
  assert(fade.calls.filter((name) => name === 'arc').length === 2, 'half a firefly: the last one fades in');
  const none = recordingContext();
  new Renderer(none.ctx).drawFireflies(0, 1);
  new Renderer(none.ctx).drawTimeOfDay(null, 1);
  assert(none.calls.length === 0, 'nothing to draw');
});

check('drawing: fireflies stay beside the road and inside the screen, and move over time', () => {
  const spots = [];
  const ctx = new Proxy({}, {
    get: (target, key) => (key === 'arc' ? (x, y) => spots.push([x, y]) : () => {}),
    set: () => true
  });
  const renderer = new Renderer(ctx);
  renderer.drawFireflies(14, 5);
  const first = spots.filter((_, index) => index % 2 === 0).map(([x, y]) => [x, y]);
  assert(first.length === 14, 'one core per firefly');
  for (const [x, y] of first) {
    assert(x >= 0 && x <= CONFIG.CANVAS_WIDTH && y > 200 && y < CONFIG.CANVAS_HEIGHT, `a firefly at ${x.toFixed(0)}, ${y.toFixed(0)} is off the lawn`);
    assert(x < 200 || x > CONFIG.CANVAS_WIDTH - 200, 'fireflies fly beside the road, not over the sand');
  }
  spots.length = 0;
  renderer.drawFireflies(14, 6);
  const later = spots.filter((_, index) => index % 2 === 0);
  assert(later.some(([x], index) => Math.abs(x - first[index][0]) > 1), 'fireflies drift sideways');
  assert(later.some(([, y], index) => Math.abs(y - first[index][1]) > 1), 'fireflies bob up and down');
});

check('drawing: the stage toast shows the text, fades out, and Game.render draws the veil only during a run', () => {
  const toast = recordingContext();
  const texts = [];
  const ctxWithText = new Proxy(toast.ctx, {
    get: (target, key) => (key === 'fillText' ? (text) => texts.push(text) : target[key]),
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const renderer = new Renderer(ctxWithText);
  renderer.drawStageToast('NIGHT', 1);
  assert(texts.includes('NIGHT'), 'the toast text is drawn');
  texts.length = 0;
  renderer.drawStageToast('NIGHT', 0);
  renderer.drawStageToast('', 1);
  assert(texts.length === 0, 'an invisible toast draws nothing');

  const drawn = [];
  const stub = {
    clear() {}, drawBackdrop() {}, drawFarWorld() {}, beginWorld() {}, drawWorld() {}, drawSegments() {}, drawPlayer() {},
    drawParticles() {}, drawFloatingRewards() {}, endWorld() {}, drawFlash() {}, drawHUD() {}, drawPause() {}, drawChoiceHint() {},
    drawStartScreen() {}, drawGameOver() {}, drawLeaderboard() {},
    drawTimeOfDay(look) { drawn.push(`veil:${look.fireflies > 10 ? 'night' : 'other'}`); },
    drawStageToast(text, alpha) { drawn.push(`toast:${text}:${alpha > 0 && alpha <= 1}`); }
  };
  const make = (state, extra = {}) => Object.assign(Object.create(Game.prototype), {
    state, renderer: stub, camera: null, feel: { time: 4, particles: { particles: [] } }, track: { segments: [] }, player: { y: 840 }, floatingRewards: [],
    score: 0, multiplier: 1, bestScore: 0, riskStreak: 0, coins: 0, userPaused: false, platform: null, choiceHintSeen: true,
    distanceScore: 0, pathReward: 0, audio: null, leaderboard: null, runTime: 200, stageToast: null,
    daily: { playedToday: () => false, nextReward: () => 5, streakAt: () => 0, bestToday: () => 0 }, clockOffset: 0, dailyRun: false, dailyResult: null, ...extra
  });
  make('START').render();
  assert(drawn.length === 0, 'the start screen is always plain day');
  make('PLAYING').render();
  assert(drawn.join() === 'veil:night', `playing at 200 s drew ${drawn}`);
  drawn.length = 0;
  make('GAMEOVER').render();
  assert(drawn.join() === 'veil:night', 'Game Over keeps the night it ended in');
  drawn.length = 0;
  make('PLAYING', { stageToast: { name: 'night', age: 1 } }).render();
  assert(drawn.join() === 'veil:night,toast:NIGHT:true', `toast drawn ${drawn}`);
  drawn.length = 0;
  make('GAMEOVER', { stageToast: { name: 'night', age: 1 } }).render();
  assert(drawn.join() === 'veil:night', 'no toast on Game Over');
});

// ---- (д) звук, вибрация, строки

check('sound and vibration: a new stage plays a rising four-note figure and a short pulse; both languages have every stage name', () => {
  const frequencies = [];
  const audio = new AudioService();
  audio.ctx = {
    state: 'running', currentTime: 100, destination: {},
    createOscillator: () => ({ type: '', frequency: { setValueAtTime: (value) => frequencies.push(value) }, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} })
  };
  audio.unlocked = true;
  assert(audio.play('stage') === true && frequencies.length === 4, `expected four notes, got ${frequencies.length}`);
  assert(frequencies.every((value, i) => i === 0 || value > frequencies[i - 1]), 'the notes rise');
  const pentatonic = new Set([0, 2, 4, 7, 9]);
  assert(frequencies.every((value) => pentatonic.has(Math.round(12 * Math.log2(value / 523.25)) % 12)), 'the notes are in the C pentatonic like the music');
  assert(Array.isArray(CONFIG.FEEL.HAPTIC_PATTERNS.stage) && CONFIG.FEEL.HAPTIC_PATTERNS.stage.reduce((a, b) => a + b, 0) <= 300, 'a short vibration pattern exists');

  const played = [];
  const pulses = [];
  new GameFeel({ play: (name) => played.push(name) }, { pulse: (name) => pulses.push(name) }).onStage();
  assert(played.join() === 'stage' && pulses.join() === 'stage', 'the feel hook plays the sound and the vibration');
  new GameFeel(null, null).onStage();

  for (const lang of ['en', 'ru']) {
    const dict = JSON.parse(readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    for (const stage of TOD.STAGES) assert(dict.stage?.[stage.name], `${lang}: stage.${stage.name} missing`);
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1k check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1k checks passed');
}
process.exit(failed.length ? 1 : 0);
