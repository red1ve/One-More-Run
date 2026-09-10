import { CONFIG, getTrackSpeed } from '../src/config.js';
import { Track } from '../src/game/Track.js';
import { Player } from '../src/game/Player.js';
import { Game } from '../src/game/Game.js';

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
  assert(risky[0].width >= 70 && risky[0].width <= 80, `RISK width ${risky[0].width} should stay in 70–80`);
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
    assert(risk.width >= 70 && risk.width <= 80, `high-speed RISK width ${risk && risk.width}`);
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
    assert(risk.width >= 70 && risk.width <= 80, `RISK width ${risk.width} at speed ${speed}`);

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

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed');
}
