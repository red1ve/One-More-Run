import fs from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { AudioService } from '../src/services/AudioService.js';
import { YandexService } from '../src/services/YandexService.js';
import { TouchInput } from '../src/input/TouchInput.js';

const results = [];

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    await fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

function silentLogger() {
  return { warn() {} };
}

function makeConfig(overrides = {}) {
  return {
    ...CONFIG.YANDEX,
    ...overrides
  };
}

function makeReadySdk(overrides = {}) {
  return {
    features: {
      LoadingAPI: { ready() {} },
      GameplayAPI: { start() {}, stop() {} }
    },
    isAvailableMethod: async () => true,
    leaderboards: { setScore: async () => {} },
    adv: {
      showFullscreenAdv({ callbacks }) {
        callbacks.onOpen?.();
        callbacks.onClose?.(true);
      }
    },
    on() {},
    ...overrides
  };
}

await check('standalone mode works without YaGames or document', async () => {
  const service = new YandexService({
    environment: {},
    document: null,
    config: makeConfig(),
    logger: silentLogger()
  });
  assert(await service.init() === false);
  assert(service.state === 'unavailable');
  assert(service.isReady() === false);
  assert(service.getDetectedLanguage() === 'en');
  assert(service.getLanguage() === 'en');
  assert(await service.submitScore(100) === false);
  assert((await service.showInterstitial()).attempted === false);
});

await check('SDK language en selects the English UI', async () => {
  const sdk = makeReadySdk({ environment: { i18n: { lang: 'en' } } });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  assert(service.getDetectedLanguage() === 'en');
  assert(service.getLanguage() === 'en');
});

await check('SDK language ru selects the Russian UI', async () => {
  const sdk = makeReadySdk({ environment: { i18n: { lang: 'ru' } } });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  assert(service.getDetectedLanguage() === 'ru');
  assert(service.getLanguage() === 'ru', 'Russian UI is available since Phase 4');
});

await check('CIS languages (uk, be, kk, uz) get the Russian UI', async () => {
  for (const lang of ['uk', 'be', 'kk', 'uz']) {
    const sdk = makeReadySdk({ environment: { i18n: { lang } } });
    const service = new YandexService({
      environment: { YaGames: { init: async () => sdk } },
      config: makeConfig(),
      logger: silentLogger()
    });
    await service.init();
    assert(service.getDetectedLanguage() === lang);
    assert(service.getLanguage() === 'ru', `${lang} should show Russian`);
  }
});

await check('unknown SDK language falls back to English', async () => {
  const sdk = makeReadySdk({ environment: { i18n: { lang: 'tr' } } });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  assert(service.getDetectedLanguage() === 'tr');
  assert(service.getLanguage() === 'en');
});

await check('language detection happens before pending gameplay starts', async () => {
  const order = [];
  const sdk = makeReadySdk({
    environment: {
      i18n: {
        get lang() {
          order.push('language');
          return 'ru';
        }
      }
    },
    features: {
      LoadingAPI: { ready() {} },
      GameplayAPI: {
        start() { order.push('start'); },
        stop() {}
      }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  service.setGameplayActive(true);
  await service.init();
  assert(order.join(',') === 'language,start', `startup order: ${order.join(',')}`);
});

await check('slow SDK loading stays pending and initializes when the script arrives', async () => {
  const listeners = {};
  const environment = {};
  const sdk = makeReadySdk({ environment: { i18n: { lang: 'en' } } });
  const document = {
    createElement() {
      return {
        dataset: {},
        addEventListener(name, callback) {
          listeners[name] = callback;
        }
      };
    },
    head: { appendChild() {} }
  };
  const service = new YandexService({
    environment,
    document,
    config: makeConfig(),
    logger: silentLogger()
  });
  const initialization = service.init();
  assert(service.state === 'loading');
  await Promise.resolve();
  assert(service.state === 'loading', 'slow SDK must not fail on an arbitrary timer');
  environment.YaGames = { init: async () => sdk };
  listeners.load();
  assert(await initialization === true);
  assert(service.state === 'ready');
});

await check('SDK initialization is asynchronous and runs once', async () => {
  let initCalls = 0;
  let readyCalls = 0;
  const sdk = makeReadySdk({
    features: {
      LoadingAPI: { ready() { readyCalls += 1; } },
      GameplayAPI: { start() {}, stop() {} }
    }
  });
  const environment = {
    YaGames: {
      async init() {
        initCalls += 1;
        return sdk;
      }
    }
  };
  const service = new YandexService({
    environment,
    config: makeConfig(),
    logger: silentLogger()
  });
  service.notifyGameReady();
  const first = service.init();
  const second = service.init();
  assert(first === second, 'init must return the same promise');
  assert(await first === true);
  assert(initCalls === 1, `init called ${initCalls} times`);
  assert(readyCalls === 1, `LoadingAPI.ready called ${readyCalls} times`);
  service.notifyGameReady();
  assert(readyCalls === 1, 'LoadingAPI.ready must only run once');
});

await check('Game Ready is not sent before the START UI is ready', async () => {
  let readyCalls = 0;
  const sdk = makeReadySdk({
    environment: { i18n: { lang: 'en' } },
    features: {
      LoadingAPI: { ready() { readyCalls += 1; } },
      GameplayAPI: { start() {}, stop() {} }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  assert(readyCalls === 0, 'ready must wait for the first completed render');
  service.notifyGameReady();
  service.notifyGameReady();
  assert(readyCalls === 1, `ready called ${readyCalls} times`);
});

await check('SDK initialization errors stay contained', async () => {
  const service = new YandexService({
    environment: { YaGames: { init: async () => { throw new Error('offline'); } } },
    config: makeConfig(),
    logger: silentLogger()
  });
  assert(await service.init() === false);
  assert(service.state === 'failed');
});

await check('platform pause and resume handlers are subscribed once', async () => {
  const handlers = {};
  let pauses = 0;
  let resumes = 0;
  const sdk = makeReadySdk({
    on(name, callback) {
      handlers[name] = callback;
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  service.setLifecycleHandlers({
    onPause: () => { pauses += 1; },
    onResume: () => { resumes += 1; }
  });
  await service.init();
  handlers.game_api_pause();
  handlers.game_api_resume();
  assert(pauses === 1 && resumes === 1);
});

await check('GameplayAPI follows active and paused gameplay', async () => {
  const events = [];
  const sdk = makeReadySdk({
    features: {
      LoadingAPI: { ready() {} },
      GameplayAPI: {
        start() { events.push('start'); },
        stop() { events.push('stop'); }
      }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  service.setGameplayActive(true);
  await service.init();
  service.setGameplayActive(true);
  service.setGameplayActive(false);
  service.setGameplayActive(false);
  assert(events.join(',') === 'start,stop', `events: ${events.join(',')}`);
});

await check('leaderboard uses current API and configured technical name', async () => {
  const calls = [];
  const sdk = makeReadySdk({
    isAvailableMethod: async (name) => {
      calls.push(['available', name]);
      return true;
    },
    leaderboards: {
      async setScore(name, score) {
        calls.push(['score', name, score]);
      }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  assert(await service.submitScore(321) === true);
  assert(calls[0][1] === 'leaderboards.setScore');
  assert(calls[1][1] === CONFIG.YANDEX.LEADERBOARD_NAME);
  assert(calls[1][2] === 321);
  assert(await service.submitScore(321) === false, 'same score should not be resubmitted');
});

await check('unavailable or unauthorized leaderboard never throws', async () => {
  const unavailable = makeReadySdk({ isAvailableMethod: async () => false });
  const service = new YandexService({
    environment: { YaGames: { init: async () => unavailable } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  assert(await service.submitScore(100) === false);

  service.ysdk.isAvailableMethod = async () => { throw new Error('unauthorized'); };
  assert(await service.submitScore(200) === false);
});

await check('Game submits leaderboard score only for NEW BEST', async () => {
  const submitted = [];
  const platform = {
    submitScore(score) { submitted.push(score); return Promise.resolve(true); },
    recordRunCompleted() {},
    setGameplayActive() {}
  };
  const game = {
    state: 'PLAYING',
    distanceScore: 90,
    pathReward: 10,
    bestScore: 100,
    storage: { set() {} },
    platform,
    player: { x: 0, y: 0 },
    feel: null,
    multiplier: 2,
    riskStreak: 2,
    isGameplayPaused: () => false,
    syncGameplayLifecycle: Game.prototype.syncGameplayLifecycle
  };
  Game.prototype.gameOver.call(game);
  assert(submitted.length === 0, 'tie must not submit');

  game.state = 'PLAYING';
  game.distanceScore = 101;
  game.pathReward = 0;
  Game.prototype.gameOver.call(game);
  await Promise.resolve();
  assert(submitted.length === 1 && submitted[0] === 101);
});

await check('interstitial respects run cooldown and current callback API', async () => {
  let adCalls = 0;
  const sdk = makeReadySdk({
    adv: {
      showFullscreenAdv({ callbacks }) {
        adCalls += 1;
        callbacks.onOpen();
        callbacks.onClose(true);
      }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig({ INTERSTITIAL_COOLDOWN_RUNS: 3 }),
    logger: silentLogger()
  });
  await service.init();
  service.recordRunCompleted();
  service.recordRunCompleted();
  assert((await service.showInterstitial()).attempted === false);
  service.recordRunCompleted();
  const result = await service.showInterstitial();
  assert(result.attempted && result.wasShown);
  assert(adCalls === 1);
  assert((await service.showInterstitial()).attempted === false, 'cooldown must block repeat');
});

await check('ad errors and unavailable ads continue safely', async () => {
  const sdk = makeReadySdk({
    adv: {
      showFullscreenAdv({ callbacks }) {
        callbacks.onError(new Error('no fill'));
        callbacks.onClose(false);
      }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig({ INTERSTITIAL_COOLDOWN_RUNS: 1 }),
    logger: silentLogger()
  });
  await service.init();
  service.recordRunCompleted();
  const result = await service.showInterstitial();
  assert(result.attempted === true && result.wasShown === false);

  service.ysdk.adv = null;
  service.recordRunCompleted();
  assert((await service.showInterstitial()).attempted === false);
});

await check('ad restart is single-shot and waits for close', async () => {
  let resolveAd;
  const platform = {
    shouldShowInterstitial: () => true,
    showInterstitial: () => new Promise((resolve) => { resolveAd = resolve; })
  };
  const game = {
    state: 'GAMEOVER',
    platform,
    launchPending: false,
    adFinished: false,
    hidden: false,
    platformPaused: false,
    adPaused: false,
    started: 0,
    audio: { setAdPaused() {} },
    setAdPaused: Game.prototype.setAdPaused,
    syncGameplayLifecycle() {},
    completePendingLaunch: Game.prototype.completePendingLaunch,
    start() { this.started += 1; this.state = 'PLAYING'; }
  };
  assert(Game.prototype.tryLaunch.call(game) === true);
  assert(Game.prototype.tryLaunch.call(game) === false, 'second launch must be ignored');
  assert(game.started === 0, 'run must wait for ad result');
  resolveAd({ attempted: true, wasShown: true });
  await Promise.resolve();
  await Promise.resolve();
  assert(game.started === 1, `run started ${game.started} times`);
});

await check('hidden page cancels post-ad auto-launch', async () => {
  let resolveAd;
  const game = {
    state: 'GAMEOVER',
    platform: {
      shouldShowInterstitial: () => true,
      showInterstitial: () => new Promise((resolve) => { resolveAd = resolve; })
    },
    launchPending: false,
    adFinished: false,
    hidden: false,
    platformPaused: false,
    audio: { setAdPaused() {} },
    setAdPaused: Game.prototype.setAdPaused,
    syncGameplayLifecycle() {},
    completePendingLaunch: Game.prototype.completePendingLaunch,
    started: 0,
    start() { this.started += 1; }
  };
  Game.prototype.tryLaunch.call(game);
  game.hidden = true;
  resolveAd({ attempted: true, wasShown: true });
  await Promise.resolve();
  await Promise.resolve();
  assert(game.started === 0);
  assert(game.launchPending === false);
});

await check('ad restart waits for platform resume without duplicating run', async () => {
  let resolveAd;
  const game = {
    state: 'GAMEOVER',
    platform: {
      shouldShowInterstitial: () => true,
      showInterstitial: () => new Promise((resolve) => { resolveAd = resolve; }),
      setGameplayActive() {}
    },
    launchPending: false,
    adFinished: false,
    hidden: false,
    platformPaused: false,
    adPaused: false,
    lastTime: 0,
    audio: { setAdPaused() {}, setPlatformPaused() {} },
    setAdPaused: Game.prototype.setAdPaused,
    syncGameplayLifecycle: Game.prototype.syncGameplayLifecycle,
    isGameplayPaused: Game.prototype.isGameplayPaused,
    completePendingLaunch: Game.prototype.completePendingLaunch,
    started: 0,
    start() { this.started += 1; this.state = 'PLAYING'; }
  };
  Game.prototype.tryLaunch.call(game);
  Game.prototype.setPlatformPaused.call(game, true);
  resolveAd({ attempted: true, wasShown: true });
  await Promise.resolve();
  await Promise.resolve();
  assert(game.started === 0, 'must wait while platform pause is active');
  Game.prototype.setPlatformPaused.call(game, false);
  assert(game.started === 1);
  Game.prototype.setPlatformPaused.call(game, false);
  assert(game.started === 1, 'resume must not duplicate the run');
});

await check('all simultaneous pause reasons must clear before gameplay resumes', async () => {
  const events = [];
  const sdk = makeReadySdk({
    environment: { i18n: { lang: 'en' } },
    features: {
      LoadingAPI: { ready() {} },
      GameplayAPI: {
        start() { events.push('start'); },
        stop() { events.push('stop'); }
      }
    }
  });
  const service = new YandexService({
    environment: { YaGames: { init: async () => sdk } },
    config: makeConfig(),
    logger: silentLogger()
  });
  await service.init();
  events.length = 0;

  const game = {
    state: 'PLAYING',
    hidden: false,
    platformPaused: false,
    adPaused: false,
    launchPending: false,
    adFinished: false,
    lastTime: 0,
    platform: service,
    audio: {
      setHidden() {},
      setPlatformPaused() {},
      setAdPaused() {}
    },
    isGameplayPaused: Game.prototype.isGameplayPaused,
    syncGameplayLifecycle: Game.prototype.syncGameplayLifecycle
  };

  game.syncGameplayLifecycle();
  Game.prototype.setHidden.call(game, true);
  Game.prototype.setPlatformPaused.call(game, true);
  Game.prototype.setHidden.call(game, false);
  assert(game.isGameplayPaused(), 'platform pause must still block gameplay');
  Game.prototype.setPlatformPaused.call(game, false);
  Game.prototype.setAdPaused.call(game, true);
  Game.prototype.setHidden.call(game, true);
  Game.prototype.setAdPaused.call(game, false);
  assert(game.isGameplayPaused(), 'hidden pause must still block gameplay');
  Game.prototype.setHidden.call(game, false);

  assert(
    events.join(',') === 'start,stop,start,stop,start',
    `GameplayAPI events: ${events.join(',')}`
  );
});

await check('visibility and ad pause freeze gameplay and audio', () => {
  const audio = new AudioService();
  audio.unlocked = true;
  audio.ctx = {
    state: 'suspended',
    currentTime: 1,
    resume: async () => {},
    suspend: async () => {}
  };
  audio.setAdPaused(true);
  assert(audio.play('risk') === false);
  assert(audio.play('meow') === false);
  audio.setAdPaused(false);
  audio.setPlatformPaused(true);
  assert(audio.play('coin') === false);

  const game = {
    state: 'PLAYING',
    hidden: true,
    platformPaused: false,
    adPaused: false,
    runTime: 12,
    score: 200,
    isGameplayPaused: Game.prototype.isGameplayPaused
  };
  Game.prototype.update.call(game, 1);
  assert(game.runTime === 12 && game.score === 200);
});

await check('visibility resume never auto-starts START or GAMEOVER', () => {
  for (const state of ['START', 'GAMEOVER']) {
    const game = {
      state,
      hidden: true,
      platformPaused: false,
      adPaused: false,
      launchPending: false,
      adFinished: false,
      lastTime: 0,
      audio: { setHidden() {} },
      platform: { setGameplayActive() {} },
      isGameplayPaused: Game.prototype.isGameplayPaused,
      syncGameplayLifecycle: Game.prototype.syncGameplayLifecycle
    };
    Game.prototype.setHidden.call(game, false);
    assert(game.state === state);
  }
});

await check('resized touch coordinates stay in logical canvas space', () => {
  let width = 270;
  const touch = Object.create(TouchInput.prototype);
  touch.canvas = {
    width: 540,
    getBoundingClientRect() {
      return { left: 10, width };
    }
  };

  assert(touch.touchLogicalX({ clientX: 145 }) === 270);
  width = 135;
  assert(touch.touchLogicalX({ clientX: 77.5 }) === 270);
  width = 0;
  assert(touch.touchLogicalX({ clientX: 10 }) === null);
});

await check('game area has scoped context-menu and long-press protection', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert(main.includes("gameArea.addEventListener('contextmenu'"));
  assert(main.includes('event.preventDefault()'));
  assert(css.includes('touch-action: none'));
  assert(css.includes('-webkit-touch-callout: none'));
  assert(html.includes('<html lang="en">'), 'document must not claim untranslated Russian UI');
});

await check('production service contains no deprecated leaderboard API', () => {
  const source = fs.readFileSync(new URL('../src/services/YandexService.js', import.meta.url), 'utf8');
  assert(!source.includes('getLeaderboards'), 'deprecated getLeaderboards API found');
  assert(source.includes('leaderboards.setScore'), 'current leaderboard API missing');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 7 checks passed');
}
