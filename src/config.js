export const CONFIG = {
  // Настройки экрана (логические)
  CANVAS_WIDTH: 540,
  CANVAS_HEIGHT: 960,

  // Настройки трассы
  TRACK_LEFT: 70,
  TRACK_RIGHT: 470,
  TRACK_WIDTH: 400,
  // Опорная линия для ширины игровой дорожки (Corridor.js). Отдельна от
  // нарисованного горизонта VISUAL.SKY_BAND, чтобы перенос горизонта не менял игру.
  CORRIDOR_ORIGIN_Y: 232,

  // Настройки игрока
  // Хитбокс ≈85% ширины нарисованного тела кота (тело ≈43 px при росте 150).
  PLAYER_WIDTH: 36,
  PLAYER_HEIGHT: 36,
  PLAYER_SPEED: 420,
  // Фаза 1б: стрейф растёт вместе со скоростью трассы, до этого значения на максимуме.
  // Генератор трассы считает достижимость по PLAYER_SPEED (с запасом).
  PLAYER_SPEED_MAX: 500,
  PLAYER_START_Y: 840,
  // Защита от «проскоков» (Game.simulateStep): макс. сдвиг за шаг физики и макс. число шагов за кадр.
  SUBSTEP_MAX_PX: 12,
  SUBSTEP_MAX_COUNT: 10,
  // Сколько секунд после проигрыша нажатия не перезапускают игру (видны кнопки «за рекламу»).
  GAME_OVER_INPUT_LOCK: 0.6,
  // Возрождение (Game.revive): один раз за забег, за рекламу (Фаза 5).
  REVIVE_INVULNERABLE_SECONDS: 2,
  // Ряды ближе этого расстояния впереди кота убираются при возрождении.
  REVIVE_CLEAR_AHEAD: 700,

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
  MIN_GAP: 76, // Минимально возможный проход для игрока
  REACHABILITY_MARGIN: 0.75, // Запас при проверке, успеет ли игрок доехать до прохода

  // Геометрия Breathing / Choice
  BREATHING_GAP_WIDTH: 200,
  SAFE_GAP_TUTORIAL: 200,
  RISKY_GAP_TUTORIAL: 96,
  SAFE_GAP_WIDTH: 180,
  RISKY_GAP_WIDTH: 92,
  SAFE_GAP_LATE: 160,
  RISKY_GAP_LATE: 88,
  RISK_EASY_GAP_WIDTH: 122,
  RISK_HARD_GAP_WIDTH: 96,
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

  // Track geometry variation (presentation/fairness only; no reward changes)
  PATTERN_GATE_HEIGHT: 40,
  PATTERN_REPEAT_WEIGHT: 0.25,
  PATTERN_REVERSE_WEIGHT: 0.45,
  PATTERN_DOUBLE_UNLOCK_TIME: 60,
  PATTERN_OFFSET_SHIFT_INTRO: 12,
  PATTERN_OFFSET_SHIFT_EARLY: 18,
  PATTERN_OFFSET_SHIFT_MID: 22,
  PATTERN_OFFSET_SHIFT_LATE: 24,
  PATTERN_OFFSET_GATE_SHIFT: 12,
  PATTERN_FUNNEL_EXPAND_NORMAL: 48,
  PATTERN_FUNNEL_EXPAND_SAFE: 36,
  PATTERN_FUNNEL_EXPAND_RISK: 16,

  YANDEX: {
    SDK_URL: '/sdk.js',
    DEFAULT_LANGUAGE: 'en',
    SUPPORTED_LANGUAGES: ['en', 'ru'],
    // Языки, для которых показываем русский интерфейс (так советует Яндекс для СНГ).
    RUSSIAN_UI_LANGUAGES: ['ru', 'be', 'kk', 'uk', 'uz'],
    LEADERBOARD_NAME: 'one_more_run_score',
    ADS_ENABLED: true,
    // Имитация рекламы за награду без SDK. Включается только в npm run dev (main.js).
    DEV_REWARDED_STUB: false,
    // Сколько ждать onRewarded после onClose, прежде чем решить, что награды нет
    // (порядок колбэков в документации Яндекса не указан).
    REWARDED_CLOSE_GRACE_MS: 250,
    INTERSTITIAL_COOLDOWN_RUNS: 3
  },

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
    PLAYER_RUN_CYCLE: 9,
    PLAYER_RUN_FPS: 10,
    PLAYER_RUN_SQUASH: 0.04,
    PLAYER_RUN_TWIST: 0.028,
    MEOW_COOLDOWN: 0.5,
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

  // Visual Bible drawing rules (presentation only)
  VISUAL: {
    OUTLINE_WIDTH: 4,
    SHADOW_OFFSET: 5,
    HEDGE_BAND: 28,
    // Песок дорожки (SandArt.js): мягкие пятна и камешки.
    SAND: {
      SPOT_PERIOD: 46,
      SPOT_CHANCE: 0.55,
      PEBBLE_CHANCE: 0.35,
      // Сколько px песка у горизонта переходят в цвет далёкой земли.
      FAR_FADE: 36
    },
    // Тень кота на песке: размеры овала и плотность теней.
    CAT_SHADOW: { RX: 26, RY: 9 },
    SHADOW_ALPHA: 0.62,
    // Высота (px) ровного песка у горизонта, прячет полоски сжатой текстуры.
    FAR_SAND_VEIL: 70,
    // Препятствия-кашпо и ворота (ObstacleArt.js). Высота — в долях роста кота у кота.
    GARDEN_OBSTACLES: {
      ENABLED: true,
      PLANTER_NEAR_CAT: 0.46,
      GATE_NEAR_CAT: 0.72,
      // Участок ворот уже этой доли высоты ворот рисуется как кашпо.
      GATE_MIN_WIDTH: 0.9,
      FLOWER_CHANCE: 0.3
    },
    // Боковой декор за изгородью (SideDecorArt.js): шаг слотов по миру и доля занятых.
    SIDE_DECOR: {
      PERIOD: 70,
      CHANCE: 0.8
    },
    // Голубое небо, облака и дальний ряд деревьев (SkyArt.js), рисуются один раз в кэш.
    SKY: {
      ENABLED: true,
      COLOR: '#9CDCEC',
      // [x, высота 0..1 от верха до горизонта, размер]
      CLOUDS: [[150, 0.3, 0.75], [60, 0.66, 0.85], [420, 0.62, 1]]
    },
    // Газон за изгородью (LawnArt.js): пятна и пучки травы.
    LAWN: {
      PATCH_PERIOD: 34,
      PATCH_CHANCE: 0.26,
      TUFT_CHANCE: 0.8
    },
    // Арка в розах на горизонте (assets/environment/garden/landmarks/rose-arch.svg).
    ROSE_ARCH: {
      RASTER_WIDTH: 360,
      // Ширина арки относительно дорожки на горизонте (столбы стоят у краёв дорожки).
      WIDTH_OF_ROAD: 1.25,
      // Не выше неба: верх арки не ближе этого к верхнему краю экрана.
      TOP_MARGIN: 6,
      // На сколько px основание столбов заходит на конец дорожки.
      BASE_SINK: 2,
      ALPHA: 1
    },
    // Живая изгородь с бордюром (HedgeArt.js). Размеры — у кота, дальше по перспективе.
    HEDGE_WALL: {
      ENABLED: true,
      SHOULDER_NEAR: 8,
      CURB_NEAR: 12,
      WIDTH_NEAR: 92,
      CLUMP_PERIOD: 22,
      CLUMP_RADIUS_NEAR: 20,
      POST_PERIOD: 130,
      // Сколько px от горизонта изгородь сужается до нуля.
      HORIZON_TAPER: 12
    },
    // Нарисованные картинки из assets/art-pack/ (ArtPack.js). false — кодовый вариант.
    ART_PACK: {
      TREES: true,
      // Изгородь из картинок: рядов поперёк, ширина клочка (доля ширины изгороди).
      HEDGE_LANES: [0.24, 0.74],
      HEDGE_CLUMP_WIDTH: 0.72,
      HEDGE_PERIOD: 30,
      // Высота дерева в долях роста кота (как у кодового дерева).
      TREE_HEIGHT: 1.75
    },
    HEDGE_BORDER_NEAR: 48,
    HEDGE_BORDER_FAR: 26,
    HEDGE_HEIGHT_NEAR: 82,
    HEDGE_HEIGHT_FAR: 40,
    HEDGE_SETBACK_NEAR: 26,
    HEDGE_SETBACK_FAR: 11,
    SAND_SHOULDER_NEAR: 14,
    SAND_SHOULDER_FAR: 6,
    TREE_NEAR_CAT: 2.48,
    TREE_FAR_SIZE: 0.94,
    TREE_MID_SIZE: 0.97,
    TREE_NEAR_SIZE: 1.00,
    SAPLING_CAT: 1.08,
    BUSH_LARGE_CAT: 1.22,
    BUSH_SMALL_CAT: 0.78,
    MASS_NEAR_CAT: 1.92,
    FENCE_NEAR_CAT: 0.98,
    FENCE_BAY: 1.18,
    CHOICE_GATEWAY_BEHIND: 0,
    CHOICE_GATEWAY_NEAR_CAT: 1.08,
    CHOICE_GATEWAY_OVERLAP: 0.36,
    DEPTH_SCALE_FAR: 0.90,
    DEPTH_SCALE_NEAR: 1.05,
    OBSTACLE_SCALE_FAR: 0.90,
    OBSTACLE_SCALE_MID: 0.98,
    OBSTACLE_SCALE_NEAR: 1.06,
    PERSPECTIVE_SQUEEZE: 0.10,
    OBSTACLE_REVEAL: 64,
    PLANTER_LIP: 6,
    TRACK_SEAM: 2,
    CAMERA_FOLLOW: 5.2,
    CAMERA_LEAD: 24,
    CAMERA_LAG: 14,
    CAMERA_FAR: 0.12,
    PATH_SAND_TILE: 2600,
    SKY_BAND: 130,
    // Дорога у кота ≈364 px (как на референсе, было 331).
    PATH_INSET_NEAR: 9,
    PATH_INSET_FAR: 95,
    PROJECTOR: {
      FAR_ROAD_WIDTH: 170,
      // Object scale = road width ratio (true perspective), capped here.
      SCALE_MAX: 1.3,
      READ_ZONE_ABOVE: 280,
      CREST_PEAK: 16,
      CREST_SIDE: 6,
      CREST_ASYM: 3.2,
      // Occlusion-only crest (road silhouette keeps CREST_PEAK).
      REVEAL_CREST_PEAK: 48,
      // Stretch HIDDEN→FULL past the geometric crest so tip/mid linger a bit.
      REVEAL_SPAN: 1.32
    },
    // Keep enough FAR lower meadow below the skyline to cover the sky gap;
    // softenFarLowerField dissolves the plastic look without exposing backdrop.
    // Tuck FAR plate so less flat lower meadow hangs below the skyline.
    FAR_SKYLINE_T: 0.935,
    COIN_DRAW_SIZE: 42,
    USE_ENVIRONMENT_ASSET_PACK: true,
    LOAF_REAR: {
      SOURCE_WIDTH: 1024,
      SOURCE_HEIGHT: 1024,
      DRAW_HEIGHT: 150,
      ANCHOR_X: 513,
      ANCHOR_Y: 797,
      FLOAT_CLEARANCE: 139
    },
    // Сидящий Loaf для START и Game Over (assets/characters/loaf-sit.svg, 300×360).
    // Якорь — точка на земле под котом (центр тени).
    LOAF_SIT: {
      SOURCE_WIDTH: 300,
      SOURCE_HEIGHT: 360,
      DRAW_HEIGHT: 170,
      ANCHOR_X: 155,
      ANCHOR_Y: 330
    },
    // Экраны START и Game Over: карточка в стиле HUD, крупные надписи.
    // Текст сам уменьшается до MIN_FONT, если строка шире карточки (запас под русский язык).
    SCREENS: {
      CARD_X: 36,
      CARD_W: 468,
      DIM_START: 0.12,
      DIM_GAME_OVER: 0.28,
      TEXT_PAD: 28,
      MIN_FONT: 16
    }
  },

  COLORS: bibleColors()
};

function bibleColors() {
  const SkyPaper = '#F3E4C7';
  const GardenSky = '#9CDCEC';
  const FloorSand = '#F7DCA0';
  const HedgeSage = '#76A544';
  const PlanterWood = '#BF7A45';
  const CatCream = '#F6E7C8';
  const CatGinger = '#E39A4F';
  const SafeLawn = '#A8C98B';
  const RiskApricot = '#E0A36A';
  const HighRiskClay = '#C45C32';
  const CoinAmber = '#E8B84A';
  const InkBrown = '#4A3428';
  const ShadowDust = '#C4A97A';

  return {
    SkyPaper,
    GardenSky,
    FloorSand,
    HedgeSage,
    PlanterWood,
    CatCream,
    CatGinger,
    SafeLawn,
    RiskApricot,
    HighRiskClay,
    CoinAmber,
    InkBrown,
    ShadowDust,

    BACKGROUND: GardenSky,
    TRACK: FloorSand,
    TRACK_LINES: InkBrown,
    PLAYER: CatGinger,
    OBSTACLE: PlanterWood,
    RISKY_OBSTACLE: PlanterWood,
    SAFE_PATH: hexAlpha(SafeLawn, 0.82),
    RISKY_PATH: hexAlpha(RiskApricot, 0.88),
    HIGH_RISK_PATH: hexAlpha(HighRiskClay, 0.88),
    SAFE_LABEL: InkBrown,
    RISKY_LABEL: CatGinger,
    HIGH_RISK_LABEL: HighRiskClay,
    UI_TEXT: InkBrown,
    UI_HUD: hexAlpha(InkBrown, 0.55),
    UI_ACCENT: CatGinger,
    COIN: CoinAmber,
    OVERLAY: hexAlpha(SkyPaper, 0.78),
    FLASH_SAFE: hexAlpha(SafeLawn, 0.12),
    FLASH_RISK: hexAlpha(RiskApricot, 0.16),
    FLASH_COIN: hexAlpha(CoinAmber, 0.14),
    FLASH_FAIL: hexAlpha(HighRiskClay, 0.14),
    FLASH_STREAK_LOSS: hexAlpha(InkBrown, 0.12)
  };
}

function hexAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

// Скорость стрейфа кота для текущей скорости трассы: 420 на старте, 500 на максимуме.
export function getPlayerSpeed(trackSpeed) {
  const start = CONFIG.TRACK_SPEED_START;
  const max = CONFIG.TRACK_SPEED_MAX;
  const t = Math.max(0, Math.min(1, (trackSpeed - start) / Math.max(1, max - start)));
  return CONFIG.PLAYER_SPEED + (CONFIG.PLAYER_SPEED_MAX - CONFIG.PLAYER_SPEED) * t;
}