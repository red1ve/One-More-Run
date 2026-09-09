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
  GAME_SPEED: 380, // Базовая скорость
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
  MULTIPLIER_STEP: 0.25,
  MULTIPLIER_MAX: 5.0,
  DIFFICULTY_GROWTH: 0.05, // Прирост скорости каждые 1000 очков (процент)
  MIN_GAP: 70, // Минимально возможный проход для игрока
  REACHABILITY_MARGIN: 0.75, // Запас при проверке, успеет ли игрок доехать до прохода

  // Геометрия развилки SAFE / RISK
  SAFE_GAP_WIDTH: 180,
  RISKY_GAP_WIDTH: 72,
  TWO_PATHS_DIVIDER: 20,
  RISK_LANE_EXTRA: 56,

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