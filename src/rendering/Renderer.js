import { CONFIG, isRiskPathType } from '../config.js';

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = CONFIG.CANVAS_WIDTH;
    this.height = CONFIG.CANVAS_HEIGHT;
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

  drawTrack(speedScroll = 0, speedRatio = 0) {
    this.ctx.fillStyle = CONFIG.COLORS.TRACK;
    this.ctx.fillRect(CONFIG.TRACK_LEFT, 0, CONFIG.TRACK_RIGHT - CONFIG.TRACK_LEFT, this.height);

    this.ctx.strokeStyle = CONFIG.COLORS.TRACK_LINES;
    this.ctx.lineWidth = 4;
    this.ctx.setLineDash([18, 14]);
    this.ctx.lineDashOffset = -speedScroll;

    this.ctx.beginPath();
    this.ctx.moveTo(CONFIG.TRACK_LEFT, 0);
    this.ctx.lineTo(CONFIG.TRACK_LEFT, this.height);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(CONFIG.TRACK_RIGHT, 0);
    this.ctx.lineTo(CONFIG.TRACK_RIGHT, this.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    if (speedRatio > 0.08) this.drawSpeedLines(speedScroll, speedRatio);
  }

  drawSpeedLines(speedScroll, speedRatio) {
    const count = Math.round(CONFIG.FEEL.SPEED_LINE_MAX * Math.min(1, speedRatio));
    this.ctx.save();
    this.ctx.strokeStyle = `rgba(255,255,255,${0.04 + speedRatio * 0.08})`;
    this.ctx.lineWidth = 1;
    for (let i = 0; i < count; i += 1) {
      const lane = i % 2 === 0 ? CONFIG.TRACK_LEFT + 18 : CONFIG.TRACK_RIGHT - 18;
      const y = ((speedScroll * 1.8 + i * 97) % (this.height + 80)) - 40;
      const len = 18 + speedRatio * 36;
      this.ctx.beginPath();
      this.ctx.moveTo(lane, y);
      this.ctx.lineTo(lane, y + len);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawSegments(segments) {
    segments.forEach((segment) => {
      this.drawPaths(segment);
      this.drawObstacles(segment);
      this.drawPathLabels(segment);
      this.drawCoins(segment);
    });
  }

  isRiskyPath(type) {
    return isRiskPathType(type);
  }

  drawPaths(segment) {
    if (segment.type === 'TWO_PATHS') {
      const risky = segment.paths.filter((path) => path.type === 'RISKY');
      if (risky.length > 0) {
        const x = Math.min(...risky.map((path) => path.x));
        const right = Math.max(...risky.map((path) => path.x + path.width));
        const y = Math.min(...risky.map((path) => path.y));
        const bottom = Math.max(...risky.map((path) => path.y + path.height));
        this.ctx.fillStyle = CONFIG.COLORS.RISKY_PATH;
        this.ctx.fillRect(x, y, right - x, bottom - y);
      }
    }

    segment.paths.forEach((path) => {
      this.ctx.fillStyle = this.isRiskyPath(path.type)
        ? CONFIG.COLORS.RISKY_PATH
        : CONFIG.COLORS.SAFE_PATH;
      this.ctx.fillRect(path.x, path.y, path.width, path.height);
    });
  }

  drawObstacles(segment) {
    this.ctx.fillStyle = CONFIG.COLORS.OBSTACLE;

    segment.obstacles.forEach((obs) => {
      this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    });
  }

  drawCoins(segment) {
    if (!segment.coins) return;
    segment.coins.forEach((coin) => {
      if (coin.collected) return;
      const cx = coin.x + coin.width / 2;
      const cy = coin.y + coin.height / 2;
      const radius = Math.min(coin.width, coin.height) / 2;
      this.ctx.beginPath();
      this.ctx.fillStyle = CONFIG.COLORS.COIN;
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff4c2';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
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
      const title = isRisk ? 'RISK' : 'SAFE';
      const reward = path.baseReward
        ?? CONFIG.REWARDS[type]
        ?? CONFIG.REWARDS[isRisk ? 'RISKY' : 'SAFE'];
      const labelX = path.x + path.width / 2;
      const labelY = path.y + path.height + 20;

      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = isRisk ? CONFIG.COLORS.RISKY_LABEL : CONFIG.COLORS.SAFE_LABEL;
      this.ctx.font = 'bold 14px system-ui, sans-serif';
      this.ctx.fillText(title, labelX, labelY);
      this.ctx.font = '12px system-ui, sans-serif';
      this.ctx.fillText(`+${reward}`, labelX, labelY + 16);
    });
  }

  drawPlayer(player, feel = null) {
    const bob = feel ? Math.sin(feel.time * 9) * CONFIG.FEEL.PLAYER_BOB * (0.35 + (feel.playerPulse || 0)) : 0;
    const pulse = feel ? feel.playerPulse || 0 : 0;
    const stretchY = 1 + pulse * 0.18;
    const stretchX = 1 - pulse * 0.1;
    const dir = player.moveDirection || 0;

    this.ctx.save();
    this.ctx.translate(player.x, player.y + bob);
    this.ctx.scale(stretchX, stretchY);
    this.ctx.rotate(dir * 0.08);

    this.ctx.fillStyle = CONFIG.COLORS.PLAYER;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -player.height / 2);
    this.ctx.lineTo(-player.width / 2, player.height / 2);
    this.ctx.lineTo(player.width / 2, player.height / 2);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

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

    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.font = 'bold 22px system-ui, sans-serif';
    this.ctx.fillText(`${score}`, 20, 38);
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.fillText('SCORE', 20, 54);
    this.ctx.fillText(`BEST ${bestScore}`, 20, 74);

    const coinScale = 1 + (pulse.coins || 0) * 0.18;
    this.ctx.save();
    this.ctx.translate(20, 100);
    this.ctx.scale(coinScale, coinScale);
    this.ctx.fillStyle = CONFIG.COLORS.COIN;
    this.ctx.font = 'bold 16px system-ui, sans-serif';
    this.ctx.fillText(`COINS ${coins}`, 0, 0);
    this.ctx.restore();

    this.ctx.textAlign = 'right';
    const streakActive = riskStreak > 0;
    const streakScale = 1 + (pulse.streak || 0) * 0.22;
    this.ctx.save();
    this.ctx.translate(this.width - 20, 36);
    this.ctx.scale(streakScale, streakScale);
    this.ctx.fillStyle = streakActive ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD;
    this.ctx.font = 'bold 18px system-ui, sans-serif';
    this.ctx.fillText(`STREAK ${riskStreak}`, 0, 0);
    this.ctx.restore();

    const maxed = multiplier >= CONFIG.MULTIPLIER_MAX;
    const multScale = 1 + (pulse.multiplier || 0) * (maxed ? 0.32 : 0.2);
    this.ctx.save();
    this.ctx.translate(this.width - 20, 70);
    this.ctx.scale(multScale, multScale);
    this.ctx.fillStyle = maxed ? CONFIG.COLORS.COIN : (multiplier > 1 ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD);
    this.ctx.font = 'bold 22px system-ui, sans-serif';
    this.ctx.fillText(`x${multiplier.toFixed(1)}`, 0, 0);
    this.ctx.restore();

    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = muted ? CONFIG.COLORS.UI_HUD : CONFIG.COLORS.UI_TEXT;
    this.ctx.font = '11px system-ui, sans-serif';
    this.ctx.fillText(muted ? 'M MUTED' : 'M SOUND', 20, this.height - 18);
  }

  drawStartScreen(muted = false) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.textAlign = 'center';

    this.ctx.font = 'bold 48px system-ui, sans-serif';
    this.ctx.fillText('ONE MORE RUN', this.width / 2, this.height / 2 - 40);

    this.ctx.font = '20px system-ui, sans-serif';
    this.ctx.fillText('TAP TO START', this.width / 2, this.height / 2 + 28);

    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.font = '13px system-ui, sans-serif';
    this.ctx.fillText('A/D or ←/→  •  TAP LEFT/RIGHT', this.width / 2, this.height / 2 + 62);

    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.fillText(muted ? 'M MUTED' : 'M SOUND', this.width / 2, this.height / 2 + 92);
  }

  drawGameOver(score, bestScore, coins = 0, age = 1, extras = {}) {
    const fade = Math.min(1, age / 0.25);
    const isNewBest = !!extras.isNewBest;
    this.ctx.fillStyle = `rgba(0, 0, 0,${0.55 + fade * 0.28})`;
    this.ctx.fillRect(0, 0, this.width, this.height);

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
    this.ctx.fillText(`COINS ${coins}`, this.width / 2, this.height / 2 + 60);

    this.ctx.font = '18px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.fillText('TAP OR PRESS R', this.width / 2, this.height / 2 + 118);
    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.fillText(extras.muted ? 'M MUTED' : 'M SOUND', this.width / 2, this.height / 2 + 144);
    this.ctx.globalAlpha = 1;
  }
}
