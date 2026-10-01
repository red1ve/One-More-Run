import { t } from '../localization/i18n.js';
import { CONFIG, getTrackSpeed, getPlayerSpeed, getAssist } from '../config.js';
import { Renderer } from '../rendering/Renderer.js';
import { WorldCamera } from '../rendering/WorldCamera.js';
import { Player } from './Player.js';
import { playableXBounds } from './Corridor.js';
import { Track } from './Track.js';
import { GameFeel } from './GameFeel.js';
import { KeyboardInput } from '../input/KeyboardInput.js';
import { MouseInput } from '../input/MouseInput.js';
import { TouchInput } from '../input/TouchInput.js';
import { StorageService } from '../services/StorageService.js';
import { AudioService } from '../services/AudioService.js';
import { HapticsService } from '../services/HapticsService.js';

export class Game {
  constructor(canvas, platformService = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.storage = new StorageService();
    this.audio = new AudioService();
    this.platform = platformService;
    this.renderer = new Renderer(this.ctx, {
      onSpriteReady: () => {
        if (this.state === 'START') this.render();
      }
    });
    // Вибрация идёт вместе со звуком: звук выключен — телефон тоже молчит.
    this.haptics = new HapticsService({ isEnabled: () => !this.audio.muted });
    this.feel = new GameFeel(this.audio, this.haptics);
    this.keyboardInput = new KeyboardInput();
    this.mouseInput = new MouseInput(this.canvas);
    this.touchInput = new TouchInput(this.canvas);
    this.audio.setMuted(!!this.storage.get('audioMuted', false));
    this.audio.setVolume(this.storage.get('audioVolume', CONFIG.AUDIO.VOLUME_DEFAULT));

    this.player = new Player();
    this.track = new Track();
    this.camera = new WorldCamera();

    this.state = 'START';
    this.score = 0;
    this.distanceScore = 0;
    this.pathReward = 0;
    this.bestScore = this.storage.get('bestScore', 0);
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    this.coins = this.storage.getCoins();

    this.currentSpeed = CONFIG.TRACK_SPEED_START;
    this.runTime = 0;
    this.lastTime = 0;
    this.isRunning = false;
    this.floatingRewards = [];
    this.isNewBest = false;
    // Подсказка про выбор «шире / уже» показывается у первой развилки, пока игрок не прошёл ни одной.
    this.choiceHintSeen = !!this.storage.get('choiceHintSeen', false);
    this.riskHintSeen = !!this.storage.get('riskHintSeen', false);
    this.hidden = false;
    this.platformPaused = false;
    this.adPaused = false;
    this.userPaused = false; // игрок поставил забег на паузу кнопкой, P или Esc
    this.launchPending = false;
    this.adFinished = false;
    this.leaderboard = null; // null — закрыта; иначе { status, entries, userRank, authorized, signingIn }
    this.shortcutAvailable = false; // платформа разрешает предложить ярлык

    this.platform?.setLifecycleHandlers?.({
      onPause: () => this.setPlatformPaused(true),
      onResume: () => this.setPlatformPaused(false)
    });
  }

  unlockAudio() {
    this.audio?.unlock?.();
  }

  setHidden(hidden) {
    this.hidden = !!hidden;
    this.audio.setHidden(this.hidden);
    if (!this.hidden) this.lastTime = performance.now();
    if (this.hidden && this.launchPending && this.adFinished) {
      this.launchPending = false;
    }
    this.syncGameplayLifecycle?.();
  }

  setPlatformPaused(paused) {
    this.platformPaused = !!paused;
    this.audio.setPlatformPaused(this.platformPaused);
    if (!this.platformPaused) {
      this.lastTime = performance.now();
      if (this.launchPending && this.adFinished && !this.hidden) {
        this.completePendingLaunch();
        return;
      }
    }
    this.syncGameplayLifecycle?.();
  }

  setAdPaused(paused) {
    this.adPaused = !!paused;
    this.audio.setAdPaused(this.adPaused);
    if (!this.adPaused) this.lastTime = performance.now();
    this.syncGameplayLifecycle?.();
  }

  isGameplayPaused() {
    return this.hidden || this.platformPaused || this.adPaused || !!this.userPaused;
  }

  // Пауза по желанию игрока: только во время забега. Мир и время стоят, экран паузы
  // показывает счёт и настройки звука. Музыка при этом не умолкает, чтобы было слышно,
  // как меняется громкость.
  pause() {
    if (this.state !== 'PLAYING' || this.userPaused) return false;
    this.userPaused = true;
    this.haptics?.stop();
    // Палец или клавиша, зажатые в момент паузы, не должны рулить котом после возврата.
    this.keyboardInput?.reset?.();
    this.mouseInput?.reset?.();
    this.touchInput?.reset?.();
    this.syncGameplayLifecycle?.();
    return true;
  }

  resume() {
    if (!this.userPaused) return false;
    this.userPaused = false;
    this.keyboardInput?.reset?.();
    this.mouseInput?.reset?.();
    this.touchInput?.reset?.();
    this.lastTime = performance.now();
    this.syncGameplayLifecycle?.();
    return true;
  }

  togglePause() {
    return this.userPaused ? this.resume() : this.pause();
  }

  syncGameplayLifecycle() {
    this.platform?.setGameplayActive?.(
      this.state === 'PLAYING' && !this.isGameplayPaused()
    );
    // Музыка идёт только в забеге; пауза, реклама и скрытая вкладка её приостанавливают сами.
    this.audio?.setMusicActive?.(this.state === 'PLAYING');
  }

  toggleMute() {
    const muted = this.audio.toggleMuted();
    this.storage.set('audioMuted', muted);
    return muted;
  }

  // Громкость шагами по 10%. Если звук был выключен, нажатие «громче» включает его.
  changeVolume(direction) {
    const step = CONFIG.AUDIO.VOLUME_STEP;
    const next = Math.round(Math.max(0, Math.min(1, this.audio.volume + direction * step)) * 10) / 10;
    this.audio.setVolume(next);
    this.storage.set('audioVolume', next);
    if (direction > 0 && this.audio.muted) {
      this.audio.setMuted(false);
      this.storage.set('audioMuted', false);
    }
    return next;
  }

  // Нажатие на кнопки звука (экраны START, Game Over и пауза). true = нажатие обработано.
  handleSoundTap(x, y) {
    const onPause = this.state === 'PLAYING' && this.userPaused;
    if (this.state !== 'START' && this.state !== 'GAMEOVER' && !onPause) return false;
    const hit = this.renderer?.hitSoundButton?.(x, y);
    if (!hit) return false;
    if (hit === 'minus') this.changeVolume(-1);
    else if (hit === 'plus') this.changeVolume(1);
    else if (hit === 'mute') this.toggleMute();
    if (this.state === 'START') this.render();
    return true;
  }

  tryLaunch() {
    if (this.state === 'PLAYING' || this.launchPending || this.rewardPending || this.leaderboard) return false;
    // Первые мгновения после проигрыша нажатия не перезапускают игру:
    // игрок успевает увидеть экран и кнопки «за рекламу».
    if (this.state === 'GAMEOVER' && this.gameOverInputLocked?.()) return false;
    if (this.state === 'START' || !this.platform?.shouldShowInterstitial?.()) {
      this.start();
      return true;
    }

    this.launchPending = true;
    this.adFinished = false;
    this.setAdPaused(true);
    this.platform.showInterstitial()
      .catch(() => ({ attempted: true, wasShown: false }))
      .then(() => {
        this.adFinished = true;
        this.setAdPaused(false);
        if (this.hidden) {
          this.launchPending = false;
        } else if (!this.platformPaused) {
          this.completePendingLaunch();
        }
      });
    return true;
  }

  completePendingLaunch() {
    if (!this.launchPending || this.state !== 'GAMEOVER') return false;
    this.launchPending = false;
    this.adFinished = false;
    this.start();
    return true;
  }

  start() {
    if (this.isRunning && this.state === 'PLAYING') return;
    this.unlockAudio?.();
    this.state = 'PLAYING';
    this.userPaused = false;
    this.isNewBest = false;
    this.score = 0;
    this.distanceScore = 0;
    this.pathReward = 0;
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    this.currentSpeed = CONFIG.TRACK_SPEED_START;
    this.runTime = 0;
    this.floatingRewards = [];
    this.coins = this.storage.getCoins();
    this.feel?.reset();

    this.player.reset();
    this.runCoins = 0;
    this.coinsDoubled = false;
    this.grazeCombo = 0;
    this.lastGrazeAt = -Infinity;
    this.rewardPending = false;
    this.reviveUsed = false;
    this.invulnerableTime = 0;
    this.player.invulnerable = 0;
    // runSeed задан (например ?seed=42 в адресе) — трасса каждый раз одинаковая.
    this.track.setSeed?.(this.runSeed ?? null);
    // Новичку (малый лучший счёт) проходы шире; опытному игроку — как есть. См. CONFIG.ASSIST.
    this.track.setAssist?.(this.assistOverride ?? getAssist(this.bestScore));
    this.track.reset();
    this.camera?.reset?.();
    this.keyboardInput?.reset?.();
    this.mouseInput?.reset?.();
    this.touchInput?.reset?.();

    this.lastTime = performance.now();
    this.syncGameplayLifecycle?.();
    if (!this.isRunning) {
      this.isRunning = true;
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  loop(timestamp) {
    if (!this.isRunning) return;

    const deltaTime = (timestamp - this.lastTime) / 1000;
    const cappedDeltaTime = Math.min(deltaTime, 0.1);
    this.lastTime = timestamp;

    this.update(cappedDeltaTime);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(deltaTime) {
    if (this.isGameplayPaused?.()) return;

    if (this.state === 'GAMEOVER') {
      this.feel.update(deltaTime, this.currentSpeed);
      this.updateFloating(deltaTime);
      return;
    }

    if (this.state !== 'PLAYING') return;

    let moveDirection = 0;
    if (this.keyboardInput.isLeftPressed()) moveDirection = -1;
    else if (this.keyboardInput.isRightPressed()) moveDirection = 1;

    if (moveDirection === 0) {
      moveDirection = this.mouseInput?.getMoveDirection?.() || 0;
    }

    if (moveDirection === 0) {
      const touchX = this.touchInput.getTouchX();
      if (touchX !== null) {
        const deadZone = 10;
        const distance = touchX - this.player.x;
        if (Math.abs(distance) > deadZone) moveDirection = Math.sign(distance);
      }
    }

    this.player.setMoveDirection(moveDirection);

    // Защита от «проскоков»: если за кадр мир или кот сдвигаются больше чем на
    // SUBSTEP_MAX_PX (лаг, слабый телефон), кадр делится на мелкие шаги и
    // столкновение проверяется в каждом. При 60 FPS шаг обычно один.
    const fastest = Math.max(getTrackSpeed(this.runTime), this.player.speed);
    const steps = Math.min(
      CONFIG.SUBSTEP_MAX_COUNT,
      Math.max(1, Math.ceil((fastest * deltaTime) / CONFIG.SUBSTEP_MAX_PX))
    );
    const stepTime = deltaTime / steps;
    for (let i = 0; i < steps; i += 1) {
      if (this.simulateStep(stepTime)) {
        this.gameOver();
        return;
      }
    }

    this.updateFloating(deltaTime);
    this.feel.update(deltaTime, this.currentSpeed);
    const speedRange = Math.max(1, CONFIG.TRACK_SPEED_MAX - CONFIG.TRACK_SPEED_START);
    this.audio?.setMusicIntensity?.((this.currentSpeed - CONFIG.TRACK_SPEED_START) / speedRange);
  }

  // Один шаг физики: движение, трасса, награды, монеты. true = столкновение.
  simulateStep(deltaTime) {
    this.player.speed = getPlayerSpeed(getTrackSpeed(this.runTime));
    const screenY = this.player.y + (this.camera?.gameplayShift?.() || 0);
    this.player.update(deltaTime, playableXBounds(screenY, this.player.width));

    this.runTime += deltaTime;
    this.currentSpeed = getTrackSpeed(this.runTime);

    this.track.update(deltaTime, this.currentSpeed, this.runTime);
    this.camera?.advance?.(this.currentSpeed * deltaTime);
    this.camera?.follow?.(this.player.y, deltaTime, true, this.currentSpeed);

    this.distanceScore += CONFIG.SCORE_BASE_PER_SECOND * deltaTime;
    this.score = Math.floor(this.distanceScore + this.pathReward);

    const result = this.track.checkPassed(this.player);
    if (result.rewardType) {
      this.applyReward(result.rewardType, result.isIntentional, result.isChoice);
    }

    const coinsGained = this.track.collectCoins(this.player);
    if (coinsGained > 0) {
      this.applyCoinPickup(coinsGained);
    }

    // «Чуть не задел»: пока кот неуязвим (после возрождения), бонус не начисляется.
    if (!(this.invulnerableTime > 0)) {
      for (const graze of this.track.checkGraze?.(this.player) || []) this.applyGraze(graze);
    }

    // После возрождения кот какое-то время неуязвим.
    if (this.invulnerableTime > 0) {
      this.invulnerableTime = Math.max(0, this.invulnerableTime - deltaTime);
      this.player.invulnerable = this.invulnerableTime;
      return false;
    }
    return this.track.checkCollision(this.player);
  }

  // --- Экран проигрыша: кнопки «за рекламу» (Фаза 5) ---

  gameOverInputLocked() {
    const age = this.feel?.gameOverAge;
    return Number.isFinite(age) && age < CONFIG.GAME_OVER_INPUT_LOCK;
  }

  canOfferRevive() {
    return this.canRevive() && !this.rewardPending && !!this.platform?.canShowRewarded?.();
  }

  canOfferDoubleCoins() {
    return !!CONFIG.YANDEX.DOUBLE_COINS_AD
      && this.state === 'GAMEOVER'
      && (this.runCoins || 0) > 0
      && !this.coinsDoubled
      && !this.rewardPending
      && !this.launchPending
      && !this.isGameplayPaused()
      && !!this.platform?.canShowRewarded?.();
  }

  // --- Платформа Яндекса: облако, таблица лидеров, оценка, ярлык ---
  // Все вызовы безопасны без SDK: платформа сама возвращает «нет данных», игра работает локально.

  // Стартовый экран рисуется по событиям (цикла ещё нет): после асинхронного ответа перерисовываем.
  requestRender() {
    if (!this.isRunning) this.render();
  }

  // Что хранится в облаке (ключи — CONFIG.YANDEX.CLOUD_KEYS).
  cloudSnapshot() {
    return {
      bestScore: this.bestScore || 0,
      coins: this.storage.getCoins(),
      choiceHintSeen: !!this.choiceHintSeen,
      riskHintSeen: !!this.riskHintSeen
    };
  }

  // Сливает данные из облака с локальными: берём большее число, подсказки — «видел где-то».
  // Ничего не теряется ни на устройстве, ни в облаке. true = локальные данные изменились.
  applyCloudData(data) {
    if (!data || typeof data !== 'object') return false;
    const whole = (value) => {
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number > 0 ? number : 0;
    };
    let changed = false;
    const best = Math.max(this.bestScore || 0, whole(data.bestScore));
    if (best !== (this.bestScore || 0)) {
      this.bestScore = best;
      this.storage.set('bestScore', best);
      changed = true;
    }
    const coins = Math.max(this.storage.getCoins(), whole(data.coins));
    if (coins !== this.storage.getCoins()) {
      this.storage.set('coins', coins);
      this.coins = coins;
      changed = true;
    }
    for (const key of ['choiceHintSeen', 'riskHintSeen']) {
      if (data[key] === true && !this[key]) {
        this[key] = true;
        this.storage.set(key, true);
        changed = true;
      }
    }
    return changed;
  }

  // Забирает данные из облака, сливает с локальными и отправляет объединённое обратно.
  async syncCloud() {
    const data = await Promise.resolve(this.platform?.loadCloudData?.()).catch(() => null);
    if (!data) return false;
    this.applyCloudData(data);
    this.platform.saveCloudData?.(this.cloudSnapshot());
    this.requestRender();
    return true;
  }

  // Платформа готова (SDK загружен): облако и доступность ярлыка.
  async onPlatformReady() {
    const shortcut = Promise.resolve(this.platform?.canShowShortcut?.()).catch(() => false);
    await this.syncCloud();
    this.shortcutAvailable = !!(await shortcut);
    this.requestRender();
  }

  canShowLeaderboard() {
    return !!this.platform?.canShowLeaderboard?.();
  }

  openLeaderboard() {
    if (this.leaderboard || !this.canShowLeaderboard()) return false;
    this.leaderboard = { status: 'loading', entries: [], userRank: null, authorized: true, signingIn: false };
    this.loadLeaderboard();
    this.requestRender();
    return true;
  }

  async loadLeaderboard() {
    const board = this.leaderboard;
    if (!board) return;
    board.status = 'loading';
    const result = await Promise.resolve(this.platform?.getLeaderboard?.({ myBest: this.bestScore }))
      .catch(() => ({ ok: false }));
    if (this.leaderboard !== board) return; // пока грузилось, окно закрыли
    if (result?.ok) {
      board.status = result.entries.length ? 'ready' : 'empty';
      board.entries = result.entries;
      board.userRank = result.userRank ?? null;
      board.authorized = result.authorized !== false;
    } else {
      board.status = 'error';
    }
    this.requestRender();
  }

  closeLeaderboard() {
    if (!this.leaderboard) return false;
    this.leaderboard = null;
    this.requestRender();
    return true;
  }

  handleLeaderboardTap(x, y) {
    const hit = this.renderer?.hitLeaderboardButton?.(x, y);
    if (hit === 'close') this.closeLeaderboard();
    else if (hit === 'signin') this.signIn();
  }

  // Вход в аккаунт из окна таблицы: после входа отправляем рекорд, забираем облако, обновляем таблицу.
  async signIn() {
    const board = this.leaderboard;
    if (!board || board.signingIn) return false;
    board.signingIn = true;
    this.requestRender();
    const ok = await Promise.resolve(this.platform?.openAuth?.()).catch(() => false);
    board.signingIn = false;
    if (!ok) {
      this.requestRender();
      return false;
    }
    if (this.bestScore > 0) await Promise.resolve(this.platform.submitScore?.(this.bestScore)).catch(() => {});
    this.syncCloud();
    if (this.leaderboard === board) await this.loadLeaderboard();
    return true;
  }

  // Нажатие на кнопки «таблица лидеров» и «ярлык» (экраны START и Game Over). true = обработано.
  handlePlatformTap(x, y) {
    if (this.state !== 'START' && this.state !== 'GAMEOVER') return false;
    const hit = this.renderer?.hitPlatformButton?.(x, y);
    if (!hit) return false;
    // Сразу после проигрыша и во время рекламы нажатия кнопок не срабатывают (как и перезапуск).
    if (this.state === 'GAMEOVER' && (this.gameOverInputLocked() || this.rewardPending || this.launchPending)) return true;
    if (hit === 'leaderboard') this.openLeaderboard();
    else if (hit === 'shortcut') this.addShortcut();
    return true;
  }

  async addShortcut() {
    const result = await Promise.resolve(this.platform?.showShortcut?.()).catch(() => ({ accepted: false }));
    if (result?.accepted) {
      this.shortcutAvailable = false; // ярлык добавлен: кнопка больше не нужна
      this.requestRender();
    }
  }

  // Просим оценку игры после нового рекорда, начиная с REVIEW_AFTER_RUNS-го забега за сессию:
  // игрок только что порадовался. Окно показывает платформа (один раз за сессию, только если
  // оценка доступна); мы ждём, пока игрок увидит свой результат, и не мешаем рекламе и перезапуску.
  maybeAskForReview() {
    if (!this.isNewBest || (this.platform?.completedRuns ?? 0) < CONFIG.YANDEX.REVIEW_AFTER_RUNS) return false;
    const timer = setTimeout(() => {
      if (this.state !== 'GAMEOVER' || this.isGameplayPaused() || this.rewardPending || this.launchPending) return;
      Promise.resolve(this.platform?.requestReview?.()).catch(() => {});
    }, 1500);
    timer.unref?.();
    return true;
  }

  // Подсказка у первой развилки: пока игрок не прошёл ни одной и ближайшая развилка приближается
  // (она в пределах экрана, но кот ещё не въехал в неё).
  choiceHintVisible() {
    if (this.choiceHintSeen || this.state !== 'PLAYING') return false;
    for (const segment of this.track.segments) {
      if (!segment.isChoiceSegment || segment.isPassed || !segment.paths.length) continue;
      const gateY = Math.min(...segment.paths.map((path) => path.y));
      const ahead = this.player.y - gateY;
      if (ahead > CONFIG.CHOICE_HINT_NEAR && ahead < CONFIG.CHOICE_HINT_FAR) return true;
    }
    return false;
  }

  // Нажатие на экран (мышь или палец) в логических координатах холста.
  handleTap(x, y) {
    // Пока открыта таблица лидеров, нажатия достаются только ей.
    if (this.leaderboard) {
      this.handleLeaderboardTap(x, y);
      return false;
    }
    // Кнопки звука, таблицы лидеров и ярлыка не запускают забег.
    if (this.handleSoundTap?.(x, y)) return false;
    if (this.handlePlatformTap?.(x, y)) return false;
    // Во время забега нажатие по значку паузы ставит паузу, на паузе — кнопка «продолжить».
    if (this.state === 'PLAYING') {
      if (this.userPaused) {
        if (this.renderer?.hitResumeButton?.(x, y)) this.resume();
      } else if (this.renderer?.hitPauseButton?.(x, y)) {
        this.pause();
      }
      return false;
    }
    if (this.state === 'GAMEOVER') {
      if (this.gameOverInputLocked() || this.rewardPending) return false;
      const hit = this.renderer?.hitGameOverButton?.(x, y);
      if (hit === 'revive') return this.requestRevive();
      if (hit === 'double') return this.requestDoubleCoins();
    }
    return this.tryLaunch();
  }

  // Показ рекламы за награду: игра и звук на паузе, награда — только после onRewarded.
  showRewardedAd(onRewarded) {
    this.rewardPending = true;
    this.setAdPaused(true);
    return Promise.resolve(this.platform.showRewarded())
      .catch(() => ({ attempted: true, rewarded: false }))
      .then((result) => {
        this.rewardPending = false;
        this.setAdPaused(false);
        if (result?.rewarded) onRewarded();
        return !!result?.rewarded;
      });
  }

  requestRevive() {
    if (!this.canOfferRevive()) return false;
    this.showRewardedAd(() => this.revive());
    return true;
  }

  requestDoubleCoins() {
    if (!this.canOfferDoubleCoins()) return false;
    this.showRewardedAd(() => {
      if (this.coinsDoubled || this.state !== 'GAMEOVER') return;
      this.coinsDoubled = true;
      this.coins = this.storage.addCoins(this.runCoins || 0);
    });
    return true;
  }

  // Возрождение: один раз за забег, только с экрана проигрыша.
  // Счёт продолжается, серия и множитель уже сброшены проигрышем.
  canRevive() {
    // Не во время рекламы/паузы и не когда уже запрошен рестарт (иначе рестарт
    // после следующей смерти заблокируется).
    return this.state === 'GAMEOVER'
      && !this.reviveUsed
      && !this.launchPending
      && !this.isGameplayPaused?.();
  }

  revive() {
    if (!this.canRevive()) return false;
    this.reviveUsed = true;
    this.track.clearAhead(this.player.y, CONFIG.REVIVE_CLEAR_AHEAD);
    this.invulnerableTime = CONFIG.REVIVE_INVULNERABLE_SECONDS;
    this.player.invulnerable = this.invulnerableTime;
    this.state = 'PLAYING';
    this.isNewBest = false;
    this.keyboardInput?.reset?.();
    this.mouseInput?.reset?.();
    this.touchInput?.reset?.();
    this.syncGameplayLifecycle?.();
    return true;
  }

  updateFloating(deltaTime) {
    this.floatingRewards = this.floatingRewards.filter((r) => {
      r.y -= CONFIG.FEEL.FLOAT_SPEED * deltaTime;
      r.life -= deltaTime;
      return r.life > 0;
    });
  }

  pushFloat({ x, y, value, type, subtitle = null, life }) {
    this.floatingRewards.push({
      x,
      y,
      value: Math.floor(value),
      type,
      subtitle,
      life,
      maxLife: life
    });
    if (this.floatingRewards.length > CONFIG.FEEL.FLOAT_MAX) {
      this.floatingRewards.shift();
    }
  }

  applyReward(type, isIntentional, isChoice = false) {
    if (!Object.prototype.hasOwnProperty.call(CONFIG.REWARDS, type)) {
      console.warn('Game: неизвестный тип награды, пропуск', type);
      return;
    }

    // Игрок прошёл развилку: подсказка «шире / уже» ему больше не нужна.
    if (isChoice && !this.choiceHintSeen) {
      this.choiceHintSeen = true;
      this.storage?.set?.('choiceHintSeen', true);
    }

    const baseReward = CONFIG.REWARDS[type];
    let finalReward = baseReward;
    const prevMultiplier = this.multiplier;
    const lostStreak = isChoice && type === 'SAFE' && this.riskStreak > 0;

    if (isIntentional) {
      this.riskStreak += 1;
      finalReward = baseReward * this.multiplier;
      if (this.riskStreak >= CONFIG.RISK_STREAK_TO_GROW) {
        this.multiplier = Math.min(this.multiplier + CONFIG.MULTIPLIER_STEP, CONFIG.MULTIPLIER_MAX);
      }
    } else if (isChoice && type === 'SAFE') {
      this.riskStreak = 0;
      this.multiplier = CONFIG.MULTIPLIER_START;
      finalReward = baseReward;
    } else {
      finalReward = baseReward;
    }

    this.pathReward += finalReward;
    this.score = Math.floor(this.distanceScore + this.pathReward);

    let subtitle = null;
    if (isIntentional && this.multiplier > prevMultiplier) {
      subtitle = t('float.streakScore', { streak: this.riskStreak, mult: this.multiplier.toFixed(1) });
    } else if (isIntentional && !this.riskHintSeen) {
      subtitle = t('float.riskHint');
      this.riskHintSeen = true;
      this.storage?.set?.('riskHintSeen', true);
    } else if (isIntentional && prevMultiplier > 1) {
      subtitle = t('float.score', { mult: prevMultiplier.toFixed(1) });
    } else if (lostStreak) {
      subtitle = t('float.streakReset');
    }

    const life = isIntentional ? CONFIG.FEEL.FLOAT_LIFE : CONFIG.FEEL.FLOAT_LIFE * 0.75;
    const float = {
      x: this.player.x,
      y: this.player.y - CONFIG.VISUAL.LOAF_REAR.FLOAT_CLEARANCE,
      value: Math.floor(finalReward),
      type,
      subtitle,
      life,
      maxLife: life
    };
    if (typeof this.pushFloat === 'function') this.pushFloat(float);
    else this.floatingRewards.push(float);

    if (!this.feel) return;
    if (isIntentional) {
      this.feel.onRisk({
        x: this.player.x,
        y: this.player.y,
        streak: this.riskStreak,
        multiplier: this.multiplier,
        stepped: this.multiplier > prevMultiplier,
        hitMax: this.multiplier >= CONFIG.MULTIPLIER_MAX && prevMultiplier < CONFIG.MULTIPLIER_MAX
      });
    } else if (isChoice && type === 'SAFE') {
      if (lostStreak) this.feel.onStreakLost(this.player.x, this.player.y);
      else this.feel.onSafe(this.player.x, this.player.y);
    }
  }

  // Кот прошёл вплотную к стене: небольшой бонус, а касания подряд (не позже GRAZE.COMBO_WINDOW
  // друг от друга) дают чуть больше. Бонус не умножается: главный источник очков — риск.
  applyGraze({ x, y, side }) {
    const cfg = CONFIG.GRAZE;
    this.grazeCombo = this.runTime - (this.lastGrazeAt ?? -Infinity) <= cfg.COMBO_WINDOW ? this.grazeCombo + 1 : 1;
    this.lastGrazeAt = this.runTime;
    const bonus = Math.min(cfg.BONUS_MAX, cfg.BONUS + cfg.COMBO_STEP * (this.grazeCombo - 1));
    this.pathReward += bonus;
    this.score = Math.floor(this.distanceScore + this.pathReward);
    const float = {
      x: this.player.x,
      y: this.player.y - CONFIG.VISUAL.LOAF_REAR.FLOAT_CLEARANCE,
      value: bonus,
      type: 'GRAZE',
      subtitle: this.grazeCombo > 1 ? t('float.grazeCombo', { n: this.grazeCombo }) : t('float.graze'),
      life: CONFIG.FEEL.FLOAT_LIFE * 0.85,
      maxLife: CONFIG.FEEL.FLOAT_LIFE * 0.85
    };
    if (typeof this.pushFloat === 'function') this.pushFloat(float);
    else this.floatingRewards.push(float);
    this.feel?.onGraze?.({ x, y, side, combo: this.grazeCombo });
    return bonus;
  }

  applyCoinPickup(amount) {
    const gained = Math.floor(Number(amount) || 0);
    if (gained <= 0) return;
    this.coins = this.storage.addCoins(gained);
    this.runCoins = (this.runCoins || 0) + gained;
    const float = {
      x: this.player.x,
      y: this.player.y - CONFIG.VISUAL.LOAF_REAR.FLOAT_CLEARANCE,
      value: gained,
      type: 'COIN',
      subtitle: null,
      life: CONFIG.FEEL.FLOAT_LIFE_COIN,
      maxLife: CONFIG.FEEL.FLOAT_LIFE_COIN
    };
    if (typeof this.pushFloat === 'function') this.pushFloat(float);
    else this.floatingRewards.push(float);
    this.feel?.onCoin(this.player.x, this.player.y);
  }

  gameOver() {
    this.state = 'GAMEOVER';
    const totalScore = Math.floor(this.distanceScore + this.pathReward);
    const previousBest = this.bestScore || 0;
    this.isNewBest = totalScore > previousBest;
    if (this.isNewBest) {
      this.bestScore = totalScore;
      this.storage.set('bestScore', this.bestScore);
      const submission = this.platform?.submitScore?.(totalScore);
      Promise.resolve(submission).catch(() => {});
    }
    // После возрождения это тот же забег: для частоты рекламы не считаем дважды.
    if (!this.reviveUsed) this.platform?.recordRunCompleted?.();
    // Рекорд, монеты и подсказки уходят в облако Яндекса (платформа сама ограничивает частоту).
    this.platform?.saveCloudData?.(this.cloudSnapshot());
    this.maybeAskForReview?.();
    this.syncGameplayLifecycle?.();
    this.feel?.onGameOver(this.player.x, this.player.y);
    if (this.isNewBest) this.feel?.onNewBest?.(this.player.x, this.player.y);
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    console.log('Game Over! Score:', totalScore);
  }

  restart() {
    return this.tryLaunch();
  }

  render() {
    const camera = this.camera;
    const time = this.feel?.time || 0;

    this.renderer.clear();
    this.renderer.drawBackdrop(time);
    this.renderer.drawFarWorld(camera);
    this.renderer.beginWorld({ x: 0, y: camera ? camera.gameplayShift() : 0 });
    this.renderer.drawWorld(camera, this.track.segments, this.player.y);
    this.renderer.drawSegments(this.track.segments);
    this.renderer.drawPlayer(this.player, this.feel);
    this.renderer.drawParticles(this.feel?.particles.particles);
    this.renderer.drawFloatingRewards(this.floatingRewards);
    this.renderer.endWorld();

    this.renderer.drawFlash(this.feel);
    this.renderer.drawHUD(
      Math.floor(this.score),
      this.multiplier,
      this.bestScore,
      this.riskStreak,
      this.coins,
      this.feel,
      this.audio?.muted,
      // На экранах START, Game Over и паузы звук показан отдельной капсулой.
      this.state === 'PLAYING' && !this.userPaused,
      // Значок паузы — только пока забег идёт.
      this.state === 'PLAYING' && !this.userPaused
    );

    if (this.state === 'PLAYING' && !this.userPaused && this.choiceHintVisible()) {
      this.renderer.drawChoiceHint(t('hint.choice'));
    }

    if (this.state === 'PLAYING' && this.userPaused) {
      this.renderer.drawPause(
        Math.floor(this.score),
        this.bestScore,
        this.audio?.muted,
        this.audio?.volume
      );
    } else if (this.state === 'GAMEOVER') {
      this.renderer.drawGameOver(
        Math.floor(this.distanceScore + this.pathReward),
        this.bestScore,
        this.coins,
        this.feel?.gameOverAge ?? 1,
        {
          isNewBest: this.isNewBest,
          muted: this.audio?.muted,
          volume: this.audio?.volume,
          offerRevive: this.canOfferRevive(),
          offerDouble: this.canOfferDoubleCoins(),
          runCoins: this.runCoins || 0,
          coinsDoubled: !!this.coinsDoubled,
          leaderboard: this.canShowLeaderboard()
        }
      );
    } else if (this.state === 'START') {
      this.renderer.drawStartScreen(this.audio?.muted, this.audio?.volume, {
        leaderboard: this.canShowLeaderboard(),
        shortcut: this.shortcutAvailable
      });
    }

    // Окно таблицы лидеров лежит поверх любого экрана.
    if (this.leaderboard) this.renderer.drawLeaderboard(this.leaderboard);
  }
}
