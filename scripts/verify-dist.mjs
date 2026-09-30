// Проверка сборки перед загрузкой в консоль Яндекса.
// Запуск после `npm run build`: npm run verify:dist
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const problems = [];
if (!fs.existsSync(root)) {
  console.log('Нет папки dist: сначала выполните npm run build');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'index.html'))) problems.push('index.html не лежит в корне dist');

let total = 0;
let count = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // Яндекс: без пробелов и кириллицы (и вообще не-ASCII) в именах файлов.
    if (/\s/.test(entry.name) || /[^\x21-\x7E]/.test(entry.name)) {
      problems.push(`плохое имя файла: ${path.relative(root, full)}`);
    }
    if (entry.isDirectory()) walk(full);
    else {
      total += fs.statSync(full).size;
      count += 1;
    }
  }
};
walk(root);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (/(src|href)="\/(?!\/)/.test(html)) problems.push('в index.html есть абсолютные пути "/..." — в архиве они не откроются');

const mb = total / 1024 / 1024;
if (mb > 100) problems.push(`сборка ${mb.toFixed(1)} МБ больше 100 МБ`);

console.log(`dist: ${count} файлов, ${mb.toFixed(2)} МБ`);
if (problems.length) {
  console.log(`Проблемы:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Сборка готова к упаковке в zip для Яндекса.');
}
