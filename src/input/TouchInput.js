export class TouchInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.activeTouchX = null;

    // Вешаем слушатели тач-событий с passive: false, чтобы иметь возможность отключать прокрутку страницы
    canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));
  }

  handleTouch(e) {
    // Блокируем жест прокрутки и масштабирования страницы браузера во время игры
    if (e.cancelable) {
      e.preventDefault();
    }
    
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      
      // Переводим координату тача на экране в логические координаты холста (0..540)
      this.activeTouchX = (touchX / rect.width) * this.canvas.width;
    }
  }

  handleTouchEnd(e) {
    if (e.touches.length === 0) {
      this.activeTouchX = null;
    } else {
      // Если пальцев несколько, ориентируемся на первый оставшийся
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      this.activeTouchX = (touchX / rect.width) * this.canvas.width;
    }
  }

  getTouchX() {
    return this.activeTouchX;
  }
}