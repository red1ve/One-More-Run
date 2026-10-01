import { CONFIG, getTrackSpeed, getDualRiskChance, getCoinChance, getChoiceIntervalRange } from '../src/config.js';
import { Track } from '../src/game/Track.js';
import { Player } from '../src/game/Player.js';
import { Game } from '../src/game/Game.js';
import { StorageService } from '../src/services/StorageService.js';
import { ParticleSystem } from '../src/game/ParticleSystem.js';
import { GameFeel, feelIntensity } from '../src/game/GameFeel.js';
import { AudioService } from '../src/services/AudioService.js';
import { MouseInput } from '../src/input/MouseInput.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makePlayer(x, y = CONFIG.PLAYER_START_Y) {
  const player = new Player();
  player.x = x;
  player.y = y;
  return player;
}

function simulatePass(track, segment, x) {
  const player = makePlayer(x);
  segment.isPassed = false;
  segment.chosenPathType = null;

  for (const path of segment.paths) {
    const originalY = path.y;
    path.y = player.y - path.height / 2;
    track.sampleChosenPath(segment, player);
    path.y = originalY;
  }

  for (const obs of segment.obstacles) {
    obs.y = player.y + player.height / 2 + 10;
  }

  return track.checkPassed(player).rewardType;
}

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

check('lastGapX is gap center', () => {
  const track = new Track();
  const normal = track.segments.find((segment) => segment.type === 'NORMAL');
  assert(normal, 'NORMAL segment missing');
  const path = normal.paths[0];
  assert(Math.abs(track.lastGapX - (path.x + path.width / 2)) < 0.01, `lastGapX=${track.lastGapX} pathCenter=${path.x + path.width / 2}`);
});

check('NORMAL paths match obstacle gaps', () => {
  const track = new Track();
  const normal = track.segments.find((segment) => segment.type === 'NORMAL');
  const path = normal.paths[0];
  const obsY = normal.obstacles[0].y;
  assert(path.y === obsY, 'path.y != obstacle.y');
  assert(path.type === 'SAFE', 'NORMAL path should be SAFE');
  assert(path.width >= 200 - 1, 'NORMAL gap too narrow');
});

check('TWO_PATHS has one SAFE and one RISK corridor', () => {
  const track = new Track();
  track.speed = CONFIG.GAME_SPEED;
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];
  assert(segment.type === 'TWO_PATHS', `expected TWO_PATHS, got ${segment.type}`);
  const safe = segment.paths.filter((path) => path.type === 'SAFE');
  const risky = segment.paths.filter((path) => path.type === 'RISKY');
  assert(safe.length === 1, `expected 1 SAFE path, got ${safe.length}`);
  assert(risky.length === 1, `expected 1 RISK path, got ${risky.length}`);
  assert(safe[0].width > risky[0].width, 'SAFE should be wider than RISK');
  assert(risky[0].width >= CONFIG.RISKY_GAP_LATE && risky[0].width <= CONFIG.RISKY_GAP_TUTORIAL, `RISK width ${risky[0].width} should stay in ${CONFIG.RISKY_GAP_LATE}–${CONFIG.RISKY_GAP_TUTORIAL}`);
  assert(risky[0].width * 1.6 < safe[0].width, 'RISK must stay clearly tighter than SAFE');
  assert(segment.isChoiceSegment, 'TWO_PATHS must be a choice segment');
});

check('TWO_PATHS both routes reachable from last exits', () => {
  const track = new Track();
  const fromExits = track.lastExits.map((exit) => ({ ...exit }));
  const nextY = track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT;
  const gateY = nextY + 200;
  const travelY = track.getFreeTravelTo(gateY, CONFIG.CHOICE_GATE_HEIGHT);
  track.addSegment(nextY, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];
  if (segment.type !== 'TWO_PATHS') return;
  const safe = segment.paths.find((path) => path.type === 'SAFE');
  const risk = segment.paths.find((path) => path.type === 'RISKY');
  fromExits.forEach((exit, index) => {
    assert(track.canReach(exit, safe, travelY), `SAFE unreachable from exit ${index}`);
    assert(track.canReach(exit, risk, travelY), `RISK unreachable from exit ${index}`);
  });
});

check('checkPassed SAFE does not fallback from unknown', () => {
  const track = new Track();
  const normal = track.segments.find((segment) => segment.type === 'NORMAL');
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  const player = makePlayer(CONFIG.TRACK_LEFT + 15);
  normal.chosenPathType = null;
  normal.isPassed = false;
  for (const obs of normal.obstacles) obs.y = player.y + 100;
  const reward = track.checkPassed(player);
  console.warn = original;
  assert(reward.rewardType === null, `expected null, got ${reward.rewardType}`);
  assert(warns.length > 0, 'expected warning when path is unknown');
});

check('TWO_PATHS SAFE and RISK rewards', () => {
  const track = new Track();
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];
  assert(segment.type === 'TWO_PATHS', 'TWO_PATHS not generated');
  const safe = segment.paths.find((path) => path.type === 'SAFE');
  const risk = segment.paths.find((path) => path.type === 'RISKY');
  const safeReward = simulatePass(track, segment, safe.x + safe.width / 2);
  assert(safeReward === 'SAFE', `SAFE pass got ${safeReward}`);
  const riskReward = simulatePass(track, segment, risk.x + risk.width / 2);
  assert(riskReward === 'RISKY', `RISK pass got ${riskReward}`);
  const again = track.checkPassed(makePlayer(safe.x + safe.width / 2));
  assert(again.rewardType === null, 'reward must be granted only once');
});

function collidesWithObstacles(player, obstacles) {
  for (const obs of obstacles) {
    if (
      player.x - player.width / 2 < obs.x + obs.width &&
      player.x + player.width / 2 > obs.x &&
      player.y - player.height / 2 < obs.y + obs.height &&
      player.y + player.height / 2 > obs.y
    ) {
      return true;
    }
  }
  return false;
}

function simulateChoicePhysics(track, segment, startX, targetPath) {
  const dt = 1 / 60;
  const player = makePlayer(startX);
  const half = player.width / 2;
  const obstacles = segment.obstacles.map((obs) => ({ ...obs }));
  const target = { ...targetPath };

  const maxFrames = 60 * 20;
  for (let frame = 0; frame < maxFrames; frame++) {
    const playerBottom = player.y + player.height / 2;
    const passed = obstacles.every((obs) => obs.y > playerBottom);
    if (passed) return true;

    const targetX = target.x + target.width / 2;
    let moveDirection = 0;
    if (player.x < targetX - 1) moveDirection = 1;
    else if (player.x > targetX + 1) moveDirection = -1;

    player.setMoveDirection(moveDirection);
    player.update(dt);

    const overlapping = obstacles.some((obs) => {
      const top = player.y - player.height / 2;
      const bottom = player.y + player.height / 2;
      return bottom > obs.y && top < obs.y + obs.height;
    });
    if (overlapping) {
      const minX = target.x + half;
      const maxX = target.x + target.width - half;
      if (player.x >= minX - 0.5 && player.x <= maxX + 0.5) {
        if (player.x < minX) player.x = minX;
        if (player.x > maxX) player.x = maxX;
      }
    }

    const dist = track.speed * dt;
    obstacles.forEach((obs) => {
      obs.y += dist;
    });
    target.y += dist;

    if (collidesWithObstacles(player, obstacles)) return false;
  }

  return false;
}

function startPositionsFromExits(exits) {
  const half = CONFIG.PLAYER_WIDTH / 2;
  const left = Math.min(...exits.map((exit) => exit.x + half));
  const right = Math.max(...exits.map((exit) => exit.x + exit.width - half));
  const center = (left + right) / 2;
  return [left, center, right];
}

function addChoiceOrRetry(track) {
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  let segment = track.segments[track.segments.length - 1];
  if (segment.type !== 'TWO_PATHS') {
    track.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
    segment = track.segments[track.segments.length - 1];
  }
  return segment;
}

check('generator never emits forced RISK or SHORT_RISKY', () => {
  const track = new Track();
  for (let i = 0; i < 40; i += 1) {
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
  }
  const forbidden = track.segments.filter((segment) => (
    segment.type === 'RISKY' || segment.type === 'SHORT_RISKY'
  ));
  assert(forbidden.length === 0, `forbidden types: ${forbidden.map((segment) => segment.type).join(',')}`);
  assert(
    track.segments.every((segment) => (
      segment.type === 'EMPTY' || segment.type === 'NORMAL' || segment.type === 'TWO_PATHS'
    )),
    'generator must only use EMPTY, Breathing, or Choice'
  );
  assert(
    track.segments.every((segment) => segment.type !== 'DUAL_RISK'),
    'RISK/RISK must not appear before the time threshold'
  );
});

check('Choice physics: left/center/right can reach SAFE and RISK at base speed', () => {
  const track = new Track();
  track.speed = CONFIG.GAME_SPEED;
  const fromExits = track.lastExits.map((exit) => ({ ...exit }));
  const segment = addChoiceOrRetry(track);
  assert(segment.type === 'TWO_PATHS', 'Choice was not generated at base speed');
  const safe = segment.paths.find((path) => path.type === 'SAFE');
  const risk = segment.paths.find((path) => path.type === 'RISKY');
  const starts = startPositionsFromExits(fromExits);

  starts.forEach((startX, index) => {
    assert(
      simulateChoicePhysics(track, segment, startX, safe),
      `SAFE unreachable physically from start ${index} (x=${startX})`
    );
    assert(
      simulateChoicePhysics(track, segment, startX, risk),
      `RISK unreachable physically from start ${index} (x=${startX})`
    );
  });
});

check('Choice physics: left/center/right can reach SAFE and RISK at high speed', () => {
  const track = new Track();
  track.speed = 1400;
  track.setExits([{ x: CONFIG.TRACK_LEFT, width: 80 }]);
  const fromExits = track.lastExits.map((exit) => ({ ...exit }));
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];

  if (segment.type !== 'TWO_PATHS') {
    assert(segment.type === 'NORMAL', `high speed fallback should be Breathing, got ${segment.type}`);
    return;
  }

  const safe = segment.paths.find((path) => path.type === 'SAFE');
  const risk = segment.paths.find((path) => path.type === 'RISKY');
  const starts = startPositionsFromExits(fromExits);
  starts.forEach((startX, index) => {
    assert(
      simulateChoicePhysics(track, segment, startX, safe),
      `high speed SAFE unreachable from start ${index}`
    );
    assert(
      simulateChoicePhysics(track, segment, startX, risk),
      `high speed RISK unreachable from start ${index}`
    );
  });
});

check('high speed next gap stays reachable', () => {
  const track = new Track();
  track.speed = 1400;
  track.setExits([{ x: CONFIG.TRACK_LEFT, width: 80 }]);
  const top = track.segments[track.segments.length - 1];
  track.addSegment(top.y - CONFIG.SEGMENT_HEIGHT, 'NORMAL');
  const segment = track.segments[track.segments.length - 1];
  const path = segment.paths[0];
  const from = { x: CONFIG.TRACK_LEFT, width: 80 };
  const travelY = track.getTravelTo(path.y);
  assert(track.canReach(from, path, travelY), 'high-speed NORMAL is unreachable');
});

check('high speed TWO_PATHS either reachable or fallback', () => {
  const track = new Track();
  track.speed = 1600;
  track.setExits([{ x: CONFIG.TRACK_LEFT, width: 80 }]);
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];
  if (segment.type === 'TWO_PATHS') {
    const safe = segment.paths.find((path) => path.type === 'SAFE');
    const risk = segment.paths.find((path) => path.type === 'RISKY');
    assert(safe && risk, 'high-speed Choice missing a corridor');
    assert(risk.width >= CONFIG.RISKY_GAP_LATE && risk.width <= CONFIG.RISKY_GAP_TUTORIAL, `high-speed RISK width ${risk && risk.width}`);
  } else {
    assert(segment.type === 'NORMAL', `unexpected fallback ${segment.type}`);
  }
});

check('sequence TWO_PATHS then TWO_PATHS remains passable', () => {
  const track = new Track();
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const first = track.segments[track.segments.length - 1];
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const second = track.segments[track.segments.length - 1];
  assert(first.type === 'TWO_PATHS' || first.type === 'NORMAL', 'first fork failed badly');
  assert(second.type === 'TWO_PATHS' || second.type === 'NORMAL', 'second fork failed badly');
  if (first.type === 'TWO_PATHS' && second.type === 'TWO_PATHS') {
    assert(track.lastExits.length >= 1, 'missing exits after second fork');
  }
});

check('track speed starts slow and never exceeds max', () => {
  assert(Math.abs(getTrackSpeed(0) - CONFIG.TRACK_SPEED_START) < 0.01, `start ${getTrackSpeed(0)}`);
  assert(getTrackSpeed(0) < getTrackSpeed(30), 'speed should rise by 30s');
  assert(getTrackSpeed(30) < getTrackSpeed(60), 'speed should rise by 60s');
  assert(getTrackSpeed(60) < getTrackSpeed(90), 'speed should rise by 90s');
  assert(getTrackSpeed(90) < getTrackSpeed(120), 'speed should rise by 120s');
  assert(getTrackSpeed(120) < CONFIG.TRACK_SPEED_MAX, '120s should still be below the cap');
  assert(getTrackSpeed(10000) <= CONFIG.TRACK_SPEED_MAX + 0.01, 'must not exceed max');
  assert(getTrackSpeed(-5) === CONFIG.TRACK_SPEED_START, 'negative time uses start speed');
});

check('track speed curve is noticeable then gentler', () => {
  const earlyGain = getTrackSpeed(30) - getTrackSpeed(0);
  const lateGain = getTrackSpeed(120) - getTrackSpeed(90);
  assert(earlyGain > 100, `first 30s should feel faster, gained ${earlyGain}`);
  assert(lateGain < earlyGain, `late gain ${lateGain} should be smaller than early gain ${earlyGain}`);
  assert(getTrackSpeed(30) > CONFIG.TRACK_SPEED_START * 1.3, '30s should be clearly faster than the start');
});

check('Choice stays honest at progression speeds', () => {
  const speeds = [
    CONFIG.TRACK_SPEED_START,
    getTrackSpeed(30),
    getTrackSpeed(60),
    getTrackSpeed(90),
    getTrackSpeed(120),
    CONFIG.TRACK_SPEED_MAX
  ];

  speeds.forEach((speed) => {
    const track = new Track();
    track.speed = speed;
    track.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    const fromExits = track.lastExits.map((exit) => ({ ...exit }));
    const nextY = track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT;
    const travelY = track.getFreeTravelTo(nextY + 200, CONFIG.CHOICE_GATE_HEIGHT);
    track.addSegment(nextY, 'TWO_PATHS');
    const segment = track.segments[track.segments.length - 1];

    if (segment.type === 'NORMAL') return;

    assert(segment.type === 'TWO_PATHS', `unexpected type at speed ${speed}`);
    const safe = segment.paths.find((path) => path.type === 'SAFE');
    const risk = segment.paths.find((path) => path.type === 'RISKY');
    assert(safe && risk, `Choice missing a corridor at speed ${speed}`);
    assert(risk.width >= CONFIG.RISKY_GAP_LATE && risk.width <= CONFIG.RISKY_GAP_TUTORIAL, `RISK width ${risk.width} at speed ${speed}`);

    fromExits.forEach((exit) => {
      assert(track.canReach(exit, safe, travelY), `SAFE math unreachable at speed ${speed}`);
      assert(track.canReach(exit, risk, travelY), `RISK math unreachable at speed ${speed}`);
    });

    startPositionsFromExits(fromExits).forEach((startX) => {
      assert(
        simulateChoicePhysics(track, segment, startX, safe),
        `SAFE unreachable at speed ${speed} from x=${startX}`
      );
      assert(
        simulateChoicePhysics(track, segment, startX, risk),
        `RISK unreachable at speed ${speed} from x=${startX}`
      );
    });
  });
});

function makeScoreState() {
  return {
    multiplier: CONFIG.MULTIPLIER_START,
    riskStreak: 0,
    pathReward: 0,
    distanceScore: 0,
    score: 0,
    floatingRewards: [],
    player: { x: 270, y: 840 },
    applyReward: Game.prototype.applyReward
  };
}

check('first RISK starts streak at 1 and stays at 1.0x', () => {
  const game = makeScoreState();
  game.applyReward('RISKY', true, true);
  assert(game.riskStreak === 1, `streak ${game.riskStreak}`);
  assert(game.multiplier === 1, `multiplier ${game.multiplier}`);
  assert(game.pathReward === 100, `reward ${game.pathReward}`);
});

check('second consecutive RISK keeps 1.0x reward then becomes 1.5x', () => {
  const game = makeScoreState();
  game.applyReward('RISKY', true, true);
  game.applyReward('RISKY', true, true);
  assert(game.riskStreak === 2, `streak ${game.riskStreak}`);
  assert(game.multiplier === 1.5, `multiplier ${game.multiplier}`);
  assert(game.pathReward === 200, `reward ${game.pathReward}`);
});

check('consecutive RISK uses previous multiplier then steps up to 5.0x', () => {
  const game = makeScoreState();
  const expectedRewards = [100, 100, 150, 200, 250, 300, 350, 400, 450, 500, 500];
  let total = 0;
  expectedRewards.forEach((expected, index) => {
    const before = game.multiplier;
    game.applyReward('RISKY', true, true);
    const gained = game.pathReward - total;
    total = game.pathReward;
    assert(gained === expected, `RISK #${index + 1} gained ${gained}, expected ${expected} (mult before ${before})`);
  });
  assert(game.multiplier === CONFIG.MULTIPLIER_MAX, `cap ${game.multiplier}`);
  game.applyReward('RISKY', true, true);
  assert(game.multiplier === CONFIG.MULTIPLIER_MAX, 'multiplier must stay capped at 5.0');
});

check('SAFE choice resets streak and multiplier', () => {
  const game = makeScoreState();
  game.applyReward('RISKY', true, true);
  game.applyReward('RISKY', true, true);
  assert(game.riskStreak === 2 && game.multiplier === 1.5, 'setup failed');
  const rewardBefore = game.pathReward;
  game.applyReward('SAFE', false, true);
  assert(game.riskStreak === 0, `streak after SAFE ${game.riskStreak}`);
  assert(game.multiplier === 1, `multiplier after SAFE ${game.multiplier}`);
  assert(game.pathReward === rewardBefore + CONFIG.REWARDS.SAFE, 'SAFE should give only its base reward');
});

check('breathing and non-choice segments do not affect streak', () => {
  const game = makeScoreState();
  game.applyReward('RISKY', true, true);
  game.applyReward('RISKY', true, true);
  game.applyReward('SAFE', false, false);
  assert(game.riskStreak === 2, `breathing broke streak: ${game.riskStreak}`);
  assert(game.multiplier === 1.5, `breathing reset multiplier: ${game.multiplier}`);
  game.applyReward('RISKY', false, false);
  assert(game.riskStreak === 2, 'forced RISK must not count');
  assert(game.multiplier === 1.5, 'forced RISK must not change multiplier');
});

check('Game Over resets streak and multiplier', () => {
  const over = {
    state: 'PLAYING',
    isRunning: true,
    multiplier: 2.5,
    riskStreak: 5,
    distanceScore: 10,
    pathReward: 200,
    bestScore: 999,
    storage: { set() {} }
  };
  Game.prototype.gameOver.call(over);
  assert(over.riskStreak === 0, `streak after game over ${over.riskStreak}`);
  assert(over.multiplier === 1, `multiplier after game over ${over.multiplier}`);
});

check('Choice pass reports isChoice; breathing does not', () => {
  const track = new Track();
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];
  assert(segment.type === 'TWO_PATHS', 'need a Choice segment');
  const risk = segment.paths.find((path) => path.type === 'RISKY');
  const player = makePlayer(risk.x + risk.width / 2);
  for (const path of segment.paths) {
    const originalY = path.y;
    path.y = player.y - path.height / 2;
    track.sampleChosenPath(segment, player);
    path.y = originalY;
  }
  for (const obs of segment.obstacles) obs.y = player.y + player.height / 2 + 10;
  segment.isPassed = false;
  const passed = track.checkPassed(player);
  assert(passed.rewardType === 'RISKY', `got ${passed.rewardType}`);
  assert(passed.isChoice === true, 'RISK on Choice must set isChoice');
  assert(passed.isIntentional === true, 'RISK on Choice must be intentional');

  const normal = track.segments.find((item) => item.type === 'NORMAL');
  const breathPlayer = makePlayer(normal.paths[0].x + normal.paths[0].width / 2);
  for (const path of normal.paths) {
    path.y = breathPlayer.y - path.height / 2;
    track.sampleChosenPath(normal, breathPlayer);
  }
  for (const obs of normal.obstacles) obs.y = breathPlayer.y + breathPlayer.height / 2 + 10;
  normal.isPassed = false;
  normal.chosenPathType = null;
  const breathing = track.checkPassed(breathPlayer);
  assert(breathing.isChoice === false, 'Breathing must not be a choice');
  assert(breathing.isIntentional === false, 'Breathing must not be intentional RISK');
});

function addDualRiskOrRetry(track) {
  track.runTime = Math.max(track.runTime, 45);
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'DUAL_RISK');
  let segment = track.segments[track.segments.length - 1];
  if (segment.type !== 'DUAL_RISK') {
    track.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'DUAL_RISK');
    segment = track.segments[track.segments.length - 1];
  }
  return segment;
}

function withRandom(values, fn) {
  const original = Math.random;
  let index = 0;
  Math.random = () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

check('RISK/RISK is not generated during the first 30 seconds', () => {
  assert(getDualRiskChance(0) === 0, 'chance at 0s should be 0');
  assert(getDualRiskChance(29.9) === 0, 'chance before 30s should be 0');

  const track = new Track();
  track.runTime = 10;
  track.breathingSinceChoice = 10;
  track.choiceCount = 4;
  const picked = withRandom([0, 0], () => track.pickSegmentType());
  assert(picked !== 'DUAL_RISK', `pickSegmentType at 10s returned ${picked}`);

  for (let i = 0; i < 50; i += 1) {
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
  }
  const dual = track.segments.filter((segment) => segment.type === 'DUAL_RISK');
  assert(dual.length === 0, `unexpected RISK/RISK before 30s: ${dual.length}`);
});

check('RISK/RISK can be generated after the time threshold', () => {
  assert(getDualRiskChance(30) === CONFIG.DUAL_RISK_CHANCE_EARLY, '30-60s should be rare');
  assert(getDualRiskChance(59) === CONFIG.DUAL_RISK_CHANCE_EARLY, 'under 60s stays rare');
  assert(getDualRiskChance(60) === CONFIG.DUAL_RISK_CHANCE_MID, '60-120s should be occasional');
  assert(getDualRiskChance(120) === CONFIG.DUAL_RISK_CHANCE_LATE, '120s+ should be regular');

  const track = new Track();
  track.runTime = 45;
  track.breathingSinceChoice = 10;
  track.choiceCount = 4;
  const picked = withRandom([0, 0], () => track.pickSegmentType());
  assert(picked === 'DUAL_RISK', `expected DUAL_RISK after unlock, got ${picked}`);

  const late = new Track();
  late.runTime = 150;
  late.breathingSinceChoice = 10;
  late.choiceCount = 4;
  const latePick = withRandom([0, 0.2], () => late.pickSegmentType());
  assert(latePick === 'DUAL_RISK', `expected DUAL_RISK at 150s, got ${latePick}`);

  const stillMostlySafeRisk = withRandom([0, 0.5], () => {
    const t = new Track();
    t.runTime = 150;
    t.breathingSinceChoice = 10;
    t.choiceCount = 4;
    return t.pickSegmentType();
  });
  assert(stillMostlySafeRisk === 'TWO_PATHS', `SAFE/RISK should remain the default Choice, got ${stillMostlySafeRisk}`);
});

check('RISK/RISK has two RISK corridors with different rewards', () => {
  const track = new Track();
  const segment = addDualRiskOrRetry(track);
  assert(segment.type === 'DUAL_RISK', `expected DUAL_RISK, got ${segment.type}`);
  assert(segment.isChoiceSegment, 'RISK/RISK must be a choice segment');
  assert(segment.paths.length === 2, `expected 2 corridors, got ${segment.paths.length}`);

  const easy = segment.paths.find((path) => path.type === 'RISKY_EASY');
  const hard = segment.paths.find((path) => path.type === 'RISKY_HARD');
  assert(easy && hard, 'both RISK corridors must be present');
  assert(segment.paths.every((path) => path.type === 'RISKY_EASY' || path.type === 'RISKY_HARD'), 'only RISK corridors allowed');
  assert(easy.baseReward === CONFIG.REWARDS.RISKY_EASY, `easy reward ${easy.baseReward}`);
  assert(hard.baseReward === CONFIG.REWARDS.RISKY_HARD, `hard reward ${hard.baseReward}`);
  assert(easy.baseReward !== hard.baseReward, 'base rewards must differ');
  assert(hard.baseReward > easy.baseReward, 'narrower RISK must pay more');
  assert(easy.width > hard.width, 'easier RISK must be wider');
  assert(easy.width === CONFIG.RISK_EASY_GAP_WIDTH, `easy width ${easy.width}`);
  assert(hard.width === CONFIG.RISK_HARD_GAP_WIDTH, `hard width ${hard.width}`);
});

check('RISK/RISK corridors are adjacent', () => {
  const track = new Track();
  const segment = addDualRiskOrRetry(track);
  const [a, b] = [...segment.paths].sort((left, right) => left.x - right.x);
  const gap = b.x - (a.x + a.width);
  assert(gap >= 0, 'corridors must not overlap');
  assert(gap <= CONFIG.TWO_PATHS_DIVIDER + 0.5, `corridors too far apart: ${gap}`);
});

check('RISK/RISK both routes reachable from last exits', () => {
  const track = new Track();
  const fromExits = track.lastExits.map((exit) => ({ ...exit }));
  const nextY = track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT;
  const gateY = nextY + 200;
  const travelY = track.getFreeTravelTo(gateY, CONFIG.CHOICE_GATE_HEIGHT);
  track.addSegment(nextY, 'DUAL_RISK');
  const segment = track.segments[track.segments.length - 1];
  if (segment.type !== 'DUAL_RISK') return;
  const easy = segment.paths.find((path) => path.type === 'RISKY_EASY');
  const hard = segment.paths.find((path) => path.type === 'RISKY_HARD');
  fromExits.forEach((exit, index) => {
    assert(track.canReach(exit, easy, travelY), `easy RISK unreachable from exit ${index}`);
    assert(track.canReach(exit, hard, travelY), `hard RISK unreachable from exit ${index}`);
  });
});

check('RISK/RISK physics: left/center/right can reach both corridors', () => {
  const track = new Track();
  track.speed = CONFIG.GAME_SPEED;
  const fromExits = track.lastExits.map((exit) => ({ ...exit }));
  const segment = addDualRiskOrRetry(track);
  assert(segment.type === 'DUAL_RISK', 'RISK/RISK was not generated');
  const easy = segment.paths.find((path) => path.type === 'RISKY_EASY');
  const hard = segment.paths.find((path) => path.type === 'RISKY_HARD');
  startPositionsFromExits(fromExits).forEach((startX, index) => {
    assert(
      simulateChoicePhysics(track, segment, startX, easy),
      `easy RISK unreachable physically from start ${index} (x=${startX})`
    );
    assert(
      simulateChoicePhysics(track, segment, startX, hard),
      `hard RISK unreachable physically from start ${index} (x=${startX})`
    );
  });
});

check('RISK/RISK stays honest at progression speeds or falls back', () => {
  const speeds = [
    CONFIG.TRACK_SPEED_START,
    getTrackSpeed(30),
    getTrackSpeed(60),
    getTrackSpeed(90),
    getTrackSpeed(120),
    CONFIG.TRACK_SPEED_MAX
  ];

  speeds.forEach((speed) => {
    const track = new Track();
    track.speed = speed;
    track.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    const fromExits = track.lastExits.map((exit) => ({ ...exit }));
    const nextY = track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT;
    const travelY = track.getFreeTravelTo(nextY + 200, CONFIG.CHOICE_GATE_HEIGHT);
    track.addSegment(nextY, 'DUAL_RISK');
    const segment = track.segments[track.segments.length - 1];

    if (segment.type !== 'DUAL_RISK') {
      assert(
        segment.type === 'TWO_PATHS' || segment.type === 'NORMAL',
        `unexpected RISK/RISK fallback ${segment.type} at speed ${speed}`
      );
      return;
    }

    const easy = segment.paths.find((path) => path.type === 'RISKY_EASY');
    const hard = segment.paths.find((path) => path.type === 'RISKY_HARD');
    assert(easy && hard, `RISK/RISK missing a corridor at speed ${speed}`);

    fromExits.forEach((exit) => {
      assert(track.canReach(exit, easy, travelY), `easy math unreachable at speed ${speed}`);
      assert(track.canReach(exit, hard, travelY), `hard math unreachable at speed ${speed}`);
    });

    startPositionsFromExits(fromExits).forEach((startX) => {
      assert(
        simulateChoicePhysics(track, segment, startX, easy),
        `easy unreachable at speed ${speed} from x=${startX}`
      );
      assert(
        simulateChoicePhysics(track, segment, startX, hard),
        `hard unreachable at speed ${speed} from x=${startX}`
      );
    });
  });
});

check('unreachable RISK/RISK falls back instead of spawning an impossible Choice', () => {
  const track = new Track();
  track.speed = 2000;
  track.setExits([{ x: CONFIG.TRACK_LEFT, width: 80 }]);
  const fromExits = track.lastExits.map((exit) => ({ ...exit }));
  const nextY = track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT;
  const travelY = track.getFreeTravelTo(nextY + 200, CONFIG.CHOICE_GATE_HEIGHT);
  track.addSegment(nextY, 'DUAL_RISK');
  const segment = track.segments[track.segments.length - 1];
  assert(
    segment.type === 'NORMAL' || segment.type === 'TWO_PATHS' || segment.type === 'DUAL_RISK',
    `unexpected type ${segment.type}`
  );
  if (segment.type === 'DUAL_RISK') {
    const easy = segment.paths.find((path) => path.type === 'RISKY_EASY');
    const hard = segment.paths.find((path) => path.type === 'RISKY_HARD');
    const reachable = fromExits.every((exit) => (
      track.canReach(exit, easy, travelY) && track.canReach(exit, hard, travelY)
    ));
    assert(reachable, 'spawned unreachable RISK/RISK');
  }
});

check('choosing either RISK/RISK corridor is one intentional RISK', () => {
  const track = new Track();
  const segment = addDualRiskOrRetry(track);
  const easy = segment.paths.find((path) => path.type === 'RISKY_EASY');
  const hard = segment.paths.find((path) => path.type === 'RISKY_HARD');

  const easyType = simulatePass(track, segment, easy.x + easy.width / 2);
  assert(easyType === 'RISKY_EASY', `easy pass got ${easyType}`);

  const player = makePlayer(hard.x + hard.width / 2);
  for (const path of segment.paths) {
    const originalY = path.y;
    path.y = player.y - path.height / 2;
    track.sampleChosenPath(segment, player);
    path.y = originalY;
  }
  for (const obs of segment.obstacles) obs.y = player.y + player.height / 2 + 10;
  segment.isPassed = false;
  const hardPass = track.checkPassed(player);
  assert(hardPass.rewardType === 'RISKY_HARD', `hard pass got ${hardPass.rewardType}`);
  assert(hardPass.isChoice === true, 'hard RISK must be a choice');
  assert(hardPass.isIntentional === true, 'hard RISK must be intentional');
});

check('RISK/RISK uses selected base reward and multiplier before streak growth', () => {
  const easyGame = makeScoreState();
  easyGame.multiplier = 2;
  easyGame.riskStreak = 3;
  easyGame.applyReward('RISKY_EASY', true, true);
  assert(easyGame.pathReward === 150 * 2, `easy reward ${easyGame.pathReward}`);
  assert(easyGame.riskStreak === 4, `easy streak ${easyGame.riskStreak}`);
  assert(easyGame.multiplier === 2.5, `easy multiplier ${easyGame.multiplier}`);

  const hardGame = makeScoreState();
  hardGame.multiplier = 2;
  hardGame.riskStreak = 3;
  hardGame.applyReward('RISKY_HARD', true, true);
  assert(hardGame.pathReward === 250 * 2, `hard reward ${hardGame.pathReward}`);
  assert(hardGame.riskStreak === 4, `hard streak ${hardGame.riskStreak}`);
  assert(hardGame.multiplier === 2.5, `hard multiplier ${hardGame.multiplier}`);

  const first = makeScoreState();
  first.applyReward('RISKY_HARD', true, true);
  assert(first.riskStreak === 1, `first dual-risk streak ${first.riskStreak}`);
  assert(first.multiplier === 1, `first dual-risk multiplier ${first.multiplier}`);
  assert(first.pathReward === 250, `first dual-risk reward ${first.pathReward}`);
});

check('late-game generator still never emits SHORT_RISKY or forced RISK', () => {
  const track = new Track();
  track.runTime = 180;
  for (let i = 0; i < 60; i += 1) {
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
  }
  const forbidden = track.segments.filter((segment) => (
    segment.type === 'RISKY' || segment.type === 'SHORT_RISKY'
  ));
  assert(forbidden.length === 0, `forbidden types: ${forbidden.map((segment) => segment.type).join(',')}`);
  assert(
    track.segments.every((segment) => (
      segment.type === 'EMPTY'
      || segment.type === 'NORMAL'
      || segment.type === 'TWO_PATHS'
      || segment.type === 'DUAL_RISK'
    )),
    'late generator must only use Breathing or Choice variants'
  );
});

function allCoins(track) {
  return track.segments.flatMap((segment) => segment.coins || []);
}

function mockLocalStorage() {
  const memory = {};
  globalThis.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    },
    setItem(key, value) {
      memory[key] = String(value);
    },
    removeItem(key) {
      delete memory[key];
    }
  };
  return memory;
}

function addBreathing(track) {
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'NORMAL');
  const segment = track.segments[track.segments.length - 1];
  segment.coins = [];
  return segment;
}

function addBreathingWithCoin(track, options = {}) {
  track.runTime = Math.max(track.runTime, 12);
  const segment = addBreathing(track);
  const coin = track.tryPlaceCoin(segment, {
    zone: options.zone || 'LEFT',
    ySlot: options.ySlot || 'MID',
    xJitter: options.xJitter ?? 0.5,
    yJitter: options.yJitter ?? 0.5
  });
  assert(coin, `failed to place ${options.zone || 'LEFT'} coin`);
  return segment;
}

check('Coins can appear after 10 seconds with staged frequency', () => {
  assert(getCoinChance(0) === CONFIG.COIN_CHANCE_INTRO, '0-10s should be small');
  assert(getCoinChance(9.9) === CONFIG.COIN_CHANCE_INTRO, 'under 10s stays intro');
  assert(getCoinChance(10) === CONFIG.COIN_CHANCE_EARLY, '10-30s should be regular');
  assert(getCoinChance(30) === CONFIG.COIN_CHANCE_MID, '30-60s should be moderate');
  assert(getCoinChance(60) === CONFIG.COIN_CHANCE_LATE, '60-120s should be higher');
  assert(getCoinChance(120) === CONFIG.COIN_CHANCE_MAX, '120s+ should be highest');

  const track = new Track();
  track.runTime = 12;
  const segment = addBreathingWithCoin(track);
  assert(segment.type === 'NORMAL', `expected Breathing, got ${segment.type}`);
  assert(segment.coins.length === 1, `expected 1 coin, got ${segment.coins.length}`);
});

check('Coins do not appear on Choice', () => {
  const track = new Track();
  track.runTime = 90;
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const choice = track.segments[track.segments.length - 1];
  assert(choice.type === 'TWO_PATHS' || choice.type === 'NORMAL', `unexpected ${choice.type}`);
  if (choice.type === 'TWO_PATHS') {
    assert((choice.coins || []).length === 0, 'SAFE/RISK must not spawn coins');
    assert(track.tryPlaceCoin(choice, { zone: 'LEFT' }) === null, 'tryPlaceCoin must reject Choice');
  }

  const dual = new Track();
  dual.runTime = 90;
  dual.addSegment(dual.segments[dual.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'DUAL_RISK');
  const dualSeg = dual.segments[dual.segments.length - 1];
  if (dualSeg.type === 'DUAL_RISK') {
    assert((dualSeg.coins || []).length === 0, 'RISK/RISK must not spawn coins');
  }
});

check('Coin can sit in LEFT, CENTER, or RIGHT of the gap', () => {
  const zones = ['LEFT', 'CENTER', 'RIGHT'];
  const placed = {};
  zones.forEach((zone) => {
    const track = new Track();
    const segment = addBreathingWithCoin(track, { zone, ySlot: 'MID', xJitter: 0.5 });
    const coin = segment.coins[0];
    const path = segment.paths[0];
    const center = path.x + path.width / 2;
    const coinCenter = coin.x + coin.width / 2;
    placed[zone] = { coin, path, center, coinCenter };
    assert(coin.zone === zone, `expected zone ${zone}, got ${coin.zone}`);
  });

  assert(placed.LEFT.coinCenter < placed.LEFT.center - 8, `LEFT coin too central ${placed.LEFT.coinCenter}`);
  assert(placed.RIGHT.coinCenter > placed.RIGHT.center + 8, `RIGHT coin too central ${placed.RIGHT.coinCenter}`);
  const leftDist = Math.abs(placed.CENTER.coinCenter - placed.CENTER.center);
  const leftEdgeDist = placed.CENTER.coinCenter - placed.CENTER.path.x;
  const rightEdgeDist = placed.CENTER.path.x + placed.CENTER.path.width - placed.CENTER.coinCenter;
  assert(leftEdgeDist > 20 && rightEdgeDist > 20, 'CENTER coin should not hug the wall');
  assert(leftDist < Math.abs(placed.LEFT.coinCenter - placed.LEFT.center), 'CENTER should be closer to mid than LEFT');
});

check('Coin is reachable, skippable, and outside walls', () => {
  ['LEFT', 'CENTER', 'RIGHT'].forEach((zone) => {
    ['AHEAD', 'MID', 'APPROACH'].forEach((ySlot) => {
      const track = new Track();
      const segment = addBreathingWithCoin(track, { zone, ySlot, xJitter: 0.4, yJitter: 0.5 });
      const coin = segment.coins[0];
      const path = segment.paths[0];
      assert(coin.x >= path.x && coin.x + coin.width <= path.x + path.width, `${zone}/${ySlot} outside gap`);
      assert(!segment.obstacles.some((obs) => track.rectsOverlap(coin, obs)), `${zone}/${ySlot} inside wall`);
      assert(!track.centerLaneHitsCoin(path, coin), `${zone}/${ySlot} blocks the center lane`);
      assert(track.hasClearLane(path, coin), `${zone}/${ySlot} has no skip lane`);
      const travelY = Math.max(40, Math.abs(path.y - coin.y));
      assert(track.canReachCollectible({ x: path.x, width: path.width }, coin, travelY), `${zone}/${ySlot} unreachable`);
    });
  });
});

check('Coin Y is not glued to the gate', () => {
  const track = new Track();
  const ahead = addBreathingWithCoin(track, { zone: 'LEFT', ySlot: 'AHEAD', yJitter: 0.5 }).coins[0];
  const mid = addBreathingWithCoin(track, { zone: 'RIGHT', ySlot: 'MID', yJitter: 0.5 }).coins[0];
  const approach = addBreathingWithCoin(track, { zone: 'CENTER', ySlot: 'APPROACH', yJitter: 0.5 }).coins[0];
  const ys = [ahead.y, mid.y, approach.y];
  assert(new Set(ys.map((y) => Math.round(y))).size === 3, `Y slots collapsed: ${ys.join(',')}`);
  assert(ahead.ySlot === 'AHEAD' && mid.ySlot === 'MID' && approach.ySlot === 'APPROACH', 'slots not applied');
  const gateYs = track.segments.filter((segment) => segment.type === 'NORMAL' && segment.paths[0]).map((segment) => segment.paths[0].y);
  ys.forEach((y, index) => {
    const glued = gateYs.some((gateY) => Math.abs(y - (gateY - CONFIG.COIN_SIZE - 28)) < 1);
    assert(!glued || index !== 0, 'AHEAD should not use the old after-gate offset');
  });
  assert(Math.abs(ahead.y - mid.y) > 10, 'AHEAD and MID too similar');
  assert(Math.abs(mid.y - approach.y) > 10, 'MID and APPROACH too similar');
});

check('collecting a Coin adds 1 and cannot be collected twice', () => {
  const track = new Track();
  const segment = addBreathingWithCoin(track);
  const coin = segment.coins[0];
  const player = makePlayer(coin.x + coin.width / 2, coin.y + coin.height / 2);
  const first = track.collectCoins(player);
  assert(first === 1, `first collect got ${first}`);
  assert(coin.collected === true, 'coin should be marked collected');
  const second = track.collectCoins(player);
  assert(second === 0, `repeat collect got ${second}`);
});

check('collecting a Coin does not change score, streak, or multiplier', () => {
  mockLocalStorage();
  const game = makeScoreState();
  game.coins = 4;
  game.score = 1250;
  game.distanceScore = 1250;
  game.pathReward = 0;
  game.riskStreak = 3;
  game.multiplier = 2;
  game.storage = new StorageService();
  game.storage.set('coins', 4);
  game.applyCoinPickup = Game.prototype.applyCoinPickup;
  game.applyCoinPickup(1);
  assert(game.coins === 5, `coins ${game.coins}`);
  assert(game.score === 1250, `score changed to ${game.score}`);
  assert(game.pathReward === 0, `pathReward ${game.pathReward}`);
  assert(game.riskStreak === 3, `streak ${game.riskStreak}`);
  assert(game.multiplier === 2, `multiplier ${game.multiplier}`);
});

check('Coins persist through StorageService and Game Over', () => {
  mockLocalStorage();
  const storage = new StorageService();
  assert(storage.getCoins() === 0, 'fresh coins should be 0');
  assert(storage.addCoins(1) === 1, 'addCoins should return 1');
  const restored = new StorageService();
  assert(restored.getCoins() === 1, `restored coins ${restored.getCoins()}`);
  restored.addCoins(2);
  assert(new StorageService().getCoins() === 3, 'coins should accumulate across instances');

  const over = {
    state: 'PLAYING',
    isRunning: true,
    multiplier: 2.5,
    riskStreak: 5,
    distanceScore: 10,
    pathReward: 200,
    bestScore: 999,
    coins: 17,
    storage: { set() {}, getCoins() { return 17; } }
  };
  Game.prototype.gameOver.call(over);
  assert(over.coins === 17, `coins after game over ${over.coins}`);
  assert(over.riskStreak === 0, 'streak still resets on game over');
  assert(over.multiplier === 1, 'multiplier still resets on game over');
});

check('restart keeps saved Coins and resets run score state', () => {
  mockLocalStorage();
  globalThis.requestAnimationFrame = () => 1;
  const game = {
    isRunning: false,
    state: 'GAMEOVER',
    score: 800,
    distanceScore: 800,
    pathReward: 40,
    multiplier: 3,
    riskStreak: 4,
    currentSpeed: 500,
    runTime: 40,
    floatingRewards: [{ type: 'SAFE' }],
    coins: 9,
    storage: new StorageService(),
    player: { reset() {} },
    track: { reset() {} }
  };
  game.storage.set('coins', 9);
  Game.prototype.start.call(game);
  assert(game.coins === 9, `coins after restart ${game.coins}`);
  assert(game.score === 0, 'score should reset');
  assert(game.riskStreak === 0, 'streak should reset');
  assert(game.multiplier === CONFIG.MULTIPLIER_START, 'multiplier should reset');
});

check('Coins do not introduce forbidden segment types', () => {
  const track = new Track();
  track.runTime = 200;
  withRandom([0.4, 0.4, 0.4, 0.4], () => {
    for (let i = 0; i < 30; i += 1) {
      track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
    }
  });
  assert(
    track.segments.every((segment) => (
      segment.type === 'EMPTY'
      || segment.type === 'NORMAL'
      || segment.type === 'TWO_PATHS'
      || segment.type === 'DUAL_RISK'
    )),
    'coins must not add a new segment type'
  );
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function withSeededRandom(seed, fn) {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function generateTimedRun(seed, duration, startTime = 0) {
  return withSeededRandom(seed, () => {
    const track = new Track();
    let t = startTime;
    track.runTime = t;
    track.speed = getTrackSpeed(t);
    const events = [];
    for (let i = 0; i < 90 && t < startTime + duration; i += 1) {
      track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
      const segment = track.segments[track.segments.length - 1];
      const forkX = segment.paths.length
        ? Math.min(...segment.paths.map((path) => path.x))
        : null;
      events.push({
        t,
        type: segment.type,
        coins: (segment.coins || []).length,
        forkX,
        isChoice: segment.type === 'TWO_PATHS' || segment.type === 'DUAL_RISK'
      });
      t += CONFIG.SEGMENT_HEIGHT / Math.max(track.speed, 1);
      track.runTime = t;
      track.speed = getTrackSpeed(t);
    }
    return { track, events };
  });
}

function choiceEvents(events) {
  return events.filter((event) => event.isChoice);
}

function streaks(events, predicate) {
  let best = 0;
  let current = 0;
  events.forEach((event) => {
    if (event.type === 'EMPTY') return;
    if (predicate(event)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  });
  return best;
}

check('Variation Director spaces Choices instead of a rigid loop', () => {
  const [minIntro, maxIntro] = getChoiceIntervalRange(0);
  assert(minIntro === 8 && maxIntro === 14, `intro interval ${minIntro}-${maxIntro}`);
  assert(getChoiceIntervalRange(45)[0] === 7, '30-60s interval');
  assert(getChoiceIntervalRange(90)[0] === 7, '60-120s interval');
  assert(getChoiceIntervalRange(150)[0] === 6, '120s+ interval');

  const runs = [11, 23, 47].map((seed) => generateTimedRun(seed, 70, 0));
  runs.forEach(({ events }, index) => {
    const playable = events.filter((event) => event.type !== 'EMPTY');
    for (let i = 1; i < playable.length; i += 1) {
      assert(!(playable[i - 1].isChoice && playable[i].isChoice), `adjacent Choices in seed ${index}`);
    }

    const choices = choiceEvents(events);
    assert(choices.length >= 3, `too few Choices in seed ${index}: ${choices.length}`);
    const intervals = [];
    for (let i = 1; i < choices.length; i += 1) {
      intervals.push(choices[i].t - choices[i - 1].t);
      const [minAt] = getChoiceIntervalRange(choices[i].t);
      assert(
        choices[i].t - choices[i - 1].t >= minAt * 0.4,
        `Choice too soon in seed ${index}: ${choices[i].t - choices[i - 1].t} at t=${choices[i].t}`
      );
    }
    const unique = new Set(intervals.map((dt) => Math.round(dt)));
    assert(unique.size >= 2, `Choice cadence is too regular in seed ${index}: ${intervals.join(',')}`);
  });
});

check('DUAL_RISK stays rare, never repeats, and is followed by Breathing', () => {
  const early = generateTimedRun(9, 28, 0);
  assert(early.events.every((event) => event.type !== 'DUAL_RISK'), 'DUAL_RISK before 30s');

  const lateRuns = [5, 17, 31].map((seed) => generateTimedRun(seed, 80, 50));
  let twoPaths = 0;
  let dual = 0;
  lateRuns.forEach(({ events, track }) => {
    const playable = events.filter((event) => event.type !== 'EMPTY');
    playable.forEach((event, index) => {
      if (event.type !== 'DUAL_RISK') return;
      dual += 1;
      assert(index === playable.length - 1 || playable[index + 1].type === 'NORMAL', 'DUAL_RISK must be followed by Breathing');
      const nextChoice = playable.slice(index + 1).find((item) => item.isChoice);
      assert(!nextChoice || nextChoice.type !== 'DUAL_RISK', 'DUAL_RISK must not follow DUAL_RISK');
    });
    twoPaths += playable.filter((event) => event.type === 'TWO_PATHS').length;
  });
  assert(twoPaths > dual, `SAFE/RISK should remain the main Choice (${twoPaths} vs ${dual})`);

  const blocked = new Track();
  blocked.runTime = 90;
  blocked.addSegment(blocked.segments[blocked.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'DUAL_RISK');
  assert(blocked.director.dualBlocked, 'director should block DUAL_RISK after one');
  blocked.addSegment(blocked.segments[blocked.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
  assert(blocked.segments[blocked.segments.length - 1].type === 'NORMAL', 'calm segment after DUAL_RISK');
  blocked.breathingSinceChoice = 10;
  const nextPick = withRandom([0, 0], () => blocked.pickSegmentType());
  assert(nextPick === 'TWO_PATHS', `blocked DUAL_RISK should become SAFE/RISK, got ${nextPick}`);
});

check('Variation Director avoids long Choice or Breathing-only streaks', () => {
  const runs = [3, 19, 41].map((seed) => generateTimedRun(seed, 90, 20));
  runs.forEach(({ events }, index) => {
    const choiceStreak = streaks(events, (event) => event.isChoice);
    const breathStreak = streaks(events, (event) => event.type === 'NORMAL');
    assert(choiceStreak <= 1, `Choice streak ${choiceStreak} in seed ${index}`);
    assert(breathStreak <= 10, `Breathing streak ${breathStreak} in seed ${index}`);
  });
});

check('Choice fork position can vary without breaking reachability', () => {
  // Одинаковый seed у обоих забегов: отличается только смещение развилки
  // (раньше проверка иногда падала из-за разной случайности).
  const leftTrack = new Track();
  leftTrack.setSeed(1171);
  leftTrack.init();
  leftTrack.director.forcedForkBias = 'LEFT';
  const left = addChoiceOrRetry(leftTrack);
  assert(left.type === 'TWO_PATHS', 'LEFT bias should still make a Choice');
  const leftX = Math.min(...left.paths.map((path) => path.x));

  const rightTrack = new Track();
  rightTrack.setSeed(1171);
  rightTrack.init();
  rightTrack.director.forcedForkBias = 'RIGHT';
  const right = addChoiceOrRetry(rightTrack);
  const rightX = Math.min(...right.paths.map((path) => path.x));
  assert(leftX < rightX - 8, `fork bias did not move Choice (${leftX} vs ${rightX})`);

  [leftTrack, rightTrack].forEach((track, index) => {
    const segment = track.segments[track.segments.length - 1];
    const from = [{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }];
    const travelY = CONFIG.SEGMENT_HEIGHT;
    segment.paths.forEach((path) => {
      assert(
        from.every((exit) => track.canReach(exit, path, travelY)),
        `biased Choice ${index} unreachable`
      );
    });
  });

  const forks = [8, 12, 21].map((seed) => {
    const { events } = generateTimedRun(seed, 50, 0);
    return choiceEvents(events).map((event) => event.forkX).filter((x) => x != null);
  }).flat();
  const spread = Math.max(...forks) - Math.min(...forks);
  assert(spread > 24, `Choice positions too similar, spread ${spread}`);
});

check('Coins stay on Breathing under Variation Director', () => {
  const { events } = generateTimedRun(14, 80, 40);
  events.forEach((event) => {
    if (event.isChoice) {
      assert(event.coins === 0, `${event.type} received a Coin`);
    }
  });
  const breathingCoins = events.filter((event) => event.type === 'NORMAL' && event.coins > 0);
  assert(breathingCoins.length >= 1, 'expected some Breathing coins in a long run');
});
check('particles spawn and expire without leaking', () => {
  const system = new ParticleSystem();
  const made = system.burst({ x: 100, y: 100, count: 12, color: '#fff', speed: 40, life: 0.2 });
  assert(made === 12, `spawned ${made}`);
  assert(system.particles.length === 12, 'particles missing after burst');
  system.update(0.05);
  assert(system.particles.length === 12, 'particles died too early');
  system.update(1);
  assert(system.particles.length === 0, 'particles leaked');
  system.burst({ x: 0, y: 0, count: CONFIG.FEEL.PARTICLE_MAX + 40, life: 1 });
  assert(system.particles.length <= CONFIG.FEEL.PARTICLE_MAX, 'particle cap ignored');
});

check('shake fades and HUD pulses decay', () => {
  const feel = new GameFeel();
  feel.triggerShake(6, 0.2);
  assert(feel.shake === 6 && feel.shakeTime > 0, 'shake should start');
  feel.update(0.25, 300);
  assert(feel.shakeTime <= 0, `shake still active ${feel.shakeTime}`);
  const rest = feel.shakeOffset();
  assert(rest.x === 0 && rest.y === 0, 'shake did not settle');

  feel.hudPulse.streak = 1;
  feel.hudPulse.multiplier = 1;
  feel.hudPulse.coins = 1;
  feel.update(1, 300);
  assert(feel.hudPulse.streak === 0 && feel.hudPulse.multiplier === 0 && feel.hudPulse.coins === 0, 'HUD pulse leaked');
});

check('RISK, Coin and multiplier feedback fire at the right time', () => {
  const feel = new GameFeel();
  const game = makeScoreState();
  game.feel = feel;
  game.player = { x: 200, y: 800 };
  game.applyReward('RISKY', true, true);
  assert(feel.particles.particles.length > 0, 'RISK should spawn particles');
  assert(feel.hudPulse.streak > 0, 'RISK should pulse STREAK');
  assert(feel.shakeTime > 0, 'RISK should shake once');
  const afterRisk = feel.particles.particles.length;

  game.applyReward('SAFE', false, true);
  assert(game.riskStreak === 0, 'SAFE still resets streak');

  const beforeCoin = feel.particles.particles.length;
  game.storage = { addCoins(n) { return n; } };
  game.coins = 0;
  Game.prototype.applyCoinPickup.call(game, 1);
  assert(game.coins === 1, 'coin value still +1');
  assert(feel.particles.particles.length > beforeCoin, 'coin should burst once');
  assert(feel.hudPulse.coins > 0, 'COINS HUD should pulse');

  const grow = new GameFeel();
  const g2 = makeScoreState();
  g2.feel = grow;
  g2.player = { x: 10, y: 10 };
  g2.applyReward('RISKY', true, true);
  g2.applyReward('RISKY', true, true);
  assert(g2.multiplier === 1.5, 'multiplier values unchanged');
  assert(grow.hudPulse.multiplier > 0, 'multiplier step should pulse HUD');
  assert(feelIntensity({ kind: 'risk', streak: 1, multiplier: 1 }) < feelIntensity({ kind: 'risk', streak: 5, multiplier: 5 }));
});

check('AudioService is safe before a user gesture', () => {
  const audio = new AudioService();
  assert(audio.unlocked === false, 'must start locked');
  assert(audio.play('coin') === false, 'must not play before unlock');
  audio.unlock();
});

check('R does not reset an active run', () => {
  const game = {
    state: 'PLAYING',
    score: 420,
    riskStreak: 4,
    multiplier: 2.5,
    runTime: 18,
    coins: 6,
    started: false,
    start() { this.started = true; }
  };
  assert(Game.prototype.tryLaunch.call(game) === false, 'PLAYING must ignore launch');
  assert(game.started === false, 'start must not run while PLAYING');
  assert(game.score === 420 && game.riskStreak === 4 && game.multiplier === 2.5 && game.runTime === 18);
  assert(game.coins === 6, 'coins must stay');
});

check('R / tryLaunch starts from START and GAMEOVER only', () => {
  const fromStart = {
    state: 'START',
    started: 0,
    start() { this.started += 1; this.state = 'PLAYING'; }
  };
  assert(Game.prototype.tryLaunch.call(fromStart) === true);
  assert(fromStart.started === 1);
  assert(Game.prototype.tryLaunch.call(fromStart) === false);
  assert(fromStart.started === 1, 'must not double-start');

  const fromOver = {
    state: 'GAMEOVER',
    started: 0,
    start() { this.started += 1; this.state = 'PLAYING'; }
  };
  assert(Game.prototype.tryLaunch.call(fromOver) === true);
  assert(fromOver.started === 1);
});

check('held R on GAMEOVER does not auto-restart from update', () => {
  const game = {
    state: 'GAMEOVER',
    currentSpeed: 300,
    floatingRewards: [],
    feel: { update() {} },
    keyboardInput: { isRestartPressed() { return true; } },
    restarted: false,
    restart() { this.restarted = true; },
    updateFloating: Game.prototype.updateFloating
  };
  Game.prototype.update.call(game, 0.016);
  assert(game.restarted === false, 'GAMEOVER update must not restart from held R');
});

check('NEW BEST only when score beats previous best', () => {
  const saved = [];
  const feel = { onGameOver() {}, onNewBest() { this.hit = true; } };

  const tie = {
    state: 'PLAYING',
    distanceScore: 100,
    pathReward: 0,
    bestScore: 100,
    player: { x: 0, y: 0 },
    feel,
    storage: { set(key, value) { saved.push([key, value]); } },
    multiplier: 2,
    riskStreak: 2
  };
  Game.prototype.gameOver.call(tie);
  assert(tie.isNewBest === false, 'equal score is not NEW BEST');
  assert(saved.length === 0, 'tie must not rewrite bestScore');

  const firstZero = {
    state: 'PLAYING',
    distanceScore: 0,
    pathReward: 0,
    bestScore: 0,
    player: { x: 0, y: 0 },
    feel,
    storage: { set() {} },
    multiplier: 1,
    riskStreak: 0
  };
  Game.prototype.gameOver.call(firstZero);
  assert(firstZero.isNewBest === false, 'zero is not NEW BEST');

  feel.hit = false;
  const win = {
    state: 'PLAYING',
    distanceScore: 50,
    pathReward: 10,
    bestScore: 0,
    player: { x: 0, y: 0 },
    feel,
    storage: { set(key, value) { this.key = key; this.value = value; } },
    multiplier: 1,
    riskStreak: 0
  };
  Game.prototype.gameOver.call(win);
  assert(win.isNewBest === true, 'first positive score should be NEW BEST');
  assert(win.bestScore === 60, 'best should update');
  assert(feel.hit === true, 'NEW BEST feedback should fire');
  assert(win.storage.key === 'bestScore' && win.storage.value === 60);
});

check('SAFE streak-loss feedback keeps reward rules', () => {
  const quiet = new GameFeel();
  const calm = makeScoreState();
  calm.feel = quiet;
  calm.applyReward('SAFE', false, true);
  assert(calm.riskStreak === 0 && calm.multiplier === 1);
  assert(calm.pathReward === CONFIG.REWARDS.SAFE);
  assert(quiet.hudPulse.streak === 0, 'SAFE at streak 0 must stay quiet');

  const loud = new GameFeel();
  const game = makeScoreState();
  game.feel = loud;
  game.applyReward('RISKY', true, true);
  game.applyReward('RISKY', true, true);
  const rewardBefore = game.pathReward;
  game.applyReward('SAFE', false, true);
  assert(game.riskStreak === 0, 'streak still resets');
  assert(game.multiplier === CONFIG.MULTIPLIER_START, 'multiplier still resets');
  assert(game.pathReward === rewardBefore + CONFIG.REWARDS.SAFE, 'SAFE reward unchanged');
  assert(loud.hudPulse.streak > 0, 'streak loss should pulse HUD');
  assert(game.floatingRewards.some((item) => item.subtitle === 'STREAK RESET'), 'streak loss should show floating text');
});

check('Coin feedback stays below SAFE and RISK', () => {
  assert(CONFIG.FEEL.PARTICLE_COIN < CONFIG.FEEL.PARTICLE_SAFE, 'coin particles should be below SAFE');
  assert(CONFIG.FEEL.PARTICLE_SAFE < CONFIG.FEEL.PARTICLE_RISK, 'SAFE particles should be below RISK');
  assert(CONFIG.FEEL.INTENSITY_COIN < CONFIG.FEEL.INTENSITY_SAFE);
  assert(CONFIG.FEEL.INTENSITY_SAFE < CONFIG.FEEL.INTENSITY_RISK);
});

check('mouse strafe uses canvas halves, not follow', () => {
  const mouse = Object.create(MouseInput.prototype);
  mouse.canvas = { width: 540 };
  mouse.held = true;
  mouse.logicalX = 40;
  assert(MouseInput.prototype.getMoveDirection.call(mouse) === -1);
  mouse.logicalX = 500;
  assert(MouseInput.prototype.getMoveDirection.call(mouse) === 1);
  mouse.logicalX = 270;
  assert(MouseInput.prototype.getMoveDirection.call(mouse) === 0);
  mouse.held = false;
  assert(MouseInput.prototype.getMoveDirection.call(mouse) === 0);
});

check('Audio mute and hidden tab do not play SFX', () => {
  const audio = new AudioService();
  audio.unlocked = true;
  audio.ctx = { state: 'suspended', currentTime: 1, resume() { return Promise.resolve(); }, suspend() { return Promise.resolve(); } };
  audio.setMuted(true);
  assert(audio.play('coin') === false, 'muted must not play');
  audio.setMuted(false);
  audio.setHidden(true);
  assert(audio.play('risk') === false, 'hidden tab must not play');
});

check('late Choice intervals keep breathing room', () => {
  const seeds = [11, 23, 47, 8, 19];
  const gaps = [];
  seeds.forEach((seed) => {
    const { events } = generateTimedRun(seed, 90, 55);
    const choices = choiceEvents(events).filter((event) => event.t >= 60);
    for (let i = 1; i < choices.length; i += 1) {
      gaps.push(choices[i].t - choices[i - 1].t);
    }
  });
  assert(gaps.length >= 8, `not enough late Choices to sample (${gaps.length})`);
  const mean = gaps.reduce((sum, dt) => sum + dt, 0) / gaps.length;
  assert(mean >= 5.6, `late Choices too dense, mean ${mean.toFixed(2)}s`);
  assert(mean <= 12, `late Choices too sparse, mean ${mean.toFixed(2)}s`);
});

check('Game Over feel does not change restart/coin rules', () => {
  const feel = new GameFeel();
  const over = {
    state: 'PLAYING',
    isRunning: true,
    multiplier: 2.5,
    riskStreak: 5,
    distanceScore: 10,
    pathReward: 200,
    bestScore: 999,
    coins: 17,
    player: { x: 100, y: 100 },
    feel,
    storage: { set() {}, getCoins() { return 17; } }
  };
  Game.prototype.gameOver.call(over);
  assert(over.state === 'GAMEOVER', 'state should be GAMEOVER');
  assert(over.riskStreak === 0 && over.multiplier === 1, 'run stats still reset');
  assert(over.coins === 17, 'coins persist');
  assert(feel.gameOverActive, 'game over feedback should start');
  feel.update(1, 300);
  const left = feel.particles.particles.length;
  feel.update(1, 300);
  assert(feel.particles.particles.length <= left, 'game over particles must decay');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed');
}
