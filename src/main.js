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
    // В npm run dev без SDK реклама за награду, таблица лидеров, оценка и ярлык имитируются, чтобы проверить экраны.
    import.meta.env?.DEV ? { config: { ...CONFIG.YANDEX, DEV_REWARDED_STUB: true, DEV_PLATFORM_STUB: true } } : {}
  );
  const game = new Game(canvas, yandex);
  // Только для разработки (npm run dev), в сборку не попадает:
  // ?seed=42 — одна и та же трасса при каждом старте; ?assist=1 — полная помощь новичку;
  // ?tod=200 — время суток со сдвигом (только вид); ?start=100 — забег начинается со 100-й секунды; ?skin=ginger — окраска кота;
  // window.__omrGame — доступ из консоли.
  // В игре для игроков seed из адреса не работает, чтобы нельзя было выучить трассу для рекорда.
  if (import.meta.env?.DEV) {
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    if (seedParam !== null && Number.isFinite(Number(seedParam))) game.runSeed = Number(seedParam);
    // ?assist=0..1 — принудительная помощь новичку (1 — самые широкие проходы), чтобы проверить без смены рекорда.
    const assistParam = new URLSearchParams(window.location.search).get('assist');
    if (assistParam !== null && Number.isFinite(Number(assistParam))) game.assistOverride = Number(assistParam);
    // ?tod=200 — время суток начинается с 200-й секунды цикла (ночь), чтобы посмотреть этап, не играя 3 минуты.
    const todParam = new URLSearchParams(window.location.search).get('tod');
    if (todParam !== null && Number.isFinite(Number(todParam))) game.todOffset = Number(todParam);
    // ?start=100 — забег начинается со 100-й секунды: сразу высокая скорость и качающееся кашпо (от 90 с).
    const startParam = new URLSearchParams(window.location.search).get('start');
    if (startParam !== null && Number.isFinite(Number(startParam))) game.devStartTime = Math.max(0, Number(startParam));
    // ?skin=ginger — кот в окраске скина (SkinArt.js: classic, ginger, tuxedo, calico, siamese, honey, snow, ribbon).
    const skinParam = new URLSearchParams(window.location.search).get('skin');
    if (skinParam) game.renderer?.setSkin?.(skinParam);
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

    // Громкость: «−» тише, «+» (или «=») громче, шагами по 10%.
    const quieter = e.code === 'Minus' || e.code === 'NumpadSubtract';
    const louder = e.code === 'Equal' || e.code === 'NumpadAdd';
    if (quieter || louder) {
      game.changeVolume(louder ? 1 : -1);
      if (game.state === 'START') game.render();
      return;
    }

    if (e.repeat) return;

    // Пауза: P или Esc ставят и снимают её во время забега.
    if (e.code === 'KeyP' || e.code === 'Escape') {
      // Esc сначала закрывает окно магазина или таблицы лидеров, если оно открыто.
      if (game.shopWindow) game.closeShop();
      else if (game.leaderboard) game.closeLeaderboard();
      else game.togglePause();
      return;
    }

    if (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') {
      if (e.code === 'Space') e.preventDefault();
      // На паузе пробел и Enter снимают паузу, а R забег не перезапускает.
      if (game.userPaused) {
        if (e.code !== 'KeyR') game.resume();
        return;
      }
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
    // SDK готов: подтягиваем облачное сохранение, узнаём, можно ли предложить ярлык.
    game.onPlatformReady();
  });
});
