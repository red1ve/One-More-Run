import { CONFIG } from '../config.js';
import {
  LOOP_STEPS,
  STEP_EVENTS,
  bpmFor,
  midiToFreq,
  secondsPerStep
} from './MusicScore.js';

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
    this.music = {
      active: false, // игра просит музыку (идёт забег)
      running: false, // планировщик крутится
      step: 0,
      nextTime: 0,
      intensity: 0,
      timer: null,
      gain: null,
      noise: null
    };
  }

  unlock() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return false;
    if (!this.ctx) this.ctx = new Ctx();
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

  play(name) {
    if (!this.canPlay()) return false;
    const now = this.ctx.currentTime;

    const last = this.lastPlayed[name] || 0;
    if (now - last < CONFIG.FEEL.AUDIO_COOLDOWN && name !== 'gameover' && name !== 'newbest') {
      return false;
    }
    this.lastPlayed[name] = now;

    if (name === 'coin') this.tone(980, 0.06, 'triangle', 0.45);
    else if (name === 'safe') this.tone(320, 0.06, 'sine', 0.35);
    else if (name === 'risk') this.tone(440, 0.09, 'square', 0.55);
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
    gain.connect(this.ctx.destination);
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
      music.gain.connect(this.ctx.destination);
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
        this.musicVoice('triangle', midiToFreq(event.midi), time, length * 0.95, 0.10 * event.accent, 3200);
      } else if (event.voice === 'bass') {
        this.musicVoice('triangle', midiToFreq(event.midi), time, length * 0.9, 0.13 * event.accent, 520);
      } else if (event.voice === 'arp') {
        this.musicVoice('sine', midiToFreq(event.midi), time, length * 0.8, 0.05 * event.accent, 2400);
      } else if (event.voice === 'shaker') {
        this.musicShaker(time, 0.014 * event.accent);
      }
    }
  }

  musicVoice(type, freq, time, duration, amp, cutoff) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, amp), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.05, duration));
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.music.gain);
    osc.start(time);
    osc.stop(time + Math.max(0.05, duration) + 0.03);
  }

  musicShaker(time, amp) {
    const ctx = this.ctx;
    const music = this.music;
    if (!music.noise) {
      const length = Math.floor(ctx.sampleRate * 0.06);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      music.noise = buffer;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = music.noise;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, time);
    gain.gain.setValueAtTime(Math.max(0.001, amp), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(music.gain);
    source.start(time);
  }
}
