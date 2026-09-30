// Нарисованные картинки из assets/art-pack/ (Фаза 1г).
// Каждая картинка грузится ОДИН раз. После загрузки для неё готовятся уменьшенные
// копии (1, 1/2, 1/4, 1/8) и зеркальная копия — в кадре рисуется ближайшая по размеру,
// поэтому мелкие дальние клочки не «сыпятся» и не тормозят.
// Пока картинка не загрузилась (или её нет), вызывающий код рисует кодовый вариант.

// Каждый путь написан целиком: так Vite кладёт в сборку только эти файлы.
// (Путь из шаблона `${...}` затянул бы в сборку всю папку, включая _raw/.)
const FILES = {
  'hedge-08': new URL('../../assets/art-pack/hedge/hedge-08.png', import.meta.url).href,
  'hedge-09': new URL('../../assets/art-pack/hedge/hedge-09.png', import.meta.url).href,
  'hedge-10': new URL('../../assets/art-pack/hedge/hedge-10.png', import.meta.url).href,
  'hedge-11': new URL('../../assets/art-pack/hedge/hedge-11.png', import.meta.url).href,
  'hedge-12': new URL('../../assets/art-pack/hedge/hedge-12.png', import.meta.url).href,
  'hedge-13': new URL('../../assets/art-pack/hedge/hedge-13.png', import.meta.url).href,
  'hedge-14': new URL('../../assets/art-pack/hedge/hedge-14.png', import.meta.url).href,
  'hedge-15': new URL('../../assets/art-pack/hedge/hedge-15.png', import.meta.url).href,
  'hedge-16': new URL('../../assets/art-pack/hedge/hedge-16.png', import.meta.url).href,
  'planter-01': new URL('../../assets/art-pack/planters/planter-01.png', import.meta.url).href,
  'planter-02': new URL('../../assets/art-pack/planters/planter-02.png', import.meta.url).href,
  'planter-03': new URL('../../assets/art-pack/planters/planter-03.png', import.meta.url).href,
  'planter-04': new URL('../../assets/art-pack/planters/planter-04.png', import.meta.url).href,
  'gate-01': new URL('../../assets/art-pack/gates/gate-01.png', import.meta.url).href,
  'gate-02': new URL('../../assets/art-pack/gates/gate-02.png', import.meta.url).href,
  'gate-03': new URL('../../assets/art-pack/gates/gate-03.png', import.meta.url).href,
  'bush-01': new URL('../../assets/art-pack/props/bush-01.png', import.meta.url).href,
  'bush-02': new URL('../../assets/art-pack/props/bush-02.png', import.meta.url).href,
  'bush-03': new URL('../../assets/art-pack/props/bush-03.png', import.meta.url).href,
  'bush-04': new URL('../../assets/art-pack/props/bush-04.png', import.meta.url).href,
  'arch-01': new URL('../../assets/art-pack/arch/arch-01.png', import.meta.url).href,
  'sky-strip': new URL('../../assets/art-pack/sky/sky-strip.jpg', import.meta.url).href,
  'rock-01': new URL('../../assets/art-pack/props/rock-01.png', import.meta.url).href,
  'rock-02': new URL('../../assets/art-pack/props/rock-02.png', import.meta.url).href,
  'rock-03': new URL('../../assets/art-pack/props/rock-03.png', import.meta.url).href,
  'fence-01': new URL('../../assets/art-pack/props/fence-01.png', import.meta.url).href,
  'fence-02': new URL('../../assets/art-pack/props/fence-02.png', import.meta.url).href,
  'grass-01': new URL('../../assets/art-pack/props/grass-01.png', import.meta.url).href,
  'tree-01': new URL('../../assets/art-pack/trees/tree-01.png', import.meta.url).href,
  'tree-02': new URL('../../assets/art-pack/trees/tree-02.png', import.meta.url).href,
  'tree-03': new URL('../../assets/art-pack/trees/tree-03.png', import.meta.url).href,
  'tree-04': new URL('../../assets/art-pack/trees/tree-04.png', import.meta.url).href
};

// Где ствол касается земли (доля ширины), из assets/art-pack/trees/anchors.json.
export const TREE_BASE_X = { 'tree-01': 0.526, 'tree-02': 0.513, 'tree-03': 0.508, 'tree-04': 0.514 };

// Подсветка при подготовке копий (один раз): ворота и арка на картинках темнее референса.
const BRIGHTEN = { 'gate-01': 1.12, 'gate-02': 1.12, 'gate-03': 1.12, 'arch-01': 1.12 };

function brighten(canvas, k) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * k);
    d[i + 1] = Math.min(255, d[i + 1] * k);
    d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  ctx.putImageData(img, 0, 0);
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

// Уменьшаем по шагам в 2 раза — так картинка остаётся чёткой, без «лесенки».
function buildLevels(source, mirror, gain) {
  const levels = [];
  let prev = makeCanvas(source.naturalWidth, source.naturalHeight);
  const ctx = prev.getContext('2d');
  if (mirror) {
    ctx.translate(prev.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0);
  if (gain) brighten(prev, gain);
  levels.push(prev);
  while (levels.length < 4 && prev.width > 24) {
    const next = makeCanvas(prev.width / 2, prev.height / 2);
    const nctx = next.getContext('2d');
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(prev, 0, 0, next.width, next.height);
    levels.push(next);
    prev = next;
  }
  return levels;
}

export class ArtPack {
  constructor(onReady) {
    this.sprites = {};
    if (typeof Image !== 'function' || typeof document === 'undefined') return;
    for (const [name, src] of Object.entries(FILES)) {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        const aspect = image.naturalHeight / Math.max(1, image.naturalWidth);
        this.sprites[name] = { aspect, levels: [buildLevels(image, false, BRIGHTEN[name]), buildLevels(image, true, BRIGHTEN[name])] };
        if (onReady) onReady();
      };
      image.src = src;
    }
  }

  has(name) {
    return !!this.sprites[name];
  }

  // Все ли картинки группы готовы (чтобы не смешивать кодовые и нарисованные).
  hasAll(names) {
    for (const name of names) if (!this.sprites[name]) return false;
    return true;
  }

  // Картинка в полном размере (для неба, которое рисуется один раз в свой кэш).
  full(name, flip = false) {
    return this.sprites[name]?.levels[flip ? 1 : 0][0] || null;
  }

  aspect(name) {
    return this.sprites[name]?.aspect ?? 1;
  }

  // Левый верхний угол (x, y), ширина w; flip — отражение по горизонтали.
  draw(ctx, name, x, y, w, flip = false) {
    const sprite = this.sprites[name];
    if (!sprite) return false;
    const levels = sprite.levels[flip ? 1 : 0];
    let level = levels[0];
    for (let i = levels.length - 1; i >= 0; i -= 1) {
      if (levels[i].width >= w) {
        level = levels[i];
        break;
      }
    }
    ctx.drawImage(level, x, y, w, w * sprite.aspect);
    return true;
  }
}
