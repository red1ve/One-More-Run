import { CONFIG } from '../config.js';

// Время суток в забеге (только вид, на игру не влияет): день → золотой час → вечер → ночь →
// рассвет → день, цикл CONFIG.TIME_OF_DAY.CYCLE секунд. Чистые функции от времени забега, без
// рисования, поэтому их можно проверять тестом. Рисует Renderer.drawTimeOfDay.

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function smooth(k) {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
}

// Вид этапа: tint — цвет «умножения» поверх сада, wash — лёгкая цветная заливка сверху (без неё
// жёлтый песок при умножении на синее становится серым), glow — тёплое свечение сверху,
// vignette — затемнение по краям, fireflies — сколько светлячков.
function blendLooks(from, to, k) {
  return {
    tint: from.tint.map((value, index) => lerp(value, to.tint[index], k)),
    wash: {
      color: from.wash.color.map((value, index) => lerp(value, to.wash.color[index], k)),
      alpha: lerp(from.wash.alpha, to.wash.alpha, k)
    },
    glow: {
      color: from.glow.color.map((value, index) => lerp(value, to.glow.color[index], k)),
      alpha: lerp(from.glow.alpha, to.glow.alpha, k)
    },
    vignette: lerp(from.vignette, to.vignette, k),
    fireflies: lerp(from.fireflies, to.fireflies, k)
  };
}

// Где мы в цикле. Возвращает:
//   index — номер этапа в STAGES; cycle — какой по счёту цикл (0, 1, ...);
//   key — cycle * 10 + index (меняется ровно при смене этапа: по нему игра узнаёт о рубеже);
//   name — название этапа (ключ строки stage.<name>);
//   look — вид с плавным переходом от предыдущего этапа за BLEND секунд.
export function timeOfDay(runTime) {
  const cfg = CONFIG.TIME_OF_DAY;
  const time = Math.max(0, Number(runTime) || 0);
  const cycle = Math.floor(time / cfg.CYCLE);
  const inCycle = time - cycle * cfg.CYCLE;
  let index = 0;
  for (let i = 0; i < cfg.STAGES.length; i += 1) {
    if (inCycle >= cfg.STAGES[i].from) index = i;
  }
  const stage = cfg.STAGES[index];
  // Первый этап первого цикла — сразу день; дальше каждый этап вытекает из предыдущего.
  const first = cycle === 0 && index === 0;
  const previous = cfg.STAGES[(index + cfg.STAGES.length - 1) % cfg.STAGES.length];
  const k = first ? 1 : smooth((inCycle - stage.from) / cfg.BLEND);
  return {
    index,
    cycle,
    key: cycle * 10 + index,
    name: stage.name,
    look: first ? stage.look : blendLooks(previous.look, stage.look, k)
  };
}

export function stageName(key) {
  const index = ((Math.floor(Number(key)) % 10) + 10) % 10;
  return CONFIG.TIME_OF_DAY.STAGES[index]?.name ?? 'day';
}
