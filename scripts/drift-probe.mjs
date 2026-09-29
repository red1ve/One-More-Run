// Проверка перспективы: объект должен стоять на своей «полосе» дороги и только расти.
// Для нескольких позиций X считает, где объект рисуется, пока едет от горизонта к коту.
// Запуск: node scripts/drift-probe.mjs
import { CONFIG } from '../src/config.js';
import { projectTrackX, screenYForWorld } from '../src/rendering/VisualProjector.js';

const player = CONFIG.PLAYER_START_Y;
const distances = [2400, 1600, 1000, 600, 300, 120, 0];
const xs = [110, 180, 270, 360, 430];
let worst = 0;
console.log('dist  screenY  roadW  scale | доля ширины дороги для X =', xs.join(' / '));
for (const d of distances) {
  const worldY = player - d;
  const cells = xs.map((x) => projectTrackX(x, worldY, 0));
  const p = cells[0];
  const fr = cells.map((c) => (c.screenX - c.roadLeft) / c.roadWidth);
  console.log(
    `${String(d).padStart(4)}  ${screenYForWorld(worldY).toFixed(0).padStart(6)}  ${p.roadWidth.toFixed(0).padStart(5)}  ${p.scale.toFixed(2)} | ${fr.map((f) => f.toFixed(3)).join('  ')}`
  );
}
// «Съезд»: насколько меняется доля ширины дороги у одного и того же объекта.
for (const x of xs) {
  const fr = distances.map((d) => {
    const c = projectTrackX(x, player - d, 0);
    return (c.screenX - c.roadLeft) / c.roadWidth;
  });
  worst = Math.max(worst, Math.max(...fr) - Math.min(...fr));
}
const near = projectTrackX(270, player, 0);
const far = projectTrackX(270, player - 2400, 0);
const scaleVsRoad = far.scale / (far.roadWidth / near.roadWidth);
console.log(`\nмакс. съезд по доле дороги: ${(worst * 100).toFixed(1)}% (цель < 1%)`);
console.log(`масштаб объекта / сужение дороги вдали: ${scaleVsRoad.toFixed(2)} (цель 1.00)`);
if (worst > 0.01 || Math.abs(scaleVsRoad - 1) > 0.03) process.exitCode = 1;
