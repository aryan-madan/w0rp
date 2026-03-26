import { detectPitch, freqToNote } from './pitch';
import { WaveformRenderer } from './waveform';

const MIN_FREQ = 60;  
const MAX_FREQ = 1200; 
const MIN_CONFIDENCE = 0.2;
const FFT_SIZE = 2048;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function setStatus(msg: string, type: 'idle' | 'active' | 'error' = 'idle'): void {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type === 'idle' ? '' : type}`.trim();
}

async function init(): Promise<void> {
  const btn = $('startBtn') as HTMLButtonElement;
  const pitchHzEl = $('pitchHz');
  const pitchNoteEl = $('pitchNote');
  const confFillEl = $('confFill');
  const canvas = document.getElementById('waveform') as HTMLCanvasElement;

  const renderer = new WaveformRenderer(canvas);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setStatus('requesting mic...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const timeDomain = new Float32Array(analyser.fftSize);

      setStatus('listening', 'active');
      btn.textContent = 'live';

      const loop = (): void => {
        requestAnimationFrame(loop);
        analyser.getFloatTimeDomainData(timeDomain);

        renderer.draw(timeDomain);

        const { freq, confidence } = detectPitch(timeDomain, audioCtx.sampleRate);
        const valid = freq > MIN_FREQ && freq < MAX_FREQ && confidence > MIN_CONFIDENCE;

        pitchHzEl.textContent = valid ? `${freq.toFixed(1)} Hz` : '—';
        pitchNoteEl.textContent = valid ? freqToNote(freq) : 'no pitch detected';
        confFillEl.style.width = valid ? `${(confidence * 100).toFixed(0)}%` : '0%';
      };

      loop();
    } catch {
      setStatus('mic access denied', 'error');
      btn.disabled = false;
      btn.textContent = 'retry';
    }
  });
}

init();