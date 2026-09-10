import { CONFIG } from '../config.js';

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
    this.init();
  }

  init() {
    this.segments = [];
    this.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    this.generatedPlayable = 0;
    this.breathingSinceChoice = 0;
    this.choiceCount = 0;
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight, 'EMPTY');
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight * 2, 'EMPTY');
    this.addSegment(CONFIG.CANVAS_HEIGHT - this.segmentHeight * 3, 'NORMAL');
  }

  // lastGapX — центр прохода. Если проходов несколько, это среднее центров.
  setExits(exits) {
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

  pickSegmentType(requested) {
    if (requested === 'RISKY' || requested === 'SHORT_RISKY') {
      return 'NORMAL';
    }
    if (requested) return requested;

    const lastType = this.segments.length > 0
      ? this.segments[this.segments.length - 1].type
      : 'EMPTY';

    if (lastType === 'EMPTY' || lastType === 'TWO_PATHS') return 'NORMAL';

    const minBreathing = this.choiceCount === 0
      ? 3
      : (this.speed > CONFIG.GAME_SPEED * 1.3 ? 1 : 2);

    if (this.breathingSinceChoice < minBreathing) return 'NORMAL';
    return Math.random() < 0.55 ? 'TWO_PATHS' : 'NORMAL';
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

  findFarthestReachableGap(from, width, travelY, desiredX) {
    const minX = CONFIG.TRACK_LEFT;
    const maxX = CONFIG.TRACK_RIGHT - width;
    const target = Math.max(minX, Math.min(maxX, desiredX));
    const step = target >= from.x ? -4 : 4;

    for (let x = target; step < 0 ? x >= minX : x <= maxX; x += step) {
      if (this.canReach(from, { x, width }, travelY)) return x;
    }

    return from.x;
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

  addWallsInRange(obstacles, rangeX, rangeWidth, gapX, gapWidth, y, height) {
    const rangeRight = rangeX + rangeWidth;
    const gapRight = gapX + gapWidth;
    if (gapX > rangeX) {
      obstacles.push({ x: rangeX, y, width: gapX - rangeX, height });
    }
    if (gapRight < rangeRight) {
      obstacles.push({ x: gapRight, y, width: rangeRight - gapRight, height });
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
      isChoiceSegment: segmentType === 'TWO_PATHS',
      paths: [],
      obstacles: []
    };

    let geometry = this.createGeometryForType(segmentType, y);
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
    this.segments.push(segment);

    if (segment.type === 'NORMAL') {
      this.generatedPlayable += 1;
      this.breathingSinceChoice += 1;
    } else if (segment.type === 'TWO_PATHS') {
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
    const preferredFork = this.lastGapX - forkW / 2;
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

  createRisky(segmentY) {
    const obsHeight = 40;
    const gapY = segmentY + 250;
    const gap = this.placeReachableGap(CONFIG.MIN_GAP + 30, gapY, this.lastGapX);
    const obstacles = [];
    this.addWallsAroundGap(obstacles, gap.x, gap.width, gapY, obsHeight);
    const paths = [{ x: gap.x, y: gapY, width: gap.width, height: obsHeight, type: 'RISKY' }];
    this.setExits([gap]);
    return { obstacles, paths };
  }

  createShortRisky(segmentY) {
    const obsHeight = 40;
    const sGap = Math.max(CONFIG.MIN_GAP, 70);
    const yOffsets = [450, 330, 210, 90];
    const pathYs = yOffsets.map((offset) => segmentY + offset);
    const minOffset = 8;

    const firstY = pathYs[0];
    const firstPlaced = this.placeReachableGap(sGap, firstY, this.lastGapX);
    if (firstPlaced.width > sGap + 8) return null;

    const gates = [{ x: firstPlaced.x, width: sGap, y: firstY }];
    let goRight = firstPlaced.x + sGap / 2 < CONFIG.CANVAS_WIDTH / 2;
    const lockY = CONFIG.PLAYER_HEIGHT + obsHeight;

    for (let i = 1; i < pathYs.length; i++) {
      const y = pathYs[i];
      const prev = gates[i - 1];
      const travelY = Math.max(0, prev.y - y - lockY);
      const desiredX = goRight ? CONFIG.TRACK_RIGHT - sGap : CONFIG.TRACK_LEFT;
      const gapX = this.findFarthestReachableGap(prev, sGap, travelY, desiredX);
      const next = { x: gapX, width: sGap, y };

      if (!this.canReach(prev, next, travelY)) break;
      if (Math.abs(next.x - prev.x) < minOffset) break;

      gates.push(next);
      goRight = !goRight;
    }

    if (gates.length < 2) return null;

    const obstacles = [];
    const paths = gates.map((gate) => {
      this.addWallsAroundGap(obstacles, gate.x, sGap, gate.y, obsHeight);
      return {
        x: gate.x,
        y: gate.y,
        width: sGap,
        height: obsHeight,
        type: 'SHORT_RISKY'
      };
    });

    const lastGate = gates[gates.length - 1];
    this.setExits([{ x: lastGate.x, width: sGap }]);
    return { obstacles, paths };
  }

  update(deltaTime, currentSpeed) {
    this.speed = currentSpeed;
    const moveDist = this.speed * deltaTime;

    this.segments.forEach((segment) => {
      segment.y += moveDist;
      segment.obstacles.forEach((obs) => {
        obs.y += moveDist;
      });
      segment.paths.forEach((path) => {
        path.y += moveDist;
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
          result.isIntentional = segment.isChoiceSegment && segment.chosenPathType === 'RISKY';
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

  reset() {
    this.init();
  }
}
