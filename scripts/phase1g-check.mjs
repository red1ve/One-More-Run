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
  assert(melody.length >= 20 && melody.length <= 30, `melody should be simple: ${melody.length} notes`);
  // Простота: только мелодия, бас и длинный аккорд (ни арпеджио, ни шейкера).
  assert(!STEP_EVENTS.flat().some((e) => e.voice === 'arp' || e.voice === 'shaker'), 'too busy for a calm tune');
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
  assert(ctx.starts.length > 80, `only ${ctx.starts.length} notes scheduled in ${seconds} s`);
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
  assert(bass.length > 20, 'the bass line is missing');
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


// ---- громкость
check('volume: default 50% is the reference level, 0..100% maps to 0..2x, input is clamped', () => {
  const audio = new AudioService();
  assert(audio.volume === 0.5 && CONFIG.AUDIO.VOLUME_DEFAULT === 0.5, 'default volume must be 50%');
  assert(Math.abs(audio.masterGain() - 1) < 1e-9, '50% must be exactly the level the sounds were tuned for');
  audio.setVolume(1);
  assert(Math.abs(audio.masterGain() - 2) < 1e-9, '100% is twice as loud');
  audio.setVolume(0);
  assert(audio.masterGain() === 0, '0% is silent');
  audio.setVolume(7);
  assert(audio.volume === 1, 'volume above 1 must be clamped');
  audio.setVolume(-3);
  assert(audio.volume === 0, 'volume below 0 must be clamped');
  audio.setVolume('abc');
  assert(audio.volume === 0.5, 'garbage falls back to the default');
});

check('volume: effects and music go through the master gain, volume changes apply live', () => {
  const audio = makeAudio();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = audio.masterGain();
  const connected = [];
  const realCreateGain = audio.ctx.createGain.bind(audio.ctx);
  audio.ctx.createGain = () => {
    const node = realCreateGain();
    const realConnect = node.connect;
    node.connect = (target) => { connected.push(target); return realConnect(target); };
    return node;
  };
  audio.ctx.currentTime = 5; // позже паузы между одинаковыми звуками
  assert(audio.play('coin') === true, 'the effect did not play');
  audio.setMusicActive(true);
  audio.ctx.currentTime = 5.1;
  audio.tickMusic();
  audio.setMusicActive(false);
  assert(connected.includes(audio.master), 'effects or music bypass the master volume');
  assert(!connected.includes(audio.ctx.destination), 'something is connected straight to the speakers');
  audio.setVolume(0.8);
  assert(Math.abs(audio.master.gain.value - 1.6) < 1e-9, 'volume change must reach the master gain at once');
});

check('game: volume steps by 10%, saves, clamps, and plus un-mutes', () => {
  const store = {};
  const audio = new AudioService();
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    audio,
    storage: { set(k, v) { store[k] = v; }, get(k, d) { return k in store ? store[k] : d; } }
  });
  assert(game.changeVolume(1) === 0.6 && store.audioVolume === 0.6, 'plus must add 10% and save it');
  assert(game.changeVolume(-1) === 0.5 && game.changeVolume(-1) === 0.4, 'minus must subtract 10%');
  for (let i = 0; i < 12; i += 1) game.changeVolume(-1);
  assert(audio.volume === 0, 'volume must stop at 0');
  for (let i = 0; i < 14; i += 1) game.changeVolume(1);
  assert(audio.volume === 1, 'volume must stop at 100%');
  audio.setMuted(true);
  game.changeVolume(-1);
  assert(audio.muted === true, 'lowering the volume must not un-mute');
  game.changeVolume(1);
  assert(audio.muted === false && store.audioMuted === false, 'raising the volume must un-mute');
});

check('game: taps on the sound buttons change sound but never start or restart a run', () => {
  const store = {};
  const audio = new AudioService();
  let launched = 0;
  let rendered = 0;
  const hits = { minus: [10, 10], plus: [20, 20], mute: [30, 30] };
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    audio,
    state: 'START',
    renderer: {
      hitSoundButton: (x, y) => Object.keys(hits).find((k) => hits[k][0] === x && hits[k][1] === y) || null
    },
    storage: { set(k, v) { store[k] = v; }, get(k, d) { return k in store ? store[k] : d; } },
    tryLaunch() { launched += 1; return true; },
    render() { rendered += 1; },
    gameOverInputLocked: () => false,
    rewardPending: false
  });
  assert(game.handleTap(10, 10) === false && audio.volume === 0.4, 'minus tap');
  assert(game.handleTap(20, 20) === false && audio.volume === 0.5, 'plus tap');
  assert(game.handleTap(30, 30) === false && audio.muted === true, 'mute tap');
  assert(launched === 0 && rendered === 3, 'sound taps must not launch the game and must redraw the start screen');
  game.handleTap(200, 200);
  assert(launched === 1, 'a tap elsewhere still starts the run');
  game.state = 'PLAYING';
  game.handleTap(10, 10);
  assert(audio.volume === 0.5, 'during a run the sound buttons are not active');
});

check('screens: the sound row has minus, level and plus with tap areas; strings in both languages', () => {
  const en = JSON.parse(readFileSync(new URL('../src/localization/en.json', import.meta.url), 'utf8'));
  const ru = JSON.parse(readFileSync(new URL('../src/localization/ru.json', import.meta.url), 'utf8'));
  assert(en.sound.level.includes('{n}') && ru.sound.level.includes('{n}'), 'sound.level needs {n}');
  const source = readFileSync(new URL('../src/rendering/Renderer.js', import.meta.url), 'utf8');
  assert(source.includes('drawSoundControls(') && source.includes('hitSoundButton('), 'renderer has no sound controls');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(main.includes('Minus') && main.includes('Equal'), 'keyboard volume keys are missing');
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
