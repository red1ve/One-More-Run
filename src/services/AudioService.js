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
      gain: null,
      ambience: null, // 'birds' | 'crickets' | null: что тихо звучит поверх музыки (по времени суток)
      ambienceTime: 0, // когда поставить следующее событие окружения (птицы) или начать сверчков
      crickets: null // голоса сверчков: [{ time, freq, period }], создаются при первом стрекоте
    };
    this.random = Math.random; // для птиц и искр; тест подставляет свой
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
    else if (name === 'buy') {
      // Покупка в магазине: звонкая монетка и ступенька вверх.
      this.tone(880, 0.06, 'triangle', 0.45);
      this.tone(1318.5, 0.16, 'sine', 0.42, 0.06);
    }
    else if (name === 'nope') this.tone(196, 0.12, 'sine', 0.38);
    else if (name === 'yarn') {
      // Клубок подобран: две быстрые ноты вверх.
      this.tone(659.25, 0.08, 'triangle', 0.45);
      this.tone(987.77, 0.16, 'sine', 0.42, 0.05);
    }
    else if (name === 'shieldbreak') {
      // Щит сломался: глухой хруст и высокий щелчок.
      this.tone(170, 0.14, 'sawtooth', 0.5);
      this.tone(110, 0.2, 'square', 0.4, 0.03);
      this.tone(1400, 0.05, 'triangle', 0.35, 0.02);
    }
    else if (name === 'shieldend') {
      // Щит погас: мягко вниз.
      this.tone(440, 0.1, 'sine', 0.3);
      this.tone(330, 0.14, 'sine', 0.26, 0.06);
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
    music.ambienceTime = this.ctx.currentTime + CONFIG.MUSIC.AMBIENCE.FIRST_DELAY;
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
    this.scheduleAmbience(ahead);
  }

  scheduleMusicStep(step, time) {
    const events = STEP_EVENTS[step];
    const stepLength = secondsPerStep(this.musicBpm());
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const voice = CONFIG.MUSIC.VOICES[event.voice];
      if (!voice) continue;
      const length = event.steps * stepLength;
      const duration = Math.min(length * voice.hold, voice.maxSeconds ?? Infinity);
      this.musicVoice(voice.type, midiToFreq(event.midi), time, duration, voice.amp * event.accent, voice.cutoff, voice.attack, event.voice === 'pad', voice.overtone);
    }
  }

  // Один звук музыки. Щипок (sustain = false): быстро берётся и затухает. Длинный аккорд
  // (sustain = true): плавно нарастает, держится и плавно уходит. overtone — { ratio, level, decay }: ещё один
  // тихий звук на ratio раз выше, он быстро гаснет за decay секунд (так звучит дерево маримбы).
  musicVoice(type, freq, time, duration, amp, cutoff, attack = 0.01, sustain = false, overtone = null) {
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
    if (overtone) {
      const high = ctx.createOscillator();
      const highGain = ctx.createGain();
      high.type = 'sine';
      high.frequency.setValueAtTime(freq * overtone.ratio, time);
      highGain.gain.setValueAtTime(overtone.level, time);
      highGain.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(length, overtone.decay * 8));
      high.connect(highGain);
      highGain.connect(filter);
      high.start(time);
      high.stop(time + length + 0.03);
    }
    filter.connect(gain);
    gain.connect(this.music.gain);
    osc.start(time);
    osc.stop(time + length + 0.03);
  }

  // --- Окружение: очень тихие добавки поверх музыки, по времени суток ---
  // Игра говорит только, какой сейчас этап: 'birds' днём, 'crickets' ночью, null — ничего.

  setAmbience(kind) {
    const next = kind === 'birds' || kind === 'crickets' ? kind : null;
    const music = this.music;
    if (music.ambience === next) return;
    music.ambience = next;
    music.crickets = null;
    // Новый этап: первое событие не сразу, а после небольшой паузы.
    if (this.ctx) music.ambienceTime = this.ctx.currentTime + CONFIG.MUSIC.AMBIENCE.FIRST_DELAY;
  }

  // Ставит в расписание события окружения, которые попадают в окно «вперёд до ahead».
  scheduleAmbience(ahead) {
    const music = this.music;
    const kind = music.ambience;
    if (!kind || !this.ctx) return;
    if (kind === 'crickets') {
      this.scheduleCrickets(ahead, CONFIG.MUSIC.AMBIENCE.CRICKETS);
      return;
    }
    const cfg = CONFIG.MUSIC.AMBIENCE.BIRDS;
    // Если планировщик сильно отстал (вкладка тормозила), не вываливаем кучу звуков разом.
    if (music.ambienceTime < this.ctx.currentTime - 0.5) music.ambienceTime = this.ctx.currentTime + 0.5;
    let guard = 0;
    while (music.ambienceTime < ahead && guard < 4) {
      this.birdChirp(music.ambienceTime, cfg);
      music.ambienceTime += cfg.GAP_MIN + this.random() * cfg.GAP_RANGE;
      guard += 1;
    }
  }

  // Сверчки (CONFIG.MUSIC.AMBIENCE.CRICKETS): у каждого своя высота, громкость и ритм; стрекот каждого ставится
  // заранее, как нота музыки.
  scheduleCrickets(ahead, cfg) {
    const music = this.music;
    const now = this.ctx.currentTime;
    if (!music.crickets) {
      music.crickets = cfg.VOICES.map((voice) => ({ ...voice, time: music.ambienceTime + this.random() * voice.period }));
    }
    for (const voice of music.crickets) {
      // Если планировщик сильно отстал (вкладка тормозила), не вываливаем кучу звуков разом.
      if (voice.time < now - 0.5) voice.time = now + 0.2 + this.random() * 0.5;
      let guard = 0;
      while (voice.time < ahead && guard < 4) {
        this.cricketChirp(voice.time, voice, cfg);
        // Следующий стрекот: обычный интервал этого сверчка с разбросом, изредка долгая пауза.
        const uneven = 1 - cfg.UNEVEN + this.random() * 2 * cfg.UNEVEN;
        voice.time += voice.period * uneven + (this.random() < cfg.REST_CHANCE ? cfg.REST : 0);
        guard += 1;
      }
    }
  }

  // Один стрекот: 4–6 импульсов одного тона (один осциллятор, усилитель «стучит»). Каждый импульс сначала быстро
  // набирает треть громкости, потом плавно растёт ~13 мс и быстро обрывается за ~9 мс, как у настоящего сверчка.
  cricketChirp(time, voice, cfg) {
    const ctx = this.ctx;
    const pulses = cfg.PULSES[Math.floor(this.random() * cfg.PULSES.length)];
    const freq = voice.freq * (1 + (this.random() - 0.5) * 0.01); // каждый стрекот чуть выше или ниже (±0,5%)
    const level = cfg.AMP * voice.level * (0.9 + this.random() * 0.2);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    for (let i = 0; i < pulses; i += 1) {
      const at = time + i * cfg.PULSE_GAP;
      const peak = level * cfg.PROFILE[i];
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(peak * 0.35, at + 0.003);
      gain.gain.linearRampToValueAtTime(peak, at + 0.0125);
      gain.gain.linearRampToValueAtTime(0.0001, at + 0.022);
    }
    osc.connect(gain);
    gain.connect(this.music.gain);
    osc.start(time);
    osc.stop(time + pulses * cfg.PULSE_GAP + 0.02);
  }

  // Короткая трель: 2–4 ноты, каждая плавно идёт вверх или вниз, с мелким дрожанием голоса.
  birdChirp(time, cfg) {
    const ctx = this.ctx;
    const count = cfg.NOTES_MIN + Math.floor(this.random() * cfg.NOTES_RANGE);
    const base = cfg.FREQ_MIN + this.random() * cfg.FREQ_RANGE;
    let at = time;
    for (let i = 0; i < count; i += 1) {
      const length = 0.07 + this.random() * 0.05;
      const slide = this.random() < 0.5 ? 1.28 : 0.72;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.linearRampToValueAtTime(base * slide, at + length);
      vibrato.type = 'sine';
      vibrato.frequency.setValueAtTime(cfg.VIBRATO_HZ, at);
      vibratoGain.gain.setValueAtTime(base * 0.012, at);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(cfg.AMP, at + length * 0.4);
      gain.gain.linearRampToValueAtTime(0.0001, at + length);
      osc.connect(gain);
      gain.connect(this.music.gain);
      osc.start(at);
      vibrato.start(at);
      osc.stop(at + length + 0.02);
      vibrato.stop(at + length + 0.02);
      at += length + 0.03 + this.random() * 0.05;
    }
  }
}
