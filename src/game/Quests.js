import { CONFIG } from '../config.js';
import { fnv1a, isDay } from './Daily.js';
import { createSeededRandom } from './Random.js';

// Задания на день: три в день (лёгкое, среднее, трудное), у всех игроков одни и те же. Здесь только
// правила (выбор по дате, прогресс, награда, слияние с облаком), без рисования. Игра сообщает модулю
// о событиях (подобрана монета, пройден риск, забег закончился), а он решает, выполнено ли задание.
//
// Как копится прогресс. 'sum' — за весь день, по забегам (монеты, риск, «впритирку», забеги, забег дня);
// 'best' — берётся лучший результат одного забега (секунды, очки, множитель). Награда выдаётся сразу, в
// момент выполнения, как обычные заработанные монеты, и один раз за задание.
//
// Состояние хранится по виду задания (виды в одном наборе не повторяются): день, прогресс по видам и
// список полученных наград. Запись другого дня считается пустой: на новый день всё начинается заново.

export const QUEST_MODES = {
  coins: 'sum',
  risk: 'sum',
  graze: 'sum',
  runs: 'sum',
  daily: 'sum',
  survive: 'best',
  score: 'best',
  multiplier: 'best'
};

const DAY_KEY = 'questDay';
const PROGRESS_KEY = 'questProgress';
const CLAIMED_KEY = 'questClaimed';

function whole(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Набор заданий дня: [{ kind, tier, target, reward }] от лёгкого к трудному. Выбор по зерну из даты
// (одинаков у всех); сначала самое трудное, у него меньше всего вариантов, чтобы виды не повторялись.
export function questsFor(day) {
  if (!isDay(day)) return [];
  const cfg = CONFIG.QUESTS;
  const random = createSeededRandom(fnv1a(`${cfg.SEED_SALT}${day}`));
  const kinds = Object.keys(cfg.POOL);
  const used = new Set();
  const picked = [];
  for (let tier = cfg.REWARDS.length - 1; tier >= 0; tier -= 1) {
    const options = kinds.filter((kind) => cfg.POOL[kind][tier] != null && !used.has(kind));
    if (!options.length) continue;
    const kind = options[Math.floor(random() * options.length)];
    used.add(kind);
    picked[tier] = { kind, tier, target: cfg.POOL[kind][tier], reward: cfg.REWARDS[tier] };
  }
  return picked.filter(Boolean);
}

// Прогресс и полученные награды из того, что лежит в хранилище или в облаке. Мусор отбрасывается, прогресс не
// бывает больше самой большой цели вида, а у вида, за который награда уже получена, прогресса нет (он не нужен).
function normalise(rawProgress, rawClaimed) {
  const kinds = Object.keys(CONFIG.QUESTS.POOL);
  const claimed = Array.isArray(rawClaimed) ? kinds.filter((kind) => rawClaimed.includes(kind)) : [];
  const progress = {};
  if (rawProgress && typeof rawProgress === 'object' && !Array.isArray(rawProgress)) {
    for (const kind of kinds) {
      const goal = Math.max(...CONFIG.QUESTS.POOL[kind].filter((value) => value != null));
      const value = Math.min(goal, whole(rawProgress[kind]));
      if (value > 0 && !claimed.includes(kind)) progress[kind] = value;
    }
  }
  return { progress, claimed };
}

export class Quests {
  constructor(storage) {
    this.storage = storage;
  }

  // Что записано на день today: прогресс по видам и полученные награды. Запись другого дня — пусто.
  read(today) {
    if (this.storage.get(DAY_KEY, null) !== today) return { progress: {}, claimed: [] };
    return normalise(this.storage.get(PROGRESS_KEY, {}), this.storage.get(CLAIMED_KEY, []));
  }

  write(today, progress, claimed) {
    this.storage.set(DAY_KEY, today);
    this.storage.set(PROGRESS_KEY, progress);
    this.storage.set(CLAIMED_KEY, claimed);
  }

  // Задания дня с прогрессом для экрана: { kind, tier, target, reward, mode, progress, done }. Прогресс не больше цели.
  list(today) {
    const { progress, claimed } = this.read(today);
    return questsFor(today).map((quest) => {
      const done = claimed.includes(quest.kind);
      return {
        ...quest,
        mode: QUEST_MODES[quest.kind],
        progress: done ? quest.target : Math.min(quest.target, progress[quest.kind] || 0),
        done
      };
    });
  }

  // Сколько заданий дня выполнено: { done, total }.
  summary(today) {
    const quests = this.list(today);
    return { done: quests.filter((quest) => quest.done).length, total: quests.length };
  }

  // Задания «за один забег» (секунды, очки, множитель), которые ещё не выполнены: игра следит за ними
  // во время забега и сообщает в момент, когда цель достигнута. [{ kind, target }].
  watch(today) {
    return this.list(today)
      .filter((quest) => !quest.done && QUEST_MODES[quest.kind] === 'best')
      .map(({ kind, target }) => ({ kind, target }));
  }

  // Событие игры: к заданию вида kind прибавляется value (или берётся лучшее, см. QUEST_MODES). Если
  // сегодня есть такое задание и оно этим выполнено, выдаётся награда. Возвращает список выполненных
  // заданий (пустой или одно): игра покажет плашку.
  record(kind, value, today) {
    const quest = questsFor(today).find((item) => item.kind === kind);
    const amount = whole(value);
    if (!quest || amount <= 0) return [];
    const { progress, claimed } = this.read(today);
    if (claimed.includes(kind)) return [];
    const before = progress[kind] || 0;
    const next = Math.min(quest.target, QUEST_MODES[kind] === 'best' ? Math.max(before, amount) : before + amount);
    const completed = next >= quest.target;
    if (completed) {
      claimed.push(kind);
      delete progress[kind];
    } else {
      progress[kind] = next;
    }
    this.write(today, progress, claimed);
    if (!completed) return [];
    this.storage.addCoins(quest.reward);
    return [{ ...quest, progress: next, done: true }];
  }

  // Что уходит в облако.
  snapshot() {
    const day = this.storage.get(DAY_KEY, null);
    if (!isDay(day)) return { questDay: null, questProgress: {}, questClaimed: [] };
    const { progress, claimed } = normalise(this.storage.get(PROGRESS_KEY, {}), this.storage.get(CLAIMED_KEY, []));
    return { questDay: day, questProgress: progress, questClaimed: claimed };
  }

  // Слияние с облаком. Важен только сегодняшний день: на другие дни задания не переносятся. Тот же день:
  // по каждому виду берётся больший прогресс (так одно и то же не посчитается дважды), полученные награды
  // объединяются. Монеты за выполненное сливаются отдельно, счётчиками заработанного (Shop.merge), поэтому
  // награда не выдаётся второй раз. true — локальные данные изменились.
  merge(data, today) {
    if (!data || typeof data !== 'object' || !isDay(today) || data.questDay !== today) return false;
    const cloud = normalise(data.questProgress, data.questClaimed);
    const local = this.read(today);
    const claimed = Object.keys(CONFIG.QUESTS.POOL).filter((kind) => local.claimed.includes(kind) || cloud.claimed.includes(kind));
    const progress = {};
    for (const kind of Object.keys(CONFIG.QUESTS.POOL)) {
      const value = Math.max(local.progress[kind] || 0, cloud.progress[kind] || 0);
      if (value > 0 && !claimed.includes(kind)) progress[kind] = value;
    }
    const changed = JSON.stringify(progress) !== JSON.stringify(local.progress) || claimed.join() !== local.claimed.join();
    if (changed) this.write(today, progress, claimed);
    return changed;
  }
}
