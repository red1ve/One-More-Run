import { CONFIG } from '../config.js';

// Живая изгородь вдоль дорожки, как на референсе: деревянный бордюр у песка,
// за ним стриженая изгородь из «клочков» листвы с белыми и розовыми цветами.
// Всё рисуется кодом в плоском cel-shaded стиле и следует той же перспективе,
// что и дорога: ширина и размер клочков = масштаб дороги на этой глубине.

// Палитра из docs/visual-bible.md §6 (2026-09). В шаге 7 Фазы 1 переедет в CONFIG.COLORS.
const LEAF = '#7EA24E'; // HedgeSage
const LEAF_SHADE = '#4B6D36'; // HedgeShade
const LEAF_LIGHT = '#9DBB5C'; // HedgeLeafLight
const LEAF_DEEP = '#658845'; // HedgeSage + HedgeShade пополам: просветы между клочками
const WOOD = '#BF7A45'; // PlanterWood
const WOOD_LIGHT = '#D39048'; // WoodLight
const INK = '#4A3428'; // InkBrown
const SHADOW = '#C4A97A'; // ShadowDust
const SAND = '#E2C992'; // FloorSand (как в config.js до шага 7)
const PETAL = '#FBF8EA'; // CloudWhite
const PETAL_PINK = '#F4B3A2'; // BlossomPink
const POLLEN = '#E8B84A'; // CoinAmber

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
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
    flowerChance: h.FLOWER_CHANCE ?? 0.22,
    horizonTaper: h.HORIZON_TAPER ?? 80
  };
}

export class HedgeArt {
  constructor(art) {
    this.art = art;
    // Переиспользуемые массивы, чтобы не создавать объекты каждый кадр.
    this.rows = [];
    this.clumps = [];
    this.flowers = [];
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
    ctx.save();
    this.drawBands(ctx, cfg);
    this.collectClumps(cfg, progress);
    this.drawClumps(ctx);
    this.drawFlowers(ctx);
    this.drawCurbs(ctx, cfg, progress);
    ctx.restore();
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

  // Клочки листвы привязаны к миру (слоты по Y), поэтому едут вместе с дорогой.
  collectClumps(cfg, progress) {
    const art = this.art;
    const clumps = this.clumps;
    const flowers = this.flowers;
    clumps.length = 0;
    flowers.length = 0;
    const period = cfg.period;
    const nearWorld = art.screenToWorldY(art.height + 60 + (art.lastShift || 0));
    let k = Math.floor((nearWorld - progress) / period);
    let prevY = Infinity;
    for (let guard = 0; guard < 600; guard += 1, k -= 1) {
      const worldY = k * period + progress;
      const p = art.roadAt(worldY);
      if (p.drawY < art.horizonY() + 2) break;
      // Когда клочки вдали сливаются меньше чем в 0.7 px, дальше рисует только полоса.
      if (prevY - p.drawY < 0.7) break;
      prevY = p.drawY;
      const s = p.scale;
      for (const side of [-1, 1]) {
        const edge = side < 0 ? p.roadLeft : p.roadRight;
        const inner = cfg.shoulder + cfg.curb;
        for (let lane = 0; lane < 4; lane += 1) {
          const seed = k * 7.3 + side * 3.1 + lane * 11.7;
          const r = cfg.radius * s * (0.82 + hash(seed) * 0.36);
          const across = [0.12, 0.38, 0.63, 0.86][lane] + (hash(seed + 1) - 0.5) * 0.1;
          const x = this.edgeX(side, edge, s, inner + cfg.width * across);
          const y = p.drawY + (hash(seed + 2) - 0.5) * period * 0.5 * s;
          clumps.push(x, y, r);
          // Вдали цветов меньше, иначе они сливаются в белую «сыпь».
          const flowerChance = cfg.flowerChance * Math.max(0, Math.min(1, (s - 0.62) / 0.3));
          if (lane > 0 && hash(seed + 3) < flowerChance) {
            flowers.push(x - r * 0.1, y - r * 0.35, r * 0.42, hash(seed + 4) < 0.35 ? 1 : 0);
          }
        }
      }
    }
  }

  // Три заливки: тень снизу-справа, основной цвет, блик сверху-слева.
  drawClumps(ctx) {
    const c = this.clumps;
    const pass = (color, dx, dy, k) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = c.length - 3; i >= 0; i -= 3) {
        const r = c[i + 2];
        ctx.moveTo(c[i] + dx * r + r * k, c[i + 1] + dy * r);
        ctx.arc(c[i] + dx * r, c[i + 1] + dy * r, r * k, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    // Тёмный зубчатый контур по краю изгороди, как на референсе.
    pass(LEAF_SHADE, 0, 0, 1.12);
    pass(LEAF_SHADE, 0.1, 0.12, 1);
    pass(LEAF, -0.04, -0.06, 0.96);
    pass(LEAF_LIGHT, -0.32, -0.4, 0.34);
  }

  drawFlowers(ctx) {
    const f = this.flowers;
    const petals = (pink) => {
      ctx.fillStyle = pink ? PETAL_PINK : PETAL;
      ctx.beginPath();
      for (let i = 0; i < f.length; i += 4) {
        if (f[i + 3] !== pink) continue;
        const size = f[i + 2];
        for (let n = 0; n < 5; n += 1) {
          const a = (n / 5) * Math.PI * 2 - Math.PI / 2;
          const px = f[i] + Math.cos(a) * size * 0.55;
          const py = f[i + 1] + Math.sin(a) * size * 0.55;
          ctx.moveTo(px + size * 0.42, py);
          ctx.arc(px, py, size * 0.42, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    };
    petals(0);
    petals(1);
    ctx.fillStyle = POLLEN;
    ctx.beginPath();
    for (let i = 0; i < f.length; i += 4) {
      const size = f[i + 2] * 0.28;
      ctx.moveTo(f[i] + size, f[i + 1]);
      ctx.arc(f[i], f[i + 1], size, 0, Math.PI * 2);
    }
    ctx.fill();
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
