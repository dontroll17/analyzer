// delay-processor.js — Custom delay effect with feedback and wet/dry mix
class DelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'delayTime', defaultValue: 0, min: 0, max: 1.0 },
      { name: 'feedback', defaultValue: 0, min: 0, max: 0.95 },
      { name: 'mix', defaultValue: 0, min: 0, max: 1 }
    ];
  }

  constructor() {
    super();
    this._maxDelay = 1.0; // 1 second max delay
    this._bufferSize = Math.ceil(this._maxDelay * 44100);
    this._bufferL = new Float32Array(this._bufferSize);
    this._bufferR = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
    this._delayTime = 0;
    this._feedback = 0;
    this._mix = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'SET_DELAY') {
        if (e.data.delayTime !== undefined) this._delayTime = Math.min(this._maxDelay, Math.max(0, e.data.delayTime));
        if (e.data.feedback !== undefined) this._feedback = Math.min(0.95, Math.max(0, e.data.feedback));
        if (e.data.mix !== undefined) this._mix = Math.min(1, Math.max(0, e.data.mix));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    // AudioWorklet Node always has exactly 1 output (array of channel Float32Arrays)
    const output = outputs[0];
    
    if (!input || !output) return true;
    if (input.length === 0 || input[0].length === 0) return true;

    const numChannels = input.length;
    const numSamples = input[0].length;
    const delaySamples = Math.max(0, Math.floor(this._delayTime * 44100));

    for (let ch = 0; ch < numChannels; ch++) {
      // Wrap both L and R into one buffer for simplicity (or use same buffer for both channels)
      const buf = ch === 0 ? this._bufferL : this._bufferR;
      const inChan = input[ch];
      const outChan = output[ch];

      for (let i = 0; i < numSamples; i++) {
        const readIndex = (this._writeIndex - delaySamples + buf.length) % buf.length;
        const delayed = buf[readIndex];

        // Wet/dry mix
        outChan[i] = inChan[i] * (1 - this._mix) + delayed * this._mix;

        // Write to buffer: dry + feedback
        buf[this._writeIndex] = inChan[i] + delayed * this._feedback;

        this._writeIndex = (this._writeIndex + 1) % buf.length;
      }
    }

    return true;
  }
}

registerProcessor('delay-effect', DelayProcessor);
