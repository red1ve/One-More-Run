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
    SHORT_RISKY: 250
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
  TWO_PATHS_DIVIDER: 24,
  CHOICE_GATE_HEIGHT: 64,
  CHOICE_SHOW_HEIGHT: 280,

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
    UI_ACCENT: '#3a86ff'
  }
};

// v(t) = max - (max - start) * e^(-t / tau)
export function getTrackSpeed(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  const start = CONFIG.TRACK_SPEED_START;
  const max = CONFIG.TRACK_SPEED_MAX;
  const tau = CONFIG.TRACK_SPEED_TAU;
  return max - (max - start) * Math.exp(-t / tau);
}