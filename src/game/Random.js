// Случайные числа для генератора трассы.
// По умолчанию — обычный Math.random (его подменяют старые тесты).
// С номером забега (seed) — повторяемая последовательность: один и тот же seed
// даёт одну и ту же трассу (тесты, в будущем «забег дня»).

export function systemRandom() {
  return Math.random();
}

// mulberry32: короткий и быстрый генератор с хорошим распределением.
export function createSeededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
