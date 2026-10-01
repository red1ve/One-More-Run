import { CONFIG, isIntentionalRiskType } from '../config.js';
import { ParticleSystem } from './ParticleSystem.js';

export function feelIntensity({ kind, streak = 0, multiplier = 1 }) {
  if (kind === 'safe') return CONFIG.FEEL.INTENSITY_SAFE;
  if (kind === 'coin') return CONFIG.FEEL.INTENSITY_COIN;
  if (kind === 'gameover') return CONFIG.FEEL.INTENSITY_MAX;
  if (multiplier >= CONFIG.MULTIPLIER_MAX) return CONFIG.FEEL.INTENSITY_MAX;
  if (streak >= 5) return 0.85;
  if (streak >= 3) return CONFIG.FEEL.INTENSITY_STREAK;
  if (streak >= 2) return 0.62;
  return CONFIG.FEEL.INTENSITY_RISK;
}

export class GameFeel {
  constructor(audio = null) {
    this.audio = audio;
    this.particles = new ParticleSystem();
    this.reset();
  }

  reset() {
    this.particles.clear();
    this.time = 0;
    this.shake = 0;
    this.shakeTime = 0;
    this.shakeDuration = CONFIG.FEEL.SHAKE_DURATION;
    this.flash = 0;
    this.flashColor = CONFIG.COLORS.FLASH_RISK;
    this.hudPulse = { streak: 0, multiplier: 0, coins: 0 };
    this.playerPulse = 0;
    this.speedScroll = 0;
    this.gameOverAge = 0;
    this.gameOverActive = false;
  }

  update(deltaTime, speed = CONFIG.TRACK_SPEED_START) {
    const dt = Math.max(0, deltaTime);
    this.time += dt;
    this.speedScroll += speed * dt * CONFIG.FEEL.SPEED_SCROLL_SCALE;
    this.particles.update(dt);

    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime <= 0) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt / CONFIG.FEEL.FLASH_DURATION);
    this.playerPulse = Math.max(0, this.playerPulse - dt / CONFIG.FEEL.PLAYER_PULSE_DURATION);
    this.hudPulse.streak = Math.max(0, this.hudPulse.streak - dt / CONFIG.FEEL.HUD_PULSE_DURATION);
    this.hudPulse.multiplier = Math.max(0, this.hudPulse.multiplier - dt / CONFIG.FEEL.HUD_PULSE_DURATION);
    this.hudPulse.coins = Math.max(0, this.hudPulse.coins - dt / CONFIG.FEEL.HUD_PULSE_DURATION);

    if (this.gameOverActive) this.gameOverAge += dt;
  }

  shakeOffset() {
    if (this.shakeTime <= 0 || this.shake <= 0) return { x: 0, y: 0 };
    const fade = this.shakeTime / Math.max(this.shakeDuration, 0.001);
    const mag = this.shake * fade;
    return {
      x: (Math.random() * 2 - 1) * mag,
      y: (Math.random() * 2 - 1) * mag
    };
  }

  triggerShake(amount, duration) {
    this.shake = Math.max(this.shake, amount);
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  triggerFlash(color, amount = 1) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  onSafe(x, y) {
    this.particles.burst({
      x,
      y,
      count: CONFIG.FEEL.PARTICLE_SAFE,
      color: CONFIG.COLORS.HedgeSage,
      speed: 40,
      life: 0.28,
      size: 2
    });
    this.playerPulse = 0.4;
    this.audio?.play('safe');
  }

  onRisk({ x, y, streak, multiplier, stepped, hitMax }) {
    const intensity = feelIntensity({ kind: 'risk', streak, multiplier });
    const count = hitMax
      ? CONFIG.FEEL.PARTICLE_MAX_MULT
      : (streak >= 3 ? CONFIG.FEEL.PARTICLE_STREAK : CONFIG.FEEL.PARTICLE_RISK);
    this.particles.burst({
      x,
      y,
      count: Math.round(count * (0.6 + intensity * 0.5)),
      color: hitMax ? CONFIG.COLORS.CoinAmber : CONFIG.COLORS.RISKY_LABEL,
      speed: 70 + intensity * 50,
      life: 0.32 + intensity * 0.12,
      size: 3
    });
    this.playerPulse = 0.7 + intensity * 0.3;
    this.hudPulse.streak = 1;
    this.triggerFlash(CONFIG.COLORS.FLASH_RISK, intensity);

    if (hitMax) {
      this.triggerShake(CONFIG.FEEL.SHAKE_MAX_MULT, CONFIG.FEEL.SHAKE_DURATION_MAX);
      this.hudPulse.multiplier = 1;
      this.audio?.play('max');
    } else if (stepped) {
      this.triggerShake(CONFIG.FEEL.SHAKE_STREAK, CONFIG.FEEL.SHAKE_DURATION);
      this.hudPulse.multiplier = 1;
      this.audio?.play('streak');
    } else if (streak >= 3) {
      this.triggerShake(CONFIG.FEEL.SHAKE_STREAK * 0.7, CONFIG.FEEL.SHAKE_DURATION);
    } else {
      this.triggerShake(CONFIG.FEEL.SHAKE_RISK, CONFIG.FEEL.SHAKE_DURATION);
    }
  }

  onCoin(x, y) {
    this.particles.burst({
      x,
      y,
      count: CONFIG.FEEL.PARTICLE_COIN,
      color: CONFIG.COLORS.COIN,
      speed: 40,
      life: 0.22,
      gravity: 16,
      size: 2
    });
    this.hudPulse.coins = 0.7;
    this.playerPulse = 0.22;
    this.audio?.play('coin');
  }

  onStreakLost(x, y) {
    this.particles.burst({
      x,
      y,
      count: CONFIG.FEEL.PARTICLE_STREAK_LOSS,
      color: CONFIG.COLORS.UI_HUD,
      speed: 50,
      life: 0.32,
      size: 2.4
    });
    this.hudPulse.streak = 1;
    this.hudPulse.multiplier = 0.85;
    this.playerPulse = 0.45;
    this.triggerFlash(CONFIG.COLORS.FLASH_STREAK_LOSS, CONFIG.FEEL.INTENSITY_STREAK_LOSS);
    this.triggerShake(CONFIG.FEEL.SHAKE_STREAK_LOSS, CONFIG.FEEL.SHAKE_DURATION);
    this.audio?.play('streaklost');
  }

  onNewBest(x, y) {
    this.particles.burst({
      x: x ?? CONFIG.CANVAS_WIDTH / 2,
      y: y ?? CONFIG.CANVAS_HEIGHT / 2,
      count: 10,
      color: CONFIG.COLORS.COIN,
      speed: 70,
      life: 0.4,
      size: 2.6
    });
    this.hudPulse.multiplier = 1;
    this.triggerFlash(CONFIG.COLORS.FLASH_COIN, 0.7);
    this.audio?.play('newbest');
  }

  onGameOver(x, y) {
    this.gameOverActive = true;
    this.gameOverAge = 0;
    this.particles.burst({
      x,
      y,
      count: CONFIG.FEEL.PARTICLE_GAMEOVER,
      color: CONFIG.COLORS.HighRiskClay,
      speed: 90,
      life: 0.45,
      size: 3.2
    });
    this.triggerShake(CONFIG.FEEL.SHAKE_GAMEOVER, CONFIG.FEEL.SHAKE_DURATION_MAX);
    this.triggerFlash(CONFIG.COLORS.FLASH_FAIL, 1);
    this.audio?.play('gameover');
  }
}

