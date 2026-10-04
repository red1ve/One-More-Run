import { t } from '../localization/i18n.js';
import { CONFIG, isRiskPathType } from '../config.js';
import { GardenArt } from './GardenArt.js';
import { sitSvg, skinPreviewSvg, skinSvg } from './SkinArt.js';

// Fredoka — латиница и цифры; русские буквы браузер берёт из 'OMR Cyrillic'
// (M PLUS Rounded 1c, см. src/localization/fonts.js).
const FONT_FAMILY = "'Fredoka', 'OMR Cyrillic', system-ui, sans-serif";
const LOAF_SIT_URL = new URL('../../assets/characters/loaf-sit.svg', import.meta.url).href;
const LOAF_RUN_URLS = [
  new URL('../../assets/characters/run/loaf-run-01.svg', import.meta.url).href,
  new URL('../../assets/characters/run/loaf-run-02.svg', import.meta.url).href,
  new URL('../../assets/characters/run/loaf-run-03.svg', import.meta.url).href,
  new URL('../../assets/characters/run/loaf-run-04.svg', import.meta.url).href
];

export class Renderer {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.width = CONFIG.CANVAS_WIDTH;
    this.height = CONFIG.CANVAS_HEIGHT;
    this.playerSprite = null;
    this.playerSpriteReady = false;
    this.playerSpriteError = false;
    this.playerFrontSprite = null;
    this.playerFrontReady = false;
    this.runFrames = [];
    this.loadedKinds = new Set();
    this.onSpriteReady = options.onSpriteReady || null;
    this.garden = new GardenArt(ctx, {
      onReady: () => {
        if (typeof this.onSpriteReady === 'function') this.onSpriteReady('garden');
      }
    });
    this.loadPlayerSprite(options.imageFactory);
  }

  markSpriteReady(kind) {
    if (this.loadedKinds.has(kind)) return;
    this.loadedKinds.add(kind);
    if (kind === 'front') this.playerFrontReady = true;
    else if (kind.startsWith('run-')) {
      const runReady = LOAF_RUN_URLS.every((_, index) => this.loadedKinds.has(`run-${index}`));
      if (runReady) {
        this.playerSpriteReady = true;
        this.playerSpriteError = false;
      }
    }
    if (typeof this.onSpriteReady === 'function') this.onSpriteReady(kind);
  }

  bindSpriteImage(image, url, kind) {
    if (!image) return null;
    image.decoding = 'async';
    image.onload = () => this.markSpriteReady(kind);
    image.onerror = () => {
      if (kind === 'front') this.playerFrontReady = false;
      else {
        this.playerSpriteReady = false;
        this.playerSpriteError = true;
        console.error('Renderer: failed to load Loaf run frame', kind);
      }
    };
    image.src = url;
    if (image.complete && image.naturalWidth > 0) this.markSpriteReady(kind);
    return image;
  }

  loadPlayerSprite(imageFactory) {
    const createImage = imageFactory || (
      typeof Image === 'function' ? () => new Image() : null
    );
    if (!createImage) return;

    this.runFrames = LOAF_RUN_URLS.map((url, index) => (
      this.bindSpriteImage(createImage(), url, `run-${index}`)
    ));
    this.playerSprite = this.runFrames[0] || null;
    this.baseRunFrames = this.runFrames;
    this.playerFrontSprite = this.bindSpriteImage(createImage(), LOAF_SIT_URL, 'front');
    this.baseFrontSprite = this.playerFrontSprite;
  }

  // Скин кота (SkinArt.js): кадры бега и сидящий кот перекрашиваются и подменяют обычные. Пока новые
  // картинки не загрузились, остаётся прежний кот; при любой ошибке тоже. 'classic' — обычный кот.
  async setSkin(skinId) {
    this.skinRequest = (this.skinRequest || 0) + 1;
    const request = this.skinRequest;
    if (!this.baseRunFrames) return false;
    if (!skinId || skinId === 'classic') {
      this.runFrames = this.baseRunFrames;
      this.playerSprite = this.runFrames[0] || null;
      if (this.baseFrontSprite) this.playerFrontSprite = this.baseFrontSprite;
      this.releaseSkinUrls([]);
      return true;
    }
    const urls = [];
    const load = async (url, recolor) => {
      const svg = await (await fetch(url)).text();
      const image = new Image();
      const ready = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      const blobUrl = URL.createObjectURL(new Blob([recolor(svg)], { type: 'image/svg+xml' }));
      urls.push(blobUrl);
      image.src = blobUrl;
      await ready;
      return image;
    };
    try {
      const [frames, front] = await Promise.all([
        Promise.all(LOAF_RUN_URLS.map((url) => load(url, (svg) => skinSvg(svg, skinId)))),
        load(LOAF_SIT_URL, (svg) => sitSvg(svg, skinId))
      ]);
      if (request !== this.skinRequest) {
        urls.forEach((blobUrl) => URL.revokeObjectURL(blobUrl)); // за это время выбрали другой скин
        return false;
      }
      this.runFrames = frames;
      this.playerSprite = frames[0];
      this.playerFrontSprite = front;
      this.releaseSkinUrls(urls);
      return true;
    } catch (error) {
      urls.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      console.error('Renderer: skin failed to load, the default cat stays', skinId, error);
      return false;
    }
  }

  // Превью скинов для магазина: кадр бега, обрезанный по коту, в окраске каждого скина. Грузятся при
  // первом открытии магазина; onChange вызывается, когда очередная картинка готова.
  async loadSkinPreviews(ids, onChange) {
    this.skinPreviews = this.skinPreviews || new Map();
    const missing = ids.filter((id) => !this.skinPreviews.has(id));
    if (!missing.length || typeof fetch !== 'function' || typeof Image !== 'function') return;
    missing.forEach((id) => this.skinPreviews.set(id, { image: null, ready: false }));
    try {
      const svg = await (await fetch(LOAF_RUN_URLS[0])).text();
      for (const id of missing) {
        const entry = this.skinPreviews.get(id);
        const image = new Image();
        image.onload = () => {
          entry.ready = true;
          if (typeof onChange === 'function') onChange();
        };
        image.src = URL.createObjectURL(new Blob([skinPreviewSvg(svg, id)], { type: 'image/svg+xml' }));
        entry.image = image;
      }
    } catch (error) {
      missing.forEach((id) => this.skinPreviews.delete(id));
      console.error('Renderer: skin previews failed to load', error);
    }
  }

  // Освобождает временные адреса прежнего скина; keep — адреса, которые остаются в работе.
  releaseSkinUrls(keep) {
    (this.skinUrls || []).forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
    this.skinUrls = keep;
  }

  runFrameIndex(time) {
    const count = this.runFrames.length || 1;
    const fps = CONFIG.FEEL.PLAYER_RUN_FPS;
    return Math.floor(Math.max(0, time) * fps) % count;
  }

  spriteLayout(sprite) {
    const scale = sprite.DRAW_HEIGHT / sprite.SOURCE_HEIGHT;
    return {
      x: -sprite.ANCHOR_X * scale,
      y: -sprite.ANCHOR_Y * scale,
      width: sprite.SOURCE_WIDTH * scale,
      height: sprite.DRAW_HEIGHT
    };
  }

  playerSpriteLayout() {
    return this.spriteLayout(CONFIG.VISUAL.LOAF_REAR);
  }

  clear() {
    this.ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  beginWorld(offset) {
    this.ctx.save();
    if (offset) this.ctx.translate(offset.x || 0, offset.y || 0);
  }

  endWorld() {
    this.ctx.restore();
  }

  drawBackdrop(time = 0) {
    this.garden.drawScreenBackdrop(time);
  }

  drawFarWorld(camera) {
    this.garden.drawFarWorld(camera);
  }

  drawMainWorld(camera) {
    this.garden.drawMainWorld(camera);
  }

  drawWorld(camera, segments = [], playerY = CONFIG.PLAYER_START_Y) {
    this.garden.drawMainWorld(camera, segments, playerY);
  }

  drawSegments(segments) {
    segments.forEach((segment) => {
      this.drawGateSills(segment);
      this.drawPathLabels(segment);
    });
  }

  isRiskyPath(type) {
    return isRiskPathType(type);
  }

  isChoiceSegment(segment) {
    return segment.type === 'TWO_PATHS' || segment.type === 'DUAL_RISK' || !!segment.isChoiceSegment;
  }

  gateAccent(type) {
    if (type === 'RISKY_HARD') return CONFIG.COLORS.HighRiskClay;
    if (this.isRiskyPath(type)) return CONFIG.COLORS.RiskApricot;
    return CONFIG.COLORS.SafeLawn;
  }

  pathLabel(type) {
    if (type === 'RISKY_HARD') return CONFIG.COLORS.HIGH_RISK_LABEL;
    if (this.isRiskyPath(type)) return CONFIG.COLORS.RISKY_LABEL;
    return CONFIG.COLORS.SAFE_LABEL;
  }

  gateHeightForPath(segment, path) {
    const row = (segment.obstacles || []).find((obs) => (
      Math.abs(obs.y - path.y) < 12
    ));
    if (row) return row.height;
    return Math.min(path.height, CONFIG.CHOICE_GATE_HEIGHT);
  }

  drawGateSills(segment) {
    if (!this.isChoiceSegment(segment)) return;

    (segment.paths || []).forEach((path) => {
      const gateH = this.gateHeightForPath(segment, path);
      this.garden.drawSill(path, gateH, this.gateAccent(path.type));
    });
  }

  drawPathLabels(segment) {
    if (segment.type === 'NORMAL' || segment.type === 'EMPTY') return;

    const labeled = new Set();
    const pathsByType = {};

    segment.paths.forEach((path) => {
      if (!pathsByType[path.type]) pathsByType[path.type] = [];
      pathsByType[path.type].push(path);
    });

    Object.keys(pathsByType).forEach((type) => {
      if (labeled.has(type)) return;
      labeled.add(type);

      const path = pathsByType[type].reduce((closest, current) => (
        current.y + current.height > closest.y + closest.height ? current : closest
      ));

      const isRisk = this.isRiskyPath(type);
      const reward = path.baseReward
        ?? CONFIG.REWARDS[type]
        ?? CONFIG.REWARDS[isRisk ? 'RISKY' : 'SAFE'];
      const gateH = this.gateHeightForPath(segment, path);
      const vis = this.garden.projectTrackRect(path.x, path.y, path.width, gateH);
      if (!vis) return;
      const revealH = this.garden.catH() * (CONFIG.VISUAL.CHOICE_GATEWAY_NEAR_CAT ?? 1.08)
        * (vis.uniformScale || 1);
      if (!this.garden.isWorldObjectFullyVisible(vis.x + vis.width / 2, vis.groundY, revealH)) return;
      const labelX = vis.x + vis.width / 2;
      const labelY = vis.y + vis.height + 22;
      const text = `+${reward}`;

      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.font = `700 22px ${FONT_FAMILY}`;
      const plateW = Math.max(56, this.ctx.measureText ? this.ctx.measureText(text).width + 22 : 60);
      const plateH = 28;
      this.garden.plate(labelX - plateW / 2, labelY - plateH / 2, plateW, plateH, 12);
      this.ctx.fillStyle = this.pathLabel(type);
      this.ctx.strokeStyle = CONFIG.COLORS.SkyPaper;
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(text, labelX, labelY);
      this.ctx.fillText(text, labelX, labelY);
      this.ctx.textBaseline = 'alphabetic';
    });
  }

  drawPlayer(player, feel = null) {
    const time = feel ? feel.time || 0 : 0;
    const pulse = feel ? feel.playerPulse || 0 : 0;
    const stretchY = 1 + pulse * 0.18;
    const stretchX = 1 - pulse * 0.1;
    const dir = player.moveDirection || 0;
    const lean = dir * 0.08;

    const shadow = CONFIG.VISUAL.CAT_SHADOW || {};
    this.garden.groundShadow(player.x, player.y + 16, shadow.RX ?? 20, shadow.RY ?? 8);

    const cycle = this.runFrameIndex(time);
    const bob = CONFIG.FEEL.PLAYER_BOB || 1.6;
    const squash = CONFIG.FEEL.PLAYER_RUN_SQUASH || 0;
    const even = cycle % 2 === 0;
    const stride = even ? bob : -bob * 0.45;

    this.ctx.save();
    // После возрождения кот мигает, пока неуязвим.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 8) % 2 === 1) {
      this.ctx.globalAlpha = 0.4;
    }
    this.ctx.translate(player.x, player.y);
    this.ctx.translate(0, stride);
    this.ctx.scale(stretchX, stretchY);
    if (squash) {
      this.ctx.scale(
        1 + (even ? -squash * 0.45 : squash * 0.35),
        1 + (even ? squash : -squash * 0.55)
      );
    }
    this.ctx.rotate(lean);

    if (this.playerSpriteReady) {
      const frames = this.runFrames.length ? this.runFrames : [this.playerSprite];
      const sprite = frames[this.runFrameIndex(time)] || this.playerSprite;
      if (sprite) {
        const layout = this.playerSpriteLayout();
        this.ctx.drawImage(
          sprite,
          layout.x,
          layout.y,
          layout.width,
          layout.height
        );
      }
    }

    this.ctx.restore();
  }

  drawParticles(particles) {
    if (!particles) return;
    particles.forEach((particle) => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    });
    this.ctx.globalAlpha = 1;
  }

  // Время суток: цветная вуаль («умножение»), тёплое свечение сверху, затемнение по краям и
  // светлячки поверх сада. HUD рисуется после и остаётся ярким. Днём ничего не рисуется.
  drawTimeOfDay(look, time = 0) {
    if (!look) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const tint = look.tint.map((value) => Math.round(value));
    ctx.save();
    if (tint.some((value) => value < 254)) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (look.wash.alpha > 0.005) {
      const [r, g, b] = look.wash.color.map((value) => Math.round(value));
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${look.wash.alpha})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (look.glow.alpha > 0.005 && typeof ctx.createLinearGradient === 'function') {
      const [r, g, b] = look.glow.color.map((value) => Math.round(value));
      const glow = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${look.glow.alpha})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h * 0.6);
    }
    if (look.vignette > 0.005 && typeof ctx.createRadialGradient === 'function') {
      const edge = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, h * 0.75);
      edge.addColorStop(0, 'rgba(12, 16, 40, 0)');
      edge.addColorStop(1, `rgba(12, 16, 40, ${look.vignette})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawFireflies(look.fireflies, time);
    ctx.restore();
  }

  // Светлячки над газоном по бокам дороги: плывут и мерцают. amount — сколько их (дробное число:
  // последний проявляется плавно). Положение зависит только от номера и времени.
  drawFireflies(amount, time) {
    if (!(amount > 0.05)) return;
    const ctx = this.ctx;
    const hash = (n) => {
      const x = Math.sin(n * 91.7 + 13.3) * 43758.5453;
      return x - Math.floor(x);
    };
    const count = Math.ceil(amount);
    for (let i = 0; i < count; i += 1) {
      const visible = Math.min(1, amount - i);
      const left = i % 2 === 0;
      const x = (left ? 10 + hash(i) * 130 : this.width - 140 + hash(i) * 130) + Math.sin(time * 0.6 + i * 2.1) * 16;
      const y = this.height * 0.3 + hash(i + 50) * this.height * 0.58 + Math.sin(time * 0.8 + i * 1.3) * 12;
      const twinkle = 0.35 + 0.65 * Math.sin(time * 2.2 + i * 1.7) ** 2;
      ctx.fillStyle = `rgba(255, 240, 150, ${0.16 * twinkle * visible})`;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 248, 190, ${0.9 * twinkle * visible})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Плашка нового этапа суток («ВЕЧЕР», «НОЧЬ»...) под HUD; alpha — плавное появление и уход.
  drawStageToast(text, alpha = 1) {
    if (!text || alpha <= 0) return;
    const ctx = this.ctx;
    ctx.font = `700 22px ${FONT_FAMILY}`;
    const measured = typeof ctx.measureText === 'function' ? ctx.measureText(text).width : 160;
    const width = Math.min(this.width - 48, measured + 48);
    const top = 124;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    this.garden.hudPill((this.width - width) / 2, top, width, 44);
    ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(text, this.width / 2, top + 30);
    ctx.restore();
  }

  drawFlash(feel) {
    if (!feel || feel.flash <= 0) return;
    this.ctx.fillStyle = feel.flashColor;
    this.ctx.globalAlpha = Math.min(1, feel.flash);
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = 1;
  }

  drawFloatingRewards(rewards) {
    this.ctx.save();
    this.ctx.textAlign = 'center';

    rewards.forEach((r) => {
      const isCoin = r.type === 'COIN';
      const isGraze = r.type === 'GRAZE';
      const isRisk = isRiskPathType(r.type);
      const alpha = Math.max(0, r.life / (r.maxLife || 1));
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = isCoin
        ? CONFIG.COLORS.COIN
        : (isRisk || isGraze ? CONFIG.COLORS.RISKY_LABEL : CONFIG.COLORS.SAFE_LABEL);
      const size = isRisk ? 26 : (isCoin || isGraze ? 18 : 20);
      // «Чуть не задел» всплывает у стены, на листве и цветах: светлая обводка держит его читаемым.
      if (isGraze) {
        this.ctx.strokeStyle = CONFIG.COLORS.SkyPaper;
        this.ctx.lineWidth = 4;
        this.ctx.lineJoin = 'round';
      }
      this.ctx.font = `700 ${size}px ${FONT_FAMILY}`;
      if (isGraze) this.ctx.strokeText(`+${r.value}`, r.x, r.y);
      this.ctx.fillText(`+${r.value}`, r.x, r.y);
      if (r.subtitle) {
        this.ctx.font = `700 13px ${FONT_FAMILY}`;
        if (isGraze) this.ctx.strokeText(r.subtitle, r.x, r.y + 16);
        this.ctx.fillText(r.subtitle, r.x, r.y + 16);
      }
    });

    this.ctx.restore();
  }

  drawHUD(score, multiplier, bestScore, riskStreak = 0, coins = 0, feel = null, muted = false, showSound = true, showPause = false) {
    const pulse = feel?.hudPulse || { streak: 0, multiplier: 0, coins: 0 };
    const ctx = this.ctx;
    // Области нажатия запоминаются при рисовании; на экране, где кнопки нет, она не нажимается.
    this.pauseButton = null;
    this.resumeButton = null;
    this.soundButtons = null;
    this.platformButtons = null;
    this.leaderboardButtons = null;
    const measure = (text, font) => {
      ctx.font = font;
      return ctx.measureText ? ctx.measureText(text).width : String(text).length * 8;
    };
    const top = 10;

    // --- Score / best pill (left) ---
    const scoreText = `${score}`;
    const bestText = t('hud.best', { n: bestScore });
    const scoreTextW = Math.max(
      measure(scoreText, `700 20px ${FONT_FAMILY}`),
      measure(bestText, `600 11px ${FONT_FAMILY}`)
    );
    const scoreIconR = 16;
    const scorePillH = 46;
    const scorePillW = 14 + scoreIconR * 2 + 8 + scoreTextW + 14;
    this.garden.hudPill(12, top, scorePillW, scorePillH);
    const scoreIconCX = 12 + 14 + scoreIconR;
    const scoreIconCY = top + scorePillH / 2;
    this.garden.hudPawIcon(scoreIconCX, scoreIconCY, scoreIconR);
    const scoreTextX = scoreIconCX + scoreIconR + 8;
    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.fillText(scoreText, scoreTextX, top + 22);
    ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    ctx.font = `600 11px ${FONT_FAMILY}`;
    ctx.fillText(bestText, scoreTextX, top + 37);

    // --- Right cluster: multiplier, streak, coins ---
    const pillH = 38;
    const pillY = top + (scorePillH - pillH) / 2;
    let cursorRight = this.width - 12;

    const maxed = multiplier >= CONFIG.MULTIPLIER_MAX;
    const multScale = 1 + (pulse.multiplier || 0) * (maxed ? 0.28 : 0.18);
    const multLabel = `x${multiplier.toFixed(1)}`;
    const multFont = `700 18px ${FONT_FAMILY}`;
    const multW = Math.max(64, measure(multLabel, multFont) + 26);
    const multX = cursorRight - multW;
    this.garden.hudPill(multX, pillY, multW, pillH);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.translate(multX + multW / 2, pillY + pillH / 2 + 6);
    ctx.scale(multScale, multScale);
    ctx.fillStyle = maxed ? CONFIG.COLORS.COIN : (multiplier > 1 ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_TEXT);
    ctx.font = multFont;
    ctx.fillText(multLabel, 0, 0);
    ctx.restore();
    cursorRight = multX - 8;

    const streakActive = riskStreak > 0;
    const streakScale = 1 + (pulse.streak || 0) * 0.2;
    const streakNumFont = `700 16px ${FONT_FAMILY}`;
    const streakLabelFont = `600 9px ${FONT_FAMILY}`;
    const streakIconR = 13;
    const streakTextW = Math.max(
      measure(t('hud.streak'), streakLabelFont),
      measure(`${riskStreak}`, streakNumFont)
    );
    const streakW = 10 + streakIconR * 2 + 6 + streakTextW + 12;
    const streakX = cursorRight - streakW;
    this.garden.hudPill(streakX, pillY, streakW, pillH);
    this.garden.hudStreakIcon(streakX + 10 + streakIconR, pillY + pillH / 2, streakIconR, streakActive);
    ctx.save();
    ctx.textAlign = 'left';
    const streakTextX = streakX + 10 + streakIconR * 2 + 6;
    ctx.translate(streakTextX, pillY + pillH / 2);
    ctx.scale(streakScale, streakScale);
    ctx.fillStyle = streakActive ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD;
    ctx.font = streakLabelFont;
    ctx.fillText(t('hud.streak'), 0, -6);
    ctx.fillStyle = streakActive ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_TEXT;
    ctx.font = streakNumFont;
    ctx.fillText(`${riskStreak}`, 0, 11);
    ctx.restore();
    cursorRight = streakX - 8;

    const coinScale = 1 + (pulse.coins || 0) * 0.16;
    const coinFont = `700 16px ${FONT_FAMILY}`;
    const coinIconR = 13;
    const coinLabel = `${coins}`;
    const coinTextW = measure(coinLabel, coinFont);
    const coinW = 10 + coinIconR * 2 + 6 + coinTextW + 12;
    const coinX = cursorRight - coinW;
    this.garden.hudPill(coinX, pillY, coinW, pillH);
    this.garden.hudCoinIcon(coinX + 10 + coinIconR, pillY + pillH / 2, coinIconR);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.translate(coinX + 10 + coinIconR * 2 + 6, pillY + pillH / 2 + 6);
    ctx.scale(coinScale, coinScale);
    ctx.fillStyle = CONFIG.COLORS.COIN;
    ctx.font = coinFont;
    ctx.fillText(coinLabel, 0, 0);
    ctx.restore();

    // --- Значок паузы: в свободном месте между счётом и монетами ---
    if (showPause) {
      const size = 46;
      const px = Math.min(12 + scorePillW + 10, coinX - size - 8);
      this.garden.hudPauseButton(px + size / 2, top + size / 2, size / 2);
      // Область нажатия с запасом под палец: на телефоне холст сжимается (≈ 0.7), нужно ≥ 44 px.
      this.pauseButton = { x: px - 12, y: top - 12, w: size + 24, h: size + 24 };
    }

    if (!showSound) return;
    ctx.textAlign = 'left';
    ctx.fillStyle = muted ? CONFIG.COLORS.UI_HUD : CONFIG.COLORS.UI_TEXT;
    ctx.font = `600 11px ${FONT_FAMILY}`;
    ctx.fillText(t(muted ? 'sound.off' : 'sound.on'), 20, this.height - 18);
  }

  // --- Экраны START и Game Over (Фаза 3): карточка и капсулы в стиле HUD ---

  screenCfg() {
    return CONFIG.VISUAL.SCREENS || {};
  }

  // Лёгкое затемнение вместо бледной кремовой заливки: сад остаётся ярким.
  dimScreen(alpha) {
    this.ctx.fillStyle = CONFIG.COLORS.InkBrown;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = 1;
  }

  // Строка по центру; если не влезает в maxWidth, шрифт уменьшается (запас под русский).
  fitText(text, x, y, weight, size, maxWidth, color) {
    const ctx = this.ctx;
    const minFont = this.screenCfg().MIN_FONT ?? 16;
    let font = size;
    ctx.font = `${weight} ${font}px ${FONT_FAMILY}`;
    const measured = typeof ctx.measureText === 'function' ? ctx.measureText(text).width : 0;
    if (measured > maxWidth) {
      font = Math.max(minFont, Math.floor(size * (maxWidth / measured)));
      ctx.font = `${weight} ${font}px ${FONT_FAMILY}`;
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }

  // Капсула как в HUD: жёсткая тень ShadowDust, заливка, коричневая обводка.
  screenPill(cx, cy, w, h, fill) {
    const ctx = this.ctx;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.fillStyle = CONFIG.COLORS.ShadowDust;
    this.garden.roundedRectPath(x + 3, y + 4, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = fill;
    this.garden.roundedRectPath(x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.COLORS.InkBrown;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Сидящий Loaf стоит на верхнем крае карточки.
  drawSitLoaf(groundY) {
    if (!this.playerFrontReady || !this.playerFrontSprite) return;
    const layout = this.spriteLayout(CONFIG.VISUAL.LOAF_SIT);
    this.ctx.drawImage(
      this.playerFrontSprite,
      this.width / 2 + layout.x,
      groundY + layout.y,
      layout.width,
      layout.height
    );
  }

  drawStartScreen(muted = false, volume = 0.5, platform = {}) {
    const cfg = this.screenCfg();
    const cx = this.width / 2;
    const cardX = cfg.CARD_X ?? 36;
    const cardW = cfg.CARD_W ?? this.width - cardX * 2;
    const textW = cardW - (cfg.TEXT_PAD ?? 28) * 2;
    const cardH = 262;
    const cardY = 380;

    this.dimScreen(cfg.DIM_START ?? 0.12);
    this.garden.plate(cardX, cardY, cardW, cardH, 26);
    this.drawSitLoaf(cardY + 14);

    this.fitText(t('start.title'), cx, cardY + 78, 700, 52, textW, CONFIG.COLORS.UI_TEXT);

    this.screenPill(cx, cardY + 136, 320, 64, CONFIG.COLORS.CoinAmber);
    this.fitText(t('start.play'), cx, cardY + 146, 700, 28, 280, CONFIG.COLORS.UI_TEXT);

    this.fitText(t('start.controls'), cx, cardY + 208, 600, 20, textW, CONFIG.COLORS.UI_HUD);

    this.drawSoundControls(cx, cardY + cardH + 44, muted, volume);
    this.drawPlatformButtons(cx, cardY + cardH + 106, platform);
  }

  // Кнопки под звуком: «магазин», «таблица лидеров» и «ярлык». «Лидеры» и «ярлык» рисуются, только если
  // платформа их разрешает. По две в ряд. Области нажатия — для Game.handlePlatformTap (с запасом под палец).
  drawPlatformButtons(cx, cy, show = {}) {
    const items = [];
    if (show.shop) items.push('shop');
    if (show.leaderboard) items.push('leaderboard');
    if (show.shortcut) items.push('shortcut');
    this.platformButtons = null;
    if (!items.length) return;
    const rows = [];
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
    const gap = 14;
    const h = 44;
    const rowStep = 62;
    this.platformButtons = {};
    rows.forEach((row, rowIndex) => {
      const y = cy + rowIndex * rowStep;
      const w = row.length === 1 ? 250 : 200;
      const left = cx - (w * row.length + gap * (row.length - 1)) / 2;
      row.forEach((name, index) => {
        const x = left + index * (w + gap) + w / 2;
        this.screenPill(x, y, w, h, CONFIG.COLORS.SkyPaper);
        if (name === 'leaderboard') {
          this.garden.hudTrophyIcon(x - w / 2 + 28, y, 14);
          this.fitText(t('leaderboard.button'), x + 14, y + 7, 600, 19, w - 76, CONFIG.COLORS.UI_TEXT);
        } else if (name === 'shop') {
          this.garden.hudCoinIcon(x - w / 2 + 28, y, 14);
          this.fitText(t('shop.button'), x + 14, y + 7, 600, 19, w - 76, CONFIG.COLORS.UI_TEXT);
        } else {
          this.fitText(t('shortcut.button'), x, y + 7, 600, 19, w - 28, CONFIG.COLORS.UI_TEXT);
        }
        this.platformButtons[name] = { x: x - w / 2 - 4, y: y - h / 2 - 8, w: w + 8, h: h + 16 };
      });
    });
  }

  // Какая кнопка платформы под точкой (логические координаты), или null.
  hitPlatformButton(x, y) {
    for (const [name, r] of Object.entries(this.platformButtons || {})) {
      if (Renderer.inRect(r, x, y)) return name;
    }
    return null;
  }

  // Окно таблицы лидеров поверх экрана. board: { status: 'loading' | 'ready' | 'empty' | 'error',
  // entries, authorized, signingIn }. Для неавторизованного игрока — кнопка «войти».
  drawLeaderboard(board) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cardX = 36;
    const cardW = this.width - cardX * 2;
    const cardY = 80;
    const cardH = 800;
    this.leaderboardButtons = {};

    this.dimScreen(0.45);
    this.garden.plate(cardX, cardY, cardW, cardH, 26);
    this.fitText(t('leaderboard.title'), cx, cardY + 62, 700, 40, cardW - 56, CONFIG.COLORS.UI_TEXT);

    const rowTop = cardY + 112;
    const step = 32;
    const statusKey = { loading: 'leaderboard.loading', empty: 'leaderboard.empty', error: 'leaderboard.error' }[board?.status];
    if (statusKey) {
      this.fitText(t(statusKey), cx, rowTop + 120, 600, 22, cardW - 56, CONFIG.COLORS.UI_HUD);
    } else {
      let row = 0;
      for (const entry of board.entries.slice(0, 14)) {
        if (entry.gapBefore) {
          this.fitText('…', cx, rowTop + row * step + 6, 700, 22, 40, CONFIG.COLORS.UI_HUD);
          row += 1;
        }
        const y = rowTop + row * step;
        if (entry.isYou) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = CONFIG.COLORS.CoinAmber;
          this.garden.roundedRectPath(cardX + 14, y - 22, cardW - 28, 31, 15);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.font = `700 20px ${FONT_FAMILY}`;
        ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
        ctx.textAlign = 'right';
        ctx.fillText(`${entry.rank}`, cardX + 70, y);
        const scoreText = `${entry.score}`;
        ctx.fillText(scoreText, cardX + cardW - 28, y);
        const scoreWidth = typeof ctx.measureText === 'function' ? ctx.measureText(scoreText).width : 60;
        const label = entry.name || t(entry.isYou ? 'leaderboard.you' : 'leaderboard.player');
        const room = cardW - 98 - 28 - scoreWidth - 16;
        ctx.font = `${entry.isYou ? 700 : 600} 20px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.fillText(this.cutToWidth(label, room), cardX + 88, y);
        row += 1;
      }
    }

    // Не вошедший игрок видит таблицу, но в неё не попадает: предлагаем войти.
    const needsSignIn = board?.authorized === false && (board.status === 'ready' || board.status === 'empty');
    if (needsSignIn) {
      this.fitText(t('leaderboard.signinHint'), cx, cardY + cardH - 168, 600, 18, cardW - 56, CONFIG.COLORS.UI_HUD);
      this.screenPill(cx, cardY + cardH - 120, 260, 52, CONFIG.COLORS.SafeLawn);
      this.fitText(board.signingIn ? '…' : t('leaderboard.signin'), cx, cardY + cardH - 111, 700, 22, 230, CONFIG.COLORS.UI_TEXT);
      this.leaderboardButtons.signin = { x: cx - 134, y: cardY + cardH - 150, w: 268, h: 60 };
    }

    this.screenPill(cx, cardY + cardH - 52, 240, 56, CONFIG.COLORS.CoinAmber);
    this.fitText(t('leaderboard.close'), cx, cardY + cardH - 43, 700, 24, 210, CONFIG.COLORS.UI_TEXT);
    this.leaderboardButtons.close = { x: cx - 124, y: cardY + cardH - 84, w: 248, h: 64 };
  }

  // Окно магазина поверх экрана. shop: { skins: [{ id, price, owned, selected }], balance, message }.
  // Сетка 2 × 4: превью кота в окраске, название и «надето» / «куплено» / цена. Области нажатия — hitShopButton.
  drawShop(shop) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cardX = 36;
    const cardW = this.width - cardX * 2;
    const cardY = 40;
    const cardH = 880;
    this.shopButtons = { close: null, skins: [] };

    this.dimScreen(0.45);
    this.garden.plate(cardX, cardY, cardW, cardH, 26);
    this.fitText(t('shop.title'), cx, cardY + 58, 700, 40, cardW - 56, CONFIG.COLORS.UI_TEXT);

    // Баланс: монетка и число.
    const balanceY = cardY + 104;
    this.screenPill(cx, balanceY, 170, 42, CONFIG.COLORS.FloorSand);
    this.garden.hudCoinIcon(cx - 85 + 26, balanceY, 14);
    this.fitText(`${shop.balance}`, cx + 14, balanceY + 8, 700, 24, 100, CONFIG.COLORS.UI_TEXT);

    // Подсказка; когда монет не хватило — на её месте надпись «не хватает N».
    if (shop.message) {
      this.screenPill(cx, cardY + 150, cardW - 60, 36, CONFIG.COLORS.RiskApricot);
      this.fitText(shop.message, cx, cardY + 157, 700, 18, cardW - 90, CONFIG.COLORS.UI_TEXT);
    } else {
      this.fitText(t('shop.hint'), cx, cardY + 157, 600, 17, cardW - 56, CONFIG.COLORS.UI_HUD);
    }

    const cols = 2;
    const gap = 14;
    const cellW = (cardW - 28 - gap) / cols;
    const cellH = 142;
    const rowStep = 152;
    const left = cardX + 14;
    const top = cardY + 184;
    shop.skins.forEach((skin, index) => {
      const x = left + (index % cols) * (cellW + gap);
      const y = top + Math.floor(index / cols) * rowStep;
      ctx.fillStyle = CONFIG.COLORS.ShadowDust;
      this.garden.roundedRectPath(x + 3, y + 4, cellW, cellH, 18);
      ctx.fill();
      ctx.fillStyle = CONFIG.COLORS.FloorSand;
      this.garden.roundedRectPath(x, y, cellW, cellH, 18);
      ctx.fill();
      if (skin.selected) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = CONFIG.COLORS.CoinAmber;
        this.garden.roundedRectPath(x, y, cellW, cellH, 18);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = CONFIG.COLORS.InkBrown;
      ctx.lineWidth = skin.selected ? 4.5 : 3;
      ctx.lineJoin = 'round';
      this.garden.roundedRectPath(x, y, cellW, cellH, 18);
      ctx.stroke();

      // Кот в окраске скина (пока картинка грузится — тёплое пятно на её месте).
      const previewW = 52;
      const previewH = 122;
      const previewX = x + 12;
      const previewY = y + 10;
      const preview = this.skinPreviews?.get(skin.id);
      if (preview?.ready) {
        ctx.drawImage(preview.image, previewX, previewY, previewW, previewH);
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = CONFIG.COLORS.ShadowDust;
        ctx.beginPath();
        ctx.ellipse(previewX + previewW / 2, previewY + previewH / 2, previewW / 2, previewH / 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const textW = cellW - 80;
      const textX = x + 70 + textW / 2;
      this.fitText(t(`skin.${skin.id}`), textX, y + 46, 700, 21, textW, CONFIG.COLORS.UI_TEXT);
      const statusY = y + 98;
      if (skin.selected) {
        this.screenPill(textX, statusY, textW, 38, CONFIG.COLORS.SafeLawn);
        this.fitText(t('shop.selected'), textX, statusY + 6, 700, 17, textW - 16, CONFIG.COLORS.UI_TEXT);
      } else if (skin.owned) {
        this.screenPill(textX, statusY, textW, 38, CONFIG.COLORS.SkyPaper);
        this.fitText(t('shop.owned'), textX, statusY + 6, 700, 17, textW - 16, CONFIG.COLORS.UI_TEXT);
      } else {
        const affordable = shop.balance >= skin.price;
        this.screenPill(textX, statusY, textW, 38, affordable ? CONFIG.COLORS.CoinAmber : CONFIG.COLORS.SkyPaper);
        this.garden.hudCoinIcon(textX - textW / 2 + 22, statusY, 12);
        this.fitText(`${skin.price}`, textX + 12, statusY + 8, 700, 22, textW - 56, CONFIG.COLORS.UI_TEXT);
      }
      this.shopButtons.skins.push({ id: skin.id, x, y, w: cellW, h: cellH });
    });

    this.screenPill(cx, cardY + cardH - 48, 240, 56, CONFIG.COLORS.CoinAmber);
    this.fitText(t('shop.close'), cx, cardY + cardH - 39, 700, 24, 210, CONFIG.COLORS.UI_TEXT);
    this.shopButtons.close = { x: cx - 124, y: cardY + cardH - 80, w: 248, h: 64 };
  }

  // Что нажато в окне магазина: { type: 'close' }, { type: 'skin', id } или null.
  hitShopButton(x, y) {
    const buttons = this.shopButtons;
    if (!buttons) return null;
    if (Renderer.inRect(buttons.close, x, y)) return { type: 'close' };
    const cell = buttons.skins.find((r) => Renderer.inRect(r, x, y));
    return cell ? { type: 'skin', id: cell.id } : null;
  }

  // Строка, обрезанная до ширины maxWidth (px) с многоточием.
  cutToWidth(text, maxWidth) {
    const ctx = this.ctx;
    if (typeof ctx.measureText !== 'function' || ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  // Какая кнопка окна таблицы лидеров под точкой: 'close', 'signin' или null.
  hitLeaderboardButton(x, y) {
    for (const [name, r] of Object.entries(this.leaderboardButtons || {})) {
      if (Renderer.inRect(r, x, y)) return name;
    }
    return null;
  }

  // Подсказка у первой развилки: одна строка в капсуле под HUD. Правило игры («шире — надёжнее,
  // уже — больше очков») игрок видит ровно тогда, когда перед ним появляется выбор.
  drawChoiceHint(text) {
    const ctx = this.ctx;
    const textMax = this.width - 48 - 36; // ширина строки: экран минус поля и отступы капсулы
    let font = 20;
    ctx.font = `700 ${font}px ${FONT_FAMILY}`;
    let measured = typeof ctx.measureText === 'function' ? ctx.measureText(text).width : textMax;
    if (measured > textMax) {
      font = Math.max(14, Math.floor(font * (textMax / measured)));
      ctx.font = `700 ${font}px ${FONT_FAMILY}`;
      measured = Math.min(textMax, ctx.measureText(text).width);
    }
    const width = measured + 36;
    const cx = this.width / 2;
    const top = 74;
    this.garden.hudPill(cx - width / 2, top, width, 40);
    ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, top + 27);
  }

  // Звук на экранах: [−] капсула «ЗВУК n%» (нажатие включает и выключает) [+].
  // Области нажатия запоминаются для Game.handleSoundTap (с запасом под палец).
  drawSoundControls(cx, cy, muted, volume = 0.5) {
    const percent = Math.round((Number.isFinite(volume) ? volume : 0.5) * 100);
    const label = muted ? t('sound.off') : t('sound.level', { n: percent });
    this.screenPill(cx, cy, 210, 44, CONFIG.COLORS.SkyPaper);
    this.fitText(label, cx, cy + 7, 600, 20, 184, CONFIG.COLORS.UI_TEXT);
    const gap = 142;
    for (const [sign, x] of [['−', cx - gap], ['+', cx + gap]]) {
      this.screenPill(x, cy, 52, 44, CONFIG.COLORS.SkyPaper);
      this.fitText(sign, x, cy + 10, 700, 30, 40, CONFIG.COLORS.UI_TEXT);
    }
    this.soundButtons = {
      mute: { x: cx - 105, y: cy - 28, w: 210, h: 56 },
      minus: { x: cx - gap - 34, y: cy - 30, w: 68, h: 60 },
      plus: { x: cx + gap - 34, y: cy - 30, w: 68, h: 60 }
    };
  }

  // Какая кнопка звука под точкой (логические координаты), или null.
  hitSoundButton(x, y) {
    for (const [name, r] of Object.entries(this.soundButtons || {})) {
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return name;
    }
    return null;
  }

  static inRect(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // Значок паузы в HUD под точкой?
  hitPauseButton(x, y) {
    return Renderer.inRect(this.pauseButton, x, y);
  }

  // Кнопка «продолжить» на экране паузы под точкой?
  hitResumeButton(x, y) {
    return Renderer.inRect(this.resumeButton, x, y);
  }

  // Экран паузы: карточка как на других экранах — название, счёт, рекорд, «продолжить»
  // и настройки звука под карточкой. Мир за карточкой стоит на месте.
  drawPause(score, bestScore, muted = false, volume = 0.5) {
    const cfg = this.screenCfg();
    const cx = this.width / 2;
    const cardX = cfg.CARD_X ?? 36;
    const cardW = cfg.CARD_W ?? this.width - cardX * 2;
    const textW = cardW - (cfg.TEXT_PAD ?? 28) * 2;
    const cardH = 392;
    const cardY = 330;

    this.dimScreen(cfg.DIM_PAUSE ?? 0.28);
    this.garden.plate(cardX, cardY, cardW, cardH, 26);
    this.drawSitLoaf(cardY + 14);

    this.fitText(t('pause.title'), cx, cardY + 76, 700, 52, textW, CONFIG.COLORS.UI_TEXT);
    this.fitText(`${score}`, cx, cardY + 160, 700, 68, textW, CONFIG.COLORS.UI_TEXT);
    this.fitText(t('over.score'), cx, cardY + 188, 600, 20, textW, CONFIG.COLORS.UI_HUD);

    const pillW = 360;
    const bestY = cardY + 236;
    this.screenPill(cx, bestY, pillW, 46, CONFIG.COLORS.SkyPaper);
    this.garden.hudPawIcon(cx - pillW / 2 + 28, bestY, 15);
    this.fitText(t('over.best', { n: bestScore }), cx + 14, bestY + 7, 700, 21, pillW - 84, CONFIG.COLORS.UI_TEXT);

    const resumeW = 340;
    const resumeH = 62;
    const resumeY = cardY + 322;
    this.screenPill(cx, resumeY, resumeW, resumeH, CONFIG.COLORS.CoinAmber);
    this.fitText(t('pause.resume'), cx, resumeY + 9, 700, 26, resumeW - 40, CONFIG.COLORS.UI_TEXT);
    this.resumeButton = { x: cx - resumeW / 2, y: resumeY - resumeH / 2, w: resumeW, h: resumeH };

    this.drawSoundControls(cx, cardY + cardH + 44, muted, volume);
  }

  // Значок «видео» на кнопках рекламы: игрок заранее видит, что это реклама.
  drawAdIcon(cx, cy, size) {
    const ctx = this.ctx;
    ctx.fillStyle = CONFIG.COLORS.SkyPaper;
    this.garden.roundedRectPath(cx - size / 2, cy - size * 0.38, size, size * 0.76, size * 0.2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.COLORS.InkBrown;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = CONFIG.COLORS.InkBrown;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.14, cy - size * 0.2);
    ctx.lineTo(cx + size * 0.22, cy);
    ctx.lineTo(cx - size * 0.14, cy + size * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // Кнопка «за рекламу»: капсула, значок видео слева, текст.
  drawAdButton(cx, cy, w, h, fill, label) {
    this.screenPill(cx, cy, w, h, fill);
    this.drawAdIcon(cx - w / 2 + 34, cy, 30);
    this.fitText(label, cx + 18, cy + 8, 700, 22, w - 92, CONFIG.COLORS.UI_TEXT);
  }

  // Какая кнопка экрана проигрыша под точкой (логические координаты), или null.
  hitGameOverButton(x, y) {
    for (const [name, r] of Object.entries(this.gameOverButtons || {})) {
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return name;
    }
    return null;
  }

  drawGameOver(score, bestScore, coins = 0, age = 1, extras = {}) {
    const cfg = this.screenCfg();
    const fade = Math.min(1, age / 0.25);
    const isNewBest = !!extras.isNewBest;
    const offerRevive = !!extras.offerRevive;
    const offerDouble = !!extras.offerDouble;
    const offers = (offerRevive ? 1 : 0) + (offerDouble ? 1 : 0);
    const cx = this.width / 2;
    const cardX = cfg.CARD_X ?? 36;
    const cardW = cfg.CARD_W ?? this.width - cardX * 2;
    const textW = cardW - (cfg.TEXT_PAD ?? 28) * 2;
    const offerStep = 66;
    const cardH = 466 + offers * offerStep;
    // С двумя предложениями за рекламу карточка выше, чтобы под ней остались звук и кнопки магазина и лидеров.
    const cardY = 320 - offers * 48;
    this.gameOverButtons = {};

    this.dimScreen((cfg.DIM_GAME_OVER ?? 0.28) * fade);
    this.ctx.globalAlpha = fade;
    this.garden.plate(cardX, cardY, cardW, cardH, 26);
    this.drawSitLoaf(cardY + 14);
    this.ctx.globalAlpha = fade;

    this.fitText(t('over.title'), cx, cardY + 74, 700, 48, textW, CONFIG.COLORS.UI_TEXT);

    if (isNewBest) {
      const pulse = 1 + 0.06 * Math.sin(age * 10);
      this.ctx.save();
      this.ctx.translate(cx, cardY + 116);
      this.ctx.scale(pulse, pulse);
      this.screenPill(0, 0, 240, 42, CONFIG.COLORS.CoinAmber);
      this.fitText(t('over.newBest'), 0, 8, 700, 24, 210, CONFIG.COLORS.UI_TEXT);
      this.ctx.restore();
      this.ctx.globalAlpha = fade;
    } else {
      const pointsToBest = Math.max(1, bestScore + 1 - score);
      this.fitText(t('over.toBest', { n: pointsToBest }), cx, cardY + 124, 700, 22, textW, CONFIG.COLORS.UI_HUD);
    }

    this.fitText(`${score}`, cx, cardY + 204, 700, 68, textW, CONFIG.COLORS.UI_TEXT);
    this.fitText(t('over.score'), cx, cardY + 232, 600, 20, textW, CONFIG.COLORS.UI_HUD);

    // Две капсулы друг под другом: рекорд (лапка) и монеты (монетка), как в HUD.
    // Широкие, чтобы влезли и русские надписи.
    const pillW = 360;
    const pillX = cx - pillW / 2;
    const rows = [
      [cardY + 276, t('over.best', { n: bestScore }), 'paw'],
      [cardY + 334, t('over.coins', { n: coins }), 'coin']
    ];
    for (const [pillY, label, icon] of rows) {
      this.screenPill(cx, pillY, pillW, 46, CONFIG.COLORS.SkyPaper);
      if (icon === 'paw') this.garden.hudPawIcon(pillX + 28, pillY, 15);
      else this.garden.hudCoinIcon(pillX + 28, pillY, 15);
      this.fitText(label, cx + 14, pillY + 7, 700, 21, pillW - 84, CONFIG.COLORS.UI_TEXT);
    }

    // Кнопки «за рекламу» — только если реклама доступна (добровольно, по нажатию).
    let rowY = cardY + 404;
    const addButton = (name, fill, label) => {
      const w = 380;
      const h = 56;
      this.drawAdButton(cx, rowY, w, h, fill, label);
      this.gameOverButtons[name] = { x: cx - w / 2, y: rowY - h / 2, w, h };
      rowY += offerStep;
    };
    if (offerRevive) addButton('revive', CONFIG.COLORS.SafeLawn, t('over.revive'));
    if (offerDouble) addButton('double', CONFIG.COLORS.SkyPaper, t('over.double'));

    this.screenPill(cx, rowY + 8, 340, 62, CONFIG.COLORS.CoinAmber);
    this.fitText(t('over.restart'), cx, rowY + 17, 700, 26, 300, CONFIG.COLORS.UI_TEXT);

    this.drawSoundControls(cx, cardY + cardH + 44, extras.muted, extras.volume);
    this.drawPlatformButtons(cx, cardY + cardH + 104, { shop: true, leaderboard: extras.leaderboard });
    this.ctx.globalAlpha = 1;
  }
}
