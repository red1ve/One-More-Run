// Иконка и обложка для карточки игры, собранные из собственных картинок проекта (по docs/visual-bible.md §14):
// кот Loaf — готовый вектор assets/characters/loaf-sit.svg (новый кот «в том же духе» запрещён), изгородь и небо —
// из assets/art-pack, цвета — из палитры. Это не скриншот игры. Запускается в странице dev-игры вместе с server.mjs:
//   const art = await import('http://127.0.0.1:3999/art.js?' + Date.now());
//   await art.icon();  await art.cover('ru');  await art.cover('en');
const SAVE = 'http://127.0.0.1:3999/save?name=';
const INK = '#4A3326';
const SAND = '#F7DCA0';
const SAGE = '#76A544';
const CREAM = '#F3E4C7';
const SAFE = '#A8C98B';
const RISK = '#E0A36A';
const SHADOW = '#D9BE86';

const load = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`не загрузилась картинка ${src}`));
  image.src = src;
});
const ART = '/assets/art-pack/';

async function saveCanvas(canvas, name) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const res = await fetch(SAVE + name, { method: 'POST', body: blob });
  return `${name} ${await res.text()} bytes`;
}

// Надпись по центру точки (cx, cy) по реальной высоте букв: у разных шрифтов базовая линия лежит по-разному, и
// обычный fillText(…, y + const) «уезжает» вверх или вниз.
function fillCentered(x, text, cx, cy) {
  const m = x.measureText(text);
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillText(text, cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

// Название на плашке сверху. Русский — округлым шрифтом игры (M PLUS Rounded 1c, он подключается в игре под именем
// «OMR Cyrillic»: в Fredoka русских букв нет), английский — Fredoka. Страница должна быть открыта с ?lang= этого языка.
const TITLES = { ru: 'ЕЩЁ ЗАБЕГ', en: 'ONE MORE RUN' };
const titleFont = (lang, size) => (lang === 'ru' ? `700 ${size}px "OMR Cyrillic", Fredoka, sans-serif` : `700 ${size}px Fredoka, sans-serif`);
async function drawTitle(x, lang, width) {
  const title = TITLES[lang];
  await document.fonts.load(titleFont(lang, 60), title);
  let size = 64;
  x.font = titleFont(lang, size);
  while (x.measureText(title).width > 420 && size > 30) { size -= 2; x.font = titleFont(lang, size); }
  const tw = x.measureText(title).width + 64;
  const top = 22;
  const height = 86;
  pill(x, width / 2 - tw / 2, top, tw, height, CREAM);
  x.fillStyle = INK;
  fillCentered(x, title, width / 2, top + height / 2);
}

function pill(x, left, top, width, height, fill) {
  x.fillStyle = SHADOW;
  x.beginPath(); x.roundRect(left + 3, top + 4, width, height, height / 2); x.fill();
  x.fillStyle = fill;
  x.beginPath(); x.roundRect(left, top, width, height, height / 2); x.fill();
  x.lineWidth = 3;
  x.strokeStyle = INK;
  x.stroke();
}

// Иконка 512x512: голова Loaf крупно (по правилу свода: складчатое правое ухо, рыжее пятно слева от кота-зрителя),
// фон — полоса изгороди и песок, без надписей.
export async function icon(name = 'icon-512.png') {
  const cat = await load('/assets/characters/loaf-sit.svg');
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = SAGE; x.fillRect(0, 0, 512, 512);
  x.fillStyle = SAND; x.fillRect(0, 392, 512, 120);
  x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(0, 392, 512, 6);
  // голова: часть кота x 8..292, y -6..278 (единицы SVG) на весь квадрат
  const crop = { x: 6, y: -4, size: 288 };
  const k = 512 / crop.size;
  x.imageSmoothingQuality = 'high';
  x.drawImage(cat, -crop.x * k, -crop.y * k, 300 * k, 360 * k);
  return saveCanvas(c, name);
}

// Обложка 800x470 (третий параметр false — без названия): стена изгороди с двумя проходами (широкий «+10» и узкий «+100», как в игре), посередине Loaf,
// сверху плашка с названием шрифтом игры.
export async function cover(lang, name = `cover-800x470-${lang}.png`, withTitle = true) {
  const [cat, sky, ...hedges] = await Promise.all([
    load('/assets/characters/loaf-sit.svg'),
    load(`${ART}sky/sky-strip.jpg`),
    ...[9, 13, 10, 11, 12, 14, 15, 16, 8].map((n) => load(`${ART}hedge/hedge-${String(n).padStart(2, '0')}.png`))
  ]);
  const W = 800;
  const H = 470;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  // небо и песок
  x.fillStyle = '#9CDCEC'; x.fillRect(0, 0, W, H);
  x.drawImage(sky, 0, 0, sky.width, sky.height * 0.62, 0, 0, W, 250);
  x.fillStyle = SAND; x.fillRect(0, 218, W, H - 218);
  x.fillStyle = 'rgba(0,0,0,0.05)';
  for (const [ex, ey, rx, ry] of [[90, 405, 70, 10], [330, 440, 90, 9], [640, 420, 80, 10], [520, 330, 60, 6], [150, 320, 60, 6]]) {
    x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); x.fill();
  }
  // стена изгороди: два ряда клочков, кроме проходов
  const gaps = [{ from: 80, to: 262, color: SAFE, plate: '+10' }, { from: 590, to: 690, color: RISK, plate: '+100' }];
  const BASE = 338;
  let index = 0;
  // стена: участки между проходами заполняются двумя рядами клочков, каждый участок обрезан по краям
  // (срез закрывает столбик прохода), так клочки не заходят в проходы
  const spans = [[-10, gaps[0].from - 6], [gaps[0].to + 4, gaps[1].from - 6], [gaps[1].to + 4, W + 10]];
  for (const [left, right] of spans) {
    x.save();
    x.beginPath();
    x.rect(left, 100, right - left, BASE - 100 + 4);
    x.clip();
    for (const [bottom, step, h, shift] of [[BASE - 18, 92, 182, -20], [BASE, 92, 186, 24]]) {
      for (let px = left + shift - 40; px < right + 40; px += step) {
        const img = hedges[index % hedges.length];
        index += 1;
        const w = (img.width / img.height) * h;
        x.drawImage(img, px, bottom - h, w, h);
      }
    }
    x.restore();
  }
  // столбики по краям проходов, планка цвета пути и плашка очков
  for (const g of gaps) {
    for (const edge of [g.from - 14, g.to - 2]) {
      x.fillStyle = '#BF7A45';
      x.beginPath(); x.roundRect(edge, BASE - 150, 16, 150 + 8, 6); x.fill();
      x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    }
    x.fillStyle = g.color;
    x.beginPath(); x.roundRect(g.from + 2, BASE - 6, g.to - g.from - 4, 14, 7); x.fill();
    x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    x.font = '700 30px Fredoka, sans-serif';
    const w = x.measureText(g.plate).width + 36;
    const cx = (g.from + g.to) / 2;
    pill(x, cx - w / 2, 366, w, 44, CREAM);
    x.fillStyle = INK;
    fillCentered(x, g.plate, cx, 366 + 22);
  }
  // кот: по центру, сидит перед стеной
  const k = 0.92;
  x.fillStyle = 'rgba(0,0,0,0.10)';
  x.beginPath(); x.ellipse(405, 452, 130, 14, 0, 0, Math.PI * 2); x.fill();
  x.drawImage(cat, 405 - 150 * k, 462 - 340 * k, 300 * k, 360 * k);
  // название (withTitle = false даёт макет без надписи: его показывают Gemini как образец композиции)
  if (!withTitle) return saveCanvas(c, name);
  await drawTitle(x, lang, W);
  return saveCanvas(c, name);
}

// ---- Варианты на фонах из Gemini (release/gemini/, отдаёт server.mjs): фон рисует Gemini, кота Loaf, название
// и плашки очков ставим мы, поэтому кот точно тот же. Картинка подгоняется обрезкой по центру, без растяжения.
const loadCors = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`не загрузилась картинка ${src}`));
  image.src = src;
});
const GEMINI = 'http://127.0.0.1:3999/gemini/';

// Фон на весь холст так, чтобы он закрывал его целиком (обрезка по центру).
function drawCover(x, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  x.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  return { scale, offsetX: (width - w) / 2, offsetY: (height - h) / 2 };
}

// Иконка 512x512: фон из Gemini и голова Loaf (тот же кадр, что у собранной иконки).
export async function iconFromGemini(src = 'icon-bg-raw.png', name = 'icon-512.png') {
  const [bg, cat] = await Promise.all([loadCors(GEMINI + src), load('/assets/characters/loaf-sit.svg')]);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  drawCover(x, bg, 512, 512);
  const crop = { x: 6, y: -4, size: 288 };
  const k = 512 / crop.size;
  x.drawImage(cat, -crop.x * k, -crop.y * k, 300 * k, 360 * k);
  return saveCanvas(c, name);
}

// Обложка 800x470: фон из Gemini (двое ворот), Loaf между ними, плашки «+10» и «+100», название шрифтом игры.
// catX — где стоит кот (между воротами, чтобы уши не касались столбиков); gates — где на картинке Gemini центры ворот и их нижний край (в её пикселях, ширина 1024, высота 572).
export async function coverFromGemini(lang, src = 'cover-bg-raw.webp', name = `cover-800x470-${lang}-gemini.png`, gates = [{ cx: 290, y: 368 }, { cx: 736, y: 368 }], catScale = 0.78, catX = 416) {
  const [bg, cat] = await Promise.all([loadCors(GEMINI + src), load('/assets/characters/loaf-sit.svg')]);
  const W = 800;
  const H = 470;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  const fit = drawCover(x, bg, W, H);
  // плашки очков под воротами
  const plates = ['+10', '+100'];
  gates.forEach((gate, i) => {
    const cx = gate.cx * fit.scale + fit.offsetX;
    const top = gate.y * fit.scale + fit.offsetY + 14;
    x.font = '700 30px Fredoka, sans-serif';
    const w = x.measureText(plates[i]).width + 36;
    pill(x, cx - w / 2, top, w, 44, CREAM);
    x.fillStyle = INK;
    fillCentered(x, plates[i], cx, top + 22);
  });
  // кот: по центру, сидит на песке перед стеной
  const bottom = H - 8;
  x.fillStyle = 'rgba(0,0,0,0.10)';
  x.beginPath(); x.ellipse(catX, bottom - 4, 125 * catScale / 0.8, 13, 0, 0, Math.PI * 2); x.fill();
  x.drawImage(cat, catX - 150 * catScale, bottom + 18 * catScale - 360 * catScale, 300 * catScale, 360 * catScale);
  // название
  await drawTitle(x, lang, W);
  return saveCanvas(c, name);
}
