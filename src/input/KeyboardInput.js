export class KeyboardInput {
  constructor() {
    this.keys = {};

    // Вешаем слушатели событий на клавиатуру
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      this.keys[e.code] = true; // Используем code для стабильности
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
      this.keys[e.code] = false;
    });
  }

  isLeftPressed() {
    return (
      this.keys['a'] || 
      this.keys['A'] || 
      this.keys['KeyA'] || 
      this.keys['ArrowLeft']
    );
  }

  isRightPressed() {
    return (
      this.keys['d'] || 
      this.keys['D'] || 
      this.keys['KeyD'] || 
      this.keys['ArrowRight']
    );
  }

  isRestartPressed() {
    return this.keys['r'] || this.keys['R'] || this.keys['KeyR'];
  }
}