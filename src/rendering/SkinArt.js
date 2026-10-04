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

// Часть тела по положению контура (координаты холста 1024 × 1024, кот стоит по центру).
// Хвост здесь не определяется: в каждом кадре он лежит по-своему, его ищет readPaths по устройству рисунка.
export function partOf(box, role) {
  if (box.area > 60000) return 'whole'; // силуэт целиком: голова, спина, тело
  if (box.cy >= 828 || (box.cy >= 690 && box.cx < 500 && box.area < 9000)) return 'foot';
  if (role === 'stripe' && box.cy < 262) return box.cx < 485 || box.cx > 560 ? 'ear' : 'head';
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
  { id: 'ribbon', extra: ribbonShapes }
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

// SVG кадра в окраске скина.
export function skinSvg(svg, skinId) {
  const skin = SKINS.find((s) => s.id === skinId);
  if (!skin || (!skin.colors && !skin.parts && !skin.patches && !skin.extra && !skin.dropParts)) return svg;
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
