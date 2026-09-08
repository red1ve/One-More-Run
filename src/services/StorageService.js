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
}