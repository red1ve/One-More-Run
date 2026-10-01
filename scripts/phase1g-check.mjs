// Звук: мяуканья больше нет, музыка забега звучит правильно.
//  (а) мяуканья нет ни в коде, ни в файлах, ни в настройках;
//  (б) партитура: ноты из нужного набора, мелодия не наезжает сама на себя, круг замкнут;
//  (в) планировщик с поддельным AudioContext: ноты идут вперёд по времени, не в прошлое,
//      темп растёт со скоростью, при остановленном времени (пауза/реклама) ничего не копится;
//  (г) музыка включается и выключается вместе с забегом, до жеста игрока не стартует.
// Запуск: node scripts/phase1g-check.mjs (входит в npm run check).
import { existsSync, readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { AudioService } from '../src/services/AudioService.js';
import {
  LOOP_STEPS, STEPS_PER_BAR, STEP_EVENTS, bpmFor, midiToFreq, secondsPerStep
} from '../src/services/MusicScore.js';
import { Game } from '../src/game/Game.js';

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

// Поддельный AudioContext: записывает, какие ноты и когда поставлены в расписание.
function makeFakeContext() {
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    starts: [], // { freq, time, type, at } at = currentTime в момент постановки
    shakers: [],
    gainRamps: [],
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
    createGain() {
      const gain = {
        value: 1,
        setValueAtTime() {},
        cancelScheduledValues() {},
        exponentialRampToValueAtTime() {},
        linearRampToValueAtTime(value, time) { ctx.gainRamps.push({ value, time }); }
      };
      return { gain, connect() {} };
    },
    createOscillator() {
      const osc = {
        type: '',
        freq: 0,
        frequency: { setValueAtTime(freq) { osc.freq = freq; } },
        connect() {},
        start(time) { ctx.starts.push({ freq: osc.freq, time, type: osc.type, at: ctx.currentTime }); },
        stop() {}
      };
      return osc;
    },
    createBiquadFilter() {
      return { type: '', frequency: { setValueAtTime() {} }, connect() {} };
    },
    createBuffer(channels, length) {
      return { getChannelData() { return new Float32Array(length); } };
    },
    createBufferSource() {
      return { buffer: null, connect() {}, start(time) { ctx.shakers.push(time); } };
    }
  };
  return ctx;
}

function makeAudio() {
  const audio = new AudioService();
  audio.ctx = makeFakeContext();
  audio.unlocked = true;
  return audio;
}

// ---- (а) мяуканья нет
check('the meow is gone from files, settings and code', () => {
  assert(!existsSync(new URL('../assets/audio/meow.ogg', import.meta.url)), 'meow.ogg is still there');
  assert(CONFIG.FEEL.MEOW_COOLDOWN === undefined, 'MEOW_COOLDOWN is still in the config');
  const feel = readFileSync(new URL('../src/game/GameFeel.js', import.meta.url), 'utf8');
  const audioService = readFileSync(new URL('../src/services/AudioService.js', import.meta.url), 'utf8');
  assert(!/meow/i.test(feel), 'GameFeel still mentions meow');
  assert(!/meow/i.test(audioService), 'AudioService still mentions meow');
});

// ---- (б) партитура
check('score: 128 steps, melody notes from the allowed set, no overlaps, loop closes', () => {
  assert(LOOP_STEPS === 128 && STEP_EVENTS.length === LOOP_STEPS, 'loop must be 8 bars of 16 steps');
  const allowed = new Set([72, 74, 76, 79, 81, 84]);
  const melody = [];
  STEP_EVENTS.forEach((events, step) => {
    for (const event of events) {
      if (event.voice === 'melody') {
        assert(allowed.has(event.midi), `melody note ${event.midi} is not in the pentatonic set`);
        melody.push({ step, steps: event.steps });
      }
      if (event.voice !== 'shaker') {
        const freq = midiToFreq(event.midi);
        assert(freq > 60 && freq < 2200, `frequency ${freq.toFixed(0)} Hz is out of range`);
      }
      assert(step + event.steps <= LOOP_STEPS + 1, 'a note runs past the end of the loop');
    }
  });
  melody.sort((a, b) => a.step - b.step);
  for (let i = 1; i < melody.length; i += 1) {
    assert(melody[i - 1].step + melody[i - 1].steps <= melody[i].step, `melody notes overlap at step ${melody[i].step}`);
  }
  assert(melody.length >= 40, 'melody is too sparse');
  // Каждый такт: бас на «раз» и три шейкера на «и».
  for (let bar = 0; bar < 8; bar += 1) {
    const events = STEP_EVENTS[bar * STEPS_PER_BAR];
    assert(events.some((event) => event.voice === 'bass'), `bar ${bar + 1} has no bass on the downbeat`);
  }
});

check('tempo: starts at BPM_START, grows with speed, never outside the range', () => {
  assert(bpmFor(0) === CONFIG.MUSIC.BPM_START && bpmFor(1) === CONFIG.MUSIC.BPM_MAX, 'tempo endpoints');
  assert(bpmFor(-5) === bpmFor(0) && bpmFor(9) === bpmFor(1), 'tempo must be clamped');
  assert(secondsPerStep(bpmFor(1)) < secondsPerStep(bpmFor(0)), 'faster run, faster music');
});

// ---- (в) планировщик
check('scheduler: notes go forward in time, never into the past, whole loop plays', () => {
  const audio = makeAudio();
  const ctx = audio.ctx;
  audio.setMusicActive(true);
  const seconds = 40;
  for (let t = 0; t < seconds; t += 0.05) {
    ctx.currentTime = t;
    audio.tickMusic();
  }
  audio.setMusicActive(false);
  assert(ctx.starts.length > 200, `only ${ctx.starts.length} notes scheduled in ${seconds} s`);
  let last = -1;
  const melodyFreqs = new Set([72, 74, 76, 79, 81, 84].map((midi) => Math.round(midiToFreq(midi))));
  for (const note of ctx.starts) {
    assert(note.time >= note.at - 1e-6, 'a note was scheduled in the past');
    last = note.time;
  }
  const heard = new Set(ctx.starts.filter((n) => n.type === 'triangle' && n.freq > 450).map((n) => Math.round(n.freq)));
  for (const freq of heard) assert(melodyFreqs.has(freq), `unexpected melody pitch ${freq}`);
  assert(heard.size === melodyFreqs.size, 'not every pentatonic note was played');
  // 40 секунд при 108 BPM (примерно 14,4 шага/с): круг из 128 шагов (~8,9 с) проходит несколько раз.
  const bass = ctx.starts.filter((n) => n.freq < 200);
  assert(bass.length > 40, 'the bass line is missing');
});

check('scheduler: a stopped clock (pause, ad, muted) does not pile up notes', () => {
  const audio = makeAudio();
  const ctx = audio.ctx;
  audio.setMusicActive(true);
  ctx.currentTime = 5;
  audio.tickMusic();
  const before = ctx.starts.length;
  for (let i = 0; i < 200; i += 1) audio.tickMusic();
  assert(ctx.starts.length === before, 'notes kept being scheduled while the clock was stopped');
  audio.setMusicActive(false);
});

check('scheduler: higher intensity means a faster tempo', () => {
  const slow = makeAudio();
  const fast = makeAudio();
  fast.setMusicIntensity(1);
  for (const audio of [slow, fast]) {
    audio.setMusicActive(true);
    for (let t = 0; t < 10; t += 0.05) {
      audio.ctx.currentTime = t;
      audio.tickMusic();
    }
    audio.setMusicActive(false);
  }
  assert(fast.ctx.starts.length > slow.ctx.starts.length * 1.1, 'tempo did not change with intensity');
});

// ---- (г) жизненный цикл
check('music waits for the first tap, then starts; stop fades out and clears the timer', () => {
  const audio = new AudioService();
  const FakeAudioContext = function FakeAudioContext() { return makeFakeContext(); };
  const saved = globalThis.AudioContext;
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  const live = new Set(); // настоящие таймеры, которые ещё не остановлены
  globalThis.setInterval = (fn, ms) => { const id = realSet(fn, ms); live.add(id); return id; };
  globalThis.clearInterval = (id) => { live.delete(id); realClear(id); };
  globalThis.AudioContext = FakeAudioContext;
  try {
    audio.setMusicActive(true);
    assert(audio.music.running === false, 'music must not start before the first gesture');
    audio.unlock();
    assert(audio.music.running === true, 'music must start once sound is unlocked');
    assert(live.size === 1, 'music must run exactly one timer');
    audio.setMusicActive(false);
    assert(audio.music.running === false && audio.music.timer === null, 'stop must clear the timer');
    assert(live.size === 0, 'stop left a timer running');
    const ramps = audio.ctx.gainRamps;
    assert(ramps.length >= 2 && ramps[ramps.length - 1].value <= 0.001, 'stop must fade the music out');
    audio.setMusicActive(true);
    assert(audio.music.running === true, 'revive/restart starts the music again');
    audio.setMusicActive(false);
    assert(live.size === 0, 'restart/stop left a timer running');
  } finally {
    globalThis.AudioContext = saved;
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
    for (const id of live) realClear(id);
  }
});

check('game: music runs only during PLAYING (start, revive) and stops on game over', () => {
  const calls = [];
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    audio: { setMusicActive(on) { calls.push(on); } },
    platform: null, hidden: false, platformPaused: false, adPaused: false
  });
  game.state = 'PLAYING';
  game.syncGameplayLifecycle();
  game.state = 'GAMEOVER';
  game.syncGameplayLifecycle();
  game.state = 'START';
  game.syncGameplayLifecycle();
  assert(calls.join() === 'true,false,false', `unexpected music requests: ${calls.join()}`);
});

check('game: music tempo follows the run speed', () => {
  const source = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  assert(/setMusicIntensity/.test(source), 'Game does not pass the run speed to the music');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1g check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1g checks passed');
}
// Таймер музыки не должен держать процесс (и проверку) живым, даже если его забыли остановить.
process.exit(failed.length ? 1 : 0);
