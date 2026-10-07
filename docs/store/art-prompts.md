# Иконка и обложка: фон из Gemini, кот наш

Итоговые `icon-512.png` и `cover-800x470-ru/en.png` собраны так: **фон нарисовал Gemini**, а **кота Loaf, плашки «+10» и «+100»
и название** поставлены поверх нашим кодом (`scripts/store-capture/art.js`, функции `iconFromGemini` и `coverFromGemini`).
Так сделано потому, что Gemini не держит рисунок кота (при попытке нарисовать кота целиком он выдал реалистичного кота в
комнате с лампой), а по `docs/visual-bible.md` §14 кот в магазине должен быть строго тем же Loaf. Кот берётся из
`assets/characters/loaf-sit.svg`.

Исходные картинки Gemini лежат в `docs/store/source/` (`cover-bg-raw.webp` 1024×572, `icon-bg-raw.png` 1024×1024),
учёт происхождения есть в `assets/art-pack/SOURCES.md`. Запасные варианты, собранные только из картинок проекта (фон из
art-pack), делаются функциями `icon()` и `cover()` в том же файле.

Условия использования Gemini для коммерческих картинок проверяет владелец проекта. Яндекс разрешает заранее
сгенерированные ИИ материалы (требование 1.23), права на материалы должны быть у автора (3.5).

## Запрос для фона обложки (16:9, новый чат в Gemini, образец стиля: кадр из игры)

```
Create a landscape 16:9 game cover background illustration with no characters.

Scene: a sunny, calm garden. In the lower half there is a flat sand-colored path (#F7DCA0) with a few soft, slightly darker sand patches. Across the middle runs a long hedge wall (sage green #76A544) built from soft, rounded, leafy clumps, with a few small pink and white flowers. The wall has exactly two openings that go down to the path, each framed by two upright wooden posts (warm brown #BF7A45 with dark-brown outlines #4A3326). The left opening is wide and has a light-green sill (#A8C98B) lying across the bottom of the gap. The right opening is narrow and has an apricot-orange sill (#E0A36A). The sand path continues through both openings. Above the wall is a clear light-blue sky (#9CDCEC) with two soft white clouds. The top 25% of the image is mostly empty sky, to leave room for a title. The center-bottom area in front of the wall is empty plain sand path, because a character will be placed there later.

Art style: flat 2D cel-shaded game art, handmade and warm, simple rounded shapes, thick warm dark-brown outlines (#4A3326) on the posts and sills, soft painted texture only on the hedge, one flat soft shadow under objects, evenly lit sunny morning light. Cute but not kawaii, friendly, clean. Limited palette: sage green, sand, wood brown, light blue, cream, apricot.

Strictly avoid: any cat or other animal, people, characters, text, letters, numbers, watermark, logo, frame or border, 3D rendering, realistic lighting, photo-realism, gradients, neon colors, room interiors, furniture, lamps, books.
```

## Запрос для фона иконки (1:1)

```
Create a square 1:1 flat 2D background for a mobile game icon, with no characters.

The upper 75% of the image is a sage-green (#76A544) garden hedge made of soft, rounded, leafy clumps, painted flat in a cel-shaded look with thick warm dark-brown outlines (#4A3326) and a few small cream flowers. The lower 25% is a flat sand-colored (#F7DCA0) path band with a thin slightly darker line at its top edge. Calm, even sunny lighting. The center of the picture is left calm and uncluttered, because a character will be placed there later.

Art style: flat 2D cel-shaded game art, handmade and warm, simple rounded shapes, uniform thick outlines, limited palette of sage green, sand and cream. Cute but not kawaii, friendly, clean.

Strictly avoid: any cat or other animal, people, characters, text, letters, numbers, watermark, logo, frame or border, 3D rendering, realistic lighting, photo-realism, gradients, neon colors, room interiors, furniture.
```

## Как пересобрать

1. Сохранить фоны из Gemini в `release/gemini/` как `cover-bg-raw.webp` и `icon-bg-raw.png` (или взять из `docs/store/source/`).
2. `node scripts/store-capture/server.mjs`, открыть игру в браузере (`npm run dev`) и в консоли выполнить:

```js
const art = await import('http://127.0.0.1:3999/art.js?' + Date.now());
await art.iconFromGemini();            // icon-bg-raw.png -> icon-512.png
await art.coverFromGemini('ru');       // cover-bg-raw.webp -> cover-800x470-ru-gemini.png
await art.coverFromGemini('en');
```

3. Файлы появятся в `release/store-out/`; скопировать в `docs/store/` и выполнить `npm run store:check`.
   Положение ворот на фоне (`gates`) и кота (`catX`, `catScale`) подбираются параметрами `coverFromGemini`, если новый фон устроен иначе.
