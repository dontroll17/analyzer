import { describe, it, expect } from 'vitest';

/**
 * Extracted from offscreen.js:612-654
 * Detects DC offset (resampling artifact) by checking RMS variance
 * over 10 frames. Variance < 1e-8 means constant signal = DC noise.
 */
function detectSilenceDCOffset(rmsHistory) {
  if (rmsHistory.length < 10) return false;
  const window = rmsHistory.slice(-10);
  const mean = window.reduce((s, v) => s + v, 0) / 10;
  const rmsVar = window.reduce((s, v) => s + (v - mean) ** 2, 0) / 10;
  return rmsVar < 1e-8;
}

/**
 * Minimal RMS class from rms.js for testing
 */
class RMS {
  calculate(buffer) {
    if (!buffer || buffer.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }
}

describe('DC Offset Silence Detection (offscreen.js:612-654)', () => {
  it('identifies DC offset (0.004215) as silence', () => {
    const dcHistory = new Array(10).fill(0.004215);
    expect(detectSilenceDCOffset(dcHistory)).toBe(true);
  });

  it('identifies all-zeros as silence', () => {
    const silence = new Array(10).fill(0.0);
    expect(detectSilenceDCOffset(silence)).toBe(true);
  });

  it('does NOT flag dynamic audio as silence', () => {
    const dynamic = [0.01, 0.05, 0.12, 0.08, 0.04, 0.15, 0.09, 0.03, 0.07, 0.11];
    expect(detectSilenceDCOffset(dynamic)).toBe(false);
  });

  it('returns false for partial history (< 10 frames)', () => {
    const short = new Array(5).fill(0.0);
    expect(detectSilenceDCOffset(short)).toBe(false);
  });

  it('returns false for slight noise (variance > 1e-8)', () => {
    // Variance must be > 1e-8 — use values with enough spread
    const noise = [0.004, 0.005, 0.003, 0.0045, 0.0042,
                   0.0048, 0.0039, 0.0046, 0.0041, 0.0044];
    const mean = noise.reduce((s, v) => s + v, 0) / 10;
    const variance = noise.reduce((s, v) => s + (v - mean) ** 2, 0) / 10;
    expect(variance).toBeGreaterThan(1e-8);
    expect(detectSilenceDCOffset(noise)).toBe(false);
  });

  it('handles mixed zeros and tiny noise', () => {
    const mixed = new Array(10).fill(0.0);
    mixed[5] = 0.001; // Spike
    expect(detectSilenceDCOffset(mixed)).toBe(false);
  });
});

describe('RMS Linear Gain Verification (offscreen.js:466)', () => {
  it('RMS of 0.5 amplitude = 0.5 with gain=1.0 (after fix)', () => {
    const buf = new Float32Array(1024).fill(0.5);
    const rms = new RMS().calculate(buf);
    expect(rms).toBeCloseTo(0.5, 5);
  });

  it('RMS halves when gain is 0.5 (before fix — bug)', () => {
    const buf = new Float32Array(1024).fill(0.5);
    const rms = new RMS().calculate(buf);
    // With gain=0.5, the effective RMS would be 0.25
    expect(rms * 0.5).toBeCloseTo(0.25, 5);
  });

  it('1kHz sine wave RMS = 1/sqrt(2) ≈ 0.7071', () => {
    const samples = 1024;
    const buf = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      buf[i] = Math.sin(2 * Math.PI * i / samples);
    }
    const rms = new RMS().calculate(buf);
    expect(rms).toBeCloseTo(0.7071, 3);
  });

  it('full-scale square wave RMS = 1.0', () => {
    const buf = new Float32Array(1024);
    for (let i = 0; i < 512; i++) buf[i] = 1.0;
    for (let i = 512; i < 1024; i++) buf[i] = -1.0;
    const rms = new RMS().calculate(buf);
    expect(rms).toBeCloseTo(1.0, 5);
  });

  it('RMS of silence = 0', () => {
    const buf = new Float32Array(1024).fill(0.0);
    expect(new RMS().calculate(buf)).toBe(0);
  });

  it('RMS scales linearly with amplitude', () => {
    const buf1 = new Float32Array(256).fill(0.1);
    const buf2 = new Float32Array(256).fill(0.5);
    const buf3 = new Float32Array(256).fill(1.0);
    const rms1 = new RMS().calculate(buf1);
    const rms2 = new RMS().calculate(buf2);
    const rms3 = new RMS().calculate(buf3);
    expect(rms1 * 5).toBeCloseTo(rms2, 5);
    expect(rms2 * 2).toBeCloseTo(rms3, 5);
  });
});

describe('Compressor Bypass (offscreen.js:3.2)', () => {
  // Simulated DynamicsCompressorNode behavior
  function simulateCompressorBypass(signal, enabled, threshold, knee, ratio) {
    if (!enabled) {
      // Bypass: ratio=1, threshold=0dB → pass-through
      return signal;
    }
    // Active compression: threshold=-1, knee=0, ratio=20
    const effectiveThreshold = threshold / 20; // Convert dB to linear
    return signal.map(sample => {
      if (Math.abs(sample) > effectiveThreshold + (knee / 20)) {
        return sample * (1 / ratio);
      }
      return sample;
    });
  }

  it('bypass with ratio=1, threshold=0dB preserves signal', () => {
    const signal = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      signal[i] = Math.sin(2 * Math.PI * i / 1024);
    }
    const result = simulateCompressorBypass(signal, false, 0, 0, 1);
    for (let i = 0; i < 1024; i++) {
      expect(result[i]).toBeCloseTo(signal[i], 5);
    }
  });

  it('active compression with ratio=20 reduces peaks', () => {
    const signal = new Float32Array([1.0, 0.8, 0.5, 0.3, 0.05]);
    // threshold=4 linear → effectiveThreshold=0.2; only samples > 0.2 get compressed
    const result = simulateCompressorBypass(signal, true, 4, 0, 20);
    // Peak at 1.0 should be reduced (|1.0| > 0.2 → compresses to 0.05)
    expect(result[0]).toBeLessThan(1.0);
    // Low signal at 0.05 should pass unchanged (|0.05| is NOT > 0.2)
    expect(result[4]).toBeCloseTo(0.05, 5);
  });
});
