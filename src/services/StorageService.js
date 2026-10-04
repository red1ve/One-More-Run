export class StorageService {
  constructor() {
    this.prefix = 'one_more_run_';
  }

  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.error('StorageService: Ошибка сохранения', e);
    }
  }

  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error('StorageService: Ошибка загрузки', e);
      return defaultValue;
    }
  }

  // Монеты хранятся двумя счётчиками: заработано и потрачено. Баланс — их разница. Так облако может
  // сливать данные двух устройств (каждый счётчик берётся по большему), и потраченное не «возвращается».
  // Старое сохранение хранило одно число coins: оно становится «заработано», пока нового счётчика нет.
  coinCounters() {
    const whole = (value) => {
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number > 0 ? number : 0;
    };
    const stored = this.get('coinsEarned', null);
    const earned = stored === null ? whole(this.get('coins', 0)) : whole(stored);
    const spent = Math.min(whole(this.get('coinsSpent', 0)), earned);
    return { earned, spent };
  }

  getCoins() {
    const { earned, spent } = this.coinCounters();
    return earned - spent;
  }

  addCoins(amount) {
    const n = Math.floor(Number(amount));
    const { earned, spent } = this.coinCounters();
    if (!Number.isFinite(n) || n <= 0) return earned - spent;
    this.setCoinCounters(earned + n, spent);
    return earned + n - spent;
  }

  // Тратит монеты. false — не хватает (или сумма не имеет смысла), ничего не меняется.
  spendCoins(amount) {
    const n = Math.floor(Number(amount));
    const { earned, spent } = this.coinCounters();
    if (!Number.isFinite(n) || n <= 0 || earned - spent < n) return false;
    this.setCoinCounters(earned, spent + n);
    return true;
  }

  // Записывает оба счётчика (и баланс в старом ключе coins, который читают прежние версии игры).
  setCoinCounters(earned, spent) {
    const e = Math.max(0, Math.floor(Number(earned) || 0));
    const s = Math.min(e, Math.max(0, Math.floor(Number(spent) || 0)));
    this.set('coinsEarned', e);
    this.set('coinsSpent', s);
    this.set('coins', e - s);
  }
}
