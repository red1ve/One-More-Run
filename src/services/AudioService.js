import { CONFIG } from '../config.js';
import {
  LOOP_STEPS,
  STEP_EVENTS,
  bpmFor,
  midiToFreq,
  secondsPerStep
} from './MusicScore.js';

// Во сколько раз поднимается тон на ступени step серии: ноты пентатоники (в тон музыке), выше
// последней ступени не идёт. step 0 (или мусор) — тон не меняется.
export function scaleRatio(step) {
  const steps = CONFIG.FEEL.SCALE_SEMITONES;
  const index = Math.max(0, Math.min(steps.length - 1, Math.floor(Number(step) || 0)));
  return 2 ** (steps[index] / 12);
}

// Звуки: короткие эффекты (тоны) и спокойная музыка забега. Всё синтезируется
// Web Audio, звуковых файлов нет. Контекст запускается только после жеста игрока
// и приостанавливается, когда вкладка скрыта, идёт реклама или пауза платформы.
export class AudioService {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.hidden = false;
    this.adPaused = false;
    this.platformPaused = false;
    this.lastPlayed = {};
    this.volume = CONFIG.AUDIO.VOLUME_DEFAULT; // 0..1, выбирает игрок
    this.master = null; // общий регулятор громкости: через него идёт всё (эффекты и музыка)
    this.music = {
      active: false, // игра просит музыку (идёт забег)
      running: false, // планировщик крутится
      step: 0,
      nextTime: 0,
      intensity: 0,
      timer: null,
      gain: null
    };
  }

  unlock() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return false;
    if (!this.ctx) this.ctx = new Ctx();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterGain();
      this.master.connect(this.ctx.destination);
    }
    this.unlocked = true;
    this.syncContext();
    // Музыку могли попросить до первого жеста: запускаем, как только звук разрешён.
    if (this.music.active && !this.music.running) this.startMusicLoop();
    return true;
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.syncContext();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Громкость 0..1. 0,5 — «нормальная» (как настроены эффекты и музыка): выше — громче,
  // ниже — тише. Звук выключается отдельно (M), громкость при этом сохраняется.
  setVolume(volume) {
    const value = Number(volume);
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : CONFIG.AUDIO.VOLUME_DEFAULT;
    if (this.master) this.master.gain.value = this.masterGain();
  }

  masterGain() {
    return this.volume * CONFIG.AUDIO.MASTER_SCALE;
  }

  // Куда подключать звуки: через общий регулятор громкости.
  output() {
    return this.master || this.ctx.destination;
  }

  setHidden(hidden) {
    this.hidden = !!hidden;
    this.syncContext();
  }

  setAdPaused(paused) {
    this.adPaused = !!paused;
    this.syncContext();
  }

  setPlatformPaused(paused) {
    this.platformPaused = !!paused;
    this.syncContext();
  }

  syncContext() {
    if (!this.ctx) return;
    const shouldRun = this.unlocked
      && !this.muted
      && !this.hidden
      && !this.adPaused
      && !this.platformPaused;
    if (shouldRun && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    } else if (!shouldRun && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  canPlay() {
    return !!(
      this.unlocked
      && this.ctx
      && !this.muted
      && !this.hidden
      && !this.adPaused
      && !this.platformPaused
    );
  }

  // options.step — ступень серии (0, 1, 2...): тон монеты, рискованного прохода и «чуть не задел»
  // поднимается по пентатонике (scaleRatio).
  play(name, options = {}) {
    if (!this.canPlay()) return false;
    const now = this.ctx.currentTime;

    const last = this.lastPlayed[name] || 0;
    if (now - last < CONFIG.FEEL.AUDIO_COOLDOWN && name !== 'gameover' && name !== 'newbest') {
      return false;
    }
    this.lastPlayed[name] = now;

    const rise = scaleRatio(options.step);
    if (name === 'coin') this.tone(980 * rise, 0.06, 'triangle', 0.45);
    else if (name === 'safe') this.tone(320, 0.06, 'sine', 0.35);
    else if (name === 'risk') this.tone(523.25 * rise, 0.1, 'triangle', 0.5);
    else if (name === 'graze') this.tone(1046.5 * rise, 0.05, 'triangle', 0.4);
    else if (name === 'stage') {
      // Новый этап суток: четыре ноты пентатоники вверх (до, ми, соль, до).
      this.tone(523.25, 0.12, 'triangle', 0.42);
      this.tone(659.25, 0.12, 'triangle', 0.42, 0.07);
      this.tone(783.99, 0.14, 'triangle', 0.42, 0.14);
      this.tone(1046.5, 0.28, 'sine', 0.4, 0.21);
    }
    else if (name === 'streak') {
      this.tone(520, 0.07, 'square', 0.5);
      this.tone(720, 0.1, 'triangle', 0.45, 0.05);
    }
    else if (name === 'streaklost') {
      this.tone(360, 0.1, 'sine', 0.4);
      this.tone(220, 0.14, 'triangle', 0.35, 0.05);
    }
    else if (name === 'max') {
      this.tone(660, 0.12, 'square', 0.6);
      this.tone(880, 0.16, 'triangle', 0.5, 0.04);
      this.tone(1170, 0.18, 'sine', 0.4, 0.08);
    }
    else if (name === 'newbest') {
      this.tone(740, 0.1, 'triangle', 0.5);
      this.tone(980, 0.14, 'sine', 0.45, 0.05);
    }
    else if (name === 'gameover') {
      this.tone(240, 0.18, 'sawtooth', 0.5);
      this.tone(140, 0.28, 'sine', 0.45, 0.08);
    }
    return true;
  }

  tone(freq, duration, type, volume, delay = 0) {
    if (!this.ctx || this.muted || this.hidden || this.adPaused || this.platformPaused) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const amp = CONFIG.FEEL.AUDIO_VOLUME * volume;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.output());
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // --- Музыка забега ---
  // Игра говорит только «музыка нужна / не нужна» и «насколько быстро идёт забег».
  // Ноты ставятся в расписание Web Audio чуть вперёд; пока контекст приостановлен
  // (пауза, реклама, звук выключен), его время стоит, и музыка стоит вместе с ним.

  setMusicActive(active) {
    const music = this.music;
    const wanted = !!active && CONFIG.MUSIC.ENABLED;
    if (wanted === music.active) return;
    music.active = wanted;
    if (wanted) {
      if (this.unlocked && this.ctx) this.startMusicLoop();
    } else {
      this.stopMusicLoop();
    }
  }

  // 0 — начало забега, 1 — максимальная скорость. Влияет на темп.
  setMusicIntensity(t) {
    this.music.intensity = Math.max(0, Math.min(1, Number(t) || 0));
  }

  musicBpm() {
    return bpmFor(this.music.intensity, CONFIG.MUSIC.BPM_START, CONFIG.MUSIC.BPM_MAX);
  }

  startMusicLoop() {
    const music = this.music;
    if (music.running || !this.ctx) return;
    music.running = true;
    music.step = 0;
    music.nextTime = this.ctx.currentTime + 0.08;
    if (!music.gain) {
      music.gain = this.ctx.createGain();
      music.gain.connect(this.output());
    }
    const now = this.ctx.currentTime;
    music.gain.gain.cancelScheduledValues(now);
    music.gain.gain.setValueAtTime(0.0001, now);
    music.gain.gain.linearRampToValueAtTime(CONFIG.MUSIC.VOLUME, now + CONFIG.MUSIC.FADE_IN);
    this.tickMusic();
    music.timer = setInterval(() => this.tickMusic(), CONFIG.MUSIC.TICK_MS);
  }

  stopMusicLoop() {
    const music = this.music;
    if (!music.running) return;
    music.running = false;
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
    if (this.ctx && music.gain) {
      const now = this.ctx.currentTime;
      music.gain.gain.cancelScheduledValues(now);
      music.gain.gain.setValueAtTime(Math.max(0.0001, music.gain.gain.value || CONFIG.MUSIC.VOLUME), now);
      music.gain.gain.linearRampToValueAtTime(0.0001, now + CONFIG.MUSIC.FADE_OUT);
    }
  }

  tickMusic() {
    const music = this.music;
    if (!music.running || !this.ctx) return;
    const ahead = this.ctx.currentTime + CONFIG.MUSIC.LOOKAHEAD;
    // Если планировщик сильно отстал (вкладка тормозила), не вываливаем кучу нот разом.
    if (music.nextTime < this.ctx.currentTime - 0.5) music.nextTime = this.ctx.currentTime + 0.05;
    let guard = 0;
    while (music.nextTime < ahead && guard < 64) {
      this.scheduleMusicStep(music.step, music.nextTime);
      music.step = (music.step + 1) % LOOP_STEPS;
      music.nextTime += secondsPerStep(this.musicBpm());
      guard += 1;
    }
  }

  scheduleMusicStep(step, time) {
    const events = STEP_EVENTS[step];
    const stepLength = secondsPerStep(this.musicBpm());
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const length = event.steps * stepLength;
      if (event.voice === 'melody') {
        this.musicVoice('triangle', midiToFreq(event.midi), time, length * 0.95, 0.11 * event.accent, 2800, 0.01, false);
      } else if (event.voice === 'bass') {
        this.musicVoice('triangle', midiToFreq(event.midi), time, length * 0.92, 0.12 * event.accent, 480, 0.02, false);
      } else if (event.voice === 'pad') {
        this.musicVoice('sine', midiToFreq(event.midi), time, length, 0.032 * event.accent, 1400, 0.35, true);
      }
    }
  }

  // Один звук музыки. Щипок (sustain = false): быстро берётся и затухает. Длинный аккорд
  // (sustain = true): плавно нарастает, держится и плавно уходит.
  musicVoice(type, freq, time, duration, amp, cutoff, attack = 0.01, sustain = false) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const length = Math.max(0.05, duration);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, amp), time + attack);
    if (sustain) {
      gain.gain.linearRampToValueAtTime(Math.max(0.001, amp), time + Math.max(attack, length - 0.4));
      gain.gain.linearRampToValueAtTime(0.0001, time + length);
    } else {
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    }
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.music.gain);
    osc.start(time);
    osc.stop(time + length + 0.03);
  }
}
