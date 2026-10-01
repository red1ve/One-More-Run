import { CONFIG } from '../config.js';

// Вибрация на телефоне (navigator.vibrate): короткие импульсы на событиях игры. Работает только там,
// где она есть (Android); на iPhone и ПК ничего не происходит и ничего не ломается.
// Не чаще HAPTIC_MIN_GAP_MS, чтобы импульсы не сливались в гул. isEnabled — «можно ли сейчас»:
// игра выключает вибрацию вместе со звуком.
export class HapticsService {
  constructor(options = {}) {
    this.navigator = options.navigator ?? globalThis.navigator ?? null;
    this.isEnabled = options.isEnabled ?? (() => true);
    this.now = options.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
    this.lastAt = -Infinity;
  }

  supported() {
    return typeof this.navigator?.vibrate === 'function';
  }

  // name — ключ из CONFIG.FEEL.HAPTIC_PATTERNS. true = импульс отправлен.
  pulse(name) {
    if (!CONFIG.FEEL.HAPTICS || !this.supported() || !this.isEnabled()) return false;
    const pattern = CONFIG.FEEL.HAPTIC_PATTERNS[name];
    if (pattern === undefined) return false;
    const now = this.now();
    if (now - this.lastAt < CONFIG.FEEL.HAPTIC_MIN_GAP_MS) return false;
    this.lastAt = now;
    try {
      return this.navigator.vibrate(pattern) !== false;
    } catch (error) {
      return false;
    }
  }

  // Прервать вибрацию (пауза, реклама, закрытие вкладки).
  stop() {
    if (!this.supported()) return false;
    try {
      this.navigator.vibrate(0);
      return true;
    } catch (error) {
      return false;
    }
  }
}
