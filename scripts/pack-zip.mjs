// Упаковывает папку dist в release/one-more-run.zip для консоли Яндекса и проверяет архив.
// Запуск: npm run pack (сначала собирает игру и проверяет сборку) или node scripts/pack-zip.mjs после npm run build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip, zipNameProblems } from './zip-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'release');
const outFile = path.join(outDir, 'one-more-run.zip');
const LIMIT_BYTES = 100 * 1024 * 1024; // предел консоли: 100 МБ в распакованном виде

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ name: rel, data: fs.readFileSync(full) });
  }
  return out;
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('Нет dist/index.html: сначала npm run build.');
  process.exit(1);
}
const files = walk(dist);
// index.html первым: так архив читается человеком и любым загрузчиком одинаково.
files.sort((a, b) => (a.name === 'index.html' ? -1 : b.name === 'index.html' ? 1 : a.name < b.name ? -1 : 1));
const zip = writeZip(files);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, zip);

// Проверка по только что записанному файлу: читаем его заново, как будет читать консоль.
const entries = readZip(fs.readFileSync(outFile));
const problems = zipNameProblems(entries.map((e) => e.name));
const total = entries.reduce((sum, e) => sum + e.size, 0);
if (total > LIMIT_BYTES) problems.push(`в распакованном виде ${(total / 1048576).toFixed(1)} МБ, предел 100 МБ`);
if (entries.length !== files.length) problems.push('в архиве не все файлы');
if (problems.length) {
  console.error(`Архив не годится:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`${path.relative(root, outFile)}: ${entries.length} файлов, ${(total / 1048576).toFixed(2)} МБ в распакованном виде, архив ${(zip.length / 1048576).toFixed(2)} МБ.`);
console.log('index.html лежит в корне архива, имена без пробелов и кириллицы. Загружайте этот файл в консоль (черновик → «Загрузить архив»).');
