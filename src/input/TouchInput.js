export class TouchInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.activeTouchX = null;
    this.pointers = 0;
    this.suppress = false;

    // Вешаем слушатели тач-событий с passive: false, чтобы иметь возможность отключать прокрутку страницы
    canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));
  }

  touchLogicalX(touch) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return ((touch.clientX - rect.left) / rect.width) * this.canvas.width;
  }

  handleTouch(e) {
    // Блокируем жест прокрутки и масштабирования страницы браузера во время игры
    if (e.cancelable) {
      e.preventDefault();
    }

    this.pointers = e.touches.length;
    if (this.suppress) {
      this.activeTouchX = null;
      return;
    }

    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this.activeTouchX = this.touchLogicalX(touch);
    }
  }

  handleTouchEnd(e) {
    this.pointers = e.touches.length;
    if (e.touches.length === 0) {
      this.suppress = false;
      this.activeTouchX = null;
    } else if (!this.suppress) {
      // Если пальцев несколько, ориентируемся на первый оставшийся
      const touch = e.touches[0];
      this.activeTouchX = this.touchLogicalX(touch);
    }
  }

  getTouchX() {
    if (this.suppress) return null;
    return this.activeTouchX;
  }

  reset() {
    this.activeTouchX = null;
    this.suppress = this.pointers > 0;
  }
}