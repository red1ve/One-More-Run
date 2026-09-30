import { t } from '../localization/i18n.js';
import { CONFIG, isRiskPathType } from '../config.js';
import { GardenArt } from './GardenArt.js';

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
    this.playerFrontSprite = this.bindSpriteImage(createImage(), LOAF_SIT_URL, 'front');
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

  drawDeferredWorld() {
    this.garden.drawDeferredWorld();
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

  gateFill(type) {
    if (type === 'RISKY_HARD') return CONFIG.COLORS.HighRiskClay;
    if (this.isRiskyPath(type)) return CONFIG.COLORS.RiskApricot;
    if (type === 'SAFE') return CONFIG.COLORS.PlanterWood;
    return CONFIG.COLORS.PlanterWood;
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

  pathsOnRow(segment, obs) {
    return (segment.paths || []).filter((path) => Math.abs(path.y - obs.y) < 12);
  }

  abuttingPaths(segment, obs) {
    const epsilon = 2;
    const row = this.pathsOnRow(segment, obs);
    return row.filter((path) => (
      Math.abs(obs.x + obs.width - path.x) < epsilon
      || Math.abs(obs.x - (path.x + path.width)) < epsilon
    ));
  }

  drawGateSills(segment) {
    if (!this.isChoiceSegment(segment)) return;

    (segment.paths || []).forEach((path) => {
      const gateH = this.gateHeightForPath(segment, path);
      this.garden.drawSill(path, gateH, this.gateAccent(path.type));
    });
  }

  drawObstacles(segment) {
    const choice = this.isChoiceSegment(segment);
    const family = segment.visualObstacleType || this.garden.obstacleFamilyFor(segment);
    const familySeed = segment.visualObstacleSeed
      || Math.abs(Math.round((segment.id || 1) * 13 + String(segment.type || '').length * 7));
    const classScale = Number.isFinite(segment.visualObstacleScale)
      ? segment.visualObstacleScale
      : 1;
    const sprite = this.garden.obstacleSpriteFor(segment);
    (segment.obstacles || []).forEach((obs) => {
      const neighbors = choice ? this.abuttingPaths(segment, obs) : [];
      this.garden.drawPlanter(obs, neighbors, family, familySeed, classScale, sprite);
    });
  }

  drawCoins(segment) {
    if (!segment.coins) return;
    segment.coins.forEach((coin) => this.garden.drawCoin(coin));
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
      const isRisk = isRiskPathType(r.type);
      const alpha = Math.max(0, r.life / (r.maxLife || 1));
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = isCoin
        ? CONFIG.COLORS.COIN
        : (isRisk ? CONFIG.COLORS.RISKY_LABEL : CONFIG.COLORS.SAFE_LABEL);
      const size = isRisk ? 26 : (isCoin ? 18 : 20);
      this.ctx.font = `700 ${size}px ${FONT_FAMILY}`;
      this.ctx.fillText(`+${r.value}`, r.x, r.y);
      if (r.subtitle) {
        this.ctx.font = `700 13px ${FONT_FAMILY}`;
        this.ctx.fillText(r.subtitle, r.x, r.y + 16);
      }
    });

    this.ctx.restore();
  }

  drawHUD(score, multiplier, bestScore, riskStreak = 0, coins = 0, feel = null, muted = false, showSound = true) {
    const pulse = feel?.hudPulse || { streak: 0, multiplier: 0, coins: 0 };
    const ctx = this.ctx;
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

  drawStartScreen(muted = false, showFirstRunHints = false) {
    const cfg = this.screenCfg();
    const cx = this.width / 2;
    const cardX = cfg.CARD_X ?? 36;
    const cardW = cfg.CARD_W ?? this.width - cardX * 2;
    const textW = cardW - (cfg.TEXT_PAD ?? 28) * 2;
    const cardH = showFirstRunHints ? 374 : 262;
    const cardY = showFirstRunHints ? 340 : 380;

    this.dimScreen(cfg.DIM_START ?? 0.12);
    this.garden.plate(cardX, cardY, cardW, cardH, 26);
    this.drawSitLoaf(cardY + 14);

    this.fitText(t('start.title'), cx, cardY + 78, 700, 52, textW, CONFIG.COLORS.UI_TEXT);

    this.screenPill(cx, cardY + 136, 320, 64, CONFIG.COLORS.CoinAmber);
    this.fitText(t('start.play'), cx, cardY + 146, 700, 28, 280, CONFIG.COLORS.UI_TEXT);

    this.fitText(t('start.controls'), cx, cardY + 208, 600, 20, textW, CONFIG.COLORS.UI_HUD);

    if (showFirstRunHints) {
      this.fitText(t('start.hintChoice'), cx, cardY + 258, 700, 21, textW, CONFIG.COLORS.UI_TEXT);
      this.fitText(t('start.hintStreak'), cx, cardY + 294, 600, 20, textW, CONFIG.COLORS.UI_HUD);
      this.fitText(t('start.hintCoins'), cx, cardY + 326, 600, 20, textW, CONFIG.COLORS.UI_HUD);
    }

    const soundY = cardY + cardH + 44;
    this.screenPill(cx, soundY, 210, 44, CONFIG.COLORS.SkyPaper);
    this.fitText(t(muted ? 'sound.off' : 'sound.on'), cx, soundY + 7, 600, 20, 184, CONFIG.COLORS.UI_TEXT);
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
    const cardY = 320 - offers * 30;
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

    const soundY = cardY + cardH + 44;
    this.screenPill(cx, soundY, 210, 44, CONFIG.COLORS.SkyPaper);
    this.fitText(t(extras.muted ? 'sound.off' : 'sound.on'), cx, soundY + 7, 600, 20, 184, CONFIG.COLORS.UI_TEXT);
    this.ctx.globalAlpha = 1;
  }
}
