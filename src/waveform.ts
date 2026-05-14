const ACCENT = '#0047ff';
const LINE_WIDTH = 1.5;

export class WaveformRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas 2D context');
    }

    this.ctx = ctx;

    this.resize();

    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;

    this.width = this.canvas.offsetWidth;
    this.height = this.canvas.offsetHeight;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  draw(timeDomain: Float32Array): void {
    const { ctx, width, height } = this;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = LINE_WIDTH;

    ctx.beginPath();

    const step = width / timeDomain.length;

    for (let i = 0; i < timeDomain.length; i++) {
      const x = i * step;
      const y = (timeDomain[i] * 0.5 + 0.5) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }
}