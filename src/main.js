import './style.css';
// Только латиница Fredoka (иврит и расширенная латиница игре не нужны).
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { Game } from './game/Game.js';
import { CONFIG } from './config.js';
import { YandexService } from './services/YandexService.js';
import { setLanguage } from './localization/i18n.js';
import { loadCyrillicFont } from './localization/fonts.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('Элемент canvas не найден на странице!');
    return;
  }

  const yandex = new YandexService(
    // В npm run dev без SDK реклама за награду имитируется, чтобы проверить кнопки.
    import.meta.env?.DEV ? { config: { ...CONFIG.YANDEX, DEV_REWARDED_STUB: true } } : {}
  );
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
  // Нажатие по холсту: на экране проигрыша могут быть кнопки «за рекламу».
  const tapFromEvent = (clientX, clientY) => {
    game.unlockAudio();
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return game.tryLaunch();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return game.handleTap(x, y);
  };

  canvas.addEventListener('mousedown', (event) => tapFromEvent(event.clientX, event.clientY));
  canvas.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches?.[0];
    if (touch) tapFromEvent(touch.clientX, touch.clientY);
    else launchFromGesture();
  }, { passive: true });
  gameArea.addEventListener('contextmenu', (event) => event.preventDefault());
  // iOS Safari игнорирует user-scalable=no: запрещаем масштабирование жестами явно.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });

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
  // Яндексу сообщаем «игра готова», когда загрузились картинки сада (или прошло
  // 6 с — чтобы медленная сеть не держала игру на экране загрузки платформы).
  const artLoaded = game.renderer?.garden?.artPack?.whenLoaded || Promise.resolve();
  Promise.race([artLoaded, new Promise((resolve) => setTimeout(resolve, 6000))]).then(() => {
    if (game.state === 'START') game.render();
    yandex.notifyGameReady();
  });
  // Язык из Яндекса; без SDK — английский. В npm run dev можно проверить: ?lang=ru.
  const devLang = import.meta.env?.DEV
    ? new URLSearchParams(window.location.search).get('lang')
    : null;
  const applyLanguage = (lang) => {
    setLanguage(lang);
    // Русский шрифт грузится только для русского языка; перерисовываем, когда готов.
    if (lang === 'ru') {
      loadCyrillicFont().then(() => {
        if (game.state === 'START') game.render();
      });
    }
    if (game.state === 'START') game.render();
  };
  if (devLang) applyLanguage(devLang);
  yandex.init().then(() => {
    if (!devLang) applyLanguage(yandex.getLanguage());
  });
});
