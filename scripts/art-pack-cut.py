"""Вырезает фон у картинок из генератора и режет лист на отдельные предметы.

Картинка (или лист) должна быть на однотонном фоне (мы просим #FF00FF).
Что делает скрипт:
  1. Находит фон: пиксели цвета фона, связанные с краем картинки, и крупные просветы
     внутри предмета (между стволом и кроной). Розовые цветы остаются целыми,
     хотя их цвет близок к фону.
  2. Чуть съедает край (--erode), чтобы убрать лиловую кайму от JPG.
  3. Если на листе несколько предметов, режет их на отдельные файлы.
  4. Уменьшает каждый предмет до --size пикселей по длинной стороне.

Пример:
  python scripts/art-pack-cut.py assets/art-pack/_raw/hedge-sheet-01.jpg \
      assets/art-pack/hedge hedge --keep 1,4,5,6,7,8,9 --size 256 \
      --preview docs/reference/progress/art-pack/hedge-contact.png

Нужны Python 3 и Pillow (pip install pillow). Только для разработки, в игру не входит.
"""
import argparse
import math
import os
import sys
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src')
    p.add_argument('out_dir')
    p.add_argument('prefix')
    p.add_argument('--keep', default='', help='номера предметов через запятую (по порядку слева направо, сверху вниз); по умолчанию все')
    p.add_argument('--size', type=int, default=256, help='длинная сторона результата, px')
    p.add_argument('--erode', type=int, default=2, help='на сколько px съесть край (убирает лиловую кайму)')
    p.add_argument('--bg-tolerance', type=float, default=48.0, help='насколько цвет может отличаться от фона, чтобы считаться фоном')
    p.add_argument('--despill', action='store_true', help='убрать лиловую кайму у тонких предметов (лозы, трава, листья)')
    p.add_argument('--preview', default='', help='куда сохранить контактный лист (предметы на песке)')
    p.add_argument('--start', type=int, default=1, help='с какого номера называть файлы')
    return p.parse_args()


def find_background(px, w, h):
    pts = [(4, 4), (w - 5, 4), (4, h - 5), (w - 5, h - 5), (w // 2, 4), (4, h // 2), (w - 5, h // 2), (w // 2, h - 5)]
    samples = [px[p] for p in pts]
    return tuple(sorted(c[i] for c in samples)[len(samples) // 2] for i in range(3))


def cut_background(im, tol, erode, despill=False):
    """Возвращает RGBA-картинку: фон прозрачный, край без каймы."""
    w, h = im.size
    px = im.load()
    bg = find_background(px, w, h)

    def dist(c):
        return math.sqrt((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2)

    is_bg = bytearray(w * h)
    seen = bytearray(w * h)
    dq = deque()
    border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    for x, y in border:
        i = y * w + x
        if not seen[i] and dist(px[x, y]) < tol:
            seen[i] = 1
            dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        is_bg[y * w + x] = 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not seen[j] and dist(px[nx, ny]) < tol:
                    seen[j] = 1
                    dq.append((nx, ny))

    # Просветы внутри предмета (между стволом и кроной): фон, окружённый листвой.
    # Берём только крупные, чтобы не задеть светлые блики и цветы.
    POCKET_MIN = 40
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if seen[i0] or dist(px[x0, y0]) >= tol:
                continue
            seen[i0] = 1
            pocket = [(x0, y0)]
            k = 0
            while k < len(pocket):
                x, y = pocket[k]
                k += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and dist(px[nx, ny]) < tol:
                            seen[j] = 1
                            pocket.append((nx, ny))
            if len(pocket) >= POCKET_MIN:
                for x, y in pocket:
                    is_bg[y * w + x] = 1

    # Остатки фона в узких щелях: сочный пурпур, которого нет ни в листве, ни в коре.
    # Розовые цветы светлее (зелёного в них больше), поэтому под это правило не попадают.
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not is_bg[i]:
                r, g, b = px[x, y]
                if r > 140 and b > 120 and g < 0.5 * min(r, b):
                    is_bg[i] = 1

    bg_img = Image.frombytes('L', (w, h), bytes(v * 255 for v in is_bg))
    zone = bg_img.filter(ImageFilter.MaxFilter(5))  # пиксели в 2 px от фона
    zp, bp = zone.load(), bg_img.load()
    out = Image.new('RGBA', (w, h))
    po = out.load()
    for y in range(h):
        for x in range(w):
            if bp[x, y]:
                po[x, y] = (0, 0, 0, 0)
                continue
            r, g, b = px[x, y]
            if zp[x, y]:
                a = (dist((r, g, b)) - 20) / 40.0
                a = 0.0 if a < 0 else (1.0 if a > 1 else a)
                if a <= 0:
                    po[x, y] = (0, 0, 0, 0)
                    continue
                if a < 1.0:
                    r, g, b = (max(0, min(255, int(v))) for v in (
                        (r - (1 - a) * bg[0]) / a, (g - (1 - a) * bg[1]) / a, (b - (1 - a) * bg[2]) / a))
                po[x, y] = (r, g, b, int(a * 255))
            else:
                po[x, y] = (r, g, b, 255)

    if despill:
        # Возле фона (в 3 px) пиксели, в которых слишком много пурпура, убираем; слабый пурпур гасим.
        near = bg_img.filter(ImageFilter.MaxFilter(7)).load()
        for y in range(h):
            for x in range(w):
                if near[x, y]:
                    r, g, b, a = po[x, y]
                    if a == 0:
                        continue
                    m = min(r, b) - g
                    if m > 25:
                        po[x, y] = (r, g, b, 0)
                    elif m > 0:
                        po[x, y] = (max(0, r - m), g, max(0, b - m), a)

    if erode > 0:
        alpha = out.getchannel('A').filter(ImageFilter.MinFilter(erode * 2 + 1))
        out.putalpha(alpha)
    return out


def split_components(img, min_area=500):
    """Находит отдельные предметы. Возвращает список (метка, x1, y1, x2, y2) на уменьшенной сетке и саму сетку."""
    s = 4
    w, h = img.size
    solid = img.getchannel('A').point(lambda v: 255 if v > 30 else 0)
    small = solid.resize((w // s, h // s), Image.BILINEAR).point(lambda v: 255 if v > 60 else 0).filter(ImageFilter.MaxFilter(3))
    sw, sh = small.size
    sp = small.load()
    label = [[0] * sw for _ in range(sh)]
    comps = []
    n = 0
    for y0 in range(sh):
        for x0 in range(sw):
            if sp[x0, y0] and not label[y0][x0]:
                n += 1
                stack = [(x0, y0)]
                label[y0][x0] = n
                mnx = mxx = x0
                mny = mxy = y0
                area = 0
                while stack:
                    x, y = stack.pop()
                    area += 1
                    mnx, mxx, mny, mxy = min(mnx, x), max(mxx, x), min(mny, y), max(mxy, y)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < sw and 0 <= ny < sh and sp[nx, ny] and not label[ny][nx]:
                            label[ny][nx] = n
                            stack.append((nx, ny))
                comps.append((n, area, mnx, mny, mxx, mxy))
    comps = [c for c in comps if c[1] > min_area]
    comps.sort(key=lambda c: (round(c[3] / 60), c[2]))  # порядок чтения
    return comps, label, (sw, sh)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')  # русский текст в консоли Windows
    args = parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    im = Image.open(args.src).convert('RGB')
    w, h = im.size
    cut = cut_background(im, args.bg_tolerance, args.erode, args.despill)
    comps, label, (sw, sh) = split_components(cut)
    keep = [int(v) for v in args.keep.split(',') if v.strip()] or list(range(1, len(comps) + 1))
    print(f'найдено предметов: {len(comps)}, берём: {keep}')

    files = []
    number = args.start
    for idx in keep:
        if idx < 1 or idx > len(comps):
            print(f'  пропуск {idx}: такого предмета нет')
            continue
        lab, _area, x1, y1, x2, y2 = comps[idx - 1]
        m = Image.new('L', (sw, sh), 0)
        mp = m.load()
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                if label[y][x] == lab:
                    mp[x, y] = 255
        m = m.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.NEAREST)
        c = cut.copy()
        c.putalpha(ImageChops.multiply(c.getchannel('A'), m))
        bbox = c.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
        c = c.crop(bbox)
        k = args.size / max(c.size)
        c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
        path = os.path.join(args.out_dir, f'{args.prefix}-{number:02d}.png')
        c.save(path, optimize=True)
        files.append(path)
        print(f'  {path}  {c.size[0]}x{c.size[1]}  {os.path.getsize(path) // 1024} КБ')
        number += 1

    if args.preview and files:
        cell = args.size + 40
        cols = 4
        rows = (len(files) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * cell, rows * cell), (247, 220, 160))
        for i, f in enumerate(files):
            c = Image.open(f)
            sheet.paste(c, ((i % cols) * cell + (cell - c.width) // 2, (i // cols) * cell + (cell - c.height) // 2), c)
            ImageDraw.Draw(sheet).text(((i % cols) * cell + 6, (i // cols) * cell + 4), os.path.basename(f), fill=(60, 40, 30))
        os.makedirs(os.path.dirname(args.preview) or '.', exist_ok=True)
        sheet.save(args.preview)
        print('превью:', args.preview)


if __name__ == '__main__':
    main()
