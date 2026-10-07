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

  // Видео 16:9 (1280x720): стартовый экран, потом забег. Рисуется и кодируется КАДР ЗА КАДРОМ (WebCodecs): ровно fps кадров
  // в секунду, а не «как успеет страница» (запись в реальном времени давала 24–27 кадров с провалами, а Яндекс принимал
  // такие ролики с ошибкой «Невалидное видео»). Видео — H.264 High 3.1, звук — тихая дорожка AAC (обычная структура MP4).
  // Игра идёт фиксированными шагами 1/60 с, как в тестах, поэтому забег повторяет проверенный заранее. По бокам
  // размытый кадр и надписи. На выходе файл OMRV (release/store-out/<name>), его собирает в MP4 mux-mp4.mjs.
  // Не ждёт конца: статус в window.__rec ({ done, frames, bytes, log, error }).
  function makeComposer(left, right) {
    const comp = document.createElement('canvas');
    comp.width = 1280; comp.height = 720;
    const x = comp.getContext('2d');
    const panel = (lines, side) => {
      if (!lines.length) return;
      let size = 40;
      x.font = `700 ${size}px Fredoka, "OMR Cyrillic", sans-serif`;
      while (Math.max(...lines.map((l) => x.measureText(l).width)) + 56 > 340 && size > 20) { size -= 2; x.font = `700 ${size}px Fredoka, "OMR Cyrillic", sans-serif`; }
      const width = Math.max(...lines.map((l) => x.measureText(l).width)) + 56;
      const height = lines.length * 56 + 28;
      const left0 = side === 'left' ? 48 : 1280 - 48 - width;
      const top = 360 - height / 2;
      x.fillStyle = 'rgba(74,51,38,0.35)';
      x.beginPath(); x.roundRect(left0 + 4, top + 6, width, height, 26); x.fill();
      x.fillStyle = '#F4E7CC';
      x.beginPath(); x.roundRect(left0, top, width, height, 26); x.fill();
      x.lineWidth = 4; x.strokeStyle = '#4A3326'; x.stroke();
      x.fillStyle = '#4A3326';
      lines.forEach((line, i) => {
        const m = x.measureText(line);
        x.textAlign = 'center';
        x.fillText(line, left0 + width / 2, top + 14 + 28 + i * 56 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      });
    };
    const draw = () => {
      g.render();
      x.filter = 'blur(22px) brightness(0.9)';
      const cover = 1280 / 540;
      x.drawImage(g.canvas, 0, (720 - 960 * cover) / 2, 1280, 960 * cover);
      x.filter = 'none';
      const w = 405;
      const left0 = (1280 - w) / 2;
      x.drawImage(g.canvas, left0, 0, w, 720);
      x.lineWidth = 5; x.strokeStyle = '#4A3326'; x.strokeRect(left0, 0, w, 720);
      panel(left, 'left');
      panel(right, 'right');
    };
    return { comp, draw };
  }

  function record({ name, seed, tod, skin = 'classic', risk = true, intro = 2.4, seconds = 27, fps = 30, left = [], right = [] }) {
    const state = { done: false, frames: 0, bytes: 0, log: '', error: null };
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
      const { comp, draw } = makeComposer(left, right);
      const WIDTH = 1280;
      const HEIGHT = 720;
      const SCALE = 30000; // единиц времени в секунде у видео: 30 кадров по 1000
      const frameUnits = SCALE / fps;
      const videoChunks = [];
      let videoDescription = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          videoChunks.push({ bytes, key: chunk.type === 'key', timestamp: chunk.timestamp });
          if (!videoDescription && meta && meta.decoderConfig && meta.decoderConfig.description) videoDescription = new Uint8Array(meta.decoderConfig.description);
        },
        error: (error) => { state.error = `video: ${error}`; }
      });
      videoEncoder.configure({ codec: 'avc1.64001f', width: WIDTH, height: HEIGHT, bitrate: 4000000, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' });
      const total = Math.round(seconds * fps);
      let simStart = null;
      let steps = 0;
      for (let f = 0; f < total; f += 1) {
        freeze();
        const t = f / fps;
        if (simStart === null && t >= intro) { g.start(); freeze(); simStart = t; }
        if (simStart !== null) {
          const want = Math.floor((t - simStart) * 60 + 1e-6);
          while (steps < want && g.state === 'PLAYING') { g.update(1 / 60); steps += 1; }
        }
        draw();
        const frame = new VideoFrame(comp, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
        videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();
        state.frames = f + 1;
        while (videoEncoder.encodeQueueSize > 6) await new Promise((resolve) => setTimeout(resolve, 2));
      }
      await videoEncoder.flush();
      videoEncoder.close();

      // Звук: тишина, AAC-LC, 48 кГц, стерео.
      const RATE = 48000;
      const audioChunks = [];
      let audioDescription = null;
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          audioChunks.push(bytes);
          if (!audioDescription && meta && meta.decoderConfig && meta.decoderConfig.description) audioDescription = new Uint8Array(meta.decoderConfig.description);
        },
        error: (error) => { state.error = `audio: ${error}`; }
      });
      audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 96000 });
      const totalSamples = Math.round(seconds * RATE);
      for (let at = 0; at < totalSamples; at += 4800) {
        const n = Math.min(4800, totalSamples - at);
        const data = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at / RATE) * 1e6), data: new Float32Array(n * 2) });
        audioEncoder.encode(data);
        data.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();

      if (!videoDescription || !audioDescription) throw new Error('кодировщик не дал описание потока');
      const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
      const header = {
        video: { width: WIDTH, height: HEIGHT, timescale: SCALE, description: toBase64(videoDescription), samples: videoChunks.map((c) => [c.bytes.length, frameUnits, c.key ? 1 : 0]) },
        audio: { sampleRate: RATE, channels: 2, timescale: RATE, description: toBase64(audioDescription), samples: audioChunks.map((c) => [c.length, 1024]) }
      };
      const monotonic = videoChunks.every((c, i) => i === 0 || c.timestamp > videoChunks[i - 1].timestamp);
      const headerBytes = new TextEncoder().encode(JSON.stringify(header));
      const lengthBytes = new Uint8Array(4);
      new DataView(lengthBytes.buffer).setUint32(0, headerBytes.length);
      const blob = new Blob([new TextEncoder().encode('OMRV'), lengthBytes, headerBytes, ...videoChunks.map((c) => c.bytes), ...audioChunks]);
      const res = await fetch(SAVE + name, { method: 'POST', body: blob });
      state.bytes = Number(await res.text());
      state.log = `state ${g.state} t ${g.runTime.toFixed(1)} score ${g.score} mult ${g.multiplier} coins ${g.runCoins} steps ${steps}; video ${videoChunks.length} frames, ${videoChunks.filter((c) => c.key).length} key, audio ${audioChunks.length} frames, timestamps in order: ${monotonic}`;
      state.done = true;
    })().catch((error) => { state.error = String((error && error.stack) || error); state.done = true; });
    return state;
  }

  return { g, bot, frames, hi, lo, freeze, begin, advance, forkAhead, swayAhead, floatNow, save, shoot, triptych, record };
}
