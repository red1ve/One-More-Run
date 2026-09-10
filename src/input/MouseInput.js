export class MouseInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = false;
    this.logicalX = null;

    canvas.addEventListener('mousedown', (event) => this.onDown(event));
    window.addEventListener('mousemove', (event) => this.onMove(event));
    window.addEventListener('mouseup', () => this.onUp());
    window.addEventListener('blur', () => this.onUp());
  }

  eventLogicalX(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return ((event.clientX - rect.left) / rect.width) * this.canvas.width;
  }

  onDown(event) {
    if (event.button !== 0) return;
    if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return;
    this.held = true;
    this.logicalX = this.eventLogicalX(event);
  }

  onMove(event) {
    if (!this.held) return;
    this.logicalX = this.eventLogicalX(event);
  }

  onUp() {
    this.held = false;
    this.logicalX = null;
  }

  getMoveDirection() {
    if (!this.held || this.logicalX == null) return 0;
    const mid = this.canvas.width / 2;
    if (this.logicalX < mid - 8) return -1;
    if (this.logicalX > mid + 8) return 1;
    return 0;
  }
}
