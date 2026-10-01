import { CONFIG } from '../config.js';

// Живая изгородь вдоль дорожки, как на референсе: деревянный бордюр у песка,
// за ним изгородь из нарисованных клочков листвы (assets/art-pack/hedge/hedge-08..16).
// Бордюр, тёмная подложка и дальний край рисуются кодом. Всё следует перспективе
// дороги: ширина и размер клочков = масштаб дороги на этой глубине.

// Палитра из docs/visual-bible.md §6 (2026-09). В шаге 7 Фазы 1 переедет в CONFIG.COLORS.
const LEAF = '#76A544'; // HedgeSage
const LEAF_SHADE = '#43682F'; // HedgeShade
const LEAF_LIGHT = '#9CC456'; // HedgeLeafLight
const LEAF_DEEP = '#577F38'; // HedgeSage + HedgeShade пополам: просветы между клочками
const WOOD = '#BF7A45'; // PlanterWood
const WOOD_LIGHT = '#D39048'; // WoodLight
const INK = '#4A3428'; // InkBrown
const SHADOW = '#C4A97A'; // ShadowDust
const SAND = '#F7DCA0'; // FloorSand

// Клочки изгороди (второй лист). Цветущие — 10, 11, 13, 15, остальные без цветов.
// Первый лист (hedge-01..07) лежит в папке как запас и в игру не грузится.
const HEDGE_FLOWERING = ['hedge-10', 'hedge-11', 'hedge-13', 'hedge-15'];
const HEDGE_PLAIN = ['hedge-08', 'hedge-09', 'hedge-12', 'hedge-14', 'hedge-16'];
export const HEDGE_SPRITES = [...HEDGE_FLOWERING, ...HEDGE_PLAIN];

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Случайный разброс клочков: размер = ширина × (MIN … MIN + SPAN), ряд сдвигается на ±LANE_JITTER/2.
const CLUMP_SCALE_MIN = 0.88;
const CLUMP_SCALE_SPAN = 0.26;
const LANE_JITTER = 0.08;

// На сколько px (у кота) листва изгороди доходит от края дорожки наружу — вместе с самыми
// широкими клочками дальнего ряда. Всё, что стоит за изгородью (SideDecorArt), начинается
// отсюда, чтобы не наслаиваться на неё.
export function hedgeOuterReach() {
  const h = CONFIG.VISUAL.HEDGE_WALL || {};
  const a = CONFIG.VISUAL.ART_PACK || {};
  const lanes = a.HEDGE_LANES || [0.74];
  const outerLane = Math.max(...lanes) + LANE_JITTER / 2;
  const clumpHalf = ((a.HEDGE_CLUMP_WIDTH ?? 0.72) * (CLUMP_SCALE_MIN + CLUMP_SCALE_SPAN)) / 2;
  return (h.SHOULDER_NEAR ?? 8) + (h.CURB_NEAR ?? 12) + (h.WIDTH_NEAR ?? 74) * (outerLane + clumpHalf);
}

function settings() {
  const h = CONFIG.VISUAL.HEDGE_WALL || {};
  return {
    shoulder: h.SHOULDER_NEAR ?? 8,
    curb: h.CURB_NEAR ?? 9,
    width: h.WIDTH_NEAR ?? 74,
    period: h.CLUMP_PERIOD ?? 26,
    radius: h.CLUMP_RADIUS_NEAR ?? 15,
    postPeriod: h.POST_PERIOD ?? 130,
    horizonTaper: h.HORIZON_TAPER ?? 80
  };
}

export class HedgeArt {
  constructor(art) {
    this.art = art;
    // Переиспользуемые массивы, чтобы не создавать объекты каждый кадр.
    this.rows = [];
    this.clumps = [];
    this.clumpIds = []; // картинка × 2 + отражение: задаются номером слота и не меняются
    this.clumpKeys = []; // номер слота клочка (для проверки scripts/phase1f-check.mjs)
  }

  // Края бордюра и изгороди для одной строки экрана.
  sampleRows(shift) {
    const art = this.art;
    const cfg = settings();
    const rows = this.rows;
    rows.length = 0;
    const top = art.horizonY() + 1;
    const bottom = art.height + 48;
    for (let base = top; base <= bottom; base += base < top + 120 ? 3 : 6) {
      const worldY = art.screenToWorldY(base + shift);
      const p = art.roadAt(worldY);
      // У горизонта изгородь плавно сужается до нуля и сливается с деревьями,
      // а не заканчивается тёмным клином.
      const t = Math.max(0, Math.min(1, (p.drawY - art.horizonY()) / cfg.horizonTaper));
      const s = p.scale * t * t * (3 - 2 * t);
      rows.push(p.drawY, p.roadLeft, p.roadRight, s);
    }
    return cfg;
  }

  draw(camera) {
    const art = this.art;
    const ctx = art.ctx;
    const shift = art.lastShift || 0;
    const progress = camera?.progress || 0;
    const cfg = this.sampleRows(shift);
    const pack = this.packReady();
    ctx.save();
    this.drawBands(ctx, cfg);
    // Пока картинки грузятся (доли секунды на старте) — только подложка и бордюр.
    if (pack) {
      this.collectPackClumps(cfg, progress);
      this.drawFarFringe(ctx, cfg);
      this.drawPackClumps(ctx, pack);
    }
    this.drawCurbs(ctx, cfg, progress);
    ctx.restore();
  }

  // Картинки клочков, когда все загрузились.
  packReady() {
    const pack = this.art.artPack;
    return pack?.hasAll(HEDGE_SPRITES) ? pack : null;
  }

  // Клочки привязаны к миру (слот по Y, ряды поперёк), поэтому едут вместе с дорогой.
  // В this.clumps кладём (x, y, половина ширины) — по ним дальний край знает, где кончились клочки.
  collectPackClumps(cfg, progress) {
    const art = this.art;
    const packCfg = CONFIG.VISUAL.ART_PACK;
    const lanes = packCfg.HEDGE_LANES;
    const clumps = this.clumps;
    const ids = this.clumpIds;
    const keys = this.clumpKeys;
    const flowerChance = packCfg.HEDGE_FLOWER_CHANCE ?? 0.2;
    clumps.length = 0;
    ids.length = 0;
    keys.length = 0;
    const period = packCfg.HEDGE_PERIOD ?? cfg.period;
    const nearWorld = art.screenToWorldY(art.height + 80 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    for (let guard = 0; guard < 600; guard += 1, k -= 1) {
      const p = art.roadAt(k * period + progress);
      if (p.drawY < art.horizonY() + 2) break;
      const s = p.scale;
      // Совсем мелкие клочки вдали не рисуем картинками — там работает дальний край.
      if (cfg.width * packCfg.HEDGE_CLUMP_WIDTH * s < 5) break;
      for (let side = -1; side <= 1; side += 2) {
        const edge = side < 0 ? p.roadLeft : p.roadRight;
        for (let lane = 0; lane < lanes.length; lane += 1) {
          const seed = k * 7.3 + side * 3.1 + lane * 11.7;
          const w = cfg.width * packCfg.HEDGE_CLUMP_WIDTH * s * (CLUMP_SCALE_MIN + hash(seed) * CLUMP_SCALE_SPAN);
          const across = lanes[lane] + (hash(seed + 1) - 0.5) * LANE_JITTER;
          const x = this.edgeX(side, edge, s, cfg.shoulder + cfg.curb + cfg.width * across);
          const y = p.drawY + (hash(seed + 2) - 0.5) * period * 0.4 * s;
          clumps.push(x, y, w / 2);
          // Картинка и отражение зависят только от номера слота (k, сторона, ряд):
          // клочок не меняет вид по пути. Цветущий — с вероятностью HEDGE_FLOWER_CHANCE.
          const flowering = hash(seed + 5) < flowerChance;
          const pick = hash(seed + 7);
          const name = flowering
            ? Math.floor(pick * HEDGE_FLOWERING.length) % HEDGE_FLOWERING.length
            : HEDGE_FLOWERING.length + (Math.floor(pick * HEDGE_PLAIN.length) % HEDGE_PLAIN.length);
          ids.push(name * 2 + (hash(seed + 6) < 0.5 ? 1 : 0));
          keys.push(k * 4 + (side < 0 ? 0 : 2) + lane);
        }
      }
    }
  }

  // От дальних к ближним: ближние клочки перекрывают дальние.
  drawPackClumps(ctx, pack) {
    const c = this.clumps;
    const ids = this.clumpIds;
    for (let i = c.length - 3; i >= 0; i -= 3) {
      const id = ids[i / 3];
      const w = c[i + 2] * 2;
      const name = HEDGE_SPRITES[id >> 1];
      const h = w * pack.aspect(name);
      pack.draw(ctx, name, c[i] - w / 2, c[i + 1] - h * 0.6, w, (id & 1) === 1);
    }
  }

  edgeX(side, roadEdge, s, offset) {
    return roadEdge + side * offset * s;
  }

  // Сплошная полоса листвы под клочками, чтобы между ними не просвечивал газон.
  drawBands(ctx, cfg) {
    const rows = this.rows;
    ctx.fillStyle = LEAF_DEEP;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < rows.length; i += 4) {
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        const x = this.edgeX(side, edge, rows[i + 3], cfg.shoulder + cfg.curb);
        if (i === 0) ctx.moveTo(x, rows[i]);
        else ctx.lineTo(x, rows[i]);
      }
      for (let i = rows.length - 4; i >= 0; i -= 4) {
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        const x = this.edgeX(side, edge, rows[i + 3], cfg.shoulder + cfg.curb + cfg.width * 0.92);
        ctx.lineTo(x, rows[i]);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // Дальний участок изгороди, где клочки уже мельче пикселя: мелкая зубчатая
  // листва по рядам экрана и лёгкая дымка к горизонту (как у дальних деревьев),
  // чтобы изгородь сужалась живой, а не тёмным гладким клином.
  drawFarFringe(ctx, cfg) {
    const rows = this.rows;
    const clumps = this.clumps;
    let clumpTop = this.art.height;
    for (let i = 1; i < clumps.length; i += 3) clumpTop = Math.min(clumpTop, clumps[i]);
    const top = this.art.horizonY();
    if (clumpTop <= top + 4) return;
    const pass = (color, dy, k) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < rows.length; i += 4) {
        const y = rows[i];
        if (y > clumpTop + 6) break;
        const s = rows[i + 3];
        const r = Math.max(0.8, cfg.radius * s * 0.42 * k);
        for (const side of [-1, 1]) {
          const edge = side < 0 ? rows[i + 1] : rows[i + 2];
          for (let n = 0; n < 3; n += 1) {
            // Случайная (но постоянная для ряда) позиция поперёк изгороди: листва, а не полосы.
            const across = 0.06 + hash(Math.round(y) * 3.7 + n * 17.1 + side * 5.3) * 0.88;
            const x = this.edgeX(side, edge, s, cfg.shoulder + cfg.curb + cfg.width * across);
            ctx.moveTo(x + r, y + dy * r);
            ctx.arc(x, y + dy * r, r, 0, Math.PI * 2);
          }
        }
      }
      ctx.fill();
    };
    pass(LEAF_SHADE, 0.15, 1.1);
    pass(LEAF, -0.1, 0.95);
    pass(LEAF_LIGHT, -0.5, 0.4);
    // Дымка: к горизонту изгородь светлеет к цвету дальних деревьев.
    const haze = ctx.createLinearGradient(0, top, 0, clumpTop + 6);
    haze.addColorStop(0, 'rgba(125, 179, 138, 0.55)');
    haze.addColorStop(1, 'rgba(125, 179, 138, 0)');
    ctx.fillStyle = haze;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < rows.length; i += 4) {
        if (rows[i] > clumpTop + 6) break;
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        const x = this.edgeX(side, edge, rows[i + 3], cfg.shoulder + cfg.curb - 2);
        if (!started) { ctx.moveTo(x, rows[i]); started = true; } else ctx.lineTo(x, rows[i]);
      }
      for (let i = rows.length - 4; i >= 0; i -= 4) {
        if (rows[i] > clumpTop + 6) continue;
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        ctx.lineTo(this.edgeX(side, edge, rows[i + 3], cfg.shoulder + cfg.curb + cfg.width + 4), rows[i]);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // Деревянный бордюр: лицевая доска к дорожке, светлая верхняя кромка,
  // тонкая коричневая обводка и мягкая тень на песке.
  drawCurbs(ctx, cfg, progress) {
    const rows = this.rows;
    const strip = (side, from, to) => {
      ctx.beginPath();
      for (let i = 0; i < rows.length; i += 4) {
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        const x = this.edgeX(side, edge, rows[i + 3], from);
        if (i === 0) ctx.moveTo(x, rows[i]);
        else ctx.lineTo(x, rows[i]);
      }
      for (let i = rows.length - 4; i >= 0; i -= 4) {
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        ctx.lineTo(this.edgeX(side, edge, rows[i + 3], to), rows[i]);
      }
      ctx.closePath();
      ctx.fill();
    };
    const line = (side, at) => {
      ctx.beginPath();
      for (let i = 0; i < rows.length; i += 4) {
        const edge = side < 0 ? rows[i + 1] : rows[i + 2];
        const x = this.edgeX(side, edge, rows[i + 3], at);
        if (i === 0) ctx.moveTo(x, rows[i]);
        else ctx.lineTo(x, rows[i]);
      }
      ctx.stroke();
    };
    const inner = cfg.shoulder;
    const outer = cfg.shoulder + cfg.curb;
    for (const side of [-1, 1]) {
      // Узкая полоска песка между краем дорожки и бордюром.
      ctx.fillStyle = SAND;
      strip(side, -2, inner);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = SHADOW;
      strip(side, inner - 4, inner);
      ctx.globalAlpha = 1;
      ctx.fillStyle = WOOD;
      strip(side, inner, outer);
      ctx.fillStyle = WOOD_LIGHT;
      strip(side, inner + cfg.curb * 0.55, outer);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      line(side, inner);
    }
    this.drawPosts(ctx, cfg, progress);
  }

  // Столбики бордюра — короткие тёмные риски поперёк доски, привязаны к миру.
  drawPosts(ctx, cfg, progress) {
    const art = this.art;
    const period = cfg.postPeriod;
    const nearWorld = art.screenToWorldY(art.height + 40 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let guard = 0; guard < 80; guard += 1, k -= 1) {
      const p = art.roadAt(k * period + progress);
      if (p.drawY < art.horizonY() + 4 || p.scale < 0.58) break;
      for (const side of [-1, 1]) {
        const edge = side < 0 ? p.roadLeft : p.roadRight;
        ctx.moveTo(this.edgeX(side, edge, p.scale, cfg.shoulder), p.drawY);
        ctx.lineTo(this.edgeX(side, edge, p.scale, cfg.shoulder + cfg.curb), p.drawY - 1.5 * p.scale);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
