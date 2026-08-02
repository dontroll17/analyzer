/**
 * Limiter DSP Tests
 * 
 * Tests for createLimiterCurve, dbToLinear, linearToDb, kneeLinearToDb
 */

import { describe, it, expect } from 'vitest';

// Dynamic import for CommonJS module
const limiter = await import('../limiter.js');
const { createLimiterCurve, dbToLinear, linearToDb, kneeLinearToDb } = limiter;

describe('createLimiterCurve', () => {
  it('should return a Float32Array', () => {
    const curve = createLimiterCurve(-3, 4);
    expect(curve).toBeInstanceOf(Float32Array);
  });

  it('should have correct number of samples (441 * oversampleRate)', () => {
    const curve4x = createLimiterCurve(-3, 4);
    expect(curve4x.length).toBe(441 * 4); // 1764

    const curve2x = createLimiterCurve(-3, 2);
    expect(curve2x.length).toBe(441 * 2); // 882

    const curve8x = createLimiterCurve(-3, 8);
    expect(curve8x.length).toBe(441 * 8); // 3528
  });

  it('should pass through values near zero (below threshold)', () => {
    const curve = createLimiterCurve(-20, 4); // -20dB = ~0.1 linear
    // At low amplitudes, output should equal input
    const midIndex = Math.floor(curve.length / 2);
    const halfRange = Math.floor(curve.length * 0.01); // 1% range from center
    for (let i = midIndex - halfRange; i < midIndex + halfRange; i++) {
      const x = (i * 2 / curve.length) - 1;
      expect(Math.abs(curve[i] - x)).toBeLessThan(0.001);
    }
  });

  it('should clamp output to [-1, 1]', () => {
    const curve = createLimiterCurve(-60, 4); // Very low threshold — heavy limiting
    for (let i = 0; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(-1);
      expect(curve[i]).toBeLessThanOrEqual(1);
    }
  });

  it('should have symmetric curve (final sample mirrors first)', () => {
    const curve = createLimiterCurve(-3, 4);
    expect(curve[curve.length - 1]).toBe(-curve[0]);
  });

  it('should compress above threshold (output < input for high amplitudes)', () => {
    const curve = createLimiterCurve(-3, 4);
    const threshold = Math.pow(10, -3 / 20); // -3dB in linear
    const knee = 0.05;
    const highIndex = Math.floor(curve.length * 0.95);
    const x = (highIndex * 2 / curve.length) - 1;
    // Output should be less than input for high amplitudes
    expect(curve[highIndex]).toBeLessThan(x);
    expect(curve[highIndex]).toBeLessThan(threshold + knee);
  });

  it('should handle extreme threshold values', () => {
    const curveMin = createLimiterCurve(-100, 4); // Near silence threshold
    const curveMax = createLimiterCurve(0, 4);     // Full threshold
    for (let i = 0; i < curveMin.length; i++) {
      expect(curveMin[i]).toBeGreaterThanOrEqual(-1);
      expect(curveMin[i]).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < curveMax.length; i++) {
      expect(curveMax[i]).toBeGreaterThanOrEqual(-1);
      expect(curveMax[i]).toBeLessThanOrEqual(1);
    }
  });

  it('should produce identical curve for same parameters (deterministic)', () => {
    const curve1 = createLimiterCurve(-6, 4);
    const curve2 = createLimiterCurve(-6, 4);
    expect(curve1.length).toBe(curve2.length);
    for (let i = 0; i < curve1.length; i++) {
      expect(curve1[i]).toBe(curve2[i]);
    }
  });
});

describe('dbToLinear', () => {
  it('should convert 0 dB to linear 1.0', () => {
    expect(dbToLinear(0)).toBe(1.0);
  });

  it('should convert -20 dB to linear 0.1', () => {
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 5);
  });

  it('should convert -40 dB to linear 0.01', () => {
    expect(dbToLinear(-40)).toBeCloseTo(0.01, 5);
  });

  it('should handle negative dB values', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 3);
    expect(dbToLinear(-12)).toBeCloseTo(0.251, 3);
  });

  it('should handle positive dB values', () => {
    expect(dbToLinear(6)).toBeCloseTo(1.995, 3);
    expect(dbToLinear(12)).toBeCloseTo(3.981, 3);
  });
});

describe('linearToDb', () => {
  it('should convert linear 1.0 to 0 dB', () => {
    expect(linearToDb(1.0)).toBe(0);
  });

  it('should convert linear 0.1 to -20 dB', () => {
    expect(linearToDb(0.1)).toBe(-20);
  });

  it('should return -Infinity for zero input', () => {
    expect(linearToDb(0)).toBe(-Infinity);
  });

  it('should return -Infinity for negative input', () => {
    expect(linearToDb(-0.5)).toBe(-Infinity);
  });

  it('should convert linear 0.5 to approximately -6 dB', () => {
    expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
});

describe('kneeLinearToDb', () => {
  it('should convert default knee 0.05 to ~0.44 dB', () => {
    const result = kneeLinearToDb(0.05);
    // 20 * log10(1.05) ≈ 0.414 dB
    expect(result).toBeCloseTo(0.41, 1);
  });

  it('should return 0 dB for zero knee', () => {
    expect(kneeLinearToDb(0)).toBe(0);
  });

  it('should produce larger dB values for larger knee', () => {
    expect(kneeLinearToDb(0.1)).toBeGreaterThan(kneeLinearToDb(0.05));
    expect(kneeLinearToDb(0.5)).toBeGreaterThan(kneeLinearToDb(0.1));
  });
});

describe('createLimiterCurve — integration', () => {
  it('should create a usable curve for waveShaper integration', () => {
    const threshold = -3;
    const oversample = 4;
    const curve = createLimiterCurve(threshold, oversample);

    // At center (input = 0), curve should be near 0
    const centerIdx = Math.floor(curve.length / 2);
    expect(Math.abs(curve[centerIdx])).toBeLessThan(0.01);

    // At high amplitude (input near 1), curve should be compressed below input
    const highIdx = curve.length - 10;
    const highInput = 1.0;
    expect(curve[highIdx]).toBeLessThan(highInput);

    // At low amplitude (input near -1), curve should be compressed below input
    const lowIdx = 9;
    const lowInput = -1.0;
    expect(curve[lowIdx]).toBeGreaterThan(lowInput); // clamped -1 → higher value
  });

  it('should handle edge case: threshold at -1dB with 2x oversample', () => {
    const curve = createLimiterCurve(-1, 2);
    expect(curve).not.toBeNull();
    expect(curve.length).toBe(882);

    // All values should be finite
    for (let i = 0; i < curve.length; i++) {
      expect(isFinite(curve[i])).toBe(true);
    }
  });
});
