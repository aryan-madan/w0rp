import type { PinchState } from './types';

const SCALE = [0, 2, 4, 5, 7, 9, 11];

function nearestNoteFreq(freq: number): number {
  const midi = 12 * Math.log2(freq / 440) + 69;

  const oct = Math.floor(midi / 12);

  const semi = ((midi % 12) + 12) % 12;

  let nearest = SCALE[0];
  let minDist = Infinity;

  for (const deg of SCALE) {
    const d = Math.min(
      Math.abs(semi - deg),
      12 - Math.abs(semi - deg),
    );

    if (d < minDist) {
      minDist = d;
      nearest = deg;
    }
  }

  return 440 * Math.pow(
    2,
    (oct * 12 + nearest - 69) / 12,
  );
}

const WORKLET_CODE = `
class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'ratio',
        defaultValue: 1,
        minValue: 0.5,
        maxValue: 2
      }
    ];
  }

  constructor() {
    super();

    this.size = 2048;
    this.mask = this.size * 2 - 1;

    this.buf = new Float32Array(this.size * 2);

    this.write = 0;
    this.read = 0;
    this.phase = 0;

    this.window = new Float32Array(this.size);

    for (let i = 0; i < this.size; i++) {
      this.window[i] =
        0.5 - 0.5 * Math.cos(2 * Math.PI * i / this.size);
    }
  }

  process(inputs, outputs, params) {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];

    if (!inp || !out) {
      return true;
    }

    const ratio = params.ratio[0] ?? 1;

    for (let i = 0; i < inp.length; i++) {
      this.buf[this.write & this.mask] = inp[i];

      this.write++;

      out[i] =
        this.buf[Math.floor(this.read) & this.mask] *
        (this.window[this.phase] ?? 1);

      this.read += ratio;

      this.phase++;

      if (this.phase >= this.size) {
        this.phase = 0;
        this.read = this.write - this.size * 0.5;
      }
    }

    return true;
  }
}

registerProcessor('pitch-proc', PitchProcessor);
`;

export class EffectsEngine {
  private ctx: AudioContext;

  private dry: GainNode;
  private reverbSend: GainNode;
  private reverbReturn: GainNode;
  private conv: ConvolverNode;

  private autotuneSend: GainNode;
  private autotuneReturn: GainNode;

  private output: GainNode;

  private shifter: AudioWorkletNode | null = null;
  private pitchParam: AudioParam | null = null;

  currentFreq = -1;

  constructor(
    ctx: AudioContext,
    source: MediaStreamAudioSourceNode,
  ) {
    this.ctx = ctx;

    this.dry = ctx.createGain();

    this.reverbSend = ctx.createGain();
    this.reverbReturn = ctx.createGain();

    this.autotuneSend = ctx.createGain();
    this.autotuneReturn = ctx.createGain();

    this.output = ctx.createGain();

    this.conv = ctx.createConvolver();

    this.dry.gain.value = 1;

    this.reverbSend.gain.value = 0;
    this.reverbReturn.gain.value = 1;

    this.autotuneSend.gain.value = 0;
    this.autotuneReturn.gain.value = 1;

    this.output.gain.value = 1;

    this.conv.buffer = this.buildImpulse(2.5, 3);

    source.connect(this.dry);
    source.connect(this.reverbSend);
    source.connect(this.autotuneSend);

    this.dry.connect(this.output);

    this.reverbSend.connect(this.conv);
    this.conv.connect(this.reverbReturn);
    this.reverbReturn.connect(this.output);

    this.output.connect(ctx.destination);

    void this.initWorklet(source);
  }

  private async initWorklet(
    source: MediaStreamAudioSourceNode,
  ): Promise<void> {
    try {
      const blob = new Blob(
        [WORKLET_CODE],
        {
          type: 'application/javascript',
        },
      );

      const url = URL.createObjectURL(blob);

      await this.ctx.audioWorklet.addModule(url);

      URL.revokeObjectURL(url);

      this.shifter = new AudioWorkletNode(
        this.ctx,
        'pitch-proc',
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        },
      );

      this.pitchParam =
        this.shifter.parameters.get('ratio') ?? null;

      source.connect(this.autotuneSend);

      this.autotuneSend.connect(this.shifter);

      this.shifter.connect(this.autotuneReturn);

      this.autotuneReturn.connect(this.output);
    } catch (e) {
      console.warn('[w0rp] worklet failed:', e);
    }
  }

  update(pinch: PinchState): void {
    const now = this.ctx.currentTime;

    const tc = 0.05;

    const rightActive = pinch.right > 0.02;
    const leftActive = pinch.left > 0.02;

    this.dry.gain.setTargetAtTime(
      1,
      now,
      tc,
    );

    this.reverbSend.gain.setTargetAtTime(
      leftActive ? pinch.left : 0,
      now,
      tc,
    );

    if (this.pitchParam) {
      if (rightActive && this.currentFreq > 0) {
        const target = nearestNoteFreq(
          this.currentFreq,
        );

        const correction = Math.max(
          0.5,
          Math.min(
            2,
            target / this.currentFreq,
          ),
        );

        const ratio =
          1 + (correction - 1) * pinch.right;

        this.pitchParam.setTargetAtTime(
          ratio,
          now,
          0.02,
        );

        this.autotuneSend.gain.setTargetAtTime(
          pinch.right,
          now,
          tc,
        );
      } else {
        this.pitchParam.setTargetAtTime(
          1,
          now,
          tc,
        );

        this.autotuneSend.gain.setTargetAtTime(
          0,
          now,
          tc,
        );
      }
    }
  }

  private buildImpulse(
    duration: number,
    decay: number,
  ): AudioBuffer {
    const rate = this.ctx.sampleRate;

    const len = Math.floor(rate * duration);

    const buf = this.ctx.createBuffer(
      2,
      len,
      rate,
    );

    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);

      for (let i = 0; i < len; i++) {
        ch[i] =
          (Math.random() * 2 - 1) *
          Math.pow(1 - i / len, decay);
      }
    }

    return buf;
  }
}