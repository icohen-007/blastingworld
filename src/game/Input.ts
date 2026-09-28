export type AimPoint = { x: number; y: number };

/**
 * Aim tracking + double-click / double-tap to fire.
 * Single clicks only update aim — never fire.
 */
export class Input {
  readonly aimNdc = { x: 0, y: 0 };
  private canvas: HTMLCanvasElement;
  private fireQueued = false;
  private lastClient = { x: 0, y: 0 };
  private lastTapAt = 0;
  private lastTapPos = { x: 0, y: 0 };
  private readonly dblMs = 420;
  private readonly dblPx = 28;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onDblClick = this.onDblClick.bind(this);
  }

  get clientAim(): { x: number; y: number } {
    return this.lastClient;
  }

  enable(): void {
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("dblclick", this.onDblClick);
  }

  disable(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("dblclick", this.onDblClick);
    this.fireQueued = false;
    this.lastTapAt = 0;
  }

  /** Consume a fire request (one-shot per double-click / double-tap). */
  consumeFire(): boolean {
    if (!this.fireQueued) return false;
    this.fireQueued = false;
    return true;
  }

  private updateAim(clientX: number, clientY: number): void {
    this.lastClient.x = clientX;
    this.lastClient.y = clientY;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.aimNdc.x = Math.max(-1, Math.min(1, x));
    this.aimNdc.y = Math.max(-1, Math.min(1, y));
  }

  private queueFire(): void {
    this.fireQueued = true;
  }

  private onPointerMove(e: PointerEvent): void {
    this.updateAim(e.clientX, e.clientY);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    this.updateAim(e.clientX, e.clientY);

    // Touch / pen: synthesize double-tap (dblclick is unreliable on mobile)
    if (e.pointerType !== "mouse") {
      const now = performance.now();
      const dx = e.clientX - this.lastTapPos.x;
      const dy = e.clientY - this.lastTapPos.y;
      const close = dx * dx + dy * dy <= this.dblPx * this.dblPx;
      if (now - this.lastTapAt < this.dblMs && close) {
        this.queueFire();
        this.lastTapAt = 0;
      } else {
        this.lastTapAt = now;
        this.lastTapPos = { x: e.clientX, y: e.clientY };
      }
    }

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private onDblClick(e: MouseEvent): void {
    e.preventDefault();
    this.updateAim(e.clientX, e.clientY);
    this.queueFire();
  }
}
