// Рецепты съёмки материалов магазина: какие кадры, какие зёрна трассы, скины и время суток. Запускаются в
// странице dev-игры (npm run dev, адрес с ?lang=ru или ?lang=en) вместе с cap.js, см. README.md.
// Все кадры настоящие: игру ведёт автопилот, ничего не дорисовывается и не подделывается (кроме того, что
// монеты и рекорд в хранилище dev-браузера выставлены как у вернувшегося игрока).

// Тексты по бокам видео (игра идёт посередине).
export const VIDEO_TEXT = {
  en: { left: ['ONE MORE RUN'], right: ['Wider = safer', 'Narrower =', 'more points'] },
  ru: { left: ['ЕЩЁ ЗАБЕГ'], right: ['Шире — надёжнее', 'Уже — больше', 'очков'] }
};

// Состояние «игрок, который уже поиграл»: немного монет, есть рекорд, звук включён (тихо: без жеста звук всё равно не пойдёт).
export function prepare(cap) {
  const g = cap.g;
  g.audio.setMuted(false);
  g.audio.setVolume(0.5);
  g.storage.setCoinCounters(46, 18);
  g.coins = g.storage.getCoins();
  g.bestScore = 137;
  g.storage.set('bestScore', 137);
  cap.frames.length = 0;
}

// Пять вертикальных кадров 1080x1920 и два широких по три кадра. Возвращает список записанных файлов.
export async function phoneShots(cap, lang) {
  const g = cap.g;
  const log = [];
  prepare(cap);
  // 1. Развилка с подсказкой «шире — надёжнее, уже — больше очков».
  g.__risk = false;
  await cap.begin({ seed: 35, assist: 1, tod: 0, hint: true });
  if (cap.advance(40, cap.forkAhead(300, 520))) log.push(await cap.shoot(`${lang}-phone-1-fork.jpg`, true));
  // 2. Золотой час: кот выбирает узкий путь, растут серия и множитель.
  g.__risk = true;
  await cap.begin({ seed: 35, assist: 1, tod: 70, skin: 'ginger' });
  if (cap.advance(150, () => g.multiplier >= 1.5 && cap.floatNow())) log.push(await cap.shoot(`${lang}-phone-2-golden.jpg`, true));
  // 3. Ночь со светлячками.
  await cap.begin({ seed: 24, assist: 1, tod: 188, skin: 'ribbon' });
  cap.advance(14);
  log.push(await cap.shoot(`${lang}-phone-3-night.jpg`, true));
  // 4. Качающееся кашпо (появляется после 90-й секунды забега: старт со 100-й).
  g.__risk = false;
  await cap.begin({ seed: 100, assist: 1, tod: 0, start: 100, skin: 'honey' });
  cap.advance(60, cap.swayAhead(260, 600));
  log.push(await cap.shoot(`${lang}-phone-4-planter.jpg`, true));
  // 5. Вечер.
  g.__risk = true;
  await cap.begin({ seed: 2, assist: 1, tod: 126, skin: 'tuxedo' });
  cap.advance(16);
  log.push(await cap.shoot(`${lang}-phone-5-dusk.jpg`, true));
  // Широкие кадры 1920x1080: три настоящих кадра рядом (на широком экране видно их все).
  log.push(await cap.triptych(`${lang}-desktop-1.jpg`, [0, 1, 2]));
  log.push(await cap.triptych(`${lang}-desktop-2.jpg`, [3, 4, 1]));
  return log;
}

// Дополнительные кадры: стартовый экран, задания, магазин (это не геймплей, поэтому отдельно от основных).
export async function extraShots(cap, lang) {
  const g = cap.g;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = [];
  prepare(cap);
  cap.freeze();
  g.state = 'GAMEOVER';
  g.dailyRun = false;
  await g.renderer.setSkin('classic');
  g.openMenu();
  cap.freeze();
  log.push(await cap.shoot(`${lang}-extra-menu.jpg`));
  g.openQuests();
  await sleep(200);
  log.push(await cap.shoot(`${lang}-extra-quests.jpg`));
  g.closeQuests();
  g.openShop();
  await sleep(2500);
  log.push(await cap.shoot(`${lang}-extra-shop.jpg`));
  g.closeShop();
  return log;
}

// Видео 16:9, 27 с, ровно 30 кадров в секунду: 2,4 с стартовый экран, потом забег (зерно 93: монета и серия рисков).
// Кадры кодируются по одному, ждите 1–2 минуты и смотрите window.__rec.done. Результат — файл OMRV в release/store-out/,
// из него MP4 собирает mux-mp4.mjs.
export function recordVideo(cap, lang) {
  prepare(cap);
  const text = VIDEO_TEXT[lang];
  return cap.record({ name: `${lang}-video.omrbin`, seed: 93, tod: 112, skin: 'classic', risk: true, intro: 2.4, seconds: 27, left: text.left, right: text.right });
}
