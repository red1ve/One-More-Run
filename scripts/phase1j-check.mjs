// Ощущение игры: «чуть не задел», вибрация, звук серии.
//  (а) Track.checkGraze: зазор 0…8 px — касание, 0 — столкновение, больше 8 — нет; один раз на стену;
//      стены под бордюром у края и неуязвимость не считаются;
//  (б) Game.applyGraze: лесенка бонуса 10 → 30, окно серии, очки, всплывающая надпись, отклик;
//  (в) звук: тон серии идёт по пентатонике, не выше предела; тики и монеты поднимаются;
//  (г) вибрация: только если есть, разрешена и не чаще порога; ошибки не ломают игру.
// Запуск: node scripts/phase1j-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { GameFeel } from '../src/game/GameFeel.js';
import { Track } from '../src/game/Track.js';
import { AudioService, scaleRatio } from '../src/services/AudioService.js';
import { HapticsService } from '../src/services/HapticsService.js';

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

// ---- (а) «чуть не задел»

const PLAYER = { x: 270, y: 840, width: 36, height: 36 };

function trackWith(obstacles) {
  const track = new Track();
  track.segments = [{ obstacles, paths: [], coins: [] }];
  return track;
}

// Стена шириной 60 справа от кота на нужном зазоре gap (от правого края хитбокса кота).
const wallRight = (gap, y = 820, height = 64) => ({ x: PLAYER.x + PLAYER.width / 2 + gap, y, width: 60, height });
const wallLeft = (gap, y = 820, height = 64) => ({ x: PLAYER.x - PLAYER.width / 2 - gap - 60, y, width: 60, height });

check('graze: a gap of 0 < gap <= 8 px is a close call; touching (a crash) and 9+ px are not', () => {
  for (const gap of [0.5, 4, 8]) {
    const found = trackWith([wallRight(gap)]).checkGraze(PLAYER);
    assert(found.length === 1, `gap ${gap}: expected a close call, got ${found.length}`);
  }
  for (const gap of [0, -3, 8.5, 9, 30]) {
    const found = trackWith([wallRight(gap)]).checkGraze(PLAYER);
    assert(found.length === 0, `gap ${gap}: must not count`);
  }
  assert(CONFIG.GRAZE.PX === 8, 'the close-call distance is 8 px');
});

check('graze: works on both sides, reports the side and the contact point', () => {
  const right = trackWith([wallRight(5)]).checkGraze(PLAYER)[0];
  const left = trackWith([wallLeft(5)]).checkGraze(PLAYER)[0];
  assert(right.side === 1 && left.side === -1, 'sides');
  assert(right.x === PLAYER.x + PLAYER.width / 2 + 5, 'the contact point is the near edge of the wall (right)');
  assert(left.x === PLAYER.x - PLAYER.width / 2 - 5, 'the contact point is the near edge of the wall (left)');
  assert(right.y === PLAYER.y, 'at the height of the cat');
  assert(trackWith([wallLeft(3), wallRight(4, 810, 80)]).checkGraze(PLAYER).length === 2, 'squeezing between two walls counts both');
});

check('graze: the cat must be inside the row vertically, and every wall counts only once', () => {
  const rowAbove = trackWith([wallRight(4, 600, 64)]); // ряд далеко впереди
  assert(rowAbove.checkGraze(PLAYER).length === 0, 'a row that has not reached the cat');
  const rowBehind = trackWith([wallRight(4, 1000, 64)]); // ряд уже позади
  assert(rowBehind.checkGraze(PLAYER).length === 0, 'a row already behind');
  const track = trackWith([wallRight(4)]);
  assert(track.checkGraze(PLAYER).length === 1, 'first frame in the row');
  assert(track.checkGraze(PLAYER).length === 0 && track.checkGraze({ ...PLAYER, x: PLAYER.x - 2 }).length === 0, 'the same wall never counts twice');
  assert(track.segments[0].obstacles[0].grazed === true, 'the wall is marked');
});

check('graze: walls hidden under the curb at the road edge do not count, visible edge walls do', () => {
  const hiddenEdge = { x: CONFIG.TRACK_LEFT, y: 820, width: CONFIG.EDGE_WALL_HIDDEN - 4, height: 64 };
  const player = { ...PLAYER, x: CONFIG.TRACK_LEFT + hiddenEdge.width + 18 + 4 };
  assert(trackWith([hiddenEdge]).checkGraze(player).length === 0, 'a hidden edge wall is invisible, so no bonus');
  const visibleEdge = { x: CONFIG.TRACK_LEFT, y: 820, width: CONFIG.EDGE_WALL_MIN, height: 64 };
  const near = { ...PLAYER, x: CONFIG.TRACK_LEFT + visibleEdge.width + 18 + 4 };
  assert(trackWith([visibleEdge]).checkGraze(near).length === 1, 'a visible edge wall counts');
  const middleThin = { x: 250, y: 820, width: 10, height: 64 };
  assert(trackWith([middleThin]).checkGraze({ ...PLAYER, x: 250 + 10 + 18 + 3 }).length === 1, 'a thin wall in the middle counts (only edge walls are skipped)');
});

check('graze: on a real track the wall that was grazed is never overlapped by the cat', () => {
  const track = new Track();
  track.setSeed(7);
  track.reset();
  let grazes = 0;
  for (let step = 0; step < 60 * 40; step += 1) {
    track.update(1 / 60, 450, step / 60);
    for (let x = 90; x <= 450; x += 12) {
      const player = { x, y: CONFIG.PLAYER_START_Y, width: CONFIG.PLAYER_WIDTH, height: CONFIG.PLAYER_HEIGHT };
      const already = new Set();
      for (const segment of track.segments) for (const obs of segment.obstacles) if (obs.grazed) already.add(obs);
      const found = track.checkGraze(player);
      grazes += found.length;
      for (const segment of track.segments) {
        for (const obs of segment.obstacles) {
          if (!obs.grazed || already.has(obs)) continue;
          const overlap = player.x - player.width / 2 < obs.x + obs.width && player.x + player.width / 2 > obs.x
            && player.y - player.height / 2 < obs.y + obs.height && player.y + player.height / 2 > obs.y;
          assert(!overlap, 'a close call must be a miss, not a hit');
        }
      }
    }
  }
  assert(grazes > 20, `too few close calls on a real track to judge: ${grazes}`);
});

// ---- (б) бонус и отклик

function makeGame(over = {}) {
  const calls = { feel: [] };
  const game = Object.assign(Object.create(Game.prototype), {
    runTime: 10, lastGrazeAt: -Infinity, grazeCombo: 0, pathReward: 0, distanceScore: 100, score: 100,
    floatingRewards: [], player: { x: 270, y: 840 },
    feel: { onGraze(data) { calls.feel.push(data); } },
    ...over
  });
  return { game, calls };
}

check('graze bonus: 10, then +5 for every close call within the window, at most 30; the window resets the ladder', () => {
  const { game, calls } = makeGame();
  const bonuses = [];
  for (let i = 0; i < 7; i += 1) {
    bonuses.push(game.applyGraze({ x: 290, y: 840, side: 1 }));
    game.runTime += 1; // секунда между касаниями: внутри окна серии
  }
  assert(bonuses.join() === '10,15,20,25,30,30,30', `ladder ${bonuses}`);
  assert(game.pathReward === 160 && game.score === 260, 'the bonus goes into the score at once');
  assert(calls.feel.map((item) => item.combo).join() === '1,2,3,4,5,6,7', 'the feedback gets the combo number');
  game.runTime += CONFIG.GRAZE.COMBO_WINDOW + 0.1;
  assert(game.applyGraze({ x: 290, y: 840, side: 1 }) === 10 && game.grazeCombo === 1, 'a pause longer than the window starts again at 10');
});

check('graze bonus: shown as a floating label with the combo, stays small next to a RISK reward', () => {
  const { game } = makeGame();
  game.applyGraze({ x: 290, y: 840, side: 1 });
  game.runTime += 1;
  game.applyGraze({ x: 290, y: 840, side: 1 });
  const [first, second] = game.floatingRewards;
  assert(first.type === 'GRAZE' && first.value === 10 && second.value === 15, 'label values');
  assert(first.subtitle === 'CLOSE CALL' && second.subtitle === 'CLOSE CALL x2', `subtitles: ${first.subtitle} / ${second.subtitle}`);
  assert(CONFIG.GRAZE.BONUS_MAX < CONFIG.REWARDS.RISKY / 2, 'a close call must stay far below a RISK reward');
  assert(CONFIG.GRAZE.BONUS <= CONFIG.GRAZE.BONUS_MAX && CONFIG.GRAZE.COMBO_STEP > 0, 'sane settings');
});

check('graze in a run: counted while playing, not while invulnerable, reset by a new run', () => {
  const grazes = [];
  const base = {
    player: new (class { constructor() { Object.assign(this, { x: 270, y: 840, width: 36, height: 36, speed: 0, update() {}, reset() {} }); } })(),
    track: {
      update() {}, checkPassed: () => ({ rewardType: null }), collectCoins: () => 0, checkCollision: () => false,
      checkGraze: () => [{ x: 288, y: 840, side: 1 }]
    },
    camera: null, runTime: 0, currentSpeed: 300, distanceScore: 0, pathReward: 0, score: 0,
    invulnerableTime: 0, floatingRewards: [], feel: { onGraze() {} }
  };
  const run = (extra) => {
    const game = Object.assign(Object.create(Game.prototype), { ...base, ...extra });
    game.applyGraze = (graze) => grazes.push(graze);
    game.simulateStep(1 / 60);
  };
  run({});
  assert(grazes.length === 1, 'a close call during a normal step is counted');
  run({ invulnerableTime: 1.5 });
  assert(grazes.length === 1, 'no bonus while the cat is invulnerable');
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  start() {'), source.indexOf('  loop(timestamp)'));
  assert(/this\.grazeCombo = 0/.test(start) && /this\.lastGrazeAt = -Infinity/.test(start), 'start() must reset the combo');
});

// ---- (в) звук серии

check('sound: the pitch climbs the pentatonic scale with the step and stops at the last note', () => {
  assert(scaleRatio(0) === 1 && scaleRatio(undefined) === 1 && scaleRatio('x') === 1 && scaleRatio(-4) === 1, 'no step means no change');
  let previous = 1;
  for (let step = 1; step < CONFIG.FEEL.SCALE_SEMITONES.length; step += 1) {
    assert(scaleRatio(step) > previous, `step ${step} must be higher`);
    previous = scaleRatio(step);
  }
  const top = scaleRatio(CONFIG.FEEL.SCALE_SEMITONES.length - 1);
  assert(scaleRatio(99) === top && Math.abs(top - 2 ** (16 / 12)) < 1e-9, 'the top of the scale');
  assert(Math.abs(scaleRatio(5) - 2) < 1e-9, 'the sixth note is an octave up');
  const pentatonic = new Set([0, 2, 4, 7, 9]);
  assert(CONFIG.FEEL.SCALE_SEMITONES.every((semitones) => pentatonic.has(semitones % 12)), 'every note is in the C pentatonic like the music');
});

function fakeAudio() {
  const frequencies = [];
  const audio = new AudioService();
  audio.ctx = {
    state: 'running',
    currentTime: 100,
    destination: {},
    createOscillator: () => ({ type: '', frequency: { setValueAtTime: (value) => frequencies.push(value) }, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} })
  };
  audio.unlocked = true;
  return { audio, frequencies, advance: (seconds) => { audio.ctx.currentTime += seconds; } };
}

check('sound: risk, close-call and coin tones rise with the step; without a step they keep their base pitch', () => {
  for (const [name, base] of [['risk', 523.25], ['graze', 1046.5], ['coin', 980]]) {
    const { audio, frequencies, advance } = fakeAudio();
    assert(audio.play(name) === true && Math.abs(frequencies.at(-1) - base) < 1e-6, `${name}: base pitch ${frequencies.at(-1)}`);
    advance(1);
    audio.play(name, { step: 3 });
    advance(1);
    audio.play(name, { step: 99 });
    assert(frequencies.at(-2) > base && frequencies.at(-1) > frequencies.at(-2), `${name}: the pitch must rise`);
    assert(Math.abs(frequencies.at(-1) - base * scaleRatio(99)) < 1e-6, `${name}: it must stop at the top of the scale`);
  }
});

check('feel: the streak and the coin chain are heard; a muted game stays silent', () => {
  const played = [];
  const audio = { play: (name, options) => { played.push([name, options?.step ?? 0]); } };
  const feel = new GameFeel(audio, null);
  feel.onRisk({ x: 270, y: 840, streak: 1, multiplier: 1, stepped: false, hitMax: false });
  feel.onRisk({ x: 270, y: 840, streak: 3, multiplier: 1, stepped: false, hitMax: false });
  assert(played[0][0] === 'risk' && played[0][1] === 0 && played[1][1] === 2, `risk steps ${JSON.stringify(played)}`);
  played.length = 0;
  feel.onRisk({ x: 270, y: 840, streak: 2, multiplier: 1.5, stepped: true, hitMax: false });
  assert(played.length === 1 && played[0][0] === 'streak', 'a multiplier step keeps its own sound');
  played.length = 0;
  for (let i = 0; i < 4; i += 1) {
    feel.onCoin(270, 840);
    feel.update(0.3);
  }
  assert(played.map((item) => item[1]).join() === '0,1,2,3', `coin chain ${JSON.stringify(played)}`);
  feel.update(CONFIG.FEEL.COIN_CHAIN_WINDOW + 0.5);
  played.length = 0;
  feel.onCoin(270, 840);
  assert(played[0][1] === 0, 'a pause breaks the coin chain');
  const quiet = new AudioService();
  quiet.setMuted(true);
  assert(quiet.play('risk', { step: 2 }) === false && quiet.play('graze', { step: 1 }) === false, 'muted: no sound');
  const graze = [];
  new GameFeel({ play: (name, options) => graze.push([name, options.step]) }, null).onGraze({ x: 290, y: 840, side: 1, combo: 3 });
  assert(graze[0][0] === 'graze' && graze[0][1] === 2, 'a close call plays its tick on the combo step');
});

// ---- (г) вибрация

check('haptics: only where supported and allowed, never faster than the limit, errors are swallowed', () => {
  const buzz = [];
  let time = 1000;
  const make = (nav, isEnabled = () => true) => new HapticsService({ navigator: nav, isEnabled, now: () => time });
  const nav = { vibrate: (pattern) => { buzz.push(pattern); return true; } };
  const haptics = make(nav);
  assert(haptics.supported() === true && haptics.pulse('risk') === true && buzz.length === 1, 'a normal pulse');
  assert(buzz[0] === CONFIG.FEEL.HAPTIC_PATTERNS.risk, 'the pattern from the settings is used');
  assert(haptics.pulse('graze') === false && buzz.length === 1, 'too soon after the previous pulse');
  time += CONFIG.FEEL.HAPTIC_MIN_GAP_MS;
  assert(haptics.pulse('graze') === true && buzz.length === 2, 'after the minimum gap it works again');
  time += 1000;
  assert(haptics.pulse('nope') === false, 'an unknown event does nothing');
  assert(make({}).pulse('risk') === false && make(null).pulse('risk') === false && make(null).supported() === false, 'no vibration support: nothing happens');
  time += 1000;
  assert(make(nav, () => false).pulse('over') === false, 'forbidden by the game (sound is off)');
  assert(make({ vibrate() { throw new Error('blocked'); } }).pulse('risk') === false, 'a throwing browser is harmless');
  assert(make({ vibrate: () => false }).pulse('risk') === false, 'a refused vibration reports false');
  assert(haptics.stop() === true && buzz.at(-1) === 0, 'stop cancels the vibration');
  assert(make({}).stop() === false && make({ vibrate() { throw new Error('x'); } }).stop() === false, 'stop is safe too');
});

check('haptics: every game event has a short pattern, and the game ties vibration to sound', () => {
  const patterns = CONFIG.FEEL.HAPTIC_PATTERNS;
  for (const name of ['graze', 'risk', 'streak', 'max', 'lost', 'best', 'over']) {
    assert(patterns[name] !== undefined, `pattern for ${name} is missing`);
    const total = [].concat(patterns[name]).reduce((sum, value) => sum + value, 0);
    assert(total <= 300, `${name} vibrates for ${total} ms: too long`);
  }
  const pulses = [];
  const feel = new GameFeel(null, { pulse: (name) => { pulses.push(name); } });
  feel.onRisk({ x: 1, y: 1, streak: 1, multiplier: 1, stepped: false, hitMax: false });
  feel.onRisk({ x: 1, y: 1, streak: 2, multiplier: 1.5, stepped: true, hitMax: false });
  feel.onRisk({ x: 1, y: 1, streak: 9, multiplier: 5, stepped: false, hitMax: true });
  feel.onGraze({ x: 1, y: 1, side: 1, combo: 1 });
  feel.onStreakLost(1, 1);
  feel.onNewBest(1, 1);
  feel.onGameOver(1, 1);
  assert(pulses.join() === 'risk,streak,max,graze,lost,best,over', `pulses ${pulses}`);
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  assert(/isEnabled: \(\) => !this\.audio\.muted/.test(source), 'vibration must follow the mute switch');
  assert(/this\.haptics\?\.stop\(\)/.test(source), 'a pause must stop the vibration');
  const none = new GameFeel(null, null);
  none.onGraze({ x: 1, y: 1 });
  none.onGameOver(1, 1);
});

check('strings: the close-call texts exist in both languages', () => {
  for (const lang of ['en', 'ru']) {
    const dict = JSON.parse(readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    assert(dict.float?.graze && dict.float?.grazeCombo?.includes('{n}'), `${lang}: float.graze / float.grazeCombo missing`);
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1j check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1j checks passed');
}
process.exit(failed.length ? 1 : 0);
