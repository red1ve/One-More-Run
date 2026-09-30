// Мягкие «клочки» листвы для изгороди (Фаза 1в, эксперимент смягчения).
// Каждый клочок рисуется ОДИН раз в маленький холст при запуске, в кадре он только
// копируется (drawImage) — мягкие тени и градиенты на тысяче клочков иначе тормозили бы.
//
// Силуэт клочка — «облачко» с выпуклостями по краю, как на референсе.
// 'soft'     — вариант а: плавные градиенты, мягкие пятна листвы, свет сверху, тень снизу.
// 'textured' — вариант б: силуэт залит «живописной» плиткой (мазки + зерно),
//              поверх тот же свет и тень.
// Включается в CONFIG.VISUAL.HEDGE_WALL.STYLE; в npm run dev — ?hedge=soft|textured.

const SIZE = 128; // px одного спрайта; клочок радиусом ≈ SIZE * R_SHARE
const R_SHARE = 0.34;
const VARIANTS = 8;

// Палитра: HedgeShade → HedgeSage → HedgeLeafLight (visual-bible §6).
const SHADE = [67, 104, 47];
const MID = [118, 165, 68];
const LIGHT = [156, 196, 86];

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function rgb(c, alpha = 1) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function makeCanvas(size = SIZE) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

// Силуэт «облачком», как на референсе: середина + кольцо мелких выпуклостей по краю.
function cloudPath(ctx, seed, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.78, cy);
  ctx.ellipse(cx, cy, r * 0.78, r * 0.72, 0, 0, Math.PI * 2);
  const bumps = 11;
  for (let i = 0; i < bumps; i += 1) {
    const a = (i / bumps) * Math.PI * 2 + hash(seed + i) * 0.25;
    const d = r * (0.68 + hash(seed + i * 2.1) * 0.08);
    const rr = r * (0.26 + hash(seed + i * 3.3) * 0.1);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.88;
    ctx.moveTo(x + rr, y);
    ctx.arc(x, y, rr, 0, Math.PI * 2);
  }
}

// Мягкое пятно: радиальный градиент от цвета к прозрачному.
function dab(ctx, x, y, radius, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgb(color, alpha));
  g.addColorStop(1, rgb(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// Общая основа: мягкая тень под клочком + заливка силуэта.
function baseClump(ctx, seed, cx, cy, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(38, 60, 26, 0.5)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = rgb(MID);
  cloudPath(ctx, seed, cx, cy, r);
  ctx.fill();
  ctx.restore();
}

// Свет сверху, мягкая тень снизу — поверх любой заливки (внутри клипа).
function shadeClump(ctx, cx, cy, r, strength) {
  const top = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  top.addColorStop(0, rgb(LIGHT, 0.55 * strength));
  top.addColorStop(0.45, rgb(LIGHT, 0));
  top.addColorStop(0.7, rgb(SHADE, 0));
  top.addColorStop(1, rgb(SHADE, 0.55 * strength));
  ctx.fillStyle = top;
  ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
  dab(ctx, cx + r * 0.25, cy + r * 1.05, r * 0.95, SHADE, 0.5 * strength);
}

// Вариант а: плавные градиенты и мягкие «пятна» листвы, без жёстких кругов.
function makeSoftSprite(seed) {
  const canvas = makeCanvas();
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE * R_SHARE;
  baseClump(ctx, seed, cx, cy, r);
  ctx.save();
  cloudPath(ctx, seed, cx, cy, r);
  ctx.clip();
  // Пятна: чуть темнее и чуть светлее основы — «шум листвы» без мелкой ряби.
  for (let i = 0; i < 16; i += 1) {
    const a = hash(seed * 7 + i) * Math.PI * 2;
    const d = Math.sqrt(hash(seed * 11 + i * 1.7)) * r * 0.9;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.85;
    const dark = hash(seed + i * 5.1) < 0.5;
    dab(ctx, x, y, r * (0.22 + hash(seed + i * 9.3) * 0.18), dark ? SHADE : LIGHT, dark ? 0.22 : 0.3);
  }
  shadeClump(ctx, cx, cy, r, 1);
  // Блики на верхних выпуклостях.
  for (let i = 0; i < 4; i += 1) {
    const a = -Math.PI * (0.25 + hash(seed + i * 4.4) * 0.5);
    dab(ctx, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.5, r * 0.28, LIGHT, 0.45);
  }
  ctx.restore();
  return canvas;
}

// Вариант б: «живописная» плитка — мягкие мазки + зерно бумаги, как в рисованной игре.
function makePaintTexture() {
  const size = 192;
  const canvas = makeCanvas(size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = rgb(MID);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    const x = hash(i * 1.3) * size;
    const y = hash(i * 2.7) * size;
    const t = hash(i * 3.9);
    const tone = t < 0.5 ? mix(SHADE, MID, t * 2) : mix(MID, LIGHT, (t - 0.5) * 2);
    dab(ctx, x, y, 5 + hash(i * 5.3) * 12, tone, 0.35);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 220; i += 1) {
    const x = hash(i * 6.1) * size;
    const y = hash(i * 7.7) * size;
    const tone = hash(i * 8.3) < 0.5 ? SHADE : LIGHT;
    ctx.strokeStyle = rgb(tone, 0.18);
    ctx.lineWidth = 2 + hash(i * 9.1) * 3;
    const a = -0.6 + hash(i * 10.3) * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4, y - 3, x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    ctx.stroke();
  }
  // Зерно: каждый пиксель чуть светлее или темнее.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (hash(i * 0.37) - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function makeTexturedSprite(seed, texture) {
  const canvas = makeCanvas();
  if (!canvas || !texture) return null;
  const ctx = canvas.getContext('2d');
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE * R_SHARE;
  baseClump(ctx, seed, cx, cy, r);
  ctx.save();
  cloudPath(ctx, seed, cx, cy, r);
  ctx.clip();
  ctx.drawImage(texture, -hash(seed) * 60, -hash(seed + 1) * 60);
  shadeClump(ctx, cx, cy, r, 0.9);
  ctx.restore();
  return canvas;
}

export class LeafClumpSprites {
  constructor(style) {
    this.style = style;
    this.sprites = [];
    if (style === 'soft') {
      for (let i = 0; i < VARIANTS; i += 1) this.sprites.push(makeSoftSprite(i * 31 + 7));
    } else if (style === 'textured') {
      const texture = makePaintTexture();
      for (let i = 0; i < VARIANTS; i += 1) this.sprites.push(makeTexturedSprite(i * 31 + 7, texture));
    }
    this.sprites = this.sprites.filter(Boolean);
  }

  ready() {
    return this.sprites.length > 0;
  }

  // Клочок радиуса r с центром (x, y): спрайт выбирается по seed, чтобы не мигал.
  draw(ctx, x, y, r, seed) {
    const sprite = this.sprites[Math.floor(seed) % this.sprites.length];
    // Клочок чуть крупнее плоского: на референсе листва — крупные «облака».
    const size = (r / R_SHARE) * 1.2;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  }
}
