import { CONFIG } from '../config.js';
import { LeafClumpSprites } from './LeafClumpSprites.js';

// Живая изгородь вдоль дорожки, как на референсе: деревянный бордюр у песка,
// за ним стриженая изгородь из «клочков» листвы с белыми и розовыми цветами.
// Всё рисуется кодом в плоском cel-shaded стиле и следует той же перспективе,
// что и дорога: ширина и размер клочков = масштаб дороги на этой глубине.

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
const PETAL = '#FBF8EA'; // CloudWhite
const PETAL_PINK = '#F4B3A2'; // BlossomPink
const POLLEN = '#E8B84A'; // CoinAmber

// Два набора клочков: первый лист (01–07) и второй, темнее и спокойнее (08–16).
// Сравнение — временно: после выбора лишний набор уйдёт из кода.
const HEDGE_SETS = {
  // Цветущие (01, 03, 06, 07) в полтора раза чаще гладких (02, 05) и листового (04).
  old: [
    'hedge-01', 'hedge-01', 'hedge-01', 'hedge-03', 'hedge-03', 'hedge-03',
    'hedge-06', 'hedge-06', 'hedge-06', 'hedge-07', 'hedge-07', 'hedge-07',
    'hedge-02', 'hedge-02', 'hedge-05', 'hedge-05', 'hedge-04', 'hedge-04'
  ],
  // Во втором листе цветов уже мало (4 из 9), все клочки поровну.
  new: ['hedge-08', 'hedge-09', 'hedge-10', 'hedge-11', 'hedge-12', 'hedge-13', 'hedge-14', 'hedge-15', 'hedge-16']
};

function hedgePick() {
  return HEDGE_SETS[CONFIG.VISUAL.ART_PACK?.HEDGE_SET] || HEDGE_SETS.new;
}

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
    this.clumpIds = []; // номер спрайта для клочка, привязан к миру (не мигает)
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
    const pack = this.packReady();
    ctx.save();
    this.drawBands(ctx, cfg);
    if (pack) {
      this.collectPackClumps(cfg, progress);
      this.drawFarFringe(ctx, cfg);
      this.drawPackClumps(ctx, pack);
    } else {
      this.collectClumps(cfg, progress);
      this.drawFarFringe(ctx, cfg);
      this.drawClumps(ctx);
      this.drawFlowers(ctx);
    }
    this.drawCurbs(ctx, cfg, progress);
    ctx.restore();
  }

  // Нарисованные клочки (assets/art-pack/hedge), если включены и все загрузились.
  packReady() {
    const pack = this.art.artPack;
    if (!CONFIG.VISUAL.ART_PACK?.HEDGE || !pack?.hasAll(hedgePick())) return null;
    return pack;
  }

  // Клочки-картинки привязаны к миру так же, как кодовые: слот по Y, ряды поперёк.
  // В this.clumps кладём (x, y, половина ширины) — по ним дальний край знает, где кончились клочки.
  collectPackClumps(cfg, progress) {
    const art = this.art;
    const packCfg = CONFIG.VISUAL.ART_PACK;
    const lanes = packCfg.HEDGE_LANES;
    const clumps = this.clumps;
    const ids = this.clumpIds;
    const pick = hedgePick();
    clumps.length = 0;
    ids.length = 0;
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
          const w = cfg.width * packCfg.HEDGE_CLUMP_WIDTH * s * (0.88 + hash(seed) * 0.26);
          const across = lanes[lane] + (hash(seed + 1) - 0.5) * 0.08;
          const x = this.edgeX(side, edge, s, cfg.shoulder + cfg.curb + cfg.width * across);
          const y = p.drawY + (hash(seed + 2) - 0.5) * period * 0.4 * s;
          clumps.push(x, y, w / 2);
          // Номер картинки и отражение — от места в мире, поэтому не мигают.
          ids.push(Math.floor(hash(seed + 5) * pick.length) * 2 + (hash(seed + 6) < 0.5 ? 1 : 0));
        }
      }
    }
  }

  // От дальних к ближним: ближние клочки перекрывают дальние.
  drawPackClumps(ctx, pack) {
    const c = this.clumps;
    const ids = this.clumpIds;
    const pick = hedgePick();
    for (let i = c.length - 3; i >= 0; i -= 3) {
      const id = ids[i / 3];
      const name = pick[id >> 1];
      const w = c[i + 2] * 2;
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

  // Клочки листвы привязаны к миру (слоты по Y), поэтому едут вместе с дорогой.
  collectClumps(cfg, progress) {
    const art = this.art;
    const clumps = this.clumps;
    const flowers = this.flowers;
    clumps.length = 0;
    this.clumpIds.length = 0;
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
          this.clumpIds.push(Math.floor(hash(seed + 5) * 1000));
          // Вдали цветов меньше, иначе они сливаются в белую «сыпь».
          const flowerChance = cfg.flowerChance * Math.max(0, Math.min(1, (s - 0.62) / 0.3));
          if (lane > 0 && hash(seed + 3) < flowerChance) {
            flowers.push(x - r * 0.1, y - r * 0.35, r * 0.62, hash(seed + 4) < 0.35 ? 1 : 0);
          }
        }
      }
    }
  }

  // Спрайты крупнее плоских клочков: не даём им залезать на песок дорожки.
  clipOutsidePath(ctx) {
    const rows = this.rows;
    const shoulder = settings().shoulder;
    ctx.beginPath();
    ctx.rect(-50, -50, this.art.width + 100, this.art.height + 200);
    for (let i = 0; i < rows.length; i += 4) {
      const x = rows[i + 1] - shoulder * rows[i + 3];
      if (i === 0) ctx.moveTo(x, rows[i]);
      else ctx.lineTo(x, rows[i]);
    }
    for (let i = rows.length - 4; i >= 0; i -= 4) {
      ctx.lineTo(rows[i + 2] + shoulder * rows[i + 3], rows[i]);
    }
    ctx.closePath();
    ctx.clip('evenodd');
  }

  // Готовые картинки клочков для стилей 'soft' / 'textured' (создаются один раз).
  spritesFor(style) {
    if (style === 'flat' || !style) return null;
    if (this.clumpSprites?.style !== style) this.clumpSprites = new LeafClumpSprites(style);
    return this.clumpSprites.ready() ? this.clumpSprites : null;
  }

  // Три заливки: тень снизу-справа, основной цвет, блик сверху-слева.
  drawClumps(ctx) {
    const c = this.clumps;
    const sprites = this.spritesFor(CONFIG.VISUAL.HEDGE_WALL?.STYLE);
    if (sprites) {
      ctx.save();
      this.clipOutsidePath(ctx);
      // Тёмная зубчатая подложка под всеми клочками (контур и просветы, как на референсе),
      // сверху — готовые спрайты примерно на 60% клочков, от дальних к ближним.
      ctx.fillStyle = LEAF_SHADE;
      ctx.beginPath();
      for (let i = c.length - 3; i >= 0; i -= 3) {
        const r = c[i + 2] * 1.18;
        ctx.moveTo(c[i] + r, c[i + 1]);
        ctx.arc(c[i], c[i + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
      for (let i = c.length - 3; i >= 0; i -= 3) {
        const id = this.clumpIds[i / 3];
        if (c[i + 2] < 3 || id % 5 >= 3) continue;
        sprites.draw(ctx, c[i], c[i + 1], c[i + 2] * 1.1, id);
      }
      ctx.restore();
      return;
    }
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
