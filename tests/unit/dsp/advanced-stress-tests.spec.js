import { describe, it, expect } from 'vitest';
import {
  calculateRMS, fftReal1024, calculateFrequencyBands,
  detectHighFrequencyAnomaly, calculateZCR, HALF_N
} from '../../../dsp-engine/tests/dsp-engine-testable.js';

// MockDSPProcessor — mirrors audio-worklet.js defensive guards for Node.js testing
class MockDSPProcessor {
  constructor(sampleRate = 44100) {
    this.fftSize = 1024;
    this.bufferSize = this.fftSize;
    this.sampleRate = sampleRate;
    this.inputBuffers = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
    this.bufferCounts = [0, 0];
    this.leftReady = false;
    this.rightReady = false;
    this.frameCount = 0;
    this.warmupFrames = 15;
    this.messages = [];
  }

  process(inputs, outputs) {
    // Guard 0: Handle null/undefined inputs
    if (!inputs) {
      return true;
    }

    const input = inputs[0];
    const output = outputs && outputs[0];

    // Guard 1: Empty/missing input
    if (!input || input.length === 0) {
      return true;
    }

    // Guard 2: Validate all samples — reject NaN/Infinity
    let hasInvalidData = false;
    for (let ch = 0; ch < input.length; ch++) {
      const channelData = input[ch];
      if (!channelData || channelData.length === 0) {
        hasInvalidData = true;
        break;
      }
      for (let i = 0; i < channelData.length; i++) {
        if (!Number.isFinite(channelData[i])) {
          hasInvalidData = true;
          break;
        }
      }
      if (hasInvalidData) break;
    }

    if (hasInvalidData) {
      return true;
    }

    // Buffer data channel by channel
    for (let ch = 0; ch < input.length; ch++) {
      const channelData = input[ch];
      const numSamples = channelData.length;
      for (let i = 0; i < numSamples; i++) {
        this.inputBuffers[ch][this.bufferCounts[ch]] = channelData[i];
        this.bufferCounts[ch]++;
        if (this.bufferCounts[ch] >= this.bufferSize) {
          this.processChannelFrame(ch);
          this.bufferCounts[ch] = 0;
        }
      }
    }

    // Emit frame when all expected channels are ready
    if (this.leftReady && (this.bufferCounts[0] === 0)) {
      this.processFrame();
      this.leftReady = false;
      this.rightReady = false;
    }

    return true;
  }

  processChannelFrame(ch) {
    const buffer = this.inputBuffers[ch];

    const { rms, peak } = calculateRMS(buffer);
    if (!Number.isFinite(rms) || !Number.isFinite(peak) || rms < 0 || peak < 0) {
      return;
    }

    const fft = fftReal1024(buffer);
    const bands = calculateFrequencyBands(fft, this.sampleRate);
    const highFreqAnomaly = detectHighFrequencyAnomaly(fft);
    const zcr = calculateZCR(buffer, this.sampleRate);

    if (!Number.isFinite(bands.bass) || !Number.isFinite(bands.mid) || !Number.isFinite(bands.treble)) {
      return;
    }
    if (!Number.isFinite(highFreqAnomaly) || highFreqAnomaly < 0 || highFreqAnomaly > 1) {
      return;
    }
    if (!Number.isFinite(zcr) || zcr < 0) {
      return;
    }

    if (ch === 0) {
      this.leftFrameData = { rms, peak, fft, bands, highFreqAnomaly, zcr };
      this.leftReady = true;
    } else {
      this.rightFrameData = { rms, peak, fft, bands, highFreqAnomaly, zcr };
      this.rightReady = true;
    }
  }

  processFrame() {
    this.frameCount++;

    // Skip warmup frames
    if (this.frameCount <= this.warmupFrames) {
      return;
    }

    const leftData = this.leftFrameData;
    const rightData = this.rightFrameData;

    const combinedRMS = leftData ? leftData.rms : (rightData ? rightData.rms : 0);
    const peakRMS = Math.max(
      leftData ? leftData.peak : 0,
      rightData ? rightData.peak : 0
    );

    const combinedBands = {
      bass: (leftData?.bands.bass + rightData?.bands.bass) / 2 || 0,
      mid: (leftData?.bands.mid + rightData?.bands.mid) / 2 || 0,
      treble: (leftData?.bands.treble + rightData?.bands.treble) / 2 || 0,
    };

    const criticalMetrics = [
      combinedRMS, peakRMS,
      combinedBands.bass, combinedBands.mid, combinedBands.treble,
      leftData?.highFreqAnomaly || 0,
    ];

    for (const val of criticalMetrics) {
      if (!Number.isFinite(val)) {
        return;
      }
    }

    this.messages.push({
      type: 'METRICS',
      frame: this.frameCount,
      rms: combinedRMS,
      peakRMS: peakRMS,
      bass: combinedBands.bass,
      mid: combinedBands.mid,
      treble: combinedBands.treble,
      channels: leftData && rightData ? 2 : 1,
    });
  }
}

describe('D1 - Undefined/Missing Samples Stress Tests', () => {
  it('should handle Float32Array with undefined values in process()', () => {
    const processor = new MockDSPProcessor(44100);
    const cleanInput = [new Float32Array(1024).fill(0.5)];

    // Warmup with clean data
    for (let frame = 0; frame < 20; frame++) {
      processor.process([cleanInput], []);
    }
    expect(processor.process(null, [])).toBe(true);

    // Feed undefined samples: fill specific positions with undefined
    const corrupted = new Float32Array(1024);
    corrupted[100] = undefined;
    corrupted[500] = undefined;
    corrupted[900] = undefined;

    const result = processor.process([corrupted], []);
    expect(result).toBe(true);

    // All emitted metrics must pass Number.isFinite validation
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
      expect(Number.isFinite(msg.peakRMS)).toBe(true);
    }
  });

  it('should handle empty channel buffers gracefully', () => {
    const processor = new MockDSPProcessor(44100);

    // Feed empty buffer
    const result = processor.process([[new Float32Array(0)]], []);
    expect(result).toBe(true);

    // Feed a buffer with only NaN
    const nanBuffer = new Float32Array(1024);
    nanBuffer.fill(NaN);
    const nanResult = processor.process([nanBuffer], []);
    expect(nanResult).toBe(true);

    // Feed a buffer with only Infinity
    const infBuffer = new Float32Array(1024);
    infBuffer.fill(Infinity);
    const infResult = processor.process([infBuffer], []);
    expect(infResult).toBe(true);
  });

  it('should handle missing channels (only 1 channel when expecting 2)', () => {
    const processor = new MockDSPProcessor(44100);
    const monoInput = [new Float32Array(1024).fill(0.6)];

    // Process 25 frames (>= 20, passes warmup of 15)
    for (let frame = 0; frame < 25; frame++) {
      processor.process([monoInput], []);
    }

    // Should emit metrics even with single channel
    expect(processor.messages.length).toBeGreaterThan(0);
    const lastMsg = processor.messages[processor.messages.length - 1];
    expect(lastMsg.channels).toBe(1);
    expect(Number.isFinite(lastMsg.rms)).toBe(true);
    expect(lastMsg.rms).toBeCloseTo(0.6, 5);
  });

  it('should handle undefined input channel array element', () => {
    const processor = new MockDSPProcessor(44100);

    // Simulate: inputs[0] is undefined
    const result1 = processor.process([undefined], []);
    expect(result1).toBe(true);

    // Simulate: inputs[0] is a single valid channel
    const result2 = processor.process([[new Float32Array(1024).fill(0.2)]], []);
    expect(result2).toBe(true);

    // Validate metrics
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
    }
  });

  it('should handle rapid undefined/clean frame alternation', () => {
    const processor = new MockDSPProcessor(44100);
    const cleanInput = [new Float32Array(1024).fill(0.3)];

    // Mix undefined corruptions with clean frames
    for (let frame = 0; frame < 30; frame++) {
      if (frame % 3 === 0) {
        // Every 3rd frame: undefined/corrupted
        const bad = new Float32Array(1024);
        bad.fill(undefined);
        processor.process([bad], []);
      } else {
        processor.process([cleanInput], []);
      }
    }

    // Must have emitted metrics from clean frames (after warmup)
    expect(processor.messages.length).toBeGreaterThan(0);

    // All metrics must be finite
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
      expect(Number.isFinite(msg.bass)).toBe(true);
      expect(Number.isFinite(msg.mid)).toBe(true);
      expect(Number.isFinite(msg.treble)).toBe(true);
    }
  });
});

describe('D2 - Channel Switching Stress Tests', () => {
  it('should handle switching from stereo (2ch) to mono (1ch) mid-session', () => {
    const processor = new MockDSPProcessor(44100);
    const stereoInput = [
      new Float32Array(1024).fill(0.7),
      new Float32Array(1024).fill(0.5),
    ];
    const monoInput = [new Float32Array(1024).fill(0.4)];

    // Start with stereo
    for (let frame = 0; frame < 10; frame++) {
      processor.process([stereoInput], []);
    }
    const stereoCount = processor.messages.length;

    // Switch to mono
    for (let frame = 0; frame < 10; frame++) {
      processor.process([monoInput], []);
    }

    // Should have more metrics after warmup
    expect(processor.messages.length).toBeGreaterThan(stereoCount);

    // All metrics finite
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
      expect(Number.isFinite(msg.peakRMS)).toBe(true);
    }
  });

  it('should handle switching from mono (1ch) to stereo (2ch) mid-session', () => {
    const processor = new MockDSPProcessor(44100);
    const monoInput = [new Float32Array(1024).fill(0.3)];
    const stereoInput = [
      new Float32Array(1024).fill(0.6),
      new Float32Array(1024).fill(0.2),
    ];

    // Start with mono
    for (let frame = 0; frame < 10; frame++) {
      processor.process([monoInput], []);
    }
    const monoCount = processor.messages.length;

    // Switch to stereo
    for (let frame = 0; frame < 10; frame++) {
      processor.process([stereoInput], []);
    }

    // Should continue emitting after warmup
    expect(processor.messages.length).toBeGreaterThan(monoCount);

    const lastMsg = processor.messages[processor.messages.length - 1];
    expect(lastMsg.channels).toBe(2);
    expect(Number.isFinite(lastMsg.rms)).toBe(true);
  });

  it('should handle rapid channel switching (mono <-> stereo alternation)', () => {
    const processor = new MockDSPProcessor(44100);
    const monoInput = [new Float32Array(1024).fill(0.5)];
    const stereoInput = [
      new Float32Array(1024).fill(0.7),
      new Float32Array(1024).fill(0.3),
    ];

    // Alternate channel counts for 40 frames
    for (let frame = 0; frame < 40; frame++) {
      const input = frame % 2 === 0 ? [monoInput] : [stereoInput];
      const result = processor.process(input, []);
      expect(result).toBe(true);
    }

    // All metrics must be finite
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
      expect(Number.isFinite(msg.bass)).toBe(true);
      expect(Number.isFinite(msg.mid)).toBe(true);
      expect(Number.isFinite(msg.treble)).toBe(true);
      expect(Number.isFinite(msg.peakRMS)).toBe(true);
    }
  });

  it('should recover after a channel count drop (2ch -> 1ch -> 2ch)', () => {
    const processor = new MockDSPProcessor(44100);
    const stereoInput = [
      new Float32Array(1024).fill(0.5),
      new Float32Array(1024).fill(0.5),
    ];
    const monoInput = [new Float32Array(1024).fill(0.5)];

    // Phase 1: stereo
    for (let frame = 0; frame < 10; frame++) {
      processor.process([stereoInput], []);
    }
    const afterPhase1 = processor.messages.length;

    // Phase 2: mono (channel drop)
    for (let frame = 0; frame < 10; frame++) {
      processor.process([monoInput], []);
    }

    // Phase 3: stereo again
    for (let frame = 0; frame < 10; frame++) {
      processor.process([stereoInput], []);
    }

    // Should have more metrics overall
    expect(processor.messages.length).toBeGreaterThan(afterPhase1);

    // Final metrics should be stereo
    const lastMsg = processor.messages[processor.messages.length - 1];
    expect(lastMsg.channels).toBe(2);
    expect(Number.isFinite(lastMsg.rms)).toBe(true);
  });

  it('should handle simultaneous channel drop and NaN corruption', () => {
    const processor = new MockDSPProcessor(44100);
    const cleanStereo = [
      new Float32Array(1024).fill(0.5),
      new Float32Array(1024).fill(0.5),
    ];
    const monoWithNaN = [new Float32Array(1024)];
    monoWithNaN[0][512] = NaN;

    // Start clean
    for (let frame = 0; frame < 10; frame++) {
      processor.process([cleanStereo], []);
    }

    // Channel drop + NaN in same frame
    for (let frame = 0; frame < 10; frame++) {
      const result = processor.process([monoWithNaN], []);
      expect(result).toBe(true);
    }

    // Return to clean stereo
    for (let frame = 0; frame < 15; frame++) {
      processor.process([cleanStereo], []);
    }

    // Should have recovered
    expect(processor.messages.length).toBeGreaterThan(0);
    const lastMsg = processor.messages[processor.messages.length - 1];
    expect(Number.isFinite(lastMsg.rms)).toBe(true);
    expect(Number.isFinite(lastMsg.peakRMS)).toBe(true);
  });
});

describe('D3 - Mixed Corruption Stress Tests', () => {
  it('should reject buffer with mixed NaN + Infinity + valid samples', () => {
    const processor = new MockDSPProcessor(44100);
    const cleanInput = [new Float32Array(1024).fill(0.4)];

    // Warmup: 20 clean frames
    for (let frame = 0; frame < 20; frame++) {
      processor.process([cleanInput], []);
    }
    const warmupMetrics = processor.messages.length;

    // Corrupted: mix of NaN, Infinity, -Infinity, and valid data
    const corrupted = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      if (i % 100 === 0) {
        corrupted[i] = NaN;
      } else if (i % 100 === 1) {
        corrupted[i] = Infinity;
      } else if (i % 100 === 2) {
        corrupted[i] = -Infinity;
      } else {
        corrupted[i] = 0.5;
      }
    }

    // Process corrupted frames
    for (let frame = 0; frame < 10; frame++) {
      const result = processor.process([corrupted], []);
      expect(result).toBe(true);
    }

    // No new metrics emitted during corruption
    expect(processor.messages.length).toBe(warmupMetrics);

    // Recovery with clean data
    for (let frame = 0; frame < 20; frame++) {
      processor.process([cleanInput], []);
    }

    expect(processor.messages.length).toBeGreaterThan(warmupMetrics);
    const lastMsg = processor.messages[processor.messages.length - 1];
    expect(Number.isFinite(lastMsg.rms)).toBe(true);
  });

  it('should reject buffer with mixed undefined + NaN in same channel', () => {
    const processor = new MockDSPProcessor(44100);

    const mixedCorruption = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      if (i % 200 === 0) {
        mixedCorruption[i] = undefined;
      } else if (i % 200 === 100) {
        mixedCorruption[i] = NaN;
      } else {
        mixedCorruption[i] = 0.3;
      }
    }

    // Mixed stereo: one clean channel, one corrupted
    const stereoMixed = [
      new Float32Array(1024).fill(0.5),
      mixedCorruption,
    ];

    const result = processor.process([stereoMixed], []);
    expect(result).toBe(true);

    // The processor should skip metrics for this frame but not crash
    expect(processor.process([[new Float32Array(1024).fill(0.5)]], [])).toBe(true);
  });

  it('should handle multi-channel buffer with partial corruption', () => {
    const processor = new MockDSPProcessor(44100);

    // Create a stereo buffer where one channel has NaN in the middle
    const leftChannel = new Float32Array(1024).fill(0.6);
    const rightChannel = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      if (i >= 400 && i <= 600) {
        rightChannel[i] = NaN;
      } else {
        rightChannel[i] = 0.2;
      }
    }

    // First process clean stereo to establish baseline
    for (let frame = 0; frame < 20; frame++) {
      processor.process([
        [new Float32Array(1024).fill(0.5), new Float32Array(1024).fill(0.3)],
      ], []);
    }
    const baseline = processor.messages.length;

    // Process corrupted stereo
    const result = processor.process([[leftChannel, rightChannel]], []);
    expect(result).toBe(true);

    // No new metrics from corrupted frame
    expect(processor.messages.length).toBe(baseline);

    // Process clean stereo again
    for (let frame = 0; frame < 20; frame++) {
      processor.process([
        [new Float32Array(1024).fill(0.5), new Float32Array(1024).fill(0.3)],
      ], []);
    }

    expect(processor.messages.length).toBeGreaterThan(baseline);
    const lastMsg = processor.messages[processor.messages.length - 1];
    expect(Number.isFinite(lastMsg.rms)).toBe(true);
  });

  it('should survive 100 consecutive frames of mixed corruption', () => {
    const processor = new MockDSPProcessor(44100);
    const cleanInput = [new Float32Array(1024).fill(0.25)];

    // Initial clean frames for warmup
    for (let frame = 0; frame < 20; frame++) {
      processor.process([cleanInput], []);
    }
    const initialCount = processor.messages.length;

    // 100 frames of alternating clean and mixed corruption
    for (let frame = 0; frame < 100; frame++) {
      if (frame % 2 === 0) {
        // Clean frame
        processor.process([cleanInput], []);
      } else {
        // Mixed corruption: NaN, Infinity, undefined, and valid samples
        const corrupt = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          const r = Math.random();
          if (r < 0.05) {
            corrupt[i] = NaN;
          } else if (r < 0.1) {
            corrupt[i] = Infinity;
          } else if (r < 0.15) {
            corrupt[i] = -Infinity;
          } else {
            corrupt[i] = 0.5 * Math.sin(i * 0.01);
          }
        }
        processor.process([corrupt], []);
      }
    }

    // All emitted metrics must pass strict Number.isFinite validation
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
      expect(Number.isFinite(msg.peakRMS)).toBe(true);
      expect(Number.isFinite(msg.bass)).toBe(true);
      expect(Number.isFinite(msg.mid)).toBe(true);
      expect(Number.isFinite(msg.treble)).toBe(true);
    }

    // Must have emitted from clean frames (after warmup)
    expect(processor.messages.length).toBeGreaterThan(initialCount);
  });

  it('should validate all edge cases in a single stress scenario', () => {
    const processor = new MockDSPProcessor(44100);
    const cleanInput = [new Float32Array(1024).fill(0.1)];
    let allResultsTrue = true;

    // Stress sequence: various corruption types
    const scenarios = [
      // null input
      () => processor.process(null, []),
      // empty input
      () => processor.process([], []),
      // empty channel buffer
      () => processor.process([[new Float32Array(0)]], []),
      // undefined value in buffer
      () => {
        const buf = new Float32Array(1024);
        buf[0] = undefined;
        return processor.process([buf], []);
      },
      // NaN in buffer
      () => {
        const buf = new Float32Array(1024);
        buf[0] = NaN;
        return processor.process([buf], []);
      },
      // Infinity in buffer
      () => {
        const buf = new Float32Array(1024);
        buf[0] = Infinity;
        return processor.process([buf], []);
      },
      // -Infinity in buffer
      () => {
        const buf = new Float32Array(1024);
        buf[0] = -Infinity;
        return processor.process([buf], []);
      },
      // Clean frame
      () => processor.process([cleanInput], []),
      // Mono channel
      () => processor.process([[new Float32Array(1024).fill(0.8)]], []),
      // Stereo channel
      () => processor.process([
        [new Float32Array(1024).fill(0.7), new Float32Array(1024).fill(0.9)],
      ], []),
    ];

    // Run each scenario 5 times
    for (let rep = 0; rep < 5; rep++) {
      for (const scenario of scenarios) {
        const result = scenario();
        if (result !== true) allResultsTrue = false;
      }
    }

    expect(allResultsTrue).toBe(true);

    // Every emitted metric must be finite
    for (const msg of processor.messages) {
      expect(Number.isFinite(msg.rms)).toBe(true);
      expect(Number.isFinite(msg.peakRMS)).toBe(true);
    }
  });
});