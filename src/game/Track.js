import { CONFIG, getCoinChance, isIntentionalRiskType } from '../config.js';
import { VariationDirector } from './VariationDirector.js';

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
    this.director = new VariationDirector();
    this.init();
  }

  init() {
    this.segments = [];
    this.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    this.generatedPlayable = 0;
    this.breathingSinceChoice = 0;
    this.choiceCount = 0;
    this.runTime = 0;
    this.lastCoinZone = null;
    this.lastCoinYSlot = null;
    this.director.reset();
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight, 'EMPTY');
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight * 2, 'EMPTY');
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight * 3, 'NORMAL');
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
    if (this.choiceCount === 0 || this.generatedPlayable < 5) {
      return { safe: CONFIG.SAFE_GAP_TUTORIAL, risk: CONFIG.RISKY_GAP_TUTORIAL };
    }
    if (speedRatio < 1.25) {
      return { safe: CONFIG.SAFE_GAP_WIDTH, risk: CONFIG.RISKY_GAP_WIDTH };
    }
    return { safe: CONFIG.SAFE_GAP_LATE, risk: CONFIG.RISKY_GAP_LATE };
  }

  getBreathingWidth() {
    if (this.generatedPlayable < 4) return CONFIG.BREATHING_GAP_WIDTH;
    if (this.speed / CONFIG.GAME_SPEED < 1.25) return CONFIG.BREATHING_GAP_WIDTH;
    return Math.max(CONFIG.RISKY_GAP_LATE + 80, 160);
  }

  isChoiceType(type) {
    return type === 'TWO_PATHS' || type === 'DUAL_RISK';
  }

  pickSegmentType(requested) {
    if (requested === 'RISKY' || requested === 'SHORT_RISKY') {
      return 'NORMAL';
    }
    if (requested) return requested;

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
    target += (Math.random() - 0.5) * 28;
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
    const minX = CONFIG.TRACK_LEFT;
    const maxX = CONFIG.TRACK_RIGHT - width;
    if (maxX < minX) return null;

    let bestX = null;
    let bestScore = Infinity;
    const start = Math.max(minX, Math.min(maxX, preferredCenter - width / 2));

    for (let x = minX; x <= maxX; x += 4) {
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

  addSegment(y, type = null) {
    let segmentType = this.pickSegmentType(type);

    const segment = {
      id: Date.now() + Math.random(),
      y,
      type: segmentType,
      isPassed: false,
      chosenPathType: null,
      isChoiceSegment: this.isChoiceType(segmentType),
      paths: [],
      obstacles: [],
      coins: []
    };

    let geometry = this.createGeometryForType(segmentType, y);
    if (!geometry && segmentType === 'DUAL_RISK') {
      segmentType = 'TWO_PATHS';
      segment.type = 'TWO_PATHS';
      segment.isChoiceSegment = true;
      geometry = this.createGeometryForType('TWO_PATHS', y);
    }
    if (!geometry && segmentType !== 'NORMAL' && segmentType !== 'EMPTY') {
      segmentType = 'NORMAL';
      segment.type = 'NORMAL';
      segment.isChoiceSegment = false;
      geometry = this.createGeometryForType('NORMAL', y);
    }

    if (!geometry) {
      geometry = { obstacles: [], paths: [] };
    }

    segment.obstacles = geometry.obstacles;
    segment.paths = geometry.paths;
    segment.coins = [];
    this.segments.push(segment);
    this.maybePlaceCoin(segment);
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

  createGeometryForType(type, segmentY) {
    switch (type) {
      case 'EMPTY':
        return { obstacles: [], paths: [] };
      case 'NORMAL':
        return this.createNormal(segmentY);
      case 'TWO_PATHS':
        return this.createTwoPaths(segmentY);
      case 'DUAL_RISK':
        return this.createDualRisk(segmentY);
      case 'RISKY':
      case 'SHORT_RISKY':
        return this.createNormal(segmentY);
      default:
        return this.createNormal(segmentY);
    }
  }

  createNormal(segmentY) {
    const obsHeight = 40;
    const gapY = segmentY + 300;
    const preferred = this.lastGapX + (Math.random() - 0.5) * 80;
    const gap = this.placeReachableGap(this.getBreathingWidth(), gapY, preferred);
    const obstacles = [];

    this.addWallsAroundGap(obstacles, gap.x, gap.width, gapY, obsHeight);
    const paths = [{ x: gap.x, y: gapY, width: gap.width, height: obsHeight, type: 'SAFE' }];
    this.setExits([gap]);
    return { obstacles, paths };
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
    const weights = items.map((item) => (
      item === lastValue ? CONFIG.COIN_ZONE_REPEAT_WEIGHT : 1
    ));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
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

  coinXForZone(zone, path, size, jitter = Math.random()) {
    const available = this.coinAvailableX(path, size);
    if (!available) return null;
    const { minX, maxX } = available;
    const range = this.zoneXRange(zone, minX, maxX);
    let x = range.min + Math.max(0, Math.min(1, jitter)) * Math.max(0, range.max - range.min);
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

  coinYForSlot(segment, path, size, slot, jitter = Math.random()) {
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
    const path = segment.paths[0];
    if (!path) return null;

    const size = CONFIG.COIN_SIZE;
    const zone = options.zone || this.pickCoinZone();
    const ySlot = options.ySlot || this.pickCoinYSlot();
    const xJitter = options.xJitter ?? Math.random();
    const yJitter = options.yJitter ?? Math.random();

    const x = this.coinXForZone(zone, path, size, xJitter);
    const y = this.coinYForSlot(segment, path, size, ySlot, yJitter);
    if (x == null || y == null) return null;

    const coin = { x, y, width: size, height: size, collected: false, zone, ySlot };
    if (!this.isCoinValid(segment, path, coin)) return null;

    segment.coins.push(coin);
    this.lastCoinZone = zone;
    this.lastCoinYSlot = ySlot;
    return coin;
  }

  maybePlaceCoin(segment) {
    if (segment.type !== 'NORMAL') return;
    if (Math.random() >= getCoinChance(this.runTime) * this.director.coinChanceScale()) return;

    const zones = ['LEFT', 'CENTER', 'RIGHT'];
    const slots = ['AHEAD', 'MID', 'APPROACH'];
    const preferredZone = this.pickCoinZone();
    const preferredSlot = this.pickCoinYSlot();
    const zoneOrder = [preferredZone, ...zones.filter((zone) => zone !== preferredZone)];
    const slotOrder = [preferredSlot, ...slots.filter((slot) => slot !== preferredSlot)];

    for (const zone of zoneOrder) {
      for (const ySlot of slotOrder) {
        if (this.tryPlaceCoin(segment, { zone, ySlot })) return;
      }
    }
  }

  createTwoPaths(segmentY) {
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
    const riskyLeftFirst = Math.random() > 0.5;

    const tryLayout = (riskyLeft, forkX) => {
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

    let layout = null;
    for (const riskyLeft of [riskyLeftFirst, !riskyLeftFirst]) {
      for (let distance = 0; distance <= CONFIG.TRACK_WIDTH && !layout; distance += 8) {
        const candidates = distance === 0
          ? [startFork]
          : [startFork + distance, startFork - distance];
        for (const forkX of candidates) {
          if (forkX < minFork || forkX > maxFork) continue;
          layout = tryLayout(riskyLeft, forkX);
          if (layout) break;
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

  createDualRisk(segmentY) {
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
    const hardLeftFirst = Math.random() > 0.5;

    const tryLayout = (hardLeft, forkX) => {
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

    let layout = null;
    for (const hardLeft of [hardLeftFirst, !hardLeftFirst]) {
      for (let distance = 0; distance <= CONFIG.TRACK_WIDTH && !layout; distance += 8) {
        const candidates = distance === 0
          ? [startFork]
          : [startFork + distance, startFork - distance];
        for (const forkX of candidates) {
          if (forkX < minFork || forkX > maxFork) continue;
          layout = tryLayout(hardLeft, forkX);
          if (layout) break;
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
    });

    if (this.segments.length > 0 && this.segments[0].y > CONFIG.CANVAS_HEIGHT) {
      this.segments.shift();
    }

    const topSegment = this.segments[this.segments.length - 1];
    if (topSegment.y > -this.segmentHeight) {
      this.addSegment(topSegment.y - this.segmentHeight);
    }
  }

  sampleChosenPath(segment, player) {
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

  checkPassed(player) {
    let result = { rewardType: null, isIntentional: false, isChoice: false };

    for (const segment of this.segments) {
      if (segment.isPassed || segment.type === 'EMPTY') continue;

      this.sampleChosenPath(segment, player);

      if (!this.hasFullyPassed(segment, player)) continue;

      segment.isPassed = true;

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

  reset() {
    this.init();
  }
}
