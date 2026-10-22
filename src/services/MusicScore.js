// Музыка забега «Ручей»: лёгкие бегущие арпеджио и певучая мелодия сверху. Только данные и расчёты,
// без звука, поэтому её можно проверить тестом. Играет AudioService.
//
// Размер 4/4, 32 такта в форме A – B – A′ – C (≈ 70 секунд): A — тема, B — вторая, повыше,
// A′ — тема снова с другим концом, C — тихий перерыв, после которого тема возвращается. Так за обычный
// забег слышна вся форма один раз, а не одна и та же короткая петля много раз подряд.
// Сетка в шестнадцатых: 16 шагов на такт, 512 шагов на круг. Все ноты мелодии из пентатоники до мажора
// (до, ре, ми, соль, ля), как и звуки игры, поэтому всё звучит в одном ключе. Аккорды: C, G, Am, F.

export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const BARS = 32;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

// Части формы: с какого такта и сколько тактов.
export const SECTIONS = [
  { name: 'A', from: 0, bars: 8 },
  { name: 'B', from: 8, bars: 8 },
  { name: 'A2', from: 16, bars: 8 },
  { name: 'C', from: 24, bars: 8 }
];

export function sectionOfBar(bar) {
  const index = Math.max(0, Math.min(BARS - 1, Math.floor(Number(bar) || 0)));
  return SECTIONS.find((section) => index >= section.from && index < section.from + section.bars).name;
}

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// «E5» → номер ноты MIDI (60 = до первой октавы).
export function noteToMidi(name) {
  return 12 * (Number(name.slice(-1)) + 1) + SEMITONES[name[0]];
}

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// Аккорды: корень для баса, три звука для длинного фона и четыре для арпеджио.
export const CHORDS = {
  C: { root: 48, pad: [60, 64, 67], arp: [60, 64, 67, 72] },
  G: { root: 43, pad: [55, 59, 62], arp: [59, 62, 67, 71] },
  Am: { root: 45, pad: [57, 60, 64], arp: [57, 60, 64, 69] },
  F: { root: 41, pad: [53, 57, 60], arp: [57, 60, 65, 69] }
};

// Аккорд каждого такта (8 + 8 + 8 + 8).
const BAR_CHORDS = [
  'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', // A
  'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', // B
  'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', // A′
  'F', 'G', 'Am', 'Am', 'F', 'G', 'C', 'C' // C
];

// Мелодия по тактам. Нота: «название:шаг:длина» в шестнадцатых от начала такта (4 шага — одна доля).
const MELODY_BARS = [
  // A: тема
  'G5:0:4 E5:4:2 G5:6:2 A5:8:8',
  'G5:0:4 D5:4:2 E5:6:2 G5:8:8',
  'A5:0:4 G5:4:2 E5:6:2 C6:8:4 A5:12:4',
  'G5:0:6 A5:6:2 G5:8:4 E5:12:4',
  'G5:0:4 E5:4:2 G5:6:2 C6:8:8',
  'D6:0:4 C6:4:2 A5:6:2 G5:8:8',
  'A5:0:4 C6:4:4 A5:8:4 G5:12:4',
  'E5:0:4 G5:4:4 A5:8:4 G5:12:4',
  // B: выше и протяжнее
  'C6:0:4 A5:4:2 C6:6:2 E6:8:8',
  'D6:0:4 C6:4:2 A5:6:2 C6:8:8',
  'G5:0:2 A5:2:2 C6:4:4 E6:8:8',
  'D6:0:4 C6:4:4 A5:8:8',
  'C6:0:4 E6:4:4 D6:8:4 C6:12:4',
  'A5:0:4 C6:4:4 A5:8:8',
  'G5:0:4 E5:4:4 G5:8:8',
  'D5:0:4 E5:4:4 G5:8:8',
  // A′: тема снова, конец другой
  'G5:0:4 E5:4:2 G5:6:2 A5:8:8',
  'G5:0:4 D5:4:2 E5:6:2 G5:8:8',
  'A5:0:4 G5:4:2 E5:6:2 C6:8:4 A5:12:4',
  'G5:0:6 A5:6:2 G5:8:4 E5:12:4',
  'G5:0:4 E5:4:2 G5:6:2 C6:8:8',
  'D6:0:4 C6:4:2 A5:6:2 G5:8:8',
  'A5:0:4 C6:4:4 E6:8:8',
  'D6:0:4 C6:4:4 A5:8:8',
  // C: тихий перерыв, в конце мелодия снова поднимается к теме
  'A5:0:8 C6:8:8',
  'D5:0:8 G5:8:8',
  'E5:0:6 A5:8:8',
  'G5:0:8 E5:8:8',
  'C6:0:8 A5:8:8',
  'D6:0:4 C6:4:4 A5:8:4 G5:12:4',
  'G5:0:4 E5:4:4 G5:8:4 C6:12:4',
  'E5:0:4 G5:4:4 A5:8:4 D5:12:4'
];

// Порядок звуков арпеджио в такте (индексы в CHORDS[..].arp): вверх и вниз.
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 1];

function parseBar(text) {
  return text.split(/\s+/).filter(Boolean).map((token) => {
    const [name, step, length] = token.split(':');
    return { midi: noteToMidi(name), step: Number(step), steps: Number(length) };
  });
}

// События по шагам: для каждого из 512 шагов список голосов, которые на нём стартуют.
// Голос: { voice: 'melody' | 'bass' | 'arp' | 'pad', midi, steps, accent } (accent — во сколько раз тише или громче
// обычного голоса, см. CONFIG.MUSIC.VOICES).
function buildSteps() {
  const steps = Array.from({ length: LOOP_STEPS }, () => []);
  const add = (step, event) => {
    if (step >= 0 && step < LOOP_STEPS) steps[step].push(event);
  };

  for (let bar = 0; bar < BARS; bar += 1) {
    const start = bar * STEPS_PER_BAR;
    const chord = CHORDS[BAR_CHORDS[bar]];
    const quiet = sectionOfBar(bar) === 'C';

    for (const note of parseBar(MELODY_BARS[bar])) {
      add(start + note.step, { voice: 'melody', midi: note.midi, steps: note.steps, accent: 1 });
    }
    // Бас: корень на «раз», квинта на «три».
    add(start, { voice: 'bass', midi: chord.root, steps: 8, accent: 1 });
    add(start + 8, { voice: 'bass', midi: chord.root + 7, steps: 8, accent: 0.7 });
    // Арпеджио восьмыми; в тихой части C через одну и тише.
    ARP_ORDER.forEach((index, i) => {
      if (quiet && i % 2 === 1) return;
      add(start + i * 2, { voice: 'arp', midi: chord.arp[index], steps: 4, accent: quiet ? 0.82 : 1 });
    });
    // Длинный тихий аккорд на четыре такта.
    if (bar % 4 === 0) {
      for (const midi of chord.pad) add(start, { voice: 'pad', midi, steps: STEPS_PER_BAR * 4, accent: 1 });
    }
  }
  return steps;
}

export const STEP_EVENTS = buildSteps();

// Темп растёт вместе со скоростью забега: t от 0 (старт) до 1 (максимум).
export function bpmFor(t, startBpm = 96, maxBpm = 112) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  return startBpm + (maxBpm - startBpm) * clamped;
}

export function secondsPerStep(bpm) {
  return 60 / bpm / STEPS_PER_BEAT;
}
