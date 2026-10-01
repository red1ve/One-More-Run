// Фаза 1д: изгородь и декор газона не мигают (только отрисовка, без игры).
// Прокручиваем дорогу кадр за кадром (60 FPS, скорость как в игре, камера слегка
// покачивается) через настоящие HedgeArt и SideDecorArt и проверяем:
//  (а) у каждого клочка изгороди и предмета газона (по номеру слота) картинка,
//      отражение и вид не меняются со временем;
//  (б) предмет, однажды ставший видимым, остаётся видимым (и не бледнеет),
//      пока не уйдёт за нижний край экрана.
// Запуск: node scripts/phase1f-check.mjs (входит в npm run check).
import { CONFIG, getTrackSpeed } from '../src/config.js';
import { GardenArt } from '../src/rendering/GardenArt.js';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

// Холст-заглушка: рисование ничего не делает, нужны только расчёты.
const ctx = new Proxy({}, {
  get: (target, key) => (key in target ? target[key] : () => {}),
  set: (target, key, value) => { target[key] = value; return true; }
});
const art = new GardenArt(ctx);
const height = CONFIG.CANVAS_HEIGHT;
const SECONDS = 25;
const DT = 1 / 60;

// Прогоняет прокрутку; collect(frame) возвращает Map: ключ → { look, y, alpha }.
function scroll(collect, mayVanish = (item) => item.y >= height - 40) {
  const seen = new Map(); // ключ → { look, y, alpha, gone }
  const problems = [];
  let progress = 0;
  for (let frame = 0, time = 0; time < SECONDS; frame += 1, time += DT) {
    progress += getTrackSpeed(time) * DT;
    art.lastShift = -14 + Math.sin(time * 1.7) * 3;
    const now = collect(progress);
    for (const [key, item] of now) {
      const before = seen.get(key);
      if (!before) {
        seen.set(key, { ...item });
        continue;
      }
      if (before.gone) problems.push(`слот ${key} появился снова на кадре ${frame}`);
      if (before.look !== item.look) problems.push(`слот ${key}: ${before.look} → ${item.look} на кадре ${frame}`);
      if (item.alpha < before.alpha - 1e-6) problems.push(`слот ${key} побледнел ${before.alpha.toFixed(2)} → ${item.alpha.toFixed(2)}`);
      Object.assign(before, item);
    }
    for (const [key, before] of seen) {
      if (before.gone || now.has(key)) continue;
      // Пропал с экрана: допустимо только за краем экрана (внизу, у лужайки ещё и сбоку).
      if (!mayVanish(before)) problems.push(`слот ${key} исчез на x=${(before.x ?? 0).toFixed(0)}, y=${before.y.toFixed(0)} (кадр ${frame})`);
      before.gone = true;
    }
    if (problems.length > 5) break;
  }
  return { problems, count: seen.size };
}

check('hedge clumps keep their picture and mirroring, and never vanish mid-screen', () => {
  const hedge = art.hedges;
  const { problems, count } = scroll((progress) => {
    const cfg = hedge.sampleRows(art.lastShift);
    hedge.collectPackClumps(cfg, progress);
    const map = new Map();
    for (let i = 0; i < hedge.clumpKeys.length; i += 1) {
      map.set(hedge.clumpKeys[i], { look: hedge.clumpIds[i], y: hedge.clumps[i * 3 + 1], alpha: 1 });
    }
    return map;
  });
  if (count < 200) throw new Error(`мало клочков: ${count}`);
  if (problems.length) throw new Error(problems.slice(0, 5).join('; '));
});

check('lawn trees and props keep their kind, picture and mirroring; visible ones stay visible', () => {
  const decor = art.sideDecor;
  const { problems, count } = scroll((progress) => {
    decor.collect(progress);
    const it = decor.items;
    const map = new Map();
    // Предмет — 8 чисел: место, вид, x, y, размер, картинка, отражение, прозрачность.
    for (let i = 0; i < it.length; i += 8) {
      if (it[i + 7] <= 0) continue; // невидимые (прозрачные) не считаем видимыми
      map.set(it[i], { look: `${it[i + 1]}:${it[i + 5]}:${it[i + 6]}`, x: it[i + 2], y: it[i + 3], size: it[i + 4], alpha: it[i + 7] });
    }
    return map;
  }, (item) => (
    // Предметы газона летят от центра: уходят вниз или за боковой край экрана (запас 30 px на шаг).
    item.y >= height - 40 || item.x < -item.size + 30 || item.x > CONFIG.CANVAS_WIDTH + item.size - 30
  ));
  if (count < 50) throw new Error(`мало предметов: ${count}`);
  if (problems.length) throw new Error(problems.slice(0, 5).join('; '));
});

check('tree groups follow the configured pattern (1–2 trees, then a pause)', () => {
  const decor = art.sideDecor;
  const every = CONFIG.VISUAL.SIDE_DECOR.TREES.EVERY;
  for (const side of [-1, 1]) {
    let run = 0;
    let maxRun = 0;
    let trees = 0;
    for (let k = -2000; k < 0; k += 1) {
      const tree = decor.slotKind(k, side) === 0;
      run = tree ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
      if (tree) trees += 1;
    }
    const perGroup = trees / (2000 / every);
    if (maxRun > 2) throw new Error(`подряд ${maxRun} деревьев`);
    if (perGroup < 1 || perGroup > 2) throw new Error(`в группе в среднем ${perGroup.toFixed(2)} деревьев`);
  }
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1f check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1f checks passed');
}
