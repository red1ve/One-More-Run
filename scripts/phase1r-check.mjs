// Фаза 1р: управление пальцем и мышью, одна монета.
//  (а) кот едет к пальцу с обычной скоростью и не проскакивает его при любой частоте кадров;
//  (б) дрожь пальца меньше порога его не двигает; кот встаёт точно под палец;
//  (в) границы, клавиатура и наклон кота;
//  (г) игра: палец и мышь доходят до кота, клавиатура главнее;
//  (д) монета: одна картинка на всю игру, достаточно чёткая, без случайных вариантов;
//  (е) невидимые стены у края: ни одна стена не задевает кота, если из-под бордюра торчит меньше 3 px.
//  (ж) темп (2026-10-09): скорость трассы и кота, развилки не чаще прежнего, время суток по 12 секунд.
//  (з) шлифовка, фаза 1 (2026-10-19): экран проигрыша — ближайший скин и полоска накопления.
//  (и) шлифовка, фаза 1: монеты чаще (вдвое), ближе к стенам, иногда парами; цены скинов выросли вместе с ними.
//  (к) шлифовка, фаза 1: ограниченный скин «Хэллоуин» — 14 дней с первого запуска, облако, магазин на девять ячеек.
//  (л) шлифовка, фаза 1: чёткость на телефонах — масштаб холста 1 / 1.5 / 2, слабому телефону он снижается.
//  (м) шлифовка: «В МЕНЮ» на экране паузы — два нажатия, забег завершается тихо, как обычный проигрыш.
// Запуск: node scripts/phase1r-check.mjs (входит в npm run check).
import fs from 'node:fs';
import { CONFIG, getPlayerSpeed, getTrackSpeed } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Player } from '../src/game/Player.js';
import { playableXBounds } from '../src/game/Corridor.js';
import { Track } from '../src/game/Track.js';
import { VariationDirector } from '../src/game/VariationDirector.js';
import { Shop } from '../src/game/Shop.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { StorageService } from '../src/services/StorageService.js';
import { HAT_GEOMETRY, hatClipPath, hatCrownPolygon, hatCutArc, hatVisiblePolygon, readPaths, sitSvg, skinSvg } from '../src/rendering/SkinArt.js';
import { MouseInput } from '../src/input/MouseInput.js';
import { TouchInput } from '../src/input/TouchInput.js';
import { ArtPack } from '../src/rendering/ArtPack.js';
import { FrameGovernor, lowerScale, pickRenderScale } from '../src/rendering/RenderScale.js';
import { SkyArt } from '../src/rendering/SkyArt.js';
import { t } from '../src/localization/i18n.js';
import { GardenArt } from '../src/rendering/GardenArt.js';
import { PACK_GARDEN_SHEETS } from '../src/rendering/gardenAssets.js';

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

const { START_PX, STOP_PX } = CONFIG.STEER;
const FPS_LIST = [20, 30, 45, 60, 90, 120, 144, 240];

function makeCat(x) {
  const cat = new Player();
  cat.x = x;
  return cat;
}

await check('steering settings stay in a sensible range', () => {
  // Меньше 1.5 px дрожь пальца двигала бы кота; больше 5 px кот вставал бы заметно в стороне от пальца.
  assert(START_PX >= 1.5 && START_PX <= 5, `START_PX ${START_PX}`);
  assert(STOP_PX > 0 && STOP_PX <= 1, `STOP_PX ${STOP_PX}`);
  assert(STOP_PX < START_PX, 'it must stop closer than the distance at which it starts');
  assert(CONFIG.STEER.LEAN_SMOOTH >= 8 && CONFIG.STEER.LEAN_SMOOTH <= 30, `LEAN_SMOOTH ${CONFIG.STEER.LEAN_SMOOTH}`);
});

// ---------------------------------------------------------------- (а) скорость и «не проскочить»

await check('the cat drives to the finger at its normal speed', () => {
  const cat = makeCat(120);
  cat.steerTo(420);
  cat.update(0.1);
  assert(Math.abs(cat.x - (120 + cat.speed * 0.1)) < 1e-9, `moved ${cat.x - 120}, expected ${cat.speed * 0.1}`);
  const left = makeCat(420);
  left.steerTo(120);
  left.update(0.1);
  assert(Math.abs(left.x - (420 - left.speed * 0.1)) < 1e-9);
});

await check('the cat never goes faster than the keyboard speed in one step', () => {
  for (const fps of FPS_LIST) {
    const dt = 1 / fps;
    const cat = makeCat(100);
    cat.steerTo(440);
    let last = cat.x;
    for (let i = 0; i < fps * 2; i += 1) {
      cat.update(dt);
      assert(Math.abs(cat.x - last) <= cat.speed * dt + 1e-9, `step too long at ${fps} fps`);
      last = cat.x;
    }
  }
});

await check('the cat stops exactly under the finger and never overshoots it, at any frame rate', () => {
  for (const fps of FPS_LIST) {
    const dt = 1 / fps;
    for (const [from, to] of [[100, 300], [440, 120], [270, 285], [270, 255], [150, 151.2]]) {
      const cat = makeCat(from);
      cat.steerTo(to);
      const sign = Math.sign(to - from);
      for (let i = 0; i < fps * 2; i += 1) {
        cat.update(dt);
        assert((to - cat.x) * sign >= -1e-9, `overshoot ${from} -> ${to} at ${fps} fps (x ${cat.x})`);
      }
      assert(Math.abs(cat.x - to) <= STOP_PX || Math.abs(to - from) <= START_PX, `not under the finger ${from} -> ${to} at ${fps} fps (x ${cat.x})`);
    }
  }
});

await check('the cat keeps its normal speed far from the finger, then stops without wobble', () => {
  const dt = 1 / 60;
  const cat = makeCat(100);
  cat.steerTo(400);
  const moves = [];
  let last = cat.x;
  for (let i = 0; i < 120; i += 1) {
    cat.update(dt);
    moves.push(cat.x - last);
    last = cat.x;
  }
  assert(Math.abs(moves[0] - cat.speed * dt) < 1e-9 && Math.abs(moves[30] - cat.speed * dt) < 1e-9, 'a constant speed while far');
  assert(moves.every((step) => step >= -1e-9), 'it never moves back');
  assert(moves.slice(-30).every((step) => step === 0), 'it stands still once it has arrived');
});

// ---------------------------------------------------------------- (б) дрожь пальца

// Простой повторяемый «шум» без Math.random.
function makeNoise(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state / 4294967296) * 2 - 1;
  };
}

await check('finger shake smaller than the start threshold does not move the cat', () => {
  for (const fps of [30, 60, 120]) {
    const noise = makeNoise(7 + fps);
    const cat = makeCat(150);
    cat.steerTo(300);
    for (let i = 0; i < fps * 2; i += 1) cat.update(1 / fps);
    const parked = cat.x;
    let moved = 0;
    for (let i = 0; i < fps * 5; i += 1) {
      cat.steerTo(300 + noise() * (START_PX - 0.4));
      const before = cat.x;
      cat.update(1 / fps);
      moved += Math.abs(cat.x - before);
    }
    assert(moved === 0, `the cat moved ${moved.toFixed(2)} px at ${fps} fps`);
    assert(cat.x === parked);
    assert(Math.abs(cat.lean) < 0.01, 'no lean while standing');
  }
});

await check('the old dead zone of 10 px is gone: the cat parks within the stop distance, not 3-10 px short', () => {
  let worst = 0;
  for (let start = 100; start < 440; start += 7) {
    if (Math.abs(start - 290) <= START_PX) continue; // ближе порога кот стоит на месте: это дрожь, а не движение
    for (const fps of [30, 60]) {
      const cat = makeCat(start);
      cat.steerTo(290);
      for (let i = 0; i < fps * 2; i += 1) cat.update(1 / fps);
      worst = Math.max(worst, Math.abs(cat.x - 290));
    }
  }
  assert(worst <= STOP_PX + 1e-9, `parked ${worst.toFixed(2)} px away`);
});

await check('a real move of the finger is followed (slow drag, no steps of a dead zone)', () => {
  const cat = makeCat(200);
  let finger = 200;
  let lag = 0;
  for (let i = 0; i < 180; i += 1) {
    finger += 1.2; // ~72 px/s
    cat.steerTo(finger);
    cat.update(1 / 60);
    lag = Math.max(lag, Math.abs(finger - cat.x));
  }
  assert(lag <= START_PX + 1.5, `the cat lagged ${lag.toFixed(2)} px behind a slow drag`);
});

await check('the finger is lifted: the cat stands still', () => {
  const cat = makeCat(200);
  cat.steerTo(400);
  cat.update(0.05);
  cat.steerTo(null);
  const x = cat.x;
  for (let i = 0; i < 30; i += 1) cat.update(1 / 60);
  assert(cat.x === x);
  assert(cat.following === false);
});

// ---------------------------------------------------------------- (в) границы, клавиатура, наклон

await check('the walls stop the cat and it does not lean on them', () => {
  const cat = makeCat(300);
  cat.steerTo(900); // палец далеко за дорожкой
  const maxX = CONFIG.TRACK_RIGHT - cat.width / 2;
  for (let i = 0; i < 120; i += 1) cat.update(1 / 60);
  assert(cat.x === maxX, `x ${cat.x}`);
  assert(Math.abs(cat.lean) < 0.05, `leans ${cat.lean.toFixed(3)} on the wall`);
  cat.steerTo(-300);
  const minX = CONFIG.TRACK_LEFT + cat.width / 2;
  for (let i = 0; i < 240; i += 1) cat.update(1 / 60);
  assert(cat.x === minX);
  assert(Math.abs(cat.lean) < 0.05);
});

await check('the keyboard beats the finger and keeps its old behaviour', () => {
  const cat = makeCat(270);
  cat.steerTo(450);
  cat.setMoveDirection(-1);
  cat.update(0.1);
  assert(Math.abs(cat.x - (270 - cat.speed * 0.1)) < 1e-9, 'the keyboard decides');
  cat.setMoveDirection(0);
  cat.update(0.1);
  assert(cat.x > 270 - cat.speed * 0.1, 'after the key is released the finger drives again');
  const key = makeCat(270);
  key.setMoveDirection(1);
  for (let i = 0; i < 300; i += 1) key.update(1 / 60);
  assert(key.x === CONFIG.TRACK_RIGHT - key.width / 2);
});

await check('the lean follows the real movement and changes smoothly', () => {
  const dt = 1 / 60;
  const cat = makeCat(150);
  cat.steerTo(430);
  let previous = cat.lean;
  let biggestJump = 0;
  for (let i = 0; i < 30; i += 1) {
    cat.update(dt);
    biggestJump = Math.max(biggestJump, Math.abs(cat.lean - previous));
    previous = cat.lean;
  }
  assert(cat.lean > 0.8, `leans right while running right (${cat.lean.toFixed(2)})`);
  cat.steerTo(200);
  for (let i = 0; i < 20; i += 1) {
    cat.update(dt);
    biggestJump = Math.max(biggestJump, Math.abs(cat.lean - previous));
    previous = cat.lean;
  }
  assert(cat.lean < -0.8, `leans left while running left (${cat.lean.toFixed(2)})`);
  // Раньше наклон переключался мгновенно (скачок 2.0 при смене направления), теперь не больше трети этого.
  assert(biggestJump < 0.6, `the lean jumps by ${biggestJump.toFixed(2)} in one frame`);
});

await check('reset puts the cat back in the middle with no leftover target or lean', () => {
  const cat = makeCat(100);
  cat.steerTo(400);
  cat.update(0.1);
  cat.reset();
  assert(cat.x === CONFIG.CANVAS_WIDTH / 2 && cat.target === null && cat.following === false && cat.lean === 0);
});

// ---------------------------------------------------------------- (г) игра

function makeGame({ fingerX = null, mouseX = null, left = false, right = false } = {}) {
  const player = new Player();
  const farRow = [{ x: CONFIG.TRACK_LEFT, y: -5000, width: CONFIG.TRACK_WIDTH, height: 10 }];
  return {
    state: 'PLAYING', runTime: 5, currentSpeed: 0, distanceScore: 0, pathReward: 0, score: 0,
    player, camera: null, feel: { update() {} }, floatingRewards: [],
    track: {
      segments: [{ obstacles: farRow }],
      update() {},
      checkPassed: () => ({}), collectCoins: () => 0, checkCollision: () => false
    },
    keyboardInput: { isLeftPressed: () => left, isRightPressed: () => right },
    mouseInput: mouseX === null ? null : { getTargetX: () => mouseX },
    touchInput: { getTouchX: () => fingerX },
    isGameplayPaused: () => false,
    applyReward() {}, applyCoinPickup() {}, updateFloating() {},
    simulateStep: Game.prototype.simulateStep, crashed: false,
    gameOver() { this.crashed = true; this.state = 'GAMEOVER'; }
  };
}

function runGame(game, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) Game.prototype.update.call(game, dt);
}

await check('game: a finger on the screen drives the cat to it and holds it there', () => {
  for (const [from, to] of [[270, 420], [270, 120], [400, 400]]) {
    const game = makeGame({ fingerX: to });
    game.player.x = from;
    runGame(game, 1.5);
    assert(Math.abs(game.player.x - to) <= STOP_PX, `from ${from} to ${to}: x ${game.player.x}`);
  }
});

await check('game: the mouse works like the finger, and the finger is used when the mouse is not pressed', () => {
  const game = makeGame({ mouseX: 140 });
  runGame(game, 1.5);
  assert(Math.abs(game.player.x - 140) <= STOP_PX, `mouse: x ${game.player.x}`);
  const both = makeGame({ mouseX: 140, fingerX: 450 });
  runGame(both, 1.5);
  assert(Math.abs(both.player.x - 140) <= STOP_PX, 'the mouse is read first');
  const touchOnly = makeGame({ mouseX: null, fingerX: 400 });
  touchOnly.mouseInput = { getTargetX: () => null };
  runGame(touchOnly, 1.5);
  assert(Math.abs(touchOnly.player.x - 400) <= STOP_PX, `finger: x ${touchOnly.player.x}`);
});

await check('game: nothing pressed means the cat stands still, and the keyboard beats the finger', () => {
  const idle = makeGame();
  runGame(idle, 1);
  assert(idle.player.x === CONFIG.CANVAS_WIDTH / 2);
  const key = makeGame({ fingerX: 480, left: true });
  runGame(key, 0.3);
  assert(key.player.x < CONFIG.CANVAS_WIDTH / 2, 'the left key must win over a finger on the right');
});

await check('game: the finger works the same at 20, 30 and 120 frames per second', () => {
  const finals = FPS_LIST.map((fps) => {
    const game = makeGame({ fingerX: 410 });
    runGame(game, 1.5, 1 / fps);
    return game.player.x;
  });
  assert(finals.every((x) => Math.abs(x - 410) <= STOP_PX), `finals ${finals.map((x) => x.toFixed(1)).join(', ')}`);
});

// ---------------------------------------------------------------- (е) невидимые стены у края

// Где кот может оказаться на экране по высоте: камера держит его в полосе [focus - 6, focus + CAMERA_LAG],
// а focus = PLAYER_START_Y - lead, где lead от 8 (медленно) до CAMERA_LEAD (быстро) (WorldCamera.follow).
function catScreenYRange() {
  const lowest = CONFIG.PLAYER_START_Y - CONFIG.VISUAL.CAMERA_LEAD - 6;
  const highest = CONFIG.PLAYER_START_Y - 8 + CONFIG.VISUAL.CAMERA_LAG;
  const ys = [];
  for (let y = lowest; y <= highest; y += 2) ys.push(y);
  return ys;
}

await check('the border at the cat hides every hidden edge wall, and anything thinner than the limit is never made', () => {
  const ys = catScreenYRange();
  const insets = ys.map((y) => playableXBounds(y).left - CONFIG.TRACK_LEFT);
  const narrowest = Math.min(...insets);
  const widest = Math.max(...insets);
  assert(CONFIG.EDGE_WALL_HIDDEN <= narrowest - 0.5, `hidden walls (${CONFIG.EDGE_WALL_HIDDEN} px) reach past the border at the cat (${narrowest.toFixed(1)} px)`);
  // Стена за пределом скрытых должна быть видна у кота хотя бы на 3 px (drawSpan не рисует тоньше) при любом положении кота.
  assert(CONFIG.EDGE_WALL_THIN_MAX >= widest + 3, `walls up to ${CONFIG.EDGE_WALL_THIN_MAX} px can be under 3 px visible (border ${widest.toFixed(1)} px)`);
  assert(CONFIG.EDGE_WALL_MIN > CONFIG.EDGE_WALL_THIN_MAX && CONFIG.EDGE_WALL_THIN_MAX > CONFIG.EDGE_WALL_HIDDEN);
  // Воронка в самом узком ряду делает стену у края вдвое меньше своего расширения: она тоже должна быть скрыта.
  assert(CONFIG.PATTERN_FUNNEL_EXPAND_SAFE / 2 <= CONFIG.EDGE_WALL_HIDDEN, 'the funnel makes a wall wider than the hidden limit');
});

await check('Track.edgeWallsThin flags walls between the hidden limit and the thin limit, on either side', () => {
  const track = new Track();
  const width = 200;
  const at = (leftWall) => CONFIG.TRACK_LEFT + leftWall;
  assert(!track.edgeWallsThin(at(0), width), 'no wall is fine');
  assert(!track.edgeWallsThin(at(CONFIG.EDGE_WALL_HIDDEN), width), 'a hidden wall is fine');
  assert(track.edgeWallsThin(at(CONFIG.EDGE_WALL_HIDDEN + 1), width), 'just over hidden is thin');
  assert(track.edgeWallsThin(at(CONFIG.EDGE_WALL_THIN_MAX - 1), width), 'just under the limit is thin');
  assert(!track.edgeWallsThin(at(CONFIG.EDGE_WALL_THIN_MAX), width), 'the limit itself is drawn well enough');
  assert(!track.edgeWallsThin(at(CONFIG.EDGE_WALL_MIN), width), 'a normal wall is fine');
  const rightWall = (wall) => CONFIG.TRACK_WIDTH - width - wall; // левая стена такая, что справа остаётся wall
  assert(track.edgeWallsThin(at(rightWall(18)), width), 'a thin wall on the right side is flagged too');
  assert(!track.edgeWallsThin(at(rightWall(10)), width), 'a hidden wall on the right side is fine');
});

await check('generated tracks: an edge wall either misses the cat completely or sticks out by 3 px or more (never an unseen sliver)', () => {
  const ys = catScreenYRange();
  let walls = 0;
  let touching = 0;
  for (let run = 0; run < 120; run += 1) {
    const track = new Track();
    track.runTime = (run % 8) * 45;
    for (let step = 0; step < 300; step += 1) {
      track.update(0.05, 300 + (run % 8) * 60);
      for (const segment of track.segments) {
        for (const obs of segment.obstacles) {
          if (obs.edgeChecked) continue;
          const atLeft = obs.x <= CONFIG.TRACK_LEFT + 0.5;
          const atRight = obs.x + obs.width >= CONFIG.TRACK_RIGHT - 0.5;
          if (!atLeft && !atRight) continue;
          obs.edgeChecked = true;
          walls += 1;
          for (const y of ys) {
            const bounds = playableXBounds(y);
            const overlap = atLeft ? obs.x + obs.width - bounds.left : bounds.right - obs.x;
            if (overlap > 0) touching += 1;
            assert(!(overlap > 0 && overlap < 3), `a ${obs.width.toFixed(1)} px ${atLeft ? 'left' : 'right'} wall (${segment.type}, ${segment.pattern}) sticks out ${overlap.toFixed(2)} px at screen y ${y}: the cat dies on it but it is not drawn`);
          }
        }
      }
    }
  }
  assert(walls > 3000, `only ${walls} edge walls were looked at`);
  assert(touching > 0, 'no wall ever reached the cat: the check looks at nothing');
});

// ---------------------------------------------------------------- (д) монета

const COIN_DIR = new URL('../assets/environment/collectibles/', import.meta.url);

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert(bytes.toString('latin1', 1, 4) === 'PNG', 'not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

await check('there is exactly one coin picture, square and sharp enough (it used to be 40-80 px wide)', () => {
  assert(PACK_GARDEN_SHEETS.coins.length === 1, `coins in the sheet: ${PACK_GARDEN_SHEETS.coins.length}`);
  const file = new URL('coin.png', COIN_DIR);
  assert(fs.existsSync(file), 'coin.png is missing');
  const { width, height, colorType } = pngSize(file);
  assert(width >= 128 && height >= 128, `coin.png is ${width}x${height}`);
  assert(Math.abs(width - height) <= 8, 'the coin picture must be about square');
  assert(colorType === 6, 'coin.png must have a transparent background (RGBA)');
  const old = fs.readdirSync(COIN_DIR).filter((name) => /^coin-0[0-9]\.png$/.test(name));
  assert(old.length === 0, `old coin pictures are still there: ${old.join(', ')}`);
  assert(fs.existsSync(new URL('coin.svg', COIN_DIR)), 'the coin.svg source is missing');
});

await check('every coin looks the same: no per-coin picture choice in the track or in the renderer', () => {
  const track = new Track();
  track.runTime = 12;
  const coins = [];
  for (const zone of ['LEFT', 'CENTER', 'RIGHT']) {
    for (const ySlot of ['AHEAD', 'MID', 'APPROACH']) {
      track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'NORMAL');
      const segment = track.segments[track.segments.length - 1];
      segment.coins = [];
      const coin = track.tryPlaceCoin(segment, { zone, ySlot, xJitter: 0.5, yJitter: 0.5 });
      if (coin) coins.push(coin);
    }
  }
  assert(coins.length >= 5, `only ${coins.length} coins were placed`);
  assert(coins.every((coin) => !('visualId' in coin) && !('visualSeed' in coin)), 'coins carry a visual variant');
  const art = { sheets: PACK_GARDEN_SHEETS };
  const first = GardenArt.prototype.coinSprite.call(art, coins[0]);
  assert(first && first.id === 'coin');
  assert(coins.every((coin) => GardenArt.prototype.coinSprite.call(art, coin) === first), 'two coins got different pictures');
});

await check('the HUD coin icon draws the same picture as the coin in the world', () => {
  const calls = [];
  const sprite = PACK_GARDEN_SHEETS.coins[0];
  const art = {
    ctx: {},
    sheets: PACK_GARDEN_SHEETS,
    coinSprite: GardenArt.prototype.coinSprite,
    isReady: () => true,
    sourceRect: () => ({ sx: 0, sy: 0, sw: 138, sh: 146 }),
    drawSprite: (item, x, y, w, h) => { calls.push({ item, x, y, w, h }); return true; },
    hudIconDisc() { throw new Error('the plain disc must not be drawn when the picture is ready'); }
  };
  GardenArt.prototype.hudCoinIcon.call(art, 50, 60, 13);
  assert(calls.length === 1 && calls[0].item === sprite, 'the HUD icon did not use the coin picture');
  assert(Math.abs(calls[0].w - 13 * 2.3) < 1e-9 && calls[0].h > calls[0].w, 'icon size');
  // Пока картинка не загрузилась, рисуется запасной золотой диск (игра без картинок не ломается).
  let disc = 0;
  const waiting = {
    ctx: { beginPath() {}, arc() {}, stroke() {}, fill() {}, strokeStyle: '', lineWidth: 0, fillStyle: '', globalAlpha: 1 },
    sheets: PACK_GARDEN_SHEETS, coinSprite: GardenArt.prototype.coinSprite, isReady: () => false,
    hudIconDisc() { disc += 1; }, coinGold: '#000', coinRim: '#000', coinHi: '#000'
  };
  GardenArt.prototype.hudCoinIcon.call(waiting, 0, 0, 13);
  assert(disc === 1, 'the fallback disc is missing');
});

// ---------------------------------------------------------------- (ж) темп игры и время суток

await check('pace: the track speeds up faster and goes faster than before (owner request 2026-10-09)', () => {
  assert(getTrackSpeed(0) === CONFIG.TRACK_SPEED_START && CONFIG.TRACK_SPEED_START === 300, 'the start did not change');
  const at = (time) => Math.round(getTrackSpeed(time));
  assert(at(10) === 449 && at(30) === 665 && at(60) === 852 && at(120) === 998, `curve ${[10, 30, 60, 120].map(at)}`);
  assert(getTrackSpeed(1e6) < CONFIG.TRACK_SPEED_MAX + 0.01 && Math.round(getTrackSpeed(1e6)) === 1050, 'the maximum is 1050');
  // Старая кривая 720 − 420·e^(−t/70): новая обгоняет её в каждый момент, а её скорость на 120-й секунде (644) достигается быстро.
  const old = (time) => 720 - 420 * Math.exp(-time / 70);
  for (let time = 1; time <= 300; time += 1) assert(getTrackSpeed(time) > old(time), `slower than the old curve at ${time} s`);
  assert(getTrackSpeed(28) >= old(120) && getTrackSpeed(27) < old(120), 'the second-minute speed now comes at about 28 s');
  let last = 0;
  for (let time = 0; time <= 400; time += 0.5) {
    assert(getTrackSpeed(time) >= last, 'the speed never drops');
    last = getTrackSpeed(time);
  }
});

await check('pace: the cat\'s strafe grows with the track and reaches 600 at the maximum', () => {
  assert(Math.abs(getPlayerSpeed(CONFIG.TRACK_SPEED_START) - CONFIG.PLAYER_SPEED) < 1e-9 && CONFIG.PLAYER_SPEED === 420, 'start 420');
  assert(Math.abs(getPlayerSpeed(CONFIG.TRACK_SPEED_MAX) - 600) < 1e-9 && CONFIG.PLAYER_SPEED_MAX === 600, 'maximum 600');
  assert(getPlayerSpeed(10000) === 600, 'never above the maximum');
});

await check('pace: forks do not come more often in seconds than before, however fast the track is', () => {
  // Много обычных участков подряд: на скорости выше CHOICE_PACE_SPEED порог «почти обязательной» развилки растёт.
  // Вероятность развилки считается долей бросков кубика (0…1 с шагом), при которых она выпала.
  const probabilityAfter = (speed, breathing) => {
    let developed = 0;
    for (let n = 0; n < 200; n += 1) {
      const rolled = new VariationDirector();
      rolled.random = () => (n + 0.5) / 200;
      rolled.lastChoiceRunTime = 100;
      if (rolled.chooseType({ runTime: 105, speed, breathingSinceChoice: breathing, choiceCount: 3, lastType: 'NORMAL' }) !== 'NORMAL') developed += 1;
    }
    return developed / 200;
  };
  // 5 участков на опорной скорости: страховка уже включена; на 1050 те же 5 участков идут быстрее, поэтому страховки ещё нет.
  assert(probabilityAfter(1050, 5) < probabilityAfter(CONFIG.CHOICE_PACE_SPEED, 5), 'at 1050 px/s five plain rows are not yet a reason to force a fork');
  assert(probabilityAfter(1050, 9) >= probabilityAfter(1050, 5), 'but a longer stretch is');
  assert(CONFIG.CHOICE_PACE_SPEED === 600, 'the reference speed of the safety net');
});

await check('time of day: a stage lasts 16 seconds, the cycle 80, the blend 5 (12 s first, then +20%, then +10%)', () => {
  const tod = CONFIG.TIME_OF_DAY;
  assert(tod.CYCLE === 80 && tod.STAGES.length === 5, 'cycle 80 s, five stages');
  const lengths = tod.STAGES.map((stage, i, all) => (i === all.length - 1 ? tod.CYCLE : all[i + 1].from) - stage.from);
  assert(lengths.every((length) => Math.abs(length - 16) < 1e-9), `stage lengths ${lengths}`);
  assert(tod.BLEND === 5 && tod.BLEND <= 16 / 2, 'the blend is at most half a stage, so every stage has a plain moment');
  assert(tod.TOAST_SECONDS === 2.5 && tod.TOAST_SECONDS < 16 / 2, 'the plaque does not stay on the screen between stages');
});

// ---------------------------------------------------------------- (з) шлифовка, фаза 1: экран проигрыша

function makeShopStorage(initial = {}) {
  const memory = new Map(Object.entries(initial).map(([key, value]) => [`one_more_run_${key}`, JSON.stringify(value)]));
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); }
  };
  return new StorageService();
}

await check('Game Over: the next skin is the cheapest one the player does not own, with the coins still missing', () => {
  const storage = makeShopStorage();
  const shop = new Shop(storage);
  const cheapest = CONFIG.SHOP.SKINS.filter((skin) => skin.price > 0).sort((a, b) => a.price - b.price);
  storage.addCoins(Math.floor(cheapest[0].price / 2));
  let target = shop.nextTarget();
  assert(target && target.id === cheapest[0].id && target.price === cheapest[0].price, `target ${JSON.stringify(target)}`);
  assert(target.missing === cheapest[0].price - target.balance && target.missing > 0, 'missing coins');
  storage.addCoins(cheapest[0].price);
  assert(shop.nextTarget().missing === 0, 'enough coins: nothing is missing');
  assert(shop.buy(cheapest[0].id).ok, 'buy the cheapest');
  target = shop.nextTarget();
  assert(target && target.id === cheapest[1].id, 'after buying it the next cheapest follows');
  for (const skin of cheapest) { storage.addCoins(skin.price); shop.buy(skin.id); }
  assert(shop.nextTarget() === null, 'everything bought: no goal');
});

await check('Game Over: the goal line shows name, coins and price, or the invitation when the coins are enough', () => {
  const game = Object.create(Game.prototype);
  game.shop = { nextTarget: () => ({ id: 'ginger', price: 10, balance: 4, missing: 6 }) };
  const view = game.nextSkinView();
  assert(view.name === t('skin.ginger') && view.price === 10 && view.balance === 4 && view.ready === false, JSON.stringify(view));
  game.shop = { nextTarget: () => ({ id: 'honey', price: 25, balance: 30, missing: 0 }) };
  assert(game.nextSkinView().ready === true, 'ready when nothing is missing');
  game.shop = { nextTarget: () => null };
  assert(game.nextSkinView() === null, 'no goal when everything is owned');
  game.shop = null;
  assert(game.nextSkinView() === null, 'no shop, no goal');
});

function gameOverLayout(extras) {
  const calls = { texts: [] };
  const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 11 }) }, {
    get: (target, key) => (key in target ? target[key] : (key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {})),
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const renderer = new Renderer(ctx);
  renderer.garden.plate = (x, y, w, h) => { calls.plate = { x, y, w, h }; };
  renderer.drawSitLoaf = () => {};
  renderer.drawSoundControls = (cx, y) => { calls.sound = y; };
  renderer.drawPlatformButtons = (cx, y) => { calls.platform = y; };
  renderer.fitText = (text) => { calls.texts.push(String(text)); };
  renderer.drawGameOver(180, 230, 4, 2, extras);
  calls.buttons = renderer.gameOverButtons;
  return calls;
}

await check('Game Over: the goal line fits on the card with zero, one or two ad buttons; the screen never overflows', () => {
  const goal = { name: t('skin.ginger'), price: 10, balance: 4, ready: false };
  for (const [offerRevive, offerDouble] of [[false, false], [true, false], [true, true]]) {
    for (const nextSkin of [null, goal, { ...goal, balance: 12, ready: true }]) {
      const layout = gameOverLayout({ offerRevive, offerDouble, nextSkin });
      const label = `${offerRevive ? 'revive ' : ''}${offerDouble ? 'double ' : ''}${nextSkin ? (nextSkin.ready ? 'ready' : 'goal') : 'no goal'}`;
      const { plate } = layout;
      assert(plate.y >= 0 && plate.y + plate.h <= CONFIG.CANVAS_HEIGHT, `${label}: the card leaves the screen`);
      // Кнопки магазина и лидеров высотой 44: центр + 22 не должен выходить за экран (запас 4 px).
      assert(layout.platform + 26 <= CONFIG.CANVAS_HEIGHT, `${label}: the shop / leaderboard row is cut off (y ${layout.platform})`);
      assert(layout.sound > plate.y + plate.h, `${label}: the sound row overlaps the card`);
      for (const [name, rect] of Object.entries(layout.buttons)) {
        assert(rect.y >= plate.y && rect.y + rect.h <= plate.y + plate.h - 10, `${label}: the ${name} button is not inside the card`);
      }
      const goalText = layout.texts.find((text) => text.includes(t('skin.ginger')) && text.includes('«') || /SKIN/.test(text) && text.includes(t('skin.ginger')));
      if (!nextSkin) assert(!goalText, `${label}: a goal line without a goal`);
      else assert(goalText, `${label}: no goal line`);
    }
  }
});

await check('Game Over: the progress bar never goes outside its track and the ready text replaces the numbers', () => {
  const fills = [];
  const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 11 }) }, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const renderer = new Renderer(ctx);
  renderer.fitText = (text) => { fills.push(String(text)); };
  const widths = [];
  renderer.garden.roundedRectPath = (x, y, w) => { widths.push(w); };
  for (const balance of [0, 3, 10, 500]) {
    widths.length = 0;
    renderer.drawSkinGoal(270, 400, { name: 'X', price: 10, balance, ready: balance >= 10 }, 400);
    assert(widths.length === 2 && widths[1] <= widths[0] + 1e-9 && widths[1] >= 6, `balance ${balance}: track ${widths[0]} fill ${widths[1]}`);
  }
  assert(fills.some((text) => text === t('over.skinReady', { name: 'X' })) && fills.some((text) => text === t('over.skinGoal', { name: 'X', c: 3, p: 10 })), 'texts');
});

// ---------------------------------------------------------------- (и) шлифовка, фаза 1: монеты чаще и ближе к стенам

// Собирает монеты со многих трасс: сколько всего, доля у самой стены (до 12 px от стены прохода), пары.
function collectCoinStats({ seeds = 40, seconds = 60 } = {}) {
  const stats = { coins: 0, nearWall: 0, pairs: 0, maxPerSegment: 0, overlaps: 0, invalid: [], first30: 0, first60: 0, tracks: seeds };
  for (let seed = 1; seed <= seeds; seed += 1) {
    const track = new Track();
    track.setSeed(seed);
    const seen = new Set();
    let time = 0;
    while (time < seconds) {
      time += 1 / 60;
      track.update(1 / 60, getTrackSpeed(time), time);
      for (const segment of track.segments) {
        if (seen.has(segment.id)) continue;
        seen.add(segment.id);
        if (time + 1.4 <= 30) stats.first30 += segment.coins.length;
        if (time + 1.4 <= 60) stats.first60 += segment.coins.length;
        if (!segment.coins.length) continue;
        stats.maxPerSegment = Math.max(stats.maxPerSegment, segment.coins.length);
        if (segment.coins.length === 2) {
          stats.pairs += 1;
          const [a, b] = segment.coins;
          if (Math.abs(a.x - b.x) < a.width + 6 && Math.abs(a.y - b.y) < a.height + 6) stats.overlaps += 1;
        }
        const path = segment.coinPath || segment.paths[0];
        for (const coin of segment.coins) {
          stats.coins += 1;
          if (Math.min(coin.x - path.x, path.x + path.width - (coin.x + coin.width)) <= 12) stats.nearWall += 1;
          if (coin.x < path.x || coin.x + coin.width > path.x + path.width) stats.invalid.push('outside the gap');
          if (!track.hasClearLane(path, coin)) stats.invalid.push('no way past without the coin');
          if (track.centerLaneHitsCoin(path, coin)) stats.invalid.push('on the straight line');
          if (segment.obstacles.some((obs) => track.rectsOverlap(coin, obs))) stats.invalid.push('inside an obstacle');
        }
      }
    }
  }
  return stats;
}

await check('coins: about twice as many as before (4+ in the first 30 s, 14+ in 60 s of the track), the owner found them too rare', () => {
  const stats = collectCoinStats();
  const per30 = stats.first30 / stats.tracks;
  const per60 = stats.first60 / stats.tracks;
  assert(per30 >= 4 && per60 >= 14, `the track offers ${per30.toFixed(2)} / ${per60.toFixed(2)} coins (30 s / 60 s)`);
  // Не бесконечно много: монеты остаются наградой, а не фоном (цены в CONFIG.SHOP подобраны под эту плотность).
  assert(per30 <= 9 && per60 <= 30, `too many coins: ${per30.toFixed(2)} / ${per60.toFixed(2)}`);
});

await check('coins: a good share lies right at the walls of the gap (the cat has to leave the line and come back), all still fair', () => {
  const stats = collectCoinStats();
  // Раньше у самой стены (до 12 px) лежало около 11% монет.
  assert(stats.nearWall / stats.coins >= 0.2, `only ${(100 * stats.nearWall / stats.coins).toFixed(0)}% of the coins are at the walls`);
  assert(stats.invalid.length === 0, `unfair coins: ${[...new Set(stats.invalid)].join(', ')}`);
});

await check('coins: some rows have a second coin along the same wall, never more than two, never overlapping', () => {
  const stats = collectCoinStats();
  assert(stats.pairs >= 20, `only ${stats.pairs} pairs in ${stats.tracks} tracks`);
  assert(stats.maxPerSegment <= 2, `${stats.maxPerSegment} coins in one row`);
  assert(stats.overlaps === 0, `${stats.overlaps} overlapping pairs`);
});

await check('coins: the economy settings are consistent (prices rise, the first skin is a few short runs away)', () => {
  const prices = CONFIG.SHOP.SKINS.map((skin) => skin.price);
  assert(prices.every((price, i) => i === 0 || price > prices[i - 1]), 'prices must rise');
  assert(CONFIG.COIN_CENTER_WEIGHT < 1 && CONFIG.COIN_EDGE_POWER > 1 && CONFIG.COIN_PAIR_CHANCE > 0 && CONFIG.COIN_PAIR_CHANCE <= 0.5, 'edge bias and pair settings');
  assert(CONFIG.COIN_CHANCE_EARLY > 0.15 && CONFIG.COIN_CHANCE_MID > 0.2 && CONFIG.COIN_CHANCE_LATE > 0.28, 'chances are higher than the old 0.15 / 0.20 / 0.28');
});

// ---------------------------------------------------------------- (к) шлифовка, фаза 1: ограниченный скин «Хэллоуин»

const HALLOWEEN = CONFIG.SHOP.SKINS.find((skin) => skin.id === 'halloween');

function shopOn(dayRef, initial = {}) {
  const storage = makeShopStorage(initial);
  const shop = new Shop(storage, () => dayRef.day);
  return { storage, shop };
}

await check('Halloween: the most expensive skin, sold 14 days from the first launch of each player, never after the season', () => {
  const prices = CONFIG.SHOP.SKINS.map((skin) => skin.price);
  assert(HALLOWEEN && HALLOWEEN.price === Math.max(...prices), 'Halloween is the most expensive skin');
  assert(HALLOWEEN.limited.days === 14 && HALLOWEEN.limited.until === '2026-11-30', JSON.stringify(HALLOWEEN.limited));
  assert(CONFIG.SHOP.SKINS.filter((skin) => skin.limited).length === 1, 'only one limited skin');
});

await check('Halloween: the window is 14 days from the first launch; the days left count down; after that it is gone', () => {
  const ref = { day: '2026-10-26' };
  const { shop } = shopOn(ref);
  assert(shop.ensureFirstDay() === '2026-10-26', 'the first day is remembered');
  assert(shop.availability('halloween').available && shop.availability('halloween').daysLeft === 14, 'day one: 14 days left');
  assert(shop.list().some((skin) => skin.id === 'halloween' && skin.limited === 14), 'it is in the shop list with the days left');
  ref.day = '2026-11-08';
  assert(shop.availability('halloween').daysLeft === 1 && shop.availability('halloween').available, 'day 14: the last day');
  ref.day = '2026-11-09';
  assert(!shop.availability('halloween').available && shop.availability('halloween').daysLeft === 0, 'day 15: gone');
  assert(!shop.list().some((skin) => skin.id === 'halloween'), 'gone from the list');
  assert(shop.canBuy('halloween').reason === 'unavailable' && shop.buy('halloween').ok === false, 'cannot be bought any more');
  // Обычные скины окно не трогает.
  assert(shop.availability('ginger').available && shop.availability('ginger').daysLeft === null, 'plain skins are always on sale');
});

await check('Halloween: a new player after the season never sees it; a bought one stays forever and can be worn', () => {
  const late = { day: '2026-12-02' };
  const { shop: newcomer } = shopOn(late);
  newcomer.ensureFirstDay();
  assert(!newcomer.availability('halloween').available, 'after 2026-11-30 even a brand new player cannot buy it');

  const ref = { day: '2026-10-27' };
  const { storage, shop } = shopOn(ref);
  shop.ensureFirstDay();
  storage.addCoins(HALLOWEEN.price + 5);
  assert(shop.buy('halloween').ok && shop.isOwned('halloween') && shop.selected() === 'halloween', 'bought and worn');
  ref.day = '2027-03-01';
  assert(shop.list().some((skin) => skin.id === 'halloween' && skin.owned && skin.limited === null), 'still in the list, owned, no countdown');
  assert(shop.select('classic') && shop.select('halloween'), 'it can be put on again');
});

await check('Halloween: the first day is set once; the earlier day wins in the cloud; garbage changes nothing', () => {
  const ref = { day: '2026-10-26' };
  const { shop } = shopOn(ref);
  shop.ensureFirstDay();
  ref.day = '2026-10-30';
  assert(shop.ensureFirstDay() === '2026-10-26', 'it is never moved later');
  assert(shop.snapshot().firstDay === '2026-10-26', 'the snapshot carries it');
  shop.merge({ firstDay: '2026-10-20' });
  assert(shop.firstDay() === '2026-10-20', 'an earlier cloud day wins (a second device does not restart the window)');
  shop.merge({ firstDay: '2026-11-01' });
  assert(shop.firstDay() === '2026-10-20', 'a later one changes nothing');
  for (const bad of ['x', 20261020, '2026-02-31', null, {}, []]) {
    shop.merge({ firstDay: bad });
    assert(shop.firstDay() === '2026-10-20', `garbage ${JSON.stringify(bad)} must change nothing`);
  }
  assert(CONFIG.YANDEX.CLOUD_KEYS.includes('firstDay'), 'the key is saved to the cloud');
});

await check('Halloween: it is never offered as the "next skin" goal, and tapping it after the window does nothing', () => {
  const ref = { day: '2026-10-26' };
  const { storage, shop } = shopOn(ref);
  shop.ensureFirstDay();
  for (const skin of CONFIG.SHOP.SKINS.filter((item) => item.price > 0 && !item.limited)) { storage.addCoins(skin.price); shop.buy(skin.id); }
  assert(shop.nextTarget() === null, 'only the limited skin is left, and it is not a goal');
  ref.day = '2026-11-20';
  const game = Object.assign(Object.create(Game.prototype), { shop, storage, shopWindow: { message: null }, requestRender() {}, audio: null, platform: null });
  assert(game.tapSkin('halloween') === false && game.shopWindow.message === null, 'a tap on a gone skin is ignored');
});

await check('Halloween: the shop with nine cells fits the card, the cells do not overlap and the close button stays free', () => {
  for (const count of [8, 9]) {
    const skins = CONFIG.SHOP.SKINS.slice(0, count).map((skin, index) => ({ id: skin.id, price: skin.price, owned: index === 0, selected: index === 0, limited: skin.limited ? 14 : null }));
    const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 11 }) }, {
      get: (target, key) => (key in target ? target[key] : () => {}),
      set: (target, key, value) => { target[key] = value; return true; }
    });
    const renderer = new Renderer(ctx);
    let plate = null;
    renderer.garden.plate = (x, y, w, h) => { plate = { x, y, w, h }; };
    renderer.drawShop({ skins, balance: 100, message: null });
    const cells = renderer.shopButtons.skins;
    assert(cells.length === count, `${count} cells expected, got ${cells.length}`);
    const close = renderer.shopButtons.close;
    for (const cell of cells) {
      assert(cell.y >= plate.y && cell.y + cell.h <= plate.y + plate.h, `${count}: a cell leaves the card`);
      assert(cell.y + cell.h <= close.y - 8, `${count}: a cell touches the close button`);
      assert(cell.x >= plate.x && cell.x + cell.w <= plate.x + plate.w, `${count}: a cell is outside the card sideways`);
    }
    for (let a = 0; a < cells.length; a += 1) {
      for (let b = a + 1; b < cells.length; b += 1) {
        const p = cells[a];
        const q = cells[b];
        assert(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${count}: cells ${a} and ${b} overlap`);
      }
    }
    assert(close.y + close.h <= plate.y + plate.h && plate.y + plate.h <= CONFIG.CANVAS_HEIGHT, `${count}: the close button or the card leaves the screen`);
  }
});

await check('Halloween: the skin recolours every run frame and the sitting cat, adds a witch hat, never changes a shape', () => {
  const frames = ['01', '02', '03', '04'].map((n) => fs.readFileSync(new URL(`../assets/characters/run/loaf-run-${n}.svg`, import.meta.url), 'utf8'));
  for (const [i, svg] of frames.entries()) {
    const out = skinSvg(svg, 'halloween');
    assert(out !== svg && out.includes('#241C2B') && out.includes('#F28B2F') && out.includes(`rotate(${HAT_GEOMETRY.tilt} `), `frame ${i + 1}: no hat, colours or tilt`);
    // Кот лежит в группе с обрезкой (уши над полями исчезают), шляпа идёт после неё и сама не обрезана.
    const cut = out.indexOf('<g clip-path="url(#omr-skin-cut)">');
    const catEnd = out.indexOf('</g><g transform="rotate(');
    assert(out.includes(`<clipPath id="omr-skin-cut"><path d="${hatClipPath()}"/></clipPath>`) && cut > 0 && catEnd > cut, `frame ${i + 1}: the cat is not cut, or the hat is inside the cut`);
    assert(out.trimEnd().endsWith('</svg>') && out.split('<g').length === out.split('</g>').length, `frame ${i + 1}: broken SVG`);
  }
  const sit = fs.readFileSync(new URL('../assets/characters/loaf-sit.svg', import.meta.url), 'utf8');
  assert(sitSvg(sit, 'halloween') !== sit, 'the sitting cat is recoloured too');
  for (const lang of ['ru', 'en']) {
    const dict = JSON.parse(fs.readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    assert(dict.skin.halloween && dict.shop.limited.includes('{n}') && dict.shop.limitedLast, `${lang}: Halloween strings`);
  }
});

// ---------------------------------------------------------------- (л) шлифовка, фаза 1: чёткость на телефонах

await check('sharpness: the scale follows the screen (css width × pixel ratio / 540), snaps to 1 / 1.5 / 2 and respects the cap', () => {
  const pick = (cssWidth, devicePixelRatio, cap) => pickRenderScale({ cssWidth, devicePixelRatio, cap });
  assert(pick(390, 3) === 2 && pick(412, 2.625) === 2, 'modern phones get 2');
  assert(pick(540, 1) === 1 && pick(360, 1) === 1 && pick(700, 1) === 1.5 && pick(1000, 1) === 2, 'desktop sizes');
  assert(pick(400, 2) === 1.5 && pick(300, 3) === 1.5, 'in between');
  assert(pick(390, 3, 1.5) === 1.5 && pick(390, 3, 1) === 1 && pick(390, 3, 5) === 2, 'the cap lowers the scale, never raises past the maximum');
  for (const bad of [[NaN, 2], [undefined, undefined], [0, 3], [-5, 3], [390, NaN]]) {
    const scale = pick(bad[0], bad[1]);
    assert(scale === 1 || scale === 1.5 || scale === 2, `garbage ${bad} gives a legal scale (${scale})`);
  }
  assert(lowerScale(2) === 1.5 && lowerScale(1.5) === 1 && lowerScale(1) === 1, 'lowering goes 2 → 1.5 → 1 and stops');
});

await check('sharpness: steady slow frames lower the scale; one hiccup, a pause or a huge gap do not', () => {
  const governor = new FrameGovernor({ slowMs: 26, limit: 45 });
  let fired = 0;
  for (let i = 0; i < 44; i += 1) if (governor.observe(40, true)) fired += 1;
  assert(fired === 0, 'not yet');
  assert(governor.observe(40, true) === true, 'the 45th slow frame fires');
  assert(governor.score === 0, 'the counter restarts');
  const calm = new FrameGovernor({ slowMs: 26, limit: 45 });
  for (let i = 0; i < 500; i += 1) assert(calm.observe(i % 10 === 0 ? 60 : 16, true) === false, 'a good phone with sparse slow frames keeps its scale');
  for (let i = 0; i < 200; i += 1) assert(calm.observe(40, false) === false, 'inactive (pause, menu, first seconds) is ignored');
  for (let i = 0; i < 200; i += 1) assert(calm.observe(900, true) === false, 'a huge gap (the tab was hidden) is ignored');
  assert(calm.observe(NaN, true) === false && calm.observe(-3, true) === false, 'garbage is ignored');
});

function makeScaleGame({ stored = undefined } = {}) {
  const memory = new Map(stored === undefined ? [] : [['renderScaleCap', stored]]);
  const transforms = [];
  const canvas = { width: 540, height: 960 };
  const game = Object.assign(Object.create(Game.prototype), {
    canvas,
    ctx: { setTransform: (...args) => transforms.push(args) },
    storage: { get: (key, fallback) => (memory.has(key) ? memory.get(key) : fallback), set: (key, value) => memory.set(key, value) },
    frameGovernor: new FrameGovernor(),
    renderer: { setScale(scale) { this.scale = scale; }, scale: 1, clear() { throw new Error('stop'); } },
    isRunning: true,
    requestRender() {}
  });
  return { game, canvas, memory, transforms };
}

await check('sharpness: the canvas gets 1×, 1.5× or 2× the pixels, the game still draws in 540 × 960', () => {
  const { game, canvas } = makeScaleGame();
  assert(game.renderScale() === 1, 'starts at 1');
  assert(game.applyRenderScale(2) === true && canvas.width === 1080 && canvas.height === 1920 && game.renderScale() === 2, '2×');
  assert(game.applyRenderScale(2) === false, 'the same size changes nothing');
  assert(game.applyRenderScale(1.5) === true && canvas.width === 810 && canvas.height === 1440, '1.5×');
  assert(game.applyRenderScale(1) === true && canvas.width === 540 && canvas.height === 960, 'back to 1×');
});

await check('sharpness: each frame sets the transform from the canvas size (so the store capture tools keep working)', () => {
  const { game, canvas, transforms } = makeScaleGame();
  for (const [width, scale] of [[540, 1], [810, 1.5], [1080, 2]]) {
    canvas.width = width;
    canvas.height = width * (960 / 540);
    transforms.length = 0;
    try { game.render(); } catch (error) { assert(error.message === 'stop', error.message); }
    assert(transforms.length === 1 && transforms[0].join() === [scale, 0, 0, scale, 0, 0].join(), `width ${width}: ${JSON.stringify(transforms)}`);
    assert(game.renderer.scale === scale, 'the renderer knows the scale');
  }
});

await check('sharpness: a weak phone drops the scale and the game remembers it; a remembered cap holds at the next start', () => {
  const { game, canvas, memory } = makeScaleGame();
  game.initRenderScale({ cssWidth: 390, devicePixelRatio: 3 });
  assert(canvas.width === 1080, 'a modern phone starts at 2×');
  assert(game.downgradeRenderScale() === true && canvas.width === 810 && memory.get('renderScaleCap') === 1.5, '2× → 1.5× and remembered');
  assert(game.downgradeRenderScale() === true && canvas.width === 540 && memory.get('renderScaleCap') === 1, '1.5× → 1×');
  assert(game.downgradeRenderScale() === false, 'nothing lower than 1×');

  const next = makeScaleGame({ stored: 1.5 });
  next.game.initRenderScale({ cssWidth: 390, devicePixelRatio: 3 });
  assert(next.canvas.width === 810, 'the next start does not go above the remembered cap');
  next.game.initRenderScale({ cssWidth: 390, devicePixelRatio: 3, override: 2 });
  assert(next.canvas.width === 1080, 'a developer override wins');
  const garbage = makeScaleGame({ stored: 'abc' });
  garbage.game.initRenderScale({ cssWidth: 390, devicePixelRatio: 3 });
  assert(garbage.canvas.width === 1080, 'a broken saved value is ignored');
});

await check('sharpness: taps and finger use the logical 540 × 960 whatever the canvas size', () => {
  for (const pixels of [540, 810, 1080]) {
    const surface = { width: pixels, height: pixels * (960 / 540), getBoundingClientRect: () => ({ left: 10, top: 20, width: 270, height: 480 }) };
    const touch = Object.create(TouchInput.prototype);
    touch.canvas = surface;
    assert(touch.touchLogicalX({ clientX: 145 }) === 270, `touch at ${pixels} px canvas`);
    const mouse = Object.create(MouseInput.prototype);
    mouse.canvas = surface;
    assert(mouse.eventLogicalX({ clientX: 145 }) === 270, `mouse at ${pixels} px canvas`);
  }
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(/\* CONFIG\.CANVAS_WIDTH/.test(main) && /\* CONFIG\.CANVAS_HEIGHT/.test(main) && !/\* canvas\.width/.test(main), 'main.js taps are in logical coordinates');
});

await check('sharpness: the art pack picks the picture size by real pixels, so a 2× canvas gets the larger one', () => {
  const pack = new ArtPack();
  const draws = [];
  const level = (width) => ({ width, label: width });
  pack.sprites = { tree: { aspect: 1, levels: [[level(256), level(128), level(64), level(32)], [level(256), level(128), level(64), level(32)]] } };
  const ctx = { drawImage: (image) => draws.push(image.width) };
  pack.scale = 1;
  pack.draw(ctx, 'tree', 0, 0, 100);
  pack.scale = 2;
  pack.draw(ctx, 'tree', 0, 0, 100);
  pack.scale = 1.5;
  pack.draw(ctx, 'tree', 0, 0, 50);
  assert(draws.join() === '128,256,128', `levels ${draws}`);
});

await check('sharpness: the sky cache is rebuilt in real pixels when the scale changes and drawn at its logical size', () => {
  const made = [];
  const paint = [];
  const fakeContext = () => new Proxy({}, { get: (target, key) => (key === 'scale' ? (x) => paint.push(['scale', x]) : () => {}), set: () => true });
  globalThis.document = { createElement: () => { const canvas = { width: 0, height: 0, getContext: fakeContext }; made.push(canvas); return canvas; } };
  try {
    const sky = new SkyArt(540, 960);
    const drawn = [];
    const ctx = { drawImage: (image, x, y, w, h) => drawn.push([image.width, image.height, w, h]) };
    sky.draw(ctx, 130, 0, null);
    sky.scale = 2;
    sky.draw(ctx, 130, 0, null);
    sky.draw(ctx, 130, 0, null);
    assert(made.length === 2, `the cache is built once per scale (${made.length})`);
    assert(made[1].width === 1080 && made[1].height === 2 * made[0].height, 'the 2× cache has twice the pixels');
    assert(drawn[0][2] === 540 && drawn[1][2] === 540 && drawn[1][3] === made[0].height, 'both are drawn at the logical size');
    assert(paint.some(([name, value]) => name === 'scale' && value === 2), 'the 2× cache is painted in logical coordinates');
  } finally {
    delete globalThis.document;
  }
});

await check('sharpness: the settings, the dev override and the saved cap are wired', () => {
  assert(CONFIG.RENDER.MAX_SCALE === 2 && CONFIG.RENDER.SLOW_FRAME_MS >= 20 && CONFIG.RENDER.SLOW_FRAMES >= 30, JSON.stringify(CONFIG.RENDER));
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(/game\.initRenderScale\(/.test(main) && /addEventListener\('resize', refreshRenderScale\)/.test(main) && /get\('scale'\)/.test(main) && /import\.meta\.env\?\.DEV/.test(main.slice(0, main.indexOf("get('scale')"))), 'main.js sets the scale, follows resizes, ?scale only in dev');
  const game = fs.readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  assert(/this\.frameGovernor\?\.observe\(deltaTime \* 1000, playing\)/.test(game), 'the loop feeds the frame governor');
});

await check('Halloween: the hat sits low on the head, the cut is hidden under the brim and no ear shows above it (the ears stay inside the hat)', () => {
  const { cx, cy, halfBrim, brimHeight, tilt } = HAT_GEOMETRY;
  const angle = (tilt * Math.PI) / 180;
  // Эллипс полей (центр (cx, cy), полуоси halfBrim и brimHeight плюс pad px), повёрнутый на tilt по часовой стрелке.
  const insideBrim = (x, y, pad = 0) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * Math.cos(angle) + dy * Math.sin(angle);
    const w = -dx * Math.sin(angle) + dy * Math.cos(angle);
    return (u * u) / ((halfBrim + pad) * (halfBrim + pad)) + (w * w) / ((brimHeight + pad) * (brimHeight + pad)) <= 1;
  };
  const inPolygon = (poly, x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // 1. Срез спрятан: вся верхняя дуга обрезки лежит внутри полей (контур полей толщиной 6 px её закрывает).
  for (const [x, y] of hatCutArc()) assert(insideBrim(x, y, -2), `the cut line (x ${x.toFixed(0)}, y ${y.toFixed(0)}) is outside the brim, it would show`);
  // 2. После среза каждая видимая точка уха либо под полями (внутри эллипса), либо ниже линии полей (голова под ними).
  const visible = hatVisiblePolygon();
  const brimLineY = (x) => cy + Math.tan(angle) * (x - cx);
  let earPointsCut = 0;
  for (const n of ['01', '02', '03', '04']) {
    const svg = fs.readFileSync(new URL(`../assets/characters/run/loaf-run-${n}.svg`, import.meta.url), 'utf8');
    const ears = readPaths(svg).filter((p) => p.part === 'ear');
    assert(ears.length === 2, `frame ${n}: two ears expected`);
    for (const ear of ears) {
      const move = ear.attrs.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
      const tx = move ? Number(move[1]) : 0;
      const ty = move ? Number(move[2]) : 0;
      const numbers = ear.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      assert(numbers.length >= 6, `frame ${n}: an ear outline expected`);
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        const x = numbers[i] + tx;
        const y = numbers[i + 1] + ty;
        if (!inPolygon(visible, x, y)) { earPointsCut += 1; continue; }
        assert(insideBrim(x, y, 3) || y >= brimLineY(x), `frame ${n}: a point of an ear (x ${x.toFixed(0)}, y ${y.toFixed(0)}) shows above the hat`);
      }
    }
  }
  assert(earPointsCut > 0, 'the cut must actually remove the ear tips');
  // 3. Шляпа сидит на голове (макушка кота на y ≈ 150), а не висит над ней, корона уже полей, всё в кадре 1024 × 1024.
  assert(cy >= 180 && cy <= 230, `the brim sits on the head, cy ${cy}`);
  assert(halfBrim >= 170, `the brim is wider than the head (±130), half-width ${halfBrim}`);
  const crown = hatCrownPolygon();
  const top = Math.min(...crown.map((point) => point[1]));
  assert(top > 8, `the tip of the hat stays inside the frame, y ${top.toFixed(0)}`);
  assert(cx - halfBrim - 6 > 0 && cx + halfBrim + 6 < 1024 && cy + halfBrim * Math.sin(angle) + brimHeight + 20 < 1024, 'the brim stays inside the frame');
  const xs = crown.map((point) => point[0]);
  assert(Math.min(...xs) > cx - halfBrim && Math.max(...xs) < cx + halfBrim, 'the crown is narrower than the brim');
  // 4. Остальное тело не режется: линия среза выше плеч (y ≈ 250) на всей ширине кота.
  for (const [x, y] of hatCutArc()) assert(y < 250, `the cut reaches the shoulders (x ${x.toFixed(0)}, y ${y.toFixed(0)})`);
});

// ---------------------------------------------------------------- (м) шлифовка: «В МЕНЮ» на экране паузы

function makePausedGame(extra = {}) {
  const calls = { submit: [], completed: 0, cloud: 0, quest: [], over: 0, best: 0, review: 0, lifecycle: 0, saved: [] };
  const game = Object.assign(Object.create(Game.prototype), {
    state: 'PLAYING', userPaused: true, pauseMenuAskUntil: 0, runTime: 20, distanceScore: 100, pathReward: 300, bestScore: 200,
    dailyRun: false, reviveUsed: false, launchPending: false, rewardPending: false, shopWindow: null, questsWindow: null, leaderboard: null,
    isNewBest: false, multiplier: 3, riskStreak: 4, score: 400, fromMenu: false,
    storage: { set: (key, value) => calls.saved.push([key, value]) },
    platform: {
      submitScore: (score) => { calls.submit.push(score); return Promise.resolve(); },
      recordRunCompleted: () => { calls.completed += 1; },
      saveCloudData: () => { calls.cloud += 1; }
    },
    finishQuestRun: (score) => calls.quest.push(score),
    maybeAskForReview: () => { calls.review += 1; },
    cloudSnapshot: () => ({}),
    syncGameplayLifecycle: () => { calls.lifecycle += 1; },
    feel: { onGameOver: () => { calls.over += 1; }, onNewBest: () => { calls.best += 1; }, reset() {} },
    player: new Player(),
    track: { setSeed() {}, setCanonicalClock() {}, reset() {} },
    camera: { reset() {} },
    requestRender() {},
    floatingRewards: [], questToasts: [],
    ...extra
  });
  return { game, calls };
}

await check('pause menu: the first tap asks, the second one leaves; the run ends like a normal game over, quietly', () => {
  const { game, calls } = makePausedGame();
  assert(game.menuFromPause() === true && game.pauseMenuAsking() === true, 'the first tap asks');
  assert(game.state === 'PLAYING' && game.userPaused === true && calls.submit.length === 0, 'nothing happens yet');
  assert(game.menuFromPause() === true, 'the second tap goes');
  assert(game.state === 'START' && game.fromMenu === true && game.userPaused === false && game.pauseMenuAsking() === false, `state ${game.state}`);
  assert(game.bestScore === 400 && calls.saved.some(([key, value]) => key === 'bestScore' && value === 400), 'the score counts for the record');
  assert(calls.submit.join() === '400' && calls.completed === 1 && calls.quest.join() === '400' && calls.cloud === 1, 'the leaderboard, the ad counter, the quests and the cloud get the run');
  assert(calls.over === 0 && calls.best === 0 && calls.review === 0, 'no game over effects, no new best fanfare, no rating request');
  assert(game.score === 0 && game.runTime === 0 && game.multiplier === CONFIG.MULTIPLIER_START, 'the menu is clean');
});

await check('pause menu: the question expires, resume and a new pause cancel it, only a paused run can leave', () => {
  const { game } = makePausedGame();
  game.menuFromPause();
  game.pauseMenuAskUntil = performance.now() - 1;
  assert(game.pauseMenuAsking() === false, 'the question ran out');
  assert(game.menuFromPause() === true && game.state === 'PLAYING' && game.pauseMenuAsking() === true, 'a late second tap asks again instead of leaving');
  assert(game.resume() === true && game.pauseMenuAsking() === false && game.pauseMenuAskUntil === 0, 'resume cancels the question');
  assert(game.menuFromPause() === false, 'not paused: no menu button');
  game.state = 'GAMEOVER';
  game.userPaused = true;
  assert(game.menuFromPause() === false && game.quitToMenu() === false, 'only a run in progress can be left this way');
  const again = makePausedGame();
  again.game.menuFromPause();
  again.game.userPaused = false;
  again.game.pause();
  assert(again.game.pauseMenuAskUntil === 0, 'a new pause starts without a question');
});

await check('pause menu: a tap on the button goes through handleTap; the resume button still resumes; a restart afterwards keeps the ad rules', () => {
  const { game } = makePausedGame();
  game.renderer = { hitResumeButton: (x) => x < 100, hitPauseMenuButton: (x) => x >= 100 && x < 200 };
  game.handleSoundTap = () => false;
  game.handlePlatformTap = () => false;
  assert(game.handleTap(150, 700) === false && game.pauseMenuAsking() === true, 'the first tap asks');
  assert(game.handleTap(50, 700) === false && game.userPaused === false && game.state === 'PLAYING', 'the resume button resumes and cancels the question');
  game.pause();
  assert(game.handleTap(300, 700) === false && game.userPaused === true && game.pauseMenuAsking() === false, 'a tap elsewhere on the pause does nothing');
  game.handleTap(150, 700);
  game.handleTap(150, 700);
  assert(game.state === 'START' && game.fromMenu === true, 'two taps: the main menu, and fromMenu keeps the interstitial rule');
  const main = fs.readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  assert(/menuAsk: this\.pauseMenuAsking\?\.\(\)/.test(main), 'render passes the question state to the pause screen');
});

await check('pause menu: a normal game over still plays its effects (only the quiet exit skips them)', () => {
  const { game, calls } = makePausedGame({ userPaused: false });
  game.gameOver();
  assert(calls.over === 1 && calls.best === 1 && calls.review === 1, 'effects, new best and the rating request are kept for a real game over');
  assert(game.state === 'GAMEOVER', 'the Game Over screen follows');
});

await check('pause menu: the pause card fits the screen, the menu button sits inside it under the resume button, the question shows', () => {
  for (const menuAsk of [false, true]) {
    const texts = [];
    const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 11 }) }, {
      get: (target, key) => (key in target ? target[key] : () => {}),
      set: (target, key, value) => { target[key] = value; return true; }
    });
    const renderer = new Renderer(ctx);
    let plate = null;
    let soundY = null;
    renderer.garden.plate = (x, y, w, h) => { plate = { x, y, w, h }; };
    renderer.drawSitLoaf = () => {};
    renderer.drawSoundControls = (cx, y) => { soundY = y; };
    renderer.fitText = (text) => { texts.push(String(text)); };
    renderer.drawPause(120, 300, false, 0.5, { menuAsk });
    const resume = renderer.resumeButton;
    const menu = renderer.pauseMenuButton;
    assert(plate.y >= 0 && plate.y + plate.h <= CONFIG.CANVAS_HEIGHT, 'the card is on the screen');
    assert(menu.y >= plate.y && menu.y + menu.h <= plate.y + plate.h - 12, 'the menu button is inside the card');
    assert(menu.y >= resume.y + resume.h + 6, 'the menu button is below the resume button with a gap');
    assert(menu.w >= 240 && menu.h >= 44, 'big enough for a finger');
    assert(soundY > plate.y + plate.h && soundY + 24 <= CONFIG.CANVAS_HEIGHT, 'the sound row is under the card and on the screen');
    assert(texts.includes(t(menuAsk ? 'pause.menuAsk' : 'pause.menu')), `the label for menuAsk=${menuAsk}`);
    assert(renderer.hitPauseMenuButton(menu.x + 5, menu.y + 5) && !renderer.hitPauseMenuButton(menu.x - 5, menu.y - 5), 'hit test');
  }
  for (const lang of ['ru', 'en']) {
    const dict = JSON.parse(fs.readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    assert(dict.pause.menu && dict.pause.menuAsk, `${lang}: pause menu strings`);
  }
  assert(CONFIG.PAUSE_MENU_CONFIRM_MS >= 2000 && CONFIG.PAUSE_MENU_CONFIRM_MS <= 6000, 'a sensible time to confirm');
});

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) {
  console.log('\nPhase 1r checks FAILED');
  process.exit(1);
}
console.log('\nAll Phase 1r checks passed');
