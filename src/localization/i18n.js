// Переводы интерфейса. Все надписи игры лежат в en.json и ru.json.
// Язык выбирается по YandexService (main.js); без языка — английский.
// t('over.best', { n: 120 }) → «BEST 120» / «РЕКОРД 120».
import en from './en.json' with { type: 'json' };
import ru from './ru.json' with { type: 'json' };

export const DICTIONARIES = { en, ru };
const FALLBACK = 'en';
let current = FALLBACK;

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

export function setLanguage(lang) {
  current = DICTIONARIES[lang] ? lang : FALLBACK;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    // Название во вкладке совпадает с названием игры в консоли Яндекса на этом языке.
    document.title = t('meta.title');
  }
  return current;
}

export function getLanguage() {
  return current;
}

export function t(key, params = null) {
  let text = lookup(DICTIONARIES[current], key);
  if (typeof text !== 'string') text = lookup(DICTIONARIES[FALLBACK], key);
  if (typeof text !== 'string') return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
