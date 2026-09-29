import './style.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { Game } from './game/Game.js';
import { YandexService } from './services/YandexService.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('Элемент canvas не найден на странице!');
    return;
  }

  const yandex = new YandexService();
  const game = new Game(canvas, yandex);
  // Только для разработки (npm run dev), в сборку не попадает:
  // ?seed=42 — одна и та же трасса при каждом старте; window.__omrGame — доступ из консоли.
  // В игре для игроков seed из адреса не работает, чтобы нельзя было выучить трассу для рекорда.
  if (import.meta.env?.DEV) {
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    if (seedParam !== null && Number.isFinite(Number(seedParam))) game.runSeed = Number(seedParam);
    window.__omrGame = game;
  }
  const gameArea = canvas.closest('#game-container') || canvas;
  game.setHidden(document.visibilityState === 'hidden');

  const launchFromGesture = () => {
    game.unlockAudio();
    game.tryLaunch();
  };

  canvas.addEventListener('mousedown', launchFromGesture);
  canvas.addEventListener('touchstart', launchFromGesture, { passive: true });
  gameArea.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') {
      game.toggleMute();
      if (game.state === 'START') game.render();
      return;
    }

    if (e.repeat) return;

    if (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') {
      if (e.code === 'Space') e.preventDefault();
      launchFromGesture();
    }
  });

  document.addEventListener('visibilitychange', () => {
    game.setHidden(document.visibilityState === 'hidden');
  });

  window.addEventListener('error', (event) => {
    console.error('Необработанная ошибка во время выполнения:', event.error || event.message);
  });

  game.render();
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (game.state === 'START') game.render();
    });
  }
  yandex.notifyGameReady();
  yandex.init().then(() => {
    document.documentElement.lang = yandex.getLanguage();
  });
});
