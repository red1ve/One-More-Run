// Музыка забега: простая спокойная мелодия «в саду». Только данные и расчёты,
// без звука, поэтому её можно проверить тестом. Играет AudioService.
//
// Размер 4/4, 8 тактов, ля-минорная пентатоника в до мажоре. Аккорды по два такта:
// C — Am — F — G. Сетка в шестнадцатых: 16 шагов на такт, 128 шагов на круг.

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

// Аккорд каждого такта: корень для баса и три звука для арпеджио.
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

// Мелодия: [доля от начала круга, нота, длина в долях]. Четыре фразы по два такта.
const MELODY_BEATS = [
  // C: вверх и обратно
  [0, E5, 0.5], [0.5, G5, 0.5], [1, A5, 1], [2, G5, 0.5], [2.5, E5, 0.5], [3, D5, 1],
  [4, C5, 1], [5, D5, 0.5], [5.5, E5, 0.5], [6, G5, 1.5], [7.5, E5, 0.5],
  // Am
  [8, E5, 0.5], [8.5, A5, 0.5], [9, C6, 1], [10, A5, 0.5], [10.5, G5, 0.5], [11, E5, 1],
  [12, D5, 0.5], [12.5, E5, 0.5], [13, G5, 1], [14, E5, 1.5], [15.5, D5, 0.5],
  // F
  [16, A5, 1], [17, G5, 0.5], [17.5, E5, 0.5], [18, G5, 1], [19, A5, 1],
  [20, C6, 1], [21, A5, 0.5], [21.5, G5, 0.5], [22, A5, 1.5], [23.5, G5, 0.5],
  // G и возвращение к началу
  [24, G5, 0.5], [24.5, E5, 0.5], [25, D5, 1], [26, E5, 0.5], [26.5, G5, 0.5], [27, A5, 1],
  [28, G5, 1], [29, E5, 1], [30, D5, 1], [31, C5, 1]
];

// События по шагам: для каждого из 128 шагов список голосов, которые на нём стартуют.
// Голос: { voice: 'melody' | 'bass' | 'arp' | 'shaker', midi, steps, accent }.
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
    // Бас: корень на раз и три, квинта на два, октава на четыре.
    add(start, { voice: 'bass', midi: chord.root, steps: 6, accent: 1 });
    add(start + 4, { voice: 'bass', midi: chord.root + 7, steps: 4, accent: 0.7 });
    add(start + 8, { voice: 'bass', midi: chord.root, steps: 6, accent: 0.9 });
    add(start + 12, { voice: 'bass', midi: chord.root + 12, steps: 4, accent: 0.6 });
    // Арпеджио: восьмые на «и», звуки аккорда по кругу.
    const order = [0, 1, 2, 1];
    for (let i = 0; i < 4; i += 1) {
      add(start + 2 + i * 4, {
        voice: 'arp', midi: chord.tones[order[i]], steps: 3, accent: 1
      });
    }
    // Лёгкий «шейкер» на восьмые, сильнее на «и».
    for (let i = 0; i < 8; i += 1) {
      add(start + i * 2, { voice: 'shaker', midi: 0, steps: 1, accent: i % 2 === 1 ? 1 : 0.55 });
    }
  }
  return steps;
}

export const STEP_EVENTS = buildSteps();

// Темп растёт вместе со скоростью забега: t от 0 (старт) до 1 (максимум).
export function bpmFor(t, startBpm = 108, maxBpm = 132) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  return startBpm + (maxBpm - startBpm) * clamped;
}

export function secondsPerStep(bpm) {
  return 60 / bpm / STEPS_PER_BEAT;
}
