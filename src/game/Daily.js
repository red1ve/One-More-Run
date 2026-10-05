import { CONFIG } from '../config.js';

// Забег дня: у всех игроков в один и тот же день одна и та же трасса, а за первый забег дня и за серию дней
// подряд дают монеты. Здесь только правила (дата, зерно трассы, серия, награда, слияние с облаком), без
// рисования. Забег дня не меняет рекорд и не идёт в таблицу лидеров: иначе трассу можно было бы выучить
// ради рекорда. Общей таблицы дня нет: Яндекс не умеет сбрасывать таблицы по времени.
//
// Игровой день считается по московскому времени (CONFIG.DAILY.UTC_OFFSET_HOURS): основная аудитория в
// России и СНГ, а время смены дня у всех должно быть одним и тем же, иначе трассы разойдутся.

const MS_PER_DAY = 86400000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STREAK = 9999;

function whole(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Игровой день 'ГГГГ-ММ-ДД' для времени в миллисекундах или null, если время не число.
export function gameDay(ms, offsetHours = CONFIG.DAILY.UTC_OFFSET_HOURS) {
  const time = Number(ms);
  if (!Number.isFinite(time)) return null;
  const shifted = new Date(time + offsetHours * 3600000);
  return Number.isNaN(shifted.getTime()) ? null : shifted.toISOString().slice(0, 10);
}

// Настоящая дата в виде 'ГГГГ-ММ-ДД' (а не просто похожая строка, вроде 2026-02-31).
export function isDay(value) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// Предыдущий день (через границу месяца и года).
export function previousDay(day) {
  return gameDay(Date.parse(`${day}T00:00:00Z`) - MS_PER_DAY, 0);
}

// Хеш FNV-1a строки: целое от 1 до 2^32 − 1. Из него получаются зёрна «одинаково у всех»: трасса дня и набор заданий.
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 1;
}

// Зерно трассы дня: хеш от соли и даты. Один день — одно зерно, у всех.
export function dailySeed(day) {
  return fnv1a(`${CONFIG.DAILY.SEED_SALT}${day}`);
}

// Сколько миллисекунд осталось до следующей смены игрового дня (полночь по Москве). Всегда от 1 до 24 часов.
export function msUntilNextDay(ms, offsetHours = CONFIG.DAILY.UTC_OFFSET_HOURS) {
  const time = Number(ms);
  if (!Number.isFinite(time)) return 0;
  const intoDay = (((time + offsetHours * 3600000) % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return MS_PER_DAY - intoDay;
}

// Награда за забег дня при серии из streak дней (считая этот): BASE, BASE + STEP, ... до MAX.
export function dailyReward(streak) {
  const cfg = CONFIG.DAILY;
  return Math.min(cfg.REWARD_MAX, cfg.REWARD_BASE + cfg.REWARD_STEP * (Math.max(1, whole(streak)) - 1));
}

const DAY_KEY = 'dailyDay';
const STREAK_KEY = 'dailyStreak';
const BEST_KEY = 'dailyBest';

export class Daily {
  constructor(storage) {
    this.storage = storage;
  }

  // Что записано: день последнего забега дня, серия на тот день и лучший счёт того дня.
  state() {
    const day = this.storage.get(DAY_KEY, null);
    if (!isDay(day)) return { day: null, streak: 0, best: 0 };
    return {
      day,
      streak: Math.min(MAX_STREAK, Math.max(1, whole(this.storage.get(STREAK_KEY, 1)))),
      best: whole(this.storage.get(BEST_KEY, 0))
    };
  }

  playedToday(today) {
    return this.state().day === today;
  }

  // Серия, которая идёт сегодня или ещё может продолжиться (последний забег сегодня или вчера); иначе 0.
  streakAt(today) {
    const { day, streak } = this.state();
    if (!day || !isDay(today)) return 0;
    return day === today || day === previousDay(today) ? streak : 0;
  }

  // Лучший счёт сегодняшнего забега дня (0, если ещё не играли).
  bestToday(today) {
    const { day, best } = this.state();
    return day === today ? best : 0;
  }

  // Награда за ближайший забег дня: 0, если сегодняшняя уже получена.
  nextReward(today) {
    if (!isDay(today) || this.playedToday(today)) return 0;
    return dailyReward(this.streakAt(today) + 1);
  }

  // Итог забега дня. Первый за день: серия растёт на 1 (если вчера тоже играли) или начинается заново,
  // выдаётся награда. Повторный: награды нет, обновляется лучший счёт дня. Если записанный день
  // позже сегодняшнего (часы устройства переводили), ничего не меняем и ничего не выдаём.
  // Возвращает { reward, streak, best, first } или null, если сегодняшняя дата неверна.
  complete(score, today) {
    if (!isDay(today)) return null;
    const points = whole(score);
    const state = this.state();
    if (state.day && state.day > today) return { reward: 0, streak: state.streak, best: points, first: false };
    if (state.day === today) {
      const best = Math.max(state.best, points);
      if (best !== state.best) this.storage.set(BEST_KEY, best);
      return { reward: 0, streak: state.streak, best, first: false };
    }
    const streak = state.day === previousDay(today) ? Math.min(MAX_STREAK, state.streak + 1) : 1;
    this.storage.set(DAY_KEY, today);
    this.storage.set(STREAK_KEY, streak);
    this.storage.set(BEST_KEY, points);
    return { reward: dailyReward(streak), streak, best: points, first: true };
  }

  // Что уходит в облако.
  snapshot() {
    const { day, streak, best } = this.state();
    return { dailyDay: day, dailyStreak: day ? streak : 0, dailyBest: best };
  }

  // Слияние с облаком: более поздний день побеждает; тот же день — большая серия и лучший счёт; более
  // ранний и «дни из будущего» (мусор или чужие часы) игнорируются. true — локальные данные изменились.
  merge(data, today) {
    if (!data || typeof data !== 'object' || !isDay(data.dailyDay) || !isDay(today) || data.dailyDay > today) return false;
    const local = this.state();
    const cloud = {
      day: data.dailyDay,
      streak: Math.min(MAX_STREAK, Math.max(1, whole(data.dailyStreak))),
      best: whole(data.dailyBest)
    };
    if (!local.day || cloud.day > local.day) {
      this.storage.set(DAY_KEY, cloud.day);
      this.storage.set(STREAK_KEY, cloud.streak);
      this.storage.set(BEST_KEY, cloud.best);
      return true;
    }
    if (cloud.day !== local.day) return false;
    const streak = Math.max(local.streak, cloud.streak);
    const best = Math.max(local.best, cloud.best);
    if (streak === local.streak && best === local.best) return false;
    this.storage.set(STREAK_KEY, streak);
    this.storage.set(BEST_KEY, best);
    return true;
  }
}
