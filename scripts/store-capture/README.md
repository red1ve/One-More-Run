# Съёмка материалов для магазина Яндекс Игр

Скриншоты и видео для карточки игры снимаются из настоящей игры: в браузере её ведёт простой «автопилот»
(смотрит только на препятствия, монеты и развилки), кадры берутся прямо с холста и ничего не дорисовывается.
Вертикальные кадры получаются в 1080×1920 (холст рисуется в двойном размере, а не растягивается), широкие
(1920×1080) собраны из трёх настоящих кадров рядом, видео 16:9 (1280×720) записывается средствами браузера.

Нужен браузер с H.264 в MediaRecorder (Chrome, Edge, встроенный браузер Claude). Playwright и ffmpeg не нужны.

## Как снять

1. `npm run dev` (порт 3000).
2. В другом окне терминала: `node scripts/store-capture/server.mjs`. Файлы будут падать в `release/store-out/`
   (эта папка не попадает в git).
3. Откройте `http://localhost:3000/?lang=ru` (или `?lang=en`) и в консоли браузера выполните:

```js
const cap = (await import('http://127.0.0.1:3999/cap.js?' + Date.now())).install(window.__omrGame);
const recipe = await import('http://127.0.0.1:3999/recipe.js?' + Date.now());
await recipe.phoneShots(cap, 'ru');   // 5 вертикальных + 2 широких кадра
await recipe.extraShots(cap, 'ru');   // старт, задания, магазин
recipe.recordVideo(cap, 'ru');        // видео 27 с, ровно 30 кадров/с; готово (1–2 минуты), когда window.__rec.done === true
```

4. Из закодированных кадров (файл `release/store-out/ru-video.omrbin`) соберите обычный MP4 с видео H.264 и тихой звуковой
   дорожкой AAC:
   `node scripts/store-capture/mux-mp4.mjs release/store-out/ru-video.omrbin release/video/ru-video-horizontal.mp4`,
   проверка: `node scripts/store-capture/mp4-info.mjs release/video/ru-video-horizontal.mp4`
   (до 28 с, 1280×720, `avc1`, `30.00 fps`, `audio: true`, `fragmented: false`).
   Видео кодируется кадр за кадром (WebCodecs), а не записывается в реальном времени: запись в реальном времени давала
   24–27 кадров/с с провалами и файл «фрагментный MP4» с неизвестной длительностью, который консоль Яндекса отклонила.
5. Скриншоты скопируйте в `docs/store/screenshots/`, видео оставьте в `release/video/` (в git не кладём: по 15 МБ).
6. `npm run store:check` проверит размеры и пропорции.

Страница, пока она скрыта (вкладка не на экране), не получает кадров `requestAnimationFrame`, поэтому съёмка
сама двигает игру шагами 1/60 с, как в проверках: результат повторяем при тех же зёрнах трассы.

## Иконка и обложки

Не снимаются, а собираются: фон рисует Gemini (без кота), а кота Loaf (готовый вектор), плашки и название ставит код,
потому что по `docs/visual-bible.md` §14 кот должен быть тем же, а скриншоты в роли обложки Яндекс запрещает.
Запросы для Gemini и порядок пересборки — в `docs/store/art-prompts.md`. Коротко, в консоли браузера на странице игры:

```js
const art = await import('http://127.0.0.1:3999/art.js?' + Date.now());
await art.iconFromGemini();            // фон release/gemini/icon-bg-raw.png -> иконка 512x512
await art.coverFromGemini('ru');       // фон release/gemini/cover-bg-raw.webp -> обложка 800x470 (и 'en')
await art.icon(); await art.cover('ru');   // запасной вариант без Gemini: фон из art-pack
```

Файлы падают в `release/store-out/`, оттуда их копируют в `docs/store/`.
