import { t } from '../localization/i18n.js';
import { CONFIG, getTrackSpeed, getTrackDistance, getPlayerSpeed, getAssist } from '../config.js';
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
import { timeOfDay } from './TimeOfDay.js';
import { Shop } from './Shop.js';
import { Daily, dailySeed, gameDay, msUntilNextDay } from './Daily.js';
import { Quests } from './Quests.js';
import { Achievements } from './Achievements.js';
import { FrameGovernor, lowerScale, pickRenderScale } from '../rendering/RenderScale.js';

// Какой тихий звук окружения идёт в этапе суток: 'birds', 'crickets' или null (CONFIG.MUSIC.AMBIENCE.STAGES).
function ambienceFor(stageName) {
  return CONFIG.MUSIC.AMBIENCE.STAGES[stageName] ?? null;
}

// Число секунд из хранилища или облака: конечное и не меньше нуля (иначе 0), с точностью до десятой.
function cleanSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 10) / 10 : 0;
}

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
    // Сколько секунд длился лучший забег: по нему на трассе стоит лента рекорда (0 — лучшего забега со временем ещё нет).
    this.bestRunTime = cleanSeconds(this.storage.get('bestRunTime', 0));
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    this.shieldTime = 0; // секунды щита, оставшиеся у кота (0 — щита нет): клубок-щит, см. CONFIG.SHIELD
    this.multBubble = null; // пузырь множителя рядом с котом: { value, up, age } или null
    this.recordPassed = false; // кот уже пересёк ленту рекорда в этом забеге
    this.coins = this.storage.getCoins();
    this.shop = new Shop(this.storage, () => this.todayKey());
    this.shopWindow = null; // null — закрыт; иначе { message } (подсказка «не хватает монет»)
    this.daily = new Daily(this.storage);
    this.dailyRun = false; // идущий (или только что закончившийся) забег — забег дня
    this.dailyPending = false; // игрок нажал «забег дня»: следующий start() запустит его
    this.dailyResult = null; // итог забега дня для экрана проигрыша: { reward, streak, best, first }
    this.clockOffset = 0; // серверное время минус время устройства (миллисекунды), см. syncClock
    this.frameGovernor = new FrameGovernor(); // следит за кадрами: слабому телефону масштаб холста снижается (RenderScale)
    this.shop.ensureFirstDay?.(); // с этого дня идут дни ограниченного скина
    this.quests = new Quests(this.storage);
    this.questsWindow = null; // null — закрыто; иначе {} (окно заданий дня на стартовом экране)
    this.questToasts = []; // плашки «задание выполнено» по очереди: [{ reward, age }]
    this.notice = null; // короткая надпись на экране проигрыша (например, «награды нет»): { key, age }
    this.questWatch = []; // задания «за один забег», за которыми следим в забеге: [{ kind, target }]
    this.runMaxMultiplier = CONFIG.MULTIPLIER_START; // наибольший множитель забега (для задания про множитель)
    this.questRunCounted = false; // этот забег уже посчитан для «сыграй забеги» (возрождение не считается дважды)
    this.fromMenu = false; // стартовый экран открыт кнопкой «в меню» после проигрыша: запуск идёт как перезапуск (с рекламой, если пора)
    this.achievements = new Achievements(this.storage);
    this.achievementsWindow = null; // null — закрыто; иначе {} (окно достижений на стартовом экране)
    this.achievementToasts = []; // плашки «достижение получено» по очереди: [{ id, age }]
    this.achRunWatch = { longRun: false, cleanRun: false }; // достижения про секунды забега, за которыми следим в этом забеге
    this.lastCoinAt = 0; // время забега (runTime), когда подобрана последняя монета (или забег начался)

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
    this.pauseMenuAskUntil = 0; // до какого момента (performance.now) «В МЕНЮ» на паузе ждёт второго нажатия
    this.launchPending = false;
    this.adFinished = false;
    this.stageKey = 0; // этап суток забега (TimeOfDay.key): меняется — показываем плашку
    this.stageToast = null; // { name, age } пока плашка на экране
    this.leaderboard = null; // null — закрыта; иначе { status, entries, userRank, authorized, signingIn }
    this.shortcutAvailable = false; // платформа разрешает предложить ярлык

    this.platform?.setLifecycleHandlers?.({
      onPause: () => this.setPlatformPaused(true),
      onResume: () => this.setPlatformPaused(false)
    });
    this.applySelectedSkin();
    // Накопленное до этой версии (монеты, скины, серия) тоже считается: достижения выдаются без плашки.
    this.checkAchievements({ silent: true });
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
      this.dailyPending = false;
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
    this.pauseMenuAskUntil = 0;
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
    this.pauseMenuAskUntil = 0;
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

  // «В МЕНЮ» на экране паузы: забег начат случайно (или хочется в магазин), а до этого выйти можно было только
  // проиграв. Нажатие защищено от случайного: первое спрашивает «завершить забег?», второе в течение
  // CONFIG.PAUSE_MENU_CONFIRM_MS выходит. true — нажатие обработано.
  menuFromPause() {
    if (this.state !== 'PLAYING' || !this.userPaused) return false;
    const now = performance.now();
    if (!(this.pauseMenuAskUntil > now)) {
      this.pauseMenuAskUntil = now + CONFIG.PAUSE_MENU_CONFIRM_MS;
      return true;
    }
    this.pauseMenuAskUntil = 0;
    return this.quitToMenu();
  }

  // Ждёт ли кнопка «В МЕНЮ» второго нажатия (для рисования).
  pauseMenuAsking() {
    return this.state === 'PLAYING' && !!this.userPaused && this.pauseMenuAskUntil > performance.now();
  }

  // Завершает забег как обычный проигрыш (счёт, рекорд, задания, облако, счётчик рекламы), но без экрана проигрыша,
  // звука поражения и просьбы об оценке, и открывает главное меню. Следующий забег из меню идёт по тем же правилам
  // рекламы, что и после «В МЕНЮ» с экрана проигрыша (fromMenu).
  quitToMenu() {
    if (this.state !== 'PLAYING') return false;
    this.userPaused = false;
    this.pauseMenuAskUntil = 0;
    this.gameOver({ quiet: true });
    return this.openMenu();
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
    if (this.state === 'PLAYING' || this.launchPending || this.rewardPending || this.leaderboard || this.shopWindow || this.questsWindow || this.achievementsWindow) return false;
    // Первые мгновения после проигрыша нажатия не перезапускают игру:
    // игрок успевает увидеть экран и кнопки «за рекламу».
    if (this.state === 'GAMEOVER' && this.gameOverInputLocked?.()) return false;
    // Самый первый запуск после загрузки идёт без рекламы. Путь «проигрыш — меню — играть» от рекламы не спасает:
    // межстраничная считается по сыгранным забегам и показывается и тут, если пора.
    if ((this.state === 'START' && !this.fromMenu) || !this.platform?.shouldShowInterstitial?.()) {
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
          this.dailyPending = false;
        } else if (!this.platformPaused) {
          this.completePendingLaunch();
        }
      });
    return true;
  }

  completePendingLaunch() {
    if (!this.launchPending || (this.state !== 'GAMEOVER' && !(this.state === 'START' && this.fromMenu))) return false;
    this.launchPending = false;
    this.adFinished = false;
    this.start();
    return true;
  }

  start() {
    if (this.isRunning && this.state === 'PLAYING') return;
    this.unlockAudio?.();
    this.state = 'PLAYING';
    this.fromMenu = false;
    this.userPaused = false;
    this.isNewBest = false;
    this.score = 0;
    this.distanceScore = 0;
    this.pathReward = 0;
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    this.shieldTime = 0;
    this.multBubble = null;
    this.recordPassed = false;
    // Только для разработки (?start=100 в адресе): забег начинается с этой секунды, чтобы сразу
    // увидеть то, что открывается поздно (скорость, время суток, качающееся кашпо).
    this.runTime = this.devStartTime || 0;
    this.currentSpeed = this.runTime > 0 ? getTrackSpeed(this.runTime) : CONFIG.TRACK_SPEED_START;
    this.floatingRewards = [];
    this.coins = this.storage.getCoins();
    this.feel?.reset();

    this.player.reset();
    this.runCoins = 0;
    this.coinsDoubled = false;
    this.grazeCombo = 0;
    this.lastGrazeAt = -Infinity;
    const stage = timeOfDay(this.runTime + (this.todOffset || 0));
    this.stageKey = stage.key;
    this.audio?.setAmbience?.(ambienceFor(stage.name)); // днём птицы, ночью искры (очень тихо)
    this.stageToast = null;
    // Задания дня: плашки прошлого забега гаснут, за заданиями «за один забег» следим с нуля.
    this.questToasts = [];
    this.notice = null;
    this.questWatch = this.quests ? this.quests.watch(this.todayKey()) : [];
    this.runMaxMultiplier = CONFIG.MULTIPLIER_START;
    this.questRunCounted = false;
    // Достижения: про секунды забега следим, пока они не получены; «без монет» считается от начала забега.
    this.achievementToasts = [];
    this.achRunWatch = {
      longRun: !!this.achievements && !this.achievements.has('longRun'),
      cleanRun: !!this.achievements && !this.achievements.has('cleanRun')
    };
    this.lastCoinAt = this.runTime;
    this.rewardPending = false;
    this.reviveUsed = false;
    this.invulnerableTime = 0;
    this.player.invulnerable = 0;
    // Забег дня: зерно из сегодняшней даты и одна для всех помощь, поэтому у всех одна и та же трасса.
    this.dailyRun = this.dailyPending;
    this.dailyPending = false;
    this.dailyResult = null;
    // runSeed задан (например ?seed=42 в адресе) — трасса каждый раз одинаковая.
    this.track.setSeed?.(this.dailyRun ? dailySeed(this.todayKey()) : (this.runSeed ?? null));
    // В забеге дня ряды создаются в идеальный момент: трасса одна у всех на любой частоте кадров.
    this.track.setCanonicalClock?.(this.dailyRun);
    // Новичку (малый лучший счёт) проходы шире; опытному игроку — как есть. См. CONFIG.ASSIST.
    this.track.setAssist?.(this.dailyRun ? CONFIG.DAILY.ASSIST : (this.assistOverride ?? getAssist(this.bestScore)));
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

  // ---- чёткость холста (RenderScale.js)

  // Сколько настоящих пикселей приходится на логический (холст 540 × 960): 1, 1.5 или 2.
  renderScale() {
    const width = this.canvas?.width;
    return width > 0 ? width / CONFIG.CANVAS_WIDTH : 1;
  }

  // Меняет размер холста под масштаб. Рисование остаётся в логических координатах: Game.render ставит
  // преобразование каждый кадр. true — размер изменился.
  applyRenderScale(scale) {
    const width = Math.round(CONFIG.CANVAS_WIDTH * scale);
    const height = Math.round(CONFIG.CANVAS_HEIGHT * scale);
    if (!this.canvas || (this.canvas.width === width && this.canvas.height === height)) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    this.frameGovernor?.reset();
    this.requestRender?.();
    return true;
  }

  // Подбирает масштаб по экрану: cssWidth — ширина холста на экране в CSS-пикселях, devicePixelRatio —
  // плотность экрана. Слабому телефону игра уже снижала масштаб и запомнила его (renderScaleCap): выше не идём.
  // override — принудительный масштаб (только в разработке, адрес ?scale=).
  initRenderScale({ cssWidth, devicePixelRatio = 1, override = null } = {}) {
    const stored = Number(this.storage?.get?.('renderScaleCap', CONFIG.RENDER.MAX_SCALE));
    const cap = Number.isFinite(stored) && stored >= 1 ? Math.min(stored, CONFIG.RENDER.MAX_SCALE) : CONFIG.RENDER.MAX_SCALE;
    const scale = override > 0 ? override : pickRenderScale({ cssWidth, devicePixelRatio, cap });
    return this.applyRenderScale(scale);
  }

  // Кадры идут медленно: масштаб на ступень ниже, и игра это запоминает (в следующий раз начнёт с него).
  downgradeRenderScale() {
    const next = lowerScale(this.renderScale());
    if (next >= this.renderScale()) return false;
    this.storage?.set?.('renderScaleCap', next);
    return this.applyRenderScale(next);
  }

  loop(timestamp) {
    if (!this.isRunning) return;

    const deltaTime = (timestamp - this.lastTime) / 1000;
    const cappedDeltaTime = Math.min(deltaTime, 0.1);
    // Устойчиво медленные кадры в идущем забеге (не пауза, не первые секунды) снижают масштаб холста.
    const playing = this.state === 'PLAYING' && !this.isGameplayPaused() && this.runTime > 2;
    if (this.frameGovernor?.observe(deltaTime * 1000, playing)) this.downgradeRenderScale();
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
      this.updateQuestToast?.(deltaTime);
      this.updateAchievementToast?.(deltaTime);
      this.updateNotice?.(deltaTime);
      return;
    }

    if (this.state !== 'PLAYING') return;

    let moveDirection = 0;
    if (this.keyboardInput.isLeftPressed()) moveDirection = -1;
    else if (this.keyboardInput.isRightPressed()) moveDirection = 1;

    // Мышь и палец: кот едет к точке нажатия (Player.steerTo). Клавиатура главнее.
    let targetX = this.mouseInput?.getTargetX?.() ?? null;
    if (targetX === null) targetX = this.touchInput.getTouchX();

    this.player.setMoveDirection(moveDirection);
    this.player.steerTo?.(targetX);

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
    this.updateMultBubble?.(deltaTime);
    this.updateStage?.(deltaTime);
    this.updateQuests?.();
    this.updateAchievements?.();
    this.updateQuestToast?.(deltaTime);
    this.updateAchievementToast?.(deltaTime);
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
    if (this.track.collectPickups?.(this.player).includes('YARN')) this.applyYarnPickup();
    // Время щита идёт только пока забег идёт; щит погас сам, если ошибки не было.
    if (this.shieldTime > 0) {
      this.shieldTime = Math.max(0, this.shieldTime - deltaTime);
      if (this.shieldTime === 0) this.feel?.onShieldEnd?.(this.player.x, this.player.y);
    }
    this.checkRecordMarker?.();

    // «Чуть не задел»: пока кот неуязвим (после возрождения), бонус не начисляется.
    if (!(this.invulnerableTime > 0)) {
      for (const graze of this.track.checkGraze?.(this.player) || []) this.applyGraze(graze);
    }

    // После возрождения (и после поломки щита) кот какое-то время неуязвим.
    if (this.invulnerableTime > 0) {
      this.invulnerableTime = Math.max(0, this.invulnerableTime - deltaTime);
      this.player.invulnerable = this.invulnerableTime;
      return false;
    }
    const hit = this.track.checkCollision(this.player);
    // Щит — одна ошибка: удар ломает его и разбивает препятствия, а забег продолжается.
    if (hit && this.shieldTime > 0) {
      this.breakShield();
      return false;
    }
    return hit;
  }

  // ---- клубок-щит (CONFIG.SHIELD)

  // Клубок подобран: щит на DURATION секунд; второй клубок возвращает щиту полное время.
  applyYarnPickup() {
    this.shieldTime = CONFIG.SHIELD.DURATION;
    this.feel?.onYarn?.(this.player.x, this.player.y);
  }

  // Первая ошибка со щитом: щит ломается, препятствия перед котом разлетаются, кот на GRACE секунд неуязвим.
  // Награды за разбитые ряды нет (Track.breakAhead), серия и множитель остаются как были.
  breakShield() {
    this.shieldTime = 0;
    this.track.breakAhead(this.player, CONFIG.SHIELD.CLEAR_AHEAD);
    this.invulnerableTime = Math.max(this.invulnerableTime || 0, CONFIG.SHIELD.GRACE);
    this.player.invulnerable = this.invulnerableTime;
    this.feel?.onShieldBreak?.(this.player.x, this.player.y);
  }

  // ---- лента рекорда (CONFIG.RECORD_MARKER)

  // Нужна ли в этом забеге лента: обычный забег, лучший забег был не короче MIN_TIME секунд.
  recordMarkerActive() {
    return !this.dailyRun && this.state === 'PLAYING' && this.bestRunTime >= CONFIG.RECORD_MARKER.MIN_TIME;
  }

  // Сколько px трассы осталось до ленты (меньше нуля — кот уже её пересёк). Лента стоит там, где у лучшего
  // забега прошло bestRunTime секунд: путь трассы за это время — getTrackDistance.
  recordMarkerAhead() {
    return getTrackDistance(this.bestRunTime) - getTrackDistance(this.runTime);
  }

  // Логическая y ленты (в тех же координатах, что и ряды: ряд на y кота — кот в нём) или null, если ленту не рисуем.
  recordMarkerY() {
    if (!this.recordMarkerActive()) return null;
    const ahead = this.recordMarkerAhead();
    if (ahead > CONFIG.RECORD_MARKER.SHOW_AHEAD) return null;
    return this.player.y - ahead;
  }

  // Кот пересёк ленту: один раз за забег лёгкие искры.
  checkRecordMarker() {
    if (this.recordPassed || !this.recordMarkerActive()) return;
    if (this.recordMarkerAhead() > 0) return;
    this.recordPassed = true;
    this.feel?.onRecordMarker?.(this.player.x, this.player.y);
  }

  // ---- пузырь множителя (CONFIG.MULT_BUBBLE)

  updateMultBubble(deltaTime) {
    if (!this.multBubble) return;
    this.multBubble.age += deltaTime;
    if (this.multBubble.age >= CONFIG.MULT_BUBBLE.LIFE) this.multBubble = null;
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
      bestRunTime: this.bestRunTime || 0,
      ...this.shop.snapshot(), // монеты (заработано / потрачено), купленные скины и выбранный
      ...this.daily.snapshot(), // день последнего забега дня, серия и лучший счёт дня
      ...this.quests.snapshot(), // задания: день, прогресс по видам, полученные награды
      ...this.achievements?.snapshot(), // достижения: список полученных и серия дней с заданиями
      choiceHintSeen: !!this.choiceHintSeen,
      riskHintSeen: !!this.riskHintSeen
    };
  }

  // Сливает данные из облака с локальными: рекорд и счётчики монет — по большему значению, купленные
  // скины — объединение (Shop.merge), подсказки — «видел где-то». Ничего не теряется ни на устройстве,
  // ни в облаке, а потраченное не возвращается. true = локальные данные изменились.
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
    // Время лучшего забега, как и рекорд, — по большему значению.
    const bestTime = Math.max(this.bestRunTime || 0, cleanSeconds(data.bestRunTime));
    if (bestTime !== (this.bestRunTime || 0)) {
      this.bestRunTime = bestTime;
      this.storage.set('bestRunTime', bestTime);
      changed = true;
    }
    const skinBefore = this.shop.selected();
    if (this.shop.merge(data)) {
      this.coins = this.storage.getCoins();
      if (this.shop.selected() !== skinBefore) this.applySelectedSkin();
      changed = true;
    }
    if (this.daily.merge(data, this.todayKey())) changed = true;
    if (this.quests.merge(data, this.todayKey())) changed = true;
    if (this.achievements?.merge(data, this.todayKey())) changed = true;
    // Накопленное на другом устройстве (монеты, скины, серия) тоже может выполнять достижения: без плашки.
    if (this.checkAchievements?.({ silent: true }).length) changed = true;
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
    // Сначала часы (по ним считается «сегодня» при слиянии забега дня), потом облако.
    await this.syncClock();
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
    else if (hit === 'shop') this.openShop();
    else if (hit === 'quests') this.openQuests();
    else if (hit === 'achievements') this.openAchievements();
    else if (hit === 'menu') this.openMenu();
    else if (hit === 'shortcut') this.addShortcut();
    return true;
  }

  // Кнопка «в меню» на экране проигрыша: возврат на стартовый экран, где забег дня, задания, магазин, таблица
  // лидеров и ярлык (после первого забега сюда иначе не попасть). Мир за карточкой становится таким же, как при
  // загрузке: новая дорожка, кот на месте, очки обнулены. Нельзя во время рекламы и поверх окон. Возрождение
  // при этом теряется: забег закончен.
  openMenu() {
    if (this.state !== 'GAMEOVER' || this.launchPending || this.rewardPending) return false;
    if (this.shopWindow || this.questsWindow || this.achievementsWindow || this.leaderboard) return false;
    this.state = 'START';
    this.fromMenu = true;
    this.isNewBest = false;
    this.score = 0;
    this.distanceScore = 0;
    this.pathReward = 0;
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    this.shieldTime = 0;
    this.multBubble = null;
    this.runTime = 0;
    this.currentSpeed = CONFIG.TRACK_SPEED_START;
    this.floatingRewards = [];
    this.questToasts = [];
    this.notice = null;
    this.stageToast = null;
    this.achievementToasts = [];
    this.dailyRun = false;
    this.dailyResult = null;
    this.feel?.reset?.();
    this.player.reset();
    this.track.setSeed?.(null);
    this.track.setCanonicalClock?.(false);
    this.track.reset();
    this.camera?.reset?.();
    this.syncGameplayLifecycle?.();
    this.requestRender();
    return true;
  }

  // --- Забег дня (Daily.js): кнопка на стартовом экране ---

  // Время сейчас: время устройства, исправленное по часам сервера Яндекса (clockOffset).
  nowMs() {
    return Date.now() + this.clockOffset;
  }

  // Сегодняшний игровой день 'ГГГГ-ММ-ДД' (по Москве). В npm run dev можно задать ?day=2026-10-06.
  todayKey() {
    return this.devDay || gameDay(this.nowMs());
  }

  // Забирает серверное время у платформы: «сегодня» тогда не зависит от часов на устройстве.
  // Нет SDK или ответ неверный — остаётся время устройства.
  async syncClock() {
    const server = await Promise.resolve(this.platform?.getServerTime?.()).catch(() => null);
    if (!Number.isFinite(server) || server <= 0) return false;
    this.clockOffset = server - Date.now();
    return true;
  }

  // Что показать на кнопке: награда за ближайший забег дня, серия, сыгран ли сегодня и лучший счёт дня.
  dailyView() {
    const today = this.todayKey();
    return {
      played: this.daily.playedToday(today),
      reward: this.daily.nextReward(today),
      streak: this.daily.streakAt(today),
      best: this.daily.bestToday(today)
    };
  }

  // Запуск забега дня. Только со стартового экрана и не поверх окон. Флаг гаснет, если запуск не удался.
  startDaily() {
    if (this.state !== 'START' || this.shopWindow || this.questsWindow || this.achievementsWindow || this.leaderboard) return false;
    this.dailyPending = true;
    const started = this.tryLaunch();
    if (!started) this.dailyPending = false;
    return started;
  }

  // Итог забега дня: серия, награда за первый забег дня, лучший счёт дня. После возрождения тот же
  // забег заканчивается второй раз: награда не дублируется, а надпись о ней остаётся.
  finishDailyRun(score) {
    const result = this.daily.complete(score, this.todayKey());
    if (!result) return;
    const earlier = this.dailyResult;
    this.dailyResult = { ...result, reward: result.reward + (earlier?.reward || 0), first: result.first || !!earlier?.first };
    if (result.reward > 0) {
      this.coins = this.storage.addCoins(result.reward);
      this.audio?.play?.('buy');
      this.haptics?.pulse?.('best');
    }
  }

  // --- Магазин скинов (Shop.js): открывается с экранов START и Game Over ---

  // Скин, выбранный в магазине, надевается на бегущего и сидящего кота (Renderer.setSkin).
  applySelectedSkin() {
    const id = this.shop.selected();
    if (id === CONFIG.SHOP.DEFAULT_SKIN && !this.renderer?.skinRequest) return;
    Promise.resolve(this.renderer?.setSkin?.(id)).then(() => this.requestRender?.()).catch(() => {});
  }

  openShop() {
    if (this.shopWindow || this.achievementsWindow || (this.state !== 'START' && this.state !== 'GAMEOVER')) return false;
    this.shopWindow = { message: null };
    this.renderer?.loadSkinPreviews?.(this.shop.ids(), () => this.requestRender());
    this.requestRender();
    return true;
  }

  closeShop() {
    if (!this.shopWindow) return false;
    this.shopWindow = null;
    this.requestRender();
    return true;
  }

  // Что нарисовать в окне магазина.
  // Ближайший скин для строки на экране проигрыша: { name, price, balance, ready } или null.
  nextSkinView() {
    const target = this.shop?.nextTarget?.();
    if (!target) return null;
    return { name: t(`skin.${target.id}`), price: target.price, balance: target.balance, ready: target.missing === 0 };
  }

  shopView() {
    return { skins: this.shop.list(), balance: this.shop.balance(), message: this.shopWindow?.message || null };
  }

  handleShopTap(x, y) {
    const hit = this.renderer?.hitShopButton?.(x, y);
    if (!hit) return false;
    if (hit.type === 'close') return this.closeShop();
    if (hit.type === 'skin') return this.tapSkin(hit.id);
    return false;
  }

  // Купленный скин надевается, неоплаченный покупается (если хватает монет) и сразу надевается.
  tapSkin(id) {
    if (!this.shopWindow) return false;
    const owned = this.shop.isOwned(id);
    let changed = false;
    let earned = []; // достижения, которые выполнила эта покупка
    if (owned) {
      changed = this.shop.select(id);
    } else {
      const result = this.shop.buy(id);
      if (!result.ok && result.reason === 'unavailable') return false;
      if (!result.ok) {
        if (result.reason === 'poor') {
          this.showShopMessage(t('shop.missing', { n: result.missing }));
          this.audio?.play?.('nope');
        }
        return false;
      }
      changed = true;
      this.audio?.play?.('buy');
      this.haptics?.pulse?.('best');
      earned = this.checkAchievements?.({ silent: true }) || [];
      // Покупка сразу уходит в облако: монеты и скин не должны потеряться, если игрок закроет игру.
      this.platform?.saveCloudData?.(this.cloudSnapshot());
    }
    this.coins = this.storage.getCoins();
    if (changed) this.applySelectedSkin();
    this.shopWindow.message = null;
    this.requestRender();
    // В магазине плашке негде висеть: о новом достижении («5 скинов», «все скины») говорит строка подсказки.
    if (earned.length) this.showShopMessage(t('achievements.toast', { name: t(`achievements.name.${earned[0]}`) }));
    return changed;
  }

  // Подсказка в окне магазина гаснет через CONFIG.SHOP.MESSAGE_SECONDS.
  showShopMessage(message) {
    const shopWindow = this.shopWindow;
    if (!shopWindow) return;
    shopWindow.message = message;
    this.requestRender();
    const timer = setTimeout(() => {
      if (this.shopWindow === shopWindow && shopWindow.message === message) {
        shopWindow.message = null;
        this.requestRender();
      }
    }, CONFIG.SHOP.MESSAGE_SECONDS * 1000);
    timer.unref?.();
  }

  // --- Задания на день (Quests.js): кнопка и окно на стартовом экране, плашка в забеге ---

  // Событие для заданий: монета, рискованный проход, «впритирку», конец забега... Если это выполняет
  // сегодняшнее задание, монеты выдаются сразу (Quests.record), а игрок видит плашку.
  recordQuest(kind, value = 1) {
    if (!this.quests) return [];
    const completed = this.quests.record(kind, value, this.todayKey());
    for (const quest of completed) this.onQuestDone(quest);
    return completed;
  }

  onQuestDone(quest) {
    this.coins = this.storage.getCoins();
    if (!this.questToasts) this.questToasts = [];
    this.questToasts.push({ reward: quest.reward, age: 0 });
    this.audio?.play?.('buy');
    this.haptics?.pulse?.('best');
    this.noteQuestsForAchievements();
  }

  // Последнее из заданий дня выполнено: это ещё один день серии «все задания» (достижение «Прилежный кот»).
  noteQuestsForAchievements() {
    if (!this.achievements || !this.quests) return;
    const today = this.todayKey();
    const { done, total } = this.quests.summary(today);
    if (total <= 0 || done < total) return;
    this.achievements.noteQuestsDone(today);
    this.checkAchievements();
  }

  // Что сейчас набрано в забеге по заданиям «за один забег».
  questRunValue(kind) {
    if (kind === 'survive') return Math.floor(this.runTime - (this.devStartTime || 0));
    if (kind === 'score') return Math.floor(this.distanceScore + this.pathReward);
    if (kind === 'multiplier') return Math.floor(this.runMaxMultiplier || CONFIG.MULTIPLIER_START);
    return 0;
  }

  // Следим за заданиями «за один забег» (секунды, очки, множитель): цель достигнута — сообщаем сразу,
  // не дожидаясь конца забега. Проверка — несколько сравнений чисел за кадр; в хранилище пишем один раз.
  updateQuests() {
    if (!this.questWatch?.length) return;
    const reached = this.questWatch.filter(({ kind, target }) => this.questRunValue(kind) >= target);
    if (!reached.length) return;
    this.questWatch = this.questWatch.filter((item) => !reached.includes(item));
    for (const { kind } of reached) this.recordQuest(kind, this.questRunValue(kind));
  }

  // Плашка «задание выполнено» живёт TOAST_SECONDS секунд игрового времени; несколько идут по очереди.
  updateQuestToast(deltaTime) {
    const toast = this.questToasts?.[0];
    if (!toast) return;
    toast.age += deltaTime;
    if (toast.age >= CONFIG.QUESTS.TOAST_SECONDS) this.questToasts.shift();
  }

  // Конец забега для заданий: лучшие результаты забега (секунды, очки, множитель), «сыграй забеги» и
  // «забег дня». Мгновенный проигрыш (короче MIN_RUN_SECONDS) за забег не считается, а после
  // возрождения тот же забег не считается дважды.
  finishQuestRun(totalScore) {
    if (!this.quests) return;
    const seconds = Math.floor(this.runTime - (this.devStartTime || 0));
    this.recordQuest('survive', seconds);
    this.recordQuest('score', totalScore);
    this.recordQuest('multiplier', this.questRunValue('multiplier'));
    if (seconds < CONFIG.QUESTS.MIN_RUN_SECONDS || this.questRunCounted) return;
    this.questRunCounted = true;
    this.recordQuest('runs', 1);
    if (this.dailyRun) this.recordQuest('daily', 1);
  }

  openQuests() {
    if (this.questsWindow || this.achievementsWindow || this.state !== 'START' || this.shopWindow || this.leaderboard) return false;
    this.questsWindow = {};
    this.requestRender();
    return true;
  }

  closeQuests() {
    if (!this.questsWindow) return false;
    this.questsWindow = null;
    this.requestRender();
    return true;
  }

  // Что нарисовать в окне заданий: задания с прогрессом и сколько минут до новых (полночь по Москве).
  questsView() {
    return {
      quests: this.quests.list(this.todayKey()),
      resetMinutes: Math.max(1, Math.ceil(msUntilNextDay(this.nowMs()) / 60000))
    };
  }

  handleQuestsTap(x, y) {
    return this.renderer?.hitQuestsButton?.(x, y) ? this.closeQuests() : false;
  }

  // --- Достижения (Achievements.js): кнопка и окно на стартовом экране, плашка в забеге ---

  // Сводка для накопительных достижений: монеты за всё время, скины (без сезонных), серия забега дня и серия дней с заданиями.
  achievementStats() {
    const regular = CONFIG.SHOP.SKINS.filter((skin) => !skin.limited).map((skin) => skin.id);
    const owned = new Set(this.shop.owned());
    const today = this.todayKey();
    return {
      coinsEarned: this.storage.coinCounters().earned,
      skins: regular.filter((id) => owned.has(id)).length,
      skinsTotal: regular.length,
      dailyStreak: this.daily.streakAt(today),
      questStreak: this.achievements.questStreakAt(today)
    };
  }

  // Выдаёт достижение «за один забег». silent — без плашки и звука. true — получено только что.
  unlockAchievement(id, { silent = false } = {}) {
    if (!this.achievements || !this.achievements.unlock(id)) return false;
    if (!silent) this.onAchievement(id);
    return true;
  }

  // Проверка накопительных достижений. Возвращает список только что полученных.
  checkAchievements({ silent = false } = {}) {
    if (!this.achievements) return [];
    const earned = this.achievements.evaluate(this.achievementStats());
    if (!silent) for (const id of earned) this.onAchievement(id);
    return earned;
  }

  onAchievement(id) {
    if (!this.achievementToasts) this.achievementToasts = [];
    this.achievementToasts.push({ id, age: 0 });
    this.audio?.play?.('buy');
    this.haptics?.pulse?.('best');
  }

  // Достижения про секунды забега: «долгий забег» и «забег без монет». Проверка — два сравнения чисел за кадр.
  updateAchievements() {
    const watch = this.achRunWatch;
    if (!watch || !this.achievements) return;
    const cfg = CONFIG.ACHIEVEMENTS;
    if (watch.longRun && this.runTime - (this.devStartTime || 0) >= cfg.SURVIVE_SECONDS) {
      watch.longRun = false;
      this.unlockAchievement('longRun');
    }
    if (watch.cleanRun && this.runTime - this.lastCoinAt >= cfg.CLEAN_SECONDS) {
      watch.cleanRun = false;
      this.unlockAchievement('cleanRun');
    }
  }

  // Плашка «достижение получено» живёт TOAST_SECONDS секунд игрового времени; несколько идут по очереди.
  updateAchievementToast(deltaTime) {
    const toast = this.achievementToasts?.[0];
    if (!toast) return;
    toast.age += deltaTime;
    if (toast.age >= CONFIG.ACHIEVEMENTS.TOAST_SECONDS) this.achievementToasts.shift();
  }

  achievementsSummary() {
    return this.achievements ? this.achievements.summary() : null;
  }

  openAchievements() {
    if (!this.achievements || this.achievementsWindow || this.state !== 'START') return false;
    if (this.shopWindow || this.questsWindow || this.leaderboard) return false;
    this.achievementsWindow = {};
    this.requestRender();
    return true;
  }

  closeAchievements() {
    if (!this.achievementsWindow) return false;
    this.achievementsWindow = null;
    this.requestRender();
    return true;
  }

  // Что нарисовать в окне достижений: строки { id, done, progress, target } и сколько получено.
  achievementsView() {
    const items = this.achievements.list(this.achievementStats());
    return { items, done: items.filter((item) => item.done).length, total: items.length };
  }

  handleAchievementsTap(x, y) {
    return this.renderer?.hitAchievementsButton?.(x, y) ? this.closeAchievements() : false;
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
    // Пока открыт магазин или таблица лидеров, нажатия достаются только им.
    if (this.shopWindow) {
      this.handleShopTap(x, y);
      return false;
    }
    if (this.questsWindow) {
      this.handleQuestsTap(x, y);
      return false;
    }
    if (this.achievementsWindow) {
      this.handleAchievementsTap(x, y);
      return false;
    }
    if (this.leaderboard) {
      this.handleLeaderboardTap(x, y);
      return false;
    }
    // Кнопки звука, таблицы лидеров и ярлыка не запускают забег.
    if (this.handleSoundTap?.(x, y)) return false;
    if (this.handlePlatformTap?.(x, y)) return false;
    // «Забег дня» на стартовом экране запускает забег дня, любое другое нажатие — обычный.
    if (this.state === 'START' && this.renderer?.hitDailyButton?.(x, y)) return this.startDaily();
    // Во время забега нажатие по значку паузы ставит паузу, на паузе — кнопка «продолжить».
    if (this.state === 'PLAYING') {
      if (this.userPaused) {
        if (this.renderer?.hitResumeButton?.(x, y)) this.resume();
        else if (this.renderer?.hitPauseMenuButton?.(x, y)) this.menuFromPause();
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
  // Если награды нет, игрок видит короткую надпись (раньше после закрытия рекламы не происходило ничего).
  showRewardedAd(onRewarded) {
    this.rewardPending = true;
    this.setAdPaused(true);
    return Promise.resolve(this.platform.showRewarded())
      .catch((error) => ({ attempted: true, rewarded: false, error }))
      .then((result) => {
        this.rewardPending = false;
        this.setAdPaused(false);
        if (result?.rewarded) onRewarded();
        else if (result?.attempted) this.showNotice(result.error ? 'over.adFailed' : 'over.noReward');
        return !!result?.rewarded;
      });
  }

  // Надпись на экране проигрыша: ключ строки и возраст в секундах (живёт CONFIG.YANDEX.NOTICE_SECONDS).
  showNotice(key) {
    this.notice = { key, age: 0 };
  }

  updateNotice(deltaTime) {
    if (!this.notice) return;
    this.notice.age += deltaTime;
    if (this.notice.age >= CONFIG.YANDEX.NOTICE_SECONDS) this.notice = null;
  }

  // Возрождение за рекламу не должно зависеть от того, снят ли уже флаг паузы платформы: Яндекс присылает
  // «возобновить» (game_api_resume) вокруг onClose, и до этого игра считала себя на паузе и отказывала в
  // возрождении, хотя реклама была досмотрена (на телефоне «ничего не происходило»). Игра сама стоит, пока
  // пауза не снимется (update ничего не делает), так что возродить можно сразу.
  requestRevive() {
    if (!this.canOfferRevive()) return false;
    this.showRewardedAd(() => this.revive({ ignorePause: true }));
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
  canRevive({ ignorePause = false } = {}) {
    // Не во время рекламы/паузы (кроме выдачи награды, ignorePause) и не когда уже запрошен рестарт
    // (иначе рестарт после следующей смерти заблокируется).
    return this.state === 'GAMEOVER'
      && !this.reviveUsed
      && !this.launchPending
      && (ignorePause || !this.isGameplayPaused?.());
  }

  revive({ ignorePause = false } = {}) {
    if (!this.canRevive({ ignorePause })) return false;
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
    if (this.multiplier !== prevMultiplier) this.multBubble = { value: this.multiplier, up: this.multiplier > prevMultiplier, age: 0 };
    // Для заданий: узкий путь пройден, а множитель мог вырасти.
    this.runMaxMultiplier = Math.max(this.runMaxMultiplier || CONFIG.MULTIPLIER_START, this.multiplier);
    if (isIntentional) this.recordQuest?.('risk', 1);
    if (isIntentional && this.riskStreak >= CONFIG.ACHIEVEMENTS.RISK_STREAK) this.unlockAchievement?.('bold');
    if (this.multiplier >= CONFIG.MULTIPLIER_MAX) this.unlockAchievement?.('topMultiplier');

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

  // Новый этап суток: плашка с названием, мелодия и вибрация. Плашка живёт TOAST_SECONDS секунд
  // игрового времени (на паузе стоит). На старте забега этап «день» без плашки.
  updateStage(deltaTime) {
    const stage = timeOfDay(this.runTime + (this.todOffset || 0));
    if (stage.key !== this.stageKey) {
      this.stageKey = stage.key;
      this.stageToast = { name: stage.name, age: 0 };
      this.feel?.onStage?.();
      this.audio?.setAmbience?.(ambienceFor(stage.name));
    } else if (this.stageToast) {
      this.stageToast.age += deltaTime;
      if (this.stageToast.age >= CONFIG.TIME_OF_DAY.TOAST_SECONDS) this.stageToast = null;
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
    this.recordQuest?.('graze', 1);
    if (this.grazeCombo >= CONFIG.ACHIEVEMENTS.GRAZE_COMBO) this.unlockAchievement?.('closeCalls');
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
    this.recordQuest?.('coins', gained);
    this.lastCoinAt = this.runTime;
    this.checkAchievements?.(); // «копилка»: монеты за всё время
  }

  // quiet — выход в меню с паузы: те же итоги забега, но без эффектов поражения и просьбы об оценке.
  gameOver({ quiet = false } = {}) {
    this.state = 'GAMEOVER';
    const totalScore = Math.floor(this.distanceScore + this.pathReward);
    const previousBest = this.bestScore || 0;
    // Забег дня не меняет рекорд, не идёт в таблицу лидеров и не просит оценку: трасса знакомая,
    // иначе её можно было бы выучить ради рекорда. Его итог — лучший счёт дня и награда.
    this.isNewBest = !this.dailyRun && totalScore > previousBest;
    if (this.isNewBest) {
      this.bestScore = totalScore;
      this.storage.set('bestScore', this.bestScore);
      this.bestRunTime = cleanSeconds(this.runTime);
      this.storage.set('bestRunTime', this.bestRunTime);
      const submission = this.platform?.submitScore?.(totalScore);
      Promise.resolve(submission).catch(() => {});
    }
    if (this.dailyRun) this.finishDailyRun(totalScore);
    this.finishQuestRun?.(totalScore);
    this.checkAchievements?.(); // серия забега дня, монеты за задания и забег дня
    // После возрождения это тот же забег: для частоты рекламы не считаем дважды.
    if (!this.reviveUsed) this.platform?.recordRunCompleted?.();
    // Рекорд, монеты и подсказки уходят в облако Яндекса (платформа сама ограничивает частоту).
    this.platform?.saveCloudData?.(this.cloudSnapshot());
    if (!quiet) this.maybeAskForReview?.();
    this.syncGameplayLifecycle?.();
    if (!quiet) this.feel?.onGameOver(this.player.x, this.player.y);
    if (this.isNewBest && !quiet) this.feel?.onNewBest?.(this.player.x, this.player.y);
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

    // Рисуем в логических 540 × 960; настоящих пикселей на холсте может быть вдвое больше (RenderScale).
    const scale = this.renderScale?.() || 1;
    this.ctx?.setTransform?.(scale, 0, 0, scale, 0, 0);
    this.renderer.setScale?.(scale);

    this.renderer.clear();
    this.renderer.drawBackdrop(time);
    this.renderer.drawFarWorld(camera);
    this.renderer.beginWorld({ x: 0, y: camera ? camera.gameplayShift() : 0 });
    this.renderer.setRecordMarker?.(this.recordMarkerY());
    this.renderer.drawWorld(camera, this.track.segments, this.player.y);
    this.renderer.drawSegments(this.track.segments);
    this.renderer.drawPlayer(this.player, this.feel, this.shieldTime > 0 ? { left: this.shieldTime, total: CONFIG.SHIELD.DURATION } : null);
    this.renderer.drawParticles(this.feel?.particles.particles);
    this.renderer.drawFloatingRewards(this.floatingRewards);
    if (this.multBubble && this.state === 'PLAYING') this.renderer.drawMultBubble?.(this.multBubble, this.player);
    this.renderer.endWorld();

    // Время суток лежит поверх сада (не поверх HUD). На стартовом экране всегда день.
    if (this.state === 'PLAYING' || this.state === 'GAMEOVER') {
      this.renderer.drawTimeOfDay(timeOfDay(this.runTime + (this.todOffset || 0)).look, time);
    }

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

    if (this.state === 'PLAYING' && this.stageToast) {
      const age = this.stageToast.age;
      const life = CONFIG.TIME_OF_DAY.TOAST_SECONDS;
      const alpha = Math.min(1, age / 0.25, (life - age) / 0.5);
      this.renderer.drawStageToast(t(`stage.${this.stageToast.name}`), alpha);
    }

    if (this.state === 'PLAYING' && !this.userPaused && this.choiceHintVisible()) {
      this.renderer.drawChoiceHint(t('hint.choice'));
    }

    if (this.state === 'PLAYING' && this.userPaused) {
      this.renderer.drawPause(
        Math.floor(this.score),
        this.bestScore,
        this.audio?.muted,
        this.audio?.volume,
        { menuAsk: this.pauseMenuAsking?.() }
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
          nextSkin: this.nextSkinView(),
          daily: this.dailyRun ? this.dailyResult : null,
          leaderboard: this.canShowLeaderboard(),
          menu: true
        }
      );
    } else if (this.state === 'START') {
      this.renderer.drawStartScreen(this.audio?.muted, this.audio?.volume, {
        shop: true,
        quests: this.quests?.summary(this.todayKey()),
        achievements: this.achievementsSummary?.(),
        daily: this.dailyView(),
        leaderboard: this.canShowLeaderboard(),
        shortcut: this.shortcutAvailable
      });
    }

    // Надпись «награды нет»: на экране проигрыша выше карточки (плашка задания, если она есть, уходит выше).
    const notice = this.notice;
    if (notice && this.state === 'GAMEOVER') {
      const life = CONFIG.YANDEX.NOTICE_SECONDS;
      const alpha = Math.min(1, notice.age / 0.2, (life - notice.age) / 0.4);
      this.renderer.drawStageToast(t(notice.key), alpha, 124);
    }

    // Плашка «задание выполнено»: в забеге под плашкой времени суток, на экране проигрыша выше карточки.
    const questToast = this.questToasts?.[0];
    if (questToast && (this.state === 'GAMEOVER' || (this.state === 'PLAYING' && !this.userPaused))) {
      const life = CONFIG.QUESTS.TOAST_SECONDS;
      const alpha = Math.min(1, questToast.age / 0.25, (life - questToast.age) / 0.5);
      const top = this.state === 'PLAYING' ? 176 : (notice ? 76 : 124);
      this.renderer.drawStageToast(t('quest.toast', { n: questToast.reward }), alpha, top);
    }

    // Плашка «достижение получено» стоит рядом с остальными плашками и не перекрывает их.
    const achievementToast = this.achievementToasts?.[0];
    if (achievementToast && (this.state === 'GAMEOVER' || (this.state === 'PLAYING' && !this.userPaused))) {
      const life = CONFIG.ACHIEVEMENTS.TOAST_SECONDS;
      const alpha = Math.min(1, achievementToast.age / 0.25, (life - achievementToast.age) / 0.5);
      const taken = (notice ? 1 : 0) + (questToast ? 1 : 0);
      const top = this.state === 'PLAYING' ? (questToast ? 228 : 176) : 124 - 48 * taken;
      this.renderer.drawStageToast(t('achievements.toast', { name: t(`achievements.name.${achievementToast.id}`) }), alpha, top);
    }

    // Окна магазина, заданий и таблицы лидеров лежат поверх любого экрана.
    if (this.shopWindow) this.renderer.drawShop(this.shopView());
    if (this.questsWindow) this.renderer.drawQuests(this.questsView());
    if (this.achievementsWindow) this.renderer.drawAchievements(this.achievementsView());

    // Окно таблицы лидеров лежит поверх любого экрана.
    if (this.leaderboard) this.renderer.drawLeaderboard(this.leaderboard);
  }
}
