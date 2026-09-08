import { CONFIG } from '../config.js';

export class Player {
  constructor() {
    this.width = CONFIG.PLAYER_WIDTH;
    this.height = CONFIG.PLAYER_HEIGHT;
    this.x = CONFIG.CANVAS_WIDTH / 2;
    this.y = CONFIG.PLAYER_START_Y;

    this.speed = CONFIG.PLAYER_SPEED;
    this.moveDirection = 0;
  }

  setMoveDirection(dir) {
    this.moveDirection = dir;
  }

  update(deltaTime) {
    if (this.moveDirection !== 0) {
      this.x += this.moveDirection * this.speed * deltaTime;
    }

    const halfWidth = this.width / 2;
    const minX = CONFIG.TRACK_LEFT + halfWidth;
    const maxX = CONFIG.TRACK_RIGHT - halfWidth;

    if (this.x < minX) this.x = minX;
    if (this.x > maxX) this.x = maxX;
  }

  reset() {
    this.x = CONFIG.CANVAS_WIDTH / 2;
    this.moveDirection = 0;
  }
}