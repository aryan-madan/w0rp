import { detectPitch, freqToNote } from './pitch';
import { WaveformRenderer } from './waveform';
import { HandTracker } from './hands';
import type { PinchState } from './hands';
import { EffectsEngine } from './effects';
import { startCamera } from './camera';

const MIN_FREQ       = 60;
const MAX_FREQ       = 1200;
const MIN_CONFIDENCE = 0.2;
const FFT_SIZE       = 2048;
const SMOOTH         = 0.12;

const pinch = { left: 0, right: 0 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

function setStatus(msg: string, type: 'idle' | 'active' | 'error' = 'idle'): void {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type === 'idle' ? '' : type}`.trim();
}

async function init(): Promise<void> {
  const btn         = $('startBtn') as HTMLButtonElement;
  const pitchHzEl   = $('pitchHz');
  const pitchNoteEl = $('pitchNote');
  const confFillEl  = $('confFill');
  const leftFillEl  = $('leftFill');
  const rightFillEl = $('rightFill');
  const waveCanvas  = document.getElementById('waveform') as HTMLCanvasElement;
  const video       = document.getElementById('handVideo') as HTMLVideoElement;
  const handCanvas  = document.getElementById('handCanvas') as HTMLCanvasElement;

  const renderer = new WaveformRenderer(waveCanvas);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setStatus('starting...');

    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const fx = new EffectsEngine(audioCtx, source);
      const timeDomain = new Float32Array(analyser.fftSize);

      setStatus('loading hands...');
      await startCamera(video);

      const tracker = new HandTracker(video, handCanvas, (raw: PinchState) => {
        pinch.left  = lerp(pinch.left,  raw.left,  SMOOTH);
        pinch.right = lerp(pinch.right, raw.right, SMOOTH);
      });

      await tracker.init();
      tracker.start();

      setStatus('listening', 'active');
      btn.textContent = 'live';

      const loop = (): void => {
        requestAnimationFrame(loop);
        analyser.getFloatTimeDomainData(timeDomain);
        renderer.draw(timeDomain);

        const { freq, confidence } = detectPitch(timeDomain, audioCtx.sampleRate);
        const valid = freq > MIN_FREQ && freq < MAX_FREQ && confidence > MIN_CONFIDENCE;

        fx.currentFreq = valid ? freq : -1;
        fx.update(pinch, timeDomain);

        pitchHzEl.textContent   = valid ? `${freq.toFixed(1)}` : '—';
        pitchNoteEl.textContent = valid ? freqToNote(freq) : '';
        confFillEl.style.width  = valid ? `${(confidence * 100).toFixed(0)}%` : '0%';
        leftFillEl.style.width  = `${(pinch.left  * 100).toFixed(1)}%`;
        rightFillEl.style.width = `${(pinch.right * 100).toFixed(1)}%`;
      };

      loop();
    } catch (err) {
      console.error(err);
      setStatus('error', 'error');
      btn.disabled = false;
      btn.textContent = 'retry';
    }
  });
}

init();