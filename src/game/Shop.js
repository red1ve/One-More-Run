import { CONFIG } from '../config.js';

// Магазин скинов: правила покупки и хранения, без рисования. Монеты лежат в StorageService
// (два счётчика), а здесь — список купленных скинов, выбранный скин и слияние с облаком.
//
// Облако (Game.cloudSnapshot / applyCloudData): счётчики монет — по большему значению, купленные скины —
// объединение, выбранный скин — свой, пока игрок на этом устройстве ничего не выбирал. Потраченное
// поэтому не «возвращается», а купленное не пропадает. Если на двух устройствах куплено разное,
// игрок сохраняет всё купленное и платит по большему из двух счётчиков (щедро, но не жёстко).

const OWNED_KEY = 'skinsOwned';
const SELECTED_KEY = 'skinSelected';

function whole(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export class Shop {
  constructor(storage) {
    this.storage = storage;
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
  list() {
    const owned = new Set(this.owned());
    const selected = this.selected();
    return CONFIG.SHOP.SKINS.map(({ id, price }) => ({ id, price, owned: owned.has(id), selected: id === selected }));
  }

  // Можно ли купить: { ok: true } или { ok: false, reason: 'unknown' | 'owned' | 'poor', missing }.
  canBuy(id) {
    if (!this.isKnown(id)) return { ok: false, reason: 'unknown', missing: 0 };
    if (this.isOwned(id)) return { ok: false, reason: 'owned', missing: 0 };
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
      skinSelected: this.selected()
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
    // Новое устройство (игрок здесь ещё ничего не выбирал) берёт выбор из облака, если этот скин куплен.
    if (this.storage.get(SELECTED_KEY, null) === null && this.isKnown(data.skinSelected) && this.isOwned(data.skinSelected)) {
      this.storage.set(SELECTED_KEY, data.skinSelected);
    }
    return JSON.stringify(this.snapshot()) !== before;
  }
}
