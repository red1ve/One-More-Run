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

  getCoins() {
    const value = Number(this.get('coins', 0));
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  }

  addCoins(amount) {
    const n = Math.floor(Number(amount) || 0);
    const current = this.getCoins();
    if (n <= 0) return current;
    const next = current + n;
    this.set('coins', next);
    return next;
  }
}