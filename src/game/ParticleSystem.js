import { CONFIG } from '../config.js';

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  burst({
    x,
    y,
    count = 8,
    color = '#ffffff',
    speed = 80,
    life = 0.35,
    gravity = 40,
    size = 3
  }) {
    const room = Math.max(0, CONFIG.FEEL.PARTICLE_MAX - this.particles.length);
    const n = Math.min(Math.max(0, Math.floor(count)), room);
    for (let i = 0; i < n; i += 1) {
      const angle = (Math.PI * 2 * i) / Math.max(n, 1) + Math.random() * 0.4;
      const mag = speed * (0.45 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * mag,
        vy: Math.sin(angle) * mag - mag * 0.25,
        life,
        maxLife: life,
        color,
        gravity,
        size: size * (0.7 + Math.random() * 0.6)
      });
    }
    return n;
  }

  update(deltaTime) {
    const dt = Math.max(0, deltaTime);
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  clear() {
    this.particles.length = 0;
  }
}
