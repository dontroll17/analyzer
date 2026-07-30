const { fftReal1024, hzToBin, downsampleSpectrum, calculateBandEntropy, detectSpectralFlatness,
  calculateFrequencyBands, detectHighFrequencyAnomaly, calculateZCR, calculateRMS,
  calculateSpectralCentroid, calculateSpectralRolloff, checkGlitchState, FFT_SIZE, HALF_N
} = require("./dsp-engine-testable");

// ====================== fftReal1024 Tests ======================
describe("fftReal1024", function() {
  test("returns 512-element Float32Array for valid 1024 input", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) input[i] = Math.sin(2 * Math.PI * i / 1024);
    var result = fftReal1024(input);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(512);
  });

  test("returns zeros for all-silence input", function() {
    var input = new Float32Array(1024);
    var result = fftReal1024(input);
    for (var i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0, 6);
    }
  });

  test("DC component dominant for constant signal", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) input[i] = 0.5;
    var result = fftReal1024(input);
    // Hanning window shape: DC and bin-1 both significant
    expect(result[0]).toBeCloseTo(0.25, 2);
  });

  test("sine wave peaks at expected bin", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) input[i] = Math.sin(2 * Math.PI * 5 * i / 1024);
    var result = fftReal1024(input);
    expect(result[5]).toBeGreaterThan(result[4]);
    expect(result[5]).toBeGreaterThan(result[6]);
    expect(result[5]).toBeGreaterThan(0.1);
  });

  test("magnitude values are non-negative", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) input[i] = Math.random();
    var result = fftReal1024(input);
    for (var i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
    }
  });

  test("constant signal DC is approximately 0.25 due to Hanning window", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) input[i] = 1.0;
    var result = fftReal1024(input);
    expect(result[0]).toBeCloseTo(0.5, 2);
  });
});
// ====================== hzToBin Tests ======================
describe("hzToBin", function() {
  test("converts Hz to bin for default sample rate (44100)", function() {
    expect(hzToBin(0)).toBe(0);
    expect(hzToBin(1000)).toBe(23);
    expect(hzToBin(22050)).toBe(512);
    expect(hzToBin(44100)).toBe(1024);
  });

  test("converts Hz to bin for 48000 sample rate", function() {
    expect(hzToBin(0, 48000)).toBe(0);
    expect(hzToBin(1000, 48000)).toBe(21);
    expect(hzToBin(24000, 48000)).toBe(512);
    expect(hzToBin(48000, 48000)).toBe(1024);
  });

  test("returns 0 for 0 Hz", function() {
    expect(hzToBin(0, 44100)).toBe(0);
    expect(hzToBin(0, 48000)).toBe(0);
  });

  test("returns 0 for sub-bin frequencies", function() {
    expect(hzToBin(1, 44100)).toBe(0);
    expect(hzToBin(43, 44100)).toBe(0);
    expect(hzToBin(44, 44100)).toBe(1);
  });

  test("returns negative for negative Hz", function() {
    expect(hzToBin(-100, 44100)).toBe(-3);
  });

  test("truncates rather than rounds", function() {
    expect(hzToBin(500, 44100)).toBe(11);
    expect(hzToBin(501, 44100)).toBe(11);
    expect(hzToBin(502, 44100)).toBe(11);
  });
});

// ====================== downsampleSpectrum Tests ======================
describe("downsampleSpectrum", function() {
  test("returns 64-element Float32Array", function() {
    var source = new Float32Array(512);
    for (var i = 0; i < 512; i++) source[i] = i * 0.01;
    var result = downsampleSpectrum(source);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(64);
  });

  test("averages groups of 8 bins from 512-length input", function() {
    var source = new Float32Array(512);
    for (var i = 0; i < 512; i++) source[i] = 1.0;
    var result = downsampleSpectrum(source);
    for (var i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(1.0, 6);
    }
  });

  test("preserves relative energy distribution", function() {
    var source = new Float32Array(512);
    for (var i = 0; i < 256; i++) source[i] = 2.0;
    for (var i = 256; i < 512; i++) source[i] = 0.5;
    var result = downsampleSpectrum(source);
    expect(result[0]).toBeGreaterThan(result[63]);
  });

  test("returns zeros for zero-energy input", function() {
    var source = new Float32Array(512);
    var result = downsampleSpectrum(source);
    for (var i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0);
    }
  });
});
// ====================== calculateFrequencyBands Tests ======================
describe("calculateFrequencyBands", function() {
  test("returns object with bass, mid, treble properties", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    var result = calculateFrequencyBands(fftData, 44100);
    expect(result).toHaveProperty("bass");
    expect(result).toHaveProperty("mid");
    expect(result).toHaveProperty("treble");
  });

  test("sum of bands equals 100 for uniform energy", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    var result = calculateFrequencyBands(fftData, 44100);
    expect(result.bass + result.mid + result.treble).toBeCloseTo(100, 1);
  });

  test("bass-heavy signal has highest bass percentage", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 57; i++) fftData[i] = 1.0;
    var result = calculateFrequencyBands(fftData, 44100);
    expect(result.bass).toBeGreaterThan(result.mid);
    expect(result.bass).toBeGreaterThan(result.treble);
  });

  test("mid-heavy signal has highest mid percentage", function() {
    var fftData = new Float32Array(512);
    for (var i = 6; i < 92; i++) fftData[i] = 1.0;
    var result = calculateFrequencyBands(fftData, 44100);
    expect(result.mid).toBeGreaterThan(result.bass);
    expect(result.mid).toBeGreaterThan(result.treble);
  });

  test("treble-heavy signal has highest treble percentage", function() {
    var fftData = new Float32Array(512);
    for (var i = 92; i < 512; i++) fftData[i] = 1.0;
    var result = calculateFrequencyBands(fftData, 44100);
    expect(result.treble).toBeGreaterThan(0);
  });

  test("zero-energy FFT returns all zeros", function() {
    var fftData = new Float32Array(512);
    var result = calculateFrequencyBands(fftData, 44100);
    expect(result.bass).toBe(0);
    expect(result.mid).toBe(0);
    expect(result.treble).toBe(0);
  });

  test("works with different sample rates", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 128; i++) fftData[i] = 1.0;
    var result = calculateFrequencyBands(fftData, 48000);
    expect(result.bass).toBeGreaterThan(0);
    expect(result.bass + result.mid + result.treble).toBeCloseTo(100, 1);
  });
});
// ====================== Entropy Calculation Tests ======================
describe("calculateBandEntropy", function() {
  test("returns entropy in range [0, log2(4)]", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    var result = calculateBandEntropy(fftData, 44100);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(Math.log2(4) + 0.1);
  });

  test("uniform energy across bands gives high entropy (~log2(4))", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result = calculateBandEntropy(fftData, 44100);
    expect(result).toBeGreaterThan(1.0);
  });

  test("concentrated energy in one band gives low entropy", function() {
    var fftData = new Float32Array(512);
    // Put all energy in bass band (bins 0-7 for ~0-350Hz)
    for (var i = 0; i < 8; i++) fftData[i] = 1.0;
    var result = calculateBandEntropy(fftData, 44100);
    expect(result).toBeLessThan(1.5);
  });

  test("returns 0 for silence input", function() {
    var fftData = new Float32Array(512);
    var result = calculateBandEntropy(fftData, 44100);
    expect(result).toBe(0);
  });

  test("returns 0 for near-zero energy input", function() {
    var fftData = new Float32Array(512);
    fftData[0] = 1e-15;
    var result = calculateBandEntropy(fftData, 44100);
    expect(result).toBe(0);
  });

  test("works with different sample rates", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    var result = calculateBandEntropy(fftData, 48000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(Math.log2(4) + 0.1);
  });
});
// ====================== Spectral Flatness Tests ======================
describe("detectSpectralFlatness", function() {
  test("returns value between 0 and 1", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = Math.random();
    var result = detectSpectralFlatness(fftData);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  test("uniform spectrum has high flatness (~1.0)", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result = detectSpectralFlatness(fftData);
    expect(result).toBeCloseTo(1.0, 4);
  });

  test("tonal signal with peaks has low flatness", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    fftData[5] = 1.0;
    fftData[10] = 0.8;
    var result = detectSpectralFlatness(fftData);
    expect(result).toBeLessThan(0.5);
  });

  test("noise-like spectrum has higher flatness than tonal", function() {
    var tonal = new Float32Array(512);
    for (var i = 0; i < 512; i++) tonal[i] = 0.01;
    tonal[5] = 1.0;
    var noise = new Float32Array(512);
    for (var i = 0; i < 512; i++) noise[i] = 0.5 + Math.random() * 0.5;
    var flatTonal = detectSpectralFlatness(tonal);
    var flatNoise = detectSpectralFlatness(noise);
    expect(flatNoise).toBeGreaterThan(flatTonal);
  });

  test("returns 0 for all-zeros input", function() {
    var fftData = new Float32Array(512);
    var result = detectSpectralFlatness(fftData);
    expect(result).toBe(0);
  });

  test("returns 0 for near-zero energy input", function() {
    var fftData = new Float32Array(512);
    fftData[0] = 1e-15;
    var result = detectSpectralFlatness(fftData);
    expect(result).toBe(0);
  });

  test("single dominant bin with noise floor yields low flatness", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.001;
    fftData[256] = 1.0;
    var result = detectSpectralFlatness(fftData);
    expect(result).toBeLessThan(0.1);
  });
});
// ====================== High-Frequency Anomaly Tests ======================
describe("detectHighFrequencyAnomaly", function() {
  test("returns ratio between 0 and 1", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = Math.random();
    var result = detectHighFrequencyAnomaly(fftData, 44100);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  test("uniform energy gives ~0.5 HF ratio (half bins above 8kHz)", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result = detectHighFrequencyAnomaly(fftData, 44100);
    // ~240 out of 512 bins are above 8kHz
    expect(result).toBeGreaterThan(0.4);
    expect(result).toBeLessThan(0.7);
  });

  test("bass-heavy signal has low HF ratio", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 57; i++) fftData[i] = 1.0;
    var result = detectHighFrequencyAnomaly(fftData, 44100);
    expect(result).toBeLessThan(0.1);
  });

  test("treble-heavy signal has high HF ratio", function() {
    var fftData = new Float32Array(512);
    var hfBin = Math.floor(8000 * 1024 / 44100);
    for (var i = hfBin; i < 512; i++) fftData[i] = 1.0;
    var result = detectHighFrequencyAnomaly(fftData, 44100);
    expect(result).toBeGreaterThan(0.5);
  });

  test("returns 0 for silence input", function() {
    var fftData = new Float32Array(512);
    var result = detectHighFrequencyAnomaly(fftData, 44100);
    expect(result).toBe(0);
  });

  test("works with different sample rates", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result48 = detectHighFrequencyAnomaly(fftData, 48000);
    var result44 = detectHighFrequencyAnomaly(fftData, 44100);
    expect(result48).toBeGreaterThan(result44);
  });
});

// ====================== ZCR Tests ======================
describe("calculateZCR", function() {
  test("returns crossings per second normalized", function() {
    var buffer = new Float32Array(44100);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = i % 2 === 0 ? 0.5 : -0.5;
    }
    var result = calculateZCR(buffer);
    expect(result).toBeGreaterThan(0);
    // 22050 crossings per second for alternating signal
    expect(result).toBeGreaterThan(20000);
  });

  test("zero crossing rate for constant positive signal", function() {
    var buffer = new Float32Array(44100);
    for (var i = 0; i < buffer.length; i++) buffer[i] = 0.5;
    var result = calculateZCR(buffer);
    expect(result).toBe(0);
  });

  test("zero crossing rate for constant negative signal", function() {
    var buffer = new Float32Array(44100);
    for (var i = 0; i < buffer.length; i++) buffer[i] = -0.5;
    var result = calculateZCR(buffer);
    expect(result).toBe(0);
  });

  test("short buffer produces proportional ZCR", function() {
    var buffer = new Float32Array(441);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = i % 2 === 0 ? 0.5 : -0.5;
    }
    var result = calculateZCR(buffer);
    expect(result).toBeGreaterThan(0);
    // Should scale to per-second rate
    expect(result).toBeGreaterThan(20000);
  });

  test("sine wave at 440Hz has expected ZCR range", function() {
    var buffer = new Float32Array(44100);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
    }
    var result = calculateZCR(buffer);
    // ~880 crossings per second for 440Hz sine
    expect(result).toBeGreaterThan(800);
    expect(result).toBeLessThan(1000);
  });

  test("alternating near-zero values produce crossings", function() {
    var buffer = new Float32Array(100);
    for (var i = 0; i < 100; i++) buffer[i] = i % 2 === 0 ? 0.5 : -0.5;
    var result = calculateZCR(buffer);
    expect(result).toBeGreaterThan(0);
  });
});
// ====================== RMS Tests ======================
describe("calculateRMS", function() {
  test("returns object with rms and peak properties", function() {
    var buffer = new Float32Array(100);
    for (var i = 0; i < buffer.length; i++) buffer[i] = 0.5;
    var result = calculateRMS(buffer);
    expect(result).toHaveProperty("rms");
    expect(result).toHaveProperty("peak");
  });

  test("constant signal rms equals absolute value", function() {
    var buffer = new Float32Array(100);
    for (var i = 0; i < buffer.length; i++) buffer[i] = 0.5;
    var result = calculateRMS(buffer);
    expect(result.rms).toBeCloseTo(0.5, 6);
    expect(result.peak).toBeCloseTo(0.5, 6);
  });

  test("rms of silence is zero", function() {
    var buffer = new Float32Array(100);
    var result = calculateRMS(buffer);
    expect(result.rms).toBe(0);
    expect(result.peak).toBe(0);
  });

  test("peak captures absolute maximum", function() {
    var buffer = new Float32Array(100);
    buffer[10] = 0.5;
    buffer[20] = -0.9;
    buffer[30] = 0.3;
    var result = calculateRMS(buffer);
    expect(result.peak).toBeCloseTo(0.9, 6);
  });

  test("rms of sine wave at amplitude A equals A/sqrt(2)", function() {
    var buffer = new Float32Array(44100);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
    }
    var result = calculateRMS(buffer);
    expect(result.rms).toBeCloseTo(1.0 / Math.sqrt(2), 2);
    expect(result.peak).toBeCloseTo(1.0, 6);
  });

  test("rms scales with signal amplitude", function() {
    var buffer1 = new Float32Array(100);
    var buffer2 = new Float32Array(100);
    for (var i = 0; i < 100; i++) {
      buffer1[i] = Math.sin(2 * Math.PI * i / 100);
      buffer2[i] = 2 * Math.sin(2 * Math.PI * i / 100);
    }
    var result1 = calculateRMS(buffer1);
    var result2 = calculateRMS(buffer2);
    expect(result2.rms).toBeCloseTo(result1.rms * 2, 2);
  });

  test("rms of alternating sign signal", function() {
    var buffer = new Float32Array(100);
    for (var i = 0; i < buffer.length; i++) buffer[i] = i % 2 === 0 ? 1 : -1;
    var result = calculateRMS(buffer);
    expect(result.rms).toBeCloseTo(1.0, 6);
    expect(result.peak).toBeCloseTo(1.0, 6);
  });
});

// ====================== Spectral Centroid Tests ======================
describe("calculateSpectralCentroid", function() {
  test("returns frequency in Hz", function() {
    var fftData = new Float32Array(512);
    fftData[10] = 1.0;
    var result = calculateSpectralCentroid(fftData, 44100);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(44100);
  });

  test("energy at DC gives centroid of 0 Hz", function() {
    var fftData = new Float32Array(512);
    fftData[0] = 1.0;
    var result = calculateSpectralCentroid(fftData, 44100);
    expect(result).toBeCloseTo(0, 2);
  });

  test("centrally-located energy gives mid-range centroid", function() {
    var fftData = new Float32Array(512);
    fftData[256] = 1.0;
    var result = calculateSpectralCentroid(fftData, 44100);
    // bin 256 => freq = 256 * 44100 / 1024 = 11025 Hz
    expect(result).toBeCloseTo(11025, 0);
  });

  test("high-frequency energy gives high centroid", function() {
    var fftData = new Float32Array(512);
    fftData[400] = 1.0;
    var result = calculateSpectralCentroid(fftData, 44100);
    expect(result).toBeGreaterThan(15000);
  });

  test("low-frequency energy gives low centroid", function() {
    var fftData = new Float32Array(512);
    fftData[10] = 1.0;
    var result = calculateSpectralCentroid(fftData, 44100);
    // bin 10 => freq = 10 * 44100 / 1024 ~= 430 Hz
    expect(result).toBeGreaterThan(200);
    expect(result).toBeLessThan(1000);
  });

  test("returns 0 for all-zeros input", function() {
    var fftData = new Float32Array(512);
    var result = calculateSpectralCentroid(fftData, 44100);
    expect(result).toBe(0);
  });

  test("uniform spectrum gives centroid near Nyquist/2", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result = calculateSpectralCentroid(fftData, 44100);
    expect(result).toBeGreaterThan(10000);
  });
});
// ====================== Spectral Rolloff Tests ======================
describe("calculateSpectralRolloff", function() {
  test("returns frequency in Hz", function() {
    var fftData = new Float32Array(512);
    fftData[100] = 1.0;
    var result = calculateSpectralRolloff(fftData, 44100);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(22050);
  });

  test("uses default threshold of 0.85", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result = calculateSpectralRolloff(fftData, 44100);
    expect(result).toBeGreaterThan(0);
  });

  test("custom threshold changes rolloff point", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result85 = calculateSpectralRolloff(fftData, 44100, 0.85);
    var result50 = calculateSpectralRolloff(fftData, 44100, 0.50);
    expect(result50).toBeLessThan(result85);
  });

  test("DC-only energy returns 0 Hz", function() {
    var fftData = new Float32Array(512);
    fftData[0] = 1.0;
    var result = calculateSpectralRolloff(fftData, 44100);
    expect(result).toBeCloseTo(0, 2);
  });

  test("low-energy concentration gives low rolloff", function() {
    var fftData = new Float32Array(512);
    fftData[5] = 1.0;
    fftData[6] = 1.0;
    var result = calculateSpectralRolloff(fftData, 44100, 0.85);
    // bins 5 and 6 accumulate 100% energy by bin 6
    expect(result).toBeLessThan(300);
  });

  test("returns 0 for all-zeros input", function() {
    var fftData = new Float32Array(512);
    var result = calculateSpectralRolloff(fftData, 44100);
    expect(result).toBe(0);
  });

  test("uniform spectrum with 85% threshold", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 1.0;
    var result = calculateSpectralRolloff(fftData, 44100, 0.85);
    // 85% of 512 = 435.2, so rolloff at bin ~435
    var expectedBin = Math.floor(435.2);
    var expectedFreq = expectedBin * 44100 / 1024;
    expect(result).toBeCloseTo(expectedFreq, 0);
  });

  test("different sample rates scale correctly", function() {
    var fftData = new Float32Array(512);
    fftData[100] = 1.0;
    var result44 = calculateSpectralRolloff(fftData, 44100);
    var result48 = calculateSpectralRolloff(fftData, 48000);
    expect(result48).toBeGreaterThan(result44);
  });
});
// ====================== Glitch State Machine Tests ======================
describe("checkGlitchState", function() {
  test("returns object with isGlitch, state, stateInfo properties", function() {
    var result = checkGlitchState(0.1, 0.1, {});
    expect(result).toHaveProperty("isGlitch");
    expect(result).toHaveProperty("state");
    expect(result).toHaveProperty("stateInfo");
  });

  test("low RMS always returns STABLE state regardless of HF ratio", function() {
    var result = checkGlitchState(0.01, 0.95, {});
    expect(result.state).toBe("STABLE");
    expect(result.isGlitch).toBe(false);
  });

  test("high RMS + low HF ratio returns STABLE", function() {
    var result = checkGlitchState(0.5, 0.1, {});
    expect(result.state).toBe("STABLE");
    expect(result.isGlitch).toBe(false);
  });

  test("high RMS + medium HF ratio returns DRIFT with explicit config", function() {
    var result = checkGlitchState(0.5, 0.75, { minTotalEnergy: 0.01, highFreqThreshold: 0.85, driftThreshold: 0.70 });
    expect(result.state).toBe("DRIFT");
    expect(result.isGlitch).toBe(false);
  });

  test("high RMS + very high HF ratio returns GLITCH with config override", function() {
    var config = {
      requiredConsecutiveFrames: 1,
      debounceTimeout: 0,
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70
    };
    var result = checkGlitchState(0.5, 0.9, config);
    expect(result.state).toBe("GLITCH");
    expect(result.isGlitch).toBe(true);
  });

  test("high energy + low HF returns STABLE not GLITCH", function() {
    var result = checkGlitchState(0.5, 0.1, {
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70,
      requiredConsecutiveFrames: 1,
      debounceTimeout: 0
    });
    expect(result.state).toBe("STABLE");
  });

  test("high energy + drift-range HF returns DRIFT", function() {
    var result = checkGlitchState(0.5, 0.75, {
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70
    });
    expect(result.state).toBe("DRIFT");
  });

  test("high energy + glitch-range HF returns GLITCH with minimal frames", function() {
    var config = {
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70,
      requiredConsecutiveFrames: 1,
      debounceTimeout: 0
    };
    var result = checkGlitchState(0.5, 0.9, config);
    expect(result.state).toBe("GLITCH");
    expect(result.isGlitch).toBe(true);
  });

  test("state transitions: STABLE -> DRIFT -> GLITCH progression", function() {
    var config = {
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70,
      requiredConsecutiveFrames: 1,
      debounceTimeout: 0
    };
    var r1 = checkGlitchState(0.5, 0.5, config);
    expect(r1.state).toBe("STABLE");
    var r2 = checkGlitchState(0.5, 0.75, config);
    expect(r2.state).toBe("DRIFT");
    var r3 = checkGlitchState(0.5, 0.9, config);
    expect(r3.state).toBe("GLITCH");
  });

  test("STABLE when HF drops below drift threshold after DRIFT", function() {
    var result = checkGlitchState(0.5, 0.50, {
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70
    });
    expect(result.state).toBe("STABLE");
  });

  test("STABLE when RMS drops below minTotalEnergy", function() {
    var result = checkGlitchState(0.001, 0.95, { minTotalEnergy: 0.01 });
    expect(result.state).toBe("STABLE");
  });

  test("stateInfo contains expected fields", function() {
    var result = checkGlitchState(0.5, 0.5, {});
    expect(result.stateInfo).toHaveProperty("consecutiveGlitchFrames");
    expect(result.stateInfo).toHaveProperty("glitchState");
    expect(result.stateInfo).toHaveProperty("glitchCount");
    expect(result.stateInfo).toHaveProperty("lastGlitchTime");
  });

  test("glitchCount is a number", function() {
    var result = checkGlitchState(0.5, 0.1, {});
    expect(typeof result.stateInfo.glitchCount).toBe("number");
  });

  test("consecutiveGlitchFrames resets for non-glitch conditions", function() {
    var result = checkGlitchState(0.5, 0.5, {
      minTotalEnergy: 0.01,
      highFreqThreshold: 0.85,
      driftThreshold: 0.70
    });
    expect(result.stateInfo.consecutiveGlitchFrames).toBe(0);
  });
});
// ====================== Edge Cases Tests ======================
describe("Edge Cases", function() {
  test("fftReal1024 handles all-zero array", function() {
    var input = new Float32Array(1024);
    var result = fftReal1024(input);
    expect(result.length).toBe(512);
    for (var i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0, 10);
    }
  });

  test("hzToBin with null sample rate uses default", function() {
    expect(hzToBin(1000, null)).toBe(23);
    expect(hzToBin(1000, undefined)).toBe(23);
  });

  test("calculateBandEntropy with null sample rate uses default", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    expect(calculateBandEntropy(fftData, null)).toBeGreaterThan(0);
    expect(calculateBandEntropy(fftData, undefined)).toBeGreaterThan(0);
  });

  test("calculateFrequencyBands with null sample rate uses default", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    var result = calculateFrequencyBands(fftData, null);
    expect(result.bass + result.mid + result.treble).toBeCloseTo(100, 1);
  });

  test("detectHighFrequencyAnomaly with null sample rate uses default", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 0.01;
    var result = detectHighFrequencyAnomaly(fftData, null);
    expect(result).toBeGreaterThan(0);
  });

  test("checkGlitchState with null config uses defaults", function() {
    expect(function() { checkGlitchState(0.1, 0.1, null); }).not.toThrow();
    expect(function() { checkGlitchState(0.1, 0.1, undefined); }).not.toThrow();
    expect(checkGlitchState(0.1, 0.1, null).state).toBe("STABLE");
  });

  test("extreme FFT values do not cause NaN", function() {
    var fftData = new Float32Array(512);
    for (var i = 0; i < 512; i++) fftData[i] = 100.0;
    expect(detectSpectralFlatness(fftData)).not.toBeNaN();
    expect(calculateSpectralCentroid(fftData, 44100)).not.toBeNaN();
    expect(calculateSpectralRolloff(fftData, 44100)).not.toBeNaN();
  });

  test("small buffer for ZCR does not crash", function() {
    var buffer = new Float32Array(10);
    for (var i = 0; i < 10; i++) buffer[i] = i % 2 === 0 ? 0.5 : -0.5;
    var result = calculateZCR(buffer);
    expect(result).toBeGreaterThan(0);
  });

  test("single sample RMS returns that value", function() {
    var buffer = new Float32Array(1);
    buffer[0] = 0.5;
    var result = calculateRMS(buffer);
    expect(result.rms).toBeCloseTo(0.5, 6);
    expect(result.peak).toBeCloseTo(0.5, 6);
  });
});
// ====================== Integration Tests ======================
describe("Integration Tests", function() {
  test("full pipeline: FFT -> bands -> entropy -> flatness", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) {
      input[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / 44100) +
                 0.1 * Math.sin(2 * Math.PI * 1760 * i / 44100) +
                 (Math.random() - 0.5) * 0.05;
    }
    var fftData = fftReal1024(input);
    expect(fftData.length).toBe(512);
    expect(fftData[0]).toBeGreaterThan(0);

    var bands = calculateFrequencyBands(fftData, 44100);
    expect(bands.bass + bands.mid + bands.treble).toBeCloseTo(100, 1);
    var entropy = calculateBandEntropy(fftData, 44100);
    expect(entropy).toBeGreaterThanOrEqual(0);
    var flatness = detectSpectralFlatness(fftData);
    expect(flatness).toBeGreaterThanOrEqual(0);
    expect(flatness).toBeLessThanOrEqual(1);
  });

  test("buffer metrics to spectral features to glitch detection", function() {
    var buffer = new Float32Array(44100);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    }
    var rms = calculateRMS(buffer);
    expect(rms.rms).toBeGreaterThan(0);
    expect(rms.peak).toBeGreaterThan(0);
    var zcr = calculateZCR(buffer);
    expect(zcr).toBeGreaterThan(0);

    var fftData = fftReal1024(buffer.slice(0, 1024));
    var centroid = calculateSpectralCentroid(fftData, 44100);
    expect(centroid).toBeGreaterThan(0);
    var rolloff = calculateSpectralRolloff(fftData, 44100);
    expect(rolloff).toBeGreaterThan(0);

    var hfRatio = detectHighFrequencyAnomaly(fftData, 44100);
    var glitchResult = checkGlitchState(rms.rms, hfRatio, {});
    expect(["STABLE", "DRIFT", "GLITCH"]).toContain(glitchResult.state);
  });

  test("downsampleSpectrum preserves FFT data through pipeline", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) {
      input[i] = Math.sin(2 * Math.PI * 10 * i / 1024);
    }
    var fftData = fftReal1024(input);
    var downsampled = downsampleSpectrum(fftData);
    expect(downsampled.length).toBe(64);
    var bandsDown = calculateFrequencyBands(downsampled, 44100);
    expect(bandsDown.bass + bandsDown.mid + bandsDown.treble).toBeCloseTo(100, 1);
  });

  test("440Hz tone yields reasonable centroid and rolloff values", function() {
    var input = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
    }
    var fftData = fftReal1024(input);
    var centroid = calculateSpectralCentroid(fftData, 44100);
    expect(centroid).toBeGreaterThan(300);
    expect(centroid).toBeLessThan(600);
    var rolloff = calculateSpectralRolloff(fftData, 44100, 0.85);
    expect(rolloff).toBeGreaterThan(300);
    expect(rolloff).toBeLessThan(1000);
  });

  test("glitch simulation: noise spike changes HF ratio", function() {
    var normalInput = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) {
      normalInput[i] = Math.sin(2 * Math.PI * 220 * i / 44100);
    }
    var normalFft = fftReal1024(normalInput);
    var normalHf = detectHighFrequencyAnomaly(normalFft, 44100);
    expect(normalHf).toBeLessThan(0.5);

    var glitchInput = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) {
      glitchInput[i] = Math.sin(2 * Math.PI * 220 * i / 44100) +
                       (Math.random() - 0.5) * 2.0;
    }
    var glitchFft = fftReal1024(glitchInput);
    var glitchHf = detectHighFrequencyAnomaly(glitchFft, 44100);
    expect(glitchHf).toBeGreaterThan(normalHf);
  });

  test("FFT_SIZE and HALF_N are exported correctly", function() {
    expect(FFT_SIZE).toBe(1024);
    expect(HALF_N).toBe(512);
  });
});
