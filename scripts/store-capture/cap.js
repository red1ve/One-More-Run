// Съёмочные помощники для скриншотов и видео магазина Яндекса (запускаются в странице dev-игры).
// const cap = (await import('http://127.0.0.1:3999/cap.js?' + Date.now())).install(window.__omrGame);
// Игру ведёт простой «автопилот» (смотрит только на препятствия, монеты и развилки в игровом мире):
// кадры настоящие, ничего не дорисовывается. Кадры снимаются в 2x (1080x1920) прямо из холста игры.
// Рецепты (какие кадры, какие зёрна трассы, какой скин и время суток) лежат в recipe.js.
export function install(g) {
  const SAVE = 'http://127.0.0.1:3999/save?name=';
  g.audio?.setMuted?.(true);

  const bot = () => {
    const pl = g.player;
    const top = pl.y - pl.height / 2;
    let rowY = -Infinity;
    const row = [];
    let fork = false;
    for (const seg of g.track.segments) {
      for (const o of seg.obstacles) {
        const bt = o.y + o.height;
        if (bt > top || bt < top - 420) continue;
        if (bt > rowY + 1) { rowY = bt; row.length = 0; fork = false; }
        if (Math.abs(bt - rowY) <= 1) { row.push(o); if (seg.isChoiceSegment) fork = true; }
      }
    }
    if (!row.length) return 0;
    row.sort((a, c) => a.x - c.x);
    const gaps = [];
    let from = 70;
    for (const o of [...row, { x: 470, width: 0 }]) {
      const w = o.x - from;
      if (w > 0) gaps.push({ c: from + w / 2, w });
      from = Math.max(from, o.x + o.width);
    }
    if (!gaps.length) return 0;
    // Режим риска: на развилке выбирается самый узкий проход, в который ещё можно пройти.
    const wide = gaps.reduce((a, b) => (b.w > a.w ? b : a));
    const narrow = gaps.filter((x) => x.w >= 84).reduce((a, b) => (!a || b.w < a.w ? b : a), null);
    const best = (g.__risk && fork && narrow) ? narrow : wide;
    let targetX = best.c;
    if (g.__coins) {
      let coin = null;
      for (const seg of g.track.segments) {
        for (const c of seg.coins) {
          if (c.collected || c.y > pl.y || c.y < pl.y - 380) continue;
          const cx = c.x + c.width / 2;
          if (cx < best.c - best.w / 2 + 6 || cx > best.c + best.w / 2 - 6) continue;
          if (!coin || c.y > coin.y) coin = c;
        }
      }
      if (coin) targetX = coin.x + coin.width / 2;
    }
    const dx = targetX - pl.x;
    return Math.abs(dx) > 8 ? Math.sign(dx) : 0;
  };
  g.keyboardInput.isLeftPressed = () => bot() < 0;
  g.keyboardInput.isRightPressed = () => bot() > 0;

  const frames = [];
  const hi = () => { g.canvas.width = 1080; g.canvas.height = 1920; g.ctx.setTransform(2, 0, 0, 2, 0, 0); };
  const lo = () => { g.canvas.width = 540; g.canvas.height = 960; g.ctx.setTransform(1, 0, 0, 1, 0, 0); };
  const freeze = () => { g.isRunning = false; g.hidden = false; };

  async function begin({ seed, assist = 1, tod = 0, start = 0, skin = 'classic', hint = false }) {
    freeze();
    g.questsWindow = null; g.shopWindow = null; g.leaderboard = null;
    g.runSeed = seed; g.assistOverride = assist; g.todOffset = tod; g.devStartTime = start;
    await g.renderer.setSkin(skin);
    g.choiceHintSeen = !hint; g.riskHintSeen = true;
    g.state = 'GAMEOVER';
    g.start();
    freeze();
  }

  function advance(seconds, until) {
    freeze();
    let t = 0;
    while (t < seconds && g.state === 'PLAYING') {
      g.update(1 / 60);
      t += 1 / 60;
      if (until && until()) return true;
    }
    return !until;
  }

  const aheadOf = (y) => g.player.y - y;
  const forkAhead = (min = 300, max = 600) => () => g.track.segments.some((s) => {
    if (!s.isChoiceSegment || s.isPassed || !s.paths.length) return false;
    const a = aheadOf(Math.min(...s.paths.map((p) => p.y)));
    return a > min && a < max;
  });
  const swayAhead = (min = 220, max = 650) => () => g.track.segments.some((s) => {
    if (!s.sway || !s.obstacles.length) return false;
    const a = aheadOf(Math.min(...s.obstacles.map((o) => o.y)));
    return a > min && a < max;
  });
  const floatNow = () => g.floatingRewards.some((f) => f.type !== 'COIN' && f.life > f.maxLife * 0.6);

  async function save(name, type = 'image/jpeg', quality = 0.92) {
    const blob = await new Promise((resolve) => g.canvas.toBlob(resolve, type, quality));
    const res = await fetch(SAVE + name, { method: 'POST', body: blob });
    return `${name} ${await res.text()} bytes`;
  }

  async function shoot(name, keep = false) {
    hi();
    g.render();
    if (keep) frames.push(await createImageBitmap(g.canvas));
    return save(name);
  }

  // Три кадра рядом на 16:9: то, что видит игрок на широком экране, без дорисовки, фон — размытый средний кадр.
  async function triptych(name, indices) {
    const c = document.createElement('canvas');
    c.width = 1920; c.height = 1080;
    const x = c.getContext('2d');
    const mid = frames[indices[1]];
    x.filter = 'blur(28px) brightness(0.9)';
    const cover = 1920 / mid.width;
    x.drawImage(mid, 0, (1080 - mid.height * cover) / 2, 1920, mid.height * cover);
    x.filter = 'none';
    const w = 607;
    const gap = (1920 - w * 3) / 4;
    indices.forEach((index, i) => {
      const left = gap + i * (w + gap);
      x.save();
      x.beginPath();
      x.roundRect(left, 0, w, 1080, 18);
      x.clip();
      x.drawImage(frames[index], left, 0, w, 1080);
      x.restore();
      x.lineWidth = 5;
      x.strokeStyle = '#4a3326';
      x.beginPath();
      x.roundRect(left, 0, w, 1080, 18);
      x.stroke();
    });
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92));
    const res = await fetch(SAVE + name, { method: 'POST', body: blob });
    return `${name} ${await res.text()} bytes`;
  }

  // Видео 16:9 (1280x720, MP4/H.264 средствами браузера): стартовый экран, потом забег. Игра идёт фиксированными
  // шагами 1/60 с (как в тестах), поэтому забег повторяет проверенный заранее. По бокам размытый кадр и надписи.
  // Не ждёт конца записи: статус в window.__rec ({ done, frames, bytes, log }).
  function record({ name, seed, tod, skin = 'classic', risk = true, intro = 2.4, seconds = 26, fps = 30, left = [], right = [] }) {
    const state = { done: false, frames: 0, bytes: 0, log: '' };
    window.__rec = state;
    (async () => {
      freeze();
      g.__risk = risk; g.__coins = true;
      g.questsWindow = null; g.shopWindow = null; g.leaderboard = null;
      g.state = 'GAMEOVER'; g.dailyRun = false;
      await g.renderer.setSkin(skin);
      g.openMenu();
      g.runSeed = seed; g.assistOverride = 1; g.todOffset = tod; g.devStartTime = 0; g.choiceHintSeen = true; g.riskHintSeen = true;
      freeze();
      lo();
      const comp = document.createElement('canvas');
      comp.width = 1280; comp.height = 720;
      const x = comp.getContext('2d');
      const rec = new MediaRecorder(comp.captureStream(fps), { mimeType: 'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond: 5000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { rec.onstop = resolve; });
      const panel = (lines, px, align) => {
        if (!lines.length) return;
        let size = 40;
        x.font = `700 ${size}px Fredoka, sans-serif`;
        while (Math.max(...lines.map((l) => x.measureText(l).width)) + 56 > 340 && size > 20) { size -= 2; x.font = `700 ${size}px Fredoka, sans-serif`; }
        const width = Math.max(...lines.map((l) => x.measureText(l).width)) + 56;
        const height = lines.length * 56 + 28;
        const left0 = align === 'left' ? 48 : 1280 - 48 - width;
        const top = 360 - height / 2;
        x.fillStyle = 'rgba(74,51,38,0.35)';
        x.beginPath(); x.roundRect(left0 + 4, top + 6, width, height, 26); x.fill();
        x.fillStyle = '#F4E7CC';
        x.beginPath(); x.roundRect(left0, top, width, height, 26); x.fill();
        x.lineWidth = 4; x.strokeStyle = '#4A3326'; x.stroke();
        x.fillStyle = '#4A3326'; x.textAlign = 'center';
        lines.forEach((l, i) => x.fillText(l, left0 + width / 2, top + 28 + 44 + i * 56 - 8));
      };
      const draw = () => {
        g.render();
        x.filter = 'blur(22px) brightness(0.9)';
        const cover = 1280 / 540;
        x.drawImage(g.canvas, 0, (720 - 960 * cover) / 2, 1280, 960 * cover);
        x.filter = 'none';
        const w = 405; const left0 = (1280 - w) / 2;
        x.drawImage(g.canvas, left0, 0, w, 720);
        x.lineWidth = 5; x.strokeStyle = '#4A3326'; x.strokeRect(left0, 0, w, 720);
        panel(left, 0, 'left');
        panel(right, 0, 'right');
        state.frames += 1;
      };
      rec.start(1000);
      const t0 = performance.now();
      let simStart = null; let steps = 0;
      await new Promise((resolve) => {
        const tick = () => {
          const el = (performance.now() - t0) / 1000;
          if (el >= seconds) return resolve();
          freeze();
          if (simStart === null && el >= intro) { g.start(); freeze(); simStart = el; }
          if (simStart !== null) {
            const want = Math.floor((el - simStart) * 60);
            while (steps < want && g.state === 'PLAYING') { g.update(1 / 60); steps += 1; }
          }
          draw();
          setTimeout(tick, 1000 / fps);
        };
        tick();
      });
      rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const res = await fetch(SAVE + name, { method: 'POST', body: blob });
      state.bytes = Number(await res.text());
      state.log = `state ${g.state} t ${g.runTime.toFixed(1)} score ${g.score} mult ${g.multiplier} coins ${g.runCoins} steps ${steps}`;
      state.done = true;
    })().catch((error) => { state.done = true; state.error = String(error && error.stack || error); });
    return state;
  }

  return { g, bot, frames, hi, lo, freeze, begin, advance, forkAhead, swayAhead, floatNow, save, shoot, triptych, record };
}
