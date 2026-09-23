import { CONFIG } from '../src/config.js';
import { Player } from '../src/game/Player.js';
import { playableXBounds } from '../src/game/Corridor.js';
import { Track } from '../src/game/Track.js';
import { VariationDirector } from '../src/game/VariationDirector.js';

const results = [];

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = value + 0x6D2B79F5 | 0;
    let mixed = Math.imul(value ^ value >>> 15, 1 | value);
    mixed = mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed) ^ mixed;
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function forcePattern({ pattern, type = 'NORMAL', speed = 300, runTime = 90, seed = 1 }) {
  return withSeed(seed, () => {
    const track = new Track();
    track.speed = speed;
    track.runTime = runTime;
    track.setExits([{ x: CONFIG.TRACK_LEFT, width: CONFIG.TRACK_WIDTH }]);
    const previousExits = track.lastExits.map((exit) => ({ ...exit }));
    track.addSegment(
      track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT,
      type,
      pattern
    );
    return {
      track,
      segment: track.segments[track.segments.length - 1],
      previousExits
    };
  });
}

function center(opening) {
  return opening.x + opening.width / 2;
}

function routeFrom(segment, routeIndex) {
  return segment.gates.map((gate) => ({
    ...gate.openings[routeIndex],
    y: gate.y
  }));
}

function collides(player, obstacles) {
  return obstacles.some((obstacle) => (
    player.x - player.width / 2 < obstacle.x + obstacle.width
    && player.x + player.width / 2 > obstacle.x
    && player.y - player.height / 2 < obstacle.y + obstacle.height
    && player.y + player.height / 2 > obstacle.y
  ));
}

function simulateRoute(segment, routeIndex, startX, speed) {
  const player = new Player();
  player.x = startX;
  const obstacles = segment.obstacles.map((obstacle) => ({ ...obstacle }));
  const gates = routeFrom(segment, routeIndex);
  const dt = 1 / 120;

  for (let frame = 0; frame < 120 * 20; frame += 1) {
    const playerBottom = player.y + player.height / 2;
    if (obstacles.every((obstacle) => obstacle.y > playerBottom)) return true;

    const upcoming = gates
      .filter((gate) => gate.y <= playerBottom)
      .sort((a, b) => b.y - a.y)[0];
    const targetX = upcoming ? center(upcoming) : player.x;
    const direction = Math.abs(targetX - player.x) < 0.5
      ? 0
      : Math.sign(targetX - player.x);
    player.setMoveDirection(direction);
    player.update(dt);

    const movement = speed * dt;
    obstacles.forEach((obstacle) => { obstacle.y += movement; });
    gates.forEach((gate) => { gate.y += movement; });
    if (collides(player, obstacles)) return false;
  }

  return false;
}

function startPositions(exit) {
  const half = CONFIG.PLAYER_WIDTH / 2;
  return [
    exit.x + half,
    exit.x + exit.width / 2,
    exit.x + exit.width - half
  ];
}

function assertPatternGenerated(pattern, type, speed, seed = 1) {
  const generated = forcePattern({ pattern, type, speed, seed });
  assert(generated.segment.type === type, `${type}/${pattern} fell back to ${generated.segment.type}`);
  assert(generated.segment.pattern === pattern, `${type}/${pattern} fell back to ${generated.segment.pattern}`);
  assert(generated.segment.gates.length > 0, `${type}/${pattern} has no gate rows`);
  return generated;
}

function assertAllRoutesValid(generated) {
  const { track, segment, previousExits } = generated;
  const initialTravel = segment.initialTravel;
  assert(
    track.validateGateRows(segment.gates, initialTravel, CONFIG.PATTERN_GATE_HEIGHT),
    `${segment.type}/${segment.pattern} failed full route validation`
  );

  for (let routeIndex = 0; routeIndex < segment.gates[0].openings.length; routeIndex += 1) {
    const route = routeFrom(segment, routeIndex);
    previousExits.forEach((exit, exitIndex) => {
      assert(
        track.canFollowRouteFromExit(exit, route, initialTravel, CONFIG.PATTERN_GATE_HEIGHT),
        `route ${routeIndex} unreachable from exit ${exitIndex}`
      );
    });
  }
}

check('OFFSET generates a moderate one-direction drift', () => {
  const { segment } = assertPatternGenerated('OFFSET', 'NORMAL', 550, 7);
  assert(segment.gates.length === 3);
  const centers = segment.gates.map((gate) => center(gate.openings[0]));
  const deltas = centers.slice(1).map((value, index) => value - centers[index]);
  assert(deltas.every((delta) => Math.abs(delta) >= 4), `tiny drift: ${deltas}`);
  assert(deltas.every((delta) => Math.sign(delta) === Math.sign(deltas[0])), `zigzag: ${deltas}`);
  assert(deltas.every((delta) => Math.abs(delta) <= CONFIG.PATTERN_OFFSET_SHIFT_LATE + 0.01));
});

check('OFFSET is reachable with safe clearance at progression speeds', () => {
  [300, 450, 550, 650, 720].forEach((speed, index) => {
    const generated = assertPatternGenerated('OFFSET', 'NORMAL', speed, 20 + index);
    assertAllRoutesValid(generated);
    generated.segment.gates.forEach((gate) => {
      assert(gate.openings[0].width >= CONFIG.MIN_GAP);
    });
  });
});

check('FUNNEL follows wide-medium-narrow-medium-wide progression', () => {
  const { segment } = assertPatternGenerated('FUNNEL', 'NORMAL', 550, 11);
  const widths = segment.gates.map((gate) => gate.openings[0].width);
  assert(widths.length === 5);
  assert(widths[0] > widths[1] && widths[1] > widths[2], `not narrowing: ${widths}`);
  assert(widths[2] < widths[3] && widths[3] < widths[4], `not opening: ${widths}`);
  assert(widths[0] === widths[4] && widths[1] === widths[3], `not symmetric: ${widths}`);
});

check('FUNNEL minimum clearance and reachability stay fair', () => {
  [300, 450, 550, 650, 720].forEach((speed, index) => {
    const generated = assertPatternGenerated('FUNNEL', 'NORMAL', speed, 30 + index);
    assertAllRoutesValid(generated);
    const minimum = Math.min(...generated.segment.gates.map((gate) => gate.openings[0].width));
    assert(minimum >= generated.track.getBreathingWidth());
    assert(minimum >= CONFIG.MIN_GAP);
  });
});

check('OFFSET_GATE creates readable asymmetry without razor clearance', () => {
  const { segment } = assertPatternGenerated('OFFSET_GATE', 'NORMAL', 650, 17);
  assert(segment.gates.length === 3);
  const centers = segment.gates.map((gate) => center(gate.openings[0]));
  assert(Math.abs(centers[2] - centers[0]) >= 8, `asymmetry too small: ${centers}`);
  assert(Math.abs(centers[2] - centers[0]) <= CONFIG.PATTERN_OFFSET_GATE_SHIFT + 0.01);
  const sharedClearance = segment.gates[0].openings[0].width
    - Math.abs(centers[2] - centers[0])
    - CONFIG.PLAYER_WIDTH;
  assert(sharedClearance >= 20, `shared clearance ${sharedClearance}`);
});

check('OFFSET_GATE remains reachable at all required speeds', () => {
  [300, 450, 550, 650, 720].forEach((speed, index) => {
    const generated = assertPatternGenerated('OFFSET_GATE', 'NORMAL', speed, 40 + index);
    assertAllRoutesValid(generated);
  });
});

check('DOUBLE_GATE has two spaced, offset corrections', () => {
  const { track, segment } = assertPatternGenerated('DOUBLE_GATE', 'NORMAL', 720, 23);
  assert(segment.gates.length === 2);
  const spacing = segment.gates[0].y - segment.gates[1].y;
  const freeTravel = track.transitionTravel(
    segment.gates[0],
    segment.gates[1],
    CONFIG.PATTERN_GATE_HEIGHT
  );
  assert(spacing === 220, `spacing ${spacing}`);
  assert(freeTravel >= 140, `reaction travel ${freeTravel}`);
  assert(Math.abs(center(segment.gates[1].openings[0]) - center(segment.gates[0].openings[0])) >= 8);
});

check('DOUBLE_GATE is fully reachable at all required speeds', () => {
  [300, 450, 550, 650, 720].forEach((speed, index) => {
    const generated = assertPatternGenerated('DOUBLE_GATE', 'NORMAL', speed, 50 + index);
    assertAllRoutesValid(generated);
  });
});

check('pattern routes pass a 120 FPS physical collision simulation', () => {
  const cases = [
    ['NORMAL', 'OFFSET'],
    ['NORMAL', 'FUNNEL'],
    ['NORMAL', 'OFFSET_GATE'],
    ['NORMAL', 'DOUBLE_GATE'],
    ['TWO_PATHS', 'OFFSET'],
    ['TWO_PATHS', 'FUNNEL'],
    ['TWO_PATHS', 'OFFSET_GATE'],
    ['DUAL_RISK', 'OFFSET_GATE']
  ];
  [300, 450, 550, 650, 720].forEach((speed, speedIndex) => {
    cases.forEach(([type, pattern], caseIndex) => {
      const generated = assertPatternGenerated(pattern, type, speed, 100 + speedIndex * 20 + caseIndex);
      const routes = generated.segment.gates[0].openings.length;
      for (let routeIndex = 0; routeIndex < routes; routeIndex += 1) {
        startPositions(generated.previousExits[0]).forEach((startX) => {
          assert(
            simulateRoute(generated.segment, routeIndex, startX, speed),
            `${type}/${pattern} route ${routeIndex} failed physics at ${speed} from ${startX}`
          );
        });
      }
    });
  });
});

check('SAFE remains wider than RISK in patterned Choices', () => {
  ['OFFSET', 'FUNNEL', 'OFFSET_GATE'].forEach((pattern, index) => {
    const { segment } = assertPatternGenerated(pattern, 'TWO_PATHS', 650, 200 + index);
    segment.gates.forEach((gate) => {
      const safe = gate.openings.find((opening) => opening.type === 'SAFE');
      const risk = gate.openings.find((opening) => opening.type === 'RISKY');
      assert(safe && risk);
      assert(safe.width > risk.width, `${pattern}: SAFE ${safe.width}, RISK ${risk.width}`);
      assert(risk.width >= CONFIG.MIN_GAP);
    });
  });
});

check('patterned SAFE/RISK keeps existing rewards and both routes valid', () => {
  ['OFFSET', 'FUNNEL', 'OFFSET_GATE'].forEach((pattern, index) => {
    const generated = assertPatternGenerated(pattern, 'TWO_PATHS', 550, 220 + index);
    assertAllRoutesValid(generated);
    const paths = generated.segment.paths;
    assert(paths.some((path) => path.type === 'SAFE' && path.baseReward === CONFIG.REWARDS.SAFE));
    assert(paths.some((path) => path.type === 'RISKY' && path.baseReward === CONFIG.REWARDS.RISKY));
  });
});

check('DUAL_RISK OFFSET_GATE keeps both risky corridors valid', () => {
  const generated = assertPatternGenerated('OFFSET_GATE', 'DUAL_RISK', 650, 251);
  assertAllRoutesValid(generated);
  generated.segment.gates.forEach((gate) => {
    const easy = gate.openings.find((opening) => opening.type === 'RISKY_EASY');
    const hard = gate.openings.find((opening) => opening.type === 'RISKY_HARD');
    assert(easy && hard);
    assert(easy.width === CONFIG.RISK_EASY_GAP_WIDTH);
    assert(hard.width === CONFIG.RISK_HARD_GAP_WIDTH);
    assert(easy.baseReward === CONFIG.REWARDS.RISKY_EASY);
    assert(hard.baseReward === CONFIG.REWARDS.RISKY_HARD);
  });
});

check('unsupported demanding combinations fall back within existing semantics', () => {
  const two = forcePattern({ pattern: 'DOUBLE_GATE', type: 'TWO_PATHS', speed: 550, seed: 270 });
  assert(two.segment.type === 'TWO_PATHS' && two.segment.pattern === 'STRAIGHT');
  const dual = forcePattern({ pattern: 'FUNNEL', type: 'DUAL_RISK', speed: 550, seed: 271 });
  assert(dual.segment.type === 'DUAL_RISK' && dual.segment.pattern === 'STRAIGHT');
});

check('patterned NORMAL Coins stay optional, valid, and skippable', () => {
  ['OFFSET', 'FUNNEL', 'OFFSET_GATE', 'DOUBLE_GATE'].forEach((pattern, index) => {
    const { track, segment } = assertPatternGenerated(pattern, 'NORMAL', 550, 300 + index);
    let coin = null;
    for (const zone of ['LEFT', 'CENTER', 'RIGHT']) {
      for (const ySlot of ['AHEAD', 'MID', 'APPROACH']) {
        for (const jitter of [0, 0.25, 0.5, 0.75, 1]) {
          coin ||= track.tryPlaceCoin(segment, {
            zone,
            ySlot,
            xJitter: jitter,
            yJitter: 0.5
          });
        }
      }
    }
    assert(coin, `${pattern} could not place any valid optional Coin`);
    assert(!segment.obstacles.some((obstacle) => track.rectsOverlap(coin, obstacle)));
    assert(track.hasClearLane(segment.coinPath, coin));
    assert(segment.type === 'NORMAL');
  });
});

check('Choice patterns never receive Coins', () => {
  ['OFFSET', 'FUNNEL', 'OFFSET_GATE'].forEach((pattern, index) => {
    const { track, segment } = assertPatternGenerated(pattern, 'TWO_PATHS', 550, 330 + index);
    track.maybePlaceCoin(segment);
    assert(segment.coins.length === 0);
  });
  const dual = assertPatternGenerated('OFFSET_GATE', 'DUAL_RISK', 550, 340);
  dual.track.maybePlaceCoin(dual.segment);
  assert(dual.segment.coins.length === 0);
});

check('pattern weighting introduces variety gradually without rigid cycles', () => {
  const sample = (runTime, segmentType = 'NORMAL', lastType = 'NORMAL') => withSeed(
    500 + runTime,
    () => {
      const director = new VariationDirector();
      const counts = {};
      const sequence = [];
      for (let index = 0; index < 500; index += 1) {
        const pattern = director.choosePattern({ runTime, segmentType, lastType });
        counts[pattern] = (counts[pattern] || 0) + 1;
        sequence.push(pattern);
        director.lastPattern = pattern;
      }
      return { counts, sequence };
    }
  );

  const intro = sample(10);
  assert(!intro.counts.DOUBLE_GATE, 'DOUBLE_GATE appeared before 60s');
  assert(intro.counts.STRAIGHT > intro.counts.OFFSET, 'early game is not mostly straight');

  const early = sample(45);
  ['OFFSET', 'FUNNEL', 'OFFSET_GATE'].forEach((pattern) => {
    assert(early.counts[pattern] > 0, `${pattern} missing at 30-60s`);
  });

  const mid = sample(90);
  assert(mid.counts.DOUBLE_GATE > 0, 'DOUBLE_GATE missing after 60s');
  const late = sample(130);
  ['STRAIGHT', 'OFFSET', 'FUNNEL', 'OFFSET_GATE', 'DOUBLE_GATE'].forEach((pattern) => {
    assert(late.counts[pattern] > 0, `${pattern} missing after 120s`);
  });
  for (let index = 1; index < late.sequence.length; index += 1) {
    assert(
      !(late.sequence[index - 1] === 'DOUBLE_GATE' && late.sequence[index] === 'DOUBLE_GATE'),
      'consecutive DOUBLE_GATE'
    );
  }
  assert(new Set(late.sequence.slice(0, 20)).size >= 4, 'late sequence looks rigid/repetitive');
});

check('post-Choice Breathing suppresses DOUBLE_GATE difficulty spikes', () => {
  withSeed(610, () => {
    const director = new VariationDirector();
    for (let index = 0; index < 200; index += 1) {
      const pattern = director.choosePattern({
        runTime: 130,
        segmentType: 'NORMAL',
        lastType: index % 2 ? 'TWO_PATHS' : 'DUAL_RISK'
      });
      assert(pattern !== 'DOUBLE_GATE');
    }
  });
});

check('pattern selection preserves VariationDirector Choice rules', () => {
  withSeed(700, () => {
    const track = new Track();
    track.runTime = 130;
    track.speed = 650;
    for (let index = 0; index < 80; index += 1) {
      track.addSegment(track.segments[track.segments.length - 1].y - CONFIG.SEGMENT_HEIGHT);
    }
    const playable = track.segments.filter((segment) => segment.type !== 'EMPTY');
    playable.forEach((segment, index) => {
      if (index > 0) {
        assert(
          !(playable[index - 1].isChoiceSegment && segment.isChoiceSegment),
          'adjacent Choice segments'
        );
      }
      if (segment.type === 'DUAL_RISK') {
        const next = playable[index + 1];
        assert(!next || next.type === 'NORMAL', 'DUAL_RISK not followed by Breathing');
      }
    });
  });
});

check('Phase 9 preserves all balance constants', () => {
  assert(CONFIG.PLAYER_SPEED === 420);
  assert(CONFIG.PLAYER_WIDTH === 30 && CONFIG.PLAYER_HEIGHT === 30);
  assert(CONFIG.TRACK_SPEED_START === 300);
  assert(CONFIG.TRACK_SPEED_MAX === 720);
  assert(CONFIG.TRACK_SPEED_TAU === 70);
  assert(CONFIG.REWARDS.SAFE === 10);
  assert(CONFIG.REWARDS.RISKY === 100);
  assert(CONFIG.REWARDS.RISKY_EASY === 150);
  assert(CONFIG.REWARDS.RISKY_HARD === 250);
  assert(CONFIG.MULTIPLIER_STEP === 0.5 && CONFIG.MULTIPLIER_MAX === 5);
  assert(CONFIG.COIN_VALUE === 1);
});

check('garden corridor inset keeps edge MIN_GAP reachable', () => {
  const screenY = CONFIG.PLAYER_START_Y - CONFIG.VISUAL.CAMERA_LEAD;
  const bounds = playableXBounds(screenY);
  const gapRight = CONFIG.TRACK_LEFT + CONFIG.MIN_GAP;
  const gapLeft = CONFIG.TRACK_RIGHT - CONFIG.MIN_GAP;
  assert(bounds.minX + CONFIG.PLAYER_WIDTH / 2 <= gapRight + 0.51, 'left-edge MIN_GAP blocked by hedge clamp');
  assert(bounds.maxX - CONFIG.PLAYER_WIDTH / 2 >= gapLeft - 0.51, 'right-edge MIN_GAP blocked by hedge clamp');
  assert(CONFIG.VISUAL.PATH_INSET_FAR - CONFIG.VISUAL.PATH_INSET_NEAR < 90, 'road taper is still extreme');
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 9 checks passed');
}
