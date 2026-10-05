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

// Обложка 800x470: стена изгороди с двумя проходами (широкий «+10» и узкий «+100», как в игре), посередине Loaf,
// сверху плашка с названием шрифтом игры.
export async function cover(lang, name = `cover-800x470-${lang}.png`) {
  const [cat, sky, ...hedges] = await Promise.all([
    load('/assets/characters/loaf-sit.svg'),
    load(`${ART}sky/sky-strip.jpg`),
    ...[9, 13, 10, 11, 12, 14, 15, 16, 8].map((n) => load(`${ART}hedge/hedge-${String(n).padStart(2, '0')}.png`))
  ]);
  const title = { ru: 'ЕЩЁ ЗАБЕГ', en: 'ONE MORE RUN' }[lang];
  await document.fonts.load('700 60px Fredoka', title);
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
    x.fillStyle = INK; x.textAlign = 'center';
    x.fillText(g.plate, cx, 398);
  }
  // кот: по центру, сидит перед стеной
  const k = 0.92;
  x.fillStyle = 'rgba(0,0,0,0.10)';
  x.beginPath(); x.ellipse(405, 452, 130, 14, 0, 0, Math.PI * 2); x.fill();
  x.drawImage(cat, 405 - 150 * k, 462 - 340 * k, 300 * k, 360 * k);
  // название
  let size = 64;
  x.font = `700 ${size}px Fredoka, sans-serif`;
  while (x.measureText(title).width > 420 && size > 30) { size -= 2; x.font = `700 ${size}px Fredoka, sans-serif`; }
  const tw = x.measureText(title).width + 64;
  pill(x, W / 2 - tw / 2, 22, tw, 86, CREAM);
  x.fillStyle = INK; x.textAlign = 'center';
  x.fillText(title, W / 2, 22 + 58);
  return saveCanvas(c, name);
}
