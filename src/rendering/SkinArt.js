// Скины кота Loaf: перекраска векторных кадров бега прямо в тексте SVG, без новых файлов.
//
// Кадры (assets/characters/run/loaf-run-0N.svg) — стопка закрашенных контуров. Цветов в них мало:
// кремовое тело, тень на нём, рыжие полосы, подушечки лап и тёмно-коричневый контур. Каждый контур
// получает роль по цвету (body, shade, stripe, tan, pad, outline) и часть тела по положению
// (tail, foot, ear, head, back), а скин задаёт новые цвета для ролей и, если нужно, отдельно для
// частей. Контур и форма не меняются никогда (visual-bible §3): меняются только цвета.
// Накладки (пятна калико, пушистый хвост) — отдельные фигуры поверх тела, обрезанные по его силуэту.
// Всё это чистые функции над строкой SVG: их можно проверить без браузера.

const PATH_RE = /<path d="([^"]*)"([^>]*)\/>/g;

// ---- цвет

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]) {
  const part = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function hsl(hex) {
  const [r8, g8, b8] = parseHex(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

// Смесь двух цветов: 0 — a, 1 — b.
export function mix(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

// ---- роли и части

// Роль контура по цвету заливки. Всё остальное (мелкие крапинки трассировки) остаётся как есть.
export function roleOf(fill) {
  const { h, s, l } = hsl(fill);
  if (l < 0.3) return 'outline';
  if (l >= 0.82) return 'body';
  if (h <= 14 && s >= 0.25 && l < 0.55) return 'pad';
  if (l < 0.6) return 'tan'; // тёмно-рыжие участки (низ хвоста)
  if (s >= 0.45) return 'stripe';
  if (s >= 0.3) return 'shade';
  return 'other';
}

// Границы контура по числам его пути (с учётом сдвига translate). Для частей тела этого достаточно.
function boxOf(d, attrs) {
  const move = attrs.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
  const tx = move ? Number(move[1]) : 0;
  const ty = move ? Number(move[2]) : 0;
  const nums = d.match(/-?\d+(?:\.\d+)?/g) || [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let area2 = 0;
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push([Number(nums[i]) + tx, Number(nums[i + 1]) + ty]);
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    const [nx, ny] = points[(i + 1) % points.length];
    area2 += x * ny - nx * y;
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, area: Math.abs(area2) / 2 };
}

// Меньше этой площади контур у верха головы — полоска лба, а не ухо.
const EAR_MIN_AREA = 2500;

// Часть тела по положению контура (координаты холста 1024 × 1024, кот стоит по центру).
// Хвост здесь не определяется: в каждом кадре он лежит по-своему, его ищет readPaths по устройству рисунка.
export function partOf(box, role) {
  if (box.area > 60000) return 'whole'; // силуэт целиком: голова, спина, тело
  if (box.cy >= 828 || (box.cy >= 690 && box.cx < 500 && box.area < 9000)) return 'foot';
  // Ухо — крупный контур (≈ 4900–5500), полоски на лбу — мелкие (≈ 1000). Раньше уху считалось всё, что левее x 485,
  // и в одном кадре бега левая полоска лба (x ≈ 484) красилась у сиамского в тёмный цвет ушей.
  if (role === 'stripe' && box.cy < 262) return box.area >= EAR_MIN_AREA && (box.cx < 485 || box.cx > 560) ? 'ear' : 'head';
  if (box.cy < 262) return 'head';
  if (box.cy >= 400 && box.cy <= 560) return 'back';
  return 'body';
}

// Разобрать SVG: список контуров с ролью и частью. Нужен и для перекраски, и для проверок.
export function readPaths(svg) {
  const result = [];
  let match;
  PATH_RE.lastIndex = 0;
  while ((match = PATH_RE.exec(svg)) !== null) {
    const fill = (match[2].match(/fill="(#[0-9a-fA-F]{6})"/) || [])[1];
    if (!fill) continue;
    const box = boxOf(match[1], match[2]);
    const role = roleOf(fill);
    result.push({ index: match.index, length: match[0].length, fill: fill.toLowerCase(), role, part: partOf(box, role), box, d: match[1], attrs: match[2] });
  }
  labelTail(result);
  return result;
}

// Хвост: его тело — первый кремовый контур после силуэта (так нарисованы все кадры бега), а полосы и
// тени хвоста лежат после него в стопке и почти целиком внутри его рамки.
function labelTail(paths) {
  const bodyIndex = paths.findIndex((p) => p.role === 'body' && p.part !== 'whole');
  if (bodyIndex < 0) return;
  const tail = paths[bodyIndex];
  tail.part = 'tail';
  const t = tail.box;
  const left = t.cx - t.w / 2;
  const right = t.cx + t.w / 2;
  const top = t.cy - t.h / 2;
  const bottom = t.cy + t.h / 2;
  for (let i = bodyIndex + 1; i < paths.length; i += 1) {
    const p = paths[i];
    if (p.role === 'outline' || p.part === 'whole' || p.box.area >= t.area) continue;
    const b = p.box;
    const inX = Math.max(0, Math.min(right, b.cx + b.w / 2) - Math.max(left, b.cx - b.w / 2));
    const inY = Math.max(0, Math.min(bottom, b.cy + b.h / 2) - Math.max(top, b.cy - b.h / 2));
    if ((inX * inY) / Math.max(1, b.w * b.h) >= 0.65) p.part = 'tail';
  }
}

// ---- скины

// Цвета ролей у каждого скина. parts — отдельные цвета для частей тела (поверх общих).
// Значения — hex или { mix: [цвет, цвет, доля] } от исходного цвета, чтобы тень и свет сохранялись.
export const SKINS = [
  { id: 'classic' },
  {
    id: 'ginger',
    colors: { body: '#EBA45E', shade: '#D58B46', stripe: '#C46A28', tan: '#B8581F', pad: '#C9806A' },
    parts: {
      foot: { body: '#F4E3C8', shade: '#E0C7A6', stripe: '#EBA45E' },
      tail: { body: '#EBA45E', stripe: '#C46A28' }
    }
  },
  {
    id: 'tuxedo',
    colors: { body: '#684A3B', shade: '#523A2E', stripe: '#523A2E', tan: '#44302A', pad: '#C9806A' },
    parts: {
      tail: { body: '#F2DFC2', shade: '#DCC3A2', stripe: '#E7C7A0', tan: '#D3AE86' },
      foot: { body: '#F2DFC2', shade: '#DCC3A2', stripe: '#E7C7A0' }
    }
  },
  {
    id: 'calico',
    // Пятна: итоговый цвет поверх кремового тела (умножением). Координаты — холст 1024 × 1024.
    patches: [
      { color: '#E3A04F', cx: 440, cy: 185, rx: 80, ry: 90, rot: -15 }, // левое ухо и лоб
      { color: '#5E4235', cx: 612, cy: 195, rx: 62, ry: 95, rot: 12 }, // правое ухо и щека
      { color: '#E3A04F', cx: 455, cy: 440, rx: 82, ry: 62, rot: -25 }, // спина слева
      { color: '#5E4235', cx: 595, cy: 520, rx: 62, ry: 78, rot: 15 }, // спина справа
      { color: '#E3A04F', cx: 440, cy: 625, rx: 70, ry: 58, rot: 20 }, // бок
      { color: '#E3A04F', cx: 560, cy: 640, rx: 34, ry: 80, rot: -18 }, // хвост
      { color: '#5E4235', cx: 598, cy: 735, rx: 30, ry: 40, rot: -25 } // хвост, кольцо
    ]
  },
  {
    id: 'siamese',
    colors: { body: '#F2E4D6', shade: '#DCC7B4', stripe: '#CDB7A3', tan: '#B8A08C', pad: '#8B5A4E' },
    parts: {
      ear: { stripe: '#5A4036', body: '#5A4036', shade: '#4A3128' },
      tail: { body: '#5A4036', shade: '#4A3128', stripe: '#4A3128', tan: '#3E2820' },
      foot: { body: '#5A4036', shade: '#4A3128', stripe: '#4A3128' }
    }
  },
  { id: 'honey', colors: { body: '#E9BE63', shade: '#D2A347', stripe: '#BE8A32', tan: '#A9751F', pad: '#C9806A' } },
  { id: 'snow', colors: { body: '#F6F1EA', shade: '#E3DBD2', stripe: '#CFC8C0', tan: '#B9B1A8', pad: '#D9A89C' } },
  { id: 'ribbon', extra: ribbonShapes },
  {
    // Хэллоуин (ограниченный скин, см. CONFIG.SHOP): тёмный кот с рыжими полосками и ведьминской шляпой.
    // Сезонный: правило «природные цвета» для него не действует (phase1m), но тело светлее контура.
    id: 'halloween',
    seasonal: true,
    colors: { body: '#554A5E', shade: '#41384A', stripe: '#E4892F', tan: '#C96F1F', pad: '#C9806A' },
    parts: {
      ear: { stripe: '#E4892F', body: '#554A5E', shade: '#41384A' },
      tail: { body: '#554A5E', shade: '#41384A', stripe: '#E4892F', tan: '#C96F1F' },
      foot: { body: '#4A4054', shade: '#3A3142', stripe: '#E4892F' }
    },
    extra: witchHatShapes,
    clip: hatClipPath // уши над полями обрезаются, шляпа рисуется поверх
  }
];

const ROLE_KEYS = ['body', 'shade', 'stripe', 'tan', 'pad'];

// Новый цвет для контура или null (оставить как есть).
function recolor(skin, path) {
  if (!ROLE_KEYS.includes(path.role)) return null;
  const own = skin.parts?.[path.part]?.[path.role];
  const base = skin.colors?.[path.role];
  const target = own || base;
  if (!target) return null;
  // Исходные оттенки одной роли чуть различаются (шум трассировки): сохраняем разницу.
  const ref = REFERENCE[path.role];
  const a = hsl(path.fill);
  const b = hsl(ref);
  const t = hsl(target);
  const lift = Math.max(-0.05, Math.min(0.05, a.l - b.l));
  const [r, g, bl] = parseHex(target);
  const k = lift * 255 * 1.2;
  void t;
  return toHex([r + k, g + k, bl + k]);
}

// Исходный «средний» цвет каждой роли у обычного кота.
const REFERENCE = { body: '#eedac6', shade: '#ceaa95', stripe: '#d8a582', tan: '#bc825f', pad: '#9d5a4f' };

// Цвет «множителя»: умножение на кремовое тело даёт нужный итоговый цвет.
function multiplier(finalColor) {
  const base = parseHex(REFERENCE.body);
  return toHex(parseHex(finalColor).map((v, i) => (v / base[i]) * 255));
}

// Лента на хвосте («Festival Thread» из visual-bible §3): один аксессуар, меньше уха, тот же контур
// InkBrown. Привязана к корню хвоста у крупа: он почти не двигается между кадрами бега, а сам хвост
// размахивает по-разному, поэтому пушистый хвост (большая накладка) на кадрах бега не держится.
function ribbonShapes() {
  const ink = '#57271C';
  const gold = '#E8B84A';
  const goldShade = '#C99A32';
  const x = 548;
  const y = 604;
  return `<g stroke-linejoin="round" stroke="${ink}" stroke-width="6">
<path d="M ${x} ${y} L ${x - 44} ${y - 26} L ${x - 38} ${y + 24} Z" fill="${gold}"/>
<path d="M ${x} ${y} L ${x + 44} ${y - 28} L ${x + 36} ${y + 24} Z" fill="${gold}"/>
<path d="M ${x - 30} ${y - 8} L ${x - 12} ${y - 2} L ${x - 30} ${y + 12} Z" fill="${goldShade}" stroke="none"/>
<circle cx="${x}" cy="${y}" r="12" fill="${gold}"/>
</g>`;
}

// Ведьминская шляпа Хэллоуина. Форма исходная (владельцу понравилась): острый конус с загибом вправо, рыжая лента,
// золотая пряжка, звезда. Но надета она на голову, а не поставлена на макушку: центр полей на y = 200 (макушка кота
// на y ≈ 150, кончики ушей на y ≈ 102…135, низ ушей на y ≈ 242), поля широкие (±184), наклон 4° правой стороной вниз.
// Уши над полями не прячутся куполом (форма шляпы не позволяет), а ОБРЕЗАЮТСЯ: скин обрезает кота (skin.clip) по
// верхней дуге полей, всё выше неё исчезает, и кажется, что уши остались внутри шляпы. Дуга лежит на 5 px внутри
// эллипса полей, поэтому срез скрыт под их контуром. Цвета: чёрная шляпа (первая фиолетовая сливалась с котом).
// Вариант 4 из шести (2026-10-19): «шире и почти прямо».
const HAT = { main: '#241C2B', light: '#3C3047', dark: '#17111D', band: '#F28B2F', gold: '#F6CE5A', ink: '#57271C' };
// cx, cy — центр полей; halfBrim, brimHeight — полуоси полей; tilt — наклон по часовой стрелке (правая сторона ниже);
// kx, ky — во сколько раз корона шире и выше эскиза CROWN_SKETCH.
export const HAT_GEOMETRY = { cx: 520, cy: 200, halfBrim: 184, brimHeight: 34, tilt: 4, kx: 1.35, ky: 1.1 };

function starPath(cx, cy, r) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(1)} ${(cy + Math.sin(angle) * radius).toFixed(1)}`);
  }
  return `M ${points.join(' L ')} Z`;
}

// Контур короны: эскиз относительно центра полей (ноль — центр полей, вверх — минус, до наклона и растяжения kx, ky).
// Начало и кубические кривые по три точки: левая стенка, подъём к вершине, загнутый вправо кончик, правая стенка, низ.
const CROWN_SKETCH = {
  start: [-66, -4],
  curves: [
    [[-56, -46], [-34, -90], [-8, -118]],
    [[14, -142], [52, -150], [82, -122]],
    [[50, -126], [30, -106], [30, -84]],
    [[50, -50], [62, -24], [66, -4]],
    [[40, 16], [-40, 16], [-66, -4]]
  ]
};

// Точка эскиза в координатах кадра (до наклона шляпы).
function hatPoint([a, b]) {
  const { cx, cy, kx, ky } = HAT_GEOMETRY;
  return [cx + a * kx, cy + b * ky];
}

// Поворот вокруг центра полей на наклон шляпы: из координат шляпы в координаты кадра.
function tiltPoint([x, y]) {
  const { cx, cy, tilt } = HAT_GEOMETRY;
  const angle = (tilt * Math.PI) / 180;
  return [
    cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
    cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)
  ];
}

// Контур короны в координатах кадра ПОСЛЕ наклона: многоугольник из точек на кривых (для проверок).
export function hatCrownPolygon(steps = 16) {
  const points = [hatPoint(CROWN_SKETCH.start)];
  let from = CROWN_SKETCH.start;
  for (const [c1, c2, to] of CROWN_SKETCH.curves) {
    const [p0, p1, p2, p3] = [from, c1, c2, to].map(hatPoint);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      points.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
    from = to;
  }
  return points.map(tiltPoint);
}

// Верхняя дуга полей (в координатах кадра после наклона), слева направо, на 5 px внутри эллипса полей.
export function hatCutArc(steps = 40) {
  const { cx, cy, halfBrim, brimHeight } = HAT_GEOMETRY;
  const arc = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = Math.PI + (Math.PI * i) / steps;
    arc.push(tiltPoint([cx + (halfBrim - 2) * Math.cos(theta), cy + (brimHeight - 5) * Math.sin(theta)]));
  }
  return arc;
}

// Видимая часть кота: всё ниже верхней дуги полей. Всё выше — уши — обрезается.
export function hatVisiblePolygon() {
  const arc = hatCutArc();
  const first = arc[0];
  const last = arc[arc.length - 1];
  return [[0, 1100], [0, first[1]], ...arc, [1100, last[1]], [1100, 1100]];
}

// Контур видимой части кота для clipPath.
export function hatClipPath() {
  return `M ${hatVisiblePolygon().map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
}

function witchHatShapes() {
  const { main, light, dark, band, gold, ink } = HAT;
  const { cx, cy, halfBrim, brimHeight, tilt, kx, ky } = HAT_GEOMETRY;
  const P = (dx, dy) => `${(cx + dx * kx).toFixed(1)} ${(cy + dy * ky).toFixed(1)}`;
  const k = Math.min(kx, 1.2); // пряжка и звезда растут медленнее короны
  const crown = `M ${P(...CROWN_SKETCH.start)} ${CROWN_SKETCH.curves.map((curve) => `C ${curve.map((point) => P(...point)).join(' ')}`).join(' ')} Z`;
  return `<g transform="rotate(${tilt} ${cx} ${cy})" stroke-linejoin="round" stroke-linecap="round">
<ellipse cx="${cx}" cy="${cy + 26}" rx="${(halfBrim * 0.84).toFixed(1)}" ry="26" fill="#1C1623" opacity="0.38"/>
<ellipse cx="${cx}" cy="${cy + 11}" rx="${halfBrim}" ry="${brimHeight}" fill="${dark}" stroke="${ink}" stroke-width="6"/>
<ellipse cx="${cx}" cy="${cy}" rx="${halfBrim}" ry="${brimHeight}" fill="${main}" stroke="${ink}" stroke-width="6"/>
<path d="M ${(cx - halfBrim * 0.78).toFixed(1)} ${cy + 8} Q ${cx} ${cy + brimHeight + 2} ${(cx + halfBrim * 0.78).toFixed(1)} ${cy + 8}" fill="none" stroke="${light}" stroke-width="5" opacity="0.7"/>
<path d="${crown}" fill="${main}" stroke="${ink}" stroke-width="6"/>
<path d="M ${P(-52, -10)} C ${P(-44, -50)} ${P(-26, -86)} ${P(-6, -112)} C ${P(-14, -80)} ${P(-22, -46)} ${P(-24, -8)} Z" fill="${light}" opacity="0.75"/>
<path d="M ${P(-68, -26)} C ${P(-30, -10)} ${P(30, -10)} ${P(68, -26)} L ${P(72, -2)} C ${P(36, 16)} ${P(-36, 16)} ${P(-72, -2)} Z" fill="${band}" stroke="${ink}" stroke-width="6"/>
<rect x="${(cx - 18 * k).toFixed(1)}" y="${(cy - 22 * ky).toFixed(1)}" width="${(36 * k).toFixed(1)}" height="${(34 * ky).toFixed(1)}" rx="5" fill="${gold}" stroke="${ink}" stroke-width="5"/>
<rect x="${(cx - 9 * k).toFixed(1)}" y="${(cy - 13 * ky).toFixed(1)}" width="${(18 * k).toFixed(1)}" height="${(16 * ky).toFixed(1)}" rx="2" fill="${main}"/>
<path d="${starPath(cx + 12 * kx, cy - 72 * ky, 15)}" fill="${gold}"/>
</g>`;
}

// Обрезка кота по контуру d: всё рисунок кадра кладётся в группу с clipPath. Накладки скина идут уже после неё.
function clipCat(svg, d) {
  const open = svg.match(/<svg[^>]*>/);
  const end = svg.lastIndexOf('</svg>');
  if (!open || end < 0) return svg;
  const at = open.index + open[0].length;
  return `${svg.slice(0, at)}<defs><clipPath id="omr-skin-cut"><path d="${d}"/></clipPath></defs><g clip-path="url(#omr-skin-cut)">${svg.slice(at, end)}</g>${svg.slice(end)}`;
}

// SVG кадра в окраске скина.
export function skinSvg(svg, skinId) {
  const skin = SKINS.find((s) => s.id === skinId);
  if (!skin || (!skin.colors && !skin.parts && !skin.patches && !skin.extra && !skin.dropParts && !skin.clip)) return svg;
  const paths = readPaths(svg);
  let out = '';
  let cursor = 0;
  for (const path of paths) {
    if (skin.dropParts?.includes(path.part)) {
      out += svg.slice(cursor, path.index);
      cursor = path.index + path.length;
      continue;
    }
    const color = recolor(skin, path);
    if (!color) continue;
    const tag = svg.slice(path.index, path.index + path.length);
    out += svg.slice(cursor, path.index) + tag.replace(/fill="#[0-9a-fA-F]{6}"/, `fill="${color}"`);
    cursor = path.index + path.length;
  }
  out += svg.slice(cursor);
  if (skin.clip) out = clipCat(out, skin.clip());
  if (!skin.patches && !skin.extra) return out;
  // Накладки идут перед закрывающим </svg>.
  let tail = '';
  if (skin.patches) {
    // Обрезка по заливке тела (кремовые контуры): пятно не выходит за кота и не закрывает контур.
    const clip = paths
      .filter((p) => p.role === 'body')
      .map((p) => `<path d="${p.d}"${p.attrs.replace(/fill="[^"]*"/, '')}/>`)
      .join('');
    const blobs = skin.patches
      .map((b) => `<ellipse cx="${b.cx}" cy="${b.cy}" rx="${b.rx}" ry="${b.ry}" transform="rotate(${b.rot || 0} ${b.cx} ${b.cy})" fill="${multiplier(b.color)}"/>`)
      .join('');
    tail += `<defs><clipPath id="omr-skin-clip">${clip}</clipPath></defs><g clip-path="url(#omr-skin-clip)" style="mix-blend-mode:multiply">${blobs}</g>`;
  }
  if (skin.extra) tail += skin.extra();
  const end = out.lastIndexOf('</svg>');
  return end < 0 ? out : out.slice(0, end) + tail + out.slice(end);
}

// ---- сидящий кот (экраны старта, паузы и проигрыша) и превью в магазине

// Цвета частей сидящего кота (assets/characters/loaf-sit.svg, у частей есть data-part). Не указанные
// части остаются как есть. body красит ещё голову, уши и лапы, если для них нет своего цвета.
const SIT_PALETTE = {
  ginger: { body: '#EBA45E', patch: '#C46A28', tail: '#C46A28', inner: '#C46A28', paw: '#F4E3C8', nose: '#C9806A' },
  tuxedo: { body: '#7A5845', patch: '#684A3B', tail: '#F2DFC2', paw: '#F2DFC2', inner: '#684A3B', nose: '#C9806A' },
  calico: { patch: '#E3A04F', earFolded: '#5E4235', tail: '#E3A04F', inner: '#E3A04F', nose: '#C9806A' },
  siamese: { body: '#F2E4D6', patch: '#CDB7A3', earFolded: '#5A4036', earFull: '#5A4036', tail: '#5A4036', paw: '#5A4036', inner: '#4A3128', nose: '#8B5A4E' },
  honey: { body: '#E9BE63', patch: '#BE8A32', tail: '#BE8A32', inner: '#BE8A32', nose: '#C9806A' },
  halloween: { body: '#554A5E', patch: '#41384A', earFolded: '#E4892F', earFull: '#E4892F', tail: '#E4892F', paw: '#4A4054', inner: '#C96F1F', nose: '#C9806A' },
  snow: { body: '#F6F1EA', patch: '#CFC8C0', tail: '#CFC8C0', inner: '#CFC8C0', nose: '#D9A89C' }
};
const SIT_BODY_PARTS = ['body', 'head', 'earFolded', 'earFull', 'paw'];

// Пятна Пёстрого на теле и лента на хвосте сидящего кота (координаты рисунка 300 × 360).
const SIT_BODY_PATCHES = {
  calico: [
    { color: '#E3A04F', cx: 112, cy: 272, rx: 30, ry: 22, rot: -20 },
    { color: '#5E4235', cx: 192, cy: 252, rx: 24, ry: 30, rot: 15 }
  ]
};
const SIT_RIBBON = { ribbon: { x: 256, y: 284 } };
// Светлая мордочка и «манишка» Смокинга: без них тёмное лицо с тёмными глазами сливается.
const SIT_TUXEDO = { color: '#F2DFC2', muzzle: { cx: 150, cy: 172, rx: 34, ry: 22 }, bib: { cx: 150, cy: 262, rx: 32, ry: 48 } };

// SVG сидящего кота в окраске скина. classic и неизвестные скины возвращают рисунок как есть.
export function sitSvg(svg, skinId) {
  const palette = SIT_PALETTE[skinId];
  const patches = SIT_BODY_PATCHES[skinId];
  const ribbon = SIT_RIBBON[skinId];
  const tuxedo = skinId === 'tuxedo' ? SIT_TUXEDO : null;
  if (!palette && !patches && !ribbon) return svg;
  let out = svg;
  if (palette) {
    out = out.replace(/<(path|rect) data-part="(\w+)"([^>]*?)fill="#[0-9a-fA-F]{6}"/g, (whole, tag, part, middle) => {
      const color = palette[part] || (SIT_BODY_PARTS.includes(part) ? palette.body : undefined);
      return color ? `<${tag} data-part="${part}"${middle}fill="${color}"` : whole;
    });
  }
  if (patches) {
    const blobs = patches
      .map((b) => `<ellipse cx="${b.cx}" cy="${b.cy}" rx="${b.rx}" ry="${b.ry}" transform="rotate(${b.rot || 0} ${b.cx} ${b.cy})" fill="${multiplier(b.color)}"/>`)
      .join('');
    const layer = `<g clip-path="url(#loaf-body)" style="mix-blend-mode:multiply">${blobs}</g>\n`;
    out = out.replace(/(\s*)(<g stroke="#4A3428" stroke-width="9" stroke-linejoin="round">\s*<!-- лапки -->)/, `$1${layer}$2`);
  }
  if (tuxedo) {
    const { color, muzzle, bib } = tuxedo;
    const chest = `<g clip-path="url(#loaf-body)"><ellipse cx="${bib.cx}" cy="${bib.cy}" rx="${bib.rx}" ry="${bib.ry}" fill="${color}"/></g>\n`;
    out = out.replace(/(\s*)(<g stroke="#4A3428" stroke-width="9" stroke-linejoin="round">\s*<!-- лапки -->)/, `$1${chest}$2`);
    out = out.replace(/(\s*)(<!-- лицо)/, `$1<ellipse cx="${muzzle.cx}" cy="${muzzle.cy}" rx="${muzzle.rx}" ry="${muzzle.ry}" fill="${color}"/>$1$2`);
  }
  if (ribbon) {
    const { x, y } = ribbon;
    const bow = `<g stroke="#4A3428" stroke-width="5" stroke-linejoin="round"><path d="M${x} ${y} L${x - 22} ${y - 14} L${x - 19} ${y + 13} Z" fill="#E8B84A"/><path d="M${x} ${y} L${x + 22} ${y - 15} L${x + 18} ${y + 13} Z" fill="#E8B84A"/><circle cx="${x}" cy="${y}" r="7" fill="#E8B84A"/></g>\n`;
    out = out.replace('</svg>', `${bow}</svg>`);
  }
  return out;
}

// Размер картинки превью (кадр бега, обрезанный по коту): ширина × высота в единицах рисунка 1024 × 1024. Поля шире
// самого кота примерно на 15 единиц с каждой стороны, иначе кончики полей шляпы Хэллоуина срезались бы по краю.
export const PREVIEW_BOX = { x: 325, y: 96, width: 390, height: 850 };

// Кадр бега, обрезанный по коту, для превью в магазине: у картинки свой размер (а не 1024 × 1024),
// поэтому в рамку магазина она ложится ровно и остаётся чёткой.
export function skinPreviewSvg(frameSvg, skinId) {
  const { x, y, width, height } = PREVIEW_BOX;
  return skinSvg(frameSvg, skinId)
    .replace(/viewBox="0 0 1024 1024"/, `viewBox="${x} ${y} ${width} ${height}"`)
    .replace(/width="100%" height="auto"/, `width="${width}" height="${height}"`);
}
