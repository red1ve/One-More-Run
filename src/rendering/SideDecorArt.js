import { CONFIG } from '../config.js';
import { TREE_BASE_X } from './ArtPack.js';

// Боковой декор на газоне за изгородью, как на референсе: деревья, цветущие
// кусты, камни, деревянные заборчики и цветы на стебельках. Каждый предмет
// привязан к миру (слот по Y), стоит на земле и уменьшается по перспективе.
// Декор рисуется до изгороди, поэтому изгородь всегда перед ним.

// Палитра из docs/visual-bible.md §6 (2026-09).
const INK = '#4A3428'; // InkBrown
const WOOD = '#BF7A45'; // PlanterWood
const WOOD_LIGHT = '#D39048'; // WoodLight
const WOOD_SHADE = '#9A5F36'; // WoodShade
const LEAF = '#76A544'; // HedgeSage
const LEAF_SHADE = '#43682F'; // HedgeShade
const LEAF_LIGHT = '#9CC456'; // HedgeLeafLight
const BUSH = '#96B552'; // BushLeaf: цветущий куст светлее изгороди
const STONE = '#D2C3A8'; // StoneLight
const STONE_SHADE = '#B3A38A'; // StoneShade
const PETAL = '#FBF8EA'; // CloudWhite
const PETAL_PINK = '#F4B3A2'; // BlossomPink
const POLLEN = '#E8B84A'; // CoinAmber
const SHADOW = 'rgba(74, 52, 40, 0.16)'; // тень на траве: InkBrown 16%

const TREE_SPRITES = ['tree-01', 'tree-02', 'tree-03', 'tree-04'];
// Мелочи газона (art-pack/props): вид предмета → картинки и ширина в долях роста кота
// (подобрана под размеры кодовых предметов).
const PROP_SPRITES = {
  flowerBush: { names: ['bush-03', 'bush-04'], width: 0.72 },
  bush: { names: ['bush-01', 'bush-02'], width: 0.6 },
  rock: { names: ['rock-01', 'rock-02', 'rock-03'], width: 0.32 },
  fence: { names: ['fence-01', 'fence-02'], width: 0.66 },
  flowers: { names: ['grass-01'], width: 0.3 }
};
const ALL_PROP_SPRITES = Object.values(PROP_SPRITES).flatMap((p) => p.names);
// Мелочи на местах между группами деревьев (вид выбирается по номеру места).
const PROP_KINDS = ['flowerBush', 'bush', 'rock', 'fence', 'flowers', 'flowerBush', 'bush'];
// Вид предмета → номер (хранится в массиве items числом).
const KINDS = ['tree', 'flowerBush', 'bush', 'rock', 'fence', 'flowers'];
const TREE = 0;
// Сколько чисел на один предмет в this.items.
const STRIDE = 10;

function hash(n) {
  const x = Math.sin(n * 73.9 + 12.7) * 43758.5453;
  return x - Math.floor(x);
}

export class SideDecorArt {
  constructor(art) {
    this.art = art;
    this.items = [];
  }

  cfg() {
    return CONFIG.VISUAL.SIDE_DECOR || {};
  }

  hedgeOuter(p, side) {
    const h = CONFIG.VISUAL.HEDGE_WALL || {};
    const reach = (h.SHOULDER_NEAR ?? 8) + (h.CURB_NEAR ?? 12) + (h.WIDTH_NEAR ?? 74);
    const edge = side < 0 ? p.roadLeft : p.roadRight;
    return edge + side * reach * p.scale;
  }

  draw(camera) {
    const art = this.art;
    const ctx = art.ctx;
    this.collect(camera?.progress || 0);
    const items = this.items;
    const pack = CONFIG.VISUAL.ART_PACK?.TREES && art.artPack?.hasAll(TREE_SPRITES) ? art.artPack : null;
    const props = CONFIG.VISUAL.ART_PACK?.PROPS && art.artPack?.hasAll(ALL_PROP_SPRITES) ? art.artPack : null;
    ctx.save();
    // Собирали от кота к горизонту; рисуем наоборот, чтобы ближнее было поверх.
    for (let i = items.length - STRIDE; i >= 0; i -= STRIDE) {
      const kind = KINDS[items[i + 1]];
      const x = items[i + 2];
      const y = items[i + 3];
      const s = items[i + 4];
      const size = items[i + 5];
      const name = items[i + 6];
      const flip = items[i + 7] === 1;
      ctx.globalAlpha = items[i + 8];
      const seed = items[i + 9];
      if (kind === 'tree' && pack) this.drawPackTree(ctx, pack, x, y, size, name, flip);
      else if (kind === 'tree') this.drawTree(ctx, x, y, s, seed);
      else if (props) this.drawPackProp(ctx, props, x, y, size, PROP_SPRITES[kind].names[name], flip, kind);
      else if (kind === 'flowerBush') this.drawBush(ctx, x, y, s, seed, true);
      else if (kind === 'bush') this.drawBush(ctx, x, y, s, seed, false);
      else if (kind === 'rock') this.drawRock(ctx, x, y, s, seed);
      else if (kind === 'fence') this.drawFence(ctx, x, y, s, seed);
      else this.drawFlowers(ctx, x, y, s, seed);
    }
    ctx.restore();
  }

  // Что стоит на месте k стороны side — зависит ТОЛЬКО от номера места, не от соседей
  // и не от кадра: деревья группами по 1–2 через каждые TREES.EVERY мест, между ними
  // мелочи (часть мест пустая). Возвращает номер вида или −1 (пусто).
  slotKind(k, side) {
    const cfg = this.cfg();
    const trees = cfg.TREES || {};
    const every = trees.EVERY ?? 10;
    const offset = side < 0 ? (trees.LEFT_OFFSET ?? 0) : (trees.RIGHT_OFFSET ?? 5);
    const pos = ((k - offset) % every + every) % every;
    const group = Math.floor((k - offset - pos) / every);
    const [minGroup, maxGroup] = trees.GROUP ?? [1, 2];
    const groupSize = minGroup + Math.floor(hash(group * 7.7 + side * 3.3) * (maxGroup - minGroup + 1));
    if (pos < groupSize) return TREE;
    const seed = k * 13.1 + side * 5.7;
    if (hash(seed) > (cfg.CHANCE ?? 0.8)) return -1;
    return KINDS.indexOf(PROP_KINDS[Math.floor(hash(seed + 1) * PROP_KINDS.length) % PROP_KINDS.length]);
  }

  // Размер — по глубине: 1 у кота, к горизонту плавно к нулю (DEPTH_HALF — где
  // размер ≈ половина). Слишком мелкие на экране не рисуются, у порога — плавное
  // проявление. Размер только растёт по мере приближения, поэтому появившийся
  // предмет остаётся, пока не уйдёт за нижний край. Слоты вдали не пропускаются.
  collect(progress) {
    const art = this.art;
    const cfg = this.cfg();
    const period = cfg.PERIOD ?? 70;
    const half = cfg.DEPTH_HALF ?? 1.5;
    const minPx = cfg.MIN_PX ?? 8;
    const fadePx = cfg.FADE_PX ?? 8;
    const treeH = CONFIG.VISUAL.ART_PACK?.TREE_HEIGHT ?? 1.75;
    const catH = art.catH();
    const items = this.items;
    items.length = 0;
    const nearWorld = art.screenToWorldY(art.height + 120 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    for (let guard = 0; guard < 400; guard += 1, k -= 1) {
      const p = art.roadAt(k * period + progress);
      if (p.drawY < art.horizonY() + 1) break;
      const depth = (p.t * (1 + half)) / (p.t + half);
      const s = depth * catH;
      // Самый крупный предмет (дерево) уже мельче порога — дальше только мельче.
      if (s * treeH * 1.12 < minPx) break;
      for (let side = -1; side <= 1; side += 2) {
        const kind = this.slotKind(k, side);
        if (kind < 0) continue;
        const seed = k * 13.1 + side * 5.7;
        const tree = kind === TREE;
        const variant = 0.88 + hash(seed + 9) * 0.24;
        const size = tree ? s * treeH * variant : s * PROP_SPRITES[KINDS[kind]].width * variant;
        if (size < minPx) continue;
        const alpha = Math.min(1, (size - minPx) / fadePx);
        const names = tree ? TREE_SPRITES : PROP_SPRITES[KINDS[kind]].names;
        const name = Math.floor(hash(seed + 7) * names.length) % names.length;
        const flip = hash(seed + 8) < 0.5 ? 1 : 0;
        const outer = this.hedgeOuter(p, side);
        const room = Math.max(40, side < 0 ? outer : art.width - outer);
        const pad = (tree ? 34 : 14) * depth;
        const x = outer + side * (pad + hash(seed + 2) * room * 0.9);
        const y = p.drawY + hash(seed + 3) * period * 0.4 * depth;
        items.push(k * 2 + (side < 0 ? 0 : 1), kind, x, y, s, size, name, flip, alpha, seed);
      }
    }
  }

  groundShadow(ctx, x, y, rx) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.12, y, rx, rx * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Шар листвы из клочков: тёмный зубчатый контур, тень, основной тон, блики.
  leafMass(ctx, cx, cy, r, seed, body, count = 7) {
    const blobs = [];
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + hash(seed + i) * 0.6;
      const d = r * (0.5 + hash(seed + i * 2.3) * 0.2);
      blobs.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.46 + hash(seed + i * 3.1) * 0.14));
    }
    blobs.push(cx, cy, r * 0.62);
    const pass = (color, dx, dy, k) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < blobs.length; i += 3) {
        const rr = blobs[i + 2] * k;
        ctx.moveTo(blobs[i] + dx * r + rr, blobs[i + 1] + dy * r);
        ctx.arc(blobs[i] + dx * r, blobs[i + 1] + dy * r, rr, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    pass(LEAF_SHADE, 0, 0, 1.1);
    pass(body, -0.04, -0.05, 0.96);
    pass(LEAF_LIGHT, -0.16, -0.2, 0.4);
    return blobs;
  }

  flower(ctx, x, y, size, pink) {
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
    ctx.arc(x, y, size * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Дерево-картинка высотой h: ствол (baseX из anchors.json) стоит ровно в точке (x, y).
  drawPackTree(ctx, pack, x, y, h, nameIndex, flip) {
    const name = TREE_SPRITES[nameIndex];
    const w = h / pack.aspect(name);
    const baseX = flip ? 1 - TREE_BASE_X[name] : TREE_BASE_X[name];
    this.groundShadow(ctx, x, y, w * 0.3);
    pack.draw(ctx, name, x - w * baseX, y - h, w, flip);
  }

  // Предмет-картинка шириной w стоит низом на земле в точке (x, y).
  drawPackProp(ctx, pack, x, y, w, name, flip, kind) {
    const h = w * pack.aspect(name);
    if (kind !== 'flowers') this.groundShadow(ctx, x, y, w * 0.42);
    pack.draw(ctx, name, x - w / 2, y - h * 0.96, w, flip);
  }

  drawTree(ctx, x, y, s, seed) {
    const trunkH = s * 0.62;
    const trunkW = s * 0.13;
    const r = s * (0.62 + hash(seed + 9) * 0.18);
    this.groundShadow(ctx, x, y, r * 0.8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.fillStyle = WOOD_SHADE;
    ctx.beginPath();
    ctx.moveTo(x - trunkW * 0.7, y);
    ctx.lineTo(x - trunkW * 0.45, y - trunkH);
    ctx.lineTo(x - trunkW * 1.3, y - trunkH - r * 0.35);
    ctx.lineTo(x, y - trunkH - r * 0.1);
    ctx.lineTo(x + trunkW * 1.3, y - trunkH - r * 0.4);
    ctx.lineTo(x + trunkW * 0.45, y - trunkH);
    ctx.lineTo(x + trunkW * 0.7, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WOOD;
    ctx.fillRect(x - trunkW * 0.45, y - trunkH + 2, trunkW * 0.4, trunkH - 3);
    this.leafMass(ctx, x, y - trunkH - r * 0.55, r, seed, LEAF, 9);
  }

  drawBush(ctx, x, y, s, seed, flowering) {
    const r = s * (flowering ? 0.34 : 0.28) * (0.85 + hash(seed + 4) * 0.3);
    this.groundShadow(ctx, x, y, r * 1.05);
    const blobs = this.leafMass(ctx, x, y - r * 0.8, r, seed, flowering ? BUSH : LEAF, 7);
    if (!flowering || r < 5) return;
    for (let i = 0; i < blobs.length; i += 3) {
      if (hash(seed + i * 1.9) > 0.3) continue;
      this.flower(ctx, blobs[i], blobs[i + 1] - blobs[i + 2] * 0.2, r * 0.3, hash(seed + i * 2.9) < 0.25);
    }
  }

  drawRock(ctx, x, y, s, seed) {
    const w = s * (0.22 + hash(seed + 5) * 0.14);
    const h = w * 0.55;
    this.groundShadow(ctx, x, y, w * 0.6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.fillStyle = STONE_SHADE;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y);
    ctx.bezierCurveTo(x - w * 0.5, y - h * 1.1, x + w * 0.45, y - h * 1.25, x + w * 0.5, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = STONE;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, y - h * 0.2);
    ctx.bezierCurveTo(x - w * 0.4, y - h * 0.95, x + w * 0.2, y - h * 1.05, x + w * 0.22, y - h * 0.55);
    ctx.bezierCurveTo(x, y - h * 0.3, x - w * 0.2, y - h * 0.2, x - w * 0.42, y - h * 0.2);
    ctx.fill();
  }

  drawFence(ctx, x, y, s, seed) {
    const w = s * (0.5 + hash(seed + 6) * 0.2);
    const h = s * 0.38;
    const postW = Math.max(2, s * 0.07);
    const posts = 3;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.fillStyle = WOOD_LIGHT;
    for (const k of [0.3, 0.68]) {
      ctx.beginPath();
      ctx.rect(x - w / 2, y - h * k - h * 0.08, w, h * 0.14);
      ctx.fill();
      ctx.stroke();
    }
    for (let i = 0; i < posts; i += 1) {
      const px = x - w / 2 + (w - postW) * (i / (posts - 1));
      ctx.fillStyle = WOOD;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y - h * 0.9);
      ctx.lineTo(px + postW / 2, y - h);
      ctx.lineTo(px + postW, y - h * 0.9);
      ctx.lineTo(px + postW, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  drawFlowers(ctx, x, y, s, seed) {
    const size = s * 0.075;
    if (size < 2) return;
    ctx.strokeStyle = LEAF_SHADE;
    ctx.lineWidth = Math.max(1, size * 0.25);
    for (let i = 0; i < 3; i += 1) {
      const fx = x + (hash(seed + i) - 0.5) * s * 0.3;
      const fh = s * (0.12 + hash(seed + i * 2.1) * 0.08);
      ctx.beginPath();
      ctx.moveTo(fx, y);
      ctx.lineTo(fx, y - fh);
      ctx.stroke();
      this.flower(ctx, fx, y - fh, size, hash(seed + i * 3.3) < 0.4);
    }
  }
}
