import { CONFIG } from '../src/config.js';
import { Track } from '../src/game/Track.js';
import { Player } from '../src/game/Player.js';

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

check('TWO_PATHS has wide SAFE and narrow RISK', () => {
  const track = new Track();
  track.speed = CONFIG.GAME_SPEED;
  const before = track.segments.length;
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[before];
  assert(segment.type === 'TWO_PATHS', `expected TWO_PATHS, got ${segment.type}`);
  const safe = segment.paths.find((path) => path.type === 'SAFE');
  const risky = segment.paths.filter((path) => path.type === 'RISKY');
  assert(safe && safe.width === CONFIG.SAFE_GAP_WIDTH, `SAFE width ${safe && safe.width}`);
  assert(risky.length === 2, `expected 2 RISK gates, got ${risky.length}`);
  assert(risky.every((path) => path.width === CONFIG.RISKY_GAP_WIDTH), 'RISK gap width mismatch');
  assert(safe.width > risky[0].width, 'SAFE should be wider than RISK');
  assert(risky[0].x !== risky[1].x, 'RISK gates should be offset');
});

check('TWO_PATHS both routes reachable from last exits', () => {
  const track = new Track();
  const top = track.segments[track.segments.length - 1];
  track.addSegment(top.y - CONFIG.SEGMENT_HEIGHT, 'TWO_PATHS');
  const segment = track.segments[track.segments.length - 1];
  if (segment.type !== 'TWO_PATHS') return;
  const firstRowY = Math.max(...segment.paths.filter((path) => path.type === 'RISKY').map((path) => path.y));
  const travelY = 400;
  const safe = segment.paths.find((path) => path.type === 'SAFE');
  const risk1 = segment.paths.filter((path) => path.type === 'RISKY').sort((a, b) => b.y - a.y)[0];
  track.lastExits = [{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }];
  assert(track.canReach(track.lastExits[0], safe, travelY), 'SAFE unreachable from full track');
  assert(track.canReach(track.lastExits[0], risk1, travelY), 'RISK unreachable from full track');
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
  const risk = segment.paths.filter((path) => path.type === 'RISKY').sort((a, b) => b.y - a.y)[0];
  const safeReward = simulatePass(track, segment, safe.x + safe.width / 2);
  assert(safeReward === 'SAFE', `SAFE pass got ${safeReward}`);
  const riskReward = simulatePass(track, segment, risk.x + risk.width / 2);
  assert(riskReward === 'RISKY', `RISK pass got ${riskReward}`);
  const again = track.checkPassed(makePlayer(safe.x + safe.width / 2));
  assert(again.rewardType === null, 'reward must be granted only once');
});

check('SHORT_RISKY paths match slalom gaps', () => {
  const track = new Track();
  track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'SHORT_RISKY');
  const segment = track.segments[track.segments.length - 1];
  if (segment.type !== 'SHORT_RISKY') {
    track.speed = CONFIG.GAME_SPEED;
    track.setExits([{ x: CONFIG.TRACK_LEFT, width: 120 }]);
    track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT, 'SHORT_RISKY');
  }
  const short = [...track.segments].reverse().find((segment) => segment.type === 'SHORT_RISKY');
  assert(short, 'SHORT_RISKY was not generated');
  assert(short.paths.length === 4, `expected 4 paths, got ${short.paths.length}`);
  assert(short.paths.every((path) => path.type === 'SHORT_RISKY'), 'path type mismatch');
  
  // Проверяем зигзаг
  assert(short.paths[0].x === CONFIG.TRACK_LEFT, 'Gate 1 should be on the left');
  assert(Math.abs(short.paths[1].x - (CONFIG.TRACK_RIGHT - short.paths[1].width)) < 1, 'Gate 2 should be on the right');
  
  const reward = simulatePass(track, short, short.paths[0].x + short.paths[0].width / 2);
  assert(reward === 'SHORT_RISKY', `got ${reward}`);
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
    const risk = segment.paths.filter((path) => path.type === 'RISKY').sort((a, b) => b.y - a.y)[0];
    const from = { x: CONFIG.TRACK_LEFT, width: 80 };
    const travelY = 220;
    assert(track.canReach(from, safe, travelY), 'SAFE unreachable at high speed');
    assert(track.canReach(from, risk, travelY), 'RISK unreachable at high speed');
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

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed');
}
