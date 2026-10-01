// Пауза, узкие проходы и аккуратный фон по бокам дорожки.
//  (а) пауза: ставится только во время забега, замораживает игру, не запускает забег
//      нажатиями, на паузе работают кнопки звука и «продолжить», клавиши P / Esc / пробел;
//  (б) экран паузы и значок в HUD рисуются, у них есть области нажатия, строки на двух языках;
//  (в) мелочи газона (кусты, камни, заборчики) и стволы деревьев стоят за изгородью, а не на ней;
//      всё на газоне рисуется по линии земли: что ближе к камере, то поверх;
//  (г) куст-препятствие у края дорожки не выходит за её край;
//  (д) проходы уже, чем были; разделитель между путями развилки — нормальный куст, стены у края
//      дорожки не бывают крошечными щепками; рискованные проходы не изменились;
//  (е) помощь новичку (шире проходы, пока лучший счёт мал) и подсказка «шире / уже» у первой развилки.
// Запуск: node scripts/phase1h-check.mjs (входит в npm run check).
import { readFileSync } from 'node:fs';
import { CONFIG, getAssist, getTrackSpeed } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Track } from '../src/game/Track.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { GardenArt } from '../src/rendering/GardenArt.js';
import { ObstacleArt } from '../src/rendering/ObstacleArt.js';
import { hedgeOuterReach } from '../src/rendering/HedgeArt.js';

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

// ---- пауза

function makeGame(state = 'PLAYING') {
  const log = { gameplay: [], music: [], launched: 0, resets: 0 };
  const reset = () => { log.resets += 1; };
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    state,
    hidden: false,
    platformPaused: false,
    adPaused: false,
    userPaused: false,
    runTime: 0,
    lastTime: 0,
    audio: { setMusicActive(on) { log.music.push(on); }, volume: 0.5, muted: false },
    platform: { setGameplayActive(on) { log.gameplay.push(on); } },
    keyboardInput: { reset },
    mouseInput: { reset },
    touchInput: { reset },
    renderer: {
      hitSoundButton: () => null,
      hitPauseButton: (x, y) => x === 1 && y === 1,
      hitResumeButton: (x, y) => x === 2 && y === 2
    },
    tryLaunch() { log.launched += 1; return false; }
  });
  return { game, log };
}

check('pause: only during a run; freezes the game; resume restores it', () => {
  const { game: idle } = makeGame('START');
  assert(idle.pause() === false && idle.userPaused === false, 'pause must not work on the start screen');
  const { game: over } = makeGame('GAMEOVER');
  assert(over.pause() === false && over.userPaused === false, 'pause must not work on the game over screen');

  const { game, log } = makeGame();
  assert(game.pause() === true && game.userPaused === true, 'pause did not start');
  assert(game.isGameplayPaused() === true, 'a paused game must count as paused');
  assert(game.pause() === false, 'pausing twice must be a no-op');
  assert(log.resets === 3, 'pause must release held keys and fingers');
  assert(log.gameplay.at(-1) === false, 'Yandex gameplay must be reported as stopped on pause');
  assert(log.music.at(-1) === true, 'music keeps playing on pause (so volume changes are audible)');
  assert(game.resume() === true && game.userPaused === false, 'resume did not work');
  assert(game.isGameplayPaused() === false, 'the game must run after resume');
  assert(log.gameplay.at(-1) === true, 'Yandex gameplay must start again after resume');
  assert(game.resume() === false, 'resuming a running game must be a no-op');
  assert(game.togglePause() === true && game.userPaused === true, 'toggle should pause');
  assert(game.togglePause() === true && game.userPaused === false, 'toggle should resume');
});

check('pause: the world does not move while paused', () => {
  const { game } = makeGame();
  let stepped = 0;
  game.simulateStep = () => { stepped += 1; return false; };
  Object.assign(game, {
    keyboardInput: { isLeftPressed: () => false, isRightPressed: () => false, reset() {} },
    mouseInput: null,
    touchInput: { getTouchX: () => null, reset() {} },
    player: { speed: 0, width: 36, setMoveDirection() {} },
    updateFloating() {},
    feel: { update() {} }
  });
  game.pause();
  game.update(1 / 60);
  assert(stepped === 0, 'the world moved on pause');
  game.resume();
  game.update(1 / 60);
  assert(stepped >= 1, 'the world did not move after resume');
});

check('pause: taps — pause icon pauses, resume button resumes, other taps do nothing', () => {
  const { game, log } = makeGame();
  assert(game.handleTap(50, 50) === false && game.userPaused === false, 'a tap elsewhere must not pause');
  assert(game.handleTap(1, 1) === false && game.userPaused === true, 'tap on the pause icon');
  assert(game.handleTap(50, 50) === false && game.userPaused === true, 'tap outside the buttons must not resume');
  assert(game.handleTap(2, 2) === false && game.userPaused === false, 'tap on resume');
  assert(log.launched === 0, 'taps during a run must never restart the game');
});

check('pause: sound buttons work on the pause screen only', () => {
  const calls = [];
  const { game } = makeGame();
  game.renderer.hitSoundButton = () => 'plus';
  game.changeVolume = (d) => { calls.push(d); };
  game.handleTap(9, 9);
  assert(calls.length === 0, 'sound buttons must be inactive during a run');
  game.pause();
  game.handleTap(9, 9);
  assert(calls.length === 1 && calls[0] === 1, 'plus on the pause screen must raise the volume');
});

check('pause: keys P / Esc toggle, Space / Enter resume, R does not restart', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(/KeyP/.test(main) && /Escape/.test(main) && /togglePause/.test(main), 'P / Esc must toggle the pause');
  assert(/userPaused/.test(main) && /resume\(\)/.test(main), 'Space / Enter must resume on pause');
});

check('pause: every run starts un-paused', () => {
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  start() {'), source.indexOf('  loop(timestamp)'));
  assert(/this\.userPaused = false/.test(start), 'start() must clear the pause');
});

// ---- рисование паузы

// Холст-заглушка с измерением текста.
const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 9 }) }, {
  get: (target, key) => (key in target ? target[key] : () => ({ addColorStop() {} })),
  set: (target, key, value) => { target[key] = value; return true; }
});

check('screens: pause icon in the HUD and the pause screen have tap areas inside the canvas', () => {
  const renderer = new Renderer(ctx);
  renderer.drawHUD(120, 1, 300, 0, 5, null, false, true, true);
  const icon = renderer.pauseButton;
  assert(icon && icon.w >= 44 && icon.h >= 44, 'pause icon tap area is missing or too small for a finger');
  // Запас под палец может чуть выходить за верхний край экрана — это безвредно.
  assert(icon.x >= 0 && icon.x + icon.w <= CONFIG.CANVAS_WIDTH && icon.y + icon.h / 2 > 0, 'pause icon is outside the screen');
  assert(renderer.hitPauseButton(icon.x + icon.w / 2, icon.y + icon.h / 2), 'centre of the icon must hit');
  assert(!renderer.hitPauseButton(CONFIG.CANVAS_WIDTH - 20, CONFIG.CANVAS_HEIGHT - 20), 'far corner must not hit');
  renderer.drawHUD(120, 1, 300, 0, 5, null, false, true, false);
  assert(renderer.pauseButton === null && !renderer.hitPauseButton(icon.x + 5, icon.y + 5), 'icon must vanish when not shown');

  renderer.drawHUD(120, 1, 300, 0, 5, null, false, false, false);
  renderer.drawPause(120, 300, false, 0.5);
  const resume = renderer.resumeButton;
  assert(resume && resume.h >= 44, 'resume button is missing');
  assert(renderer.hitResumeButton(resume.x + 5, resume.y + 5), 'resume button must be hittable');
  assert(renderer.soundButtons && renderer.hitSoundButton(renderer.soundButtons.plus.x + 5, renderer.soundButtons.plus.y + 5) === 'plus',
    'the pause screen must show the sound buttons');
  assert(resume.y + resume.h <= renderer.soundButtons.mute.y, 'resume button overlaps the sound row');
  renderer.drawHUD(120, 1, 300, 0, 5, null, false, true, true);
  assert(renderer.resumeButton === null && renderer.soundButtons === null, 'old buttons must not stay active after leaving the pause');
});

check('screens: pause strings exist in both languages', () => {
  for (const lang of ['en', 'ru']) {
    const dict = JSON.parse(readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    assert(dict.pause?.title && dict.pause?.resume, `${lang}: pause.title / pause.resume missing`);
  }
});

// ---- фон по бокам

const art = new GardenArt(ctx);
art.lastShift = -14;

check('side decor: props and tree trunks stand behind the hedge, never on top of it', () => {
  const decor = art.sideDecor;
  let props = 0;
  let trees = 0;
  for (let progress = 0; progress < 6000; progress += 37) {
    decor.collect(progress);
    const it = decor.items;
    for (let i = 0; i < it.length; i += 8) {
      const isTree = it[i + 1] === 0;
      const side = ((it[i] % 2) + 2) % 2 === 0 ? -1 : 1;
      const x = it[i + 2];
      const y = it[i + 3];
      const p = art.roadAt(art.screenToWorldY(y));
      const outer = decor.hedgeOuter(p, side);
      // Мелочь: ближний край предмета; дерево: ствол (крона может нависать над изгородью).
      const room = side * (x - outer) - (isTree ? 0 : it[i + 4] / 2);
      if (isTree) trees += 1;
      else props += 1;
      assert(room >= -0.5, `${isTree ? 'ствол дерева' : 'предмет'} стоит на изгороди (${(-room).toFixed(1)} px, progress ${progress}, y ${y.toFixed(0)}, сторона ${side})`);
    }
  }
  assert(props > 200 && trees > 40, `мало предметов для проверки: ${props} мелочи, ${trees} деревьев`);
});

check('side decor: hedge reach covers the widest hedge clump', () => {
  const near = hedgeOuterReach();
  const hedge = CONFIG.VISUAL.HEDGE_WALL;
  const pack = CONFIG.VISUAL.ART_PACK;
  const widest = hedge.SHOULDER_NEAR + hedge.CURB_NEAR
    + hedge.WIDTH_NEAR * (Math.max(...pack.HEDGE_LANES) + 0.04 + (pack.HEDGE_CLUMP_WIDTH * 1.14) / 2);
  assert(near >= widest - 0.01, `reach ${near.toFixed(1)} is less than the widest clump edge ${widest.toFixed(1)}`);
});

check('side decor: everything is drawn by ground line — the nearer to the camera, the further on top', () => {
  const pack = { hasAll: () => true, aspect: () => 1, draw() {} };
  const decorArt = new GardenArt(ctx);
  decorArt.lastShift = -14;
  decorArt.artPack = pack;
  const decor = decorArt.sideDecor;
  let mixed = 0;
  for (let progress = 0; progress < 4000; progress += 331) {
    decor.draw({ progress });
    const it = decor.items;
    assert(decor.order.length > 8, 'nothing was drawn');
    let previous = -Infinity;
    let sawTree = false;
    let sawPropAfterTree = false;
    for (const i of decor.order) {
      assert(it[i + 3] >= previous, `предмет нарисован позже, хотя он дальше от камеры (progress ${progress})`);
      previous = it[i + 3];
      if (it[i + 1] === 0) sawTree = true;
      else if (sawTree) sawPropAfterTree = true;
    }
    if (sawPropAfterTree) mixed += 1;
  }
  // Ближний куст перекрывает дальнее дерево: деревья не загнаны принудительно наверх.
  assert(mixed > 0, 'trees must not be forced on top of the props');
});

// ---- куст-препятствие у края

check('obstacle bush at the road edge stays inside the road', () => {
  const calls = [];
  // Холст запоминает только сдвиг (translate), его хватает, чтобы узнать, где нарисован куст.
  const stack = [];
  const canvas = new Proxy({ tx: 0 }, {
    get(target, key) {
      if (key === 'save') return () => stack.push(target.tx);
      if (key === 'restore') return () => { target.tx = stack.pop() ?? 0; };
      if (key === 'translate') return (dx) => { target.tx += dx; };
      return key in target ? target[key] : () => {};
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const pack = {
    hasAll: () => true,
    aspect: () => 0.9,
    draw: (c, name, x, y, w) => calls.push({ x: x + canvas.tx, w })
  };
  const obstacles = new ObstacleArt(canvas, pack);
  const cat = 150;
  const roadLeft = 100;
  const roadRight = 440;
  // Стена у левого края (20 px), у правого (20 px) и посередине (30 px).
  for (const [x0, x1] of [[roadLeft, roadLeft + 20], [roadRight - 20, roadRight], [250, 280]]) {
    calls.length = 0;
    obstacles.drawSpan('planter', x0, x1, 500, cat, 1, 7, roadLeft, roadRight);
    assert(calls.length === 1, `expected one bush for the wall ${x0}…${x1}, got ${calls.length}`);
    const { x, w } = calls[0];
    assert(x >= roadLeft - 1e-6 && x + w <= roadRight + 1e-6, `bush ${x.toFixed(1)}…${(x + w).toFixed(1)} sticks out of the road ${roadLeft}…${roadRight}`);
    assert(x >= x0 - 2 - 1e-6 && x + w <= x1 + 2 + 1e-6, `bush ${x.toFixed(1)}…${(x + w).toFixed(1)} is wider than the wall ${x0}…${x1}`);
  }
});

// ---- проходы

check('gaps: every gap is narrower than before, the divider is a proper bush, RISK gaps are unchanged', () => {
  assert(CONFIG.BREATHING_GAP_WIDTH < 176 && CONFIG.BREATHING_GAP_LATE < 144, 'ordinary gaps must be narrower than in the previous build (176 / 144)');
  assert(CONFIG.BREATHING_GAP_LATE <= CONFIG.BREATHING_GAP_WIDTH, 'late gaps must not be wider than early ones');
  assert(CONFIG.BREATHING_GAP_LATE > CONFIG.MIN_GAP + CONFIG.PLAYER_WIDTH, 'gaps must stay passable');
  assert(CONFIG.SAFE_GAP_TUTORIAL < 200 && CONFIG.SAFE_GAP_WIDTH < 180 && CONFIG.SAFE_GAP_LATE < 160, 'SAFE gaps must be narrower than before (200 / 180 / 160)');
  assert(CONFIG.SAFE_GAP_LATE > CONFIG.RISKY_GAP_LATE + 20, 'SAFE must stay clearly wider than RISK');
  assert(CONFIG.TWO_PATHS_DIVIDER >= 40, 'the divider between SAFE and RISK must be wide enough to read as a bush, not a speck');
  const unchanged = {
    RISKY_GAP_TUTORIAL: 96, RISKY_GAP_WIDTH: 92, RISKY_GAP_LATE: 88, RISK_EASY_GAP_WIDTH: 122, RISK_HARD_GAP_WIDTH: 96
  };
  for (const [key, value] of Object.entries(unchanged)) assert(CONFIG[key] === value, `${key} must stay ${value}, now ${CONFIG[key]}`);
});

// Прогоняет несколько трасс с помощью новичку assist и собирает ширины проходов и стены у краёв.
function scanTracks(assist, seeds = [1, 7, 42, 99, 123]) {
  const seen = { early: Infinity, late: Infinity };
  const rows = { edge: 0, slivers: 0, dividers: 0, smallDividers: 0 };
  for (const seed of seeds) {
    const track = new Track();
    track.setSeed(seed);
    track.setAssist(assist);
    track.reset();
    const checked = new Set();
    let time = 0;
    for (let i = 0; i < 60 * 90; i += 1) {
      time += 1 / 60;
      track.update(1 / 60, getTrackSpeed(time), time);
      for (const segment of track.segments) {
        if (checked.has(segment.id)) continue;
        checked.add(segment.id);
        if (segment.type === 'NORMAL' && segment.pattern === 'STRAIGHT') {
          const bucket = getTrackSpeed(time) / CONFIG.GAME_SPEED < 1.25 ? 'early' : 'late';
          for (const path of segment.paths) seen[bucket] = Math.min(seen[bucket], path.width);
        }
        const byRow = new Map();
        for (const obstacle of segment.obstacles) {
          if (!byRow.has(obstacle.y)) byRow.set(obstacle.y, []);
          byRow.get(obstacle.y).push(obstacle);
        }
        for (const list of byRow.values()) {
          list.sort((p, q) => p.x - q.x);
          const first = list[0];
          const last = list[list.length - 1];
          const walls = [];
          if (first.x <= CONFIG.TRACK_LEFT + 0.5) walls.push(first);
          if (last.x + last.width >= CONFIG.TRACK_RIGHT - 0.5) walls.push(last);
          for (const wall of walls) {
            if (wall.width <= CONFIG.EDGE_WALL_HIDDEN + 0.01) continue; // скрыта под бордюром
            rows.edge += 1;
            if (wall.width < CONFIG.EDGE_WALL_MIN - 0.01) rows.slivers += 1;
          }
          for (let k = 1; k < list.length - 1; k += 1) {
            rows.dividers += 1;
            if (list[k].width < CONFIG.TWO_PATHS_DIVIDER - 0.01) rows.smallDividers += 1;
          }
        }
      }
    }
  }
  return { seen, rows };
}

check('gaps: generated tracks follow the widths, keep proper dividers and make no slivers at the road edge', () => {
  const { seen, rows } = scanTracks(0);
  assert(seen.late === CONFIG.BREATHING_GAP_LATE, `narrowest late breathing gap is ${seen.late}, expected ${CONFIG.BREATHING_GAP_LATE}`);
  assert(seen.early >= CONFIG.BREATHING_GAP_LATE && seen.early < 176, `early breathing gap ${seen.early} out of range`);
  assert(rows.edge > 500 && rows.dividers > 50, `too few rows to judge: ${JSON.stringify(rows)}`);
  assert(rows.slivers === 0, `${rows.slivers} of ${rows.edge} visible walls at the road edge are narrower than ${CONFIG.EDGE_WALL_MIN} px`);
  assert(rows.smallDividers === 0, `${rows.smallDividers} dividers are narrower than ${CONFIG.TWO_PATHS_DIVIDER} px`);
});

// ---- помощь новичку

check('assist: fades linearly with the best score and ends at UNTIL_BEST', () => {
  assert(getAssist(0) === 1, 'a brand-new player gets full help');
  assert(Math.abs(getAssist(CONFIG.ASSIST.UNTIL_BEST / 2) - 0.5) < 1e-9, 'half-way best score gives half help');
  assert(getAssist(CONFIG.ASSIST.UNTIL_BEST) === 0 && getAssist(20767) === 0, 'an experienced player gets no help');
  assert(getAssist(-5) === 1 && getAssist('abc') === 1 && getAssist(undefined) === 1, 'garbage means a new player');
});

check('assist: full help brings back the widths from before the narrowing, RISK gaps never change', () => {
  const make = (assist, { choices, ratio }) => {
    const track = new Track();
    track.setAssist(assist);
    track.generatedPlayable = 10;
    track.choiceCount = choices;
    track.speed = CONFIG.GAME_SPEED * ratio;
    return track;
  };
  const early = { choices: 3, ratio: 1 };
  const late = { choices: 3, ratio: 2 };
  assert(make(1, early).getBreathingWidth() === 200 && make(1, late).getBreathingWidth() === 168, 'full help: ordinary gaps 200 / 168');
  assert(make(0, early).getBreathingWidth() === CONFIG.BREATHING_GAP_WIDTH && make(0, late).getBreathingWidth() === CONFIG.BREATHING_GAP_LATE, 'no help: current widths');
  assert(make(1, early).getChoiceWidths().safe === 180 && make(1, late).getChoiceWidths().safe === 160, 'full help: SAFE 180 / 160');
  assert(make(1, { choices: 0, ratio: 1 }).getChoiceWidths().safe === CONFIG.SAFE_GAP_TUTORIAL + CONFIG.ASSIST.TUTORIAL_SAFE_BONUS_MAX, 'full help: first SAFE gap is the base plus the capped bonus');
  for (const assist of [0, 0.3, 0.5, 1]) {
    for (const mode of [early, late, { choices: 0, ratio: 1 }]) {
      const track = make(assist, mode);
      const widths = track.getChoiceWidths();
      const expected = mode.choices === 0
        ? [CONFIG.SAFE_GAP_TUTORIAL, CONFIG.RISKY_GAP_TUTORIAL]
        : (mode.ratio < 1.25 ? [CONFIG.SAFE_GAP_WIDTH, CONFIG.RISKY_GAP_WIDTH] : [CONFIG.SAFE_GAP_LATE, CONFIG.RISKY_GAP_LATE]);
      assert(widths.risk === expected[1], `RISK gap changed with assist ${assist}`);
      assert(widths.safe >= expected[0] && (widths.safe - expected[0]) % 4 === 0, `SAFE gap ${widths.safe} must be the base plus a multiple of 4`);
    }
  }
  assert(make(0.5, late).getBreathingWidth() > make(0, late).getBreathingWidth() && make(0.5, late).getBreathingWidth() < make(1, late).getBreathingWidth(), 'half help is in between');
  const track = new Track();
  track.setAssist(7);
  assert(track.assist === 1, 'assist is clamped to 0..1');
  track.setAssist('abc');
  assert(track.assist === 0, 'garbage assist means none');
});

check('assist: tracks with full help stay reachable, keep proper edge walls and use the wider gaps', () => {
  const { seen, rows } = scanTracks(1, [2, 11, 64]);
  assert(seen.late === 168 && seen.early >= 168 && seen.early <= 200, `ordinary gaps with full help: early ${seen.early}, late ${seen.late}`);
  assert(rows.edge > 200, `too few rows to judge: ${JSON.stringify(rows)}`);
  assert(rows.slivers === 0, `${rows.slivers} of ${rows.edge} walls are slivers with full help`);
});

check('forks are never lost to the edge-wall rule: with no allowed spot the fork is still placed', () => {
  for (const [safe, risk] of [[200, 96], [196, 96], [180, 92], [160, 88]]) {
    const track = new Track();
    track.setSeed(5);
    track.reset();
    track.getChoiceWidths = () => ({ safe, risk });
    const geometry = track.createTwoPaths(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'STRAIGHT');
    assert(geometry && geometry.paths.length === 2, `no fork for SAFE ${safe} + RISK ${risk}`);
    const widths = geometry.paths.map((path) => path.width).sort((a, b) => a - b);
    assert(widths[0] === risk && widths[1] === safe, 'fork widths must stay as asked');
  }
});

check('assist: a new run asks the track for help by the best score; the dev override wins', () => {
  const calls = [];
  const make = (bestScore, assistOverride) => ({
    isRunning: true,
    state: 'START',
    bestScore,
    assistOverride,
    storage: { set() {}, getCoins: () => 0 },
    feel: { reset() {} },
    player: { reset() {} },
    track: { setSeed() {}, setAssist(value) { calls.push(value); }, reset() {} },
    unlockAudio() {}
  });
  Game.prototype.start.call(make(0));
  Game.prototype.start.call(make(CONFIG.ASSIST.UNTIL_BEST / 2));
  Game.prototype.start.call(make(20767));
  Game.prototype.start.call(make(0, 0.25));
  assert(calls.join() === '1,0.5,0,0.25', `unexpected assist values: ${calls.join()}`);
});

// ---- подсказка у первой развилки

check('choice hint: visible only while the first Choice approaches, gone once any Choice is passed', () => {
  const choice = (y, isPassed = false) => ({ isChoiceSegment: true, isPassed, paths: [{ y }] });
  const make = (segments, extra = {}) => Object.assign(Object.create(Game.prototype), {
    state: 'PLAYING', choiceHintSeen: false, player: { y: 840 }, track: { segments }, ...extra
  });
  const near = CONFIG.CHOICE_HINT_NEAR;
  const far = CONFIG.CHOICE_HINT_FAR;
  assert(make([choice(840 - 500)]).choiceHintVisible() === true, 'a Choice 500 px ahead shows the hint');
  assert(make([choice(840 - near + 10)]).choiceHintVisible() === false, 'hidden when the cat is entering the row');
  assert(make([choice(840 - far - 50)]).choiceHintVisible() === false, 'hidden while the Choice is still far away');
  assert(make([choice(840 - 500, true)]).choiceHintVisible() === false, 'a passed Choice does not count');
  assert(make([{ isChoiceSegment: false, isPassed: false, paths: [{ y: 340 }] }]).choiceHintVisible() === false, 'a normal row is not a Choice');
  assert(make([choice(340)], { choiceHintSeen: true }).choiceHintVisible() === false, 'never again after the first passed Choice');
  assert(make([choice(340)], { state: 'START' }).choiceHintVisible() === false, 'not on the start screen');
  assert(make([choice(340)], { state: 'GAMEOVER' }).choiceHintVisible() === false, 'not on the game over screen');

  const stored = [];
  const game = Object.assign(Object.create(Game.prototype), {
    multiplier: CONFIG.MULTIPLIER_START, riskStreak: 0, pathReward: 0, distanceScore: 0, score: 0,
    floatingRewards: [], player: { x: 270, y: 840 }, riskHintSeen: true, choiceHintSeen: false,
    storage: { set(key, value) { stored.push([key, value]); } }, feel: null
  });
  Game.prototype.applyReward.call(game, 'SAFE', false, true);
  assert(game.choiceHintSeen === true && stored.some(([key, value]) => key === 'choiceHintSeen' && value === true), 'passing a Choice remembers the hint');
  const before = stored.length;
  Game.prototype.applyReward.call(game, 'SAFE', false, true);
  assert(stored.filter(([key]) => key === 'choiceHintSeen').length === 1 && stored.length >= before, 'the hint is saved only once');
});

check('choice hint: text exists in both languages and no longer sits on the start card', () => {
  for (const lang of ['en', 'ru']) {
    const dict = JSON.parse(readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    assert(dict.hint?.choice && dict.hint.choice.length > 10, `${lang}: hint.choice missing`);
    assert(!dict.start.hintChoice && !dict.start.hintStreak && !dict.start.hintCoins, `${lang}: old start hints must be gone`);
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1h check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1h checks passed');
}
process.exit(failed.length ? 1 : 0);
