import { CONFIG, getTrackSpeed } from '../config.js';
import { Renderer } from '../rendering/Renderer.js';
import { Player } from './Player.js';
import { Track } from './Track.js';
import { KeyboardInput } from '../input/KeyboardInput.js';
import { TouchInput } from '../input/TouchInput.js';
import { StorageService } from '../services/StorageService.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.storage = new StorageService();
    this.renderer = new Renderer(this.ctx);
    this.keyboardInput = new KeyboardInput();
    this.touchInput = new TouchInput(this.canvas);
    
    this.player = new Player();
    this.track = new Track();
    
    this.state = 'START'; // START, PLAYING, GAMEOVER
    this.score = 0;
    this.distanceScore = 0;
    this.pathReward = 0;
    this.bestScore = this.storage.get('bestScore', 0);
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    
    this.currentSpeed = CONFIG.TRACK_SPEED_START;
    this.runTime = 0;
    this.lastTime = 0;
    this.isRunning = false;
    this.floatingRewards = [];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.state = 'PLAYING';
    this.score = 0;
    this.distanceScore = 0;
    this.pathReward = 0;
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    this.currentSpeed = CONFIG.TRACK_SPEED_START;
    this.runTime = 0;
    this.floatingRewards = [];

    this.player.reset();
    this.track.reset();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
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
    if (this.state === 'GAMEOVER') {
      if (this.keyboardInput.isRestartPressed()) {
        this.restart();
      }
      return;
    }

    if (this.state !== 'PLAYING') return;

    // Управление
    let moveDirection = 0;
    if (this.keyboardInput.isLeftPressed()) moveDirection = -1;
    else if (this.keyboardInput.isRightPressed()) moveDirection = 1;

    if (moveDirection === 0) {
      const touchX = this.touchInput.getTouchX();
      if (touchX !== null) {
        const deadZone = 10;
        const distance = touchX - this.player.x;
        if (Math.abs(distance) > deadZone) moveDirection = Math.sign(distance);
      }
    }

    this.player.setMoveDirection(moveDirection);
    this.player.update(deltaTime);

    this.runTime += deltaTime;
    this.currentSpeed = getTrackSpeed(this.runTime);

    this.track.update(deltaTime, this.currentSpeed);

    // Начисление очков за время (не умножается на множитель)
    this.distanceScore += CONFIG.SCORE_BASE_PER_SECOND * deltaTime;
    this.score = Math.floor(this.distanceScore + this.pathReward);

    const result = this.track.checkPassed(this.player);
    if (result.rewardType) {
      this.applyReward(result.rewardType, result.isIntentional, result.isChoice);
    }

    // Обновление всплывающих очков
    this.floatingRewards = this.floatingRewards.filter(r => {
      r.y -= 100 * deltaTime;
      r.life -= deltaTime;
      return r.life > 0;
    });

    if (this.track.checkCollision(this.player)) {
      this.gameOver();
      return;
    }
  }

  applyReward(type, isIntentional, isChoice = false) {
    if (!Object.prototype.hasOwnProperty.call(CONFIG.REWARDS, type)) {
      console.warn('Game: неизвестный тип награды, пропуск', type);
      return;
    }

    const baseReward = CONFIG.REWARDS[type];
    let finalReward = baseReward;

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

    this.floatingRewards.push({
      x: this.player.x,
      y: this.player.y - 40,
      value: Math.floor(finalReward),
      type: type,
      life: 1.0
    });
  }

  gameOver() {
    this.state = 'GAMEOVER';
    this.isRunning = false;
    const totalScore = Math.floor(this.distanceScore + this.pathReward);
    if (totalScore > this.bestScore) {
      this.bestScore = totalScore;
      this.storage.set('bestScore', this.bestScore);
    }
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.riskStreak = 0;
    console.log('Game Over! Score:', totalScore);
  }
  restart() {
    this.start();
  }

  render() {
    this.renderer.clear();
    this.renderer.drawTrack();
    this.renderer.drawSegments(this.track.segments);
    this.renderer.drawPlayer(this.player);
    this.renderer.drawFloatingRewards(this.floatingRewards);
    
    // HUD
    this.renderer.drawHUD(Math.floor(this.score), this.multiplier, this.bestScore, this.riskStreak);

    if (this.state === 'GAMEOVER') {
      this.renderer.drawGameOver(Math.floor(this.score), this.bestScore);
    } else if (this.state === 'START') {
      this.renderer.drawStartScreen();
    }
  }
}