import { CONFIG } from '../config.js';

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

  drawTrack() {
    this.ctx.fillStyle = CONFIG.COLORS.TRACK;
    this.ctx.fillRect(CONFIG.TRACK_LEFT, 0, CONFIG.TRACK_RIGHT - CONFIG.TRACK_LEFT, this.height);

    this.ctx.strokeStyle = CONFIG.COLORS.TRACK_LINES;
    this.ctx.lineWidth = 4;
    
    this.ctx.beginPath();
    this.ctx.moveTo(CONFIG.TRACK_LEFT, 0);
    this.ctx.lineTo(CONFIG.TRACK_LEFT, this.height);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(CONFIG.TRACK_RIGHT, 0);
    this.ctx.lineTo(CONFIG.TRACK_RIGHT, this.height);
    this.ctx.stroke();
  }

  drawSegments(segments) {
    segments.forEach((segment) => {
      this.drawPaths(segment);
      this.drawObstacles(segment);
      this.drawPathLabels(segment);
    });
  }

  isRiskyPath(type) {
    return type === 'RISKY' || type === 'SHORT_RISKY';
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
      const reward = CONFIG.REWARDS[type] || CONFIG.REWARDS[isRisk ? 'RISKY' : 'SAFE'];
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

  drawPlayer(player) {
    this.ctx.save();
    this.ctx.translate(player.x, player.y);

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

  drawFloatingRewards(rewards) {
    this.ctx.save();
    this.ctx.textAlign = 'center';
    this.ctx.font = 'bold 24px system-ui, sans-serif';

    rewards.forEach((r) => {
      const isRisk = r.type === 'RISKY' || r.type === 'SHORT_RISKY';
      this.ctx.fillStyle = isRisk ? CONFIG.COLORS.RISKY_LABEL : CONFIG.COLORS.SAFE_LABEL;
      this.ctx.globalAlpha = r.life;
      this.ctx.fillText(`+${r.value}`, r.x, r.y);
    });

    this.ctx.restore();
  }

  drawHUD(score, multiplier, bestScore, riskStreak = 0) {
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.font = '20px system-ui, sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`SCORE: ${score}`, 20, 40);
    this.ctx.fillText(`BEST: ${bestScore}`, 20, 70);

    this.ctx.textAlign = 'right';
    const streakActive = riskStreak > 0;
    this.ctx.fillStyle = streakActive ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD;
    this.ctx.fillText(`STREAK ${riskStreak}`, this.width - 20, 40);
    this.ctx.fillStyle = multiplier > 1 ? CONFIG.COLORS.UI_ACCENT : CONFIG.COLORS.UI_HUD;
    this.ctx.fillText(`X${multiplier.toFixed(1)}`, this.width - 20, 70);
  }

  drawStartScreen() {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.textAlign = 'center';
    
    this.ctx.font = 'bold 48px system-ui, sans-serif';
    this.ctx.fillText('ONE MORE RUN', this.width / 2, this.height / 2 - 40);

    this.ctx.font = '20px system-ui, sans-serif';
    this.ctx.fillText('CLICK TO START', this.width / 2, this.height / 2 + 40);
  }

  drawGameOver(score, bestScore) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = CONFIG.COLORS.UI_TEXT;
    this.ctx.textAlign = 'center';

    this.ctx.font = 'bold 40px system-ui, sans-serif';
    this.ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 80);

    this.ctx.font = '24px system-ui, sans-serif';
    this.ctx.fillText(`SCORE: ${score}`, this.width / 2, this.height / 2);
    this.ctx.fillText(`BEST: ${bestScore}`, this.width / 2, this.height / 2 + 40);

    this.ctx.font = '18px system-ui, sans-serif';
    this.ctx.fillStyle = CONFIG.COLORS.UI_HUD;
    this.ctx.fillText('PRESS R TO RESTART', this.width / 2, this.height / 2 + 120);
  }
}