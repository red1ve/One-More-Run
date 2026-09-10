export const CONFIG = {
  // Настройки экрана (логические)
  CANVAS_WIDTH: 540,
  CANVAS_HEIGHT: 960,

  // Настройки трассы
  TRACK_LEFT: 70,
  TRACK_RIGHT: 470,
  TRACK_WIDTH: 400,

  // Настройки игрока
  PLAYER_WIDTH: 30,
  PLAYER_HEIGHT: 30,
  PLAYER_SPEED: 420,
  PLAYER_START_Y: 840,

  // Настройки геймплея
  // Скорость трассы (px/s). Стрейф игрока фиксирован — сложность растёт из-за нехватки времени.
  TRACK_SPEED_START: 300,
  TRACK_SPEED_MAX: 720,
  TRACK_SPEED_TAU: 70,
  GAME_SPEED: 300,
  SEGMENT_HEIGHT: 600,
  
  // Система очков и множителей
  SCORE_BASE_PER_SECOND: 10,
  MULTIPLIER_START: 1,

  // Награды за типы прохождения
  REWARDS: {
    SAFE: 10,
    RISKY: 100,
    SHORT_RISKY: 250,
    RISKY_EASY: 150,
    RISKY_HARD: 250
  },

  // Множитель
  MULTIPLIER_STEP: 0.5,
  MULTIPLIER_MAX: 5.0,
  RISK_STREAK_TO_GROW: 2,
  DIFFICULTY_GROWTH: 0.05,
  MIN_GAP: 70, // Минимально возможный проход для игрока
  REACHABILITY_MARGIN: 0.75, // Запас при проверке, успеет ли игрок доехать до прохода

  // Геометрия Breathing / Choice
  BREATHING_GAP_WIDTH: 200,
  SAFE_GAP_TUTORIAL: 200,
  RISKY_GAP_TUTORIAL: 80,
  SAFE_GAP_WIDTH: 180,
  RISKY_GAP_WIDTH: 76,
  SAFE_GAP_LATE: 160,
  RISKY_GAP_LATE: 72,
  RISK_EASY_GAP_WIDTH: 108,
  RISK_HARD_GAP_WIDTH: 80,
  DUAL_RISK_UNLOCK_TIME: 30,
  DUAL_RISK_CHANCE_EARLY: 0.12,
  DUAL_RISK_CHANCE_MID: 0.22,
  DUAL_RISK_CHANCE_LATE: 0.30,
  TWO_PATHS_DIVIDER: 24,
  CHOICE_GATE_HEIGHT: 64,
  CHOICE_SHOW_HEIGHT: 280,
  CHOICE_INTERVAL_INTRO: [8, 14],
  CHOICE_INTERVAL_EARLY: [7, 12],
  CHOICE_INTERVAL_MID: [7, 11],
  CHOICE_INTERVAL_LATE: [6, 10],
  DUAL_RISK_EXTRA_COOLDOWN: 2,
  COIN_REPEAT_CHANCE_SCALE: 0.45,
  CHOICE_FORK_REPEAT_WEIGHT: 0.2,

  // Bonus coins (meta currency, not score)
  COIN_CHANCE_INTRO: 0.08,
  COIN_CHANCE_EARLY: 0.15,
  COIN_CHANCE_MID: 0.20,
  COIN_CHANCE_LATE: 0.28,
  COIN_CHANCE_MAX: 0.35,
  COIN_INTRO_TIME: 10,
  COIN_SIZE: 18,
  COIN_VALUE: 1,
  COIN_WALL_PAD: 6,
  COIN_SKIP_MARGIN: 10,
  COIN_ZONE_REPEAT_WEIGHT: 0.18,

  FEEL: {
    PARTICLE_MAX: 80,
    PARTICLE_RISK: 10,
    PARTICLE_STREAK: 16,
    PARTICLE_MAX_MULT: 22,
    PARTICLE_COIN: 2,
    PARTICLE_SAFE: 4,
    PARTICLE_STREAK_LOSS: 14,
    PARTICLE_GAMEOVER: 14,
    FLOAT_LIFE: 0.7,
    FLOAT_LIFE_COIN: 0.55,
    FLOAT_SPEED: 90,
    FLOAT_MAX: 8,
    SHAKE_RISK: 3,
    SHAKE_STREAK: 5,
    SHAKE_STREAK_LOSS: 6,
    SHAKE_MAX_MULT: 7,
    SHAKE_GAMEOVER: 8,
    SHAKE_DURATION: 0.16,
    SHAKE_DURATION_MAX: 0.28,
    FLASH_DURATION: 0.12,
    HUD_PULSE_DURATION: 0.28,
    PLAYER_PULSE_DURATION: 0.18,
    PLAYER_BOB: 1.6,
    SPEED_LINE_MAX: 10,
    SPEED_SCROLL_SCALE: 0.35,
    AUDIO_VOLUME: 0.18,
    AUDIO_COOLDOWN: 0.05,
    INTENSITY_SAFE: 0.22,
    INTENSITY_COIN: 0.16,
    INTENSITY_RISK: 0.5,
    INTENSITY_STREAK: 0.75,
    INTENSITY_STREAK_LOSS: 0.82,
    INTENSITY_MAX: 1
  },

  // Цвета
  COLORS: {
    BACKGROUND: '#0d0d0d',
    TRACK: '#161616',
    TRACK_LINES: '#2d2d2d',
    PLAYER: '#3a86ff',
    OBSTACLE: '#ff4d4d',
    RISKY_OBSTACLE: '#c45c1a',
    SAFE_PATH: 'rgba(52, 84, 58, 0.55)',
    RISKY_PATH: 'rgba(122, 72, 28, 0.55)',
    SAFE_LABEL: '#b7c9b4',
    RISKY_LABEL: '#e0b48a',
    UI_TEXT: '#ffffff',
    UI_HUD: '#7a7a7a',
    UI_ACCENT: '#3a86ff',
    COIN: '#e8c547'
  }
};

export function isRiskPathType(type) {
  return type === 'RISKY' || type === 'RISKY_EASY' || type === 'RISKY_HARD' || type === 'SHORT_RISKY';
}

export function isIntentionalRiskType(type) {
  return type === 'RISKY' || type === 'RISKY_EASY' || type === 'RISKY_HARD';
}

export function getDualRiskChance(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  if (t < CONFIG.DUAL_RISK_UNLOCK_TIME) return 0;
  if (t < 60) return CONFIG.DUAL_RISK_CHANCE_EARLY;
  if (t < 120) return CONFIG.DUAL_RISK_CHANCE_MID;
  return CONFIG.DUAL_RISK_CHANCE_LATE;
}

export function getCoinChance(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  if (t < CONFIG.COIN_INTRO_TIME) return CONFIG.COIN_CHANCE_INTRO;
  if (t < 30) return CONFIG.COIN_CHANCE_EARLY;
  if (t < 60) return CONFIG.COIN_CHANCE_MID;
  if (t < 120) return CONFIG.COIN_CHANCE_LATE;
  return CONFIG.COIN_CHANCE_MAX;
}

export function getChoiceIntervalRange(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  if (t < 30) return CONFIG.CHOICE_INTERVAL_INTRO;
  if (t < 60) return CONFIG.CHOICE_INTERVAL_EARLY;
  if (t < 120) return CONFIG.CHOICE_INTERVAL_MID;
  return CONFIG.CHOICE_INTERVAL_LATE;
}

// v(t) = max - (max - start) * e^(-t / tau)
export function getTrackSpeed(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  const start = CONFIG.TRACK_SPEED_START;
  const max = CONFIG.TRACK_SPEED_MAX;
  const tau = CONFIG.TRACK_SPEED_TAU;
  return max - (max - start) * Math.exp(-t / tau);
}