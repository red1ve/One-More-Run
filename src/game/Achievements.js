import { CONFIG } from '../config.js';
import { isDay, previousDay } from './Daily.js';

// Достижения: десять целей на всё время игры. Здесь только правила (что получено, серия дней с заданиями,
// слияние с облаком), без рисования. Монет за достижения нет: игрок получает значок в списке и плашку.
//
// Достижения двух видов. «За один забег» (долгий забег, узкие проходы подряд, «впритирку» подряд, забег без
// монет, предельный множитель) игра выдаёт сама, в момент, когда цель достигнута: Game вызывает unlock().
// «Накопительные» (монеты за всё время, скины, серия забега дня, дни с заданиями) считаются по тому, что
// уже сохранено, поэтому их проверяет evaluate() по готовой сводке (Game.achievementStats): так достижение
// выдаётся и тому, кто заработал условие до появления списка, и после слияния с облаком другого устройства.
//
// Облако: список полученных объединяется (ничего не теряется ни на одном устройстве), а серия дней с заданиями
// ведёт себя как серия забега дня: побеждает более поздний день, в тот же день берётся большая серия.

// Порядок — как в окне: сначала то, что делается за один забег, потом накопительное, потом «по дням».
export const ACHIEVEMENT_IDS = [
  'longRun', 'bold', 'closeCalls', 'cleanRun', 'topMultiplier',
  'piggyBank', 'wardrobe', 'fullWardrobe',
  'diligent', 'weekStreak'
];

// Число из описания достижения (что в нём написано цифрой). null — в описании числа нет.
export function achievementNumber(id) {
  const cfg = CONFIG.ACHIEVEMENTS;
  const numbers = {
    longRun: cfg.SURVIVE_SECONDS,
    bold: cfg.RISK_STREAK,
    closeCalls: cfg.GRAZE_COMBO,
    cleanRun: cfg.CLEAN_SECONDS,
    topMultiplier: CONFIG.MULTIPLIER_MAX,
    piggyBank: cfg.COINS_TOTAL,
    wardrobe: cfg.SKINS_SOME,
    diligent: cfg.QUEST_DAYS,
    weekStreak: cfg.DAILY_STREAK
  };
  return id in numbers ? numbers[id] : null;
}

const LIST_KEY = 'achievements';
const QUEST_DAY_KEY = 'achQuestDay';
const QUEST_STREAK_KEY = 'achQuestStreak';
const MAX_STREAK = 9999;

function whole(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export class Achievements {
  constructor(storage) {
    this.storage = storage;
  }

  // Полученные достижения в порядке окна. Неизвестные имена (порча данных, другая версия) отбрасываются.
  owned() {
    const stored = this.storage.get(LIST_KEY, []);
    const set = new Set(Array.isArray(stored) ? stored : []);
    return ACHIEVEMENT_IDS.filter((id) => set.has(id));
  }

  has(id) {
    return this.owned().includes(id);
  }

  // Выдаёт достижение. true — оно получено только что; false — уже было или такого нет.
  unlock(id) {
    if (!ACHIEVEMENT_IDS.includes(id)) return false;
    const owned = this.owned();
    if (owned.includes(id)) return false;
    this.storage.set(LIST_KEY, ACHIEVEMENT_IDS.filter((item) => item === id || owned.includes(item)));
    return true;
  }

  // Сколько получено из скольких: { done, total }.
  summary() {
    return { done: this.owned().length, total: ACHIEVEMENT_IDS.length };
  }

  // ---- серия дней, когда выполнены все три задания дня

  questState() {
    const day = this.storage.get(QUEST_DAY_KEY, null);
    if (!isDay(day)) return { day: null, streak: 0 };
    return { day, streak: Math.min(MAX_STREAK, Math.max(1, whole(this.storage.get(QUEST_STREAK_KEY, 1)))) };
  }

  // Серия, которая идёт сегодня или ещё может продолжиться (последний такой день сегодня или вчера); иначе 0.
  questStreakAt(today) {
    const { day, streak } = this.questState();
    if (!day || !isDay(today)) return 0;
    return day === today || day === previousDay(today) ? streak : 0;
  }

  // Сегодня выполнены все задания. Серия растёт на 1, если вчера было так же, иначе начинается с 1; повторный вызов
  // в тот же день ничего не меняет. День из будущего (часы устройства переводили) не меняет ничего. Возвращает серию.
  noteQuestsDone(today) {
    if (!isDay(today)) return 0;
    const { day, streak } = this.questState();
    if (day && day > today) return streak;
    if (day === today) return streak;
    const next = day === previousDay(today) ? Math.min(MAX_STREAK, streak + 1) : 1;
    this.storage.set(QUEST_DAY_KEY, today);
    this.storage.set(QUEST_STREAK_KEY, next);
    return next;
  }

  // ---- накопительные достижения

  // stats: { coinsEarned, skins, skinsTotal, dailyStreak, questStreak } (Game.achievementStats). Выдаёт всё,
  // что выполнено, и возвращает список только что полученных.
  evaluate(stats) {
    const goals = this.goals(stats);
    const earned = [];
    for (const [id, goal] of Object.entries(goals)) {
      if (goal.progress >= goal.target && this.unlock(id)) earned.push(id);
    }
    return earned;
  }

  // Цели накопительных достижений: { id: { progress, target } }. Прогресс не больше цели.
  goals(stats = {}) {
    const cfg = CONFIG.ACHIEVEMENTS;
    const skinsTotal = whole(stats.skinsTotal);
    const make = (progress, target) => ({ progress: Math.min(target, whole(progress)), target });
    return {
      piggyBank: make(stats.coinsEarned, cfg.COINS_TOTAL),
      wardrobe: make(stats.skins, cfg.SKINS_SOME),
      // Если скинов вдруг нет вообще, цель невыполнима, а не «выполнена нулём».
      fullWardrobe: skinsTotal > 0 ? make(stats.skins, skinsTotal) : { progress: 0, target: 1 },
      diligent: make(stats.questStreak, cfg.QUEST_DAYS),
      weekStreak: make(stats.dailyStreak, cfg.DAILY_STREAK)
    };
  }

  // Строки окна: { id, done, progress, target, number }. Для достижений «за один забег» progress и target — null
  // (счётчик показывать нечего), для полученных накопительных progress равен цели. number — число из описания
  // («80 секунд», «×5»); у «всех скинов» его нет.
  list(stats) {
    const owned = new Set(this.owned());
    const goals = this.goals(stats);
    return ACHIEVEMENT_IDS.map((id) => {
      const done = owned.has(id);
      const goal = goals[id];
      const number = achievementNumber(id);
      if (!goal) return { id, done, progress: null, target: null, number };
      return { id, done, progress: done ? goal.target : goal.progress, target: goal.target, number };
    });
  }

  // ---- облако

  snapshot() {
    const { day, streak } = this.questState();
    return { achievements: this.owned(), achQuestDay: day, achQuestStreak: day ? streak : 0 };
  }

  // Слияние с облаком. true — локальные данные изменились.
  merge(data, today) {
    if (!data || typeof data !== 'object') return false;
    let changed = false;
    if (Array.isArray(data.achievements)) {
      const union = new Set([...this.owned(), ...data.achievements]);
      const merged = ACHIEVEMENT_IDS.filter((id) => union.has(id));
      if (merged.join() !== this.owned().join()) {
        this.storage.set(LIST_KEY, merged);
        changed = true;
      }
    }
    if (isDay(data.achQuestDay) && isDay(today) && data.achQuestDay <= today) {
      const local = this.questState();
      const cloud = { day: data.achQuestDay, streak: Math.min(MAX_STREAK, Math.max(1, whole(data.achQuestStreak))) };
      if (!local.day || cloud.day > local.day) {
        this.storage.set(QUEST_DAY_KEY, cloud.day);
        this.storage.set(QUEST_STREAK_KEY, cloud.streak);
        changed = true;
      } else if (cloud.day === local.day && cloud.streak > local.streak) {
        this.storage.set(QUEST_STREAK_KEY, cloud.streak);
        changed = true;
      }
    }
    return changed;
  }
}
