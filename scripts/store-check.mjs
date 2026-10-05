// Проверка материалов для карточки игры в консоли Яндекс Игр по правилам Яндекса (сверено 2026-10-05):
//  - тексты в docs/store/listing.md: длины полей, заглавная буква, запрещённые слова, число тегов;
//  - картинки: иконка 512×512 PNG, обложка 800×470 PNG, заглавная 1560×520, скриншоты 9:16 или 16:9 длинной
//    стороной 1280–2560, JPEG или 24-битный PNG;
//  - видео release/video/*.mp4: 16:9, высота от 400, до 28 секунд, до 100 МБ, длительность записана в файле.
// Чего нет (иконки, обложки, видео), печатается как «осталось сделать» и ошибкой не считается; то, что есть,
// должно подходить. Запуск: node scripts/store-check.mjs (входит в npm run check) или npm run store:check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mp4Info } from './store-capture/mp4-info.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Лимиты полей карточки (знаки с пробелами и знаками препинания).
export const LIMITS = {
  name: { max: 50 },
  short: { max: 70 },
  description: { min: 100, max: 1000 },
  howto: { min: 100, max: 1000 },
  seo: { min: 50, max: 160 },
  comment: { max: 2048 },
  tags: { max: 20 }
};
const REQUIRED_FIELDS = ['name', 'short', 'description', 'howto'];
const BANNED = {
  // \b в JavaScript понимает только латиницу, поэтому границы русских слов заданы через \p{L}.
  ru: /(?<![\p{L}])(?:бесплатн|лучш|топ(?![\p{L}]))/iu,
  en: /\bfree\b|\bbest\b|\btop\b|in english/i
};
const startsWithCapital = (text) => /^[\p{Lu}\d«"]/u.test(text.trim());
const isAllCaps = (text) => {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length > 1 && letters === letters.toUpperCase();
};

// Разбирает listing.md: { ru: { name, short, ... }, en: {...} }. Поле — заголовок «### [ключ] ...» и блок в ```.
export function parseListing(markdown) {
  const result = {};
  let lang = null;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const language = /^## (RU|EN)\b/.exec(lines[i]);
    if (language) { lang = language[1].toLowerCase(); result[lang] = result[lang] || {}; continue; }
    const field = /^### \[(\w+)\]/.exec(lines[i]);
    if (!field || !lang) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('```')) j += 1;
    const body = [];
    for (j += 1; j < lines.length && !lines[j].startsWith('```'); j += 1) body.push(lines[j]);
    result[lang][field[1]] = body.join('\n').trim();
  }
  return result;
}

// Проблемы текстов карточки: список строк (пусто — всё хорошо).
export function checkListing(listing) {
  const problems = [];
  for (const lang of ['ru', 'en']) {
    const fields = listing[lang];
    if (!fields) { problems.push(`${lang}: нет раздела языка`); continue; }
    for (const key of REQUIRED_FIELDS) if (!fields[key]) problems.push(`${lang}: нет поля ${key}`);
    for (const [key, limit] of Object.entries(LIMITS)) {
      const text = fields[key];
      if (!text) continue;
      const length = key === 'tags' ? text.split(',').map((tag) => tag.trim()).filter(Boolean).length : [...text].length;
      if (limit.max !== undefined && length > limit.max) problems.push(`${lang}.${key}: ${length} > ${limit.max}`);
      if (limit.min !== undefined && length < limit.min) problems.push(`${lang}.${key}: ${length} < ${limit.min}`);
    }
    const { name, short, seo } = fields;
    if (name && !startsWithCapital(name)) problems.push(`${lang}.name: должно начинаться с заглавной буквы`);
    if (name && isAllCaps(name)) problems.push(`${lang}.name: нельзя писать только заглавными`);
    if (short && !startsWithCapital(short)) problems.push(`${lang}.short: должно начинаться с заглавной буквы`);
    if (short && name && short.toLowerCase().includes(name.toLowerCase())) problems.push(`${lang}.short: не должно повторять название`);
    if (seo && !/[.!?…]$/.test(seo)) problems.push(`${lang}.seo: должно заканчиваться знаком препинания`);
    for (const key of ['name', 'short']) {
      if (fields[key] && BANNED[lang].test(fields[key])) problems.push(`${lang}.${key}: запрещённое слово («бесплатно», «лучшая», «топ», free, best, top)`);
    }
  }
  if (listing.ru && listing.en && listing.ru.name && listing.ru.name === listing.en.name) problems.push('названия на двух языках не должны совпадать буква в букву (каталог требует уникальных)');
  return problems;
}

// Размеры и тип картинки по заголовку файла: { format, width, height, bits24 } или null.
export function imageInfo(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    const bitDepth = buf[24];
    const colorType = buf[25];
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bits24: bitDepth === 8 && colorType === 2 };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < buf.length) {
      if (buf[pos] !== 0xff) { pos += 1; continue; }
      const marker = buf[pos + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { pos += marker === 0xff ? 1 : 2; continue; }
      const length = buf.readUInt16BE(pos + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', width: buf.readUInt16BE(pos + 7), height: buf.readUInt16BE(pos + 5), bits24: buf[pos + 9] === 3 };
      }
      pos += 2 + length;
    }
  }
  return null;
}

const near = (a, b, tolerance = 0.01) => Math.abs(a - b) / b <= tolerance;

// Проверка картинки по роли: 'icon' | 'cover' | 'hero' | 'shot-phone' | 'shot-desktop'.
export function checkImage(role, name, buf) {
  const info = imageInfo(buf);
  if (!info) return [`${name}: не удалось прочитать как JPEG или PNG`];
  const problems = [];
  const { width, height } = info;
  if (role === 'icon') {
    if (info.format !== 'png') problems.push(`${name}: иконка должна быть PNG`);
    if (width !== 512 || height !== 512) problems.push(`${name}: иконка 512×512, а тут ${width}×${height}`);
  } else if (role === 'cover') {
    if (info.format !== 'png') problems.push(`${name}: обложка должна быть PNG`);
    if (width !== 800 || height !== 470) problems.push(`${name}: обложка 800×470, а тут ${width}×${height}`);
  } else if (role === 'hero') {
    if (width !== 1560 || height !== 520) problems.push(`${name}: заглавная картинка 1560×520, а тут ${width}×${height}`);
  } else {
    const portrait = role === 'shot-phone';
    const ratio = portrait ? 9 / 16 : 16 / 9;
    if (!near(width / height, ratio)) problems.push(`${name}: пропорции ${portrait ? '9:16' : '16:9'} нужны, а тут ${width}×${height}`);
    const long = Math.max(width, height);
    if (long < 1280 || long > 2560) problems.push(`${name}: длинная сторона ${long} не в пределах 1280–2560`);
    if (info.format === 'png' && !info.bits24) problems.push(`${name}: PNG должен быть 24-битным (RGB без прозрачности)`);
  }
  return problems;
}

// Проверка видео по заголовкам MP4 и размеру файла.
export function checkVideo(name, buf) {
  const info = mp4Info(buf);
  const problems = [];
  if (!info.hasMoov) return [`${name}: не похоже на MP4 (нет moov)`];
  if (info.codec !== 'avc1') problems.push(`${name}: нужен H.264 (avc1), а тут ${info.codec}`);
  if (!(info.duration > 0)) problems.push(`${name}: длительность в файле не записана (перепакуйте remux-mp4.mjs)`);
  if (info.duration > 28) problems.push(`${name}: ${info.duration.toFixed(1)} с, а можно до 28`);
  if (info.height < 400) problems.push(`${name}: высота ${info.height}, нужно от 400`);
  if (!near(info.width / info.height, 16 / 9)) problems.push(`${name}: нужны пропорции 16:9, а тут ${info.width}×${info.height}`);
  if (buf.length > 100 * 1024 * 1024) problems.push(`${name}: ${(buf.length / 1048576).toFixed(0)} МБ, а можно до 100`);
  if (info.fragmented) problems.push(`${name}: фрагментный MP4 (перепакуйте remux-mp4.mjs в обычный)`);
  return problems;
}

// Собирает проверки по реальным файлам репозитория. Возвращает { problems, todo, ok }.
export function checkRepository(base = root) {
  const problems = [];
  const todo = [];
  const ok = [];
  const listingFile = path.join(base, 'docs/store/listing.md');
  if (fs.existsSync(listingFile)) {
    const listing = parseListing(fs.readFileSync(listingFile, 'utf8'));
    const found = checkListing(listing);
    problems.push(...found);
    if (!found.length) ok.push('тексты карточки (RU и EN) укладываются в лимиты');
  } else {
    problems.push('нет docs/store/listing.md');
  }

  const storeDir = path.join(base, 'docs/store');
  const covers = fs.existsSync(storeDir) ? fs.readdirSync(storeDir).filter((f) => /^cover-800x470.*.png$/.test(f)).sort() : [];
  const singles = [['icon', 'docs/store/icon-512.png', 'иконка 512×512 PNG'], ...covers.map((f) => ['cover', `docs/store/${f}`, 'обложка 800×470 PNG'])];
  if (!covers.length) todo.push('docs/store/cover-800x470*.png: обложка 800×470 PNG (собирается scripts/store-capture/art.js)');
  for (const [role, file, what] of singles) {
    const full = path.join(base, file);
    if (!fs.existsSync(full)) { todo.push(`${file}: ${what} (собирается scripts/store-capture/art.js)`); continue; }
    const found = checkImage(role, file, fs.readFileSync(full));
    problems.push(...found);
    if (!found.length) ok.push(`${file} подходит`);
  }
  for (const ext of ['png', 'jpg']) {
    const hero = path.join(base, `docs/store/hero-1560x520.${ext}`);
    if (fs.existsSync(hero)) {
      const found = checkImage('hero', `docs/store/hero-1560x520.${ext}`, fs.readFileSync(hero));
      problems.push(...found);
      if (!found.length) ok.push(`hero-1560x520.${ext} подходит`);
    }
  }

  const shotsDir = path.join(base, 'docs/store/screenshots');
  const count = { phone: { ru: 0, en: 0 }, desktop: { ru: 0, en: 0 } };
  if (fs.existsSync(shotsDir)) {
    for (const file of fs.readdirSync(shotsDir).sort()) {
      const match = /^(ru|en)-(phone|desktop)-.+\.(jpg|png)$/.exec(file);
      if (!match) continue;
      const found = checkImage(match[2] === 'phone' ? 'shot-phone' : 'shot-desktop', `docs/store/screenshots/${file}`, fs.readFileSync(path.join(shotsDir, file)));
      problems.push(...found);
      if (!found.length) count[match[2]][match[1]] += 1;
    }
  }
  for (const kind of ['phone', 'desktop']) {
    for (const lang of ['ru', 'en']) {
      if (count[kind][lang] < 2) problems.push(`скриншотов ${kind} на языке ${lang} меньше двух (годных: ${count[kind][lang]})`);
    }
  }
  ok.push(`годных скриншотов: телефон ru ${count.phone.ru} / en ${count.phone.en}, компьютер ru ${count.desktop.ru} / en ${count.desktop.en}`);

  const videoDir = path.join(base, 'release/video');
  for (const lang of ['ru', 'en']) {
    const file = path.join(videoDir, `${lang}-video-horizontal.mp4`);
    if (!fs.existsSync(file)) { todo.push(`release/video/${lang}-video-horizontal.mp4: горизонтальное видео обязательно (см. scripts/store-capture/README.md)`); continue; }
    const found = checkVideo(`release/video/${lang}-video-horizontal.mp4`, fs.readFileSync(file));
    problems.push(...found);
    if (!found.length) ok.push(`${lang}-video-horizontal.mp4 подходит`);
  }

  const zip = path.join(base, 'release/one-more-run.zip');
  if (!fs.existsSync(zip)) todo.push('release/one-more-run.zip: архив для консоли (npm run pack)');
  else ok.push('release/one-more-run.zip есть (его содержимое проверяет npm run pack)');
  return { problems, todo, ok };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, todo, ok } = checkRepository();
  for (const line of ok) console.log(`OK  ${line}`);
  for (const line of todo) console.log(`TODO ${line}`);
  for (const line of problems) console.log(`FAIL ${line}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s) in the store materials`);
    process.exitCode = 1;
  } else {
    console.log('\nAll store material checks passed');
  }
}
