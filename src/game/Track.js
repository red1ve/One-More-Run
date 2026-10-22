import { systemRandom, createSeededRandom } from './Random.js';
import {
  CONFIG, getCoinChance, getPlayerSpeed, getSwayPeriod, getTimeAtDistance, getTrackSpeed, isIntentionalRiskType
} from '../config.js';
import { VariationDirector } from './VariationDirector.js';
import { playableXBounds } from './Corridor.js';

const VISUAL_OBSTACLE_TYPES = ['FLOWER_GATE', 'STANDING_PLANTER', 'GARDEN_FENCE'];
const VISUAL_OBSTACLE_IDS = {
  FLOWER_GATE: ['garden-gate'],
  STANDING_PLANTER: ['planter-04', 'planter-06', 'planter-08'],
  GARDEN_FENCE: ['garden-fence']
};

function visualUnit(n) {
  const x = Math.sin(Number(n) * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function chooseVisualObstacleType(segmentId, previousType) {
  const types = VISUAL_OBSTACLE_TYPES;
  let index = Math.floor(visualUnit(segmentId) * types.length) % types.length;
  if (previousType && types[index] === previousType) {
    index = (index + 1) % types.length;
  }
  return types[index];
}

function chooseVisualObstacleScale(segmentId) {
  const unit = visualUnit(segmentId * 5.91);
  if (unit < 0.34) return 0.97;
  if (unit < 0.67) return 1.0;
  return 1.04;
}

function chooseVisualObstacleId(type, seed) {
  const ids = VISUAL_OBSTACLE_IDS[type] || VISUAL_OBSTACLE_IDS.STANDING_PLANTER;
  return ids[Math.floor(visualUnit(seed) * ids.length) % ids.length];
}

export class Track {
  constructor() {
    this.segments = [];
    this.segmentHeight = CONFIG.SEGMENT_HEIGHT;
    this.speed = CONFIG.GAME_SPEED;
    this.lastExits = [];
    this.lastGapX = CONFIG.CANVAS_WIDTH / 2;
    this.generatedPlayable = 0;
    this.breathingSinceChoice = 0;
    this.choiceCount = 0;
    this.runTime = 0;
    this.lastCoinZone = null;
    this.lastCoinYSlot = null;
    this.lastYarnTime = -Infinity; // секунда забега, на которой появился последний клубок-щит
    this.assist = 0; // помощь новичку 0..1 (см. CONFIG.ASSIST), задаётся перед забегом
    this.swayClock = 0; // секунды забега для качающихся кашпо (Track.placeSway)
    this.canonical = false; // забег дня: ряды создаются в идеальный момент (Track.addSegmentAt)
    this.createdByUpdate = 0; // сколько рядов создано движением трассы (не при старте)
    this.firstTriggerDistance = 0; // путь трассы до создания первого такого ряда
    this.director = new VariationDirector();
    this.random = systemRandom;
    this.init();
  }

  // Помощь новичку: 0 — нет, 1 — полная. Действует со следующего reset().
  setAssist(value) {
    const number = Number(value);
    this.assist = Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  }

  // Прибавка к ширине прохода (px, кратна 4, чтобы не ломать сетку поиска места).
  assistBonus(maxBonus) {
    return Math.round((this.assist * maxBonus) / 4) * 4;
  }

  // Номер забега: одинаковый seed — одинаковая трасса. null — обычная случайность.
  setSeed(seed) {
    this.seed = seed == null || !Number.isFinite(Number(seed)) ? null : Number(seed);
    this.random = this.seed == null ? systemRandom : createSeededRandom(this.seed);
    this.director.random = this.random;
  }

  init() {
    this.segments = [];
    this.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    this.generatedPlayable = 0;
    this.breathingSinceChoice = 0;
    this.choiceCount = 0;
    this.runTime = 0;
    this.swayClock = 0;
    this.lastCoinZone = null;
    this.lastCoinYSlot = null;
    this.lastYarnTime = -Infinity;
    this.director.reset();
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight, 'EMPTY');
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight * 2, 'EMPTY');
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight * 3, 'NORMAL');
    // Сколько трассе ехать, пока верхний ряд не пересечёт границу и не появится следующий (Track.addSegmentAt).
    this.firstTriggerDistance = -this.segmentHeight - this.segments[this.segments.length - 1].y;
    this.createdByUpdate = 0;
  }

  // lastGapX — центр прохода. Если проходов несколько, это среднее центров.
  setExits(exits) {
    this.prevExits = this.lastExits.map((exit) => ({ x: exit.x, width: exit.width }));
    this.lastExits = exits.map((exit) => ({ x: exit.x, width: exit.width }));
    const totalCenter = this.lastExits.reduce((sum, exit) => sum + exit.x + exit.width / 2, 0);
    this.lastGapX = totalCenter / this.lastExits.length;
  }

  maxLateral(travelY) {
    const speed = Math.max(this.speed, 1);
    const time = Math.max(travelY, 0) / speed;
    return CONFIG.PLAYER_SPEED * time * CONFIG.REACHABILITY_MARGIN;
  }

  canReach(from, to, travelY) {
    const half = CONFIG.PLAYER_WIDTH / 2;
    const fromMin = from.x + half;
    const fromMax = from.x + from.width - half;
    const toMin = to.x + half;
    const toMax = to.x + to.width - half;
    if (fromMax < fromMin || toMax < toMin) return false;

    const lateral = this.maxLateral(travelY);
    const reachMin = fromMin - lateral;
    const reachMax = fromMax + lateral;
    return reachMin <= toMax && reachMax >= toMin;
  }

  allExitsReach(to, travelY) {
    return this.lastExits.every((from) => this.canReach(from, to, travelY));
  }

  getFreeTravelTo(gateY, gateHeight) {
    if (this.segments.length === 0) return this.segmentHeight;

    const prev = this.segments[this.segments.length - 1];
    let prevTop = prev.y + this.segmentHeight;
    if (prev.obstacles.length > 0) {
      prevTop = prev.obstacles.reduce((minY, obs) => Math.min(minY, obs.y), Infinity);
    } else if (prev.paths.length > 0) {
      prevTop = prev.paths.reduce((minY, path) => Math.min(minY, path.y), Infinity);
    }

    const distance = prevTop - gateY;
    return Math.max(40, distance - CONFIG.PLAYER_HEIGHT - gateHeight);
  }

  getChoiceWidths() {
    const speedRatio = this.speed / CONFIG.GAME_SPEED;
    const bonus = this.assistBonus(CONFIG.ASSIST.SAFE_BONUS);
    if (this.choiceCount === 0 || this.generatedPlayable < 5) {
      // Первая развилка: прибавка не больше TUTORIAL_SAFE_BONUS_MAX, иначе на стены у краёв
      // остаётся меньше 58 px и развилку нельзя поставить с нормальными стенами.
      const tutorialBonus = Math.min(bonus, CONFIG.ASSIST.TUTORIAL_SAFE_BONUS_MAX);
      return { safe: CONFIG.SAFE_GAP_TUTORIAL + tutorialBonus, risk: CONFIG.RISKY_GAP_TUTORIAL };
    }
    if (speedRatio < 1.25) {
      return { safe: CONFIG.SAFE_GAP_WIDTH + bonus, risk: CONFIG.RISKY_GAP_WIDTH };
    }
    return { safe: CONFIG.SAFE_GAP_LATE + bonus, risk: CONFIG.RISKY_GAP_LATE };
  }

  getBreathingWidth() {
    const bonus = this.assistBonus(CONFIG.ASSIST.BREATHING_BONUS);
    if (this.generatedPlayable < 4) return CONFIG.BREATHING_GAP_WIDTH + bonus;
    if (this.speed / CONFIG.GAME_SPEED < 1.25) return CONFIG.BREATHING_GAP_WIDTH + bonus;
    return CONFIG.BREATHING_GAP_LATE + bonus;
  }

  isChoiceType(type) {
    return type === 'TWO_PATHS' || type === 'DUAL_RISK';
  }

  pickSegmentType(requested) {
    if (requested === 'RISKY' || requested === 'SHORT_RISKY') {
      return 'NORMAL';
    }
    if (requested) return requested;
    // Серия золотого часа идёт подряд, но развилку не задерживает: после BREATHING_LIMIT обычных рядов тип выбирает
    // директор, а оставшиеся ряды серии продолжатся после развилки.
    if (this.director.goldenActive() && this.breathingSinceChoice < CONFIG.GOLDEN.BREATHING_LIMIT) return 'NORMAL';

    const lastType = this.segments.length > 0
      ? this.segments[this.segments.length - 1].type
      : 'EMPTY';

    return this.director.chooseType({
      runTime: this.runTime,
      speed: this.speed,
      breathingSinceChoice: this.breathingSinceChoice,
      choiceCount: this.choiceCount,
      lastType
    });
  }

  preferredChoiceForkX(forkW) {
    const minFork = CONFIG.TRACK_LEFT;
    const maxFork = CONFIG.TRACK_RIGHT - forkW;
    const centered = this.lastGapX - forkW / 2;
    const left = minFork + 12;
    const right = maxFork - 12;
    const mid = (minFork + maxFork) / 2;
    const bias = this.director.pickForkBias();
    let target = centered;
    if (bias === 'LEFT') target = centered * 0.35 + left * 0.65;
    else if (bias === 'RIGHT') target = centered * 0.35 + right * 0.65;
    else target = centered * 0.55 + mid * 0.45;
    target += (this.random() - 0.5) * 28;
    return Math.max(minFork, Math.min(maxFork, target));
  }

  getTravelTo(nextObstacleY) {
    if (this.segments.length === 0) return this.segmentHeight;

    const prev = this.segments[this.segments.length - 1];
    let prevBottom = prev.y + this.segmentHeight;

    if (prev.obstacles.length > 0) {
      prevBottom = prev.obstacles.reduce((maxY, obs) => Math.max(maxY, obs.y + obs.height), -Infinity);
    } else if (prev.paths.length > 0) {
      prevBottom = prev.paths.reduce((maxY, path) => Math.max(maxY, path.y + path.height), -Infinity);
    }

    return Math.max(40, prevBottom - nextObstacleY);
  }

  findGapX(width, obstacleY, preferredCenter) {
    const travelY = this.getTravelTo(obstacleY);
    return this.findGapXForTravel(width, preferredCenter, travelY);
  }

  // Стена у края дорожки (между краем и проходом) либо скрыта под бордюром (до EDGE_WALL_HIDDEN,
  // это проход «вплотную к краю»), либо не уже EDGE_WALL_MIN: стена между ними выглядела бы
  // крошечным кустиком. Проверяется для прохода [x, x + width].
  edgeWallsOk(x, width) {
    const min = CONFIG.EDGE_WALL_MIN - 0.01;
    const hidden = CONFIG.EDGE_WALL_HIDDEN + 0.01;
    const left = x - CONFIG.TRACK_LEFT;
    const right = CONFIG.TRACK_RIGHT - (x + width);
    return (left <= hidden || left >= min) && (right <= hidden || right >= min);
  }

  // Тонкая стена у края (см. EDGE_WALL_THIN_MAX): из-под бордюра торчит на пару пикселей, её не видно, а кот её задевает.
  edgeWallsThin(x, width) {
    const hidden = CONFIG.EDGE_WALL_HIDDEN + 0.01;
    const thin = CONFIG.EDGE_WALL_THIN_MAX;
    const left = x - CONFIG.TRACK_LEFT;
    const right = CONFIG.TRACK_RIGHT - (x + width);
    return (left > hidden && left < thin) || (right > hidden && right < thin);
  }

  // На сколько px можно сдвигать проём (развилку), оставляя стены у краёв допустимыми, если на
  // стены всего room px: самый длинный непрерывный отрезок допустимых положений (см. edgeWallsOk).
  edgeDriftCapacity(room) {
    const hidden = CONFIG.EDGE_WALL_HIDDEN;
    const min = CONFIG.EDGE_WALL_MIN;
    // Левая стена l: скрыта (0..hidden) или нормальная (min..room); правая room − l: то же самое.
    const lengths = [
      Math.min(hidden, room - min), // левая скрыта, правая нормальная
      Math.min(hidden, room - min), // левая нормальная, правая скрыта
      room - 2 * min, // обе нормальные
      2 * hidden - room // обе скрыты (развилка почти во всю дорожку)
    ];
    return Math.max(0, ...lengths);
  }

  // Ближайшее к x допустимое положение левого края проёма ширины width: вплотную к левому
  // или правому краю дорожки либо с нормальными стенами с обеих сторон (см. edgeWallsOk).
  // Развилка узкая, запаса места на стены мало, поэтому подбираем место, а не отбрасываем.
  snapToEdgeRule(x, width) {
    if (this.edgeWallsOk(x, width)) return x;
    const min = CONFIG.EDGE_WALL_MIN;
    const hidden = CONFIG.EDGE_WALL_HIDDEN;
    const lo = CONFIG.TRACK_LEFT;
    const room = CONFIG.TRACK_WIDTH - width;
    const options = [lo, lo + hidden, lo + min, lo + room - min, lo + room - hidden, lo + room]
      .filter((option) => option >= lo && option <= lo + room && this.edgeWallsOk(option, width));
    if (!options.length) return Math.max(lo, Math.min(lo + room, x));
    return options.reduce((best, option) => (Math.abs(option - x) < Math.abs(best - x) ? option : best));
  }

  // wallWidths — все ширины прохода, которые он примет в ряду с тем же центром
  // (у воронки проход сужается): стены у края проверяются для каждой.
  findGapXForTravel(width, preferredCenter, travelY, wallWidths = [width]) {
    const minX = CONFIG.TRACK_LEFT;
    const maxX = CONFIG.TRACK_RIGHT - width;
    if (maxX < minX) return null;

    let bestX = null;
    let bestScore = Infinity;
    const start = Math.max(minX, Math.min(maxX, preferredCenter - width / 2));

    for (let x = minX; x <= maxX; x += 4) {
      const center = x + width / 2;
      if (!wallWidths.every((w) => this.edgeWallsOk(center - w / 2, w))) continue;
      if (!this.allExitsReach({ x, width }, travelY)) continue;
      const score = Math.abs(x - start);
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }

    return bestX;
  }

  placeReachableGap(minWidth, obstacleY, preferredCenter) {
    for (let width = minWidth; width <= CONFIG.TRACK_WIDTH; width += 16) {
      const x = this.findGapX(width, obstacleY, preferredCenter);
      if (x !== null) return { x, width };
    }
    return { x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH };
  }

  addWallsAroundGap(obstacles, gapX, gapWidth, y, height) {
    if (gapX > CONFIG.TRACK_LEFT) {
      obstacles.push({
        x: CONFIG.TRACK_LEFT,
        y,
        width: gapX - CONFIG.TRACK_LEFT,
        height
      });
    }
    if (gapX + gapWidth < CONFIG.TRACK_RIGHT) {
      obstacles.push({
        x: gapX + gapWidth,
        y,
        width: CONFIG.TRACK_RIGHT - (gapX + gapWidth),
        height
      });
    }
  }

  getPatternOffsetLimit() {
    if (this.runTime < 30) return CONFIG.PATTERN_OFFSET_SHIFT_INTRO;
    if (this.runTime < 60) return CONFIG.PATTERN_OFFSET_SHIFT_EARLY;
    if (this.runTime < 120) return CONFIG.PATTERN_OFFSET_SHIFT_MID;
    return CONFIG.PATTERN_OFFSET_SHIFT_LATE;
  }

  centerBounds(width) {
    return {
      min: CONFIG.TRACK_LEFT + width / 2,
      max: CONFIG.TRACK_RIGHT - width / 2
    };
  }

  gapFromCenter(center, width, type = 'SAFE', baseReward = undefined) {
    const bounds = this.centerBounds(width);
    const safeCenter = Math.max(bounds.min, Math.min(bounds.max, center));
    const opening = {
      x: safeCenter - width / 2,
      width,
      type
    };
    if (baseReward !== undefined) opening.baseReward = baseReward;
    return opening;
  }

  playerCenterRange(opening) {
    const half = CONFIG.PLAYER_WIDTH / 2;
    return {
      min: opening.x + half,
      max: opening.x + opening.width - half
    };
  }

  transitionTravel(previousRow, nextRow, gateHeight) {
    return Math.max(
      0,
      previousRow.y - (nextRow.y + gateHeight) - CONFIG.PLAYER_HEIGHT
    );
  }

  canFollowRouteFromExit(exit, route, initialTravel, gateHeight) {
    let reachable = this.playerCenterRange(exit);
    if (reachable.max < reachable.min) return false;

    for (let index = 0; index < route.length; index += 1) {
      const opening = route[index];
      const target = this.playerCenterRange(opening);
      if (target.max < target.min) return false;
      const travelY = index === 0
        ? initialTravel
        : this.transitionTravel(route[index - 1], opening, gateHeight);
      const lateral = this.maxLateral(travelY);
      reachable = {
        min: Math.max(target.min, reachable.min - lateral),
        max: Math.min(target.max, reachable.max + lateral)
      };
      if (reachable.max < reachable.min) return false;
    }

    return true;
  }

  // strictEdges: дополнительно требует нормальные стены у краёв дорожки (см. edgeWallsOk).
  // Без него проверяется только проходимость, как и раньше.
  validateGateRows(rows, initialTravel, gateHeight, strictEdges = false) {
    if (!rows.length) return false;
    const routeCount = rows[0].openings.length;
    if (routeCount < 1) return false;

    for (const row of rows) {
      if (row.openings.length !== routeCount) return false;
      const sorted = [...row.openings].sort((a, b) => a.x - b.x);
      let right = CONFIG.TRACK_LEFT;
      for (const opening of sorted) {
        if (
          opening.width < CONFIG.MIN_GAP
          || opening.x < CONFIG.TRACK_LEFT
          || opening.x + opening.width > CONFIG.TRACK_RIGHT
          || opening.x < right
        ) return false;
        right = opening.x + opening.width;
      }
    }

    for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
      const route = rows.map((row) => ({
        ...row.openings[routeIndex],
        y: row.y
      }));
      for (const exit of this.lastExits) {
        if (!this.canFollowRouteFromExit(exit, route, initialTravel, gateHeight)) {
          return false;
        }
      }
    }

    // Стены у краёв дорожки в каждом ряду: либо нет, либо не уже EDGE_WALL_MIN.
    if (strictEdges) {
      for (const row of rows) {
        const first = Math.min(...row.openings.map((opening) => opening.x));
        const last = Math.max(...row.openings.map((opening) => opening.x + opening.width));
        if (!this.edgeWallsOk(first, last - first)) return false;
      }
    }

    return true;
  }

  // Ряды узора (сдвиг, воронка, ворота) строятся от места первого ряда, и дальние ряды
  // могут оставить у края узкую щепку. Тогда весь узор целиком сдвигается вбок (его форма
  // и расстояния между рядами не меняются) на ближайшее место, где все стены нормальные,
  // а до рядов по-прежнему можно доехать. Если такого места нет, возвращается null.
  fitRowsToEdgeRule(rows, initialTravel, gateHeight) {
    // Кандидаты сдвига: 0, сетка через 2 px и точные сдвиги, после которых стена у края
    // ровно EDGE_WALL_MIN или ровно 0 (нужны, когда запаса места на стены почти нет).
    const min = CONFIG.EDGE_WALL_MIN;
    const shifts = new Set([0]);
    for (let delta = 2; delta <= CONFIG.TRACK_WIDTH; delta += 2) {
      shifts.add(delta);
      shifts.add(-delta);
    }
    for (const row of rows) {
      const first = Math.min(...row.openings.map((opening) => opening.x));
      const last = Math.max(...row.openings.map((opening) => opening.x + opening.width));
      const left = first - CONFIG.TRACK_LEFT;
      const right = CONFIG.TRACK_RIGHT - last;
      const hidden = CONFIG.EDGE_WALL_HIDDEN;
      for (const shift of [min - left, -left, hidden - left, right - min, right, right - hidden]) shifts.add(shift);
    }
    const ordered = [...shifts].sort((a, b) => Math.abs(a) - Math.abs(b));
    for (const shift of ordered) {
      const moved = shift === 0 ? rows : rows.map((row) => ({
        ...row,
        openings: row.openings.map((opening) => ({ ...opening, x: opening.x + shift }))
      }));
      if (this.validateGateRows(moved, initialTravel, gateHeight, true)) return moved;
    }
    return null;
  }

  addWallsAroundOpenings(obstacles, openings, y, height) {
    const sorted = [...openings].sort((a, b) => a.x - b.x);
    let cursor = CONFIG.TRACK_LEFT;
    for (const opening of sorted) {
      if (opening.x > cursor) {
        obstacles.push({ x: cursor, y, width: opening.x - cursor, height });
      }
      cursor = opening.x + opening.width;
    }
    if (cursor < CONFIG.TRACK_RIGHT) {
      obstacles.push({ x: cursor, y, width: CONFIG.TRACK_RIGHT - cursor, height });
    }
  }

  compileGateRows(segmentY, gateRows, initialTravel, gateHeight = CONFIG.PATTERN_GATE_HEIGHT) {
    // Сначала узор с нормальными стенами у краёв (при необходимости сдвинутый целиком). Если
    // такого места нет (воронка развилки, очень узкий запас), берём узор как есть: он годится
    // по достижимости, и лучше узкая стена у края, чем потерять узор.
    let rows = this.fitRowsToEdgeRule(gateRows, initialTravel, gateHeight);
    if (!rows) {
      if (!this.validateGateRows(gateRows, initialTravel, gateHeight)) return null;
      rows = gateRows;
    }

    const obstacles = [];
    const paths = [];
    rows.forEach((row, rowIndex) => {
      this.addWallsAroundOpenings(obstacles, row.openings, row.y, gateHeight);
      const pathBottom = rowIndex === 0
        ? segmentY + this.segmentHeight - gateHeight
        : rows[rowIndex - 1].y + gateHeight;
      const pathHeight = Math.max(gateHeight, pathBottom - row.y);
      row.openings.forEach((opening, routeIndex) => {
        paths.push({
          x: opening.x,
          y: row.y,
          width: opening.width,
          height: pathHeight,
          type: opening.type,
          baseReward: opening.baseReward,
          routeIndex,
          gateIndex: rowIndex
        });
      });
    });

    const finalOpenings = rows[rows.length - 1].openings;
    this.setExits(finalOpenings.map((opening) => ({
      x: opening.x,
      width: opening.width
    })));

    const coinPath = paths.reduce((widest, path) => (
      !widest || path.width > widest.width ? path : widest
    ), null);
    return { obstacles, paths, gates: rows, coinPath, initialTravel };
  }

  fitDriftDirection(startCenter, width, step, count, direction) {
    const bounds = this.centerBounds(width);
    const fits = (candidate) => {
      const end = startCenter + candidate * step * (count - 1);
      return end >= bounds.min && end <= bounds.max;
    };
    if (fits(direction)) return direction;
    if (fits(-direction)) return -direction;
    return direction;
  }

  addSegment(y, type = null, requestedPattern = null) {
    const lastType = this.segments.length > 0
      ? this.segments[this.segments.length - 1].type
      : 'EMPTY';
    let segmentType = this.pickSegmentType(type);
    let pattern = requestedPattern || (
      type
        ? 'STRAIGHT'
        : this.director.choosePattern({ runTime: this.runTime, segmentType, lastType })
    );

    // С seed id тоже повторяемый (он же — зерно для картинки препятствий).
    const segmentId = this.seed == null ? Date.now() + this.random() : Math.floor(this.random() * 1e9);
    const segment = {
      id: segmentId,
      y,
      type: segmentType,
      isPassed: false,
      chosenPathType: null,
      isChoiceSegment: this.isChoiceType(segmentType),
      pattern,
      paths: [],
      obstacles: [],
      coins: [],
      gates: [],
      sway: null, // качающееся кашпо ряда (препятствие со свойством sway) или null
      movers: null, // створки и тележка (препятствия со свойствами door / cart), которых двигает placeMover, или null
      golden: false, // ряд серии «золотого часа» (узкий проход и монета)
      coinPath: null,
      initialTravel: null,
      visualObstacleType: chooseVisualObstacleType(
        segmentId,
        this.segments.length > 0
          ? this.segments[this.segments.length - 1].visualObstacleType
          : null
      ),
      visualObstacleSeed: Math.abs(Math.round(visualUnit(segmentId * 3.17) * 1e6)) + 1,
      visualObstacleScale: chooseVisualObstacleScale(segmentId)
    };
    segment.visualObstacleId = chooseVisualObstacleId(
      segment.visualObstacleType,
      segment.visualObstacleSeed
    );

    let geometry = this.createGeometryForType(segmentType, y, pattern);
    if (!geometry && pattern !== 'STRAIGHT') {
      pattern = 'STRAIGHT';
      segment.pattern = pattern;
      geometry = this.createGeometryForType(segmentType, y, pattern);
    }
    if (!geometry && segmentType === 'DUAL_RISK') {
      segmentType = 'TWO_PATHS';
      segment.type = 'TWO_PATHS';
      segment.isChoiceSegment = true;
      segment.pattern = 'STRAIGHT';
      geometry = this.createGeometryForType('TWO_PATHS', y, 'STRAIGHT');
    }
    if (!geometry && segmentType !== 'NORMAL' && segmentType !== 'EMPTY') {
      segmentType = 'NORMAL';
      segment.type = 'NORMAL';
      segment.isChoiceSegment = false;
      segment.pattern = 'STRAIGHT';
      geometry = this.createGeometryForType('NORMAL', y, 'STRAIGHT');
    }

    if (!geometry) {
      geometry = { obstacles: [], paths: [] };
    }

    segment.obstacles = geometry.obstacles;
    segment.paths = geometry.paths;
    segment.gates = geometry.gates || [];
    segment.sway = geometry.sway || null;
    segment.movers = geometry.movers || null;
    segment.golden = !!geometry.golden;
    segment.coinPath = geometry.coinPath || segment.paths[0] || null;
    segment.initialTravel = geometry.initialTravel ?? null;
    segment.coins = [];
    this.segments.push(segment);
    if (segment.golden) this.placeGoldenCoins(segment);
    else this.maybePlaceCoin(segment);
    this.maybePlaceYarn(segment);
    this.director.observe(segment, this.runTime);

    if (segment.type === 'NORMAL') {
      this.generatedPlayable += 1;
      this.breathingSinceChoice += 1;
    } else if (this.isChoiceType(segment.type)) {
      this.generatedPlayable += 1;
      this.choiceCount += 1;
      this.breathingSinceChoice = 0;
    }
  }

  createGeometryForType(type, segmentY, pattern = 'STRAIGHT') {
    switch (type) {
      case 'EMPTY':
        return { obstacles: [], paths: [] };
      case 'NORMAL':
        return this.createNormal(segmentY, pattern);
      case 'TWO_PATHS':
        return this.createTwoPaths(segmentY, pattern);
      case 'DUAL_RISK':
        return this.createDualRisk(segmentY, pattern);
      case 'RISKY':
      case 'SHORT_RISKY':
        return this.createNormal(segmentY);
      default:
        return this.createNormal(segmentY);
    }
  }

  // Строже canReach: до промежутка `to` можно доехать из ЛЮБОЙ точки промежутка `from`, а не только
  // из ближайшей к нему. Нужно там, где игрок не знает заранее, в какую сторону придётся ехать.
  // lateral — на сколько px кот успевает сдвинуться (по умолчанию как у обычных рядов, с запасом).
  canReachFromAnywhere(from, to, travelY, lateral = this.maxLateral(travelY)) {
    const half = CONFIG.PLAYER_WIDTH / 2;
    const fromMin = from.x + half;
    const fromMax = from.x + from.width - half;
    const toMin = to.x + half;
    const toMax = to.x + to.width - half;
    if (fromMax < fromMin || toMax < toMin) return false;
    // Самая дальняя точка `from` от `to` — один из его концов.
    const farthest = Math.max(toMin - fromMin, fromMax - toMax, 0);
    return farthest <= lateral;
  }

  // Место левого края прохода ряда с качающимся кашпо: стены у краёв по правилу краёв, и из ЛЮБОЙ
  // точки каждого выхода прошлого ряда можно доехать до безопасной части обоих «карманов» (по pocket
  // px у каждой стены прохода, минус WINDOW_SLACK у кашпо): какой бы из них ни оказался открытым,
  // к нему можно успеть, где бы кот ни был, даже если он начнёт ехать только через REACTION секунд.
  // Ближайшее к preferredCenter место.
  findSwayX(gapWidth, pocket, preferredCenter, travelY) {
    const cfg = CONFIG.SWAY;
    const minX = CONFIG.TRACK_LEFT;
    const maxX = CONFIG.TRACK_RIGHT - gapWidth;
    if (maxX < minX) return null;
    const start = Math.max(minX, Math.min(maxX, preferredCenter - gapWidth / 2));
    const safe = pocket - cfg.WINDOW_SLACK;
    const lateral = getPlayerSpeed(this.speed) * Math.max(0, travelY / Math.max(this.speed, 1) - cfg.REACTION);
    let bestX = null;
    let bestScore = Infinity;
    for (let x = minX; x <= maxX; x += 4) {
      if (!this.edgeWallsOk(x, gapWidth)) continue;
      const left = { x, width: safe };
      const right = { x: x + gapWidth - safe, width: safe };
      const reachable = this.lastExits.every((exit) => (
        this.canReachFromAnywhere(exit, left, travelY, lateral) && this.canReachFromAnywhere(exit, right, travelY, lateral)
      ));
      if (!reachable) continue;
      const score = Math.abs(x - start);
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    return bestX;
  }

  // Ряд с качающимся кашпо (CONFIG.SWAY): стены и проход шириной «кашпо + 2 кармана», в проходе
  // кашпо ходит от стены до стены (положение задаёт placeSway по времени забега). Проход один,
  // поэтому награда и «чуть не задел» работают как у обычного ряда. Выходов после ряда два (оба
  // кармана): следующий ряд должен быть достижим из каждого.
  createSway(segmentY) {
    const cfg = CONFIG.SWAY;
    const gateHeight = CONFIG.PATTERN_GATE_HEIGHT;
    const pocket = cfg.POCKET;
    const gapWidth = cfg.PLANTER_WIDTH + pocket * 2;
    const gapY = segmentY + 300;
    const initialTravel = this.getFreeTravelTo(gapY, gateHeight);
    const preferred = this.lastGapX + (this.random() - 0.5) * 80;
    const gapX = this.findSwayX(gapWidth, pocket, preferred, initialTravel);
    if (gapX === null) return null;

    const obstacles = [];
    this.addWallsAroundGap(obstacles, gapX, gapWidth, gapY, gateHeight);
    const planter = {
      x: gapX,
      y: gapY,
      width: cfg.PLANTER_WIDTH,
      height: gateHeight,
      vx: 0,
      sway: { minX: gapX, range: pocket * 2, period: getSwayPeriod(this.runTime), phase: this.random() * Math.PI * 2 }
    };
    obstacles.push(planter);
    this.placeSway(planter);
    const paths = [{ x: gapX, y: gapY, width: gapWidth, height: gateHeight, type: 'SAFE' }];
    this.setExits([
      { x: gapX, width: pocket },
      { x: gapX + gapWidth - pocket, width: pocket }
    ]);
    return { obstacles, paths, sway: planter, initialTravel };
  }

  // ---- створки (CONFIG.DOORS)

  // Стена с двумя проходами, в каждом створка (калитка). Открыта ровно одна, они меняются каждые HALF_PERIOD секунд,
  // а когда ряд ближе LOCK_DISTANCE px до кота, выбор замирает (placeDoor). null — на этой скорости кот не успел бы
  // перебежать между створками после «замка» или нет места: тогда вместо ряда обычный (addSegment).
  createDoors(segmentY) {
    const cfg = CONFIG.DOORS;
    const height = CONFIG.PATTERN_GATE_HEIGHT;
    const gapY = segmentY + 300;
    const speed = Math.max(this.speed, 1);
    const playerSpeed = getPlayerSpeed(speed);
    // Кот видит, какая створка открыта, только за LOCK_DISTANCE px до ряда: от замка до ряда он должен успеть
    // перебежать от стенки между проходами к любому из них, и даже с одного прохода на другой.
    const afterLock = playerSpeed * Math.max(0, cfg.LOCK_DISTANCE / speed - cfg.REACTION);
    if (afterLock < cfg.DOORWAY + cfg.MIDDLE + cfg.SLACK) return null;

    const initialTravel = this.getFreeTravelTo(gapY, height);
    // Какой из проходов окажется открытым, заранее не известно: из ЛЮБОЙ точки каждого выхода прошлого ряда
    // нужно успеть в оба (даже если кот начнёт ехать только через REACTION секунд).
    const lateral = playerSpeed * Math.max(0, initialTravel / speed - cfg.REACTION);
    const total = cfg.DOORWAY * 2 + cfg.MIDDLE;
    const preferred = this.lastGapX + (this.random() - 0.5) * 80;
    const wallOk = (width) => width <= CONFIG.EDGE_WALL_HIDDEN + 0.01 || width >= CONFIG.EDGE_WALL_MIN - 0.01;
    let bestX = null;
    let bestScore = Infinity;
    for (let x = CONFIG.TRACK_LEFT; x <= CONFIG.TRACK_RIGHT - total; x += 4) {
      if (!wallOk(x - CONFIG.TRACK_LEFT) || !wallOk(CONFIG.TRACK_RIGHT - (x + total))) continue;
      const left = { x, width: cfg.DOORWAY };
      const right = { x: x + cfg.DOORWAY + cfg.MIDDLE, width: cfg.DOORWAY };
      const reachable = this.lastExits.every((exit) => (
        this.canReachFromAnywhere(exit, left, initialTravel, lateral) && this.canReachFromAnywhere(exit, right, initialTravel, lateral)
      ));
      if (!reachable) continue;
      const score = Math.abs(x + total / 2 - preferred);
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    if (bestX === null) return null;

    const openings = [
      { x: bestX, width: cfg.DOORWAY },
      { x: bestX + cfg.DOORWAY + cfg.MIDDLE, width: cfg.DOORWAY }
    ];
    const obstacles = [];
    this.addWallsAroundOpenings(obstacles, openings, gapY, height);
    const state = { open: 0, locked: false, phase: this.random() * cfg.HALF_PERIOD * 2 };
    const doors = openings.map((opening, index) => ({
      x: opening.x,
      y: gapY,
      width: opening.width,
      height,
      vx: 0,
      open: false,
      rise: 1,
      sway: { range: 0, period: 1 }, // подвижное препятствие: рисуется отдельно от стен (GardenArt)
      door: { index, state }
    }));
    doors.forEach((door) => this.placeDoor(door, 0));
    obstacles.push(...doors);
    const paths = openings.map((opening) => ({ x: opening.x, y: gapY, width: opening.width, height, type: 'SAFE' }));
    this.setExits(openings.map((opening) => ({ x: opening.x, width: opening.width })));
    return { obstacles, paths, movers: doors, initialTravel };
  }

  // Створка: какая открыта, считается по времени забега, пока ряд дальше LOCK_DISTANCE от кота; потом замок.
  // Открытая створка не задевает кота (checkCollision, checkGraze пропускают её); rise (0…1) — как высоко она
  // поднята на картинке, плавно догоняет цель (deltaTime 0 — сразу).
  placeDoor(door, deltaTime) {
    const cfg = CONFIG.DOORS;
    const state = door.door.state;
    if (!state.locked) {
      const lockLine = CONFIG.PLAYER_START_Y - CONFIG.PLAYER_HEIGHT / 2 - cfg.LOCK_DISTANCE;
      if (door.y + door.height >= lockLine) state.locked = true;
      else state.open = Math.floor((this.swayClock + state.phase) / cfg.HALF_PERIOD) % 2;
    }
    door.open = door.door.index === state.open;
    const target = door.open ? 0 : 1;
    door.rise = deltaTime > 0 ? door.rise + (target - door.rise) * Math.min(1, deltaTime * cfg.RISE_SPEED) : target;
  }

  // ---- тележка (CONFIG.CART)

  // Широкий проход со стенами по краям, в нём едет тележка-кашпо. В ряду у кота она стоит так, что слева и справа
  // от неё свободно не меньше MIN_FREE px, а с каждым px пути до кота смещается на SWEEP px в одну сторону
  // (placeCart), поэтому её путь не зависит от скорости. Проход ставится там, где из ЛЮБОЙ точки каждого выхода
  // прошлого ряда успеть хотя бы в один из двух свободных промежутков; выходы после ряда — оба промежутка.
  createCart(segmentY) {
    const cfg = CONFIG.CART;
    const height = CONFIG.PATTERN_GATE_HEIGHT;
    const gapY = segmentY + 300;
    const room = cfg.GAP - cfg.WIDTH;
    if (room < cfg.MIN_FREE * 2) return null;
    const initialTravel = this.getFreeTravelTo(gapY, height);
    const speed = Math.max(this.speed, 1);
    const lateral = getPlayerSpeed(speed) * Math.max(0, initialTravel / speed - cfg.REACTION);
    const offset = cfg.MIN_FREE + this.random() * (room - 2 * cfg.MIN_FREE);
    const dir = this.random() < 0.5 ? -1 : 1;
    const preferred = this.lastGapX + (this.random() - 0.5) * 80;
    const half = CONFIG.PLAYER_WIDTH / 2;
    // Где кот может стоять: не ближе края, чем позволяет бордюр (у самого края дорожки он не встанет).
    const bounds = playableXBounds(CONFIG.PLAYER_START_Y - CONFIG.VISUAL.CAMERA_LEAD, CONFIG.PLAYER_WIDTH);
    // Пока ряд пересекает кота, тележка сдвигается ещё на SWEEP × (ряд + кот) / 2 px в каждую сторону от
    // положения xArr: слева и справа от неё стоять можно, только отступив от неё на этот сдвиг (плюс запас).
    const drift = (cfg.SWEEP * (height + CONFIG.PLAYER_HEIGHT)) / 2 + 4;
    let bestX = null;
    let bestScore = Infinity;
    for (let x = CONFIG.TRACK_LEFT; x <= CONFIG.TRACK_RIGHT - cfg.GAP; x += 4) {
      if (!this.edgeWallsOk(x, cfg.GAP)) continue;
      // Места для кота (центр кота) слева и справа от тележки; в каждом должно быть не меньше ROOM px.
      const stands = [
        { from: Math.max(bounds.minX, x + half), to: x + offset - half - drift },
        { from: x + offset + cfg.WIDTH + half + drift, to: Math.min(bounds.maxX, x + cfg.GAP - half) }
      ];
      if (stands.some((stand) => stand.to - stand.from < cfg.ROOM)) continue;
      const reachable = this.lastExits.every((exit) => {
        // Из каждой точки выхода (проверяем 11 точек) хотя бы в одно место, не дальше lateral px.
        for (let k = 0; k <= 10; k += 1) {
          const from = exit.x + half + ((exit.width - 2 * half) * k) / 10;
          const near = stands.some((stand) => Math.max(stand.from - from, from - stand.to, 0) <= lateral);
          if (!near) return false;
        }
        return exit.width >= 2 * half;
      });
      if (!reachable) continue;
      const score = Math.abs(x + cfg.GAP / 2 - preferred);
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    if (bestX === null) return null;

    const obstacles = [];
    this.addWallsAroundGap(obstacles, bestX, cfg.GAP, gapY, height);
    const cart = {
      x: bestX + offset,
      y: gapY,
      width: cfg.WIDTH,
      height,
      vx: 0,
      sway: { range: 0, period: 1 }, // подвижное препятствие: рисуется отдельно от стен (GardenArt)
      cart: { dir, xArr: bestX + offset, gapX: bestX, gap: cfg.GAP }
    };
    this.placeCart(cart);
    obstacles.push(cart);
    const paths = [{ x: bestX, y: gapY, width: cfg.GAP, height, type: 'SAFE' }];
    this.setExits([
      { x: bestX, width: offset },
      { x: bestX + offset + cfg.WIDTH, width: cfg.GAP - offset - cfg.WIDTH }
    ]);
    return { obstacles, paths, movers: [cart], initialTravel };
  }

  // Положение тележки по пути до кота: центр ряда на высоте кота — она стоит в xArr, раньше (дальше от кота)
  // была сдвинута против направления dir на SWEEP px за каждый px пути, но не выходит за проход.
  placeCart(cart) {
    const info = cart.cart;
    const remaining = CONFIG.PLAYER_START_Y - (cart.y + cart.height / 2);
    const x = info.xArr - info.dir * CONFIG.CART.SWEEP * remaining;
    cart.x = Math.max(info.gapX, Math.min(info.gapX + info.gap - cart.width, x));
    cart.vx = info.dir * CONFIG.CART.SWEEP * this.speed; // px/s на экране: по нему рисунок наклоняется
  }

  // Подвижные препятствия ряда (створки и тележка) на этом кадре.
  placeMover(mover, deltaTime) {
    if (mover.door) this.placeDoor(mover, deltaTime);
    else if (mover.cart) this.placeCart(mover);
  }

  // ---- золотой час (CONFIG.GOLDEN)

  // Ряд серии: как обычный, но проход уже (NARROW от обычной ширины, не уже MIN_WIDTH; если такой не достижим,
  // placeReachableGap расширяет его, как у любого ряда).
  createGolden(segmentY) {
    const cfg = CONFIG.GOLDEN;
    const height = 40;
    const gapY = segmentY + 300;
    const preferred = this.lastGapX + (this.random() - 0.5) * 80;
    const width = Math.max(cfg.MIN_WIDTH, Math.round(this.getBreathingWidth() * cfg.NARROW));
    const gap = this.placeReachableGap(width, gapY, preferred);
    const obstacles = [];
    this.addWallsAroundGap(obstacles, gap.x, gap.width, gapY, height);
    const paths = [{ x: gap.x, y: gapY, width: gap.width, height, type: 'SAFE' }];
    this.setExits([gap]);
    return { obstacles, paths, golden: true };
  }

  // Монета в проходе золотого часа: посередине, перед стеной (дорожка из монет по рядам серии). Все параметры
  // заданы, случайные числа не берутся.
  placeGoldenCoins(segment) {
    for (const ySlot of ['APPROACH', 'MID', 'AHEAD']) {
      if (this.tryPlaceCoin(segment, { zone: 'CENTER', ySlot, xJitter: 0.5, yJitter: 0.5 })) return;
    }
  }

  // Положение качающегося кашпо в этот момент забега: синусоида от левой стены прохода до правой
  // (sway.range — размах левого края кашпо). vx — его скорость (px/s), по ней рисунок наклоняется.
  placeSway(planter) {
    const sway = planter.sway;
    const omega = (Math.PI * 2) / sway.period;
    const angle = omega * this.swayClock + sway.phase;
    planter.x = sway.minX + (sway.range / 2) * (1 + Math.sin(angle));
    planter.vx = (sway.range / 2) * omega * Math.cos(angle);
  }

  createNormal(segmentY, pattern = 'STRAIGHT') {
    if (pattern === 'SWAY') {
      return this.createSway(segmentY);
    }
    if (pattern === 'DOORS') return this.createDoors(segmentY);
    if (pattern === 'CART') return this.createCart(segmentY);
    if (pattern === 'GOLDEN') return this.createGolden(segmentY);
    if (pattern !== 'STRAIGHT') {
      return this.createPatternedNormal(segmentY, pattern);
    }

    const obsHeight = 40;
    const gapY = segmentY + 300;
    const preferred = this.lastGapX + (this.random() - 0.5) * 80;
    const gap = this.placeReachableGap(this.getBreathingWidth(), gapY, preferred);
    const obstacles = [];

    this.addWallsAroundGap(obstacles, gap.x, gap.width, gapY, obsHeight);
    const paths = [{ x: gap.x, y: gapY, width: gap.width, height: obsHeight, type: 'SAFE' }];
    this.setExits([gap]);
    return { obstacles, paths };
  }

  createPatternedNormal(segmentY, pattern) {
    const gateHeight = CONFIG.PATTERN_GATE_HEIGHT;
    const baseWidth = this.getBreathingWidth();
    let rows;
    let initialTravel;

    if (pattern === 'OFFSET') {
      const offsets = [460, 300, 140];
      const firstY = segmentY + offsets[0];
      initialTravel = this.getFreeTravelTo(firstY, gateHeight);
      const firstX = this.findGapXForTravel(baseWidth, this.lastGapX, initialTravel);
      if (firstX === null) return null;
      const firstCenter = firstX + baseWidth / 2;
      const freeTravel = this.transitionTravel(
        { y: segmentY + offsets[0] },
        { y: segmentY + offsets[1] },
        gateHeight
      );
      const step = Math.min(
        this.getPatternOffsetLimit(),
        this.maxLateral(freeTravel) * 0.65
      );
      let direction = this.director.pickDriftDirection();
      direction = this.fitDriftDirection(firstCenter, baseWidth, step, offsets.length, direction);
      rows = offsets.map((offset, index) => ({
        y: segmentY + offset,
        openings: [
          this.gapFromCenter(firstCenter + direction * step * index, baseWidth, 'SAFE')
        ]
      }));
    } else if (pattern === 'FUNNEL') {
      const offsets = [460, 380, 300, 220, 140];
      const expansion = CONFIG.PATTERN_FUNNEL_EXPAND_NORMAL;
      const widths = [
        Math.min(CONFIG.TRACK_WIDTH, baseWidth + expansion),
        Math.min(CONFIG.TRACK_WIDTH, baseWidth + expansion / 2),
        baseWidth,
        Math.min(CONFIG.TRACK_WIDTH, baseWidth + expansion / 2),
        Math.min(CONFIG.TRACK_WIDTH, baseWidth + expansion)
      ];
      const firstY = segmentY + offsets[0];
      initialTravel = this.getFreeTravelTo(firstY, gateHeight);
      const firstX = this.findGapXForTravel(widths[0], this.lastGapX, initialTravel, widths);
      if (firstX === null) return null;
      const center = firstX + widths[0] / 2;
      rows = offsets.map((offset, index) => ({
        y: segmentY + offset,
        openings: [this.gapFromCenter(center, widths[index], 'SAFE')]
      }));
    } else if (pattern === 'OFFSET_GATE') {
      const offsets = [380, 340, 300];
      const firstY = segmentY + offsets[0];
      initialTravel = this.getFreeTravelTo(firstY, gateHeight);
      const firstX = this.findGapXForTravel(baseWidth, this.lastGapX, initialTravel);
      if (firstX === null) return null;
      const firstCenter = firstX + baseWidth / 2;
      const step = CONFIG.PATTERN_OFFSET_GATE_SHIFT / (offsets.length - 1);
      let direction = this.director.pickDriftDirection();
      direction = this.fitDriftDirection(firstCenter, baseWidth, step, offsets.length, direction);
      rows = offsets.map((offset, index) => ({
        y: segmentY + offset,
        openings: [
          this.gapFromCenter(firstCenter + direction * step * index, baseWidth, 'SAFE')
        ]
      }));
    } else if (pattern === 'DOUBLE_GATE') {
      const offsets = [420, 200];
      const firstY = segmentY + offsets[0];
      initialTravel = this.getFreeTravelTo(firstY, gateHeight);
      const firstX = this.findGapXForTravel(baseWidth, this.lastGapX, initialTravel);
      if (firstX === null) return null;
      const firstCenter = firstX + baseWidth / 2;
      const freeTravel = this.transitionTravel(
        { y: segmentY + offsets[0] },
        { y: segmentY + offsets[1] },
        gateHeight
      );
      const step = Math.min(
        this.getPatternOffsetLimit() * 1.35,
        this.maxLateral(freeTravel) * 0.65
      );
      let direction = this.director.pickDriftDirection();
      direction = this.fitDriftDirection(firstCenter, baseWidth, step, offsets.length, direction);
      rows = offsets.map((offset, index) => ({
        y: segmentY + offset,
        openings: [
          this.gapFromCenter(firstCenter + direction * step * index, baseWidth, 'SAFE')
        ]
      }));
    } else {
      return null;
    }

    return this.compileGateRows(segmentY, rows, initialTravel, gateHeight);
  }

  rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width
      && a.x + a.width > b.x
      && a.y < b.y + b.height
      && a.y + a.height > b.y
    );
  }

  canReachCollectible(from, coin, travelY) {
    const half = CONFIG.PLAYER_WIDTH / 2;
    const collectBand = { x: coin.x - half, width: coin.width + CONFIG.PLAYER_WIDTH };
    return this.canReach(from, collectBand, travelY);
  }

  pickWeighted(items, lastValue) {
    // Середина прохода реже краёв: монеты у стен рискованнее (CONFIG.COIN_CENTER_WEIGHT).
    const weights = items.map((item) => (
      (item === lastValue ? CONFIG.COIN_ZONE_REPEAT_WEIGHT : 1) * (item === 'CENTER' ? CONFIG.COIN_CENTER_WEIGHT : 1)
    ));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = this.random() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  pickCoinZone() {
    return this.pickWeighted(['LEFT', 'CENTER', 'RIGHT'], this.lastCoinZone);
  }

  pickCoinYSlot() {
    return this.pickWeighted(['AHEAD', 'MID', 'APPROACH'], this.lastCoinYSlot);
  }

  coinAvailableX(path, size) {
    const pad = CONFIG.COIN_WALL_PAD;
    const minX = Math.max(CONFIG.TRACK_LEFT + pad, path.x + pad);
    const maxX = Math.min(CONFIG.TRACK_RIGHT - pad - size, path.x + path.width - pad - size);
    if (maxX < minX) return null;
    return { minX, maxX };
  }

  skippableXBounds(path, size) {
    const center = path.x + path.width / 2;
    const half = CONFIG.PLAYER_WIDTH / 2;
    const margin = CONFIG.COIN_SKIP_MARGIN;
    return {
      maxLeftX: center - half - margin - size,
      minRightX: center + half + margin
    };
  }

  zoneXRange(zone, minX, maxX) {
    const span = maxX - minX;
    const third = span / 3;
    if (zone === 'LEFT') return { min: minX, max: minX + third };
    if (zone === 'RIGHT') return { min: maxX - third, max: maxX };
    return { min: minX + third, max: maxX - third };
  }

  coinXForZone(zone, path, size, jitter = this.random()) {
    const available = this.coinAvailableX(path, size);
    if (!available) return null;
    const { minX, maxX } = available;
    const range = this.zoneXRange(zone, minX, maxX);
    const span = Math.max(0, range.max - range.min);
    const unit = Math.max(0, Math.min(1, jitter));
    // У краёв положение внутри зоны жмётся к стене (степень EDGE_POWER): монета ближе к стене, рискованнее.
    const pushed = unit ** CONFIG.COIN_EDGE_POWER;
    let x;
    if (zone === 'LEFT') x = range.min + pushed * span;
    else if (zone === 'RIGHT') x = range.max - pushed * span;
    else x = range.min + unit * span;
    const { maxLeftX, minRightX } = this.skippableXBounds(path, size);

    if (zone === 'LEFT') {
      x = Math.min(x, maxLeftX);
    } else if (zone === 'RIGHT') {
      x = Math.max(x, minRightX);
    } else if (x + size > maxLeftX + size && x < minRightX) {
      x = jitter < 0.5 ? maxLeftX : minRightX;
    }

    x = Math.max(minX, Math.min(maxX, x));
    if (x > maxLeftX && x < minRightX) return null;
    return x;
  }

  coinYSlots(segment, path, size) {
    const pad = 24;
    const gateTop = path.y;
    const gateBottom = path.y + path.height;
    return {
      AHEAD: [segment.y + pad, Math.min(gateTop - size - 48, segment.y + 190)],
      MID: [Math.max(segment.y + 170, gateTop - size - 150), gateTop - size - 36],
      APPROACH: [gateBottom + 16, Math.min(segment.y + this.segmentHeight - size - pad, gateBottom + 140)]
    };
  }

  coinYForSlot(segment, path, size, slot, jitter = this.random()) {
    const slots = this.coinYSlots(segment, path, size);
    const range = slots[slot];
    if (!range || range[0] > range[1]) return null;
    return range[0] + Math.max(0, Math.min(1, jitter)) * (range[1] - range[0]);
  }

  centerLaneHitsCoin(path, coin) {
    const centerX = path.x + path.width / 2;
    const playerBox = {
      x: centerX - CONFIG.PLAYER_WIDTH / 2,
      y: coin.y - (CONFIG.PLAYER_HEIGHT - coin.height) / 2,
      width: CONFIG.PLAYER_WIDTH,
      height: CONFIG.PLAYER_HEIGHT
    };
    return this.rectsOverlap(playerBox, coin);
  }

  hasClearLane(path, coin) {
    const half = CONFIG.PLAYER_WIDTH / 2;
    const minCenter = path.x + half;
    const maxCenter = path.x + path.width - half;
    if (maxCenter < minCenter) return false;
    const hitMin = coin.x - half;
    const hitMax = coin.x + coin.width + half;
    const leftLane = Math.min(maxCenter, hitMin) - minCenter;
    const rightLane = maxCenter - Math.max(minCenter, hitMax);
    return leftLane >= 8 || rightLane >= 8;
  }

  isCoinValid(segment, path, coin) {
    if (coin.x < path.x || coin.x + coin.width > path.x + path.width) return false;
    if (coin.x < CONFIG.TRACK_LEFT || coin.x + coin.width > CONFIG.TRACK_RIGHT) return false;
    if (segment.obstacles.some((obs) => this.rectsOverlap(coin, obs))) return false;
    if (this.centerLaneHitsCoin(path, coin)) return false;
    if (!this.hasClearLane(path, coin)) return false;

    const travelY = Math.max(40, Math.abs(path.y - coin.y));
    const fromGap = { x: path.x, width: path.width };
    if (!this.canReachCollectible(fromGap, coin, travelY)) return false;

    const approachExits = coin.y > path.y && this.prevExits && this.prevExits.length > 0
      ? this.prevExits
      : [fromGap];
    return approachExits.every((exit) => this.canReachCollectible(exit, coin, travelY));
  }

  tryPlaceCoin(segment, options = {}) {
    if (segment.type !== 'NORMAL') return null;
    const path = segment.coinPath || segment.paths[0];
    if (!path) return null;

    const size = options.size || CONFIG.COIN_SIZE;
    const zone = options.zone || this.pickCoinZone();
    const ySlot = options.ySlot || this.pickCoinYSlot();
    const xJitter = options.xJitter ?? this.random();
    const yJitter = options.yJitter ?? this.random();

    const x = this.coinXForZone(zone, path, size, xJitter);
    const y = this.coinYForSlot(segment, path, size, ySlot, yJitter);
    if (x == null || y == null) return null;

    const coin = {
      x,
      y,
      width: size,
      height: size,
      collected: false,
      zone,
      ySlot
    };
    if (!this.isCoinValid(segment, path, coin)) return null;

    segment.coins.push(coin);
    this.lastCoinZone = zone;
    this.lastCoinYSlot = ySlot;
    return coin;
  }

  maybePlaceCoin(segment) {
    if (segment.type !== 'NORMAL') return;
    if (segment.sway || segment.movers) return; // кашпо качается по всему проходу: монету нечестно класть на его путь
    if (this.random() >= getCoinChance(this.runTime) * this.director.coinChanceScale()) return;

    const zones = ['LEFT', 'CENTER', 'RIGHT'];
    const slots = ['AHEAD', 'MID', 'APPROACH'];
    const preferredZone = this.pickCoinZone();
    const preferredSlot = this.pickCoinYSlot();
    const zoneOrder = [preferredZone, ...zones.filter((zone) => zone !== preferredZone)];
    const slotOrder = [preferredSlot, ...slots.filter((slot) => slot !== preferredSlot)];

    for (const zone of zoneOrder) {
      for (const ySlot of slotOrder) {
        const first = this.tryPlaceCoin(segment, { zone, ySlot });
        if (!first) continue;
        // Иногда вторая монета в том же ряду: у той же стены, в другом месте по глубине («дорожка» из двух).
        if (this.random() < CONFIG.COIN_PAIR_CHANCE) {
          for (const slot of slotOrder.filter((item) => item !== ySlot)) {
            const second = this.tryPlaceCoin(segment, { zone, ySlot: slot });
            if (!second) continue;
            // Две монеты не должны налезать друг на друга (зазор 6 px): иначе убираем вторую и пробуем другое место.
            const gap = 6;
            const touching = Math.abs(second.x - first.x) < first.width + gap && Math.abs(second.y - first.y) < first.height + gap;
            if (!touching) break;
            segment.coins.pop();
            this.lastCoinZone = first.zone;
            this.lastCoinYSlot = first.ySlot;
          }
        }
        return;
      }
    }
  }

  // Клубок-щит (CONFIG.SHIELD): редкий предмет в обычном ряду. Подходит та же проверка, что и для монеты
  // (достижим, не на пути качающегося кашпо, не мешает монетам), поэтому клубок кладётся через tryPlaceCoin,
  // а потом переезжает из монет в pickups. Случайные числа НЕ берутся из потока трассы (this.random) и из
  // Math.random: они считаются хешем номера ряда, как картинки препятствий. Поэтому сама трасса не сдвигается
  // ни с клубками, ни без них, а с одним seed клубки стоят на тех же местах (забег дня одинаков у всех).
  maybePlaceYarn(segment) {
    const cfg = CONFIG.SHIELD;
    if (segment.type !== 'NORMAL' || segment.sway || segment.movers) return null;
    if (this.runTime < cfg.FIRST_AT || this.runTime - this.lastYarnTime < cfg.MIN_GAP) return null;
    const unit = (salt) => visualUnit(segment.id * 0.37 + salt * 91.7);
    if (unit(1) >= cfg.CHANCE) return null;

    const zones = ['LEFT', 'CENTER', 'RIGHT'];
    const first = Math.floor(unit(2) * zones.length);
    const saved = { zone: this.lastCoinZone, slot: this.lastCoinYSlot };
    const xJitter = unit(3);
    const yJitter = unit(4);
    for (let i = 0; i < zones.length; i += 1) {
      const zone = zones[(first + i) % zones.length];
      const coin = this.tryPlaceCoin(segment, { zone, ySlot: 'MID', xJitter, yJitter, size: cfg.SIZE });
      if (!coin) continue;
      segment.coins.pop();
      this.lastCoinZone = saved.zone;
      this.lastCoinYSlot = saved.slot;
      // Не вплотную к монетам ряда (например, к монете золотого часа): между ними не меньше 6 px.
      const crowded = segment.coins.some((other) => this.rectsOverlap(
        { x: coin.x - 6, y: coin.y - 6, width: coin.width + 12, height: coin.height + 12 },
        other
      ));
      if (crowded) continue;
      const yarn = { x: coin.x, y: coin.y, width: coin.width, height: coin.height, collected: false, kind: 'YARN' };
      if (!segment.pickups) segment.pickups = [];
      segment.pickups.push(yarn);
      this.lastYarnTime = this.runTime;
      return yarn;
    }
    return null;
  }

  choiceDefinitions(segmentType) {
    if (segmentType === 'TWO_PATHS') {
      const { safe, risk } = this.getChoiceWidths();
      const safeDef = { width: safe, type: 'SAFE', baseReward: CONFIG.REWARDS.SAFE };
      const riskDef = { width: risk, type: 'RISKY', baseReward: CONFIG.REWARDS.RISKY };
      return this.random() > 0.5 ? [riskDef, safeDef] : [safeDef, riskDef];
    }

    if (segmentType === 'DUAL_RISK') {
      const easy = {
        width: CONFIG.RISK_EASY_GAP_WIDTH,
        type: 'RISKY_EASY',
        baseReward: CONFIG.REWARDS.RISKY_EASY
      };
      const hard = {
        width: CONFIG.RISK_HARD_GAP_WIDTH,
        type: 'RISKY_HARD',
        baseReward: CONFIG.REWARDS.RISKY_HARD
      };
      return this.random() > 0.5 ? [hard, easy] : [easy, hard];
    }

    return null;
  }

  openingsAtFork(forkX, definitions) {
    const openings = [];
    let cursor = forkX;
    definitions.forEach((definition, index) => {
      openings.push({
        x: cursor,
        width: definition.width,
        type: definition.type,
        baseReward: definition.baseReward
      });
      cursor += definition.width;
      if (index < definitions.length - 1) cursor += CONFIG.TWO_PATHS_DIVIDER;
    });
    return openings;
  }

  findPatternFork(definitions, gateY, gateHeight) {
    const forkWidth = definitions.reduce((sum, definition) => sum + definition.width, 0)
      + CONFIG.TWO_PATHS_DIVIDER * (definitions.length - 1);
    if (forkWidth > CONFIG.TRACK_WIDTH) return null;

    const minFork = CONFIG.TRACK_LEFT;
    const maxFork = CONFIG.TRACK_RIGHT - forkWidth;
    const startFork = Math.max(
      minFork,
      Math.min(maxFork, this.preferredChoiceForkX(forkWidth))
    );
    const initialTravel = this.getFreeTravelTo(gateY, gateHeight);

    for (let distance = 0; distance <= CONFIG.TRACK_WIDTH; distance += 8) {
      const candidates = distance === 0
        ? [startFork]
        : [startFork + distance, startFork - distance];
      for (const forkX of candidates) {
        if (forkX < minFork || forkX > maxFork) continue;
        const openings = this.openingsAtFork(forkX, definitions);
        const reachable = openings.every((opening) => (
          this.lastExits.every((exit) => this.canReach(exit, opening, initialTravel))
        ));
        if (reachable) {
          return { forkX, forkWidth, openings, initialTravel };
        }
      }
    }

    return null;
  }

  createPatternedChoice(segmentY, segmentType, pattern) {
    const supported = segmentType === 'TWO_PATHS'
      ? ['OFFSET', 'FUNNEL', 'OFFSET_GATE']
      : ['OFFSET_GATE'];
    if (!supported.includes(pattern)) return null;

    const gateHeight = CONFIG.PATTERN_GATE_HEIGHT;
    const definitions = this.choiceDefinitions(segmentType);
    if (!definitions) return null;
    let rows;
    let initialTravel;

    if (pattern === 'FUNNEL') {
      const offsets = [460, 380, 300, 220, 140];
      const rawExpansion = (definition) => (
        definition.type === 'SAFE'
          ? CONFIG.PATTERN_FUNNEL_EXPAND_SAFE
          : CONFIG.PATTERN_FUNNEL_EXPAND_RISK
      );
      // Развилка и так занимает почти всю дорожку: расширение воронки уменьшается так, чтобы
      // у самого широкого ряда с одной стороны оставалась нормальная стена (EDGE_WALL_MIN), а
      // с другой развилка шла вплотную к краю.
      const baseWidth = definitions.reduce((sum, definition) => sum + definition.width, 0)
        + CONFIG.TWO_PATHS_DIVIDER * (definitions.length - 1);
      const spare = Math.max(0, CONFIG.TRACK_WIDTH - baseWidth - (CONFIG.EDGE_WALL_MIN + 4));
      const wanted = definitions.reduce((sum, definition) => sum + rawExpansion(definition), 0);
      const funnelScale = wanted > 0 ? Math.min(1, spare / wanted) : 0;
      const expansionFor = (definition) => rawExpansion(definition) * funnelScale;
      const maxDefinitions = definitions.map((definition) => ({
        ...definition,
        width: definition.width + expansionFor(definition)
      }));
      const start = this.findPatternFork(maxDefinitions, segmentY + offsets[0], gateHeight);
      if (!start) return null;
      initialTravel = start.initialTravel;
      const centers = start.openings.map((opening) => opening.x + opening.width / 2);
      const factors = [1, 0.5, 0, 0.5, 1];
      rows = offsets.map((offset, rowIndex) => ({
        y: segmentY + offset,
        openings: definitions.map((definition, routeIndex) => (
          this.gapFromCenter(
            centers[routeIndex],
            definition.width + expansionFor(definition) * factors[rowIndex],
            definition.type,
            definition.baseReward
          )
        ))
      }));
    } else {
      const offsets = pattern === 'OFFSET'
        ? [460, 300, 140]
        : [380, 340, 300];
      const start = this.findPatternFork(definitions, segmentY + offsets[0], gateHeight);
      if (!start) return null;
      initialTravel = start.initialTravel;

      let step;
      if (pattern === 'OFFSET') {
        const freeTravel = this.transitionTravel(
          { y: segmentY + offsets[0] },
          { y: segmentY + offsets[1] },
          gateHeight
        );
        step = Math.min(
          this.getPatternOffsetLimit(),
          this.maxLateral(freeTravel) * 0.6
        );
      } else {
        step = CONFIG.PATTERN_OFFSET_GATE_SHIFT / (offsets.length - 1);
      }
      // Узор не уводит развилку так далеко, чтобы стена у края стала узкой щепкой: развилка
      // либо идёт у самого края (дрейф в пределах скрытой под бордюром части), либо стоит
      // между двумя нормальными стенами.
      const drift = Math.max(0, this.edgeDriftCapacity(CONFIG.TRACK_WIDTH - start.forkWidth) - 2);
      step = Math.min(step, drift / (offsets.length - 1));

      let direction = this.director.pickDriftDirection();
      direction = this.fitDriftDirection(
        start.forkX + start.forkWidth / 2,
        start.forkWidth,
        step,
        offsets.length,
        direction
      );
      rows = offsets.map((offset, index) => ({
        y: segmentY + offset,
        openings: this.openingsAtFork(
          start.forkX + direction * step * index,
          definitions
        )
      }));
    }

    return this.compileGateRows(segmentY, rows, initialTravel, gateHeight);
  }

  createTwoPaths(segmentY, pattern = 'STRAIGHT') {
    if (pattern !== 'STRAIGHT') {
      return this.createPatternedChoice(segmentY, 'TWO_PATHS', pattern);
    }

    const gateH = CONFIG.CHOICE_GATE_HEIGHT;
    const showH = CONFIG.CHOICE_SHOW_HEIGHT;
    const dividerW = CONFIG.TWO_PATHS_DIVIDER;
    const { safe: safeW, risk: riskW } = this.getChoiceWidths();
    const forkW = safeW + dividerW + riskW;

    if (forkW > CONFIG.TRACK_WIDTH) return null;

    const gateY = segmentY + 200;
    const travelY = this.getFreeTravelTo(gateY, gateH);
    const minFork = CONFIG.TRACK_LEFT;
    const maxFork = CONFIG.TRACK_RIGHT - forkW;
    const preferredFork = this.preferredChoiceForkX(forkW);
    const startFork = Math.max(minFork, Math.min(maxFork, preferredFork));
    const riskyLeftFirst = this.random() > 0.5;

    const tryLayout = (riskyLeft, forkX, strictEdges = true) => {
      if (strictEdges && !this.edgeWallsOk(forkX, forkW)) return null;
      if (!strictEdges && this.edgeWallsThin(forkX, forkW)) return null;
      let safeX;
      let riskX;
      let dividerX;

      if (riskyLeft) {
        riskX = forkX;
        dividerX = riskX + riskW;
        safeX = dividerX + dividerW;
      } else {
        safeX = forkX;
        dividerX = safeX + safeW;
        riskX = dividerX + dividerW;
      }

      const safeGap = { x: safeX, width: safeW };
      const riskGap = { x: riskX, width: riskW };
      const reachable = this.lastExits.every((exit) => (
        this.canReach(exit, safeGap, travelY) && this.canReach(exit, riskGap, travelY)
      ));
      if (!reachable) return null;

      return { safeX, riskX, dividerX };
    };

    // Сначала место со стенами у краёв по правилу (edgeWallsOk). Если для такой ширины развилки
    // подходящего места нет (запас на стены между 40 и 58 px), берём любое достижимое: развилка
    // важнее, чем узкая стена у края.
    let layout = null;
    for (const strictEdges of [true, false]) {
      if (layout) break;
      for (const riskyLeft of [riskyLeftFirst, !riskyLeftFirst]) {
        for (let distance = 0; distance <= CONFIG.TRACK_WIDTH && !layout; distance += 8) {
          const candidates = distance === 0
            ? [startFork]
            : [startFork + distance, startFork - distance];
          for (const rawX of candidates) {
            if (rawX < minFork || rawX > maxFork) continue;
            const forkX = strictEdges ? this.snapToEdgeRule(rawX, forkW) : rawX;
            layout = tryLayout(riskyLeft, forkX, strictEdges);
            if (layout) break;
          }
        }
      }
    }

    if (!layout) return null;

    const obstacles = [];
    const forkLeft = Math.min(layout.safeX, layout.riskX);
    const forkRight = Math.max(layout.safeX + safeW, layout.riskX + riskW);

    if (forkLeft > CONFIG.TRACK_LEFT) {
      obstacles.push({
        x: CONFIG.TRACK_LEFT,
        y: gateY,
        width: forkLeft - CONFIG.TRACK_LEFT,
        height: gateH
      });
    }
    if (forkRight < CONFIG.TRACK_RIGHT) {
      obstacles.push({
        x: forkRight,
        y: gateY,
        width: CONFIG.TRACK_RIGHT - forkRight,
        height: gateH
      });
    }

    obstacles.push({
      x: layout.dividerX,
      y: gateY,
      width: dividerW,
      height: gateH
    });

    const corridorH = gateH + showH;
    const paths = [
      {
        x: layout.safeX,
        y: gateY,
        width: safeW,
        height: corridorH,
        type: 'SAFE'
      },
      {
        x: layout.riskX,
        y: gateY,
        width: riskW,
        height: corridorH,
        type: 'RISKY'
      }
    ];

    this.setExits([
      { x: layout.safeX, width: safeW },
      { x: layout.riskX, width: riskW }
    ]);

    return { obstacles, paths, isChoiceSegment: true };
  }

  createDualRisk(segmentY, pattern = 'STRAIGHT') {
    if (pattern !== 'STRAIGHT') {
      return this.createPatternedChoice(segmentY, 'DUAL_RISK', pattern);
    }

    const gateH = CONFIG.CHOICE_GATE_HEIGHT;
    const showH = CONFIG.CHOICE_SHOW_HEIGHT;
    const dividerW = CONFIG.TWO_PATHS_DIVIDER;
    const easyW = CONFIG.RISK_EASY_GAP_WIDTH;
    const hardW = CONFIG.RISK_HARD_GAP_WIDTH;
    const forkW = easyW + dividerW + hardW;

    if (forkW > CONFIG.TRACK_WIDTH) return null;

    const gateY = segmentY + 200;
    const travelY = this.getFreeTravelTo(gateY, gateH);
    const minFork = CONFIG.TRACK_LEFT;
    const maxFork = CONFIG.TRACK_RIGHT - forkW;
    const preferredFork = this.preferredChoiceForkX(forkW);
    const startFork = Math.max(minFork, Math.min(maxFork, preferredFork));
    const hardLeftFirst = this.random() > 0.5;

    const tryLayout = (hardLeft, forkX, strictEdges = true) => {
      if (strictEdges && !this.edgeWallsOk(forkX, forkW)) return null;
      if (!strictEdges && this.edgeWallsThin(forkX, forkW)) return null;
      let easyX;
      let hardX;
      let dividerX;

      if (hardLeft) {
        hardX = forkX;
        dividerX = hardX + hardW;
        easyX = dividerX + dividerW;
      } else {
        easyX = forkX;
        dividerX = easyX + easyW;
        hardX = dividerX + dividerW;
      }

      const easyGap = { x: easyX, width: easyW };
      const hardGap = { x: hardX, width: hardW };
      const reachable = this.lastExits.every((exit) => (
        this.canReach(exit, easyGap, travelY) && this.canReach(exit, hardGap, travelY)
      ));
      if (!reachable) return null;

      return { easyX, hardX, dividerX };
    };

    // Сначала место со стенами у краёв по правилу (edgeWallsOk). Если для такой ширины развилки
    // подходящего места нет (запас на стены между 40 и 58 px), берём любое достижимое: развилка
    // важнее, чем узкая стена у края.
    let layout = null;
    for (const strictEdges of [true, false]) {
      if (layout) break;
      for (const hardLeft of [hardLeftFirst, !hardLeftFirst]) {
        for (let distance = 0; distance <= CONFIG.TRACK_WIDTH && !layout; distance += 8) {
          const candidates = distance === 0
            ? [startFork]
            : [startFork + distance, startFork - distance];
          for (const rawX of candidates) {
            if (rawX < minFork || rawX > maxFork) continue;
            const forkX = strictEdges ? this.snapToEdgeRule(rawX, forkW) : rawX;
            layout = tryLayout(hardLeft, forkX, strictEdges);
            if (layout) break;
          }
        }
      }
    }

    if (!layout) return null;

    const obstacles = [];
    const forkLeft = Math.min(layout.easyX, layout.hardX);
    const forkRight = Math.max(layout.easyX + easyW, layout.hardX + hardW);

    if (forkLeft > CONFIG.TRACK_LEFT) {
      obstacles.push({
        x: CONFIG.TRACK_LEFT,
        y: gateY,
        width: forkLeft - CONFIG.TRACK_LEFT,
        height: gateH
      });
    }
    if (forkRight < CONFIG.TRACK_RIGHT) {
      obstacles.push({
        x: forkRight,
        y: gateY,
        width: CONFIG.TRACK_RIGHT - forkRight,
        height: gateH
      });
    }

    obstacles.push({
      x: layout.dividerX,
      y: gateY,
      width: dividerW,
      height: gateH
    });

    const corridorH = gateH + showH;
    const paths = [
      {
        x: layout.easyX,
        y: gateY,
        width: easyW,
        height: corridorH,
        type: 'RISKY_EASY',
        baseReward: CONFIG.REWARDS.RISKY_EASY
      },
      {
        x: layout.hardX,
        y: gateY,
        width: hardW,
        height: corridorH,
        type: 'RISKY_HARD',
        baseReward: CONFIG.REWARDS.RISKY_HARD
      }
    ];

    this.setExits([
      { x: layout.easyX, width: easyW },
      { x: layout.hardX, width: hardW }
    ]);

    return { obstacles, paths, isChoiceSegment: true };
  }

  update(deltaTime, currentSpeed, runTime) {
    this.speed = currentSpeed;
    if (runTime !== undefined) this.runTime = runTime;
    const moveDist = this.speed * deltaTime;
    this.swayClock += deltaTime;

    this.segments.forEach((segment) => {
      segment.y += moveDist;
      segment.obstacles.forEach((obs) => {
        obs.y += moveDist;
      });
      segment.paths.forEach((path) => {
        path.y += moveDist;
      });
      segment.coins.forEach((coin) => {
        coin.y += moveDist;
      });
      segment.pickups?.forEach((pickup) => {
        pickup.y += moveDist;
      });
      segment.gates?.forEach((gate) => {
        gate.y += moveDist;
      });
      if (segment.sway) this.placeSway(segment.sway);
      segment.movers?.forEach((mover) => this.placeMover(mover, deltaTime));
    });

    if (this.segments.length > 0 && this.segments[0].y > CONFIG.CANVAS_HEIGHT) {
      this.segments.shift();
    }

    const topSegment = this.segments[this.segments.length - 1];
    if (topSegment.y > -this.segmentHeight) {
      this.addSegmentAt(topSegment.y - this.segmentHeight);
    }
  }

  // Забег дня (setCanonicalClock): тип ряда, узор и ширина прохода зависят от времени и скорости забега,
  // а новый ряд создаётся в первом кадре после того, как верх трассы пересёк границу, то есть чуть позже
  // «идеального» момента, и на разной частоте кадров — на разное расстояние (до нескольких px). Чтобы
  // трасса дня была ОДНОЙ у всех, такой ряд считается так, будто создан ровно тогда, когда трасса прошла
  // нужный путь: n-й ряд — после firstTriggerDistance + (n − 1) × SEGMENT_HEIGHT px. Обычные забеги не
  // затронуты: решения принимаются по настоящему времени, как раньше.
  addSegmentAt(y) {
    if (!this.canonical) {
      this.addSegment(y);
      return;
    }
    this.createdByUpdate += 1;
    const real = { runTime: this.runTime, speed: this.speed };
    this.runTime = getTimeAtDistance(this.firstTriggerDistance + this.segmentHeight * (this.createdByUpdate - 1));
    this.speed = getTrackSpeed(this.runTime);
    try {
      this.addSegment(y);
    } finally {
      this.runTime = real.runTime;
      this.speed = real.speed;
    }
  }

  // Включает идеальные моменты создания рядов (см. addSegmentAt) со следующего reset().
  setCanonicalClock(enabled) {
    this.canonical = !!enabled;
  }

  sampleChosenPath(segment, player) {
    if (
      segment.isChoiceSegment
      && segment.pattern
      && segment.pattern !== 'STRAIGHT'
      && segment.chosenPathType
    ) return;

    const halfW = player.width / 2;
    const halfH = player.height / 2;
    const left = player.x - halfW;
    const right = player.x + halfW;
    const top = player.y - halfH;
    const bottom = player.y + halfH;
    const eps = 0.5;

    for (const path of segment.paths) {
      const pathBottom = path.y + path.height;
      const overlapsVertically = bottom > path.y + eps && top < pathBottom - eps;
      if (!overlapsVertically) continue;

      const fullyInside = left >= path.x - eps && right <= path.x + path.width + eps;
      if (fullyInside) {
        segment.chosenPathType = path.type;
      }
    }
  }

  hasFullyPassed(segment, player) {
    if (segment.obstacles.length === 0) return false;
    const playerBottom = player.y + player.height / 2;
    return segment.obstacles.every((obs) => obs.y > playerBottom);
  }

  // Возрождение: убрать ряды, которые перед котом ближе distance (и тот, в который
  // он врезался). Ряд считается пройденным без награды.
  clearAhead(playerY, distance) {
    let cleared = 0;
    for (const segment of this.segments) {
      if (segment.isPassed) continue;
      const near = segment.obstacles.some((obs) => (
        obs.y + obs.height > playerY - distance && obs.y < playerY + CONFIG.PLAYER_HEIGHT
      ));
      if (!near) continue;
      segment.obstacles = [];
      segment.paths = [];
      segment.sway = null;
      segment.movers = null;
      segment.isPassed = true;
      segment.clearedForRevive = true;
      cleared += 1;
    }
    return cleared;
  }

  checkPassed(player) {
    let result = { rewardType: null, isIntentional: false, isChoice: false };

    for (const segment of this.segments) {
      if (segment.isPassed || segment.type === 'EMPTY') continue;

      this.sampleChosenPath(segment, player);

      if (!this.hasFullyPassed(segment, player)) continue;

      segment.isPassed = true;
      // Щит разбил препятствия этого ряда: награды за него нет, серия и множитель не трогаются.
      if (segment.shieldBroken) continue;

      if (segment.chosenPathType) {
        if (result.rewardType === null) {
          result.rewardType = segment.chosenPathType;
          result.isChoice = !!segment.isChoiceSegment;
          result.isIntentional = segment.isChoiceSegment && isIntentionalRiskType(segment.chosenPathType);
        }
      } else if (segment.paths.length > 0) {
        console.warn('Track: путь не определён, награда не начислена. type=', segment.type);
      }
    }

    return result;
  }

  checkCollision(player) {
    for (const segment of this.segments) {
      for (const obs of segment.obstacles) {
        if (obs.open) continue; // открытая створка
        if (
          player.x - player.width / 2 < obs.x + obs.width &&
          player.x + player.width / 2 > obs.x &&
          player.y - player.height / 2 < obs.y + obs.height &&
          player.y + player.height / 2 > obs.y
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // «Чуть не задел»: стены, мимо которых кот прошёл вплотную (зазор между его хитбоксом и стеной
  // больше 0, но не больше GRAZE.PX), пока он находится в ряду. Каждая стена считается один раз
  // (ставится метка grazed). Стены у края дорожки до EDGE_WALL_HIDDEN не считаются: они под
  // бордюром и не видны. Возвращает [{ x, y, side }]: точка касания и сторона стены (+1 справа).
  checkGraze(player) {
    const found = [];
    const halfW = player.width / 2;
    const halfH = player.height / 2;
    const left = player.x - halfW;
    const right = player.x + halfW;
    const maxGap = CONFIG.GRAZE.PX;
    for (const segment of this.segments) {
      for (const obs of segment.obstacles) {
        if (obs.grazed || obs.open) continue;
        const atEdge = obs.x <= CONFIG.TRACK_LEFT + 0.5 || obs.x + obs.width >= CONFIG.TRACK_RIGHT - 0.5;
        if (atEdge && obs.width <= CONFIG.EDGE_WALL_HIDDEN + 0.01) continue;
        // Кот должен быть в ряду по высоте.
        if (!(player.y - halfH < obs.y + obs.height && player.y + halfH > obs.y)) continue;
        const gapRight = obs.x - right; // стена справа от кота
        const gapLeft = left - (obs.x + obs.width); // стена слева от кота
        const gap = Math.max(gapRight, gapLeft);
        if (gap <= 0 || gap > maxGap) continue; // касание (это столкновение) или далеко
        obs.grazed = true;
        const side = gapRight >= gapLeft ? 1 : -1;
        found.push({ x: side > 0 ? obs.x : obs.x + obs.width, y: player.y, side });
      }
    }
    return found;
  }

  collectCoins(player) {
    let collected = 0;
    const hitbox = {
      x: player.x - player.width / 2,
      y: player.y - player.height / 2,
      width: player.width,
      height: player.height
    };

    for (const segment of this.segments) {
      for (const coin of segment.coins) {
        if (coin.collected) continue;
        if (!this.rectsOverlap(hitbox, coin)) continue;
        coin.collected = true;
        collected += CONFIG.COIN_VALUE;
      }
    }

    return collected;
  }

  // Предметы (клубок-щит): список видов подобранных за этот шаг, например ['YARN'].
  collectPickups(player) {
    const found = [];
    const hitbox = {
      x: player.x - player.width / 2,
      y: player.y - player.height / 2,
      width: player.width,
      height: player.height
    };
    for (const segment of this.segments) {
      for (const pickup of segment.pickups || []) {
        if (pickup.collected || !this.rectsOverlap(hitbox, pickup)) continue;
        pickup.collected = true;
        found.push(pickup.kind);
      }
    }
    return found;
  }

  // Щит сломался: убрать препятствия от distance px перед котом до его низа (в том числе то, в которое он
  // врезался), вместе с их путями. Затронутые ряды помечаются shieldBroken: награды за них нет. Если ряд остался без
  // препятствий, он сразу считается пройденным. Возвращает убранные прямоугольники (для взрыва).
  breakAhead(player, distance) {
    const top = player.y - player.height / 2 - distance;
    const bottom = player.y + player.height / 2;
    const removed = [];
    for (const segment of this.segments) {
      if (segment.isPassed) continue;
      const keep = [];
      for (const obs of segment.obstacles) {
        if (obs.y + obs.height > top && obs.y < bottom) removed.push({ x: obs.x, y: obs.y, width: obs.width, height: obs.height });
        else keep.push(obs);
      }
      if (keep.length === segment.obstacles.length) continue;
      segment.obstacles = keep;
      // Пути (подписи «+250» и порожки) в разбитой зоне тоже убираются, иначе они висели бы над пустой дорогой.
      segment.paths = segment.paths.filter((path) => !(path.y + path.height > top && path.y < bottom));
      segment.shieldBroken = true;
      if (segment.sway && !keep.includes(segment.sway)) segment.sway = null;
      if (segment.movers) segment.movers = segment.movers.filter((mover) => keep.includes(mover));
      if (keep.length === 0) segment.isPassed = true;
    }
    return removed;
  }

  reset() {
    this.init();
  }
}
