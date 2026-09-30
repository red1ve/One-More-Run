import { CONFIG } from '../config.js';
import { TREE_BASE_X } from './ArtPack.js';

// Боковой декор на газоне за изгородью, как на референсе: деревья, кусты, камни,
// заборчики и трава — картинки из assets/art-pack (trees/, props/). Каждый предмет
// задаётся номером своего места в мире, стоит на земле и растёт по мере приближения.
// Декор рисуется до изгороди, поэтому изгородь всегда перед ним.

const SHADOW = 'rgba(74, 52, 40, 0.16)'; // тень на траве: InkBrown 16%

const TREE_SPRITES = ['tree-01', 'tree-02', 'tree-03', 'tree-04'];
// Мелочи газона (art-pack/props): вид предмета → картинки и ширина в долях роста кота.
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
const STRIDE = 8;

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
    const pack = art.artPack;
    // Пока картинки грузятся (доли секунды на старте), газон без предметов.
    if (!pack?.hasAll(TREE_SPRITES) || !pack.hasAll(ALL_PROP_SPRITES)) return;
    ctx.save();
    // Собирали от кота к горизонту; рисуем наоборот, чтобы ближнее было поверх.
    for (let i = items.length - STRIDE; i >= 0; i -= STRIDE) {
      const kind = KINDS[items[i + 1]];
      const x = items[i + 2];
      const y = items[i + 3];
      const size = items[i + 4];
      const name = items[i + 5];
      const flip = items[i + 6] === 1;
      ctx.globalAlpha = items[i + 7];
      if (kind === 'tree') this.drawPackTree(ctx, pack, x, y, size, name, flip);
      else this.drawPackProp(ctx, pack, x, y, size, PROP_SPRITES[kind].names[name], flip, kind);
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
        // ключ места, вид, x, y, размер, картинка, отражение, прозрачность
        items.push(k * 2 + (side < 0 ? 0 : 1), kind, x, y, size, name, flip, alpha);
      }
    }
  }

  groundShadow(ctx, x, y, rx) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.12, y, rx, rx * 0.26, 0, 0, Math.PI * 2);
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
}
