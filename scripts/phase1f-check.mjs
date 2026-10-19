// Фаза 1д: изгородь и декор газона не мигают (только отрисовка, без игры).
// Прокручиваем дорогу кадр за кадром (60 FPS, скорость как в игре, камера слегка
// покачивается) через настоящие HedgeArt и SideDecorArt и проверяем:
//  (а) у каждого клочка изгороди и предмета газона (по номеру слота) картинка,
//      отражение и вид не меняются со временем;
//  (б) предмет, однажды ставший видимым, остаётся видимым (и не бледнеет),
//      пока не уйдёт за нижний край экрана;
//  (в) предметы газона не обгоняют друг друга: порядок «дальний — ближний» никогда не меняется.
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

check('lawn items never overtake each other: their order on the screen only ever stays the same', () => {
  const decor = art.sideDecor;
  let progress = 0;
  let previous = []; // ключи мест от дальнего к ближнему в прошлом кадре
  let pairs = 0;
  for (let frame = 0, time = 0; time < SECONDS; frame += 1, time += DT) {
    progress += getTrackSpeed(time) * DT;
    art.lastShift = -14 + Math.sin(time * 1.7) * 3;
    decor.collect(progress);
    const it = decor.items;
    const order = [];
    for (let i = 0; i < it.length; i += 8) order.push({ key: it[i], y: it[i + 3] });
    order.sort((a, b) => a.y - b.y); // от дальнего (выше на экране) к ближнему
    const now = order.map((item) => item.key);
    const rank = new Map(now.map((key, index) => [key, index]));
    // Те из прошлого кадра, кто остался на экране, должны стоять в том же порядке.
    const stayed = previous.filter((key) => rank.has(key));
    for (let i = 1; i < stayed.length; i += 1) {
      pairs += 1;
      if (rank.get(stayed[i - 1]) > rank.get(stayed[i])) {
        throw new Error(`на кадре ${frame} предмет ${stayed[i - 1]} обогнал предмет ${stayed[i]}: дальний стал ближе ближнего`);
      }
    }
    previous = now;
  }
  if (pairs < 5000) throw new Error(`мало пар для проверки: ${pairs}`);
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

// Пятна и пучки травы привязаны к миру так же, как деревья и кусты: их отступ от изгороди, выраженный в
// ширинах дороги на их глубине, не меняется, пока они летят. (Раньше он считался долей оставшегося до
// края экрана и менялся каждый кадр: пятна ползли вбок медленнее деревьев и «плыли».)
check('lawn patches and tufts are fixed to the world: the offset from the hedge, in road widths, never changes', () => {
  const lawn = art.lawn;
  const seen = new Map(); // ключ → { kind, side, lateral (в ширинах дороги), frames }
  let progress = 0;
  let worst = 0;
  let samples = 0;
  for (let frame = 0, time = 0; time < 20; frame += 1, time += DT) {
    progress += getTrackSpeed(time) * DT;
    art.lastShift = -14 + Math.sin(time * 1.7) * 3;
    lawn.collect(progress);
    const measure = (kind, x, y, offsetNear, key, side) => {
      // screenToWorldY ждёт y без сдвига камеры (lastShift), а предмет хранит уже нарисованный y.
      const road = art.roadAt(art.screenToWorldY(y + art.lastShift));
      const outer = lawn.hedgeOuter(road, side);
      // x = outer + side * (offsetNear * scale + lateral * slotPx): получаем lateral в ширинах дороги.
      const lateral = (side * (x - outer) - offsetNear * road.scale) / road.roadWidth;
      const id = `${kind}:${key}`;
      const before = seen.get(id);
      if (!before) {
        seen.set(id, { lateral, side });
        return;
      }
      samples += 1;
      worst = Math.max(worst, Math.abs(lateral - before.lateral));
    };
    const patches = lawn.patches;
    for (let i = 0; i < patches.length; i += 6) {
      const side = patches[i] < CONFIG.CANVAS_WIDTH / 2 ? -1 : 1;
      measure('patch', patches[i], patches[i + 1], 8, patches[i + 5], side);
    }
    const tufts = lawn.tufts;
    for (let i = 0; i < tufts.length; i += 4) {
      const side = tufts[i] < CONFIG.CANVAS_WIDTH / 2 ? -1 : 1;
      measure('tuft', tufts[i], tufts[i + 1], 6, tufts[i + 3], side);
    }
  }
  if (seen.size < 300) throw new Error(`мало пятен и пучков: ${seen.size}`);
  if (samples < 5000) throw new Error(`мало замеров: ${samples}`);
  if (worst > 0.002) throw new Error(`предмет газона сдвинулся вбок относительно дороги на ${worst.toFixed(4)} ширин дороги (деревья так не делают)`);
});

check('lawn: patches and tufts cover the grass beside the road on both sides at every depth, in about the old amount', () => {
  const lawn = art.lawn;
  art.lastShift = -14;
  lawn.collect(500);
  const left = [];
  const right = [];
  for (let i = 0; i < lawn.patches.length; i += 6) (lawn.patches[i] < CONFIG.CANVAS_WIDTH / 2 ? left : right).push(lawn.patches[i + 1]);
  if (left.length < 10 || right.length < 10) throw new Error(`слева ${left.length}, справа ${right.length} пятен`);
  if (lawn.tufts.length / 4 < 10) throw new Error(`пучков ${lawn.tufts.length / 4}`);
  // Пятна есть и у горизонта, и ближе к коту (три слоя по высоте экрана).
  const spread = [left, right].map((ys) => new Set(ys.map((y) => Math.floor((y - art.horizonY()) / 150))).size);
  if (Math.min(...spread) < 3) throw new Error(`пятна лежат только в ${Math.min(...spread)} слоях по высоте`);
  // Не больше разумного: по ряду на сторону приходится не больше трёх-четырёх пятен.
  if (lawn.patches.length / 6 > 450) throw new Error(`пятен слишком много: ${lawn.patches.length / 6}`);
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 1f check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 1f checks passed');
}
