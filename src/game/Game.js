import { CONFIG } from '../config.js';
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
    this.bestScore = this.storage.get('bestScore', 0);
    this.multiplier = CONFIG.MULTIPLIER_START;
    
    this.currentSpeed = CONFIG.GAME_SPEED;
    this.lastTime = 0;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.state = 'PLAYING';
    this.score = 0;
    this.multiplier = CONFIG.MULTIPLIER_START;
    this.currentSpeed = CONFIG.GAME_SPEED;
    
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

    // Рост сложности (скорости) на основе очков
    this.currentSpeed = CONFIG.GAME_SPEED * (1 + (this.score / 10000) * CONFIG.DIFFICULTY_GROWTH);
    
    // Обновление трассы
    this.track.update(deltaTime, this.currentSpeed);

    // Начисление очков за время
    this.score += CONFIG.SCORE_BASE_PER_SECOND * this.multiplier * deltaTime;

    if (this.track.checkCollision(this.player)) {
      this.gameOver();
      return;
    }

    const rewardType = this.track.checkPassed(this.player);
    if (rewardType) {
      this.applyReward(rewardType);
    }
  }

  applyReward(type) {
    if (!Object.prototype.hasOwnProperty.call(CONFIG.REWARDS, type)) {
      console.warn('Game: неизвестный тип награды, пропуск', type);
      return;
    }

    const reward = CONFIG.REWARDS[type];
    this.score += reward * this.multiplier;

    if (type === 'RISKY' || type === 'SHORT_RISKY') {
      this.multiplier = Math.min(this.multiplier + CONFIG.MULTIPLIER_STEP, CONFIG.MULTIPLIER_MAX);
    }
  }

  gameOver() {
    this.state = 'GAMEOVER';
    this.isRunning = false;
    if (this.score > this.bestScore) {
      this.bestScore = Math.floor(this.score);
      this.storage.set('bestScore', this.bestScore);
    }
    console.log('Game Over! Score:', Math.floor(this.score));
  }

  restart() {
    this.start();
  }

  render() {
    this.renderer.clear();
    this.renderer.drawTrack();
    this.renderer.drawSegments(this.track.segments);
    this.renderer.drawPlayer(this.player);
    
    // HUD
    this.renderer.drawHUD(Math.floor(this.score), this.multiplier, this.bestScore);

    if (this.state === 'GAMEOVER') {
      this.renderer.drawGameOver(Math.floor(this.score), this.bestScore);
    } else if (this.state === 'START') {
      this.renderer.drawStartScreen();
    }
  }
}