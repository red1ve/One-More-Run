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
    PLAYER_RUN_FPS: 10,
    PLAYER_RUN_SQUASH: 0.04,
    MEOW_COOLDOWN: 0.5,
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
    // Препятствия-кашпо и ворота (ObstacleArt.js). Высота — в долях роста кота у кота.
    GARDEN_OBSTACLES: {
      PLANTER_NEAR_CAT: 0.46,
      GATE_NEAR_CAT: 0.72,
      // Участок ворот уже этой доли высоты ворот рисуется как кашпо.
      GATE_MIN_WIDTH: 0.9,
      // Участок уже этой доли высоты ящика рисуется кустом (картинки art-pack).
      BUSH_MAX_WIDTH: 0.9,
      // На каком отрезке мира (px) новые ящики и ворота проступают из прозрачности.
      SPAWN_FADE: 420,
      FLOWER_CHANCE: 0.3
    },
    // Боковой декор за изгородью (SideDecorArt.js): шаг слотов по миру и доля занятых.
    SIDE_DECOR: {
      // Места для предметов по миру: каждые PERIOD px с каждой стороны газона.
      PERIOD: 70,
      // Деревья: группа из GROUP[0]…GROUP[1] деревьев подряд, затем пауза до
      // следующей группы — всего EVERY мест (слева и справа группы сдвинуты).
      // При 70 px и EVERY 10 — группа раз в 700 px мира (≈ 1.5 с бега),
      // деревья ≈ 15% мест, остальное — мелочи и пустые места.
      TREES: { EVERY: 10, GROUP: [1, 2], LEFT_OFFSET: 0, RIGHT_OFFSET: 5 },
      // Доля непустых мест между группами (там мелочи: кусты, камни, заборчики, трава).
      CHANCE: 0.8,
      // Размер по глубине: 1 у кота, к горизонту к нулю; DEPTH_HALF — насколько
      // быстро уменьшается (чем меньше, тем дольше предметы остаются крупными).
      DEPTH_HALF: 1.5,
      // Предметы мельче MIN_PX px на экране не рисуются; следующие FADE_PX px
      // они плавно проявляются.
      MIN_PX: 8,
      FADE_PX: 8
    },
    // Голубое небо, облака и дальний ряд деревьев (SkyArt.js), рисуются один раз в кэш.
    SKY: {
      COLOR: '#9CDCEC',
      // Картинка неба (art-pack): высота на экране, px ниже горизонта, дымка на газоне.
      STRIP_HEIGHT: 104,
      STRIP_SINK: 2,
      LAWN_HAZE_DEPTH: 34
    },
    // Газон за изгородью (LawnArt.js): пятна и пучки травы.
    LAWN: {
      PATCH_PERIOD: 34,
      PATCH_CHANCE: 0.26,
      TUFT_CHANCE: 0.8
    },
    // Арка в розах на конце дорожки (assets/art-pack/arch/arch-wide-01.png).
    ROSE_ARCH: {
      // Не выше неба: верх арки не ближе этого к верхнему краю экрана.
      TOP_MARGIN: 6,
      // На сколько px основание столбов заходит на конец дорожки.
      BASE_SINK: 2,
      // Столбы снаружи занимают эту долю ширины картинки (ставятся по краям дорожки).
      PACK_POSTS_SPAN: 0.94
    },
    // Живая изгородь с бордюром (HedgeArt.js). Размеры — у кота, дальше по перспективе.
    HEDGE_WALL: {
      SHOULDER_NEAR: 8,
      CURB_NEAR: 12,
      // Ширина изгороди (только картинка, игру не меняет). Уже — шире газон за ней.
      WIDTH_NEAR: 74,
      CLUMP_PERIOD: 22,
      CLUMP_RADIUS_NEAR: 20,
      POST_PERIOD: 130,
      // Сколько px от горизонта изгородь сужается до нуля.
      HORIZON_TAPER: 12
    },
    // Как расставлять нарисованные картинки из assets/art-pack/ (ArtPack.js).
    ART_PACK: {
      // Изгородь из картинок: рядов поперёк, ширина клочка (доля ширины изгороди).
      HEDGE_LANES: [0.24, 0.74],
      HEDGE_CLUMP_WIDTH: 0.72,
      HEDGE_PERIOD: 30,
      // Доля цветущих клочков (решается один раз на слот): ≈ каждый пятый.
      HEDGE_FLOWER_CHANCE: 0.2,
      // Высота дерева в долях роста кота.
      TREE_HEIGHT: 1.75
    },
    TREE_NEAR_CAT: 2.48,
    CHOICE_GATEWAY_NEAR_CAT: 1.08,
    OBSTACLE_REVEAL: 64,
    CAMERA_FOLLOW: 5.2,
    CAMERA_LEAD: 24,
    CAMERA_LAG: 14,
    PATH_SAND_TILE: 2600,
    SKY_BAND: 130,
    // Дорога у кота ≈364 px (как на референсе, было 331).
    PATH_INSET_NEAR: 9,
    PATH_INSET_FAR: 95,
    PROJECTOR: {
      FAR_ROAD_WIDTH: 170,
      // Только для рисования: даль сжимается к горизонту (0 — без сжатия). Рядом
      // с котом картинка та же; игра, хитбоксы и столкновения не меняются.
      FAR_COMPRESS: 1.2,
      // Object scale = road width ratio (true perspective), capped here.
      SCALE_MAX: 1.3,
      READ_ZONE_ABOVE: 280,
      CREST_PEAK: 16,
      CREST_SIDE: 6,
      CREST_ASYM: 3.2,
      // Occlusion-only crest (road silhouette keeps CREST_PEAK).
      // Фаза 1д: 48 → 16, иначе сжатые к арке дальние ящики прятались бы за «холмом».
      REVEAL_CREST_PEAK: 16,
      // Stretch HIDDEN→FULL past the geometric crest so tip/mid linger a bit.
      REVEAL_SPAN: 1.32
    },
    COIN_DRAW_SIZE: 42,
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
    SAFE_LABEL: InkBrown,
    RISKY_LABEL: CatGinger,
    HIGH_RISK_LABEL: HighRiskClay,
    UI_TEXT: InkBrown,
    UI_HUD: hexAlpha(InkBrown, 0.55),
    UI_ACCENT: CatGinger,
    COIN: CoinAmber,
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