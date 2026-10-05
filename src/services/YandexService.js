import { CONFIG } from '../config.js';

// Ответ getEntries → { entries, userRank }. Места в ответе обычно с 1; если платформа вернула
// первое место как 0, сдвигаем всё на 1. Пропуск мест между записями помечается gapBefore
// (между верхом таблицы и окрестностями игрока рисуется «…»).
function normalizeLeaderboard(response) {
  const raw = Array.isArray(response?.entries) ? response.entries : [];
  const rawUserRank = Number(response?.userRank);
  const hasUser = Number.isFinite(rawUserRank) && rawUserRank > 0;
  const byRank = new Map();
  for (const item of raw) {
    const rank = Number(item?.rank);
    const score = Number(item?.score);
    if (!Number.isFinite(rank) || !Number.isFinite(score) || rank < 0 || byRank.has(rank)) continue;
    const name = typeof item?.player?.publicName === 'string' ? item.player.publicName.trim() : '';
    byRank.set(rank, { rank, score: Math.floor(score), name, isYou: hasUser && rank === rawUserRank });
  }
  const entries = [...byRank.values()].sort((a, b) => a.rank - b.rank);
  const shift = entries.length > 0 && entries[0].rank === 0 ? 1 : 0;
  let previous = 0;
  for (const entry of entries) {
    entry.rank += shift;
    entry.gapBefore = previous > 0 && entry.rank - previous > 1;
    previous = entry.rank;
  }
  return { entries, userRank: hasUser ? rawUserRank + shift : null };
}

// Придуманная таблица для npm run dev (config.DEV_PLATFORM_STUB), чтобы проверить экран без SDK.
function devLeaderboard(myBest) {
  const names = ['Мурка', 'Barsik', 'Ginger', 'Лапка', 'Tux', 'Рыжик', 'Mochi', 'Пушок', 'Luna', 'Снежок'];
  const entries = names.map((name, index) => ({
    rank: index + 1, score: 21400 - index * 1850, name, isYou: false, gapBefore: false
  }));
  entries.push(
    { rank: 36, score: Math.floor(myBest) + 90, name: 'Cookie', isYou: false, gapBefore: true },
    { rank: 37, score: Math.floor(myBest), name: '', isYou: true, gapBefore: false },
    { rank: 38, score: Math.max(0, Math.floor(myBest) - 40), name: 'Лисёнок', isYou: false, gapBefore: false }
  );
  return { ok: true, entries, userRank: 37, authorized: true };
}

export class YandexService {
  constructor(options = {}) {
    this.config = options.config || CONFIG.YANDEX;
    this.environment = options.environment || globalThis;
    this.document = options.document || this.environment.document || null;
    this.logger = options.logger || console;

    this.state = 'unavailable';
    this.ysdk = null;
    this.initPromise = null;
    this.detectedLanguage = this.config.DEFAULT_LANGUAGE;
    this.language = this.config.DEFAULT_LANGUAGE;
    this.gameReadyRequested = false;
    this.gameReadySent = false;
    this.gameplayActive = false;
    this.gameplayStateSent = null;
    this.completedRuns = 0;
    this.lastAdAttemptRun = 0;
    this.adPromise = null;
    this.lastSubmittedScore = null;
    this.scorePromise = null;
    this.playerPromise = null;
    this.authorized = false;
    this.pendingCloudData = null;
    this.cloudTimer = null;
    this.lastCloudSaveAt = 0;
    this.leaderboardCache = null;
    this.reviewRequested = false;
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
      this.detectLanguage();
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

  detectLanguage() {
    const sdkLanguage = this.ysdk?.environment?.i18n?.lang;
    const normalized = typeof sdkLanguage === 'string'
      ? sdkLanguage.trim().toLowerCase().split('-')[0]
      : '';
    this.detectedLanguage = normalized || this.config.DEFAULT_LANGUAGE;
    const russianUi = (this.config.RUSSIAN_UI_LANGUAGES || ['ru']).includes(this.detectedLanguage);
    const language = russianUi ? 'ru' : this.detectedLanguage;
    this.language = this.config.SUPPORTED_LANGUAGES.includes(language)
      ? language
      : this.config.DEFAULT_LANGUAGE;
    return this.language;
  }

  getLanguage() {
    return this.language;
  }

  getDetectedLanguage() {
    return this.detectedLanguage;
  }

  ensureSdkLoaded() {
    if (this.environment.YaGames) return Promise.resolve(true);
    if (!this.document?.createElement || !this.document?.head) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        resolve(loaded && !!this.environment.YaGames);
      };

      const script = this.document.createElement('script');
      script.src = this.config.SDK_URL;
      script.async = true;
      script.dataset.yandexGamesSdk = 'true';
      script.addEventListener('load', () => finish(true), { once: true });
      script.addEventListener('error', () => finish(false), { once: true });
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

  // --- Игрок и его данные в облаке Яндекса (рекорд, монеты, подсказки) ---
  // Каждый вызов защищён: любая ошибка платформы даёт «нет данных», игра продолжает работать
  // на локальном сохранении.

  async getPlayer() {
    if (!this.isReady() || typeof this.ysdk.getPlayer !== 'function') return null;
    if (!this.playerPromise) {
      this.playerPromise = Promise.resolve()
        .then(() => this.ysdk.getPlayer({ scopes: false }))
        .catch((error) => {
          this.log('Yandex player is not available.', error);
          return null;
        });
    }
    const player = await this.playerPromise;
    if (!player) this.playerPromise = null; // в следующий раз попробуем ещё раз
    return player;
  }

  isAuthorized() {
    return this.isReady() && this.authorized === true;
  }

  async refreshAuthorization() {
    const player = await this.getPlayer();
    this.authorized = !!player && typeof player.isAuthorized === 'function' && player.isAuthorized() === true;
    return this.authorized;
  }

  async loadCloudData() {
    try {
      const player = await this.getPlayer();
      if (!player || typeof player.getData !== 'function') return null;
      const data = await player.getData(this.config.CLOUD_KEYS);
      return data && typeof data === 'object' ? data : null;
    } catch (error) {
      this.log('Yandex cloud data load skipped.', error);
      return null;
    }
  }

  // Ставит запись в очередь. Платформа разрешает 100 запросов за 5 минут, поэтому пишем не чаще
  // CLOUD_SAVE_MIN_INTERVAL_MS: лишние сохранения склеиваются, уходит самое свежее состояние.
  saveCloudData(data) {
    if (!this.isReady() || !data || typeof data !== 'object') return false;
    this.pendingCloudData = { ...data };
    const wait = this.lastCloudSaveAt + this.config.CLOUD_SAVE_MIN_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.flushCloudData();
    } else if (!this.cloudTimer) {
      this.cloudTimer = setTimeout(() => {
        this.cloudTimer = null;
        this.flushCloudData();
      }, wait);
      this.cloudTimer.unref?.();
    }
    return true;
  }

  async flushCloudData() {
    const data = this.pendingCloudData;
    if (!data) return false;
    this.pendingCloudData = null;
    this.lastCloudSaveAt = Date.now();
    try {
      const player = await this.getPlayer();
      if (!player || typeof player.setData !== 'function') return false;
      await player.setData(data, true);
      return true;
    } catch (error) {
      this.log('Yandex cloud data save skipped.', error);
      return false;
    }
  }

  // --- Вход в аккаунт (нужен для таблицы лидеров, оценки и облака) ---

  async openAuth() {
    if (!this.isReady() || typeof this.ysdk.auth?.openAuthDialog !== 'function') return false;
    try {
      await this.ysdk.auth.openAuthDialog();
    } catch (error) {
      this.log('Yandex authorization was not completed.', error);
      return false;
    }
    // После входа игрок, таблица и «последний отправленный счёт» устарели.
    this.playerPromise = null;
    this.leaderboardCache = null;
    this.lastSubmittedScore = null;
    return this.refreshAuthorization();
  }

  // --- Таблица лидеров ---

  canShowLeaderboard() {
    if (this.isReady()) return typeof this.ysdk?.leaderboards?.getEntries === 'function';
    return !!this.config.DEV_PLATFORM_STUB;
  }

  // Возвращает { ok, entries, userRank, authorized } или { ok: false, reason }.
  // entries: { rank (с 1), score, name, isYou, gapBefore }, по возрастанию места.
  async getLeaderboard({ myBest = 0 } = {}) {
    if (!this.isReady()) {
      return this.config.DEV_PLATFORM_STUB ? devLeaderboard(myBest) : { ok: false, reason: 'unavailable' };
    }
    const cache = this.leaderboardCache;
    if (cache && Date.now() - cache.at < this.config.LEADERBOARD_CACHE_MS) return cache.result;
    if (typeof this.ysdk.leaderboards?.getEntries !== 'function') return { ok: false, reason: 'unavailable' };

    try {
      const response = await this.ysdk.leaderboards.getEntries(this.config.LEADERBOARD_NAME, {
        quantityTop: this.config.LEADERBOARD_TOP,
        includeUser: true,
        quantityAround: this.config.LEADERBOARD_AROUND
      });
      const authorized = await this.refreshAuthorization();
      const result = { ok: true, ...normalizeLeaderboard(response), authorized };
      this.leaderboardCache = { at: Date.now(), result };
      return result;
    } catch (error) {
      this.log('Yandex leaderboard is not available.', error);
      return { ok: false, reason: 'error' };
    }
  }

  // --- Оценка игры (один запрос за сессию, только когда платформа разрешает) ---

  async requestReview() {
    if (!this.isReady()) {
      return this.config.DEV_PLATFORM_STUB ? { asked: true, sent: false, simulated: true } : { asked: false, reason: 'UNAVAILABLE' };
    }
    if (this.reviewRequested) return { asked: false, reason: 'ALREADY_ASKED' };
    const feedback = this.ysdk.feedback;
    if (typeof feedback?.canReview !== 'function' || typeof feedback.requestReview !== 'function') {
      return { asked: false, reason: 'UNAVAILABLE' };
    }
    try {
      const { value, reason } = (await feedback.canReview()) || {};
      if (!value) return { asked: false, reason: reason || 'UNKNOWN' };
      this.reviewRequested = true;
      const result = (await feedback.requestReview()) || {};
      return { asked: true, sent: !!(result.feedbackSent ?? result.sentFeedback) };
    } catch (error) {
      this.log('Yandex review request skipped.', error);
      return { asked: false, reason: 'ERROR' };
    }
  }

  // --- Ярлык игры на экране ---

  async canShowShortcut() {
    if (!this.isReady()) return !!this.config.DEV_PLATFORM_STUB;
    if (typeof this.ysdk.shortcut?.canShowPrompt !== 'function') return false;
    try {
      const result = await this.ysdk.shortcut.canShowPrompt();
      return !!result?.canShow;
    } catch (error) {
      this.log('Yandex shortcut check skipped.', error);
      return false;
    }
  }

  async showShortcut() {
    if (!this.isReady()) return { accepted: !!this.config.DEV_PLATFORM_STUB };
    if (typeof this.ysdk.shortcut?.showPrompt !== 'function') return { accepted: false };
    try {
      const result = await this.ysdk.shortcut.showPrompt();
      return { accepted: result?.outcome === 'accepted' };
    } catch (error) {
      this.log('Yandex shortcut prompt skipped.', error);
      return { accepted: false };
    }
  }

  // --- Время сервера (забег дня): защищено от перевода часов на устройстве ---

  // Серверное время Яндекса в миллисекундах (UNIX) или null, если SDK нет или ответ не похож на время:
  // тогда игра берёт время устройства. Ответ ysdk.serverTime() ждём и как число, и как обещание.
  async getServerTime() {
    if (!this.isReady() || typeof this.ysdk.serverTime !== 'function') return null;
    try {
      const value = Number(await Promise.resolve(this.ysdk.serverTime()));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch (error) {
      this.log('Yandex server time skipped.', error);
      return null;
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

  // --- Реклама за вознаграждение (возрождение, ×2 монеты) ---
  // Награда выдаётся ТОЛЬКО если SDK вызвал onRewarded (реклама досмотрена).
  // В режиме разработки без SDK можно включить имитацию (config.DEV_REWARDED_STUB).

  canShowRewarded() {
    if (!this.config.ADS_ENABLED || this.adPromise) return false;
    if (this.isReady()) return typeof this.ysdk?.adv?.showRewardedVideo === 'function';
    return !!this.config.DEV_REWARDED_STUB;
  }

  showRewarded(callbacks = {}) {
    if (!this.canShowRewarded()) {
      return Promise.resolve({ attempted: false, rewarded: false });
    }
    // После рекламы за награду не показываем межстраничную на ближайшем рестарте.
    this.lastAdAttemptRun = this.completedRuns;
    this.adPromise = new Promise((resolve) => {
      let rewarded = false;
      let settled = false;
      let graceTimer = null;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (graceTimer) clearTimeout(graceTimer);
        callbacks.onClose?.(result);
        resolve(result);
      };

      if (!this.isReady()) {
        // Имитация для npm run dev: как будто реклама показана и досмотрена.
        callbacks.onOpen?.();
        setTimeout(() => finish({ attempted: true, rewarded: true, simulated: true }), 400);
        return;
      }

      try {
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => callbacks.onOpen?.(),
            onRewarded: () => {
              rewarded = true;
              // onRewarded мог прийти уже после onClose (порядок в документации
              // не указан): если окно ждёт — сразу засчитываем награду.
              if (graceTimer) finish({ attempted: true, rewarded: true });
            },
            onClose: () => {
              if (rewarded) {
                finish({ attempted: true, rewarded: true });
                return;
              }
              // Ждём немного: onRewarded может прийти чуть позже onClose.
              graceTimer = setTimeout(
                () => finish({ attempted: true, rewarded }),
                this.config.REWARDED_CLOSE_GRACE_MS ?? 250
              );
            },
            onError: (error) => {
              this.log('Yandex rewarded ad was not shown.', error);
              finish({ attempted: true, rewarded: false, error });
            }
          }
        });
      } catch (error) {
        this.log('Yandex rewarded ad call failed.', error);
        finish({ attempted: true, rewarded: false, error });
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
