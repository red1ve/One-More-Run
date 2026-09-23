import { CONFIG, isRiskPathType } from '../config.js';
import { GardenArt } from './GardenArt.js';

const LOAF_FRONT_URL = new URL('../../assets/characters/loaf-front.svg', import.meta.url).href;
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
    this.playerFrontSprite = this.bindSpriteImage(createImage(), LOAF_FRONT_URL, 'front');
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
      this.ctx.font = 'bold 22px system-ui, sans-serif';
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

    this.garden.groundShadow(player.x, player.y + 16, 20, 8);

    const cycle = this.runFrameIndex(time);
    const bob = CONFIG.FEEL.PLAYER_BOB || 1.6;
    const squash = CONFIG.FEEL.PLAYER_RUN_SQUASH || 0;
    const even = cycle % 2 === 0;
    const stride = even ? bob : -bob * 0.45;

    this.ctx.save();
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
      this.ctx.font = `bold ${size}px system-ui, sans-serif`;
      this.ctx.fillText(`+${r.value}`, r.x, r.y);
      if (r.subtitle) {
        this.ctx.font = 'bold 13px system-ui, sans-serif';
        this.ctx.fillText(r.subtitle, r.x, r.y + 16);
      }
    });

    this.ctx.restore();
  }

  drawHUD(score, multiplier, bestScore, riskStreak = 0, coins = 0, feel = null, muted = false) {
    const pulse = feel?.hudPulse || { streak: 0, multiplier: 0, coins: 0 };
    const measure = (text, font) => {
      this.ctx.font = font;
      return this.ctx.measureText ? this.ctx.measureText(text).width : String(text).length * 8;
    };

    this.garden.badge(12, 8, 96, 44, 10);
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.font = 'bold 18px system-ui, sans-serif';
    this.ctx.fillText(`${score}`, 22, 28);
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.font = '9px system-ui, sans-serif';
    this.ctx.fillText('SCORE', 22, 40);
    this.ctx.fillText(`BEST ${bestScore}`, 22, 50);

    const coinScale = 1 + (pulse.coins || 0) * 0.18;
    const coinLabel = `COINS ${coins}`;
    const coinW = Math.max(86, measure(coinLabel, 'bold 13px system-ui, sans-serif') + 18);
    this.garden.badge(12, 56, coinW, 22, 10);
    this.ctx.save();
    this.ctx.translate(22, 71);
    this.ctx.scale(coinScale, coinScale);
    this.ctx.fillStyle = CONFIG.COLORS.COIN;
    this.ctx.font = 'bold 13px system-ui, sans-serif';
    this.ctx.fillText(coinLabel, 0, 0);
    this.ctx.restore();

    this.ctx.textAlign = 'right';
    const streakActive = riskStreak > 0;
    const streakScale = 1 + (pulse.streak || 0) * 0.22;
    const streakLabel = `STREAK ${riskStreak}`;
    const streakW = Math.max(96, measure(streakLabel, 'bold 14px system-ui, sans-serif') + 18);
    this.garden.badge(this.width - 10 - streakW, 8, streakW, 22, 10);
    this.ctx.save();
    this.ctx.translate(this.width - 20, 24);
    this.ctx.scale(streakScale, streakScale);
    this.ctx.fillStyle = streakActive ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD;
    this.ctx.font = 'bold 14px system-ui, sans-serif';
    this.ctx.fillText(streakLabel, 0, 0);
    this.ctx.restore();

    const maxed = multiplier >= CONFIG.MULTIPLIER_MAX;
    const multScale = 1 + (pulse.multiplier || 0) * (maxed ? 0.32 : 0.2);
    const multLabel = `SCORE x${multiplier.toFixed(1)}`;
    const multW = Math.max(108, measure(multLabel, 'bold 16px system-ui, sans-serif') + 18);
    this.garden.badge(this.width - 10 - multW, 34, multW, 24, 10);
    this.ctx.save();
    this.ctx.translate(this.width - 20, 51);
    this.ctx.scale(multScale, multScale);
    this.ctx.fillStyle = maxed ? CONFIG.COLORS.COIN : (multiplier > 1 ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD);
    this.ctx.font = 'bold 16px system-ui, sans-serif';
    this.ctx.fillText(multLabel, 0, 0);
    this.ctx.restore();

    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = muted ? CONFIG.COLORS.UI_HUD : CONFIG.COLORS.UI_TEXT;
    this.ctx.font = '11px system-ui, sans-serif';
    this.ctx.fillText(muted ? 'M MUTED' : 'M SOUND', 20, this.height - 18);
  }

  drawStartScreen(muted = false, showFirstRunHints = false) {
    this.ctx.fillStyle = CONFIG.COLORS.OVERLAY;
    this.ctx.globalAlpha = 0.82;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = 1;

    const panelH = showFirstRunHints ? 318 : 214;
    this.garden.plate(this.width / 2 - 214, this.height / 2 - 118, 428, panelH, 16);

    if (this.playerFrontReady && this.playerFrontSprite) {
      const layout = this.spriteLayout(CONFIG.VISUAL.LOAF_FRONT);
      this.ctx.drawImage(
        this.playerFrontSprite,
        this.width / 2 + layout.x,
        this.height / 2 - 168 + layout.y,
        layout.width,
        layout.height
      );
    }

    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.textAlign = 'center';

    this.ctx.font = 'bold 48px system-ui, sans-serif';
    this.ctx.fillText('ONE MORE RUN', this.width / 2, this.height / 2 - 70);

    this.ctx.font = '20px system-ui, sans-serif';
    this.ctx.fillText('TAP TO START', this.width / 2, this.height / 2 + 15);

    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.font = '15px system-ui, sans-serif';
    this.ctx.fillText('A/D or ←/→  •  TAP LEFT/RIGHT', this.width / 2, this.height / 2 + 50);

    if (showFirstRunHints) {
      this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
      this.ctx.font = 'bold 15px system-ui, sans-serif';
      this.ctx.fillText('SAFE = SURVIVE  •  RISK = BIG SCORE', this.width / 2, this.height / 2 + 88);
      this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
      this.ctx.font = '14px system-ui, sans-serif';
      this.ctx.fillText('RISK BUILDS STREAK → SCORE x', this.width / 2, this.height / 2 + 114);
      this.ctx.fillText('COINS STAY BETWEEN RUNS', this.width / 2, this.height / 2 + 138);
    }

    this.ctx.font = '13px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.fillText(
      muted ? 'M MUTED' : 'M SOUND',
      this.width / 2,
      this.height / 2 + (showFirstRunHints ? 174 : 86)
    );
  }

  drawGameOver(score, bestScore, coins = 0, age = 1, extras = {}) {
    const fade = Math.min(1, age / 0.25);
    const isNewBest = !!extras.isNewBest;
    this.ctx.fillStyle = CONFIG.COLORS.SkyPaper;
    this.ctx.globalAlpha = 0.58 + fade * 0.18;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = fade;
    this.garden.plate(this.width / 2 - 200, this.height / 2 - 168, 400, 340, 16);

    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.textAlign = 'center';
    this.ctx.globalAlpha = fade;

    this.ctx.font = 'bold 42px system-ui, sans-serif';
    this.ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 130);

    if (isNewBest) {
      const pulse = 1 + 0.08 * Math.sin(age * 10);
      this.ctx.save();
      this.ctx.translate(this.width / 2, this.height / 2 - 78);
      this.ctx.scale(pulse, pulse);
      this.ctx.fillStyle = CONFIG.COLORS.COIN;
      this.ctx.font = 'bold 22px system-ui, sans-serif';
      this.ctx.fillText('NEW BEST', 0, 0);
      this.ctx.restore();
    } else {
      const pointsToBest = Math.max(1, bestScore + 1 - score);
      this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
      this.ctx.font = 'bold 14px system-ui, sans-serif';
      this.ctx.fillText(`${pointsToBest} TO NEW BEST`, this.width / 2, this.height / 2 - 78);
    }

    this.ctx.font = 'bold 36px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.fillText(`${score}`, this.width / 2, this.height / 2 - 40);
    this.ctx.font = '14px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.fillText('SCORE', this.width / 2, this.height / 2 - 16);

    this.ctx.font = '20px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.fillText(`BEST ${bestScore}`, this.width / 2, this.height / 2 + 28);
    this.ctx.fillStyle = CONFIG.COLORS.COIN;
    this.ctx.fillText(`COINS ${coins}  •  SAVED`, this.width / 2, this.height / 2 + 60);

    this.ctx.font = 'bold 19px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.fillText('TAP / R TO RESTART', this.width / 2, this.height / 2 + 118);
    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.fillText(extras.muted ? 'M MUTED' : 'M SOUND', this.width / 2, this.height / 2 + 144);
    this.ctx.globalAlpha = 1;
  }
}
