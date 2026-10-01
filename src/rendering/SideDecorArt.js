import { CONFIG } from '../config.js';
import { TREE_BASE_X } from './ArtPack.js';
import { hedgeOuterReach } from './HedgeArt.js';

// Боковой декор на газоне за изгородью, как на референсе: деревья, кусты, камни,
// заборчики и трава — картинки из assets/art-pack (trees/, props/). Каждый предмет
// задаётся номером своего места в мире, стоит на земле и растёт по мере приближения.
// Декор рисуется ПОСЛЕ изгороди и обрезается по дорожке. Всё стоит на одной земле за
// изгородью: у мелочи (кусты, камни, заборчики, трава) ближний к дороге край, у дерева
// ствол начинается за внешним краем изгороди (крона может нависать над ней, но ствол на
// кусте не стоит и дерево не «висит в воздухе»). Порядок рисования один для всех:
// по линии земли (y), дальние первыми, ближние поверх. Что ближе к камере (ниже на
// экране), то и перекрывает.

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
    this.order = []; // индексы предметов в порядке рисования (дальние первыми)
  }

  cfg() {
    return CONFIG.VISUAL.SIDE_DECOR || {};
  }

  // Внешний край изгороди (вместе с самыми широкими клочками) на глубине p.
  hedgeOuter(p, side) {
    const edge = side < 0 ? p.roadLeft : p.roadRight;
    return edge + side * hedgeOuterReach() * p.scale;
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
    art.clipOutsideRoad();
    // Порядок рисования — по линии земли (y): дальние первыми, ближние поверх. Случайный
    // сдвиг предмета по y меняет порядок слотов, поэтому сортируем по y.
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < items.length; i += STRIDE) order.push(i);
    this.sortByGround(order, 0, order.length);
    for (let n = 0; n < order.length; n += 1) {
      const i = order[n];
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

  // Прозрачность предмета у горизонта: rows — сколько строк экрана он ниже горизонта.
  fadeAlpha(rows, fadeRows) {
    const fade = Math.max(0, Math.min(1, rows / fadeRows));
    return fade * fade * (3 - 2 * fade);
  }

  // Сортировка части order [from, to) по y предмета: вставками (почти отсортировано, без выделений).
  sortByGround(order, from, to) {
    const items = this.items;
    for (let a = from + 1; a < to; a += 1) {
      const current = order[a];
      const y = items[current + 3];
      let b = a - 1;
      while (b >= from && items[order[b] + 3] > y) {
        order[b + 1] = order[b];
        b -= 1;
      }
      order[b + 1] = current;
    }
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

  // Настоящая перспектива: и размер предмета, и его отступ от дороги растут вместе с
  // шириной дорожки на этой глубине (как изгородь и ящики). Поэтому предмет летит от
  // центра по прямой, а не «растёт на месте». Предмет задан номером места (k, сторона)
  // и отступом от изгороди в ширинах дорожки; от кадра и соседей ничего не зависит.
  // У горизонта предметы проявляются плавно (FADE_ROWS строк).
  collect(progress) {
    const art = this.art;
    const cfg = this.cfg();
    const period = cfg.PERIOD ?? 70;
    const fadeRows = cfg.FADE_ROWS ?? 70;
    const treeH = CONFIG.VISUAL.ART_PACK?.TREE_HEIGHT ?? 1.45;
    const catH = art.catH();
    const horizon = art.horizonY();
    const items = this.items;
    items.length = 0;
    const nearWorld = art.screenToWorldY(art.height + 120 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    for (let guard = 0; guard < 400; guard += 1, k -= 1) {
      // Самый близкий из возможных предметов слота (с наибольшим сдвигом): если и он ещё в дымке
      // у горизонта, то все предметы слота и дальних слотов тоже, цикл можно кончать.
      const p = art.roadAt(k * period + progress + period * 0.4);
      if (p.drawY - horizon < 2) break;
      if (this.fadeAlpha(p.drawY - horizon, fadeRows) < 0.02) break;
      for (let side = -1; side <= 1; side += 2) {
        const kind = this.slotKind(k, side);
        if (kind < 0) continue;
        const seed = k * 13.1 + side * 5.7;
        const tree = kind === TREE;
        const variant = 0.88 + hash(seed + 9) * 0.24;
        const names = tree ? TREE_SPRITES : PROP_SPRITES[KINDS[kind]].names;
        const name = Math.floor(hash(seed + 7) * names.length) % names.length;
        const flip = hash(seed + 8) < 0.5 ? 1 : 0;
        // Случайный сдвиг предмета по глубине задан в МИРЕ (px дороги), а не на экране: тогда
        // предмет стоит на мировой линии k * period + сдвиг + progress и едет вместе с дорогой с
        // той же скоростью, что и все остальные. Порядок «дальний — ближний» между предметами
        // поэтому никогда не меняется: дерево не может обогнать камень. Сдвиг меньше шага слота
        // (0.4 < 1), так что порядок слотов тоже сохраняется. Размер, отступ и y считаются по
        // дороге на этой глубине (q).
        const q = art.roadAt(k * period + progress + hash(seed + 3) * period * 0.4);
        const y = q.drawY;
        const alpha = this.fadeAlpha(y - horizon, fadeRows);
        if (alpha < 0.02) continue;
        const s = q.scale * catH;
        const size = tree ? s * treeH * variant : s * PROP_SPRITES[KINDS[kind]].width * variant;
        // Отступ от внешнего края изгороди (в ширинах дорожки + зазор HEDGE_GAP).
        // Мелочь стоит центром, поэтому её ближний край = outer + gap, центр дальше на size / 2.
        // Дерево: ствол отступает от изгороди на зазор и пятую часть ширины кроны, поэтому
        // стоит на газоне, а крона слегка нависает над изгородью.
        const outer = this.hedgeOuter(q, side);
        const gap = (cfg.HEDGE_GAP ?? 10) * q.scale;
        let x;
        if (tree) {
          const crown = size / art.artPack.aspect(names[name]);
          x = outer + side * (gap + crown * 0.2 + 1.3 * hash(seed + 2) ** 1.4 * q.roadWidth);
        } else {
          x = outer + side * (size / 2 + gap + 0.8 * hash(seed + 2) * q.roadWidth);
        }
        if (x < -size || x > art.width + size) continue;
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
