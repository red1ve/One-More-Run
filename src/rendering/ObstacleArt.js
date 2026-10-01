import { CONFIG } from '../config.js';

// Препятствия как на референсе: деревянные ящики-кашпо с пышной зеленью и
// цветами и терракотовые садовые ворота с цветком. Рисуются кодом на любую
// ширину «твёрдого» участка ряда. Геометрия столкновений не меняется: рисунок
// стоит ровно на ширине участка, а его низ — на линии земли ряда.

// Палитра из docs/visual-bible.md §6 (2026-09).
const INK = '#4A3428'; // InkBrown
const WOOD = '#BF7A45'; // PlanterWood
const WOOD_LIGHT = '#D39048'; // WoodLight
const WOOD_SHADE = '#9A5F36'; // WoodShade
const LEAF = '#76A544'; // HedgeSage
const LEAF_SHADE = '#43682F'; // HedgeShade
const LEAF_LIGHT = '#9CC456'; // HedgeLeafLight
const PETAL = '#FBF8EA'; // CloudWhite
const PETAL_PINK = '#F4B3A2'; // BlossomPink
const POLLEN = '#E8B84A'; // CoinAmber
const GATE = '#D8724A'; // GatePaint
const GATE_LIGHT = '#DF8E69'; // GatePaintLight
const GATE_SHADE = '#C36845'; // GatePaintShade

function hash(n) {
  const x = Math.sin(n * 57.3 + 19.1) * 43758.5453;
  return x - Math.floor(x);
}

export function obstacleLook(family) {
  return family === 'FLOWER_GATE' ? 'gate' : 'planter';
}

const PLANTERS = ['planter-01', 'planter-02', 'planter-03', 'planter-04'];
const GATES = ['gate-01', 'gate-02', 'gate-03'];
const BUSHES = ['bush-01', 'bush-02', 'bush-03', 'bush-04'];

export class ObstacleArt {
  constructor(ctx, pack = null) {
    this.ctx = ctx;
    this.pack = pack; // нарисованные ящики и ворота (ArtPack), если загрузились
  }

  packFor(look) {
    const pack = this.pack;
    // Если картинки не загрузились — рисуем кодом (drawPlanter/drawGate ниже),
    // чтобы препятствие никогда не стало невидимым.
    if (!pack) return null;
    return pack.hasAll(look === 'gate' ? GATES : PLANTERS) && pack.hasAll(BUSHES) ? pack : null;
  }

  // Узкий участок (меньше ящика): куст ровно по ширине препятствия (+2 px с каждой стороны):
  // видимое = настоящее. У края дорожки куст не выходит за край: он не наезжает на бордюр
  // и изгородь. Столкновение то же.
  // Узкий куст чуть вытягивается вверх (не выше ящика и не больше чем в 1,5 раза),
  // чтобы читался кустом, а не комочком.
  drawPackBush(pack, x0, x1, groundY, tallH, roadLeft, roadRight, seed) {
    const name = BUSHES[Math.floor(hash(seed + 3) * BUSHES.length) % BUSHES.length];
    const flip = hash(seed + 4) < 0.5;
    let left = x0 - 2;
    let right = x1 + 2;
    if (Number.isFinite(roadLeft)) left = Math.max(left, roadLeft);
    if (Number.isFinite(roadRight)) right = Math.min(right, roadRight);
    const size = right - left;
    if (size < 1) return;
    const natural = size * pack.aspect(name) * 0.92;
    const h = Math.max(natural, Math.min(natural * 1.5, tallH));
    if (h - natural < 0.5) {
      pack.draw(this.ctx, name, left, groundY - natural, size, flip);
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(left, groundY);
    ctx.scale(1, h / natural);
    pack.draw(ctx, name, 0, -natural, size, flip);
    ctx.restore();
  }

  // Участок шириной w делим на n одинаковых мест (несколько ящиков/ворот рядом).
  // В каждое место ставим картинку, чьи пропорции ближе всего к месту, и чуть
  // подтягиваем по высоте (не больше чем на ±15%).
  // Ширина картинки = ширина места: видимое препятствие = настоящее.
  drawPackSpan(pack, names, x0, x1, groundY, targetH, maxH, seed) {
    const w = x1 - x0;
    const n = Math.max(1, Math.round(w / (targetH * 1.2)));
    const tileW = w / n;
    const want = tileW / targetH;
    for (let i = 0; i < n; i += 1) {
      const k = seed + i * 7.9;
      // Лучшие по пропорциям картинки, среди близких — случайная (но постоянная).
      let best = Infinity;
      for (const name of names) best = Math.min(best, Math.abs(Math.log(pack.aspect(name) * want)));
      let count = 0;
      for (const name of names) if (Math.abs(Math.log(pack.aspect(name) * want)) <= best + 0.12) count += 1;
      let pick = Math.floor(hash(k) * count) % count;
      let name = names[0];
      for (const candidate of names) {
        if (Math.abs(Math.log(pack.aspect(candidate) * want)) > best + 0.12) continue;
        if (pick === 0) { name = candidate; break; }
        pick -= 1;
      }
      const natural = tileW * pack.aspect(name);
      // Тянем к нужной высоте не больше чем на ±15% от родных пропорций картинки:
      // узкий участок — небольшой ящик, а не вытянутый столбик.
      const h = Math.min(maxH, natural * Math.max(0.87, Math.min(1.15, targetH / natural)));
      const x = x0 + tileW * i;
      const flip = hash(k + 1) < 0.5;
      const ctx = this.ctx;
      if (Math.abs(h - natural) < 0.5) {
        pack.draw(ctx, name, x, groundY - h, tileW, flip);
      } else {
        // Лёгкое растяжение по высоте: рисуем в масштабе и сжимаем/тянем по Y.
        ctx.save();
        ctx.translate(x, groundY);
        ctx.scale(1, h / natural);
        pack.draw(ctx, name, 0, -natural, tileW, flip);
        ctx.restore();
      }
    }
  }

  cfg() {
    return CONFIG.VISUAL.GARDEN_OBSTACLES || {};
  }

  // Полная высота рисунка (для отсечения у горизонта и сортировки).
  height(look, catH, scale) {
    const c = this.cfg();
    return look === 'gate'
      ? catH * (c.GATE_NEAR_CAT ?? 0.64) * scale * 1.1
      : catH * (c.PLANTER_NEAR_CAT ?? 0.36) * 1.9 * scale;
  }

  drawSpan(look, x0, x1, groundY, catH, scale, rawSeed, roadLeft, roadRight) {
    // Стены уже EDGE_WALL_MIN трасса не создаёт (Track.edgeWallsOk), так что всё, что уже
    // 3 px, — это погрешность округления у края дорожки.
    if (x1 - x0 < 3) return;
    const seed = Number.isFinite(rawSeed) ? rawSeed : 1;
    // save/restore: цвета, толщина линий и прозрачность не «утекают» дальше.
    this.ctx.save();
    // Слишком узкий для створки участок ворот выглядел бы как красные палки:
    // такой участок рисуем узким кашпо.
    const gateH = catH * (this.cfg().GATE_NEAR_CAT ?? 0.64) * scale;
    if (look === 'gate' && x1 - x0 < gateH * (this.cfg().GATE_MIN_WIDTH ?? 0.9)) look = 'planter';
    const pack = this.packFor(look);
    if (pack && look === 'gate') {
      this.drawPackSpan(pack, GATES, x0, x1, groundY, gateH, this.height('gate', catH, scale), seed);
    } else if (pack && x1 - x0 < catH * (this.cfg().PLANTER_NEAR_CAT ?? 0.36) * scale * (this.cfg().BUSH_MAX_WIDTH ?? 0.9)) {
      this.drawPackBush(pack, x0, x1, groundY, catH * (this.cfg().PLANTER_NEAR_CAT ?? 0.36) * scale * 1.1,
        roadLeft, roadRight, seed);
    } else if (pack) {
      const H = catH * (this.cfg().PLANTER_NEAR_CAT ?? 0.36) * scale;
      // Ящик на картинке — нижняя половина, над ним зелень: вся картинка ≈ 1.75 ящика.
      this.drawPackSpan(pack, PLANTERS, x0, x1, groundY, H * 1.75, this.height('planter', catH, scale), seed);
    } else if (look === 'gate') this.drawGate(x0, x1, groundY, catH * (this.cfg().GATE_NEAR_CAT ?? 0.64) * scale, seed);
    else this.drawPlanter(x0, x1, groundY, catH * (this.cfg().PLANTER_NEAR_CAT ?? 0.36) * scale, seed);
    this.ctx.restore();
  }

  line() {
    const ctx = this.ctx;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
  }

  // Ящик: зелень позади кромки, передняя доска, угловые столбики, швы досок.
  drawPlanter(x0, x1, g, H, seed) {
    const ctx = this.ctx;
    const w = x1 - x0;
    const top = g - H;
    const rim = H * 0.16;
    const post = Math.min(w * 0.25, H * 0.16);

    this.drawGreenery(x0 + post * 0.3, x1 - post * 0.3, top + rim * 0.4, H, seed);

    this.line();
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.rect(x0, top, w, H);
    ctx.fill();
    ctx.stroke();
    // Швы между досками.
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (const k of [0.45, 0.72]) {
      ctx.moveTo(x0 + post, top + H * k);
      ctx.lineTo(x1 - post, top + H * k);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Светлая верхняя кромка.
    ctx.fillStyle = WOOD_LIGHT;
    ctx.beginPath();
    ctx.rect(x0 - 1, top - rim * 0.35, w + 2, rim);
    ctx.fill();
    ctx.stroke();
    // Угловые столбики: светлая левая сторона, тень справа (свет сверху-слева).
    for (const px of [x0, x1 - post]) {
      ctx.fillStyle = WOOD;
      ctx.beginPath();
      ctx.rect(px, top - rim * 0.35, post, H + rim * 0.35);
      ctx.fill();
      ctx.fillStyle = WOOD_SHADE;
      ctx.fillRect(px + post * 0.62, top - rim * 0.35 + 1, post * 0.38 - 1, H + rim * 0.35 - 2);
      ctx.stroke();
    }
  }

  // Пышная зелень в ящике: задний ряд повыше, передний пониже, клочки в три тона
  // (тень снизу-справа, основной, блик сверху-слева) и редкие цветы.
  drawGreenery(x0, x1, baseY, H, seed) {
    const ctx = this.ctx;
    const w = x1 - x0;
    // У узкого ящика и шапка узкая, иначе он похож на деревце.
    const r = Math.min(H * 0.44, Math.max(2, w * 0.45));
    const count = Math.max(1, Math.ceil(w / (r * 1.05)));
    const step = w / count;
    const clumps = [];
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i <= count - row; i += 1) {
        const k = seed + i * 3.7 + row * 17.3;
        const cx = x0 + step * (i + row * 0.5) + (hash(k) - 0.5) * step * 0.3;
        const lift = row === 0 ? 0.62 : 0.2;
        const cy = baseY - r * (lift + hash(k + 1) * 0.25);
        // У узкого ящика клочок не шире самого ящика (+3 px с каждой стороны).
        const rr = Math.min(
          r * (row === 0 ? 0.82 : 0.9) * (0.88 + hash(k + 2) * 0.24),
          (x1 - x0) / 2 + 3
        );
        // Листва не свисает в проход больше чем на 3 px: видимый проход = настоящий.
        const lo = x0 + rr - 3;
        const hi = x1 - rr + 3;
        const x = lo <= hi ? Math.min(hi, Math.max(lo, cx)) : (x0 + x1) / 2;
        clumps.push(x, cy, rr);
      }
    }
    const pass = (color, dx, dy, k) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < clumps.length; i += 3) {
        const rr = clumps[i + 2] * k;
        const cx = clumps[i] + dx * clumps[i + 2];
        const cy = clumps[i + 1] + dy * clumps[i + 2];
        ctx.moveTo(cx + rr, cy);
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    pass(LEAF_SHADE, 0.08, 0.1, 1);
    pass(LEAF, -0.04, -0.06, 0.94);
    pass(LEAF_LIGHT, -0.3, -0.36, 0.34);
    if (H < 14) return;
    for (let i = 0; i < clumps.length; i += 3) {
      if (hash(seed + i * 5.3) > (this.cfg().FLOWER_CHANCE ?? 0.45)) continue;
      this.flower(clumps[i] + clumps[i + 2] * 0.1, clumps[i + 1] - clumps[i + 2] * 0.2,
        r * 0.4, hash(seed + i * 6.6) < 0.35);
    }
  }

  flower(x, y, size, pink) {
    const ctx = this.ctx;
    ctx.fillStyle = pink ? PETAL_PINK : PETAL;
    ctx.beginPath();
    for (let n = 0; n < 5; n += 1) {
      const a = (n / 5) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * size * 0.55;
      const py = y + Math.sin(a) * size * 0.55;
      ctx.moveTo(px + size * 0.42, py);
      ctx.arc(px, py, size * 0.42, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = POLLEN;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ворота: столбики с круглыми шапками по краям, между ними створки
  // с арочным верхом, вертикальные доски и цветок-веточка в центре.
  drawGate(x0, x1, g, H, seed) {
    const ctx = this.ctx;
    const w = x1 - x0;
    const postW = Math.min(w * 0.5, H * 0.16);
    const inner0 = x0 + postW;
    const inner1 = x1 - postW;
    const innerW = inner1 - inner0;
    if (innerW > 4) {
      const panels = Math.max(1, Math.round(innerW / (H * 1.1)));
      const pw = innerW / panels;
      for (let i = 0; i < panels; i += 1) {
        this.drawGatePanel(inner0 + pw * i, inner0 + pw * (i + 1), g, H, seed + i);
      }
    }
    this.drawGatePost(x0, postW, g, H);
    if (w > postW * 1.5) this.drawGatePost(x1 - postW, postW, g, H);
  }

  drawGatePanel(a, b, g, H, seed) {
    const ctx = this.ctx;
    const w = b - a;
    const shoulder = g - H * 0.8;
    const crown = g - H * 0.96;
    const bottom = g - H * 0.06;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(a, bottom);
      ctx.lineTo(a, shoulder);
      ctx.quadraticCurveTo((a + b) / 2, crown - (crown - shoulder) * 0.9, b, shoulder);
      ctx.lineTo(b, bottom);
      ctx.closePath();
    };
    this.line();
    ctx.fillStyle = GATE;
    outline();
    ctx.fill();
    // Светлая полоса вдоль арочного верха и тёмная нижняя перекладина.
    ctx.save();
    outline();
    ctx.clip();
    ctx.fillStyle = GATE_LIGHT;
    ctx.beginPath();
    ctx.moveTo(a, shoulder + H * 0.1);
    ctx.quadraticCurveTo((a + b) / 2, crown - (crown - shoulder) * 0.9 + H * 0.1, b, shoulder + H * 0.1);
    ctx.lineTo(b, crown - H);
    ctx.lineTo(a, crown - H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GATE_SHADE;
    ctx.fillRect(a, bottom - H * 0.12, w, H * 0.12);
    // Вертикальные доски.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.35;
    const boards = Math.max(2, Math.round(w / Math.max(6, H * 0.2)));
    ctx.beginPath();
    for (let i = 1; i < boards; i += 1) {
      const x = a + (w * i) / boards;
      ctx.moveTo(x, crown - H);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    this.line();
    outline();
    ctx.stroke();
    if (w > 16 && H > 18) this.drawSprig((a + b) / 2, g - H * 0.58, H * 0.2);
  }

  // Веточка на створке: два листика и кремовый бутон, как на референсе.
  drawSprig(x, y, size) {
    const ctx = this.ctx;
    ctx.fillStyle = LEAF;
    ctx.beginPath();
    ctx.ellipse(x - size * 0.42, y + size * 0.3, size * 0.42, size * 0.22, -0.5, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.42, y + size * 0.3, size * 0.42, size * 0.22, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PETAL;
    ctx.beginPath();
    ctx.ellipse(x, y - size * 0.1, size * 0.28, size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PETAL_PINK;
    ctx.beginPath();
    ctx.ellipse(x, y - size * 0.18, size * 0.14, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGatePost(x, w, g, H) {
    const ctx = this.ctx;
    const top = g - H * 1.02;
    this.line();
    ctx.fillStyle = GATE_SHADE;
    ctx.beginPath();
    ctx.rect(x, top, w, g - top);
    ctx.fill();
    ctx.fillStyle = GATE;
    ctx.fillRect(x + 1, top + 1, w * 0.55, g - top - 2);
    ctx.beginPath();
    ctx.rect(x, top, w, g - top);
    ctx.stroke();
    // Круглая шапка столбика.
    ctx.fillStyle = GATE_LIGHT;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, top, w * 0.62, w * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
