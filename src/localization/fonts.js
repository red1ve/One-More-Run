// Русские буквы для игры. В Fredoka кириллицы нет, поэтому для кириллицы
// подключаем M PLUS Rounded 1c — такой же округлый шрифт. Только кириллическую
// часть (≈16 КБ), без японской. Его начертания легче Fredoka, поэтому берём
// на ступень плотнее: 500/600 → файл 700, 700 → файл 800.
import rounded700 from '@fontsource/m-plus-rounded-1c/files/m-plus-rounded-1c-cyrillic-700-normal.woff2';
import rounded800 from '@fontsource/m-plus-rounded-1c/files/m-plus-rounded-1c-cyrillic-800-normal.woff2';

export const CYRILLIC_FONT = 'OMR Cyrillic';
const CYRILLIC_RANGE = 'U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';

// Загружает шрифт; промис выполняется, когда буквы готовы (или сразу, если браузер не умеет).
export function loadCyrillicFont() {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return Promise.resolve(false);
  }
  const faces = [
    ['500', rounded700],
    ['600', rounded700],
    ['700', rounded800]
  ].map(([weight, url]) => new FontFace(CYRILLIC_FONT, `url(${url}) format('woff2')`, {
    weight,
    unicodeRange: CYRILLIC_RANGE,
    display: 'swap'
  }));
  return Promise.all(faces.map((face) => face.load().then((loaded) => {
    document.fonts.add(loaded);
  }))).then(() => true).catch(() => false);
}
