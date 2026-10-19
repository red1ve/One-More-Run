import { CONFIG } from '../config.js';

export class Player {
  constructor() {
    this.width = CONFIG.PLAYER_WIDTH;
    this.height = CONFIG.PLAYER_HEIGHT;
    this.x = CONFIG.CANVAS_WIDTH / 2;
    this.y = CONFIG.PLAYER_START_Y;

    this.speed = CONFIG.PLAYER_SPEED;
    this.moveDirection = 0;
    // Точка, к которой едем (палец или мышь), либо null. Клавиатура (moveDirection) главнее.
    this.target = null;
    this.following = false;
    // Наклон кота от -1 до 1: считается по тому, как кот реально сдвинулся за кадр (см. update).
    this.lean = 0;
  }

  // Клавиатура: -1 влево, 1 вправо, 0 стоять.
  setMoveDirection(dir) {
    this.moveDirection = dir;
  }

  // Палец или мышь: x точки касания в логических пикселях, null — ничего не нажато.
  steerTo(x) {
    this.target = Number.isFinite(x) ? x : null;
    if (this.target === null) this.following = false;
  }

  // Сколько сдвинуться за кадр к точке касания. Скорость та же, что у клавиатуры, но шаг
  // никогда не больше оставшегося расстояния, поэтому кот не проскакивает палец и не дрожит у него.
  steerStep(deltaTime) {
    const gap = this.target - this.x;
    const distance = Math.abs(gap);
    const { START_PX, STOP_PX } = CONFIG.STEER;
    if (!this.following && distance > START_PX) this.following = true;
    if (!this.following) return 0;
    const step = Math.min(distance, this.speed * deltaTime);
    if (distance - step <= STOP_PX) this.following = false;
    return Math.sign(gap) * step;
  }

  update(deltaTime, bounds = null) {
    const before = this.x;
    if (this.moveDirection !== 0) {
      this.x += this.moveDirection * this.speed * deltaTime;
    } else if (this.target !== null) {
      this.x += this.steerStep(deltaTime);
    }

    const halfWidth = this.width / 2;
    const minX = bounds && Number.isFinite(bounds.minX)
      ? bounds.minX
      : CONFIG.TRACK_LEFT + halfWidth;
    const maxX = bounds && Number.isFinite(bounds.maxX)
      ? bounds.maxX
      : CONFIG.TRACK_RIGHT - halfWidth;

    if (this.x < minX) this.x = minX;
    if (this.x > maxX) this.x = maxX;

    // Наклон идёт за реальным сдвигом: упёрся в куст или стоит на месте — наклона нет.
    const full = this.speed * deltaTime;
    const wanted = full > 0 ? Math.max(-1, Math.min(1, (this.x - before) / full)) : 0;
    this.lean += (wanted - this.lean) * Math.min(1, deltaTime * CONFIG.STEER.LEAN_SMOOTH);
  }

  reset() {
    this.x = CONFIG.CANVAS_WIDTH / 2;
    this.moveDirection = 0;
    this.target = null;
    this.following = false;
    this.lean = 0;
  }
}
