export const CONFIG = {
  // Настройки экрана (логические)
  CANVAS_WIDTH: 540,
  CANVAS_HEIGHT: 960,
  // Чёткость на телефонах (RenderScale.js): холст получает до MAX_SCALE настоящих пикселей на логический. Если кадры
  // дольше SLOW_FRAME_MS идут устойчиво (SLOW_FRAMES медленных кадров подряд, быстрые отнимают), масштаб снижается.
  RENDER: { MAX_SCALE: 2, SLOW_FRAME_MS: 26, SLOW_FRAMES: 45 },

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
  PLAYER_SPEED_MAX: 600,
  // Управление пальцем и мышью (Player.steerTo): кот едет к точке касания с обычной скоростью, но не проскакивает её.
  // Начинает ехать, когда палец ушёл дальше START_PX (дрожь пальца его не двигает), и едет до STOP_PX.
  // LEAN_SMOOTH — как быстро наклон кота подстраивается под реальное движение (чем больше, тем резче).
  STEER: { START_PX: 3, STOP_PX: 0.5, LEAN_SMOOTH: 16 },
  PLAYER_START_Y: 840,
  // Защита от «проскоков» (Game.simulateStep): макс. сдвиг за шаг физики и макс. число шагов за кадр.
  SUBSTEP_MAX_PX: 12,
  SUBSTEP_MAX_COUNT: 10,
  // Сколько секунд после проигрыша нажатия не перезапускают игру (видны кнопки «за рекламу»).
  GAME_OVER_INPUT_LOCK: 0.6,
  // «В МЕНЮ» на паузе: первое нажатие спрашивает «завершить забег?», второе в течение этого времени (мс) выходит.
  PAUSE_MENU_CONFIRM_MS: 3000,
  // Возрождение (Game.revive): один раз за забег, за рекламу (Фаза 5).
  REVIVE_INVULNERABLE_SECONDS: 2,
  // Ряды ближе этого расстояния впереди кота убираются при возрождении.
  REVIVE_CLEAR_AHEAD: 700,

  // Настройки геймплея
  // Скорость трассы (px/s): v(t) = MAX − (MAX − START) · e^(−t / TAU). Сложность растёт из-за нехватки времени:
  // стрейф кота растёт медленнее трассы (getPlayerSpeed). 2026-10-09 (по просьбе владельца: «более динамичная
  // игра»): MAX 720 → 950, TAU 70 → 45; в тот же день по второй просьбе MAX 950 → 1050. То, что раньше было на
  // второй минуте (644), теперь на 28-й секунде. Старт не менялся: первые секунды новичка те же. Стрейф на
  // максимуме 500 → 600 (PLAYER_SPEED_MAX): тот же запас у кота относительно трассы, что при 950 и 560.
  TRACK_SPEED_START: 300,
  TRACK_SPEED_MAX: 1050,
  TRACK_SPEED_TAU: 45,
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
  // Проходы сужались по просьбе игрока (игра была слишком лёгкой): обычные 200 / 168 → 168 / 136,
  // безопасный путь развилки 200 / 180 / 160 → 176 / 156 / 136. Рискованные не менялись.
  // Что отрезано у безопасного пути, ушло в разделитель (TWO_PATHS_DIVIDER): он стал виден
  // как нормальный куст, а не как крошечный кустик, и ширина развилки осталась прежней.
  BREATHING_GAP_WIDTH: 168,
  BREATHING_GAP_LATE: 136,
  SAFE_GAP_TUTORIAL: 176,
  RISKY_GAP_TUTORIAL: 96,
  SAFE_GAP_WIDTH: 156,
  RISKY_GAP_WIDTH: 92,
  SAFE_GAP_LATE: 136,
  RISKY_GAP_LATE: 88,
  RISK_EASY_GAP_WIDTH: 122,
  RISK_HARD_GAP_WIDTH: 96,
  DUAL_RISK_UNLOCK_TIME: 30,
  DUAL_RISK_CHANCE_EARLY: 0.12,
  DUAL_RISK_CHANCE_MID: 0.22,
  DUAL_RISK_CHANCE_LATE: 0.30,
  TWO_PATHS_DIVIDER: 48,
  // Стены у края дорожки. Игровое поле шире видимого песка на 17–21 px с каждой стороны (зависит от
  // того, где кот стоит на экране: у кота в начале забега это ≈17 px, на большой скорости ≈21),
  // поэтому стена до EDGE_WALL_HIDDEN (16) целиком под бордюром и не видна (проход «вплотную к краю»),
  // а видимая часть остальных = ширина − 17…21. Стена между 16 и EDGE_WALL_MIN (58) выглядела
  // бы крошечным кустиком-точкой, поэтому трасса таких стен не создаёт.
  // Было 20: стена в 18–20 px торчала из-под бордюра на 1–3 px, их не рисовали (меньше 3 px), но кот,
  // прижатый к краю в начале забега, о них разбивался («невидимая стена»). Значение должно быть меньше,
  // чем самый узкий бордюр у кота: это проверяет phase1r-check.
  EDGE_WALL_HIDDEN: 16,
  // Стена между EDGE_WALL_HIDDEN и этим значением торчала бы из-под бордюра у кота на 0–3 px (бордюр у кота
  // 17–21 px): рисунка нет (меньше 3 px), а задеть можно. Даже запасной вариант развилки такие стены не создаёт.
  EDGE_WALL_THIN_MAX: 24,
  EDGE_WALL_MIN: 58,
  // Время суток в забеге (TimeOfDay.js, Renderer.drawTimeOfDay): только вид, игра не меняется.
  // Этап начинается в момент from (секунды забега в цикле) и плавно проявляется за BLEND секунд;
  // на каждом новом этапе показывается плашка. tint — цвет «умножения» поверх сада (все
  // каналы ≥ 140, чтобы ночью препятствия и проходы оставались хорошо видны), glow — свечение
  // сверху, wash — лёгкая цветная заливка (чтобы песок не серел), vignette — затемнение по краям,
  // fireflies — светлячки над газоном.
  // 2026-10-09 (по просьбе владельца: игра должна ощущаться динамичнее): этап длится 12 секунд, цикл 60
  // (было 300: 60/60/60/80/40), плавный переход 4 секунды (было 10), плашка 2 секунды (было 2.6).
  // Потом владелец нашёл, что это слишком часто, и попросил на 20% дольше: этап 14.4 секунды, цикл 72,
  // переход 4.8, плашка 2.4 (всё те же пропорции). Ещё через день — ещё примерно на 10%: этап 16 секунд,
  // цикл 80, переход 5, плашка 2.5.
  TIME_OF_DAY: {
    CYCLE: 80,
    BLEND: 5,
    TOAST_SECONDS: 2.5,
    STAGES: [
      { name: 'day', from: 0, look: { tint: [255, 255, 255], wash: { color: [255, 255, 255], alpha: 0 }, glow: { color: [255, 240, 200], alpha: 0 }, vignette: 0, fireflies: 0 } },
      { name: 'golden', from: 16, look: { tint: [255, 230, 195], wash: { color: [255, 170, 70], alpha: 0.05 }, glow: { color: [255, 196, 110], alpha: 0.2 }, vignette: 0.1, fireflies: 0 } },
      { name: 'dusk', from: 32, look: { tint: [248, 212, 228], wash: { color: [135, 70, 150], alpha: 0.12 }, glow: { color: [255, 150, 130], alpha: 0.16 }, vignette: 0.2, fireflies: 0 } },
      { name: 'night', from: 48, look: { tint: [152, 176, 232], wash: { color: [28, 46, 140], alpha: 0.24 }, glow: { color: [120, 140, 220], alpha: 0.06 }, vignette: 0.3, fireflies: 14 } },
      { name: 'dawn', from: 64, look: { tint: [250, 228, 236], wash: { color: [255, 170, 160], alpha: 0.06 }, glow: { color: [255, 176, 170], alpha: 0.14 }, vignette: 0.12, fireflies: 4 } }
    ]
  },
  // «Чуть не задел» (Track.checkGraze, Game.applyGraze): кот прошёл рядом со стеной — зазор от
  // 0 (не касаясь) до PX px — и получает бонус. Он невелик (рискованный проход даёт 100 × множитель):
  // BONUS, а при серии таких касаний не позже COMBO_WINDOW секунд друг от друга + COMBO_STEP
  // за каждое следующее, но не больше BONUS_MAX. Бонус не умножается и не зависит от серии рисков.
  GRAZE: { PX: 8, BONUS: 10, COMBO_STEP: 5, BONUS_MAX: 30, COMBO_WINDOW: 2.5 },
  // Клубок-щит (Track.maybePlaceYarn, Game.breakShield): редкий предмет на дороге. Подобранный клубок даёт
  // щит на DURATION секунд (владелец просил 10–15). Щит — ОДНА ошибка: первое столкновение его ломает,
  // ряды в CLEAR_AHEAD px перед котом (и тот, в который он врезался) разлетаются, а кот GRACE секунд
  // неуязвим, чтобы не задеть остатки. Если ошибки не было, щит гаснет сам. Новый клубок обновляет щит.
  // Клубки появляются не раньше FIRST_AT секунд забега и не чаще, чем раз в MIN_GAP секунд; в каждом
  // подходящем обычном ряду шанс CHANCE. SIZE — хитбокс, DRAW_SIZE — размер картинки. Решение о клубке считается
  // хешем номера ряда (не потоком случайных чисел трассы), поэтому сама трасса не сдвигается: с тем же seed
  // ряды те же, с клубками и без.
  SHIELD: { DURATION: 12, BLINK_LAST: 3, FIRST_AT: 20, MIN_GAP: 45, CHANCE: 0.3, SIZE: 26, DRAW_SIZE: 40, CLEAR_AHEAD: 260, GRACE: 0.3 },
  // Лента рекорда: тонкая лента поперёк дороги там, где закончился лучший забег (нужно время лучшего забега,
  // Game.bestRunTime). Показывается в обычном забеге, если лучший забег был не короче MIN_TIME секунд.
  // Лента появляется за SHOW_AHEAD px до места и уходит вниз вместе с трассой, когда кот её пересёк.
  RECORD_MARKER: { MIN_TIME: 8, SHOW_AHEAD: 2600, THICKNESS: 7, ALPHA: 0.74 },
  // Пузырь множителя серии рядом с котом: появляется, когда множитель меняется, живёт LIFE секунд.
  MULT_BUBBLE: { LIFE: 1.5, OFFSET_X: 48, OFFSET_Y: -78 },
  // Помощь новичкам: пока лучший счёт игрока меньше UNTIL_BEST, проходы шире. Помощь линейно
  // тает до нуля (см. getAssist). Полная помощь = ширины до сужения 2026-10-01: обычные проходы
  // 168 / 136 + BREATHING_BONUS = 200 / 168, безопасный путь развилки 176 / 156 / 136 + SAFE_BONUS
  // = 200 / 180 / 160. Рискованные пути не меняются: они добровольные.
  // У самой первой развилки прибавка к безопасному пути не больше TUTORIAL_SAFE_BONUS_MAX (иначе
  // на стены у краёв остаётся меньше EDGE_WALL_MIN): там 176 + 20 = 196 вместо прежних 200.
  ASSIST: { UNTIL_BEST: 800, BREATHING_BONUS: 32, SAFE_BONUS: 24, TUTORIAL_SAFE_BONUS_MAX: 20 },
  // Качающееся кашпо (Track.createSway, Track.placeSway): после FROM секунд забега в части обычных
  // рядов между стенами проход шириной PLANTER_WIDTH + 2 × POCKET, а в нём ходит из стороны в
  // сторону кашпо шириной PLANTER_WIDTH — от стены до стены по синусоиде. Поэтому свободно всегда
  // не меньше POCKET px (в середине качания по POCKET с каждой стороны, у стены 0 и 2 × POCKET),
  // а сторона, где свободно, плавно переходит с одной на другую. Кашпо идёт медленнее кота:
  // его самая большая скорость POCKET × 2π / период (203…283 px/s) против 420…500 у кота.
  // CHANCE — шанс такого ряда вместо обычного: [до TIER_1 секунд, до TIER_2, дальше]; два таких
  // ряда подряд и ряд сразу после развилки не ставятся. PERIOD — период качания, чем позже, тем быстрее.
  // Монет в таком ряду нет. Помощь новичку (ASSIST) на него не действует: сюда доходят только
  // умелые игроки, а при широком проходе стены у краёв нельзя было бы поставить по правилу краёв.
  // 2026-10-09: ступени сдвинуты вдвое-полтора раза раньше (было 90 / 150 / 240 с): трасса стала быстрее,
  // а кашпо «привязано к прошлому времени», и игроки до него почти не доживали. Теперь FROM 45 (скорость
  // там ≈ 735 px/s), TIER_1 90, TIER_2 150.
  SWAY: {
    FROM: 45,
    TIER_1: 90,
    TIER_2: 150,
    CHANCE: [0.12, 0.2, 0.28],
    PERIOD: [2.8, 2.4, 2.0],
    PLANTER_WIDTH: 84,
    POCKET: 90,
    // Ряд ставится только там, где кот успевает в любой карман из ЛЮБОЙ точки прошлого прохода,
    // если начнёт ехать через REACTION секунд после прошлого ряда (на его настоящей скорости, 420…500 px/s).
    // WINDOW_SLACK — сколько px кармана у кашпо «съедает» его движение, пока кот в ряду: туда ехать
    // надо не к краю кармана, а к его безопасной части. После узоров с короткой дорогой до кота
    // (OFFSET, FUNNEL) на высокой скорости ряд не ставится, вместо него обычный.
    REACTION: 0.25,
    WINDOW_SLACK: 20
  },
  // Новые ряды (шлифовка, фаза 4, 2026-10-22). Как и качающееся кашпо, ставятся только в обычный ряд, не сразу
  // после развилки и не подряд с другим особым рядом (VariationDirector.choosePattern); если на этой скорости
  // кот не успевает, вместо них обычный ряд. Шансы по этапам забега, как у SWAY: до FROM — 0, потом CHANCE[0],
  // с TIER_1 — CHANCE[1], с TIER_2 — CHANCE[2].
  //
  // СТВОРКИ (Track.createDoors): стена с двумя проходами по DOORWAY px, между ними стенка MIDDLE px; в каждом
  // проходе створка (ворота калитки), открыта всегда ровно одна, они меняются каждые HALF_PERIOD секунд.
  // Когда ряд ближе LOCK_DISTANCE px до кота, выбор замирает: кот видит, куда ехать, и успевает перебежать
  // между створками (ряд не ставится, если на этой скорости не хватает времени: DOORWAY + MIDDLE + SLACK px за
  // LOCK_DISTANCE / скорость − REACTION секунд). Оба прохода достижимы из ЛЮБОЙ точки прошлого выхода (какой из
  // них окажется открытым, заранее не известно). RISE_SPEED — как быстро створка поднимается (только картинка).
  DOORS: { FROM: 50, TIER_1: 100, TIER_2: 160, CHANCE: [0.12, 0.18, 0.24], DOORWAY: 100, MIDDLE: 56, HALF_PERIOD: 0.9, LOCK_DISTANCE: 650, REACTION: 0.3, SLACK: 10, RISE_SPEED: 14 },
  // ТЕЛЕЖКА (Track.createCart): в широком проходе GAP px едет кашпо-тележка WIDTH px. Её положение зависит
  // только от пути трассы, а не от времени: на SWEEP px в сторону на каждый px пути до кота, поэтому на любой
  // скорости она переезжает проход на одном и том же расстоянии, а в ряду у кота стоит там, где задумано (при
  // этом слева и справа от неё не меньше MIN_FREE px). Достаточно успеть хотя бы в один из двух промежутков;
  // в каждом из них центру кота должно быть где встать на ROOM px и больше (с учётом бордюра и сдвига тележки).
  CART: { FROM: 70, TIER_1: 130, CHANCE: [0.12, 0.18], GAP: 260, WIDTH: 84, SWEEP: 0.3, MIN_FREE: 80, ROOM: 28, REACTION: 0.3 },
  // ЗОЛОТОЙ ЧАС (VariationDirector.goldenStep, Track.createGolden): один раз за этап суток «золотой час» идёт
  // серия из ROWS подряд идущих рядов с проходом уже обычного (NARROW от обычной ширины, но не уже MIN_WIDTH:
  // проход всё равно ставится достижимым) и с монетой в каждом проходе — дорожка монет. Серия не задерживает
  // развилку: когда обычных рядов подряд BREATHING_LIMIT, тип ряда выбирает директор, а остаток серии идёт после неё.
  // Монеты серии прибавляют примерно 3 монеты в первые 30 секунд, поэтому первый скин стал стоить 20 (было 16).
  GOLDEN: { ROWS: 4, NARROW: 0.85, MIN_WIDTH: 108, BREATHING_LIMIT: 5 },
  // Магазин скинов (Shop.js, Game, Renderer.drawShop). Те же id, что у SKINS в SkinArt.js; порядок — по
  // возрастанию цены, так они и стоят в окне магазина. Цена — в монетах. Цены подбирались по
  // scripts/phase1n-check.mjs («сколько монет выпадает за минуту забега»). 2026-10-19: монет стало вдвое больше
  // (COIN_CHANCE_*), цены выросли в 1.6 раза: первый скин 16 (≈ 5 коротких забегов), самый дорогой 290.
  // 2026-10-22: после монет «золотого часа» (+3 за первые 30 с) первый скин 20, чтобы он снова стоил не меньше 4 коротких забегов.
  // Бесплатный classic есть у всех с самого начала.
  SHOP: {
    DEFAULT_SKIN: 'classic',
    SKINS: [
      { id: 'classic', price: 0 },
      { id: 'ginger', price: 20 },
      { id: 'honey', price: 40 },
      { id: 'snow', price: 65 },
      { id: 'tuxedo', price: 95 },
      { id: 'siamese', price: 145 },
      { id: 'calico', price: 210 },
      { id: 'ribbon', price: 290 },
      // Ограниченный скин: у каждого игрока доступен `days` дней со дня первого запуска игры, но не позже
      // `until` (после этой даты сезон кончился). Купленный остаётся навсегда. Дорогой (владелец: «большую цену»).
      { id: 'halloween', price: 350, limited: { days: 14, until: '2026-11-30' } }
    ],
    // Сколько секунд на экране магазина висит подсказка «не хватает N».
    MESSAGE_SECONDS: 1.8,
    // Через сколько миллисекунд после запуска игра начинает готовить превью скинов (картинки из SVG собираются за
    // несколько секунд: к первому открытию магазина они должны быть готовы, а запуск они задерживать не должны).
    PREVIEW_PRELOAD_MS: 1500
  },
  // Забег дня (Daily.js, Game.startDaily): у всех в один день одна трасса (зерно из даты). День меняется
  // в полночь по UTC+UTC_OFFSET_HOURS (Москва). ASSIST — помощь новичку в забеге дня: она одна для
  // всех (обычная зависит от рекорда игрока, и трассы разошлись бы), 0,4 — чуть легче обычной. Награда за
  // первый забег дня: REWARD_BASE, за каждый следующий день серии на REWARD_STEP больше, но не больше
  // REWARD_MAX (5, 7, 9, 11, 13, 15, 15...). Серия обрывается, если пропущен день.
  DAILY: {
    UTC_OFFSET_HOURS: 3,
    SEED_SALT: 'omr-daily-',
    ASSIST: 0.4,
    REWARD_BASE: 5,
    REWARD_STEP: 2,
    REWARD_MAX: 15
  },
  // Задания на день (Quests.js, Game, Renderer.drawQuests): три в день — лёгкое, среднее и трудное,
  // за них REWARDS монет (по порядку). Набор выбирается по дате (SEED_SALT), у всех игроков он один. POOL:
  // вид задания → цель для лёгкого, среднего и трудного (null — в этой сложности такого задания нет); виды
  // в одном наборе не повторяются. Цели подбирались по обычному забегу новичка: 30–40 секунд, 400–800 очков,
  // примерно монета за забег (scripts/phase1p-check.mjs держит их в этих рамках). Забег короче MIN_RUN_SECONDS
  // не считается за «сыграй забеги» и «забег дня» (иначе их выполняют мгновенным проигрышем). TOAST_SECONDS —
  // сколько висит плашка «задание выполнено».
  QUESTS: {
    SEED_SALT: 'omr-quests-',
    REWARDS: [3, 5, 8],
    MIN_RUN_SECONDS: 10,
    TOAST_SECONDS: 3,
    POOL: {
      coins: [3, 6, 10], // собрать монеты (за день)
      risk: [3, 6, 10], // пройти узким (рискованным) путём (за день)
      graze: [5, 10, 16], // пройти «впритирку» (за день)
      runs: [3, 5, null], // сыграть забеги (за день)
      daily: [1, 1, null], // сыграть забег дня
      survive: [30, 50, 75], // продержаться секунд в одном забеге
      score: [400, 900, 1800], // набрать очков в одном забеге
      multiplier: [null, 2, 3] // дойти до множителя ×N в одном забеге
    }
  },
  // Достижения (Achievements.js, Game, Renderer.drawAchievements): десять честных целей на всё время игры. Монет за
  // них нет (решение владельца 2026-10-22): только значок в списке и плашка. Здесь числа целей.
  // CLEAN_SECONDS — секунд забега подряд без подобранной монеты; GRAZE_COMBO — «впритирку» подряд (серия считается
  // по GRAZE.COMBO_WINDOW); RISK_STREAK — узких проходов подряд; SURVIVE_SECONDS — секунд в одном забеге; максимальный
  // множитель — MULTIPLIER_MAX; COINS_TOTAL — монет, заработанных за всё время (счётчик coinsEarned: траты его не
  // уменьшают); SKINS_SOME — скинов в коллекции (бесплатный «классик» считается, сезонный нет: после конца сезона
  // «все скины» иначе стали бы недостижимыми); DAILY_STREAK — дней подряд забега дня; QUEST_DAYS — дней подряд, когда
  // выполнены все три задания. TOAST_SECONDS — сколько висит плашка «достижение получено».
  ACHIEVEMENTS: {
    CLEAN_SECONDS: 60, // было 30: владелец 2026-10-22 захотел «минуту, чтобы был челлендж» (30 с получал почти любой, кто едет по центру)
    GRAZE_COMBO: 5,
    RISK_STREAK: 3,
    SURVIVE_SECONDS: 80,
    COINS_TOTAL: 500,
    SKINS_SOME: 5,
    DAILY_STREAK: 7,
    QUEST_DAYS: 3,
    TOAST_SECONDS: 3
  },
  // Подсказка «шире / уже» у первой развилки видна, пока до неё от кота от NEAR до FAR px.
  CHOICE_HINT_NEAR: 80,
  CHOICE_HINT_FAR: 1100,
  CHOICE_GATE_HEIGHT: 64,
  CHOICE_SHOW_HEIGHT: 280,
  CHOICE_INTERVAL_INTRO: [8, 14],
  CHOICE_INTERVAL_EARLY: [7, 12],
  CHOICE_INTERVAL_MID: [7, 11],
  CHOICE_INTERVAL_LATE: [6, 10],
  // Страховка «после 5 и 7 обычных участков подряд развилка почти обязательна» считается в участках и подбиралась,
  // пока скорость не превышала это значение (1 участок ≈ 0.9 с). Быстрее участки проходятся чаще, и развилки
  // пошли бы чаще, чем раз в 5.6 с: порог в участках растёт вместе со скоростью (VariationDirector.chooseType).
  // Было 720; при максимуме трассы 1050 среднее между развилками на 2-й минуте падало до 5.55 с, поэтому 650, а после
  // того как монет стало больше (другие числа в генераторе), 600: запас в средних 5.6 с.
  CHOICE_PACE_SPEED: 600,
  DUAL_RISK_EXTRA_COOLDOWN: 2,
  // 2026-10-19, по просьбе владельца («монеты падают слишком редко»): монеты чаще (шансы ниже ×1.8–2.7),
  // подряд в соседних рядах возможны (REPEAT 0.45 → 0.75), иногда две в одном ряду (PAIR), а ставятся они
  // ближе к стенам прохода: нужно съехать с линии, схватить и вернуться (CENTER_WEIGHT — вес середины против
  // краёв, EDGE_POWER — на сколько жмёт к стене положение внутри зоны). Достижимость и «можно не брать»
  // проверяются как и раньше (isCoinValid). Цены скинов подняты вместе с этим (SHOP).
  COIN_REPEAT_CHANCE_SCALE: 0.75,
  COIN_PAIR_CHANCE: 0.25,
  COIN_CENTER_WEIGHT: 0.5,
  COIN_EDGE_POWER: 1.8,
  CHOICE_FORK_REPEAT_WEIGHT: 0.2,

  // Bonus coins (meta currency, not score)
  COIN_CHANCE_INTRO: 0.12,
  COIN_CHANCE_EARLY: 0.24,
  COIN_CHANCE_MID: 0.34,
  COIN_CHANCE_LATE: 0.42,
  COIN_CHANCE_MAX: 0.5,
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
  // Воронка расширяет безопасный путь на EXPAND в крайних рядах; в среднем (самом узком) ряду стена у края, к которому
  // прижата развилка, становится EXPAND / 2. Она должна остаться скрытой под бордюром: EXPAND / 2 <= EDGE_WALL_HIDDEN (16).
  // Было 36: стена 18 px торчала из-под бордюра на 1 px, её не было видно, но кот у края её задевал.
  PATTERN_FUNNEL_EXPAND_SAFE: 32,
  PATTERN_FUNNEL_EXPAND_RISK: 16,

  YANDEX: {
    SDK_URL: '/sdk.js',
    DEFAULT_LANGUAGE: 'en',
    SUPPORTED_LANGUAGES: ['en', 'ru'],
    // Языки, для которых показываем русский интерфейс (так советует Яндекс для СНГ).
    RUSSIAN_UI_LANGUAGES: ['ru', 'be', 'kk', 'uk', 'uz'],
    LEADERBOARD_NAME: 'OneMoreRunScore',
    ADS_ENABLED: true,
    // Имитация рекламы за награду без SDK. Включается только в npm run dev (main.js).
    DEV_REWARDED_STUB: false,
    // Кнопка «×2 монеты за рекламу» на экране проигрыша. Выключена, пока монеты некуда тратить
    // (нет магазина): иначе игрок не получает ничего за просмотр рекламы. Включить вместе с магазином.
    DOUBLE_COINS_AD: true,
    // Облачное сохранение (player.getData / setData): что хранится и как часто пишем.
    // Лимит Яндекса — 100 запросов за 5 минут, поэтому запись не чаще раза в CLOUD_SAVE_MIN_INTERVAL_MS.
    // coins — баланс для старых версий игры; coinsEarned / coinsSpent / skinsOwned / skinSelected — магазин.
    CLOUD_KEYS: ['bestScore', 'coins', 'coinsEarned', 'coinsSpent', 'skinsOwned', 'skinSelected', 'firstDay', 'bestRunTime', 'dailyDay', 'dailyStreak', 'dailyBest', 'questDay', 'questProgress', 'questClaimed', 'achievements', 'achQuestDay', 'achQuestStreak', 'choiceHintSeen', 'riskHintSeen'],
    CLOUD_SAVE_MIN_INTERVAL_MS: 4000,
    // Таблица лидеров: сколько верхних записей и сколько вокруг игрока, сколько хранить ответ.
    LEADERBOARD_TOP: 10,
    LEADERBOARD_AROUND: 1,
    LEADERBOARD_CACHE_MS: 20000,
    // Просить оценку игры после нового рекорда, начиная с этого по счёту забега (за сессию).
    REVIEW_AFTER_RUNS: 3,
    // Имитация облака/таблицы/оценки/ярлыка без SDK. Включается только в npm run dev (main.js).
    DEV_PLATFORM_STUB: false,
    // Сколько ждать onRewarded после onClose, прежде чем решить, что награды нет
    // (порядок колбэков в документации Яндекса не указан).
    REWARDED_CLOSE_GRACE_MS: 250,
    // Сколько секунд на экране проигрыша висит надпись «награды нет» (реклама закрыта раньше времени или не показалась).
    NOTICE_SECONDS: 3,
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
    SPEED_SCROLL_SCALE: 0.35,
    AUDIO_VOLUME: 0.18,
    AUDIO_COOLDOWN: 0.05,
    // Вибрация на телефоне (HapticsService): включена, пока звук не выключен. Узоры — в мс
    // (число — один импульс, массив — импульс, пауза, импульс...). Не чаще HAPTIC_MIN_GAP_MS.
    HAPTICS: true,
    HAPTIC_MIN_GAP_MS: 60,
    HAPTIC_PATTERNS: {
      graze: 8,
      stage: [20, 40, 20],
      risk: 16,
      streak: [18, 24, 18],
      max: [30, 30, 30, 30, 60],
      lost: 28,
      best: [20, 30, 20],
      yarn: 12,
      shield: [30, 20, 50],
      over: [40, 30, 80]
    },
    // Серия звучит выше: ступень серии → нота пентатоники (в тон музыке), не выше последней.
    // Монеты подряд (не позже COIN_CHAIN_WINDOW секунд друг от друга) тоже поднимаются.
    SCALE_SEMITONES: [0, 2, 4, 7, 9, 12, 14, 16],
    COIN_CHAIN_WINDOW: 1.2,
    INTENSITY_SAFE: 0.22,
    INTENSITY_COIN: 0.16,
    INTENSITY_RISK: 0.5,
    INTENSITY_STREAK: 0.75,
    INTENSITY_STREAK_LOSS: 0.82,
    INTENSITY_MAX: 1
  },

  // Общая громкость звука (регулятор в игре). VOLUME_DEFAULT — при первом запуске (50%).
  // MASTER_SCALE: во сколько раз усиливается звук при 100% (при 50% — ровно как настроено).
  AUDIO: {
    VOLUME_DEFAULT: 0.5,
    VOLUME_STEP: 0.1,
    MASTER_SCALE: 2
  },

  // Музыка забега «Ручей» (AudioService + MusicScore): арпеджио и певучая мелодия без звуковых файлов.
  // VOLUME — общая громкость музыки; она тише эффектов, чтобы монеты и удары были слышны.
  // Темп растёт от BPM_START до BPM_MAX вместе со скоростью забега.
  // VOICES — голоса: форма звука (type), срез фильтра (cutoff, выше — ярче), громкость (amp), нарастание
  // (attack, с), hold — какая доля длины ноты она звучит; у арпеджио ещё maxSeconds (щипок не длиннее) и
  // overtone: тихий звук на ratio раз выше, который быстро гаснет (decay, с) и даёт «дерево маримбы».
  // AMBIENCE — очень тихие добавки по времени суток: STAGES — какой звук в каком этапе (день — птицы, ночь —
  // сверчки); AMP — громкость (птицы на треть тише, чем в первой пробе: так просил владелец). У птиц GAP_MIN +
  // случайное до GAP_RANGE секунд между трелями. Сверчки сделаны по записи «пары сверчков», которую дал владелец
  // (разобрана по числам: почти чистый тон 4,25 кГц, трель из 4–6 импульсов через ~29 мс, у каждого импульса
  // плавный подъём ~13 мс и быстрый обрыв ~9 мс, внутри трели громкость растёт к третьему импульсу, интервалы
  // между стрекотами 0,55–1,4 с с редкими паузами, второй сверчок тише и ниже): VOICES — сверчки: freq (Гц),
  // level — их громкость относительно AMP, period — обычный интервал между стрекотами (с); UNEVEN — разброс
  // интервала (±40%); PULSES — сколько импульсов в стрекоте (берётся одно из списка, пятёрка чаще);
  // PULSE_GAP — расстояние между импульсами (с); PROFILE — громкость импульсов по порядку (доля от AMP);
  // изредка (REST_CHANCE) сверчок молчит ещё REST секунд.
  MUSIC: {
    ENABLED: true,
    VOLUME: 0.8,
    BPM_START: 96,
    BPM_MAX: 112,
    FADE_IN: 0.9,
    FADE_OUT: 0.7,
    LOOKAHEAD: 0.25,
    TICK_MS: 50,
    VOICES: {
      melody: { type: 'sine', amp: 0.1, cutoff: 3200, attack: 0.05, hold: 0.97 },
      bass: { type: 'triangle', amp: 0.1, cutoff: 480, attack: 0.02, hold: 0.92 },
      arp: { type: 'sine', amp: 0.085, cutoff: 4200, attack: 0.004, hold: 0.9, maxSeconds: 0.5, overtone: { ratio: 4, level: 0.35, decay: 0.06 } },
      pad: { type: 'sine', amp: 0.026, cutoff: 1400, attack: 0.35, hold: 1 }
    },
    AMBIENCE: {
      STAGES: { day: 'birds', night: 'crickets' },
      FIRST_DELAY: 1.5,
      BIRDS: { GAP_MIN: 2.8, GAP_RANGE: 4.2, AMP: 0.0175, NOTES_MIN: 2, NOTES_RANGE: 3, FREQ_MIN: 2600, FREQ_RANGE: 1600, VIBRATO_HZ: 38 },
      CRICKETS: {
        AMP: 0.012,
        VOICES: [{ freq: 4255, level: 1, period: 1 }, { freq: 4150, level: 0.55, period: 4 }],
        PULSES: [4, 5, 5, 6],
        PULSE_GAP: 0.029,
        PROFILE: [0.4, 0.8, 1, 0.95, 0.9, 0.6],
        UNEVEN: 0.4,
        REST_CHANCE: 0.08,
        REST: 1
      }
    }
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
      TREES: { EVERY: 12, GROUP: [1, 2], LEFT_OFFSET: 0, RIGHT_OFFSET: 6 },
      // Доля непустых мест между группами (там мелочи: кусты, камни, заборчики, трава).
      CHANCE: 0.5,
      // Предмет проявляется плавно на первых FADE_ROWS строках экрана под горизонтом.
      FADE_ROWS: 90,
      // Зазор (px у кота) между краем изгороди и ближним краем кустов, камней и заборчиков:
      // мелочи стоят на газоне за изгородью и на неё не заходят. Деревья могут нависать.
      HEDGE_GAP: 10
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
    // Газон (LawnArt.js): ряды через PATCH_PERIOD px дороги; вдоль ряда газон нарезан на полосы шириной
    // SLOT_WIDTH ширин дороги (их не больше MAX_SLOTS), в каждой полосе пятно с шансом PATCH_CHANCE и пучок
    // травы (до TUFTS_PER_SLOT штук, каждый с шансом TUFT_CHANCE; пучки только ближе половины масштаба).
    // Шансы относятся к ПОЛОСЕ, а не к ряду (до 2026-10-12 они были на ряд, а отступ считался от края экрана:
    // пятна «плыли» относительно деревьев). Общее число пятен и пучков осталось примерно прежним.
    LAWN: {
      PATCH_PERIOD: 34,
      PATCH_CHANCE: 0.34,
      TUFT_CHANCE: 0.45,
      TUFTS_PER_SLOT: 3,
      SLOT_WIDTH: 0.9,
      MAX_SLOTS: 10
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
      TREE_HEIGHT: 1.45
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
    FLASH_STREAK_LOSS: hexAlpha(InkBrown, 0.12),
    // Клубок-щит: пряжа — смесь HighRiskClay и SkyPaper (светлее и темнее по долям), цвет щита вокруг кота тот же.
    YARN: blendHex(HighRiskClay, SkyPaper, 0.35),
    YARN_LIGHT: blendHex(HighRiskClay, SkyPaper, 0.65),
    YARN_DARK: HighRiskClay
  };
}

// Смесь двух цветов #RRGGBB: share — доля второго (0 — первый, 1 — второй).
function blendHex(a, b, share) {
  const mix = (offset) => {
    const from = parseInt(a.slice(offset, offset + 2), 16);
    const to = parseInt(b.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * share).toString(16).padStart(2, '0');
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`.toUpperCase();
}

function hexAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Доля помощи новичку 0..1 по лучшему счёту: 1 — лучший счёт 0, 0 — от ASSIST.UNTIL_BEST и выше.
export function getAssist(bestScore) {
  const best = Math.max(0, Number(bestScore) || 0);
  return Math.max(0, Math.min(1, 1 - best / CONFIG.ASSIST.UNTIL_BEST));
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

// Номер ступени качающегося кашпо по времени забега: −1 — ещё рано, иначе 0, 1 или 2.
export function getSwayTier(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  const sway = CONFIG.SWAY;
  if (t < sway.FROM) return -1;
  if (t < sway.TIER_1) return 0;
  if (t < sway.TIER_2) return 1;
  return 2;
}

// Шанс, что обычный ряд будет с качающимся кашпо (0, пока не наступило FROM).
export function getSwayChance(runTimeSeconds) {
  const tier = getSwayTier(runTimeSeconds);
  return tier < 0 ? 0 : CONFIG.SWAY.CHANCE[tier];
}

// Период качания кашпо (секунды) для ряда, созданного в этот момент забега.
// Шанс особого ряда по этапам забега: до FROM — 0, потом CHANCE[0], с TIER_1 — CHANCE[1], с TIER_2 — CHANCE[2]
// (у тележки два этапа).
function tierChance(cfg, runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  if (t < cfg.FROM) return 0;
  if (t < cfg.TIER_1) return cfg.CHANCE[0];
  if (cfg.TIER_2 === undefined || t < cfg.TIER_2) return cfg.CHANCE[1];
  return cfg.CHANCE[2];
}

export function getDoorsChance(runTimeSeconds) {
  return tierChance(CONFIG.DOORS, runTimeSeconds);
}

export function getCartChance(runTimeSeconds) {
  return tierChance(CONFIG.CART, runTimeSeconds);
}

export function getSwayPeriod(runTimeSeconds) {
  return CONFIG.SWAY.PERIOD[Math.max(0, getSwayTier(runTimeSeconds))];
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

// Путь трассы (px) за t секунд забега: интеграл getTrackSpeed.
export function getTrackDistance(runTimeSeconds) {
  const t = Math.max(0, Number(runTimeSeconds) || 0);
  const start = CONFIG.TRACK_SPEED_START;
  const max = CONFIG.TRACK_SPEED_MAX;
  const tau = CONFIG.TRACK_SPEED_TAU;
  return max * t - (max - start) * tau * (1 - Math.exp(-t / tau));
}

// Обратная к getTrackDistance: за сколько секунд забега трасса проходит distance px. Путь растёт
// всё время (скорость положительна), поэтому подходит деление пополам; число шагов фиксировано,
// чтобы результат был одним и тем же у всех (Track.canonical, забег дня).
export function getTimeAtDistance(distance) {
  const target = Math.max(0, Number(distance) || 0);
  if (target === 0) return 0;
  let low = 0;
  let high = 1;
  while (getTrackDistance(high) < target && high < 1e7) high *= 2;
  for (let step = 0; step < 64; step += 1) {
    const mid = (low + high) / 2;
    if (getTrackDistance(mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// Скорость стрейфа кота для текущей скорости трассы: 420 на старте, 500 на максимуме.
export function getPlayerSpeed(trackSpeed) {
  const start = CONFIG.TRACK_SPEED_START;
  const max = CONFIG.TRACK_SPEED_MAX;
  const t = Math.max(0, Math.min(1, (trackSpeed - start) / Math.max(1, max - start)));
  return CONFIG.PLAYER_SPEED + (CONFIG.PLAYER_SPEED_MAX - CONFIG.PLAYER_SPEED) * t;
}