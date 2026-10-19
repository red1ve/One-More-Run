import { CONFIG } from '../config.js';
import { gameDay, isDay } from './Daily.js';

// Магазин скинов: правила покупки и хранения, без рисования. Монеты лежат в StorageService
// (два счётчика), а здесь — список купленных скинов, выбранный скин и слияние с облаком.
//
// Облако (Game.cloudSnapshot / applyCloudData): счётчики монет — по большему значению, купленные скины —
// объединение, выбранный скин — свой, пока игрок на этом устройстве ничего не выбирал. Потраченное
// поэтому не «возвращается», а купленное не пропадает. Если на двух устройствах куплено разное,
// игрок сохраняет всё купленное и платит по большему из двух счётчиков (щедро, но не жёстко).

const OWNED_KEY = 'skinsOwned';
const SELECTED_KEY = 'skinSelected';
// День первого запуска игры: от него считаются дни ограниченного скина. В облаке берётся более ранний.
const FIRST_DAY_KEY = 'firstDay';
const MS_PER_DAY = 86400000;

function dayNumber(day) {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / MS_PER_DAY);
}

function whole(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export class Shop {
  // today — функция, которая даёт игровой день 'ГГГГ-ММ-ДД' (Game.todayKey: серверное время Яндекса);
  // без неё берётся время устройства.
  constructor(storage, today = null) {
    this.storage = storage;
    this.today = typeof today === 'function' ? today : () => gameDay(Date.now());
  }

  // ---- ограниченные скины

  firstDay() {
    const day = this.storage.get(FIRST_DAY_KEY, null);
    return isDay(day) ? day : null;
  }

  // Запоминает день первого запуска (один раз, дальше не меняется). Возвращает его.
  ensureFirstDay() {
    const known = this.firstDay();
    if (known) return known;
    const today = this.today();
    if (!isDay(today)) return null;
    this.storage.set(FIRST_DAY_KEY, today);
    return today;
  }

  limitOf(id) {
    return CONFIG.SHOP.SKINS.find((skin) => skin.id === id)?.limited || null;
  }

  // Можно ли сейчас купить скин по времени: { available, daysLeft }. У обычного скина всегда да, daysLeft null.
  // Купленный остаётся доступен всегда. Окно: `days` дней с первого запуска и не позже `until`.
  availability(id) {
    const limit = this.limitOf(id);
    if (!limit || this.isOwned(id)) return { available: true, daysLeft: null };
    const today = this.today();
    const first = this.firstDay() || today;
    if (!isDay(today) || !isDay(first)) return { available: false, daysLeft: 0 };
    const elapsed = Math.max(0, dayNumber(today) - dayNumber(first));
    const daysLeft = limit.days - elapsed;
    const inSeason = !isDay(limit.until) || today <= limit.until;
    return { available: daysLeft > 0 && inSeason, daysLeft: Math.max(0, daysLeft) };
  }

  ids() {
    return CONFIG.SHOP.SKINS.map((skin) => skin.id);
  }

  price(id) {
    return CONFIG.SHOP.SKINS.find((skin) => skin.id === id)?.price;
  }

  isKnown(id) {
    return typeof id === 'string' && this.price(id) !== undefined;
  }

  // Купленные скины в порядке магазина. Бесплатный скин по умолчанию есть всегда.
  owned() {
    const stored = this.storage.get(OWNED_KEY, []);
    const set = new Set(Array.isArray(stored) ? stored.filter((id) => this.isKnown(id)) : []);
    set.add(CONFIG.SHOP.DEFAULT_SKIN);
    return this.ids().filter((id) => set.has(id));
  }

  isOwned(id) {
    return this.owned().includes(id);
  }

  // Выбранный скин; если он не куплен или не существует (старая версия, порча данных) — скин по умолчанию.
  selected() {
    const id = this.storage.get(SELECTED_KEY, null);
    return this.isKnown(id) && this.isOwned(id) ? id : CONFIG.SHOP.DEFAULT_SKIN;
  }

  balance() {
    return this.storage.getCoins();
  }

  // Список для экрана: id, цена, куплен ли, выбран ли.
  // Ограниченный скин, пока он продаётся, идёт с `limited` — сколько дней осталось; когда окно закрылось и скина
  // нет у игрока, его в списке нет.
  list() {
    const owned = new Set(this.owned());
    const selected = this.selected();
    return CONFIG.SHOP.SKINS
      .filter(({ id }) => owned.has(id) || this.availability(id).available)
      .map(({ id, price }) => {
        const own = owned.has(id);
        const limited = !own && this.limitOf(id) ? this.availability(id).daysLeft : null;
        return { id, price, owned: own, selected: id === selected, limited };
      });
  }

  // Ближайшая цель для экрана проигрыша: самый дешёвый платный скин, которого ещё нет. Возвращает
  // { id, price, balance, missing } или null, если всё куплено. Строка «СКИН … 118 / 130» и полоска на экране.
  nextTarget() {
    const owned = new Set(this.owned());
    const open = CONFIG.SHOP.SKINS.filter((skin) => skin.price > 0 && !skin.limited && !owned.has(skin.id));
    if (!open.length) return null;
    const cheapest = open.reduce((best, skin) => (skin.price < best.price ? skin : best));
    const balance = this.balance();
    return { id: cheapest.id, price: cheapest.price, balance, missing: Math.max(0, cheapest.price - balance) };
  }

  // Можно ли купить: { ok: true } или { ok: false, reason: 'unknown' | 'owned' | 'poor', missing }.
  canBuy(id) {
    if (!this.isKnown(id)) return { ok: false, reason: 'unknown', missing: 0 };
    if (this.isOwned(id)) return { ok: false, reason: 'owned', missing: 0 };
    if (!this.availability(id).available) return { ok: false, reason: 'unavailable', missing: 0 };
    const missing = this.price(id) - this.balance();
    if (missing > 0) return { ok: false, reason: 'poor', missing };
    return { ok: true, missing: 0 };
  }

  // Покупка: списывает монеты, записывает скин в купленные и сразу выбирает его.
  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) return check;
    const price = this.price(id);
    if (price > 0 && !this.storage.spendCoins(price)) return { ok: false, reason: 'poor', missing: price - this.balance() };
    this.storage.set(OWNED_KEY, [...this.owned(), id]);
    this.storage.set(SELECTED_KEY, id);
    return { ok: true, missing: 0 };
  }

  // Выбор купленного скина. false — скин чужой или неизвестный.
  select(id) {
    if (!this.isKnown(id) || !this.isOwned(id)) return false;
    this.storage.set(SELECTED_KEY, id);
    return true;
  }

  // Что уходит в облако. coins — баланс для прежних версий игры.
  snapshot() {
    const { earned, spent } = this.storage.coinCounters();
    return {
      coins: earned - spent,
      coinsEarned: earned,
      coinsSpent: spent,
      skinsOwned: this.owned(),
      skinSelected: this.selected(),
      firstDay: this.firstDay()
    };
  }

  // Сливает облачные данные с локальными (правила — в шапке файла). true — что-то изменилось.
  // Мусор в данных не меняет ничего. Прежние версии игры присылали только coins (баланс): это «заработано».
  merge(data) {
    if (!data || typeof data !== 'object') return false;
    const before = JSON.stringify(this.snapshot());
    const local = this.storage.coinCounters();
    const cloudEarned = data.coinsEarned !== undefined ? whole(data.coinsEarned) : whole(data.coins);
    // Потрачено больше, чем заработано, — противоречивые данные: такой счётчик не берём (иначе одна
    // порча в облаке обнулила бы монеты игрока).
    const cloudSpent = whole(data.coinsSpent) <= cloudEarned ? whole(data.coinsSpent) : 0;
    const earned = Math.max(local.earned, cloudEarned);
    const spent = Math.max(local.spent, cloudSpent);
    if (earned !== local.earned || spent !== local.spent) this.storage.setCoinCounters(earned, spent);

    if (Array.isArray(data.skinsOwned)) {
      const union = new Set([...this.owned(), ...data.skinsOwned.filter((id) => this.isKnown(id))]);
      const merged = this.ids().filter((id) => union.has(id));
      if (merged.join() !== this.owned().join()) this.storage.set(OWNED_KEY, merged);
    }
    // День первого запуска: берём более ранний из двух (иначе на втором устройстве окно ограниченного скина началось бы заново).
    if (isDay(data.firstDay) && (!this.firstDay() || data.firstDay < this.firstDay())) this.storage.set(FIRST_DAY_KEY, data.firstDay);
    // Новое устройство (игрок здесь ещё ничего не выбирал) берёт выбор из облака, если этот скин куплен.
    if (this.storage.get(SELECTED_KEY, null) === null && this.isKnown(data.skinSelected) && this.isOwned(data.skinSelected)) {
      this.storage.set(SELECTED_KEY, data.skinSelected);
    }
    return JSON.stringify(this.snapshot()) !== before;
  }
}
