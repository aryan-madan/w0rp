export interface PitchResult {
  freq: number;
  confidence: number;
}

const THRESHOLD = 0.15;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function detectPitch(buffer: Float32Array, sampleRate: number): PitchResult {
  const half = Math.floor(buffer.length / 2);

  const diff = new Float32Array(half);
  for (let tau = 1; tau < half; tau++) {
    for (let j = 0; j < half; j++) {
      const d = buffer[j] - buffer[j + tau];
      diff[tau] += d * d;
    }
  }

  const cmnd = new Float32Array(half);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < half; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 0;
  }

  let tau = 2;
  while (tau < half) {
    if (cmnd[tau] < THRESHOLD) {
      while (tau + 1 < half && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
    tau++;
  }

  if (tau === half || cmnd[tau] >= THRESHOLD) {
    return { freq: -1, confidence: 0 };
  }

  const prev = tau > 1 ? tau - 1 : tau;
  const next = tau + 1 < half ? tau + 1 : tau;
  let betterTau: number;

  if (prev === tau) {
    betterTau = cmnd[tau] <= cmnd[next] ? tau : next;
  } else if (next === tau) {
    betterTau = cmnd[tau] <= cmnd[prev] ? tau : prev;
  } else {
    const s0 = cmnd[prev], s1 = cmnd[tau], s2 = cmnd[next];
    betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  }

  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tau] / THRESHOLD));

  return {
    freq: sampleRate / betterTau,
    confidence,
  };
}

export function freqToNote(freq: number): string {
  if (freq <= 0) return '—';
  const midi = Math.round(12 * Math.log2(freq / 440)) + 69;
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}