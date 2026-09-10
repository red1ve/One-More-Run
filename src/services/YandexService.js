import { CONFIG } from '../config.js';

export class YandexService {
  constructor(options = {}) {
    this.config = options.config || CONFIG.YANDEX;
    this.environment = options.environment || globalThis;
    this.document = options.document || this.environment.document || null;
    this.logger = options.logger || console;

    this.state = 'unavailable';
    this.ysdk = null;
    this.initPromise = null;
    this.gameReadyRequested = false;
    this.gameReadySent = false;
    this.gameplayActive = false;
    this.gameplayStateSent = null;
    this.completedRuns = 0;
    this.lastAdAttemptRun = 0;
    this.adPromise = null;
    this.lastSubmittedScore = null;
    this.scorePromise = null;
    this.lifecycleHandlers = { onPause: null, onResume: null };

    this.handlePlatformPause = () => this.lifecycleHandlers.onPause?.();
    this.handlePlatformResume = () => this.lifecycleHandlers.onResume?.();
  }

  isAvailable() {
    return this.state === 'ready';
  }

  isReady() {
    return this.state === 'ready' && this.ysdk !== null;
  }

  setLifecycleHandlers(handlers = {}) {
    this.lifecycleHandlers.onPause = handlers.onPause || null;
    this.lifecycleHandlers.onResume = handlers.onResume || null;
  }

  init() {
    if (this.initPromise) return this.initPromise;

    this.state = 'loading';
    this.initPromise = this.initialize().catch((error) => {
      this.state = 'failed';
      this.ysdk = null;
      this.log('Yandex Games SDK setup failed; standalone mode remains active.', error);
      return false;
    });
    return this.initPromise;
  }

  async initialize() {
    const loaded = await this.ensureSdkLoaded();
    const YaGames = this.environment.YaGames;
    if (!loaded || !YaGames || typeof YaGames.init !== 'function') {
      this.state = 'unavailable';
      return false;
    }

    try {
      this.ysdk = await YaGames.init();
      this.state = 'ready';
      this.subscribeToPlatformEvents();
      this.flushGameReady();
      this.flushGameplayState();
      return true;
    } catch (error) {
      this.state = 'failed';
      this.ysdk = null;
      this.log('Yandex Games SDK initialization failed; standalone mode remains active.', error);
      return false;
    }
  }

  ensureSdkLoaded() {
    if (this.environment.YaGames) return Promise.resolve(true);
    if (!this.document?.createElement || !this.document?.head) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        this.environment.clearTimeout?.(timeoutId);
        resolve(loaded && !!this.environment.YaGames);
      };

      const script = this.document.createElement('script');
      script.src = this.config.SDK_URL;
      script.async = true;
      script.dataset.yandexGamesSdk = 'true';
      script.addEventListener('load', () => finish(true), { once: true });
      script.addEventListener('error', () => finish(false), { once: true });

      const timeoutId = this.environment.setTimeout?.(
        () => finish(false),
        this.config.SDK_LOAD_TIMEOUT_MS
      );
      this.document.head.appendChild(script);
    });
  }

  subscribeToPlatformEvents() {
    if (typeof this.ysdk?.on !== 'function') return;
    this.ysdk.on('game_api_pause', this.handlePlatformPause);
    this.ysdk.on('game_api_resume', this.handlePlatformResume);
  }

  notifyGameReady() {
    this.gameReadyRequested = true;
    this.flushGameReady();
  }

  flushGameReady() {
    if (!this.isReady() || !this.gameReadyRequested || this.gameReadySent) return false;
    const ready = this.ysdk.features?.LoadingAPI?.ready;
    if (typeof ready !== 'function') return false;
    try {
      ready.call(this.ysdk.features.LoadingAPI);
      this.gameReadySent = true;
      return true;
    } catch (error) {
      this.log('Yandex LoadingAPI.ready failed.', error);
      return false;
    }
  }

  setGameplayActive(active) {
    this.gameplayActive = !!active;
    return this.flushGameplayState();
  }

  flushGameplayState() {
    if (!this.isReady() || this.gameplayStateSent === this.gameplayActive) return false;
    const gameplayApi = this.ysdk.features?.GameplayAPI;
    const method = this.gameplayActive ? gameplayApi?.start : gameplayApi?.stop;
    if (typeof method !== 'function') return false;

    try {
      method.call(gameplayApi);
      this.gameplayStateSent = this.gameplayActive;
      return true;
    } catch (error) {
      this.log('Yandex GameplayAPI state update failed.', error);
      return false;
    }
  }

  async submitScore(score) {
    const value = Math.floor(Number(score));
    if (!this.isReady() || !Number.isFinite(value) || value < 0) return false;
    if (this.lastSubmittedScore !== null && value <= this.lastSubmittedScore) return false;
    if (this.scorePromise) return this.scorePromise;

    this.scorePromise = this.sendScore(value);
    try {
      return await this.scorePromise;
    } finally {
      this.scorePromise = null;
    }
  }

  async sendScore(score) {
    try {
      if (typeof this.ysdk.isAvailableMethod !== 'function') return false;
      const available = await this.ysdk.isAvailableMethod('leaderboards.setScore');
      if (!available || typeof this.ysdk.leaderboards?.setScore !== 'function') return false;

      await this.ysdk.leaderboards.setScore(this.config.LEADERBOARD_NAME, score);
      this.lastSubmittedScore = score;
      return true;
    } catch (error) {
      this.log('Yandex leaderboard score submission skipped.', error);
      return false;
    }
  }

  recordRunCompleted() {
    this.completedRuns += 1;
  }

  shouldShowInterstitial() {
    if (!this.config.ADS_ENABLED || !this.isReady() || this.adPromise) return false;
    return this.completedRuns - this.lastAdAttemptRun >= this.config.INTERSTITIAL_COOLDOWN_RUNS;
  }

  showInterstitial(callbacks = {}) {
    if (!this.shouldShowInterstitial()) {
      return Promise.resolve({ attempted: false, wasShown: false });
    }

    const show = this.ysdk?.adv?.showFullscreenAdv;
    if (typeof show !== 'function') {
      return Promise.resolve({ attempted: false, wasShown: false });
    }

    this.lastAdAttemptRun = this.completedRuns;
    this.adPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        callbacks.onClose?.(result.wasShown);
        resolve(result);
      };

      try {
        show.call(this.ysdk.adv, {
          callbacks: {
            onOpen: () => callbacks.onOpen?.(),
            onClose: (wasShown) => finish({ attempted: true, wasShown: !!wasShown }),
            onError: (error) => {
              this.log('Yandex fullscreen ad was not shown.', error);
              finish({ attempted: true, wasShown: false, error });
            }
          }
        });
      } catch (error) {
        this.log('Yandex fullscreen ad call failed.', error);
        finish({ attempted: true, wasShown: false, error });
      }
    });

    return this.adPromise.finally(() => {
      this.adPromise = null;
    });
  }

  log(message, error) {
    this.logger?.warn?.(message, error);
  }
}
