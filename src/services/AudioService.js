import { CONFIG } from '../config.js';

const MEOW_URL = new URL('../../assets/audio/meow.ogg', import.meta.url).href;

export class AudioService {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.hidden = false;
    this.adPaused = false;
    this.platformPaused = false;
    this.lastPlayed = {};
    this.meowBuffer = null;
    this.meowBytes = null;
    this.meowFailed = false;
    this.meowWarned = false;
    this.meowLoadStarted = false;
  }

  ensureMeowLoaded() {
    if (this.meowLoadStarted || this.meowFailed) return;
    this.meowLoadStarted = true;
    if (typeof fetch !== 'function') {
      this.failMeow('fetch unavailable');
      return;
    }
    fetch(MEOW_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`meow ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => {
        this.meowBytes = bytes;
        this.decodeMeow();
      })
      .catch(() => this.failMeow('missing or unreadable meow asset'));
  }

  failMeow(reason) {
    this.meowFailed = true;
    if (!this.meowWarned) {
      this.meowWarned = true;
      console.warn(`AudioService: RISK meow disabled (${reason})`);
    }
  }

  unlock() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return false;
    if (!this.ctx) this.ctx = new Ctx();
    this.unlocked = true;
    this.syncContext();
    this.ensureMeowLoaded();
    this.decodeMeow();
    return true;
  }

  decodeMeow() {
    if (this.meowFailed || this.meowBuffer || !this.ctx || !this.meowBytes) return;
    if (typeof this.ctx.decodeAudioData !== 'function') return;
    const copy = this.meowBytes.slice(0);
    Promise.resolve(this.ctx.decodeAudioData(copy))
      .then((buffer) => {
        this.meowBuffer = buffer;
      })
      .catch(() => this.failMeow('could not decode meow asset'));
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
    if (name === 'meow') return this.playMeow(now);

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

  playMeow(now) {
    if (
      this.lastPlayed.meow !== undefined
      && now - this.lastPlayed.meow < CONFIG.FEEL.MEOW_COOLDOWN
    ) return false;
    this.ensureMeowLoaded();
    this.decodeMeow();
    if (this.meowFailed) return false;
    if (!this.meowBuffer || typeof this.ctx.createBufferSource !== 'function') return false;

    try {
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = this.meowBuffer;
      source.playbackRate.value = 0.97 + Math.random() * 0.06;
      const amp = CONFIG.FEEL.AUDIO_VOLUME * (0.85 + Math.random() * 0.12);
      gain.gain.setValueAtTime(Math.max(0.001, amp), now);
      source.connect(gain);
      gain.connect(this.ctx.destination);
      source.start(now);
      this.lastPlayed.meow = now;
      return true;
    } catch (error) {
      this.failMeow(error.message || 'meow playback failed');
      return false;
    }
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
}
