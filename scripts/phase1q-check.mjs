// Фаза 1р: подготовка публикации (шаг 7).
//  (а) архив для консоли: запись и чтение ZIP, CRC, порядок и имена файлов, независимая проверка системным tar;
//  (б) тексты карточки: разбор listing.md и каждое правило Яндекса (лимиты, заглавная, запрещённые слова);
//  (в) картинки: иконка, обложка, скриншоты (пропорции, длинная сторона, 24-битный PNG);
//  (г) видео: длительность, 16:9, высота, кодек, «фрагментный» файл;
//  (д) настоящие материалы репозитория проходят проверку.
// Запуск: node scripts/phase1q-check.mjs (входит в npm run check).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkImage, checkListing, checkRepository, checkVideo, imageInfo, parseListing } from './store-check.mjs';
import { mp4Info } from './store-capture/mp4-info.mjs';
import { crc32, readZip, writeZip, zipNameProblems } from './zip-lib.mjs';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}
function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}
const has = (problems, text) => problems.some((p) => p.includes(text));

// ---- (а) архив

check('zip: what is written is read back byte for byte, in the same order, with forward slashes', () => {
  const random = crypto.randomBytes(5000);
  const big = Buffer.alloc(3 * 1024 * 1024, 'abc');
  const entries = [
    { name: 'index.html', data: Buffer.from('<!doctype html><title>x</title>'.repeat(50)) },
    { name: 'assets/a.js', data: big },
    { name: 'assets/img/random.bin', data: random },
    { name: 'assets/empty.txt', data: Buffer.alloc(0) },
    { name: 'assets/one.txt', data: Buffer.from('1') }
  ];
  const zip = writeZip(entries);
  const back = readZip(zip);
  assert(back.map((e) => e.name).join() === entries.map((e) => e.name).join(), 'names and order');
  back.forEach((e, i) => assert(e.data.equals(entries[i].data) && e.size === entries[i].data.length, `${e.name}: content differs`));
  assert(zip.length < big.length / 10, 'compressible data really is compressed');
  assert(back.every((e) => !e.name.includes('\\')), 'no backslashes');
  assert(writeZip(entries).equals(zip), 'the same input gives the same archive (fixed date)');
  assert(crc32(Buffer.from('123456789')) === 0xcbf43926, 'crc32 of the standard test string');
});

check('zip: the date is fixed, a changed byte or a wrong size is noticed even in stored (uncompressed) files', () => {
  const stored = crypto.randomBytes(2000); // случайные данные не сжимаются: лежат как есть
  const zip = writeZip([{ name: 'a.bin', data: stored }]);
  assert(zip.readUInt16LE(10) === 0 && zip.readUInt16LE(12) === (((2026 - 1980) << 9) | (1 << 5) | 1), 'the DOS time and date are the fixed 2026-01-01 00:00');
  assert(readZip(zip)[0].data.equals(stored), 'a stored file reads back');
  const flipped = Buffer.from(zip);
  flipped[30 + 5 + 100] ^= 0x01; // байт внутри данных
  let crcCaught = false;
  try { readZip(flipped); } catch (error) { crcCaught = /повреждён файл/.test(error.message); }
  assert(crcCaught, 'a changed byte in a stored file must be caught by the CRC');
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const wrongSize = Buffer.from(zip);
  wrongSize.writeUInt32LE(1999, central + 24);
  let sizeCaught = false;
  try { readZip(wrongSize); } catch (error) { sizeCaught = /повреждён файл/.test(error.message); }
  assert(sizeCaught, 'a wrong size in the directory must be caught');
});

check('zip: a damaged or foreign file is refused', () => {
  const zip = writeZip([{ name: 'index.html', data: Buffer.from('hello hello hello hello') }, { name: 'b.txt', data: Buffer.from('second file') }]);
  const bad = Buffer.from(zip);
  bad[40] ^= 0xff; // байт внутри данных первого файла
  let threw = false;
  try { readZip(bad); } catch { threw = true; }
  assert(threw, 'a flipped byte must be noticed (CRC)');
  for (const junk of [Buffer.from('not a zip at all'), Buffer.alloc(0), zip.subarray(0, 30)]) {
    let refused = false;
    try { readZip(junk); } catch { refused = true; }
    assert(refused, 'junk must be refused');
  }
});

check('zip: the system archiver (tar) reads the archive and lists the same names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omr-zip-'));
  try {
    const entries = [{ name: 'index.html', data: Buffer.from('<html></html>') }, { name: 'assets/x.js', data: Buffer.from('let a = 1;'.repeat(100)) }];
    const file = path.join(dir, 'test.zip');
    fs.writeFileSync(file, writeZip(entries));
    const run = spawnSync('tar', ['-tf', file], { encoding: 'utf8' });
    if (run.error || run.status !== 0) return; // нет tar с поддержкой zip: проверка пропускается
    const listed = run.stdout.split(/\r?\n/).filter(Boolean).sort().join();
    assert(listed === 'assets/x.js,index.html', `tar sees: ${listed}`);
    const out = path.join(dir, 'out');
    fs.mkdirSync(out);
    const extract = spawnSync('tar', ['-xf', file, '-C', out], { encoding: 'utf8' });
    assert(extract.status === 0, `tar could not extract: ${extract.stderr}`);
    assert(fs.readFileSync(path.join(out, 'assets/x.js'), 'utf8') === 'let a = 1;'.repeat(100), 'extracted content is right');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

check('zip names: index.html must be at the root; spaces, Cyrillic, backslashes and a dist/ folder are flagged', () => {
  assert(zipNameProblems(['index.html', 'assets/a-1.js']).length === 0, 'a good list');
  assert(has(zipNameProblems(['assets/a.js']), 'нет index.html'), 'no index.html');
  assert(has(zipNameProblems(['dist/index.html']), 'нет index.html'), 'index.html inside a folder is not at the root');
  assert(has(zipNameProblems(['index.html', 'dist/a.js']), 'лишняя папка'), 'a dist/ prefix');
  assert(has(zipNameProblems(['index.html', 'my file.js']), 'пробел'), 'a space');
  assert(has(zipNameProblems(['index.html', 'файл.js']), 'не латиница'), 'Cyrillic');
  assert(has(zipNameProblems(['index.html', 'assets\\a.js']), 'обратный слэш'), 'a backslash');
});

// ---- (б) тексты

const good = {
  ru: { name: 'Ещё забег', short: 'Кот бежит по саду: широко — надёжно, узко — больше очков', description: 'а'.repeat(300), howto: 'б'.repeat(300), seo: 'Аркада про кота. '.repeat(5).trim() + '.', tags: 'кот, аркада', comment: 'Версия 1.0.' },
  en: { name: 'One More Run', short: 'Guide a cat through a garden: wide is safe', description: 'a'.repeat(300), howto: 'b'.repeat(300), seo: 'An arcade runner about a cat. '.repeat(3).trim(), tags: 'cat, arcade', comment: 'Version 1.0.' }
};
const withField = (lang, key, value) => ({ ...good, [lang]: { ...good[lang], [key]: value } });

check('listing: a correct card passes; every limit is enforced on both sides, in both languages', () => {
  assert(checkListing(good).length === 0, JSON.stringify(checkListing(good)));
  // text(n): ровно n знаков, с заглавной буквы, не из одних заглавных; seoText(n) ещё и кончается точкой.
  const text = (n) => 'К' + 'о'.repeat(n - 1);
  const seoText = (n) => 'С' + 'о'.repeat(n - 2) + '.';
  const tagList = (n) => Array.from({ length: n }, (_, i) => `t${i}`).join(', ');
  const cases = [
    ['name', text(50), true], ['name', text(51), false],
    ['short', text(70), true], ['short', text(71), false],
    ['description', text(99), false], ['description', text(100), true], ['description', text(1000), true], ['description', text(1001), false],
    ['howto', text(99), false], ['howto', text(100), true], ['howto', text(1000), true], ['howto', text(1001), false],
    ['seo', seoText(49), false], ['seo', seoText(50), true], ['seo', seoText(160), true], ['seo', seoText(161), false],
    ['comment', text(2048), true], ['comment', text(2049), false],
    ['tags', tagList(20), true], ['tags', tagList(21), false]
  ];
  for (const lang of ['ru', 'en']) {
    for (const [key, value, okExpected] of cases) {
      const problems = checkListing(withField(lang, key, value));
      const limitProblem = problems.some((p) => p.startsWith(`${lang}.${key}:`) && /[<>]/.test(p));
      assert(limitProblem === !okExpected, `${lang}.${key} (${key === 'tags' ? value.split(',').length + ' tags' : [...value].length + ' characters'}): expected ${okExpected ? 'ok' : 'a limit problem'}, got ${JSON.stringify(problems)}`);
      if (okExpected) assert(problems.length === 0, `${lang}.${key}: a valid value must pass completely, got ${JSON.stringify(problems)}`);
    }
  }
  assert(has(checkListing(withField('ru', 'description', '')), 'нет поля description'), 'an empty required field is missing');
});

check('listing: capital letter, all caps, banned words, repeated name, seo ending, missing parts', () => {
  assert(has(checkListing(withField('ru', 'name', 'ещё забег')), 'заглавной'), 'lowercase name');
  assert(has(checkListing(withField('ru', 'name', 'ЕЩЁ ЗАБЕГ')), 'только заглавными'), 'ALL CAPS name');
  assert(has(checkListing(withField('en', 'name', 'ONE MORE RUN')), 'только заглавными'), 'ALL CAPS name in English');
  assert(has(checkListing(withField('ru', 'name', 'Лучшая игра')), 'запрещённое'), 'banned word «лучшая»');
  assert(has(checkListing(withField('ru', 'short', 'Играй бесплатно')), 'запрещённое'), 'banned word «бесплатно»');
  assert(has(checkListing(withField('en', 'short', 'Play for free now')), 'запрещённое'), 'banned word free');
  assert(has(checkListing(withField('en', 'name', 'Top Cat Run')), 'запрещённое'), 'banned word top');
  assert(has(checkListing(withField('en', 'short', 'one more run again')), 'повторять название'), 'short repeats the name');
  assert(has(checkListing(withField('ru', 'short', 'кот бежит')), 'заглавной'), 'short in lowercase');
  assert(has(checkListing(withField('en', 'seo', 'An arcade runner about a cat and a garden for everyone')), 'знаком препинания'), 'seo without a final mark');
  assert(has(checkListing({ ru: good.ru }), 'en: нет раздела'), 'a missing language');
  assert(has(checkListing(withField('ru', 'howto', '')), 'нет поля howto'), 'a missing required field');
  assert(has(checkListing(withField('en', 'name', good.ru.name)), 'не должны совпадать'), 'the same name in both languages');
});

check('listing: the markdown is parsed by its [key] headings and fenced blocks, in both languages', () => {
  const md = [
    '# Заголовок', '', '## RU (русский)', '', '### [name] Название', '', '```', 'Ещё забег', '```', '',
    '### [short] Краткое', '', '```', 'Первая строка', 'вторая строка', '```', '',
    '## EN (English)', '', '### [name] Name', '', '```', 'One More Run', '```', '', '## Остальное', '| a | b |'
  ].join('\r\n');
  const parsed = parseListing(md);
  assert(parsed.ru.name === 'Ещё забег' && parsed.ru.short === 'Первая строка\nвторая строка' && parsed.en.name === 'One More Run', JSON.stringify(parsed));
  assert(Object.keys(parsed).sort().join() === 'en,ru', 'only the two languages');
});

// ---- (в) картинки

const png = (width, height, colorType = 2, bitDepth = 8) => {
  const buf = Buffer.alloc(33);
  buf.writeUInt32BE(0x89504e47, 0); buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8); buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16); buf.writeUInt32BE(height, 20);
  buf[24] = bitDepth; buf[25] = colorType;
  return buf;
};
const jpeg = (width, height, components = 3) => {
  const buf = Buffer.alloc(40);
  buf[0] = 0xff; buf[1] = 0xd8;
  buf[2] = 0xff; buf[3] = 0xe0; buf.writeUInt16BE(16, 4); // APP0, чтобы разбор пропускал лишнее
  buf[20] = 0xff; buf[21] = 0xc0; buf.writeUInt16BE(17, 22); buf[24] = 8;
  buf.writeUInt16BE(height, 25); buf.writeUInt16BE(width, 27); buf[29] = components;
  return buf;
};

check('images: sizes and kinds are read from PNG and JPEG headers', () => {
  const p = imageInfo(png(512, 512));
  assert(p.format === 'png' && p.width === 512 && p.height === 512 && p.bits24 === true, JSON.stringify(p));
  assert(imageInfo(png(10, 10, 6)).bits24 === false, 'RGBA PNG is not 24-bit');
  assert(imageInfo(png(10, 10, 2, 16)).bits24 === false, '16-bit PNG is not 24-bit');
  const j = imageInfo(jpeg(1080, 1920));
  assert(j.format === 'jpeg' && j.width === 1080 && j.height === 1920 && j.bits24 === true, JSON.stringify(j));
  assert(imageInfo(jpeg(10, 10, 1)).bits24 === false, 'grey JPEG is not 24-bit');
  assert(imageInfo(Buffer.from('GIF89a....')) === null && imageInfo(Buffer.alloc(0)) === null, 'unknown data');
});

check('images: icon 512x512 PNG, cover 800x470 PNG, hero 1560x520', () => {
  assert(checkImage('icon', 'i', png(512, 512)).length === 0, 'icon ok');
  assert(has(checkImage('icon', 'i', png(511, 512)), '512×512') && has(checkImage('icon', 'i', png(1024, 1024)), '512×512'), 'icon size');
  assert(has(checkImage('icon', 'i', jpeg(512, 512)), 'PNG'), 'icon must be PNG');
  assert(checkImage('cover', 'c', png(800, 470)).length === 0, 'cover ok');
  assert(has(checkImage('cover', 'c', png(800, 480)), '800×470') && has(checkImage('cover', 'c', jpeg(800, 470)), 'PNG'), 'cover size and format');
  assert(checkImage('hero', 'h', png(1560, 520)).length === 0 && checkImage('hero', 'h', jpeg(1560, 520)).length === 0, 'hero ok in both formats');
  assert(has(checkImage('hero', 'h', png(1560, 521)), '1560×520'), 'hero size');
  assert(has(checkImage('icon', 'x', Buffer.from('nope')), 'не удалось прочитать'), 'unreadable');
});

check('images: screenshots 9:16 or 16:9, long side 1280-2560, 24-bit PNG or JPEG', () => {
  for (const [w, h] of [[1080, 1920], [720, 1280], [1440, 2560]]) assert(checkImage('shot-phone', 's', jpeg(w, h)).length === 0, `${w}x${h} phone`);
  for (const [w, h] of [[1920, 1080], [1280, 720], [2560, 1440]]) assert(checkImage('shot-desktop', 's', jpeg(w, h)).length === 0, `${w}x${h} desktop`);
  assert(has(checkImage('shot-phone', 's', jpeg(1080, 1080)), 'пропорции'), 'a square is not 9:16');
  assert(has(checkImage('shot-phone', 's', jpeg(1920, 1080)), 'пропорции'), 'a landscape is not a phone shot');
  assert(has(checkImage('shot-desktop', 's', jpeg(1080, 1920)), 'пропорции'), 'a portrait is not a desktop shot');
  assert(has(checkImage('shot-phone', 's', jpeg(540, 960)), 'длинная сторона'), '540x960 is too small');
  assert(has(checkImage('shot-desktop', 's', jpeg(3840, 2160)), 'длинная сторона'), '4K is too big');
  assert(has(checkImage('shot-phone', 's', png(1080, 1920, 6)), '24-битным'), 'RGBA PNG');
  assert(checkImage('shot-phone', 's', png(1080, 1920, 2)).length === 0, 'RGB PNG');
});

// ---- (г) видео

const box = (type, ...parts) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
function makeMp4({ seconds = 27, width = 1280, height = 720, codec = 'avc1', fragmented = false, bytes = 1000, timescale = 1000 } = {}) {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(timescale, 12); mvhd.writeUInt32BE(Math.round(seconds * timescale), 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(width * 65536, 76); tkhd.writeUInt32BE(height * 65536, 80);
  const entry = Buffer.alloc(16); entry.writeUInt32BE(16, 0); entry.write(codec, 4, 'latin1');
  const stsd = Buffer.concat([Buffer.alloc(4), Buffer.from([0, 0, 0, 1]), entry]);
  const stbl = box('stbl', box('stsd', stsd));
  const trak = box('trak', box('tkhd', tkhd), box('mdia', box('minf', stbl)));
  const moov = box('moov', box('mvhd', mvhd), trak, ...(fragmented ? [box('mvex', box('trex', Buffer.alloc(24)))] : []));
  return Buffer.concat([box('ftyp', Buffer.from([0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d])), moov, box('mdat', Buffer.alloc(bytes))]);
}

check('video: 16:9, from 400 px high, up to 28 s, H.264, a real duration, not fragmented, up to 100 MB', () => {
  assert(checkVideo('v', makeMp4()).length === 0, JSON.stringify(checkVideo('v', makeMp4())));
  assert(checkVideo('v', makeMp4({ seconds: 28 })).length === 0 && has(checkVideo('v', makeMp4({ seconds: 28.5 })), 'до 28'), '28 s is the limit');
  assert(has(checkVideo('v', makeMp4({ seconds: 0 })), 'длительность'), 'unknown duration');
  assert(has(checkVideo('v', makeMp4({ width: 640, height: 360 })), 'высота') && checkVideo('v', makeMp4({ width: 711, height: 400 })).length === 0, 'height from 400');
  assert(has(checkVideo('v', makeMp4({ width: 1280, height: 960 })), '16:9') && has(checkVideo('v', makeMp4({ width: 720, height: 1280 })), '16:9'), 'only 16:9');
  assert(has(checkVideo('v', makeMp4({ codec: 'hev1' })), 'H.264'), 'another codec');
  assert(has(checkVideo('v', makeMp4({ fragmented: true })), 'фрагментный'), 'fragmented MP4');
  assert(has(checkVideo('v', Buffer.from('this is not an mp4 file')), 'не похоже на MP4'), 'not an MP4');
  const info = mp4Info(makeMp4({ seconds: 12.5, width: 1920, height: 1080 }));
  assert(info.duration === 12.5 && info.width === 1920 && info.height === 1080 && info.codec === 'avc1' && info.fragmented === false, JSON.stringify(info));
  assert(mp4Info(makeMp4({ seconds: 15, timescale: 600 })).duration === 15 && mp4Info(makeMp4({ seconds: 27, timescale: 90000 })).duration === 27, 'the duration follows the time scale of the file');
  assert(checkVideo('v', makeMp4({ seconds: 27, timescale: 90000 })).length === 0 && has(checkVideo('v', makeMp4({ seconds: 29, timescale: 90000 })), 'до 28'), 'a 90000 time scale is understood');
  const limit = 100 * 1024 * 1024;
  const base = makeMp4({ bytes: 0 }).length;
  assert(checkVideo('v', makeMp4({ bytes: limit - base })).length === 0, 'exactly 100 MB is allowed');
  assert(has(checkVideo('v', makeMp4({ bytes: limit - base + 1 })), 'до 100'), 'one byte more is too much');
});

// ---- (д) настоящие материалы

check('repository: the real card texts, pictures and videos (when present) fit the rules', () => {
  const { problems, ok } = checkRepository();
  assert(problems.length === 0, problems.join(' | '));
  assert(ok.some((line) => line.includes('тексты карточки')), 'the texts were checked');
  assert(ok.some((line) => line.includes('скриншотов')), 'the screenshots were counted');
});

check('repository check: it finds missing and wrong materials in a folder, and passes a complete one', () => {
  const realListing = fs.readFileSync(new URL('../docs/store/listing.md', import.meta.url), 'utf8');
  const make = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omr-store-'));
    for (const [name, data] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), data);
    }
    return dir;
  };
  const shots = (extra = {}) => {
    const files = { ...extra };
    for (const lang of ['ru', 'en']) for (let i = 1; i <= 2; i += 1) {
      files[`docs/store/screenshots/${lang}-phone-${i}.jpg`] = jpeg(1080, 1920);
      files[`docs/store/screenshots/${lang}-desktop-${i}.jpg`] = jpeg(1920, 1080);
    }
    return files;
  };
  const run = (files) => {
    const dir = make(files);
    try { return checkRepository(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const complete = run(shots({ 'docs/store/listing.md': realListing, 'docs/store/icon-512.png': png(512, 512), 'docs/store/cover-800x470-ru.png': png(800, 470), 'release/video/ru-video-horizontal.mp4': makeMp4(), 'release/video/en-video-horizontal.mp4': makeMp4() }));
  assert(complete.problems.length === 0, JSON.stringify(complete.problems));
  assert(complete.todo.length === 1 && complete.todo[0].includes('one-more-run.zip'), `only the archive is left: ${JSON.stringify(complete.todo)}`);
  const bare = run({});
  assert(has(bare.problems, 'нет docs/store/listing.md') && has(bare.problems, 'скриншотов phone'), `an empty folder: ${JSON.stringify(bare.problems)}`);
  assert(bare.todo.length >= 4, 'icon, cover, videos and the archive are listed as to do, not as failures');
  const longName = realListing.replace('Кот бежит по саду', 'К' + 'о'.repeat(80)); // единственное вхождение: краткое описание на русском
  assert(has(run(shots({ 'docs/store/listing.md': longName })).problems, 'ru.short'), 'a broken text is reported');
  assert(has(run(shots({ 'docs/store/listing.md': realListing, 'docs/store/screenshots/ru-phone-9.jpg': jpeg(540, 960) })).problems, 'ru-phone-9'), 'a bad screenshot is reported by its name');
  const onlyOne = run({ 'docs/store/listing.md': realListing, 'docs/store/screenshots/ru-phone-1.jpg': jpeg(1080, 1920) });
  assert(has(onlyOne.problems, 'phone на языке ru меньше двух') && has(onlyOne.problems, 'desktop на языке en меньше двух'), 'fewer than two screenshots per platform and language');
  assert(has(run(shots({ 'docs/store/listing.md': realListing, 'docs/store/icon-512.png': png(500, 500) })).problems, 'иконка'), 'a bad icon');
  assert(has(run(shots({ 'docs/store/listing.md': realListing, 'docs/store/cover-800x470-en.png': png(800, 400) })).problems, 'обложка'), 'a bad cover');
  assert(has(run(shots({ 'docs/store/listing.md': realListing, 'release/video/ru-video-horizontal.mp4': makeMp4({ seconds: 40 }) })).problems, 'до 28'), 'a bad video');
});

check('repository: the card texts agree with the names inside the game', () => {
  const listing = parseListing(fs.readFileSync(new URL('../docs/store/listing.md', import.meta.url), 'utf8'));
  const ru = JSON.parse(fs.readFileSync(new URL('../src/localization/ru.json', import.meta.url), 'utf8'));
  const en = JSON.parse(fs.readFileSync(new URL('../src/localization/en.json', import.meta.url), 'utf8'));
  assert(listing.ru.name.toUpperCase() === ru.start.title && listing.ru.name === ru.meta.title, `ru: ${listing.ru.name} / ${ru.start.title} / ${ru.meta.title}`);
  assert(listing.en.name.toUpperCase() === en.start.title && listing.en.name === en.meta.title, `en: ${listing.en.name} / ${en.start.title} / ${en.meta.title}`);
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1q checks passed');
}
