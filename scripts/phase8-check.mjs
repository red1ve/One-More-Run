import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { GameFeel } from '../src/game/GameFeel.js';
import { Renderer } from '../src/rendering/Renderer.js';
import { AudioService } from '../src/services/AudioService.js';

const results = [];

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

function makeContext() {
  return {
    texts: [],
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    clip() {},
    setLineDash() {},
    measureText(text) { return { width: String(text).length * 8 }; },
    fillText(text) { this.texts.push(String(text)); },
    strokeText(text) { this.texts.push(String(text)); },
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    drawImage() {}
  };
}

function makeRenderer() {
  const context = makeContext();
  return { context, renderer: new Renderer(context) };
}

check('first-run START explains controls and core decision briefly', () => {
  const { context, renderer } = makeRenderer();
  renderer.drawStartScreen(false, true);
  assert(context.texts.includes('TAP TO START'));
  assert(context.texts.includes('A/D or ←/→  •  TAP LEFT/RIGHT'));
  assert(context.texts.includes('SAFE = SURVIVE  •  RISK = BIG SCORE'));
  assert(context.texts.includes('RISK BUILDS STREAK → SCORE x'));
  assert(context.texts.includes('COINS STAY BETWEEN RUNS'));
});

check('clarity copy disappears after first-run onboarding', () => {
  const { context, renderer } = makeRenderer();
  renderer.drawStartScreen(false, false);
  assert(context.texts.includes('TAP TO START'));
  assert(!context.texts.includes('SAFE = SURVIVE  •  RISK = BIG SCORE'));
  assert(!context.texts.includes('COINS STAY BETWEEN RUNS'));
});

check('DUAL_RISK rewards distinguish the harder corridor without RISK words', () => {
  const { context, renderer } = makeRenderer();
  renderer.drawPathLabels({
    type: 'DUAL_RISK',
    paths: [
      { x: 100, y: 520, width: 108, height: 200, type: 'RISKY_EASY', baseReward: 150 },
      { x: 232, y: 520, width: 80, height: 200, type: 'RISKY_HARD', baseReward: 250 }
    ],
    obstacles: [{ x: 80, y: 520, width: 20, height: 64 }]
  });
  assert(!context.texts.includes('RISK'));
  assert(!context.texts.includes('HIGH RISK'));
  assert(!context.texts.includes('SAFE'));
  assert(context.texts.includes('+150'));
  assert(context.texts.includes('+250'));
});

check('Choice rewards are shown without permanent SAFE/RISK labels', () => {
  const { context, renderer } = makeRenderer();
  renderer.drawPathLabels({
    type: 'TWO_PATHS',
    paths: [
      { x: 100, y: 520, width: 180, height: 200, type: 'SAFE' },
      { x: 304, y: 520, width: 76, height: 200, type: 'RISKY' }
    ],
    obstacles: [{ x: 80, y: 520, width: 20, height: 64 }]
  });
  assert(!context.texts.includes('SAFE'));
  assert(!context.texts.includes('RISK'));
  assert(context.texts.includes(`+${CONFIG.REWARDS.SAFE}`));
  assert(context.texts.includes(`+${CONFIG.REWARDS.RISKY}`));
});

check('Loaf rear and front load once from production assets', () => {
  let created = 0;
  const images = [];
  const renderer = new Renderer(makeContext(), {
    imageFactory: () => {
      created += 1;
      const image = { complete: false, naturalWidth: 0 };
      images.push(image);
      return image;
    }
  });

  assert(created === 5);
  const srcs = images.map((image) => String(image.src).replaceAll('\\', '/'));
  assert(srcs.filter((src) => src.includes('/assets/characters/run/loaf-run-')).length === 4);
  assert(srcs.some((src) => src.endsWith('/assets/characters/loaf-sit.svg'))); // Phase 3: sitting Loaf
  assert(!srcs.some((src) => src.includes('loaf-rear-tail.svg')));
  assert(renderer.runFrames.length === 4);
  assert(renderer.playerSprite === images[0]);
  assert(renderer.playerFrontSprite === images[4]);
  assert(renderer.playerSpriteReady === false);
  assert(renderer.playerFrontReady === false);
  images.forEach((image) => image.onload());
  assert(renderer.playerSpriteReady === true);
  assert(renderer.playerFrontReady === true);
});

check('sprite onload notifies once without creating extra images', () => {
  const kinds = [];
  let created = 0;
  const images = [];
  const renderer = new Renderer(makeContext(), {
    onSpriteReady: (kind) => kinds.push(kind),
    imageFactory: () => {
      created += 1;
      const image = { complete: false, naturalWidth: 0 };
      images.push(image);
      return image;
    }
  });
  assert(created === 5);
  images.forEach((image) => image.onload());
  assert(kinds[0] === 'run-0' && kinds[3] === 'run-3' && kinds[4] === 'front');
  renderer.drawStartScreen(false, false);
  assert(created === 5);
});

check('Loaf render preserves the 36x36 hitbox, canonical anchor, and no mirror', () => {
  let created = 0;
  const calls = { translates: [], scales: [], rotates: [], drawImages: [] };
  const context = {
    ...makeContext(),
    translate(...args) { calls.translates.push(args); },
    scale(...args) { calls.scales.push(args); },
    rotate(angle) { calls.rotates.push(angle); },
    drawImage(...args) { calls.drawImages.push(args); }
  };
  const renderer = new Renderer(context, {
    imageFactory: () => {
      created += 1;
      return { complete: false, naturalWidth: 0 };
    }
  });
  renderer.playerSprite = renderer.runFrames[0];
  renderer.playerSpriteReady = true;
  renderer.drawPlayer(
    { x: 270, y: 840, width: 30, height: 30, moveDirection: -1 },
    { time: 0, playerPulse: 0 }
  );

  const layout = renderer.playerSpriteLayout();
  const sprite = CONFIG.VISUAL.LOAF_REAR;
  const sourceScale = sprite.DRAW_HEIGHT / sprite.SOURCE_HEIGHT;
  assert(CONFIG.PLAYER_WIDTH === 36 && CONFIG.PLAYER_HEIGHT === 36); // Phase 1b: bigger cat
  assert(calls.translates[0][0] === 270 && calls.translates[0][1] === 840);
  assert(calls.scales[0][0] === 1 && calls.scales[0][1] === 1, 'idle frame should not squash');
  assert(Math.abs(calls.rotates[0] + 0.08) < 1e-9);
  assert(calls.rotates.length === 1);
  assert(calls.drawImages.length === 1);
  assert(calls.drawImages[0][0] === renderer.runFrames[0]);
  assert(Math.abs(layout.x + sprite.ANCHOR_X * sourceScale) < 1e-9);
  assert(Math.abs(layout.y + sprite.ANCHOR_Y * sourceScale) < 1e-9);
  assert(Math.abs(layout.width - sprite.SOURCE_WIDTH * sourceScale) < 1e-9);
  assert(layout.height === sprite.DRAW_HEIGHT);
  assert(layout.height === 150); // Phase 1b: bigger cat
  assert(CONFIG.VISUAL.LOAF_REAR.FLOAT_CLEARANCE === 139); // scaled with the cat
  assert(CONFIG.FEEL.PLAYER_RUN_FPS === 10);

  const afterLoad = created;
  renderer.drawPlayer(
    { x: 270, y: 840, width: 30, height: 30, moveDirection: 1 },
    { time: 0.2, playerPulse: 0 }
  );
  assert(created === afterLoad, 'animation created a new Image');
  assert(calls.scales.every(([x, y]) => x > 0 && y > 0), 'sprite was mirrored');
  assert(calls.drawImages[1][0] === renderer.runFrames[2], 'run cycle did not advance');
});

check('HUD names the score multiplier', () => {
  const { context, renderer } = makeRenderer();
  renderer.drawHUD(100, 2.5, 300, 4, 2, null, false);
  assert(context.texts.includes('x2.5'));
  assert(context.texts.includes('STREAK'));
  assert(context.texts.includes('4'));
});

check('Game Over motivates honestly and marks persistent Coins', () => {
  const normal = makeRenderer();
  normal.renderer.drawGameOver(80, 100, 7, 1, { isNewBest: false, muted: false });
  assert(normal.context.texts.includes('21 TO NEW BEST'));
  assert(!normal.context.texts.includes('NEW BEST'));
  assert(normal.context.texts.includes('COINS 7  •  SAVED'));
  assert(normal.context.texts.includes('TAP / R TO RESTART'));

  const record = makeRenderer();
  record.renderer.drawGameOver(120, 120, 7, 1, { isNewBest: true, muted: false });
  assert(record.context.texts.includes('NEW BEST'));
  assert(!record.context.texts.some((text) => text.endsWith('TO NEW BEST')));
});

check('first RISK teaches streak, then multiplier feedback takes over', () => {
  const stored = [];
  const game = {
    multiplier: CONFIG.MULTIPLIER_START,
    riskStreak: 0,
    pathReward: 0,
    distanceScore: 0,
    score: 0,
    floatingRewards: [],
    player: { x: 270, y: 840 },
    riskHintSeen: false,
    storage: { set(key, value) { stored.push([key, value]); } },
    feel: null,
    pushFloat: Game.prototype.pushFloat
  };

  Game.prototype.applyReward.call(game, 'RISKY', true, true);
  assert(game.floatingRewards[0].subtitle === 'RISK BUILDS STREAK');
  assert(stored.some(([key, value]) => key === 'riskHintSeen' && value === true));
  assert(game.pathReward === CONFIG.REWARDS.RISKY);

  Game.prototype.applyReward.call(game, 'RISKY', true, true);
  assert(game.floatingRewards[1].subtitle === 'STREAK 2 • SCORE x1.5');
  assert(game.pathReward === CONFIG.REWARDS.RISKY * 2, 'reward still uses multiplier before growth');
});

check('starting the first run persists onboarding without changing run rules', () => {
  const stored = [];
  const game = {
    isRunning: true,
    state: 'START',
    showFirstRunHints: true,
    storage: {
      set(key, value) { stored.push([key, value]); },
      getCoins() { return 5; }
    },
    score: 99,
    distanceScore: 99,
    pathReward: 10,
    multiplier: 3,
    riskStreak: 4,
    currentSpeed: 600,
    runTime: 40,
    floatingRewards: [{}],
    coins: 5,
    feel: { reset() {} },
    player: { reset() {} },
    track: { reset() {} },
    unlockAudio() {}
  };
  Game.prototype.start.call(game);
  assert(game.showFirstRunHints === false);
  assert(stored.some(([key, value]) => key === 'onboardingSeen' && value === true));
  assert(game.state === 'PLAYING');
  assert(game.score === 0 && game.riskStreak === 0 && game.multiplier === CONFIG.MULTIPLIER_START);
  assert(game.coins === 5);
});

check('Phase 8 leaves gameplay balance invariants unchanged', () => {
  assert(CONFIG.PLAYER_SPEED === 420);
  assert(CONFIG.TRACK_SPEED_START === 300);
  assert(CONFIG.TRACK_SPEED_MAX === 720);
  assert(CONFIG.TRACK_SPEED_TAU === 70);
  assert(CONFIG.MULTIPLIER_STEP === 0.5);
  assert(CONFIG.MULTIPLIER_MAX === 5);
  assert(CONFIG.COIN_VALUE === 1);
});

function makeAudioStub() {
  const names = [];
  return {
    names,
    play(name) {
      names.push(name);
      return true;
    }
  };
}

check('successful RISK and DUAL_RISK feel visually and have sound effects, but no meow', () => {
  const audio = makeAudioStub();
  const feel = new GameFeel(audio);
  const game = {
    multiplier: CONFIG.MULTIPLIER_START,
    riskStreak: 0,
    pathReward: 0,
    distanceScore: 0,
    score: 0,
    floatingRewards: [],
    player: { x: 270, y: 840 },
    riskHintSeen: true,
    storage: { set() {} },
    feel,
    pushFloat: Game.prototype.pushFloat
  };

  Game.prototype.applyReward.call(game, 'SAFE', false, true);
  assert(audio.names.includes('safe'));

  Game.prototype.applyReward.call(game, 'RISKY', true, true);
  assert(!audio.names.includes('meow'), 'RISK must not meow any more');
  assert(feel.flash > 0, 'RISK keeps its visual flash');
  assert(feel.playerPulse > 0, 'RISK keeps the cat pulse');

  audio.names.length = 0;
  Game.prototype.applyReward.call(game, 'RISKY_HARD', true, true);
  assert(!audio.names.includes('meow'), 'DUAL_RISK path must not meow');
});

check('mute, pause and ad keep sound effects silent', () => {
  const audio = new AudioService();
  audio.unlocked = true;
  audio.ctx = {
    state: 'running',
    currentTime: 1,
    resume() { return Promise.resolve(); },
    suspend() { return Promise.resolve(); }
  };

  audio.setMuted(true);
  assert(audio.play('coin') === false, 'muted must stay silent');
  audio.setMuted(false);

  audio.setAdPaused(true);
  assert(audio.play('coin') === false, 'ad pause must stay silent');
  audio.setAdPaused(false);

  audio.setPlatformPaused(true);
  assert(audio.play('coin') === false, 'platform pause must stay silent');
  audio.setPlatformPaused(false);
  assert(typeof audio.playMeow === 'undefined', 'the meow code is gone');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 8 checks passed');
}
