// Нарисованные картинки из assets/art-pack/ (Фаза 1г).
// Каждая картинка грузится ОДИН раз. После загрузки для неё готовятся уменьшенные
// копии (1, 1/2, 1/4, 1/8) и зеркальная копия — в кадре рисуется ближайшая по размеру,
// поэтому мелкие дальние клочки не «сыпятся» и не тормозят.
// Пока картинка не загрузилась (или её нет), вызывающий код рисует кодовый вариант.

// Каждый путь написан целиком: так Vite кладёт в сборку только эти файлы.
// (Путь из шаблона `${...}` затянул бы в сборку всю папку, включая _raw/.)
const FILES = {
  'hedge-01': new URL('../../assets/art-pack/hedge/hedge-01.png', import.meta.url).href,
  'hedge-02': new URL('../../assets/art-pack/hedge/hedge-02.png', import.meta.url).href,
  'hedge-03': new URL('../../assets/art-pack/hedge/hedge-03.png', import.meta.url).href,
  'hedge-04': new URL('../../assets/art-pack/hedge/hedge-04.png', import.meta.url).href,
  'hedge-05': new URL('../../assets/art-pack/hedge/hedge-05.png', import.meta.url).href,
  'hedge-06': new URL('../../assets/art-pack/hedge/hedge-06.png', import.meta.url).href,
  'hedge-07': new URL('../../assets/art-pack/hedge/hedge-07.png', import.meta.url).href,
  'hedge-08': new URL('../../assets/art-pack/hedge/hedge-08.png', import.meta.url).href,
  'hedge-09': new URL('../../assets/art-pack/hedge/hedge-09.png', import.meta.url).href,
  'hedge-10': new URL('../../assets/art-pack/hedge/hedge-10.png', import.meta.url).href,
  'hedge-11': new URL('../../assets/art-pack/hedge/hedge-11.png', import.meta.url).href,
  'hedge-12': new URL('../../assets/art-pack/hedge/hedge-12.png', import.meta.url).href,
  'hedge-13': new URL('../../assets/art-pack/hedge/hedge-13.png', import.meta.url).href,
  'hedge-14': new URL('../../assets/art-pack/hedge/hedge-14.png', import.meta.url).href,
  'hedge-15': new URL('../../assets/art-pack/hedge/hedge-15.png', import.meta.url).href,
  'hedge-16': new URL('../../assets/art-pack/hedge/hedge-16.png', import.meta.url).href,
  'tree-01': new URL('../../assets/art-pack/trees/tree-01.png', import.meta.url).href,
  'tree-02': new URL('../../assets/art-pack/trees/tree-02.png', import.meta.url).href,
  'tree-03': new URL('../../assets/art-pack/trees/tree-03.png', import.meta.url).href,
  'tree-04': new URL('../../assets/art-pack/trees/tree-04.png', import.meta.url).href
};

// Где ствол касается земли (доля ширины), из assets/art-pack/trees/anchors.json.
export const TREE_BASE_X = { 'tree-01': 0.526, 'tree-02': 0.513, 'tree-03': 0.508, 'tree-04': 0.514 };

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

// Уменьшаем по шагам в 2 раза — так картинка остаётся чёткой, без «лесенки».
function buildLevels(source, mirror) {
  const levels = [];
  let prev = makeCanvas(source.naturalWidth, source.naturalHeight);
  const ctx = prev.getContext('2d');
  if (mirror) {
    ctx.translate(prev.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0);
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
        this.sprites[name] = { aspect, levels: [buildLevels(image, false), buildLevels(image, true)] };
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
