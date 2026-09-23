export class MouseInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = false;
    this.logicalX = null;
    this.buttonsDown = 0;
    this.suppress = false;
    this.touchGuardAt = 0;

    canvas.addEventListener('mousedown', (event) => this.onDown(event));
    window.addEventListener('mousemove', (event) => this.onMove(event));
    window.addEventListener('mouseup', () => this.onUp());
    window.addEventListener('pointerup', () => this.onUp());
    window.addEventListener('pointercancel', () => this.onUp());
    window.addEventListener('blur', () => this.onUp());
    window.addEventListener('touchstart', () => {
      this.touchGuardAt = performance.now();
      this.onUp();
    }, { passive: true });
  }

  eventLogicalX(event) {
    if (!Number.isFinite(event?.clientX)) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return ((event.clientX - rect.left) / rect.width) * this.canvas.width;
  }

  onDown(event) {
    if (event.button !== 0) return;
    if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return;
    if (event.pointerType === 'touch') return;
    if (performance.now() - this.touchGuardAt < 1000) return;
    this.buttonsDown = 1;
    if (this.suppress) return;
    const logicalX = this.eventLogicalX(event);
    if (!Number.isFinite(logicalX)) return;
    this.held = true;
    this.logicalX = logicalX;
  }

  onMove(event) {
    if (this.suppress || !this.held) return;
    const logicalX = this.eventLogicalX(event);
    if (!Number.isFinite(logicalX)) return;
    this.logicalX = logicalX;
  }

  onUp() {
    this.buttonsDown = 0;
    this.suppress = false;
    this.held = false;
    this.logicalX = null;
  }

  reset() {
    this.held = false;
    this.logicalX = null;
    this.suppress = this.buttonsDown > 0;
  }

  getMoveDirection() {
    if (this.suppress || !this.held || !Number.isFinite(this.logicalX)) return 0;
    const mid = this.canvas.width / 2;
    if (this.logicalX < mid - 8) return -1;
    if (this.logicalX > mid + 8) return 1;
    return 0;
  }
}
