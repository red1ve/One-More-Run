// Фаза 4: проверки локализации (входит в npm run check).
import { DICTIONARIES, setLanguage, getLanguage, t } from '../src/localization/i18n.js';

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

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const en = flatten(DICTIONARIES.en);
const ru = flatten(DICTIONARIES.ru);
const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(',');

check('ru and en have exactly the same keys', () => {
  const missing = Object.keys(en).filter((key) => !(key in ru));
  const extra = Object.keys(ru).filter((key) => !(key in en));
  assert(!missing.length, `missing in ru: ${missing.join(', ')}`);
  assert(!extra.length, `extra in ru: ${extra.join(', ')}`);
});

check('every string is non-empty and keeps the same placeholders', () => {
  for (const key of Object.keys(en)) {
    assert(typeof en[key] === 'string' && en[key].trim(), `empty en ${key}`);
    assert(typeof ru[key] === 'string' && ru[key].trim(), `empty ru ${key}`);
    assert(placeholders(en[key]) === placeholders(ru[key]), `placeholders differ in ${key}`);
  }
});

check('Russian strings contain no leftover English words', () => {
  // Разрешены: клавиши (A/D, M) и знаки. Слова из латиницы длиннее одной буквы — ошибка.
  for (const [key, text] of Object.entries(ru)) {
    const latinWords = String(text).replace(/\{\w+\}/g, '').match(/[A-Za-z]{2,}/g);
    assert(!latinWords, `${key}: ${latinWords}`);
  }
});

check('t() switches language, fills numbers and falls back to English', () => {
  setLanguage('ru');
  assert(getLanguage() === 'ru');
  assert(t('over.best', { n: 120 }) === 'РЕКОРД 120', t('over.best', { n: 120 }));
  setLanguage('de');
  assert(getLanguage() === 'en', 'unknown language falls back to English');
  assert(t('over.best', { n: 7 }) === 'BEST 7');
  assert(t('no.such.key') === 'no.such.key');
  setLanguage('en');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} localization check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll localization checks passed');
}
