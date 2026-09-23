import { CONFIG } from '../config.js';

export class WorldCamera {
  constructor() {
    this.focusY = CONFIG.PLAYER_START_Y;
    this.reset();
  }

  reset() {
    this.progress = 0;
    this.y = 0;
  }

  advance(distance) {
    this.progress += Number(distance) || 0;
  }

  follow(playerY, dt, playing = true, speed = CONFIG.TRACK_SPEED_START) {
    const py = Number(playerY) || this.focusY;
    const span = Math.max(1, CONFIG.TRACK_SPEED_MAX - CONFIG.TRACK_SPEED_START);
    const speedT = Math.max(0, Math.min(1, (Number(speed) - CONFIG.TRACK_SPEED_START) / span));
    const lead = 8 + speedT * Math.max(0, CONFIG.VISUAL.CAMERA_LEAD - 8);
    const focus = this.focusY - lead;
    const target = py - this.progress - focus;
    if (!playing) {
      this.y = py - this.progress - this.focusY;
      return;
    }
    const follow = CONFIG.VISUAL.CAMERA_FOLLOW;
    const t = 1 - Math.exp(-follow * Math.max(0, dt));
    this.y += (target - this.y) * t;

    const screenY = py - this.progress - this.y;
    const band = Math.max(6, CONFIG.VISUAL.CAMERA_LAG);
    const minY = focus - Math.min(6, band * 0.4);
    const maxY = focus + band;
    if (screenY < minY) this.y = py - this.progress - minY;
    if (screenY > maxY) this.y = py - this.progress - maxY;
  }

  gameplayShift() {
    return -(this.progress + this.y);
  }

  farY() {
    return this.y * CONFIG.VISUAL.CAMERA_FAR;
  }
}
