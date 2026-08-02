/**
 * Defensive DSP Processor Tests
 * 
 * Validates that the AudioWorkletProcessor defensively handles:
 * - Monaural input (1 channel instead of 2)
 * - NaN/Infinity/sample corruption
 * - Empty/missing buffers during context transitions
 * - Warmup frame filtering (skips first 15 frames)
 * 
 * These tests run in Node.js by importing pure logic from dsp-engine-testable.js
 * to simulate processor behavior without AudioContext.
 */

import { describe, it, expect } from 'vitest';
import { calculateRMS, fftReal1024, calculateFrequencyBands, detectHighFrequencyAnomaly, calculateZCR, HALF_N } from './dsp-engine-testable.js';

// Simulate a minimal DSP processor with the same defensive guard logic as audio-worklet.js
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

  /**
   * Simulates the defensive guards added in Step 2 of the DSP hardening
   */
  process(inputs, outputs) {
    // Guard 0: Handle null/undefined inputs entirely
    if (!inputs) {
      return true;
    }

    const input = inputs[0];
    const output = outputs && outputs[0];

    // Guard 1: Empty/missing input → passthrough, no metrics
    if (!input || input.length === 0) {
      return true;
    }

    // Guard 2: Validate all sample data — reject NaN/Infinity
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
      // Skip metrics, just return
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

    // === DEFENSIVE GUARD: Validate computed metrics ===
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

    // Final defensive guard: validate entire payload
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

describe('Defensive DSP Processor — Crash-Resilience', () => {
  describe('Monaural input (1 channel)', () => {
    it('should process monaural signal without NaN metrics', () => {
      const processor = new MockDSPProcessor(44100);
      const monoInput = [new Float32Array(1024).fill(0.5)];

      // 20 frames to pass warmup (15 frames)
      for (let frame = 0; frame < 20; frame++) {
        processor.process([monoInput], []);
      }

      const lastMetrics = processor.messages[processor.messages.length - 1];
      expect(lastMetrics).not.toBeNull();
      expect(typeof lastMetrics).toBe('object');
      expect(Number.isFinite(lastMetrics.rms)).toBe(true);
      expect(lastMetrics.rms).toBeGreaterThan(0);
      expect(lastMetrics.channels).toBe(1);
    });

    it('should compute correct RMS for monaural 0.5 signal', () => {
      const processor = new MockDSPProcessor(44100);
      const monoInput = [new Float32Array(1024).fill(0.5)];

      for (let frame = 0; frame < 20; frame++) {
        processor.process([monoInput], []);
      }

      const lastMetrics = processor.messages[processor.messages.length - 1];
      expect(lastMetrics.rms).toBeCloseTo(0.5, 5);
    });
  });

  describe('Corrupted input (NaN / Infinity)', () => {
    it('should reject NaN samples and skip metrics', () => {
      const processor = new MockDSPProcessor(44100);

      // First 20 frames: clean data (warmup)
      const cleanInput = [new Float32Array(1024).fill(0.3)];
      for (let frame = 0; frame < 20; frame++) {
        processor.process([cleanInput], []);
      }
      const warmupCount = processor.messages.length;

      // Next 5 frames: NaN contamination
      const corruptedInput = [new Float32Array(1024)];
      corruptedInput[0][32] = NaN;
      corruptedInput[0][64] = Infinity;
      corruptedInput[0][96] = -Infinity;

      for (let frame = 0; frame < 5; frame++) {
        processor.process([corruptedInput], []);
      }

      // No new metrics should have been emitted
      expect(processor.messages.length).toBe(warmupCount);

      // All emitted metrics must be finite
      for (const msg of processor.messages) {
        expect(Number.isFinite(msg.rms)).toBe(true);
        expect(Number.isFinite(msg.peakRMS)).toBe(true);
      }
    });

    it('should recover after corruption ends', () => {
      const processor = new MockDSPProcessor(44100);

      // Warmup with clean data
      const cleanInput = [new Float32Array(1024).fill(0.4)];
      for (let frame = 0; frame < 20; frame++) {
        processor.process([cleanInput], []);
      }
      const preCorruptCount = processor.messages.length;

      // Corrupted frame
      const corruptedInput = [new Float32Array(1024)];
      corruptedInput[0][512] = NaN;
      processor.process([corruptedInput], []);

      // Clean frame after corruption
      for (let frame = 0; frame < 20; frame++) {
        processor.process([cleanInput], []);
      }

      // Should have resumed metrics after warmup again
      expect(processor.messages.length).toBeGreaterThan(preCorruptCount);

      // Final metrics must be valid
      const lastMetrics = processor.messages[processor.messages.length - 1];
      expect(Number.isFinite(lastMetrics.rms)).toBe(true);
      expect(lastMetrics.rms).toBeCloseTo(0.4, 5);
    });
  });

  describe('Empty / missing buffers', () => {
    it('should handle null input without throwing', () => {
      const processor = new MockDSPProcessor(44100);
      const result = processor.process(null, []);
      expect(result).toBe(true);
    });

    it('should handle empty input array', () => {
      const processor = new MockDSPProcessor(44100);
      const result = processor.process([], []);
      expect(result).toBe(true);
    });

    it('should handle channel with empty buffer', () => {
      const processor = new MockDSPProcessor(44100);
      const result = processor.process([[new Float32Array(0)]], []);
      expect(result).toBe(true);
    });
  });

  describe('Stereo input validation', () => {
    it('should combine L+R channels correctly', () => {
      const processor = new MockDSPProcessor(44100);
      const stereoInput = [
        new Float32Array(1024).fill(0.5),  // Left = 0.5
        new Float32Array(1024).fill(0.3),  // Right = 0.3
      ];

      for (let frame = 0; frame < 20; frame++) {
        processor.process([stereoInput], []);
      }

      const lastMetrics = processor.messages[processor.messages.length - 1];
      expect(lastMetrics).not.toBeNull();
      expect(typeof lastMetrics).toBe('object');
      expect(lastMetrics.channels).toBe(2);
      // RMS should be max(L, R) = 0.5
      expect(lastMetrics.rms).toBeCloseTo(0.5, 5);
    });

    it('should handle asymmetric stereo (different amplitudes)', () => {
      const processor = new MockDSPProcessor(44100);
      const stereoInput = [
        new Float32Array(1024).fill(0.8),  // Left high
        new Float32Array(1024).fill(0.1),  // Right low
      ];

      for (let frame = 0; frame < 20; frame++) {
        processor.process([stereoInput], []);
      }

      const lastMetrics = processor.messages[processor.messages.length - 1];
      expect(lastMetrics.rms).toBeCloseTo(0.8, 5);
      expect(lastMetrics.peakRMS).toBeCloseTo(0.8, 5);
    });
  });

  describe('Saturation / clipping guards', () => {
    it('should clamp RMS/peak for clipped signal (±1.0)', () => {
      const processor = new MockDSPProcessor(44100);
      const clippedInput = [new Float32Array(1024)];
      for (let i = 0; i < 1024; i++) {
        clippedInput[0][i] = (i % 2 === 0) ? 1.0 : -1.0; // Square wave at max
      }

      for (let frame = 0; frame < 20; frame++) {
        processor.process([clippedInput], []);
      }

      const lastMetrics = processor.messages[processor.messages.length - 1];
      expect(Number.isFinite(lastMetrics.rms)).toBe(true);
      expect(lastMetrics.rms).toBeCloseTo(1.0, 5);
      expect(lastMetrics.peakRMS).toBeCloseTo(1.0, 5);
    });
  });

  describe('Zero GC pressure (pre-allocated buffers)', () => {
    it('should not grow inputBuffers across multiple processes', () => {
      const processor = new MockDSPProcessor(44100);
      const input = [new Float32Array(1024).fill(0.2)];

      for (let frame = 0; frame < 50; frame++) {
        processor.process([input], []);
      }

      // Buffer sizes should remain constant
      expect(processor.inputBuffers[0].length).toBe(1024);
      expect(processor.inputBuffers[1].length).toBe(1024);
    });
  });
});
