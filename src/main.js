import './style.css';
import { Game } from './game/Game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('Элемент canvas не найден на странице!');
    return;
  }

  // Создаем и запускаем инстанс игры
  const game = new Game(canvas);
  
  // Начальная отрисовка стартового экрана
  game.render();
  
  // Обработка клика для старта
  canvas.addEventListener('mousedown', () => {
    if (game.state === 'START') {
      game.start();
    }
  });

  canvas.addEventListener('touchstart', () => {
    if (game.state === 'START') {
      game.start();
    }
  });

  // Добавляем возможность перезапуска для тестов (клавиша R)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') {
      game.restart();
    }
  });

  // Глобальная обработка ошибок для отладки
  window.addEventListener('error', (event) => {
    console.error('Необработанная ошибка во время выполнения:', event.error || event.message);
  });
});