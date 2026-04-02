import { type PinchState } from './hands';

const SCALE = [0, 2, 4, 5, 7, 9, 11];

function snapToScale(freq: number, amount: number): number {
  if (amount === 0 || freq <= 0) return freq;

  const midi       = 12 * Math.log2(freq / 440) + 69;
  const semitone   = midi % 12;
  const octave     = Math.floor(midi / 12);

  let nearest = SCALE[0];
  let minDist = Infinity;
  for (const degree of SCALE) {
    const dist = Math.abs(semitone - degree);
    const distWrapped = Math.min(dist, 12 - dist);
    if (distWrapped < minDist) { minDist = distWrapped; nearest = degree; }
  }

  const snappedMidi = octave * 12 + nearest;
  const snappedFreq = 440 * Math.pow(2, (snappedMidi - 69) / 12);

  return freq + (snappedFreq - freq) * amount;
}

export class EffectsEngine {
  private ctx: AudioContext;
  private inputGain: GainNode;
  private outputGain: GainNode;
  private convolver: ConvolverNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  private vibratoOsc: OscillatorNode;
  private vibratoGain: GainNode;
  private vibratoDepth = 0;

  private pitchRatio = 1;
  private autotuneAmount = 0;

  currentFreq = -1;

  constructor(ctx: AudioContext, source: MediaStreamAudioSourceNode) {
    this.ctx = ctx;

    this.inputGain  = ctx.createGain();
    this.outputGain = ctx.createGain();
    this.dryGain    = ctx.createGain();
    this.wetGain    = ctx.createGain();

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.buildImpulse(2.5, 2);

    this.vibratoOsc  = ctx.createOscillator();
    this.vibratoGain = ctx.createGain();
    this.vibratoOsc.frequency.value = 5; 
    this.vibratoGain.gain.value = 0;
    this.vibratoOsc.connect(this.vibratoGain);
    this.vibratoOsc.start();

    source.connect(this.inputGain);
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.convolver);
    this.dryGain.connect(this.outputGain);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
    this.outputGain.connect(ctx.destination);

    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
  }

  update(pinch: PinchState, timeDomain: Float32Array): void {
    const { ctx } = this;
    const now = ctx.currentTime;

    this.autotuneAmount = pinch.right;

    const targetRatio = Math.pow(2, (pinch.right * 5) / 12);
    this.pitchRatio = this.pitchRatio + (targetRatio - this.pitchRatio) * 0.1;

    if (this.currentFreq > 0 && pinch.right > 0.05) {
      const snapped = snapToScale(this.currentFreq, this.autotuneAmount);
      const correction = snapped / this.currentFreq;

      this.pitchRatio = this.pitchRatio * (1 - pinch.right) + (this.pitchRatio * correction) * pinch.right;
    }

    const reverbWet = pinch.left;
    this.dryGain.gain.setTargetAtTime(1 - reverbWet * 0.6, now, 0.05);
    this.wetGain.gain.setTargetAtTime(reverbWet * 0.8,     now, 0.05);

    this.vibratoDepth = pinch.left;
    this.vibratoGain.gain.setTargetAtTime(pinch.left * 20, now, 0.05);
  }

  getPitchRatio(): number { return this.pitchRatio; }
  getAutotuneAmount(): number { return this.autotuneAmount; }
  getVibratoDepth(): number { return this.vibratoDepth; }

  private buildImpulse(duration: number, decay: number): AudioBuffer {
    const { ctx } = this;
    const rate     = ctx.sampleRate;
    const length   = Math.floor(rate * duration);
    const impulse  = ctx.createBuffer(2, length, rate);

    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    return impulse;
  }
}