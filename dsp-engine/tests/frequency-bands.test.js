/**
 * Tests for frequency bands calculation with FFT
 *
 * Compares buggy (total energy) vs fixed (average energy) implementations
 * to demonstrate that per-bin averaging produces more accurate band ratios.
 */

const { fftReal1024 } = require('./dsp-engine-testable');

// Seeded PRNG for deterministic tests (mulberry32)
function createRng(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hzToBin(hz, sampleRate) {
  return Math.floor(hz * 1024 / (sampleRate || 44100));
}

function calculateFrequencyBandsBuggy(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  const bandEdges = [20, 250, 250, 4000, 4000, 16000];
  const edges = bandEdges.map(function(hz) {
    return hzToBin(hz, sampleRate);
  });
  var bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;
  for (var i = 0, n = fftData.length; i < n; i++) {
    var energy = fftData[i] * fftData[i];
    if (i < edges[1]) { bassEnergy += energy; }
    else if (i < edges[3]) { midEnergy += energy; }
    else if (i < edges[5]) { trebleEnergy += energy; }
  }
  var totalEnergy = bassEnergy + midEnergy + trebleEnergy;
  var normalize = function(val) {
    return totalEnergy > 0 ? (val / totalEnergy) * 100 : 0;
  };
  return {
    bass: normalize(bassEnergy),
    mid: normalize(midEnergy),
    treble: normalize(trebleEnergy)
  };
}

function calculateFrequencyBandsFixed(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  const bandEdges = [20, 250, 250, 4000, 4000, 16000];
  const edges = bandEdges.map(function(hz) {
    return hzToBin(hz, sampleRate);
  });
  var bassSum = 0, bassCount = 0;
  var midSum = 0, midCount = 0;
  var trebleSum = 0, trebleCount = 0;
  for (var i = 0, n = fftData.length; i < n; i++) {
    var energy = fftData[i] * fftData[i];
    if (i < edges[1]) { bassSum += energy; bassCount++; }
    else if (i < edges[3]) { midSum += energy; midCount++; }
    else if (i < edges[5]) { trebleSum += energy; trebleCount++; }
  }
  var bassAvg = bassCount > 0 ? bassSum / bassCount : 0;
  var midAvg = midCount > 0 ? midSum / midCount : 0;
  var trebleAvg = trebleCount > 0 ? trebleSum / trebleCount : 0;
  var totalAvg = bassAvg + midAvg + trebleAvg;
  var normalize = function(val) {
    return totalAvg > 0 ? (val / totalAvg) * 100 : 0;
  };
  return {
    bass: normalize(bassAvg),
    mid: normalize(midAvg),
    treble: normalize(trebleAvg)
  };
}

describe('calculateFrequencyBands - Integration with FFT', () => {
  describe('Real-world audio simulations', () => {
    test('Bass-heavy music simulation 60Hz and 100Hz', () => {
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        input[i] = 0.7 * Math.sin(
          2 * Math.PI * 60 * i / 44100
        ) +
                    0.5 * Math.sin(
                      2 * Math.PI * 100 * i / 44100
                    );
      }
      const fft = fftReal1024(input);
      const fixed = calculateFrequencyBandsFixed(fft, 44100);
      expect(fixed.bass).toBeGreaterThan(fixed.mid);
      expect(fixed.bass).toBeGreaterThan(fixed.treble);
      expect(fixed.bass + fixed.mid + fixed.treble)
        .toBeCloseTo(100, 1);
    });

    test('Voice simulation 150Hz fundamental with harmonics', () => {
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        let val = 0;
        for (let h = 1; h <= 10; h++) {
          val += (1.0 / (h * h)) * Math.sin(
            2 * Math.PI * 150 * h * i / 44100
          );
        }
        input[i] = val;
      }
      const fft = fftReal1024(input);
      const fixed = calculateFrequencyBandsFixed(fft, 44100);
      expect(fixed.bass + fixed.mid)
        .toBeGreaterThan(fixed.treble * 2);
    });

    test('Hi-hat percussion simulation high frequency dominant', () => {
      const rng = createRng(42);
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        input[i] = (rng() - 0.5) *
          Math.exp(-i / 200) *
          Math.sin(2 * Math.PI * 8000 * i / 44100);
      }
      const fft = fftReal1024(input);
      const fixed = calculateFrequencyBandsFixed(fft, 44100);
      // Hi-hat at 8kHz: treble should be dominant (or at least > bass)
      expect(fixed.treble).toBeGreaterThan(10);
      expect(fixed.treble).toBeGreaterThan(fixed.mid);
    });

    test('Full spectrum simulation all bands present', () => {
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        input[i] =
          0.3 * Math.sin(2 * Math.PI * 100 * i / 44100) +
          0.3 * Math.sin(2 * Math.PI * 1000 * i / 44100) +
          0.3 * Math.sin(2 * Math.PI * 8000 * i / 44100) +
          (Math.random() - 0.5) * 0.1;
      }
      const fft = fftReal1024(input);
      const fixed = calculateFrequencyBandsFixed(fft, 44100);
      // With per-bin averaging, the distribution is more balanced
      expect(fixed.bass).toBeGreaterThan(1);
      expect(fixed.mid).toBeGreaterThan(1);
      expect(fixed.treble).toBeGreaterThan(1);
      expect(fixed.bass + fixed.mid + fixed.treble)
        .toBeCloseTo(100, 1);
    });

    test('Different sample rate 48000Hz produces correct results', () => {
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        input[i] = Math.sin(2 * Math.PI * 500 * i / 44100);
      }
      const fft = fftReal1024(input);
      const fixed48 = calculateFrequencyBandsFixed(fft, 48000);
      const fixed44 = calculateFrequencyBandsFixed(fft, 44100);
      expect(Math.abs(fixed48.mid - fixed44.mid))
        .toBeLessThan(10);
    });
  });

  describe('Bug verification comparing buggy vs fixed', () => {
    test('Buggy vs fixed produce similar results for pure low-frequency', () => {
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        input[i] = Math.sin(2 * Math.PI * 85 * i / 44100);
      }
      const fft = fftReal1024(input);
      const buggy = calculateFrequencyBandsBuggy(fft, 44100);
      const fixed = calculateFrequencyBandsFixed(fft, 44100);
      // Both should correctly identify this as bass-dominant
      expect(fixed.bass).toBeGreaterThan(95);
      expect(buggy.bass).toBeGreaterThan(fixed.bass - 1); // Similar, not over-inflated
    });

    test('Buggy version over-represents treble for broadband', () => {
      const rng = createRng(1);
      const input = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        input[i] = (rng() - 0.5) * 2.0;
      }
      const fft = fftReal1024(input);
      const buggy = calculateFrequencyBandsBuggy(fft, 44100);
      const fixed = calculateFrequencyBandsFixed(fft, 44100);
      expect(buggy.treble).toBeGreaterThan(70);
      expect(fixed.treble).toBeLessThan(40);
    });

    test('All bands sum to 100pct across scenarios', () => {
      function make100Hz() {
        const a = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          a[i] = Math.sin(2 * Math.PI * 100 * i / 44100);
        }
        return a;
      }
      function make1000Hz() {
        const a = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          a[i] = Math.sin(2 * Math.PI * 1000 * i / 44100);
        }
        return a;
      }
      function makeNoise() {
        const a = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          a[i] = (Math.random() - 0.5) * 2;
        }
        return a;
      }
      function make5000Hz() {
        const a = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          a[i] = Math.sin(2 * Math.PI * 5000 * i / 44100);
        }
        return a;
      }
      const scenarios = [
        make100Hz,
        make1000Hz,
        makeNoise,
        make5000Hz
      ];
      for (const gen of scenarios) {
        const fft = fftReal1024(gen());
        const buggySum = calculateFrequencyBandsBuggy(fft, 44100);
        const fixedSum = calculateFrequencyBandsFixed(fft, 44100);
        expect(buggySum.bass + buggySum.mid + buggySum.treble)
          .toBeCloseTo(100, 1);
        expect(fixedSum.bass + fixedSum.mid + fixedSum.treble)
          .toBeCloseTo(100, 1);
      }
    });
  });
});
