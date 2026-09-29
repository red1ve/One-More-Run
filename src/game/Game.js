import { t } from '../localization/i18n.js';
import { CONFIG, getTrackSpeed, getPlayerSpeed } from '../config.js';
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
    this.feel = new GameFeel(this.audio);
    this.keyboardInput = new KeyboardInput();
    this.mouseInput = new MouseInput(this.canvas);
    this.touchInput = new TouchInput(this.canvas);
    this.audio.setMuted(!!this.storage.get('audioMuted', false));

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
    this.showFirstRunHints = !this.storage.get('onboardingSeen', false);
    this.riskHintSeen = !!this.storage.get('riskHintSeen', false);
    this.hidden = false;
    this.platformPaused = false;
    this.adPaused = false;
    this.launchPending = false;
    this.adFinished = false;

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
    return this.hidden || this.platformPaused || this.adPaused;
  }

  syncGameplayLifecycle() {
    this.platform?.setGameplayActive?.(
      this.state === 'PLAYING' && !this.isGameplayPaused()
    );
  }

  toggleMute() {
    const muted = this.audio.toggleMuted();
    this.storage.set('audioMuted', muted);
    return muted;
  }

  tryLaunch() {
    if (this.state === 'PLAYING' || this.launchPending || this.rewardPending) return false;
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
    if (this.showFirstRunHints) {
      this.storage.set('onboardingSeen', true);
      this.showFirstRunHints = false;
    }
    this.state = 'PLAYING';
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
    this.rewardPending = false;
    this.reviveUsed = false;
    this.invulnerableTime = 0;
    this.player.invulnerable = 0;
    // runSeed задан (например ?seed=42 в адресе) — трасса каждый раз одинаковая.
    this.track.setSeed?.(this.runSeed ?? null);
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
    return this.state === 'GAMEOVER'
      && (this.runCoins || 0) > 0
      && !this.coinsDoubled
      && !this.rewardPending
      && !this.launchPending
      && !this.isGameplayPaused()
      && !!this.platform?.canShowRewarded?.();
  }

  // Нажатие на экран (мышь или палец) в логических координатах холста.
  handleTap(x, y) {
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
    this.renderer.drawDeferredWorld();
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
      // На экранах START и Game Over звук показан отдельной капсулой.
      this.state === 'PLAYING'
    );

    if (this.state === 'GAMEOVER') {
      this.renderer.drawGameOver(
        Math.floor(this.distanceScore + this.pathReward),
        this.bestScore,
        this.coins,
        this.feel?.gameOverAge ?? 1,
        {
          isNewBest: this.isNewBest,
          muted: this.audio?.muted,
          offerRevive: this.canOfferRevive(),
          offerDouble: this.canOfferDoubleCoins(),
          runCoins: this.runCoins || 0,
          coinsDoubled: !!this.coinsDoubled
        }
      );
    } else if (this.state === 'START') {
      this.renderer.drawStartScreen(this.audio?.muted, this.showFirstRunHints);
    }
  }
}
