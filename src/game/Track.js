import { CONFIG } from '../config.js';

export class Track {
  constructor() {
    this.segments = [];
    this.segmentHeight = CONFIG.SEGMENT_HEIGHT;
    this.speed = CONFIG.GAME_SPEED;
    this.lastExits = [];
    this.lastGapX = CONFIG.CANVAS_WIDTH / 2;
    this.init();
  }

  init() {
    this.segments = [];
    this.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
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
    const types = ['NORMAL', 'TWO_PATHS', 'RISKY', 'SHORT_RISKY'];

    let segmentType = type;
    if (!segmentType && this.segments.length > 0) {
      const lastType = this.segments[this.segments.length - 1].type;
      if (lastType === 'SHORT_RISKY' || lastType === 'RISKY') {
        segmentType = Math.random() > 0.5 ? 'NORMAL' : 'TWO_PATHS';
      }
    }

    segmentType = segmentType || types[Math.floor(Math.random() * types.length)];

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
      geometry = this.createGeometryForType('NORMAL', y);
    }

    if (!geometry) {
      geometry = { obstacles: [], paths: [] };
    }

    segment.obstacles = geometry.obstacles;
    segment.paths = geometry.paths;
    this.segments.push(segment);
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
        return this.createRisky(segmentY);
      case 'SHORT_RISKY':
        return this.createShortRisky(segmentY);
      default:
        return this.createNormal(segmentY);
    }
  }

  createNormal(segmentY) {
    const obsHeight = 40;
    const gapY = segmentY + 300;
    const preferred = this.lastGapX + (Math.random() - 0.5) * 80;
    const gap = this.placeReachableGap(200, gapY, preferred);
    const obstacles = [];

    this.addWallsAroundGap(obstacles, gap.x, gap.width, gapY, obsHeight);
    const paths = [{ x: gap.x, y: gapY, width: gap.width, height: obsHeight, type: 'SAFE' }];
    this.setExits([gap]);
    return { obstacles, paths };
  }

  createTwoPaths(segmentY) {
    const obsHeight = 40;
    const row1Y = segmentY + 340;
    const row2Y = segmentY + 150;
    const travelY = Math.min(this.getTravelTo(row1Y), 220);
    const innerTravel = row1Y - row2Y;

    const safeW = CONFIG.SAFE_GAP_WIDTH;
    const riskW = CONFIG.RISKY_GAP_WIDTH;
    const dividerW = CONFIG.TWO_PATHS_DIVIDER;
    const riskLaneW = riskW + CONFIG.RISK_LANE_EXTRA;
    const forkW = safeW + dividerW + riskLaneW;

    if (forkW > CONFIG.TRACK_WIDTH) return null;

    const minFork = CONFIG.TRACK_LEFT;
    const maxFork = CONFIG.TRACK_RIGHT - forkW;
    const preferredFork = this.lastGapX - forkW / 2;
    const startFork = Math.max(minFork, Math.min(maxFork, preferredFork));
    const riskyLeftFirst = Math.random() > 0.5;

    const tryLayout = (riskyLeft, forkX) => {
      let safeX;
      let riskLaneX;
      let dividerX;

      if (riskyLeft) {
        riskLaneX = forkX;
        dividerX = riskLaneX + riskLaneW;
        safeX = dividerX + dividerW;
      } else {
        safeX = forkX;
        dividerX = safeX + safeW;
        riskLaneX = dividerX + dividerW;
      }

      const maxOffset = Math.min(
        riskLaneW - riskW,
        Math.max(16, Math.floor(this.maxLateral(innerTravel)))
      );
      const offset = Math.min(40, maxOffset);

      let riskGap1X = riskLaneX;
      let riskGap2X = riskLaneX + offset;
      if (riskGap2X + riskW > riskLaneX + riskLaneW) {
        riskGap2X = riskLaneX + riskLaneW - riskW;
        riskGap1X = Math.max(riskLaneX, riskGap2X - offset);
      }

      const safeGap = { x: safeX, width: safeW };
      const risk1 = { x: riskGap1X, width: riskW };
      const risk2 = { x: riskGap2X, width: riskW };

      const reachable = this.lastExits.every((exit) => (
        this.canReach(exit, safeGap, travelY) && this.canReach(exit, risk1, travelY)
      ));
      if (!reachable) return null;
      if (!this.canReach(risk1, risk2, innerTravel)) return null;

      return { safeX, riskLaneX, dividerX, riskGap1X, riskGap2X, riskLaneW };
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

    const dividerY = row2Y;
    const dividerH = row1Y + obsHeight - row2Y;
    const obstacles = [];
    const forkLeft = Math.min(layout.safeX, layout.riskLaneX);
    const forkRight = Math.max(layout.safeX + safeW, layout.riskLaneX + layout.riskLaneW);

    if (forkLeft > CONFIG.TRACK_LEFT) {
      obstacles.push({
        x: CONFIG.TRACK_LEFT,
        y: dividerY,
        width: forkLeft - CONFIG.TRACK_LEFT,
        height: dividerH
      });
    }
    if (forkRight < CONFIG.TRACK_RIGHT) {
      obstacles.push({
        x: forkRight,
        y: dividerY,
        width: CONFIG.TRACK_RIGHT - forkRight,
        height: dividerH
      });
    }

    obstacles.push({
      x: layout.dividerX,
      y: dividerY,
      width: dividerW,
      height: dividerH
    });

    this.addWallsInRange(
      obstacles,
      layout.riskLaneX,
      layout.riskLaneW,
      layout.riskGap1X,
      riskW,
      row1Y,
      obsHeight
    );
    this.addWallsInRange(
      obstacles,
      layout.riskLaneX,
      layout.riskLaneW,
      layout.riskGap2X,
      riskW,
      row2Y,
      obsHeight
    );

    const paths = [
      {
        x: layout.safeX,
        y: dividerY,
        width: safeW,
        height: dividerH,
        type: 'SAFE'
      },
      {
        x: layout.riskGap1X,
        y: row1Y,
        width: riskW,
        height: obsHeight,
        type: 'RISKY'
      },
      {
        x: layout.riskGap2X,
        y: row2Y,
        width: riskW,
        height: obsHeight,
        type: 'RISKY'
      }
    ];

    this.setExits([
      { x: layout.safeX, width: safeW },
      { x: layout.riskGap2X, width: riskW }
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
    const ySteps = [450, 350, 250, 150];
    const pathYs = ySteps.map((y) => segmentY + y);
    
    const paths = [];
    const obstacles = [];
    let currentX = (CONFIG.TRACK_LEFT + CONFIG.TRACK_RIGHT) / 2 - sGap / 2;
    
    for (let i = 0; i < pathYs.length; i++) {
      const y = pathYs[i];
      const gapX = i % 2 === 0 ? CONFIG.TRACK_LEFT : CONFIG.TRACK_RIGHT - sGap;
      
      paths.push({ x: gapX, y, width: sGap, height: obsHeight, type: 'SHORT_RISKY' });
      this.addWallsAroundGap(obstacles, gapX, sGap, y, obsHeight);
    }

    this.setExits([{ x: paths[paths.length - 1].x, width: sGap }]);
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
    let result = { rewardType: null, isIntentional: false };

    for (const segment of this.segments) {
      if (segment.isPassed || segment.type === 'EMPTY') continue;

      this.sampleChosenPath(segment, player);

      if (!this.hasFullyPassed(segment, player)) continue;

      segment.isPassed = true;

      if (segment.chosenPathType) {
        if (result.rewardType === null) {
          result.rewardType = segment.chosenPathType;
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
