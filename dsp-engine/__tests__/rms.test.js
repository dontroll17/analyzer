import RMS from '../rms.js';

describe('RMS', () => {
  describe('calculate()', () => {
    test('returns 0 for empty buffer', () => {
      expect(new RMS().calculate(new Float32Array(0))).toBe(0);
    });

    test('returns 0 for null buffer', () => {
      expect(new RMS().calculate(null)).toBe(0);
    });

    test('returns correct RMS for silence (all zeros)', () => {
      const buffer = new Float32Array(1024);
      expect(new RMS().calculate(buffer)).toBe(0);
    });

    test('returns correct RMS for constant signal', () => {
      const buffer = new Float32Array(1024).fill(0.5);
      const rms = new RMS().calculate(buffer);
      expect(rms).toBeCloseTo(0.5, 5);
    });

    test('returns correct RMS for single value', () => {
      const buffer = new Float32Array([0.707]);
      const rms = new RMS().calculate(buffer);
      expect(rms).toBeCloseTo(0.707, 3);
    });

    test('returns correct RMS for sine wave (theoretical = 1/sqrt(2) ≈ 0.7071)', () => {
      const samples = 1024;
      const buffer = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        buffer[i] = Math.sin(2 * Math.PI * i / samples);
      }
      const rms = new RMS().calculate(buffer);
      // Full sine wave RMS = 1/sqrt(2) ≈ 0.7071
      expect(rms).toBeCloseTo(0.7071, 3);
    });

    test('handles negative values same as positive (squared)', () => {
      const posBuffer = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const negBuffer = new Float32Array([-0.5, -0.5, -0.5, -0.5]);
      const posRms = new RMS().calculate(posBuffer);
      const negRms = new RMS().calculate(negBuffer);
      expect(posRms).toBeCloseTo(negRms);
    });

    test('handles mixed positive/negative values', () => {
      const buffer = new Float32Array([1, -1, 1, -1]);
      const rms = new RMS().calculate(buffer);
      // sqrt((1+1+1+1)/4) = sqrt(1) = 1
      expect(rms).toBeCloseTo(1, 5);
    });

    test('handles array (not Float32Array)', () => {
      const buffer = [0.3, 0.4, 0.5];
      const rms = new RMS().calculate(buffer);
      // sqrt((0.09 + 0.16 + 0.25) / 3) = sqrt(0.5/3) = sqrt(0.1667) ≈ 0.4082
      expect(rms).toBeCloseTo(0.4082, 3);
    });
  });

  describe('calculateSliding()', () => {
    test('returns 0 for empty buffer', () => {
      expect(new RMS().calculateSliding(new Float32Array(0))).toBe(0);
    });

    test('uses window when buffer is larger', () => {
      const buffer = new Float32Array(2048);
      // First half: silent, second half: loud
      buffer.fill(0, 0, 1024);
      buffer.fill(1, 1024, 2048);
      
      const rms = new RMS();
      // Sliding window should see only the last 1024 samples (all 1s)
      const slidingRms = rms.calculateSliding(buffer, 1024);
      expect(slidingRms).toBeCloseTo(1, 5);
    });

    test('uses full buffer when smaller than window', () => {
      const buffer = new Float32Array([0.5, 0.5]);
      const rms = new RMS();
      const slidingRms = rms.calculateSliding(buffer, 1024);
      expect(slidingRms).toBeCloseTo(0.5, 5);
    });
  });

  describe('calculateDBFS()', () => {
    test('returns -100 for silence', () => {
      const buffer = new Float32Array(1024);
      expect(new RMS().calculateDBFS(buffer)).toBe(-100);
    });

    test('returns 0 dBFS for full scale', () => {
      const buffer = new Float32Array(1024).fill(1);
      const dbfs = new RMS().calculateDBFS(buffer);
      expect(dbfs).toBeCloseTo(0, 5);
    });

    test('returns negative values for sub-max signals', () => {
      const buffer = new Float32Array(1024).fill(0.5);
      const dbfs = new RMS().calculateDBFS(buffer);
      // 20 * log10(0.5) ≈ -6.02 dBFS
      expect(dbfs).toBeCloseTo(-6.02, 1);
      expect(dbfs).toBeLessThan(0);
    });

    test('returns correct dBFS for half-amplitude sine', () => {
      const samples = 1024;
      const buffer = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        buffer[i] = 0.5 * Math.sin(2 * Math.PI * i / samples);
      }
      const dbfs = new RMS().calculateDBFS(buffer);
      // RMS = 0.5/sqrt(2), 20*log10(0.5/sqrt(2)) ≈ -9.03 dBFS
      expect(dbfs).toBeCloseTo(-9.03, 1);
    });
  });

  describe('rmsToPercentage()', () => {
    test('converts 0 to 0%', () => {
      expect(RMS.rmsToPercentage(0)).toBe(0);
    });

    test('converts 1 to 100%', () => {
      expect(RMS.rmsToPercentage(1)).toBe(100);
    });

    test('converts 0.5 to 50%', () => {
      expect(RMS.rmsToPercentage(0.5)).toBe(50);
    });

    test('clamps values > 1 to 100%', () => {
      expect(RMS.rmsToPercentage(1.5)).toBe(100);
    });

    test('clamps values < 0 to 0%', () => {
      expect(RMS.rmsToPercentage(-0.5)).toBe(0);
    });

    test('converts 0.25 to 25%', () => {
      expect(RMS.rmsToPercentage(0.25)).toBe(25);
    });
  });

  describe('classifyLevel()', () => {
    test('SILENCE for rms < 0.01', () => {
      expect(RMS.classifyLevel(0)).toBe('SILENCE');
      expect(RMS.classifyLevel(0.005)).toBe('SILENCE');
      expect(RMS.classifyLevel(0.0099)).toBe('SILENCE');
    });

    test('LOW for 0.01 <= rms < 0.1', () => {
      expect(RMS.classifyLevel(0.01)).toBe('LOW');
      expect(RMS.classifyLevel(0.05)).toBe('LOW');
      expect(RMS.classifyLevel(0.0999)).toBe('LOW');
    });

    test('MEDIUM for 0.1 <= rms < 0.3', () => {
      expect(RMS.classifyLevel(0.1)).toBe('MEDIUM');
      expect(RMS.classifyLevel(0.2)).toBe('MEDIUM');
      expect(RMS.classifyLevel(0.2999)).toBe('MEDIUM');
    });

    test('HIGH for 0.3 <= rms < 0.7', () => {
      expect(RMS.classifyLevel(0.3)).toBe('HIGH');
      expect(RMS.classifyLevel(0.5)).toBe('HIGH');
      expect(RMS.classifyLevel(0.6999)).toBe('HIGH');
    });

    test('CRITICAL for rms >= 0.7', () => {
      expect(RMS.classifyLevel(0.7)).toBe('CRITICAL');
      expect(RMS.classifyLevel(0.8)).toBe('CRITICAL');
      expect(RMS.classifyLevel(1.0)).toBe('CRITICAL');
    });

    test('boundary values match expected levels', () => {
      expect(RMS.classifyLevel(0.01 - 1e-10)).toBe('SILENCE');
      expect(RMS.classifyLevel(0.01)).toBe('LOW');
      expect(RMS.classifyLevel(0.1 - 1e-10)).toBe('LOW');
      expect(RMS.classifyLevel(0.1)).toBe('MEDIUM');
      expect(RMS.classifyLevel(0.3 - 1e-10)).toBe('MEDIUM');
      expect(RMS.classifyLevel(0.3)).toBe('HIGH');
      expect(RMS.classifyLevel(0.7 - 1e-10)).toBe('HIGH');
      expect(RMS.classifyLevel(0.7)).toBe('CRITICAL');
    });
  });

  describe('static calculateStatic()', () => {
    test('provides one-time calculation', () => {
      const buffer = new Float32Array([0.6, 0.8]);
      const rms = RMS.calculateStatic(buffer);
      // sqrt((0.36 + 0.64) / 2) = sqrt(0.5) ≈ 0.7071
      expect(rms).toBeCloseTo(0.7071, 3);
    });

    test('handles empty buffer', () => {
      expect(RMS.calculateStatic(new Float32Array(0))).toBe(0);
    });
  });

  describe('instance methods', () => {
    test('getCumulativeRMS returns 0 before calculation', () => {
      expect(new RMS().getCumulativeRMS()).toBe(0);
    });

    test('getCumulativeRMS returns value after calculation', () => {
      const rms = new RMS();
      const buffer = new Float32Array(1024).fill(0.5);
      rms.calculate(buffer);
      expect(rms.getCumulativeRMS()).toBeCloseTo(0.5, 5);
    });

    test('reset() clears all state', () => {
      const rms = new RMS();
      const buffer = new Float32Array(1024).fill(0.5);
      rms.calculate(buffer);
      expect(rms.getCumulativeRMS()).toBeCloseTo(0.5, 5);
      
      rms.reset();
      expect(rms.getCumulativeRMS()).toBe(0);
      expect(rms.sampleCount).toBe(0);
    });
  });
});
