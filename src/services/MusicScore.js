// Музыка забега: очень простая спокойная мелодия «в саду». Только данные и расчёты,
// без звука, поэтому её можно проверить тестом. Играет AudioService.
//
// Размер 4/4, 8 тактов, пентатоника до мажора: три ноты на фразу, длинные звуки.
// Аккорды по два такта: C — Am — F — G. Сетка в шестнадцатых: 16 шагов на такт,
// 128 шагов на круг. Под мелодией только мягкий бас и тихий длинный аккорд.

export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const BARS = 8;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

// Ноты по номерам MIDI (60 = до первой октавы).
const C5 = 72;
const D5 = 74;
const E5 = 76;
const G5 = 79;
const A5 = 81;
const C6 = 84;

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// Аккорд каждого такта: корень для баса и три звука для длинного аккорда.
const CHORDS = [
  { root: 48, tones: [60, 64, 67] }, // C
  { root: 48, tones: [60, 64, 67] }, // C
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 43, tones: [55, 59, 62] }, // G
  { root: 43, tones: [55, 59, 62] } // G
];

// Мелодия: [доля от начала круга, нота, длина в долях]. Простые фразы по три ноты.
const MELODY_BEATS = [
  // C
  [0, E5, 1], [1, G5, 1], [2, A5, 2],
  [4, G5, 1], [5, E5, 1], [6, D5, 2],
  // Am
  [8, E5, 1], [9, A5, 1], [10, C6, 2],
  [12, A5, 1], [13, G5, 1], [14, E5, 2],
  // F
  [16, A5, 1], [17, G5, 1], [18, E5, 2],
  [20, G5, 1], [21, A5, 1], [22, G5, 2],
  // G и возвращение к началу
  [24, E5, 1], [25, D5, 1], [26, E5, 2],
  [28, G5, 2], [30, C5, 2]
];

// События по шагам: для каждого из 128 шагов список голосов, которые на нём стартуют.
// Голос: { voice: 'melody' | 'bass' | 'pad', midi, steps, accent }.
function buildSteps() {
  const steps = Array.from({ length: LOOP_STEPS }, () => []);
  const add = (step, event) => {
    if (step >= 0 && step < LOOP_STEPS) steps[step].push(event);
  };

  for (const [beat, midi, length] of MELODY_BEATS) {
    add(Math.round(beat * STEPS_PER_BEAT), {
      voice: 'melody', midi, steps: Math.max(1, Math.round(length * STEPS_PER_BEAT)), accent: 1
    });
  }

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = CHORDS[bar];
    const start = bar * STEPS_PER_BAR;
    // Бас: корень на «раз», квинта на «три».
    add(start, { voice: 'bass', midi: chord.root, steps: 8, accent: 1 });
    add(start + 8, { voice: 'bass', midi: chord.root + 7, steps: 8, accent: 0.75 });
    // Длинный тихий аккорд на два такта.
    if (bar % 2 === 0) {
      for (const midi of chord.tones) {
        add(start, { voice: 'pad', midi, steps: STEPS_PER_BAR * 2, accent: 1 });
      }
    }
  }
  return steps;
}

export const STEP_EVENTS = buildSteps();

// Темп растёт вместе со скоростью забега: t от 0 (старт) до 1 (максимум).
export function bpmFor(t, startBpm = 100, maxBpm = 120) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  return startBpm + (maxBpm - startBpm) * clamped;
}

export function secondsPerStep(bpm) {
  return 60 / bpm / STEPS_PER_BEAT;
}
