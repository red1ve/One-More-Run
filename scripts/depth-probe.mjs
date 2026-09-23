import { CONFIG } from '../src/config.js';
import {
  projectWorldToScreen,
  sampleRoadRibbon,
  screenYForWorld,
  unifiedDepthZones,
  worldYForScreen
} from '../src/rendering/VisualProjector.js';

const height = CONFIG.CANVAS_HEIGHT;
const shift = -(CONFIG.VISUAL.CAMERA_LEAD ? 16 : 16);
const speeds = [CONFIG.TRACK_SPEED_START, 510, CONFIG.TRACK_SPEED_MAX];
const cssScale = Math.min(390 / CONFIG.CANVAS_WIDTH, 844 / height);
const tile = CONFIG.VISUAL.PATH_SAND_TILE;
const texH = 1152;

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function rel(actual, expected) {
  return Math.abs(actual - expected) / Math.max(1e-6, Math.abs(expected));
}

const zones = unifiedDepthZones(shift, height);
const playerWorld = CONFIG.PLAYER_START_Y;
const playerScreen = screenYForWorld(playerWorld, shift, height);
if (Math.abs(playerScreen - (playerWorld + shift)) > 0.05) {
  fail(`player anchor ${playerScreen} != ${playerWorld + shift}`);
}
const horizonWorld = worldYForScreen(zones.horizon, shift, height);
const horizonBack = screenYForWorld(horizonWorld, shift, height);
if (Math.abs(horizonBack - zones.horizon) > 0.05) {
  fail(`horizon round-trip ${horizonBack} != ${zones.horizon}`);
}

console.log(`shift ${shift}  horizon ${zones.horizon.toFixed(1)}  playerScreen ${playerScreen.toFixed(1)}`);
console.log(`css viewport 390x844 scale ${cssScale.toFixed(3)} on logical ${CONFIG.CANVAS_WIDTH}x${height}`);
console.log('');
console.log('zone      s      j=s^2   screenY   worldY   width   texel');

for (const name of ['FAR', 'MID', 'NEAR']) {
  const sample = zones[name];
  const y0 = screenYForWorld(sample.worldY - 0.5, shift, height);
  const y1 = screenYForWorld(sample.worldY + 0.5, shift, height);
  const measured = y1 - y0;
  const texel = measured * tile / texH;
  console.log(
    `${name.padEnd(8)}  ${sample.s.toFixed(3)}  ${sample.yJacobian.toFixed(3)}   ${sample.screenY.toFixed(1).padStart(7)}  ${sample.worldY.toFixed(1).padStart(8)}  ${sample.roadWidth.toFixed(1).padStart(6)}  ${texel.toFixed(3)}`
  );
  if (rel(measured, sample.yJacobian) > 0.04) {
    fail(`${name} jacobian measured ${measured.toFixed(4)} != s^2 ${sample.yJacobian.toFixed(4)}`);
  }
  if (Math.abs(sample.screenY - (name === 'FAR' ? zones.horizon : name === 'NEAR' ? playerScreen : zones.horizon + (playerScreen - zones.horizon) * 0.5)) > 0.2) {
    fail(`${name} screen ${sample.screenY}`);
  }
}

if (Math.abs(zones.NEAR.s - 1) > 0.001) fail(`near s ${zones.NEAR.s}`);
if (Math.abs(zones.NEAR.yJacobian - 1) > 0.02) fail(`near jacobian ${zones.NEAR.yJacobian}`);
if (!(zones.FAR.yJacobian < zones.MID.yJacobian && zones.MID.yJacobian < zones.NEAR.yJacobian)) {
  fail('jacobian is not slower in the distance');
}
if (zones.FAR.yJacobian > 0.45) fail(`far jacobian too fast ${zones.FAR.yJacobian}`);
if (!(zones.FAR.roadWidth < zones.MID.roadWidth && zones.MID.roadWidth < zones.NEAR.roadWidth)) {
  fail('road width is not the same s curve');
}
const farWidth = CONFIG.VISUAL.PROJECTOR.FAR_ROAD_WIDTH;
if (Math.abs(zones.FAR.roadWidth - farWidth) > 1) {
  fail(`horizon width ${zones.FAR.roadWidth} != ${farWidth}`);
}

let prevScreen = -Infinity;
for (let world = horizonWorld; world <= playerWorld + 40; world += 25) {
  const screen = screenYForWorld(world, shift, height);
  if (screen <= prevScreen) fail(`non-monotonic at world ${world}`);
  prevScreen = screen;
}

const trioWorld = zones.MID.worldY;
const trio = [-80, 0, 80].map((dx) => (
  projectWorldToScreen(CONFIG.CANVAS_WIDTH * 0.5 + dx, trioWorld, shift, height)
));
const screens = trio.map((item) => item.screenY);
const esses = trio.map((item) => item.s);
const jacs = trio.map((item) => item.yJacobian);
if (Math.max(...screens) - Math.min(...screens) > 0.05) fail(`trio screenY ${screens.join(',')}`);
if (Math.max(...esses) - Math.min(...esses) > 1e-6) fail(`trio s ${esses.join(',')}`);
if (Math.max(...jacs) - Math.min(...jacs) > 1e-6) fail(`trio jacobian ${jacs.join(',')}`);
const scales = trio.map((item) => item.scale);
if (Math.max(...scales) - Math.min(...scales) > 1e-6) fail(`trio scale ${scales.join(',')}`);
trio.forEach((item, index) => {
  if (Math.abs(item.scale - item.s) > 1e-6) fail(`trio scale ${item.scale} != s ${item.s} at ${index}`);
});
console.log('');
console.log(`trio worldY ${trioWorld.toFixed(2)} screenY ${screens[0].toFixed(2)} s ${esses[0].toFixed(3)} scale ${scales[0].toFixed(3)} locked`);

for (const name of ['FAR', 'MID', 'NEAR']) {
  const sample = zones[name];
  if (Math.abs(sample.scale - sample.s) > 1e-6) fail(`${name} scale ${sample.scale} != s ${sample.s}`);
}

const catH = CONFIG.VISUAL.LOAF_REAR.DRAW_HEIGHT;
const treeCats = CONFIG.VISUAL.TREE_NEAR_CAT * zones.NEAR.s;
console.log(`near tree ${treeCats.toFixed(2)} cat heights (${(catH * treeCats).toFixed(0)} px) before vary`);
if (treeCats < 2.3 || treeCats > 2.8) fail(`near tree cat ratio ${treeCats}`);
const farTree = CONFIG.VISUAL.TREE_NEAR_CAT * zones.FAR.s;
if (Math.abs(farTree / treeCats - zones.FAR.s / zones.NEAR.s) > 1e-6) {
  fail('tree far/near ratio is not s');
}

console.log('');
console.log('speed px/s logical (css)');
for (const speed of speeds) {
  const parts = ['FAR', 'MID', 'NEAR'].map((name) => {
    const sample = zones[name];
    const logical = sample.yJacobian * speed;
    const fromS = sample.s * sample.s * speed;
    if (rel(logical, fromS) > 0.001) {
      fail(`${name} @ ${speed} screen velocity ${logical} != s^2 * track ${fromS}`);
    }
    return `${name} ${logical.toFixed(0)} (${(logical * cssScale).toFixed(0)})`;
  });
  console.log(`  ${String(speed).padStart(3)}  ${parts.join('   ')}`);
}

const ribbon = sampleRoadRibbon(shift, { height, pad: 56 });
let prevDraw = -Infinity;
let prevTexel = 0;
console.log('');
console.log('ribbon strips  destH/srcH');
for (let i = 0; i < ribbon.length - 1; i += 1) {
  const a = ribbon[i];
  const b = ribbon[i + 1];
  if (b.drawY + 0.01 < prevDraw) fail('ribbon drawY went backwards');
  prevDraw = b.drawY;
  const destH = Math.max(1e-4, b.drawY - a.drawY);
  const srcH = Math.max(1e-4, (Math.abs(b.worldY - a.worldY) / tile) * texH);
  const texel = destH / srcH;
  if (i > 0 && texel + 0.02 < prevTexel) {
    fail(`texel shrank ${prevTexel.toFixed(3)} -> ${texel.toFixed(3)} at screen ${a.screenY.toFixed(1)}`);
  }
  prevTexel = texel;
  if (i === 0 || i === Math.floor((ribbon.length - 1) / 2) || i === ribbon.length - 2) {
    console.log(
      `  screen ${a.screenY.toFixed(0)}-${b.screenY.toFixed(0)}  s ${a.s.toFixed(2)}  dest/src ${texel.toFixed(3)}  world ${a.worldY.toFixed(0)}`
    );
  }
}

if (process.exitCode) {
  console.error('depth probe failed');
} else {
  console.log('');
  console.log('depth probe passed');
}
