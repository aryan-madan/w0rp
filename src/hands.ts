import {
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';

type HandLandmarkerResult = ReturnType<HandLandmarker['detectForVideo']>;

export interface PinchState {
  left: number;
  right: number;
}

export type HandsCallback = (pinch: PinchState) => void;

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST     = 0;
const INDEX_MCP = 5;

const MEDIAPIPE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';

const CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],       // thumb
  [0,5],[5,6],[6,7],[7,8],       // index
  [0,9],[9,10],[10,11],[11,12],  // middle
  [0,13],[13,14],[14,15],[15,16],// ring
  [0,17],[17,18],[18,19],[19,20],// pinky
  [5,9],[9,13],[13,17],          // palm
];

function pinchIntensity(landmarks: { x: number; y: number; z: number }[]): number {
  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  const wrist = landmarks[WRIST];
  const mcp   = landmarks[INDEX_MCP];

  const raw  = Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z);
  const span = Math.hypot(wrist.x - mcp.x,   wrist.y - mcp.y,   wrist.z - mcp.z);
  return span > 0 ? Math.max(0, Math.min(1, 1 - raw / span)) : 0;
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  pinch: number,
  w: number,
  h: number,
): void {
  const accent = `rgba(0, 71, 255, ${0.4 + pinch * 0.6})`;
  const dot    = `rgba(0, 71, 255, ${0.6 + pinch * 0.4})`;

  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  for (const [a, b] of CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
    ctx.stroke();
  }

  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
  }

  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  const mx = ((thumb.x + index.x) / 2) * w;
  const my = ((thumb.y + index.y) / 2) * h;
  const radius = 4 + pinch * 12;

  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 71, 255, ${pinch * 0.8})`;
  ctx.fill();
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private animId: number | null = null;
  private lastVideoTime = -1;

  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
    private callback: HandsCallback,
  ) {}

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/models/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }

  start(): void {
    if (!this.landmarker) throw new Error('Call init() before start()');
    this.loop();
  }

  stop(): void {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    this.animId = null;
  }

  private loop = (): void => {
    this.animId = requestAnimationFrame(this.loop);
    const { video, canvas, landmarker } = this;
    if (!landmarker || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    const result: HandLandmarkerResult = landmarker.detectForVideo(video, performance.now());
    const pinchState = this.extractPinch(result);

    for (let i = 0; i < result.landmarks.length; i++) {
      const label = result.handedness[i]?.[0]?.categoryName?.toLowerCase();
      const intensity = pinchIntensity(result.landmarks[i]);

      const mirrored = result.landmarks[i].map(lm => ({ ...lm, x: 1 - lm.x }));
      drawSkeleton(ctx, mirrored, intensity, w, h);

      const wristMirrored = mirrored[WRIST];
      ctx.fillStyle = 'rgba(0,71,255,0.9)';
      ctx.font = '500 11px JetBrains Mono, monospace';
      ctx.fillText(
        label === 'left' ? 'R' : 'L',
        wristMirrored.x * w,
        wristMirrored.y * h + 20,
      );
    }

    this.callback(pinchState);
  };

  private extractPinch(result: HandLandmarkerResult): PinchState {
    const state: PinchState = { left: 0, right: 0 };
    for (let i = 0; i < result.landmarks.length; i++) {
      const label     = result.handedness[i]?.[0]?.categoryName?.toLowerCase();
      const intensity = pinchIntensity(result.landmarks[i]);
      if (label === 'left')  state.right = intensity;
      if (label === 'right') state.left  = intensity;
    }
    return state;
  }
}