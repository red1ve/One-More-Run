// Фаза 3а (шлифовка, 2026-10-22): музыка «Ручей» и тихое окружение (птицы днём, искры ночью).
//  (а) партитура: форма A–B–A′–C на 32 такта, тема возвращается, часть C тише, мелодия не топчется на месте;
//  (б) голоса и громкости: птицы тише первой пробы, птицы и сверчки намного тише мелодии;
//  (в) планировщик окружения на поддельном AudioContext: птицы и сверчки в нужных пределах высоты и частоты,
//      сверчки — несколько голосов с разным ритмом, смена этапа переключает звук, при остановленном времени ничего не копится;
//  (г) игра: этап суток сообщает звуку, что сейчас день (птицы) или ночь (сверчки).
// Запуск: node scripts/phase3a-check.mjs (входит в npm run check).
import fs from 'node:fs';
import { CONFIG } from '../src/config.js';
import { AudioService } from '../src/services/AudioService.js';
import {
  BARS, CHORDS, LOOP_STEPS, SECTIONS, STEPS_PER_BAR, STEP_EVENTS, bpmFor, sectionOfBar, secondsPerStep
} from '../src/services/MusicScore.js';
import { Game } from '../src/game/Game.js';
import { createSeededRandom } from '../src/game/Random.js';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}
function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

const AMBIENCE = CONFIG.MUSIC.AMBIENCE;
const VOICES = CONFIG.MUSIC.VOICES;

// События такта по голосу.
const barEvents = (bar, voice) => STEP_EVENTS.slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR)
  .flatMap((events, index) => events.filter((e) => e.voice === voice).map((e) => ({ ...e, step: index })));
const melodyOf = (bar) => JSON.stringify(barEvents(bar, 'melody').map((e) => [e.midi, e.step, e.steps]));

// ---------------------------------------------------------------- (а) партитура

check('form: 32 bars = A, B, A′, C of 8 bars each; one pass is a minute or more even at top tempo', () => {
  assert(BARS === 32 && LOOP_STEPS === 512, 'the form is 32 bars');
  assert(SECTIONS.map((s) => s.name).join() === 'A,B,A2,C' && SECTIONS.every((s) => s.bars === 8), 'four sections of 8 bars');
  assert(sectionOfBar(0) === 'A' && sectionOfBar(7) === 'A' && sectionOfBar(8) === 'B' && sectionOfBar(16) === 'A2' && sectionOfBar(24) === 'C' && sectionOfBar(31) === 'C', 'section of a bar');
  assert(sectionOfBar(-3) === 'A' && sectionOfBar(99) === 'C' && sectionOfBar('x') === 'A', 'garbage stays inside the form');
  const fastest = LOOP_STEPS * secondsPerStep(bpmFor(1, CONFIG.MUSIC.BPM_START, CONFIG.MUSIC.BPM_MAX));
  assert(fastest >= 60, `one pass lasts ${fastest.toFixed(1)} s at the top tempo: a run would hear a bar twice`);
  assert(CONFIG.MUSIC.BPM_START === 96 && CONFIG.MUSIC.BPM_MAX === 112, 'the tempo of the chosen preview');
});

check('chords: every bar has one chord from the table; the bass root and the arpeggio agree with it', () => {
  const names = Object.keys(CHORDS);
  for (let bar = 0; bar < BARS; bar += 1) {
    const arps = new Set(barEvents(bar, 'arp').map((e) => e.midi));
    const chordName = names.find((name) => [...arps].every((midi) => CHORDS[name].arp.includes(midi)));
    assert(chordName, `bar ${bar + 1}: the arpeggio is not one chord`);
    const bass = barEvents(bar, 'bass');
    assert(bass.length === 2 && bass[0].midi === CHORDS[chordName].root && bass[1].midi === CHORDS[chordName].root + 7, `bar ${bar + 1}: the bass does not play root and fifth of ${chordName}`);
  }
});

check('theme: A comes back as A′ (first six bars the same, a new ending), B is a different, higher part', () => {
  for (let bar = 0; bar < 6; bar += 1) assert(melodyOf(bar) === melodyOf(bar + 16), `bar ${bar + 1} of A′ differs from A`);
  assert(melodyOf(6) !== melodyOf(22) && melodyOf(7) !== melodyOf(23), 'A′ must have its own ending (both last bars differ from A)');
  for (let bar = 0; bar < 8; bar += 1) assert(melodyOf(bar) !== melodyOf(bar + 8), `B repeats bar ${bar + 1} of A`);
  const average = (from) => {
    const notes = [];
    for (let bar = from; bar < from + 8; bar += 1) notes.push(...barEvents(bar, 'melody').map((e) => e.midi));
    return notes.reduce((sum, midi) => sum + midi, 0) / notes.length;
  };
  assert(average(8) > average(0) + 1, `B (${average(8).toFixed(1)}) is not higher than A (${average(0).toFixed(1)})`);
});

check('variety: no melody bar is played three times in a row; every bar is busy enough, none overloaded', () => {
  for (let bar = 2; bar < BARS; bar += 1) assert(!(melodyOf(bar) === melodyOf(bar - 1) && melodyOf(bar) === melodyOf(bar - 2)), `bar ${bar + 1} repeats twice`);
  for (let bar = 0; bar < BARS; bar += 1) {
    const notes = barEvents(bar, 'melody');
    assert(notes.length >= 2 && notes.length <= 7, `bar ${bar + 1} has ${notes.length} melody notes`);
  }
});

check('the quiet part C: the arpeggio is half as dense and softer, the long background stays', () => {
  const arpCount = (bar) => barEvents(bar, 'arp').length;
  for (let bar = 0; bar < 24; bar += 1) assert(arpCount(bar) === 8 && barEvents(bar, 'arp').every((e) => e.accent === 1), `bar ${bar + 1}: the full arpeggio`);
  for (let bar = 24; bar < 32; bar += 1) {
    assert(arpCount(bar) === 4 && barEvents(bar, 'arp').every((e) => e.accent < 1), `bar ${bar + 1}: the thin arpeggio`);
  }
  for (let bar = 0; bar < 32; bar += 4) assert(barEvents(bar, 'pad').length === 3, `no long background chord at bar ${bar + 1}`);
});

// ---------------------------------------------------------------- (б) голоса и громкости

check('voices: all four are described, melody and bass are the loudest, the background is the quietest', () => {
  for (const name of ['melody', 'bass', 'arp', 'pad']) {
    const v = VOICES[name];
    assert(v && ['sine', 'triangle'].includes(v.type) && v.amp > 0 && v.amp <= 0.15 && v.cutoff >= 300 && v.attack > 0 && v.hold > 0 && v.hold <= 1, `voice ${name}: ${JSON.stringify(v)}`);
  }
  assert(VOICES.pad.amp < VOICES.arp.amp && VOICES.arp.amp <= VOICES.melody.amp && VOICES.pad.amp < 0.05, 'the loudness order');
  assert(VOICES.arp.overtone.ratio === 4 && VOICES.arp.overtone.level > 0 && VOICES.arp.maxSeconds <= 0.6, 'the marimba tone');
});

check('ambience: birds are quieter than the first preview, crickets are a quiet background, both far quieter than the melody, stages are real', () => {
  assert(AMBIENCE.BIRDS.AMP < 0.025 && AMBIENCE.BIRDS.AMP > 0.005, `birds ${AMBIENCE.BIRDS.AMP}: the owner asked for them a bit quieter than the first sample (0.025)`);
  assert(AMBIENCE.CRICKETS.AMP <= 0.015 && AMBIENCE.CRICKETS.AMP > 0.003, `crickets ${AMBIENCE.CRICKETS.AMP}: quite quiet, in the background`);
  assert(Math.max(AMBIENCE.BIRDS.AMP, AMBIENCE.CRICKETS.AMP) <= VOICES.melody.amp * 0.25, 'the extras must stay in the background');
  const stages = CONFIG.TIME_OF_DAY.STAGES.map((s) => s.name);
  assert(Object.keys(AMBIENCE.STAGES).every((name) => stages.includes(name)), 'the ambience names a stage that does not exist');
  assert(AMBIENCE.STAGES.day === 'birds' && AMBIENCE.STAGES.night === 'crickets' && Object.keys(AMBIENCE.STAGES).length === 2, 'birds by day, crickets at night, nothing else');
  // Сверчки сделаны по записи пары сверчков, которую дал владелец: два голоса около 4,25 и 4,15 кГц, трель из 4–6 импульсов.
  const c = AMBIENCE.CRICKETS;
  assert(Array.isArray(c.VOICES) && c.VOICES.length >= 2 && c.VOICES.length <= 3, 'a pair of crickets, as in the recording');
  const [main, quiet] = c.VOICES;
  assert(main.level === 1 && quiet.level < main.level && quiet.freq < main.freq, 'the second cricket is quieter and lower');
  assert(c.VOICES.every((v) => v.freq >= 4000 && v.freq <= 4500 && v.period >= 0.5), 'the pitch of the recording, 4–4.5 kHz');
  assert(c.PULSES.every((n) => n >= 3 && n <= 6) && c.PULSE_GAP >= 0.025 && c.PULSE_GAP <= 0.035, 'a trill of a few pulses about 29 ms apart');
  assert(c.PROFILE.length >= Math.max(...c.PULSES) && Math.max(...c.PROFILE) === 1 && c.PROFILE[0] < c.PROFILE[2] && c.PROFILE[c.PROFILE.length - 1] < c.PROFILE[2], 'the trill swells towards the third pulse and fades at the end');
  assert(c.UNEVEN >= 0.2 && c.UNEVEN <= 0.6 && c.REST_CHANCE < 0.3, 'an uneven rhythm with rare rests');
});

// ---------------------------------------------------------------- (в) планировщик окружения

// Поддельный AudioContext: записывает осцилляторы и усилители с их огибающими и куда они подключены.
function makeFakeContext() {
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
    oscillators: [], gains: [],
    resume() { return Promise.resolve(); }, suspend() { return Promise.resolve(); },
    createGain() {
      const node = {
        connectedTo: null,
        peaks: [],
        gain: {
          value: 1,
          setValueAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {},
          linearRampToValueAtTime(value) { node.peaks.push(value); }
        },
        connect(target) { node.connectedTo = target; }
      };
      ctx.gains.push(node);
      return node;
    },
    createOscillator() {
      const osc = {
        type: '', freq: 0, ramp: null, startTime: null, at: null, connectedTo: null,
        frequency: { setValueAtTime(freq) { osc.freq = freq; }, linearRampToValueAtTime(value) { osc.ramp = value; } },
        connect(target) { osc.connectedTo = target; },
        start(time) { osc.startTime = time; osc.at = ctx.currentTime; },
        stop() {}
      };
      ctx.oscillators.push(osc);
      return osc;
    },
    createBiquadFilter() { return { type: '', frequency: { setValueAtTime() {} }, connect() {} }; }
  };
  return ctx;
}

// Музыка «работает», но нот не ставит: слышно только окружение.
function makeAmbientAudio(seed = 1) {
  const audio = new AudioService();
  audio.ctx = makeFakeContext();
  audio.unlocked = true;
  audio.random = createSeededRandom(seed);
  audio.music.gain = audio.ctx.createGain();
  audio.music.running = true;
  audio.music.ambienceTime = AMBIENCE.FIRST_DELAY;
  audio.scheduleMusicStep = () => {};
  return audio;
}
const runFor = (audio, from, to) => {
  for (let t = from; t < to; t += 0.05) {
    audio.ctx.currentTime = t;
    audio.tickMusic();
  }
};
const mains = (audio, from = 0) => audio.ctx.oscillators.slice(from).filter((o) => o.freq >= 1000);

check('birds: short chirps every few seconds, in the bird range, very quiet, never in the past, through the music volume', () => {
  const audio = makeAmbientAudio();
  audio.setAmbience('birds');
  runFor(audio, 0, 60);
  const notes = mains(audio);
  assert(notes.length >= 20 && notes.length <= 120, `${notes.length} chirp notes in a minute`);
  const lowest = AMBIENCE.BIRDS.FREQ_MIN;
  const highest = AMBIENCE.BIRDS.FREQ_MIN + AMBIENCE.BIRDS.FREQ_RANGE;
  for (const note of notes) {
    assert(note.freq >= lowest && note.freq <= highest, `a bird note at ${note.freq.toFixed(0)} Hz`);
    assert(note.ramp !== null && note.ramp > lowest * 0.7 && note.ramp < highest * 1.3, 'each note glides');
    assert(note.startTime >= note.at - 1e-6, 'a chirp was scheduled in the past');
  }
  assert(notes[0].startTime >= AMBIENCE.FIRST_DELAY - 1e-6, 'the first chirp waits a moment');
  const peaks = audio.ctx.gains.flatMap((g) => g.peaks);
  assert(peaks.length > 0 && Math.max(...peaks) <= AMBIENCE.BIRDS.AMP + 1e-9, 'a chirp louder than the setting');
  // Усилители, через которые идёт звук (у них есть огибающая); усилитель дрожания голоса идёт не в динамик, а в высоту тона.
  const voiced = audio.ctx.gains.filter((g) => g.peaks.length > 0);
  assert(voiced.length === notes.length && voiced.every((g) => g.connectedTo === audio.music.gain), 'a chirp bypasses the music volume');
  // Между трелями есть тишина: события не чаще GAP_MIN.
  const starts = [...new Set(notes.map((n) => Math.floor(n.startTime / AMBIENCE.BIRDS.GAP_MIN)))];
  assert(starts.length >= 8, 'chirps are bunched up');
});

check('crickets (as in the owner recording): a loud one near 4.25 kHz and a quieter one lower, a 4–6 pulse trill that swells, an uneven rhythm, a continuous quiet background', () => {
  const audio = makeAmbientAudio(4);
  audio.setAmbience('crickets');
  runFor(audio, 0, 120);
  const cfg = AMBIENCE.CRICKETS;
  const chirps = audio.ctx.oscillators;
  const voiceIndex = (o) => cfg.VOICES.reduce((best, v, i) => (Math.abs(o.freq - v.freq) < Math.abs(o.freq - cfg.VOICES[best].freq) ? i : best), 0);
  for (const o of chirps) {
    const voice = cfg.VOICES[voiceIndex(o)];
    assert(o.type === 'sine' && Math.abs(o.freq - voice.freq) <= voice.freq * 0.006, `a cricket at ${o.freq.toFixed(0)} Hz`);
    assert(o.startTime >= o.at - 1e-6, 'a chirp was scheduled in the past');
  }
  assert(chirps[0].startTime >= AMBIENCE.FIRST_DELAY - 1e-6, 'the first chirp waits a moment');
  const counts = cfg.VOICES.map((_, i) => chirps.filter((o) => voiceIndex(o) === i).length);
  assert(counts[0] >= 80 && counts[0] <= 150, `${counts[0]} chirps of the loud cricket in two minutes`);
  assert(counts[1] >= 15 && counts[1] <= 55 && counts[1] < counts[0] / 2, `${counts[1]} chirps of the quiet cricket`);
  // Усилители: каждый стрекот — 4–6 импульсов; громкость импульсов растёт к третьему и спадает (по PROFILE); всё через громкость музыки.
  const voiced = audio.ctx.gains.filter((g) => g.peaks.length > 0);
  assert(voiced.length === chirps.length && voiced.every((g) => g.connectedTo === audio.music.gain), 'a chirp bypasses the music volume');
  const pulseCounts = new Set();
  voiced.forEach((g, index) => {
    assert(g.peaks.length % 3 === 0, 'every pulse is three ramps (the quick onset, the swell, the cut)');
    const pulses = g.peaks.length / 3;
    pulseCounts.add(pulses);
    assert(cfg.PULSES.includes(pulses), `${pulses} pulses in a chirp`);
    const levels = g.peaks.filter((_, i) => i % 3 === 1);
    const onsets = g.peaks.filter((_, i) => i % 3 === 0);
    const limit = cfg.AMP * cfg.VOICES[voiceIndex(chirps[index])].level * 1.1;
    assert(Math.max(...levels) <= limit + 1e-9, 'a pulse louder than the setting');
    levels.forEach((level, i) => {
      assert(Math.abs(level / levels[0] - cfg.PROFILE[i] / cfg.PROFILE[0]) < 1e-9, 'the loudness of the pulses does not follow the profile');
      assert(Math.abs(onsets[i] / level - 0.35) < 1e-9, 'the quick onset is not a third of the pulse');
    });
  });
  assert([...pulseCounts].sort().join() === [...new Set(cfg.PULSES)].sort().join(), `pulse counts used: ${[...pulseCounts]}`);
  // Ритм: у главного сверчка интервалы около его периода с разбросом ±UNEVEN, а не как у метронома; изредка долгая пауза.
  for (const [i, voice] of cfg.VOICES.entries()) {
    const times = chirps.filter((o) => voiceIndex(o) === i).map((o) => o.startTime).sort((x, y) => x - y);
    const gaps = times.slice(1).map((t, k) => t - times[k]);
    assert(Math.min(...gaps) >= voice.period * (1 - cfg.UNEVEN) - 1e-6, `a cricket chirps too fast: ${Math.min(...gaps).toFixed(2)} s`);
    const regular = gaps.filter((g) => g <= voice.period * (1 + cfg.UNEVEN) + 1e-6);
    const rests = gaps.length - regular.length;
    const mean = regular.reduce((sum, g) => sum + g, 0) / regular.length;
    const spread = Math.sqrt(regular.reduce((sum, g) => sum + (g - mean) ** 2, 0) / regular.length) / mean;
    assert(mean > voice.period * 0.85 && mean < voice.period * 1.15, `the usual interval of a cricket is ${mean.toFixed(2)} s, expected about ${voice.period} s`);
    assert(spread > 0.12 && spread < 0.35, `the rhythm unevenness of cricket ${i + 1} is ${(spread * 100).toFixed(0)}%`);
    if (i === 0) assert(rests >= 3 && rests < gaps.length * 0.25, `${rests} rests of the loud cricket`);
  }
  // Фон сплошной: после первого звука нет «дыр» длиннее трёх секунд.
  const all = chirps.map((o) => o.startTime).sort((x, y) => x - y);
  for (let i = 1; i < all.length; i += 1) assert(all[i] - all[i - 1] < 3, `a ${(all[i] - all[i - 1]).toFixed(1)} s hole in the background`);
});

check('stage change switches the sound at once: birds stop when the night comes, nothing plays with no ambience', () => {
  const audio = makeAmbientAudio(2);
  audio.setAmbience('birds');
  runFor(audio, 0, 30);
  const birds = audio.ctx.oscillators.length;
  assert(birds > 0, 'no birds by day');
  audio.setAmbience('crickets');
  assert(audio.music.ambienceTime >= audio.ctx.currentTime + AMBIENCE.FIRST_DELAY - 1e-6 && audio.music.crickets === null, 'the new sound waits a moment and starts fresh');
  runFor(audio, 30, 60);
  const fresh = audio.ctx.oscillators.slice(birds);
  const cfg = AMBIENCE.CRICKETS;
  assert(fresh.length > 0 && fresh.every((o) => cfg.VOICES.some((v) => Math.abs(o.freq - v.freq) <= v.freq * 0.006)), 'after the switch only crickets are heard');
  // Следующая ночь: сверчки начинаются заново и тоже не сразу (после перерыва с птицами или тишиной).
  const second = makeAmbientAudio(6);
  second.setAmbience('crickets');
  runFor(second, 0, 10);
  assert(second.music.crickets !== null, 'the crickets were never created');
  second.setAmbience('birds');
  runFor(second, 10, 20);
  const beforeNight = second.ctx.oscillators.length;
  const switchedAt = second.ctx.currentTime;
  second.setAmbience('crickets');
  assert(second.music.crickets === null, 'the old cricket voices survive a stage change');
  runFor(second, 20, 24);
  const newChirps = second.ctx.oscillators.slice(beforeNight);
  assert(newChirps.length > 0 && newChirps.every((o) => o.startTime >= switchedAt + AMBIENCE.FIRST_DELAY - 1e-6), 'the second night starts without a pause');
  audio.setAmbience(null);
  const before = audio.ctx.oscillators.length;
  runFor(audio, 60, 90);
  assert(audio.ctx.oscillators.length === before, 'sound kept coming with no ambience');
  audio.setAmbience('rain');
  assert(audio.music.ambience === null, 'an unknown kind must mean silence');
  audio.setAmbience('birds');
  audio.ctx.currentTime = 100;
  audio.music.ambienceTime = 103; // следующее событие уже назначено
  audio.setAmbience('birds');
  assert(audio.music.ambience === 'birds' && audio.music.ambienceTime === 103, 'asking for the same sound again must not move the next event');
});

check('stopped clock, stopped music and a frozen tab: no pile of sounds', () => {
  const audio = makeAmbientAudio(3);
  audio.setAmbience('birds');
  audio.ctx.currentTime = 5;
  audio.tickMusic();
  const before = audio.ctx.oscillators.length;
  for (let i = 0; i < 300; i += 1) audio.tickMusic(); // время стоит: пауза, реклама или без звука
  assert(audio.ctx.oscillators.length === before, 'sounds piled up while the clock was stopped');
  audio.music.running = false;
  audio.ctx.currentTime = 40;
  audio.tickMusic();
  assert(audio.ctx.oscillators.length === before, 'sounds came with the music stopped');
  // Вкладка «спала» 30 секунд: за один тик не больше нескольких событий, и не в прошлом.
  audio.music.running = true;
  audio.ctx.currentTime = 70;
  audio.tickMusic();
  const burst = audio.ctx.oscillators.slice(before);
  assert(burst.length <= 4 * (AMBIENCE.BIRDS.NOTES_MIN + AMBIENCE.BIRDS.NOTES_RANGE) * 2, `${burst.length} oscillators in one tick after a freeze`);
  assert(burst.every((o) => o.startTime >= 70 - 1e-6), 'a sound from the past after the freeze');
  // Сверчки после «сна» вкладки: каждый голос возвращается в настоящее время, куча стрекотов сразу не звучит.
  const night = makeAmbientAudio(8);
  night.setAmbience('crickets');
  runFor(night, 0, 20);
  const nightBefore = night.ctx.oscillators.length;
  night.ctx.currentTime = 80;
  night.tickMusic();
  const nightBurst = night.ctx.oscillators.slice(nightBefore);
  assert(nightBurst.length <= AMBIENCE.CRICKETS.VOICES.length * 2 && nightBurst.every((o) => o.startTime >= 80 - 1e-6), `${nightBurst.length} chirps in one tick after a freeze`);
});

check('starting the music restarts the ambience pause (no chirp right at the first beat)', () => {
  const source = fs.readFileSync(new URL('../src/services/AudioService.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  startMusicLoop() {'), source.indexOf('  stopMusicLoop() {'));
  assert(/music\.ambienceTime = this\.ctx\.currentTime \+ CONFIG\.MUSIC\.AMBIENCE\.FIRST_DELAY;/.test(start), 'startMusicLoop does not reset the ambience pause');
  assert(/this\.scheduleAmbience\(ahead\);/.test(source), 'tickMusic does not schedule the ambience');
});

// ---------------------------------------------------------------- (г) игра

check('game: the time of day tells the sound what to play — birds by day, crickets at night, nothing in between', () => {
  const asked = [];
  const stub = (runTime, stageKey) => ({ runTime, todOffset: 0, stageKey, stageToast: null, feel: { onStage() {} }, audio: { setAmbience: (kind) => asked.push(kind) } });
  const cases = [[48.5, 2, 'crickets'], [80.5, 4, 'birds'], [16.5, 0, null], [32.5, 1, null], [64.5, 3, null]];
  for (const [runTime, from, expected] of cases) {
    asked.length = 0;
    const game = stub(runTime, from);
    Game.prototype.updateStage.call(game, 0.01);
    assert(asked.length === 1 && asked[0] === expected, `at ${runTime} s the sound was asked for ${JSON.stringify(asked)}, expected ${expected}`);
  }
  asked.length = 0;
  const same = stub(49, 3); // этап не менялся: звук не дёргаем
  Game.prototype.updateStage.call(same, 0.01);
  assert(asked.length === 0, 'the sound was asked again without a stage change');
  const source = fs.readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  start() {'), source.indexOf('  // ---- чёткость холста'));
  assert(/this\.audio\?\.setAmbience\?\.\(ambienceFor\(stage\.name\)\);/.test(start), 'a new run does not set its ambience (it starts by day)');
});

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) process.exitCode = 1;
else console.log('All Phase 3a checks passed');
