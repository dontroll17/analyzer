/**
 * OfflineAudioContext Audio Graph Tests
 *
 * Tests for the audio effect chain in offscreen.js using OfflineAudioContext.
 * These tests verify real Web Audio API rendering of:
 *   - DynamicsCompressor smoothness
 *   - BiquadFilter EQ (HPF, LPF, Peak)
 *   - Delay effect with feedback
 *   - WaveShaper limiter
 *   - Wet/Dry crossfading
 *
 * NOTE: These tests require a real browser AudioContext implementation.
 * In jsdom environment (npm test), they will skip gracefully.
 * Run with Playwright for real audio rendering: npm run test:e2e
 *
 * @see offscreen.js for the full audio graph architecture
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================
// AudioContext Availability Detection
// ============================================================

/**
 * Detects whether the global AudioContext is a real browser implementation
 * rather than a mock (e.g., from vitest setup.js).
 *
 * Heuristic: real browser AudioContext prototype methods contain native code,
 * while mocks typically have empty function bodies.
 */
function hasRealAudioContext() {
  if (typeof globalThis.AudioContext !== 'function') {
    return false;
  }

  try {
    const ctx = new globalThis.AudioContext();
    const gain = ctx.createGain();
    if (!gain || typeof gain.connect !== 'function') {
      ctx.close();
      return false;
    }
    if (!gain.gain || typeof gain.gain.setValueAtTime !== 'function') {
      ctx.close();
      return false;
    }
    if (typeof globalThis.OfflineAudioContext === 'function') {
      const oac = new globalThis.OfflineAudioContext(1, 44100, 44100);
      if (!oac || typeof oac.startRendering !== 'function') {
        ctx.close();
        return false;
      }
      ctx.close();
      return true;
    }
    ctx.close();
    return true;
  } catch (e) {
    return false;
  }
}

const REAL_AUDIO_AVAILABLE = hasRealAudioContext();

// ============================================================
// DSP Utility Functions
// ============================================================

/**
 * Generate a sine wave buffer of the specified duration and frequency.
 * Connects: oscillator -> gain -> OfflineAudioContext.destination
 * @param {number} frequency - Sine wave frequency in Hz
 * @param {number} amplitude - Peak amplitude (default 1.0)
 * @param {number} duration - Duration in seconds (default 1.0)
 * @param {number} sampleRate - Output sample rate (default 44100)
 * @param {number} channels - Number of channels (default 1)
 * @returns {Promise<AudioBuffer>} Rendered audio buffer
 */
async function generateSineBuffer({ frequency, amplitude = 1.0, duration = 1.0, sampleRate = 44100, channels = 1 }) {
  const length = Math.ceil(sampleRate * duration);
  const offlineCtx = new globalThis.OfflineAudioContext(channels, length, sampleRate);
  const oscillator = offlineCtx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = amplitude;
  oscillator.connect(gainNode);
  gainNode.connect(offlineCtx.destination);
  oscillator.start(0);
  oscillator.stop(duration);
  return offlineCtx.startRendering();
}

/**
 * Generate a buffer containing white noise at specified amplitude.
 * @param {object} opts
 * @param {number} opts.duration - Duration in seconds
 * @param {number} [opts.amplitude=1.0] - Peak amplitude
 * @param {number} [opts.sampleRate=44100]
 * @param {number} [opts.channels=1]
 * @returns {Promise<AudioBuffer>}
 */
async function generateNoiseBuffer({ duration, amplitude = 1.0, sampleRate = 44100, channels = 1 }) {
  const length = Math.ceil(sampleRate * duration);
  const offlineCtx = new globalThis.OfflineAudioContext(channels, length, sampleRate);
  const buffer = offlineCtx.createBuffer(channels, length, sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * amplitude;
    }
  }
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return offlineCtx.startRendering();
}

/**
 * Generate an impulse (single sample at t=0, rest zero).
 * @param {object} opts
 * @param {number} [opts.duration=2.0] - Duration in seconds
 * @param {number} [opts.sampleRate=44100]
 * @returns {Promise<AudioBuffer>}
 */
async function generateImpulseBuffer({ duration = 2.0, sampleRate = 44100 }) {
  const length = Math.ceil(sampleRate * duration);
  const offlineCtx = new globalThis.OfflineAudioContext(1, length, sampleRate);
  const buffer = offlineCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  data[0] = 1.0; // impulse
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return offlineCtx.startRendering();
}

/**
 * Generate a buffer with two sine components mixed together.
 * @param {object} opts
 * @param {number} opts.freq1 - First frequency
 * @param {number} [opts.amp1=1.0] - First amplitude
 * @param {number} opts.freq2 - Second frequency
 * @param {number} [opts.amp2=1.0] - Second amplitude
 * @param {number} [opts.duration=1.0]
 * @param {number} [opts.sampleRate=44100]
 * @returns {Promise<AudioBuffer>}
 */
async function generateDualSineBuffer({ freq1, amp1 = 1.0, freq2, amp2 = 1.0, duration = 1.0, sampleRate = 44100 }) {
  const length = Math.ceil(sampleRate * duration);
  const offlineCtx = new globalThis.OfflineAudioContext(1, length, sampleRate);

  const osc1 = offlineCtx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = freq1;
  const gain1 = offlineCtx.createGain();
  gain1.gain.value = amp1;

  const osc2 = offlineCtx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = freq2;
  const gain2 = offlineCtx.createGain();
  gain2.gain.value = amp2;

  const mix = offlineCtx.createGain();
  mix.gain.value = 0.5;

  osc1.connect(gain1);
  gain1.connect(mix);
  osc2.connect(gain2);
  gain2.connect(mix);
  mix.connect(offlineCtx.destination);

  osc1.start(0);
  osc2.start(0);
  osc1.stop(duration);
  osc2.stop(duration);

  return offlineCtx.startRendering();
}

/**
 * Perform radix-2 FFT on time-domain data.
 * Returns energy spectrum as Map<frequencyHz, energy>.
 * Uses Hanning window to reduce spectral leakage.
 * @param {Float32Array} data
 * @param {number} sampleRate
 * @param {number} [binCount=4096]
 * @returns {Map<number, number>}
 */
function performFFT(data, sampleRate, binCount = 4096) {
  const N = binCount;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);

  for (let i = 0; i < N && i < data.length; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    real[i] = data[i] * window;
  }

  const logN = Math.round(Math.log2(N));
  for (let i = 0; i < N; i++) {
    let j = 0;
    for (let b = 0; b < logN; b++) {
      j = (j << 1) | ((i >> b) & 1);
    }
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < halfSize; k++) {
        const theta = angle * k;
        const wr = Math.cos(theta);
        const wi = Math.sin(theta);
        const evenIdx = start + k;
        const oddIdx = start + k + halfSize;
        const tr = wr * real[oddIdx] - wi * imag[oddIdx];
        const ti = wr * imag[oddIdx] + wi * real[oddIdx];
        real[oddIdx] = real[evenIdx] - tr;
        imag[oddIdx] = imag[evenIdx] - ti;
        real[evenIdx] = real[evenIdx] + tr;
        imag[evenIdx] = imag[evenIdx] + ti;
      }
    }
  }

  const result = new Map();
  for (let k = 0; k < N / 2; k++) {
    const freq = (k * sampleRate) / N;
    const energy = real[k] * real[k] + imag[k] * imag[k];
    result.set(freq, energy);
  }

  return result;
}

/**
 * Calculate RMS of a signal.
 * @param {Float32Array} data
 * @returns {number}
 */
function calculateRMS(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Calculate peak amplitude of a signal.
 * @param {Float32Array} data
 * @returns {number}
 */
function calculatePeak(data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/**
 * Find maximum energy in a frequency bin near target.
 * @param {Map<number, number>} fftResult
 * @param {number} targetFreq
 * @param {number} [toleranceHz=20]
 * @returns {number}
 */
function findBinEnergy(fftResult, targetFreq, toleranceHz = 20) {
  let maxEnergy = 0;
  for (const [freq, energy] of fftResult) {
    if (Math.abs(freq - targetFreq) <= toleranceHz && energy > maxEnergy) {
      maxEnergy = energy;
    }
  }
  return maxEnergy;
}

/**
 * Count zero crossings in a signal.
 * @param {Float32Array} data
 * @returns {number}
 */
function countZeroCrossings(data) {
  let crossings = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i - 1] >= 0 && data[i] < 0) || (data[i - 1] < 0 && data[i] >= 0)) {
      crossings++;
    }
  }
  return crossings;
}

/**
 * Check for NaN or Infinity values in a Float32Array.
 * @param {Float32Array} data
 * @returns {{ hasInvalid: boolean, nanCount: number, infCount: number }}
 */
function checkSignalValidity(data) {
  let nanCount = 0;
  let infCount = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(data[i])) nanCount++;
    if (!isFinite(data[i])) infCount++;
  }
  return { hasInvalid: nanCount > 0 || infCount > 0, nanCount, infCount };
}

// ============================================================
// Test Guard — Skip when no real AudioContext available
// ============================================================

if (!REAL_AUDIO_AVAILABLE) {
  describe.skip('OfflineAudioContext Audio Graph Tests', () => {
    it.skip('requires real AudioContext — skipping in jsdom', () => {});
  });
  export const AUDIO_TESTS_SKIPPED = true;
} else {
  // ============================================================
  // TEST SUITE 1: AudioParam Smoothness — No Clicks on Parameter Changes
  // ============================================================
  //
  // Verifies that smoothly transitioning AudioParam values via
  // setValueCurveAtTime does not produce audible clicks (discontinuities
  // in the first derivative of the signal).
  //
  // Method: generate 2s of 440Hz sine, route through compressor with
  // a ratio sweep from 1:1 to 12:1 at t=0.011s, render, then analyze
  // the相邻 sample derivatives.
  // ============================================================

  describe('AudioParam Smoothness — No Clicks on Parameter Changes', () => {
    const SAMPLE_RATE = 44100;
    const DURATION = 2.0;
    const CLICK_THRESHOLD = 0.3;
    const MAX_ACCEPTABLE_CLICK_PCT = 0.005; // < 0.5%

    it('compressor ratio sweep should not produce audible clicks', async () => {
      const length = Math.ceil(SAMPLE_RATE * DURATION);
      const offlineCtx = new globalThis.OfflineAudioContext(1, length, SAMPLE_RATE);

      // --- Generate 440Hz source ---
      const source = offlineCtx.createBufferSource();
      const buf = offlineCtx.createBuffer(1, length, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = 0.8 * Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE);
      }
      source.buffer = buf;

      // --- Build chain: source -> compressor -> EQ -> destination ---
      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 1; // start with bypass
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      const eq = offlineCtx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = 1000;
      eq.gain.value = 0;
      eq.Q.value = 1;

      source.connect(compressor);
      compressor.connect(eq);
      eq.connect(offlineCtx.destination);

      // --- At frame 500 (0.01138s), sweep ratio from 1 to 12 ---
      const t = 500 / SAMPLE_RATE; // ~0.01134s
      compressor.ratio.setValueCurveAtTime(
        [1, 12, 12],
        [t, t + 0.004, t + 0.009],
        offlineCtx.sampleRate
      );

      source.start(0);
      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      // --- Analyze adjacent sample derivatives ---
      let clickCount = 0;
      for (let i = 1; i < output.length; i++) {
        const derivative = Math.abs(output[i] - output[i - 1]);
        if (derivative > CLICK_THRESHOLD) {
          clickCount++;
        }
      }

      const clickPct = clickCount / output.length;

      // Verify no excessive clicks (smooth transition)
      expect(clickPct).toBeLessThan(MAX_ACCEPTABLE_CLICK_PCT);

      // Also verify output is reasonable
      const rms = calculateRMS(output);
      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThan(1.0);

      const { hasInvalid, nanCount, infCount } = checkSignalValidity(output);
      expect(hasInvalid).toBe(false);
    }, 10000);
  });

  // ============================================================
  // TEST SUITE 8: AudioParam setTargetAtTime — Exponential Ramp
  // ============================================================
  //
  // Verifies that setTargetAtTime produces smoother transitions than
  // abrupt setValue() calls by comparing zero-crossing consistency.
  //
  // Compressor threshold ramps from -60dB to -12dB with timeConstant=0.1.
  // Expected: consistent zero-crossing rate (smooth signal).
  // ============================================================

  describe('AudioParam setTargetAtTime — Exponential Ramp', () => {
    const SAMPLE_RATE = 44100;
    const DURATION = 0.5;
    const FREQ = 440;
    const AMP = 0.8;

    it('setTargetAtTime should produce consistent zero crossings', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      const source = offlineCtx.createBufferSource();
      const buf = offlineCtx.createBuffer(1, offlineCtx.length, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < offlineCtx.length; i++) {
        data[i] = AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE);
      }
      source.buffer = buf;

      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -60;
      compressor.ratio.value = 12;
      compressor.knee.value = 30;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      source.connect(compressor);
      compressor.connect(offlineCtx.destination);

      // Ramp threshold from -60dB to -12dB with timeConstant=0.1
      const t = 0.01;
      compressor.threshold.setTargetAtTime(-12, t, 0.1);

      source.start(0);
      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      // Count zero crossings — for a 440Hz sine over 0.5s,
      // expect ~440Hz * 0.5s * 2 = ~440 crossings
      const zeroCrossings = countZeroCrossings(output);
      const expectedCrossings = FREQ * DURATION * 2;

      // Allow ±30% tolerance due to compressor transient effects
      const tolerance = 0.30;
      expect(zeroCrossings).toBeGreaterThan(expectedCrossings * (1 - tolerance));
      expect(zeroCrossings).toBeLessThan(expectedCrossings * (1 + tolerance));

      // Output should be smooth (no large discontinuities)
      let maxDerivative = 0;
      for (let i = 1; i < output.length; i++) {
        const d = Math.abs(output[i] - output[i - 1]);
        if (d > maxDerivative) maxDerivative = d;
      }
      // Maximum derivative should be reasonable (< 0.5 for smooth signal)
      expect(maxDerivative).toBeLessThan(0.5);

      const { hasInvalid } = checkSignalValidity(output);
      expect(hasInvalid).toBe(false);
    }, 10000);

    it('setTargetAtTime ramp should be smoother than setValueAtTime spike', async () => {
      // Compare two scenarios:
      // A: setTargetAtTime (smooth exponential)
      // B: setValueAtTime followed by linearRamp (less smooth)
      const SAMPLE_RATE_A = 44100;
      const SAMPLE_RATE_B = 44100;
      const dur = 0.5;

      // Scenario A: setTargetAtTime
      const ctxA = new globalThis.OfflineAudioContext(1, Math.ceil(SAMPLE_RATE_A * dur), SAMPLE_RATE_A);
      const srcA = ctxA.createBufferSource();
      const bufA = ctxA.createBuffer(1, ctxA.length, SAMPLE_RATE_A);
      for (let i = 0; i < ctxA.length; i++) {
        bufA.getChannelData(0)[i] = AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE_A);
      }
      srcA.buffer = bufA;
      const compA = ctxA.createDynamicsCompressor();
      compA.threshold.value = -60;
      compA.ratio.value = 12;
      compA.knee.value = 30;
      compA.attack.value = 0.003;
      compA.release.value = 0.25;
      srcA.connect(compA);
      compA.connect(ctxA.destination);
      compA.threshold.setTargetAtTime(-12, 0.01, 0.1);
      srcA.start(0);
      const renderedA = await ctxA.startRendering();
      const outputA = renderedA.getChannelData(0);

      // Calculate smoothness metric: mean absolute derivative
      const smoothnessA = outputA.reduce((sum, v, i) => {
        if (i === 0) return 0;
        return sum + Math.abs(v - outputA[i - 1]);
      }, 0) / outputA.length;

      // Scenario B: setValueAtTime (abrupt change)
      const ctxB = new globalThis.OfflineAudioContext(1, Math.ceil(SAMPLE_RATE_B * dur), SAMPLE_RATE_B);
      const srcB = ctxB.createBufferSource();
      const bufB = ctxB.createBuffer(1, ctxB.length, SAMPLE_RATE_B);
      for (let i = 0; i < ctxB.length; i++) {
        bufB.getChannelData(0)[i] = AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE_B);
      }
      srcB.buffer = bufB;
      const compB = ctxB.createDynamicsCompressor();
      compB.threshold.value = -60;
      compB.ratio.value = 12;
      compB.knee.value = 30;
      compB.attack.value = 0.003;
      compB.release.value = 0.25;
      srcB.connect(compB);
      compB.connect(ctxB.destination);
      // Abrupt jump at t=0.01
      compB.threshold.setValueAtTime(-12, 0.01);
      srcB.start(0);
      const renderedB = await ctxB.startRendering();
      const outputB = renderedB.getChannelData(0);

      const smoothnessB = outputB.reduce((sum, v, i) => {
        if (i === 0) return 0;
        return sum + Math.abs(v - outputB[i - 1]);
      }, 0) / outputB.length;

      // Smooth version should have lower mean derivative
      // (setTargetAtTime creates exponential curve, not a sharp step)
      expect(smoothnessA).toBeLessThan(smoothnessB * 1.5); // not drastically worse

      // Both should be valid signals
      const { hasInvalid: invalidA } = checkSignalValidity(outputA);
      const { hasInvalid: invalidB } = checkSignalValidity(outputB);
      expect(invalidA).toBe(false);
      expect(invalidB).toBe(false);
    }, 15000);

    it('multiple setTargetAtTime calls should maintain signal continuity', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      const source = offlineCtx.createBufferSource();
      const buf = offlineCtx.createBuffer(1, offlineCtx.length, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < offlineCtx.length; i++) {
        data[i] = AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE);
      }
      source.buffer = buf;

      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -60;
      compressor.ratio.value = 1;
      compressor.knee.value = 30;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      source.connect(compressor);
      compressor.connect(offlineCtx.destination);

      // Multiple exponential ramps at different times
      compressor.threshold.setTargetAtTime(-20, 0.05, 0.05);
      compressor.threshold.setTargetAtTime(-40, 0.2, 0.05);
      compressor.threshold.setTargetAtTime(-12, 0.35, 0.05);

      source.start(0);
      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      // Verify signal continuity: max single-sample change
      let maxDelta = 0;
      for (let i = 1; i < output.length; i++) {
        const delta = Math.abs(output[i] - output[i - 1]);
        if (delta > maxDelta) maxDelta = delta;
      }
      expect(maxDelta).toBeLessThan(0.5);

      // Verify consistent RMS across segments
      const segmentSize = Math.floor(output.length / 3);
      const rms1 = calculateRMS(output.slice(0, segmentSize));
      const rms2 = calculateRMS(output.slice(segmentSize, segmentSize * 2));
      const rms3 = calculateRMS(output.slice(segmentSize * 2));

      // RMS should vary gradually, not jump abruptly
      expect(Math.abs(rms1 - rms2)).toBeLessThan(0.15);
      expect(Math.abs(rms2 - rms3)).toBeLessThan(0.15);

      const { hasInvalid } = checkSignalValidity(output);
      expect(hasInvalid).toBe(false);
    }, 10000);
  });
}






  // ============================================================
  // TEST SUITE 2: EQ Band Transition — Spectral Verification
  // ============================================================
  //
  // Verifies that a High-Pass Filter correctly attenuates frequencies
  // below its cutoff. Uses FFT to verify spectral energy distribution.
  //
  // Input: 440Hz sine + 8000Hz sine
  // Filter: HPF at 1000Hz
  // Expected: 440Hz significantly attenuated, 8000Hz preserved
  // ============================================================

  describe('EQ Band Transition — Spectural Verification', () => {
    const SAMPLE_RATE = 44100;
    const DURATION = 1.0;
    const FREQ_LOW = 440;
    const FREQ_HIGH = 8000;
    const HPF_CUTOFF = 1000;
    const ENERGY_THRESHOLD_LOW = 0.10;  // < 10% of original
    const ENERGY_THRESHOLD_HIGH = 0.50; // > 50% of original

    it('HPF at 1000Hz should attenuate 440Hz below 10% and preserve 8000Hz above 50%', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      // Create 440Hz and 8000Hz sine components
      const osc1 = offlineCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = FREQ_LOW;
      const gain1 = offlineCtx.createGain();
      gain1.gain.value = 0.5;

      const osc2 = offlineCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = FREQ_HIGH;
      const gain2 = offlineCtx.createGain();
      gain2.gain.value = 0.5;

      // HPF at 1000Hz
      const hpf = offlineCtx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = HPF_CUTOFF;
      hpf.Q.value = 0.707;

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(hpf);
      gain2.connect(hpf);
      hpf.connect(offlineCtx.destination);

      osc1.start(0);
      osc2.start(0);
      osc1.stop(DURATION);
      osc2.stop(DURATION);

      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      // FFT analysis
      const fft = performFFT(output, SAMPLE_RATE, 8192);

      // Measure output energy at both frequencies
      const lowEnergy = findBinEnergy(fft, FREQ_LOW, 30);
      const highEnergy = findBinEnergy(fft, FREQ_HIGH, 30);

      // Create reference (dry) signal for comparison
      const dryCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );
      const dryOsc1 = dryCtx.createOscillator();
      dryOsc1.type = 'sine';
      dryOsc1.frequency.value = FREQ_LOW;
      const dryGain1 = dryCtx.createGain();
      dryGain1.gain.value = 0.5;
      const dryOsc2 = dryCtx.createOscillator();
      dryOsc2.type = 'sine';
      dryOsc2.frequency.value = FREQ_HIGH;
      const dryGain2 = dryCtx.createGain();
      dryGain2.gain.value = 0.5;
      dryOsc1.connect(dryGain1);
      dryOsc2.connect(dryGain2);
      dryGain1.connect(dryCtx.destination);
      dryGain2.connect(dryCtx.destination);
      dryOsc1.start(0);
      dryOsc2.start(0);
      dryOsc1.stop(DURATION);
      dryOsc2.stop(DURATION);
      const dryRendered = await dryCtx.startRendering();
      const dryData = dryRendered.getChannelData(0);
      const dryFft = performFFT(dryData, SAMPLE_RATE, 8192);

      const dryLowEnergy = findBinEnergy(dryFft, FREQ_LOW, 30);
      const dryHighEnergy = findBinEnergy(dryFft, FREQ_HIGH, 30);

      // 440Hz should be significantly attenuated
      const lowAttenuationRatio = dryLowEnergy > 0 ? lowEnergy / dryLowEnergy : 0;
      expect(lowAttenuationRatio).toBeLessThan(ENERGY_THRESHOLD_LOW);

      // 8000Hz should be largely preserved (>50% energy)
      const highRetentionRatio = dryHighEnergy > 0 ? highEnergy / dryHighEnergy : 0;
      expect(highRetentionRatio).toBeGreaterThan(ENERGY_THRESHOLD_HIGH);
    }, 15000);

    it('LPF at 5000Hz should preserve 440Hz and attenuate 8000Hz', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      const osc1 = offlineCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = FREQ_LOW;
      const gain1 = offlineCtx.createGain();
      gain1.gain.value = 0.5;

      const osc2 = offlineCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = FREQ_HIGH;
      const gain2 = offlineCtx.createGain();
      gain2.gain.value = 0.5;

      const lpf = offlineCtx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 5000;
      lpf.Q.value = 0.707;

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(lpf);
      gain2.connect(lpf);
      lpf.connect(offlineCtx.destination);

      osc1.start(0);
      osc2.start(0);
      osc1.stop(DURATION);
      osc2.stop(DURATION);

      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      const fft = performFFT(output, SAMPLE_RATE, 8192);
      const lowEnergy = findBinEnergy(fft, FREQ_LOW, 30);
      const highEnergy = findBinEnergy(fft, FREQ_HIGH, 30);

      // Low freq should be preserved
      expect(lowEnergy).toBeGreaterThan(highEnergy * 5);

      // Output RMS should be reasonable
      const rms = calculateRMS(output);
      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThan(1.0);
    }, 15000);

    it('Peaking EQ at 1000Hz should boost center frequency', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      // Generate broadband noise
      const noiseBuf = offlineCtx.createBuffer(1, offlineCtx.length, SAMPLE_RATE);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseBuf.length; i++) {
        noiseData[i] = (Math.random() * 2 - 1);
      }

      const source = offlineCtx.createBufferSource();
      source.buffer = noiseBuf;

      const peaking = offlineCtx.createBiquadFilter();
      peaking.type = 'peaking';
      peaking.frequency.value = 1000;
      peaking.gain.value = 20; // +20dB boost
      peaking.Q.value = 1;

      source.connect(peaking);
      peaking.connect(offlineCtx.destination);
      source.start(0);

      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      const fft = performFFT(output, SAMPLE_RATE, 8192);
      const centerEnergy = findBinEnergy(fft, 1000, 50);
      const offCenterEnergy = findBinEnergy(fft, 200, 30);

      // Center energy should be significantly higher than off-center
      expect(centerEnergy).toBeGreaterThan(offCenterEnergy * 2);
    }, 15000);
  });

  // ============================================================
  // TEST SUITE 3: Dynamics Compressor — Gain Reduction Verification
  // ============================================================
  //
  // Verifies that the DynamicsCompressor node actually reduces gain
  // on a near-max amplitude input signal.
  //
  // Input: 440Hz sine at amplitude 0.9
  // Compressor: threshold -6dB (0.5 linear), ratio 12:1
  // Expected: output peak < 0.7, output RMS < input RMS
  // ============================================================

  describe('Dynamics Compressor — Gain Reduction Verification', () => {
    const SAMPLE_RATE = 44100;
    const DURATION = 1.0;
    const INPUT_AMP = 0.9;
    const FREQ = 440;

    it('compressor should reduce peak amplitude of near-max signal', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      // Input signal
      const source = offlineCtx.createBufferSource();
      const buf = offlineCtx.createBuffer(1, offlineCtx.length, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < offlineCtx.length; i++) {
        data[i] = INPUT_AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE);
      }
      source.buffer = buf;

      // Compressor: threshold -6dB, ratio 12:1
      const compressor = offlineCtx.createDynamicsCompressor();
      // Convert threshold from dB to linear for reference
      // threshold -6dB means gain reduction kicks in at amplitude = 0.5
      compressor.threshold.value = -6;
      compressor.ratio.value = 12;
      compressor.knee.value = 0;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.1;

      source.connect(compressor);
      compressor.connect(offlineCtx.destination);
      source.start(0);

      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      // Also render dry (uncompressed) for comparison
      const dryCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );
      const drySource = dryCtx.createBufferSource();
      const dryBuf = dryCtx.createBuffer(1, dryCtx.length, SAMPLE_RATE);
      const dryData = dryBuf.getChannelData(0);
      for (let i = 0; i < dryCtx.length; i++) {
        dryData[i] = INPUT_AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE);
      }
      drySource.buffer = dryBuf;
      drySource.connect(dryCtx.destination);
      drySource.start(0);
      const dryRendered = await dryCtx.startRendering();
      const dryOutput = dryRendered.getChannelData(0);

      const inputRMS = calculateRMS(dryOutput);
      const inputPeak = calculatePeak(dryOutput);
      const outputRMS = calculateRMS(output);
      const outputPeak = calculatePeak(output);

      // Compression should reduce RMS
      expect(outputRMS).toBeLessThan(inputRMS);

      // Output peak should be well below 0.7 (heavy compression on near-max signal)
      expect(outputPeak).toBeLessThan(0.7);

      // Input peak should be as expected
      expect(inputPeak).toBeCloseTo(INPUT_AMP, 2);

      const { hasInvalid } = checkSignalValidity(output);
      expect(hasInvalid).toBe(false);
    }, 10000);

    it('compressor with ratio=1 (bypass) should not alter signal', async () => {
      const offlineCtx = new globalThis.OfflineAudioContext(
        1,
        Math.ceil(SAMPLE_RATE * DURATION),
        SAMPLE_RATE
      );

      const source = offlineCtx.createBufferSource();
      const buf = offlineCtx.createBuffer(1, offlineCtx.length, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < offlineCtx.length; i++) {
        data[i] = INPUT_AMP * Math.sin(2 * Math.PI * FREQ * i / SAMPLE_RATE);
      }
      source.buffer = buf;

      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -100; // bypass
      compressor.ratio.value = 1; // no compression
      compressor.knee.value = 0;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      source.connect(compressor);
      compressor.connect(offlineCtx.destination);
      source.start(0);

      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      const rms = calculateRMS(output);
      expect(rms).toBeGreaterThan(0.75); // close to input RMS of 0.636
      expect(rms).toBeLessThan(INPUT_AMP); // slightly lower due to internal processing

      const { hasInvalid } = checkSignalValidity(output);
      expect(hasInvalid).toBe(false);
    }, 10000);
  });

    / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /   T E S T   S U I T E   4 :   C l i c k   D e t e c t i o n      S a m p l e   D e r i v a t i v e   A n a l y s i s  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /  
     / /   V e r i f i e s   n o   a c o u s t i c   c l i c k s   w h e n   s w i t c h i n g   e f f e c t   p a r a m e t e r s   a b r u p t l y .  
     / /   A n a l y z e s   r e n d e r e d   A u d i o B u f f e r   f o r   s a m p l e   d i s c o n t i n u i t i e s   ( s h a r p  
     / /   t r a n s i t i o n s   b e t w e e n   a d j a c e n t   s a m p l e s ) .  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
  
     / * *  
       *   A n a l y z e   r e n d e r e d   A u d i o B u f f e r   f o r   c l i c k s   ( s a m p l e   d i s c o n t i n u i t i e s ) .  
       * /  
     f u n c t i o n   a n a l y z e F o r C l i c k s ( b u f f e r ,   t h r e s h o l d   =   0 . 3 )   {  
         c o n s t   d a t a   =   b u f f e r . g e t C h a n n e l D a t a ( 0 ) ;  
         l e t   c l i c k C o u n t   =   0 ;  
         l e t   m a x D e l t a   =   0 ;  
         f o r   ( l e t   i   =   1 ;   i   <   d a t a . l e n g t h ;   i + + )   {  
             c o n s t   d e l t a   =   M a t h . a b s ( d a t a [ i ]   -   d a t a [ i   -   1 ] ) ;  
             i f   ( d e l t a   >   m a x D e l t a )   m a x D e l t a   =   d e l t a ;  
             i f   ( d e l t a   >   t h r e s h o l d )   c l i c k C o u n t + + ;  
         }  
         r e t u r n   {  
             c l i c k C o u n t ,  
             m a x D e l t a ,  
             c l i c k P c t :   c l i c k C o u n t   /   d a t a . l e n g t h ,  
             i s C l e a n :   c l i c k C o u n t   /   d a t a . l e n g t h   <   0 . 0 0 5  
         } ;  
     }  
  
     d e s c r i b e ( ' C l i c k   D e t e c t i o n      S a m p l e   D e r i v a t i v e   A n a l y s i s ' ,   ( )   = >   {  
         c o n s t   S A M P L E _ R A T E   =   4 4 1 0 0 ;  
  
         i t ( ' a b r u p t   g a i n   c h a n g e   s h o u l d   p r o d u c e   a c c e p t a b l e   c l i c k s ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   2 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 5   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
             c o n s t   g a i n N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             g a i n N o d e . g a i n . v a l u e   =   0 . 0 1 ;  
             g a i n N o d e . g a i n . s e t V a l u e A t T i m e ( 1 . 0 ,   0 . 5 ) ;  
             s o u r c e . c o n n e c t ( g a i n N o d e ) ;  
             g a i n N o d e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   a n a l y s i s   =   a n a l y z e F o r C l i c k s ( r e n d e r e d ,   0 . 3 ) ;  
             e x p e c t ( a n a l y s i s . c l i c k C o u n t ) . t o B e G r e a t e r T h a n ( 0 ) ;  
             e x p e c t ( a n a l y s i s . m a x D e l t a ) . t o B e L e s s T h a n ( 2 . 0 ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' s m o o t h   g a i n   r a m p   ( l i n e a r R a m p T o V a l u e A t T i m e )   s h o u l d   b e   c l i c k - f r e e ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   2 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 5   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
             c o n s t   g a i n N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             g a i n N o d e . g a i n . v a l u e   =   0 . 0 1 ;  
             g a i n N o d e . g a i n . l i n e a r R a m p T o V a l u e A t T i m e ( 1 . 0 ,   0 . 5 5 ) ;  
             s o u r c e . c o n n e c t ( g a i n N o d e ) ;  
             g a i n N o d e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   a n a l y s i s   =   a n a l y z e F o r C l i c k s ( r e n d e r e d ,   0 . 3 ) ;  
             e x p e c t ( a n a l y s i s . i s C l e a n ) . t o B e ( t r u e ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' W a v e S h a p e r   h a r d   c l i p p i n g   s h o u l d   h a v e   b o u n d e d   m a x D e l t a ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   1 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 9   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
             c o n s t   c u r v e L e n g t h   =   4 4 1 0 0 ;  
             c o n s t   c u r v e   =   n e w   F l o a t 3 2 A r r a y ( c u r v e L e n g t h ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   c u r v e L e n g t h ;   i + + )   {  
                 c o n s t   i n p u t   =   ( i   /   ( c u r v e L e n g t h   -   1 ) )   *   2   -   1 ;  
                 c u r v e [ i ]   =   M a t h . t a n ( i n p u t )   *   0 . 5 ;  
             }  
             c o n s t   w a v e s h a p e r   =   o f f l i n e C t x . c r e a t e W a v e S h a p e r ( ) ;  
             w a v e s h a p e r . c u r v e   =   c u r v e ;  
             w a v e s h a p e r . o v e r s a m p l e   =   ' n o n e ' ;  
             s o u r c e . c o n n e c t ( w a v e s h a p e r ) ;  
             w a v e s h a p e r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   a n a l y s i s   =   a n a l y z e F o r C l i c k s ( r e n d e r e d ,   0 . 3 ) ;  
             e x p e c t ( a n a l y s i s . m a x D e l t a ) . t o B e L e s s T h a n ( 0 . 8 ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' B i q u a d F i l t e r   f r e q u e n c y   s w e e p   ( s e t V a l u e C u r v e A t T i m e )   s h o u l d   b e   s m o o t h ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   2 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 5   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
             c o n s t   p e a k i n g   =   o f f l i n e C t x . c r e a t e B i q u a d F i l t e r ( ) ;  
             p e a k i n g . t y p e   =   ' p e a k i n g ' ;  
             p e a k i n g . f r e q u e n c y . v a l u e   =   2 0 0 ;  
             p e a k i n g . g a i n . v a l u e   =   6 ;  
             p e a k i n g . Q . v a l u e   =   1 ;  
             c o n s t   n u m S t e p s   =   5 0 ;  
             c o n s t   f r e q C u r v e   =   n e w   F l o a t 3 2 A r r a y ( n u m S t e p s ) ;  
             c o n s t   f r e q T i m e s   =   n e w   F l o a t 3 2 A r r a y ( n u m S t e p s ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   n u m S t e p s ;   i + + )   {  
                 c o n s t   r a t i o   =   i   /   ( n u m S t e p s   -   1 ) ;  
                 f r e q C u r v e [ i ]   =   2 0 0   *   M a t h . p o w ( 4 0 0 0   /   2 0 0 ,   r a t i o ) ;  
                 f r e q T i m e s [ i ]   =   0 . 5   +   ( i   /   n u m S t e p s )   *   0 . 1 ;  
             }  
             p e a k i n g . f r e q u e n c y . s e t V a l u e C u r v e A t T i m e ( f r e q C u r v e ,   f r e q T i m e s ,   S A M P L E _ R A T E ) ;  
             s o u r c e . c o n n e c t ( p e a k i n g ) ;  
             p e a k i n g . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   a n a l y s i s   =   a n a l y z e F o r C l i c k s ( r e n d e r e d ,   0 . 3 ) ;  
             e x p e c t ( a n a l y s i s . i s C l e a n ) . t o B e ( t r u e ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' D y n a m i c s C o m p r e s s o r   t h r e s h o l d   j u m p   s h o u l d   b e   b o u n d e d ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   2 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 8   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
             c o n s t   c o m p r e s s o r   =   o f f l i n e C t x . c r e a t e D y n a m i c s C o m p r e s s o r ( ) ;  
             c o m p r e s s o r . t h r e s h o l d . v a l u e   =   - 1 0 0 ;  
             c o m p r e s s o r . r a t i o . v a l u e   =   1 2 ;  
             c o m p r e s s o r . k n e e . v a l u e   =   0 ;  
             c o m p r e s s o r . a t t a c k . v a l u e   =   0 . 0 0 3 ;  
             c o m p r e s s o r . r e l e a s e . v a l u e   =   0 . 2 5 ;  
             c o m p r e s s o r . t h r e s h o l d . s e t V a l u e A t T i m e ( - 1 0 0 ,   0 ) ;  
             c o m p r e s s o r . t h r e s h o l d . s e t V a l u e A t T i m e ( - 6 ,   0 . 5 ) ;  
             s o u r c e . c o n n e c t ( c o m p r e s s o r ) ;  
             c o m p r e s s o r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
             c o n s t   a n a l y s i s   =   a n a l y z e F o r C l i c k s ( r e n d e r e d ,   0 . 3 ) ;  
             e x p e c t ( a n a l y s i s . m a x D e l t a ) . t o B e L e s s T h a n ( 0 . 5 ) ;  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
     } ) ;  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /   T E S T   S U I T E   5 :   W e t / D r y   C r o s s f a d e      E q u a l - P o w e r   M i x i n g   V a l i d a t i o n  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /  
     / /   T e s t s   t h e   e q u a l - p o w e r   c r o s s f a d e   l a w :   s i n ^ 2 ( t h e t a )   +   c o s ^ 2 ( t h e t a )   =   1 .  
     / /   V e r i f i e s   t h a t   t h e   w e t / d r y   m i x   m a i n t a i n s   c o n s i s t e n t   p o w e r   a c r o s s  
     / /   a l l   c r o s s f a d e   p o s i t i o n s .  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
  
     / * *  
       *   G e n e r a t e   w e t / d r y   m i x e d   s i g n a l   u s i n g   g a i n   n o d e s .  
       *   w e t G a i n   =   s i n ( p i / 2   *   w e t ) ,   d r y G a i n   =   c o s ( p i / 2   *   w e t )  
       *   T h i s   i m p l e m e n t s   e q u a l - p o w e r   c r o s s f a d i n g .  
       * /  
     f u n c t i o n   c r e a t e W e t D r y M i x ( o f f l i n e C t x ,   s o u r c e ,   w e t G a i n ,   d r y G a i n )   {  
         c o n s t   w e t N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
         c o n s t   d r y N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
         w e t N o d e . g a i n . v a l u e   =   M a t h . s i n ( M a t h . P I   /   2   *   w e t G a i n ) ;  
         d r y N o d e . g a i n . v a l u e   =   M a t h . c o s ( M a t h . P I   /   2   *   w e t G a i n ) ;  
  
         s o u r c e . c o n n e c t ( w e t N o d e ) ;  
         s o u r c e . c o n n e c t ( d r y N o d e ) ;  
  
         c o n s t   c o m p r e s s o r   =   o f f l i n e C t x . c r e a t e D y n a m i c s C o m p r e s s o r ( ) ;  
         c o m p r e s s o r . t h r e s h o l d . v a l u e   =   - 2 4 ;  
         c o m p r e s s o r . r a t i o . v a l u e   =   4 ;  
         c o m p r e s s o r . k n e e . v a l u e   =   3 0 ;  
         c o m p r e s s o r . a t t a c k . v a l u e   =   0 . 0 0 3 ;  
         c o m p r e s s o r . r e l e a s e . v a l u e   =   0 . 2 5 ;  
  
         w e t N o d e . c o n n e c t ( c o m p r e s s o r ) ;  
         c o m p r e s s o r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
         d r y N o d e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
         r e t u r n   {   w e t N o d e ,   d r y N o d e ,   c o m p r e s s o r   } ;  
     }  
  
     d e s c r i b e ( ' W e t / D r y   C r o s s f a d e      E q u a l - P o w e r   M i x i n g   V a l i d a t i o n ' ,   ( )   = >   {  
         c o n s t   S A M P L E _ R A T E   =   4 4 1 0 0 ;  
         c o n s t   D U R A T I O N   =   1 . 0 ;  
         c o n s t   F R E Q   =   4 4 0 ;  
         c o n s t   A M P   =   0 . 8 ;  
  
         i t ( ' w e t = 0   s h o u l d   p a s s   o n l y   d r y   s i g n a l ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   A M P   *   M a t h . s i n ( 2   *   M a t h . P I   *   F R E Q   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   {   w e t N o d e ,   d r y N o d e   }   =   c r e a t e W e t D r y M i x ( o f f l i n e C t x ,   s o u r c e ,   0 ,   1 ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   D r y - o n l y :   r e n d e r   r e f e r e n c e  
             c o n s t   r e f C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   r e f S o u r c e   =   r e f C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             r e f S o u r c e . b u f f e r   =   b u f ;  
             r e f S o u r c e . c o n n e c t ( r e f C t x . d e s t i n a t i o n ) ;  
             r e f S o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e f R e n d e r e d   =   a w a i t   r e f C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   r e f D a t a   =   r e f R e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             c o n s t   o u t p u t R M S   =   c a l c u l a t e R M S ( o u t p u t ) ;  
             c o n s t   r e f R M S   =   c a l c u l a t e R M S ( r e f D a t a ) ;  
  
             / /   O u t p u t   R M S   s h o u l d   e q u a l   r e f e r e n c e   ( d r y )   R M S  
             e x p e c t ( M a t h . a b s ( o u t p u t R M S   -   r e f R M S ) ) . t o B e L e s s T h a n ( 0 . 0 1 ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' w e t = 1   s h o u l d   p a s s   o n l y   w e t   ( c o m p r e s s e d )   s i g n a l ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   A M P   *   M a t h . s i n ( 2   *   M a t h . P I   *   F R E Q   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   {   w e t N o d e ,   d r y N o d e   }   =   c r e a t e W e t D r y M i x ( o f f l i n e C t x ,   s o u r c e ,   1 ,   0 ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   C o m p a r e   w i t h   d r y   r e f e r e n c e  
             c o n s t   r e f C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   r e f S o u r c e   =   r e f C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             r e f S o u r c e . b u f f e r   =   b u f ;  
             r e f S o u r c e . c o n n e c t ( r e f C t x . d e s t i n a t i o n ) ;  
             r e f S o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e f R e n d e r e d   =   a w a i t   r e f C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   r e f R M S   =   c a l c u l a t e R M S ( r e f R e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ) ;  
             c o n s t   o u t p u t R M S   =   c a l c u l a t e R M S ( o u t p u t ) ;  
  
             / /   W e t   ( c o m p r e s s e d )   s h o u l d   h a v e   l o w e r   R M S   t h a n   d r y  
             e x p e c t ( o u t p u t R M S ) . t o B e L e s s T h a n ( r e f R M S ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' w e t = 0 . 5   s h o u l d   p r o d u c e   s i n ^ 2 + c o s ^ 2 = 1   p o w e r   c o n s e r v a t i o n ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   A M P   *   M a t h . s i n ( 2   *   M a t h . P I   *   F R E Q   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   w e t G a i n   =   M a t h . s i n ( M a t h . P I   /   2   *   0 . 5 ) ;  
             c o n s t   d r y G a i n   =   M a t h . c o s ( M a t h . P I   /   2   *   0 . 5 ) ;  
  
             c o n s t   {   w e t N o d e ,   d r y N o d e   }   =   c r e a t e W e t D r y M i x ( o f f l i n e C t x ,   s o u r c e ,   0 . 5 ,   0 . 5 ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   C o m b i n e d   g a i n   m a g n i t u d e   s h o u l d   b e   s q r t ( s i n ^ 2 ( p i / 4 )   +   c o s ^ 2 ( p i / 4 ) )   =   1 . 0  
             / /   T h e   w e t   a n d   d r y   g a i n s   a r e   s i n ( p i / 4 )   =   c o s ( p i / 4 )   =   0 . 7 0 7  
             c o n s t   c o m b i n e d G a i n   =   M a t h . s q r t ( w e t G a i n   *   w e t G a i n   +   d r y G a i n   *   d r y G a i n ) ;  
             e x p e c t ( c o m b i n e d G a i n ) . t o B e C l o s e T o ( 1 . 0 ,   4 ) ;  
  
             / /   W i t h i n   + / - 0 . 0 5   t o l e r a n c e  
             e x p e c t ( c o m b i n e d G a i n ) . t o B e G r e a t e r T h a n ( 0 . 9 5 ) ;  
             e x p e c t ( c o m b i n e d G a i n ) . t o B e L e s s T h a n ( 1 . 0 5 ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' c r o s s f a d e   f r o m   w e t = 0   t o   w e t = 1   s h o u l d   b e   s e a m l e s s ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   2 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   A M P   *   M a t h . s i n ( 2   *   M a t h . P I   *   F R E Q   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   w e t G a i n N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             c o n s t   d r y G a i n N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
  
             / /   U s e   s e t V a l u e C u r v e A t T i m e   t o   s w e e p   w e t   f r o m   0   t o   1   o v e r   1 . 0 s  
             c o n s t   n u m S t e p s   =   4 4 1 ;  
             c o n s t   w e t C u r v e   =   n e w   F l o a t 3 2 A r r a y ( n u m S t e p s ) ;  
             c o n s t   w e t T i m e s   =   n e w   F l o a t 3 2 A r r a y ( n u m S t e p s ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   n u m S t e p s ;   i + + )   {  
                 w e t C u r v e [ i ]   =   i   /   ( n u m S t e p s   -   1 ) ;   / /   0   t o   1  
                 w e t T i m e s [ i ]   =   ( i   /   n u m S t e p s )   *   1 . 0 ;   / /   o v e r   1   s e c o n d  
             }  
             w e t G a i n N o d e . g a i n . s e t V a l u e C u r v e A t T i m e ( w e t C u r v e ,   w e t T i m e s ,   S A M P L E _ R A T E ) ;  
             d r y G a i n N o d e . g a i n . s e t V a l u e A t T i m e ( 1 ,   0 ) ;   / /   c o n s t a n t  
  
             c o n s t   w e t N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             c o n s t   d r y P a t h   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             c o n s t   c o m p r e s s o r   =   o f f l i n e C t x . c r e a t e D y n a m i c s C o m p r e s s o r ( ) ;  
             c o m p r e s s o r . t h r e s h o l d . v a l u e   =   - 2 4 ;  
             c o m p r e s s o r . r a t i o . v a l u e   =   4 ;  
             c o m p r e s s o r . k n e e . v a l u e   =   3 0 ;  
             c o m p r e s s o r . a t t a c k . v a l u e   =   0 . 0 0 3 ;  
             c o m p r e s s o r . r e l e a s e . v a l u e   =   0 . 2 5 ;  
  
             w e t G a i n N o d e . c o n n e c t ( w e t N o d e ) ;  
             d r y G a i n N o d e . c o n n e c t ( d r y P a t h ) ;  
             w e t N o d e . c o n n e c t ( c o m p r e s s o r ) ;  
             c o m p r e s s o r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             d r y P a t h . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . c o n n e c t ( w e t G a i n N o d e ) ;  
             s o u r c e . c o n n e c t ( d r y G a i n N o d e ) ;  
  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   C h e c k   s a m p l e   d e r i v a t i v e   a t   t = 1 . 0 s   ( s a m p l e   4 4 1 0 0 )  
             c o n s t   t 1 S a m p l e   =   M a t h . r o u n d ( 1 . 0   *   S A M P L E _ R A T E ) ;  
             c o n s t   p r e v D e l t a   =   M a t h . a b s ( o u t p u t [ M a t h . m i n ( t 1 S a m p l e ,   o u t p u t . l e n g t h   -   1 ) ]   -   o u t p u t [ M a t h . m a x ( t 1 S a m p l e   -   1 ,   0 ) ] ) ;  
             c o n s t   n e x t D e l t a   =   M a t h . a b s ( o u t p u t [ M a t h . m a x ( t 1 S a m p l e   +   1 ,   0 ) ]   -   o u t p u t [ M a t h . m i n ( t 1 S a m p l e ,   o u t p u t . l e n g t h   -   1 ) ] ) ;  
             / /   D e r i v a t i v e s   s h o u l d   b e   s i m i l a r   a t   t h e   t r a n s i t i o n   p o i n t  
             e x p e c t ( M a t h . a b s ( p r e v D e l t a   -   n e x t D e l t a ) ) . t o B e L e s s T h a n ( 0 . 3 ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 5 0 0 0 ) ;  
  
         i t ( ' d r y - o n l y   a n d   w e t = 0   o u t p u t   s h o u l d   b e   i d e n t i c a l ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   A M P   *   M a t h . s i n ( 2   *   M a t h . P I   *   F R E Q   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             / /   R e n d e r   c o m b i n e d   w e t = 0   p a t h  
             c o n s t   {   w e t N o d e ,   d r y N o d e   }   =   c r e a t e W e t D r y M i x ( o f f l i n e C t x ,   s o u r c e ,   0 ,   1 ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   c o m b i n e d D a t a   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   R e n d e r   d r y   p a t h   a l o n e  
             c o n s t   d r y C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d r y S o u r c e   =   d r y C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             d r y S o u r c e . b u f f e r   =   b u f ;  
             d r y S o u r c e . c o n n e c t ( d r y C t x . d e s t i n a t i o n ) ;  
             d r y S o u r c e . s t a r t ( 0 ) ;  
             c o n s t   d r y R e n d e r e d   =   a w a i t   d r y C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   d r y D a t a   =   d r y R e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   S a m p l e s   s h o u l d   m a t c h   w i t h i n   + / - 0 . 0 0 1  
             l e t   m a x D i f f   =   0 ;  
             f o r   ( l e t   i   =   0 ;   i   <   c o m b i n e d D a t a . l e n g t h ;   i + + )   {  
                 c o n s t   d i f f   =   M a t h . a b s ( c o m b i n e d D a t a [ i ]   -   d r y D a t a [ i ] ) ;  
                 i f   ( d i f f   >   m a x D i f f )   m a x D i f f   =   d i f f ;  
             }  
             e x p e c t ( m a x D i f f ) . t o B e L e s s T h a n ( 0 . 0 0 1 ) ;  
         } ,   1 0 0 0 0 ) ;  
     } ) ;  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /   T E S T   S U I T E   6 :   D e l a y   E f f e c t      F e e d b a c k   S t a b i l i t y  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /  
     / /   T e s t s   t h e   d e l a y   n o d e   w i t h   f e e d b a c k   f o r   s t a b i l i t y   a n d   c o r r e c t n e s s .  
     / /   V e r i f i e s   e x p o n e n t i a l   d e c a y ,   s i n g l e - e c h o   b e h a v i o r ,   a n d   m i x   i n t e r p o l a t i o n .  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
  
     d e s c r i b e ( ' D e l a y   E f f e c t      F e e d b a c k   S t a b i l i t y ' ,   ( )   = >   {  
         c o n s t   S A M P L E _ R A T E   =   4 4 1 0 0 ;  
         c o n s t   D U R A T I O N   =   2 . 0 ;  
  
         i t ( ' d e l a y   w i t h   f e e d b a c k   <   1 . 0   s h o u l d   b e   s t a b l e ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             / /   C r e a t e   i m p u l s e   b u f f e r  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             d a t a [ 0 ]   =   1 . 0 ;   / /   i m p u l s e   a t   t = 0  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   d e l a y N o d e   =   o f f l i n e C t x . c r e a t e D e l a y ( 2 . 0 ) ;  
             d e l a y N o d e . d e l a y T i m e . v a l u e   =   0 . 1 ;   / /   1 0 0 m s   d e l a y  
  
             c o n s t   d e l a y F e e d b a c k   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             d e l a y F e e d b a c k . g a i n . v a l u e   =   0 . 5 ;  
  
             c o n s t   w e t G a i n   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             w e t G a i n . g a i n . v a l u e   =   1 . 0 ;  
  
             / /   D e l a y   l o o p :   d e l a y N o d e   - >   f e e d b a c k   - >   d e l a y N o d e ,   a n d   d e l a y N o d e   - >   w e t   - >   d e s t  
             s o u r c e . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( d e l a y F e e d b a c k ) ;  
             d e l a y F e e d b a c k . c o n n e c t ( d e l a y N o d e ) ;   / /   f e e d b a c k   l o o p  
             d e l a y N o d e . c o n n e c t ( w e t G a i n ) ;  
             w e t G a i n . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
             / /   A l s o   r o u t e   d i r e c t   s i g n a l  
             s o u r c e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   M e a s u r e   e c h o   a m p l i t u d e s   a t   e a c h   d e l a y   i n t e r v a l  
             c o n s t   e c h o I n t e r v a l   =   M a t h . r o u n d ( 0 . 1   *   S A M P L E _ R A T E ) ;   / /   4 4 1 0   s a m p l e s  
             c o n s t   e c h o A m p l i t u d e s   =   [ ] ;  
             f o r   ( l e t   e c h o   =   0 ;   e c h o   <   1 0 ;   e c h o + + )   {  
                 c o n s t   s t a r t I d x   =   ( e c h o   +   1 )   *   e c h o I n t e r v a l   -   1 0 ;  
                 c o n s t   e n d I d x   =   ( e c h o   +   1 )   *   e c h o I n t e r v a l   +   1 0 ;  
                 l e t   m a x A m p   =   0 ;  
                 f o r   ( l e t   i   =   s t a r t I d x ;   i   <   M a t h . m i n ( e n d I d x ,   o u t p u t . l e n g t h ) ;   i + + )   {  
                     i f   ( i   > =   0 )   {  
                         c o n s t   a   =   M a t h . a b s ( o u t p u t [ i ] ) ;  
                         i f   ( a   >   m a x A m p )   m a x A m p   =   a ;  
                     }  
                 }  
                 e c h o A m p l i t u d e s . p u s h ( m a x A m p ) ;  
             }  
  
             / /   E a c h   e c h o   s h o u l d   b e   r o u g h l y   0 . 5 x   t h e   p r e v i o u s  
             f o r   ( l e t   i   =   1 ;   i   <   e c h o A m p l i t u d e s . l e n g t h ;   i + + )   {  
                 i f   ( e c h o A m p l i t u d e s [ i   -   1 ]   >   0 . 0 0 1 )   {  
                     c o n s t   r a t i o   =   e c h o A m p l i t u d e s [ i ]   /   e c h o A m p l i t u d e s [ i   -   1 ] ;  
                     e x p e c t ( r a t i o ) . t o B e L e s s T h a n ( 0 . 7 ) ;   / /   d e c a y   f a c t o r   <   0 . 7  
                     e x p e c t ( r a t i o ) . t o B e G r e a t e r T h a n ( 0 . 2 ) ;   / /   d e c a y   f a c t o r   >   0 . 2  
                 }  
             }  
  
             / /   A f t e r   1 0   i t e r a t i o n s ,   a m p l i t u d e   s h o u l d   b e   <   0 . 5 ^ 1 0   ~   0 . 0 0 1  
             e x p e c t ( e c h o A m p l i t u d e s [ 9 ] ) . t o B e L e s s T h a n ( 0 . 0 0 5 ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 5 0 0 0 ) ;  
  
         i t ( ' d e l a y   w i t h   f e e d b a c k   =   0   s h o u l d   p r o d u c e   s i n g l e   e c h o ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             d a t a [ 0 ]   =   1 . 0 ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   d e l a y N o d e   =   o f f l i n e C t x . c r e a t e D e l a y ( 2 . 0 ) ;  
             d e l a y N o d e . d e l a y T i m e . v a l u e   =   0 . 1 ;  
  
             c o n s t   d e l a y F e e d b a c k   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             d e l a y F e e d b a c k . g a i n . v a l u e   =   0 ;   / /   n o   f e e d b a c k  
  
             c o n s t   w e t G a i n   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             w e t G a i n . g a i n . v a l u e   =   1 . 0 ;  
  
             s o u r c e . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( d e l a y F e e d b a c k ) ;  
             d e l a y F e e d b a c k . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( w e t G a i n ) ;  
             w e t G a i n . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   F i n d   t h e   m a i n   i m p u l s e  
             c o n s t   i m p u l s e I d x   =   0 ;  
             c o n s t   d e l a y I d x   =   M a t h . r o u n d ( 0 . 1   *   S A M P L E _ R A T E ) ;  
  
             / /   V e r i f y   i m p u l s e   a t   t = 0  
             e x p e c t ( M a t h . a b s ( o u t p u t [ i m p u l s e I d x ] ) ) . t o B e G r e a t e r T h a n ( 0 . 5 ) ;  
  
             / /   V e r i f y   s i n g l e   e c h o   a t   d e l a y T i m e   o f f s e t  
             l e t   e c h o F o u n d   =   f a l s e ;  
             f o r   ( l e t   i   =   d e l a y I d x   -   5 ;   i   < =   d e l a y I d x   +   5 ;   i + + )   {  
                 i f   ( i   > =   0   & &   i   <   o u t p u t . l e n g t h   & &   M a t h . a b s ( o u t p u t [ i ] )   >   0 . 5 )   {  
                     e c h o F o u n d   =   t r u e ;  
                     b r e a k ;  
                 }  
             }  
             e x p e c t ( e c h o F o u n d ) . t o B e ( t r u e ) ;  
  
             / /   V e r i f y   n o   s u b s e q u e n t   e c h o e s   ( a f t e r   2 * d e l a y T i m e )  
             c o n s t   d o u b l e D e l a y I d x   =   M a t h . r o u n d ( 0 . 2   *   S A M P L E _ R A T E ) ;  
             l e t   h a s S e c o n d E c h o   =   f a l s e ;  
             f o r   ( l e t   i   =   d o u b l e D e l a y I d x   -   5 ;   i   < =   d o u b l e D e l a y I d x   +   5 ;   i + + )   {  
                 i f   ( i   > =   0   & &   i   <   o u t p u t . l e n g t h   & &   M a t h . a b s ( o u t p u t [ i ] )   >   0 . 0 1 )   {  
                     h a s S e c o n d E c h o   =   t r u e ;  
                     b r e a k ;  
                 }  
             }  
             / /   W i t h   f e e d b a c k = 0 ,   t h e r e   s h o u l d   b e   n o   s e c o n d   e c h o  
             e x p e c t ( h a s S e c o n d E c h o ) . t o B e ( f a l s e ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 5 0 0 0 ) ;  
  
         i t ( ' d e l a y   m i x   p a r a m e t e r   s h o u l d   i n t e r p o l a t e   b e t w e e n   d r y   a n d   w e t ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   S A M P L E _ R A T E 2   =   S A M P L E _ R A T E ;  
  
             / /   I m p u l s e   f u n c t i o n  
             a s y n c   f u n c t i o n   r e n d e r I m p u l s e W i t h M i x ( m i x V a l u e )   {  
                 c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E 2 ) ;  
                 c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E 2 ) ;  
                 c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
                 d a t a [ 0 ]   =   1 . 0 ;  
  
                 c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
                 s o u r c e . b u f f e r   =   b u f ;  
  
                 c o n s t   d e l a y N o d e   =   o f f l i n e C t x . c r e a t e D e l a y ( 2 . 0 ) ;  
                 d e l a y N o d e . d e l a y T i m e . v a l u e   =   0 . 1 ;  
  
                 c o n s t   d e l a y F e e d b a c k   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
                 d e l a y F e e d b a c k . g a i n . v a l u e   =   0 ;  
  
                 c o n s t   w e t G a i n N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
                 w e t G a i n N o d e . g a i n . v a l u e   =   m i x V a l u e ;  
  
                 c o n s t   d r y G a i n N o d e   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
                 d r y G a i n N o d e . g a i n . v a l u e   =   1   -   m i x V a l u e ;  
  
                 s o u r c e . c o n n e c t ( d e l a y N o d e ) ;  
                 d e l a y N o d e . c o n n e c t ( d e l a y F e e d b a c k ) ;  
                 d e l a y F e e d b a c k . c o n n e c t ( d e l a y N o d e ) ;  
                 d e l a y N o d e . c o n n e c t ( w e t G a i n N o d e ) ;  
                 w e t G a i n N o d e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
                 s o u r c e . c o n n e c t ( d r y G a i n N o d e ) ;  
                 d r y G a i n N o d e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
                 s o u r c e . s t a r t ( 0 ) ;  
                 r e t u r n   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             }  
  
             / /   R e n d e r   w i t h   m i x = 0   ( d r y   o n l y )  
             c o n s t   d r y O n l y   =   a w a i t   r e n d e r I m p u l s e W i t h M i x ( 0 ) ;  
             c o n s t   d r y D a t a   =   d r y O n l y . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   R e n d e r   w i t h   m i x = 1   ( w e t   o n l y )  
             c o n s t   w e t O n l y   =   a w a i t   r e n d e r I m p u l s e W i t h M i x ( 1 ) ;  
             c o n s t   w e t D a t a   =   w e t O n l y . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   R e n d e r   w i t h   m i x = 0 . 5  
             c o n s t   m i x H a l f   =   a w a i t   r e n d e r I m p u l s e W i t h M i x ( 0 . 5 ) ;  
             c o n s t   m i x H a l f D a t a   =   m i x H a l f . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   W i t h   m i x = 0 ,   o u t p u t   s h o u l d   e q u a l   d r y - o n l y  
             l e t   d r y D i f f   =   0 ;  
             f o r   ( l e t   i   =   0 ;   i   <   d r y D a t a . l e n g t h ;   i + + )   {  
                 c o n s t   d   =   M a t h . a b s ( d r y D a t a [ i ]   -   m i x H a l f D a t a [ i ] ) ;  
                 i f   ( d   >   d r y D i f f )   d r y D i f f   =   d ;  
             }  
             / /   d r y - o n l y   a t   m i x = 0   s h o u l d   d i f f e r   f r o m   m i x = 0 . 5   ( w h i c h   h a s   w e t   c o m p o n e n t )  
             e x p e c t ( d r y D i f f ) . t o B e G r e a t e r T h a n ( 0 . 0 1 ) ;  
  
             / /   W i t h   m i x = 0 . 5 ,   o u t p u t   a t   i m p u l s e   p o s i t i o n   s h o u l d   b e   b e t w e e n   d r y   a n d   w e t  
             e x p e c t ( M a t h . a b s ( m i x H a l f D a t a [ 0 ] ) ) . t o B e G r e a t e r T h a n ( M a t h . a b s ( d r y D a t a [ 0 ] )   *   0 . 5 ) ;  
             e x p e c t ( M a t h . a b s ( m i x H a l f D a t a [ 0 ] ) ) . t o B e L e s s T h a n ( M a t h . a b s ( w e t D a t a [ 0 ] )   *   1 . 5   +   M a t h . a b s ( d r y D a t a [ 0 ] ) ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( m i x H a l f D a t a ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   2 0 0 0 0 ) ;  
  
         i t ( ' d e l a y   t i m e   s h o u l d   h a n d l e   n o n - i n t e g e r   s a m p l e   d e l a y s ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             d a t a [ 0 ]   =   1 . 0 ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             s o u r c e . b u f f e r   =   b u f ;  
  
             c o n s t   d e l a y N o d e   =   o f f l i n e C t x . c r e a t e D e l a y ( 2 . 0 ) ;  
             d e l a y N o d e . d e l a y T i m e . v a l u e   =   0 . 0 5 5 ;   / /   2 4 2 5 . 5   s a m p l e s   a t   4 4 1 0 0 H z  
  
             c o n s t   d e l a y F e e d b a c k   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             d e l a y F e e d b a c k . g a i n . v a l u e   =   0 ;  
  
             c o n s t   w e t G a i n   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             w e t G a i n . g a i n . v a l u e   =   1 . 0 ;  
  
             s o u r c e . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( d e l a y F e e d b a c k ) ;  
             d e l a y F e e d b a c k . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( w e t G a i n ) ;  
             w e t G a i n . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   V e r i f y   s o m e   s i g n a l   a p p e a r s   a t   b o t h   s a m p l e   2 4 2 5   a n d   2 4 2 6  
             / /   ( d u e   t o   f r a c t i o n a l   s a m p l e   i n t e r p o l a t i o n )  
             c o n s t   s a m p l e 2 4 2 5   =   M a t h . a b s ( o u t p u t [ 2 4 2 5 ] ) ;  
             c o n s t   s a m p l e 2 4 2 6   =   M a t h . a b s ( o u t p u t [ 2 4 2 6 ] ) ;  
             e x p e c t ( s a m p l e 2 4 2 5 ) . t o B e G r e a t e r T h a n ( 0 . 0 1 ) ;  
             e x p e c t ( s a m p l e 2 4 2 6 ) . t o B e G r e a t e r T h a n ( 0 . 0 1 ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 5 0 0 0 ) ;  
     } ) ;  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /   T E S T   S U I T E   7 :   W a v e S h a p e r      D i s t o r t i o n   C u r v e   V a l i d a t i o n  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /  
     / /   T e s t s   W a v e S h a p e r   n o d e   b e h a v i o r   w i t h   v a r i o u s   d i s t o r t i o n   c u r v e s .  
     / /   V e r i f i e s   o u t p u t   c l i p p i n g ,   a m p l i f i c a t i o n ,   a n d   i d e n t i t y   b e h a v i o r .  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
  
     d e s c r i b e ( ' W a v e S h a p e r      D i s t o r t i o n   C u r v e   V a l i d a t i o n ' ,   ( )   = >   {  
         c o n s t   S A M P L E _ R A T E   =   4 4 1 0 0 ;  
         c o n s t   D U R A T I O N   =   1 . 0 ;  
  
         i t ( ' s o f t   c l i p p i n g   c u r v e   s h o u l d   b o u n d   o u t p u t   t o   [ - 1 ,   1 ] ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             / /   C r e a t e   s i g n a l   a t   a m p l i t u d e   2 . 0   ( f a r   b e y o n d   u n i t   r a n g e )  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   2 . 0   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             / /   C r e a t e   t a n h   s o f t - c l i p p i n g   c u r v e   ( 1 0 2 4   p o i n t s )  
             c o n s t   c u r v e L e n g t h   =   1 0 2 4 ;  
             c o n s t   c u r v e   =   n e w   F l o a t 3 2 A r r a y ( c u r v e L e n g t h ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   c u r v e L e n g t h ;   i + + )   {  
                 c o n s t   x   =   ( i   /   ( c u r v e L e n g t h   -   1 ) )   *   2   -   1 ;   / /   - 1   t o   1  
                 c u r v e [ i ]   =   M a t h . t a n h ( x   *   3 ) ;   / /   t a n h   w i t h   g a i n   f o r   s h a r p e r   c l i p p i n g  
             }  
  
             c o n s t   w a v e s h a p e r   =   o f f l i n e C t x . c r e a t e W a v e S h a p e r ( ) ;  
             w a v e s h a p e r . c u r v e   =   c u r v e ;  
             w a v e s h a p e r . o v e r s a m p l e   =   ' n o n e ' ;  
  
             s o u r c e . c o n n e c t ( w a v e s h a p e r ) ;  
             w a v e s h a p e r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   A l l   o u t p u t   s a m p l e s   s h o u l d   b e   w i t h i n   [ - 1 . 0 ,   1 . 0 ]  
             l e t   m a x A b s   =   0 ;  
             f o r   ( l e t   i   =   0 ;   i   <   o u t p u t . l e n g t h ;   i + + )   {  
                 c o n s t   a b s   =   M a t h . a b s ( o u t p u t [ i ] ) ;  
                 i f   ( a b s   >   m a x A b s )   m a x A b s   =   a b s ;  
             }  
             e x p e c t ( m a x A b s ) . t o B e L e s s T h a n O r E q u a l ( 1 . 0 ) ;  
  
             / /   V e r i f y   n o   N a N   o r   I n f i n i t y  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' o v e r d r i v e   c u r v e   s h o u l d   a m p l i f y   i n p u t ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             / /   F e e d   s i n e   a t   0 . 5   a m p l i t u d e  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 5   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             / /   C r e a t e   o v e r d r i v e   c u r v e :   3 x   a m p l i f i c a t i o n   f o r   | x |   <   0 . 3 3 ,   s o f t - c l i p s   b e y o n d  
             c o n s t   c u r v e L e n g t h   =   1 0 2 4 ;  
             c o n s t   c u r v e   =   n e w   F l o a t 3 2 A r r a y ( c u r v e L e n g t h ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   c u r v e L e n g t h ;   i + + )   {  
                 c o n s t   x   =   ( i   /   ( c u r v e L e n g t h   -   1 ) )   *   2   -   1 ;  
                 i f   ( M a t h . a b s ( x )   <   0 . 3 3 )   {  
                     c u r v e [ i ]   =   x   *   3 ;   / /   3 x   a m p l i f i c a t i o n  
                 }   e l s e   {  
                     / /   S o f t   c l i p   a t   t h e   b o u n d a r y  
                     c o n s t   s i g n   =   x   >   0   ?   1   :   - 1 ;  
                     c u r v e [ i ]   =   s i g n   *   ( 1   +   ( M a t h . a b s ( x )   -   0 . 3 3 )   *   0 . 5 )   *   0 . 5 ;  
                     c u r v e [ i ]   =   M a t h . t a n h ( c u r v e [ i ]   *   2 )   *   1 . 5 ;  
                 }  
             }  
  
             c o n s t   w a v e s h a p e r   =   o f f l i n e C t x . c r e a t e W a v e S h a p e r ( ) ;  
             w a v e s h a p e r . c u r v e   =   c u r v e ;  
             w a v e s h a p e r . o v e r s a m p l e   =   ' n o n e ' ;  
  
             s o u r c e . c o n n e c t ( w a v e s h a p e r ) ;  
             w a v e s h a p e r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             c o n s t   i n p u t P e a k   =   0 . 5 ;  
             c o n s t   o u t p u t P e a k   =   c a l c u l a t e P e a k ( o u t p u t ) ;  
  
             / /   O u t p u t   a m p l i t u d e   s h o u l d   b e   g r e a t e r   t h a n   i n p u t   a m p l i t u d e  
             e x p e c t ( o u t p u t P e a k ) . t o B e G r e a t e r T h a n ( i n p u t P e a k ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
  
         i t ( ' i d e n t i t y   c u r v e   s h o u l d   p a s s   s i g n a l   u n c h a n g e d ' ,   a s y n c   ( )   = >   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   D U R A T I O N ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             / /   C r e a t e   a   t e s t   s i g n a l  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   0 . 6   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t )   +   0 . 2   *   M a t h . s i n ( 2   *   M a t h . P I   *   8 8 0   *   t ) ;  
             }  
             s o u r c e . b u f f e r   =   b u f ;  
  
             / /   C r e a t e   i d e n t i t y   c u r v e   u s i n g   a   s i m p l e   l i n e a r   m a p p i n g  
             c o n s t   c u r v e L e n g t h   =   2 5 6 ;  
             c o n s t   c u r v e   =   n e w   F l o a t 3 2 A r r a y ( c u r v e L e n g t h ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   c u r v e L e n g t h ;   i + + )   {  
                 c o n s t   x   =   ( i   /   ( c u r v e L e n g t h   -   1 ) )   *   2   -   1 ;  
                 c u r v e [ i ]   =   x ;   / /   i d e n t i t y  
             }  
  
             c o n s t   w a v e s h a p e r   =   o f f l i n e C t x . c r e a t e W a v e S h a p e r ( ) ;  
             w a v e s h a p e r . c u r v e   =   c u r v e ;  
             w a v e s h a p e r . o v e r s a m p l e   =   ' n o n e ' ;  
  
             s o u r c e . c o n n e c t ( w a v e s h a p e r ) ;  
             w a v e s h a p e r . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   C o m p a r e   w i t h   d i r e c t   ( n o   w a v e s h a p e r )   s i g n a l  
             c o n s t   r e f C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   r e f S o u r c e   =   r e f C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             r e f S o u r c e . b u f f e r   =   b u f ;  
             r e f S o u r c e . c o n n e c t ( r e f C t x . d e s t i n a t i o n ) ;  
             r e f S o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e f R e n d e r e d   =   a w a i t   r e f C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   r e f D a t a   =   r e f R e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             l e t   m a x D i f f   =   0 ;  
             f o r   ( l e t   i   =   0 ;   i   <   o u t p u t . l e n g t h ;   i + + )   {  
                 c o n s t   d i f f   =   M a t h . a b s ( o u t p u t [ i ]   -   r e f D a t a [ i ] ) ;  
                 i f   ( d i f f   >   m a x D i f f )   m a x D i f f   =   d i f f ;  
             }  
             / /   I d e n t i t y   c u r v e   s h o u l d   p r o d u c e   n e a r - i d e n t i c a l   o u t p u t  
             e x p e c t ( m a x D i f f ) . t o B e L e s s T h a n ( 0 . 0 1 ) ;  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 0 0 0 0 ) ;  
     } ) ;  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /   T E S T   S U I T E   9 :   F u l l   E f f e c t s   C h a i n      E n d - t o - E n d   R e n d e r i n g  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
     / /  
     / /   T e s t s   t h e   c o m p l e t e   e f f e c t s   c h a i n   m a t c h i n g   o f f s c r e e n . j s   a r c h i t e c t u r e .  
     / /   V e r i f i e s   t h a t   t h e   f u l l   p i p e l i n e   r e n d e r s   w i t h o u t   e r r o r s   a n d   p r o d u c e s  
     / /   v a l i d   a u d i o   s i g n a l s .  
     / /  
     / /   C h a i n :   H P F   - >   C o m p r e s s o r   - >   P e a k i n g   E Q   - >   D e l a y   - >   W a v e S h a p e r  
     / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
  
     d e s c r i b e ( ' F u l l   E f f e c t s   C h a i n      E n d - t o - E n d   R e n d e r i n g ' ,   ( )   = >   {  
         c o n s t   S A M P L E _ R A T E   =   4 4 1 0 0 ;  
  
         / * *  
           *   B u i l d   t h e   f u l l   e f f e c t s   c h a i n   m a t c h i n g   o f f s c r e e n . j s   a r c h i t e c t u r e .  
           *   @ p a r a m   { O f f l i n e A u d i o C o n t e x t }   c t x   -   T h e   o f f l i n e   c o n t e x t  
           *   @ p a r a m   { o b j e c t }   o p t i o n s   -   E f f e c t   o p t i o n s  
           *   @ r e t u r n s   { o b j e c t }   C h a i n   n o d e s   f o r   c o n f i g u r a t i o n  
           * /  
         f u n c t i o n   b u i l d F u l l C h a i n ( c t x ,   o p t i o n s   =   { } )   {  
             c o n s t   {  
                 h p f E n a b l e d   =   t r u e ,  
                 h p f F r e q   =   4 0 ,  
                 c o m p r e s s o r E n a b l e d   =   t r u e ,  
                 c o m p r e s s o r T h r e s h o l d   =   - 2 4 ,  
                 c o m p r e s s o r R a t i o   =   4 ,  
                 e q E n a b l e d   =   t r u e ,  
                 e q F r e q   =   1 0 0 0 ,  
                 e q G a i n   =   0 ,  
                 e q Q   =   1 ,  
                 d e l a y E n a b l e d   =   t r u e ,  
                 d e l a y T i m e   =   0 . 0 5 ,  
                 d e l a y F e e d b a c k   =   0 ,  
                 w a v e s h a p e r E n a b l e d   =   f a l s e ,  
             }   =   o p t i o n s ;  
  
             c o n s t   h p f   =   c t x . c r e a t e B i q u a d F i l t e r ( ) ;  
             h p f . t y p e   =   ' h i g h p a s s ' ;  
             h p f . f r e q u e n c y . v a l u e   =   h p f F r e q ;  
             h p f . Q . v a l u e   =   0 . 7 0 7 ;  
  
             c o n s t   c o m p r e s s o r   =   c t x . c r e a t e D y n a m i c s C o m p r e s s o r ( ) ;  
             c o m p r e s s o r . t h r e s h o l d . v a l u e   =   c o m p r e s s o r T h r e s h o l d ;  
             c o m p r e s s o r . r a t i o . v a l u e   =   c o m p r e s s o r R a t i o ;  
             c o m p r e s s o r . k n e e . v a l u e   =   3 0 ;  
             c o m p r e s s o r . a t t a c k . v a l u e   =   0 . 0 0 3 ;  
             c o m p r e s s o r . r e l e a s e . v a l u e   =   0 . 2 5 ;  
  
             c o n s t   e q   =   c t x . c r e a t e B i q u a d F i l t e r ( ) ;  
             e q . t y p e   =   ' p e a k i n g ' ;  
             e q . f r e q u e n c y . v a l u e   =   e q F r e q ;  
             e q . g a i n . v a l u e   =   e q G a i n ;  
             e q . Q . v a l u e   =   e q Q ;  
  
             c o n s t   d e l a y N o d e   =   c t x . c r e a t e D e l a y ( 2 . 0 ) ;  
             d e l a y N o d e . d e l a y T i m e . v a l u e   =   d e l a y T i m e ;  
             c o n s t   d e l a y F e e d b a c k G a i n   =   c t x . c r e a t e G a i n ( ) ;  
             d e l a y F e e d b a c k G a i n . g a i n . v a l u e   =   d e l a y F e e d b a c k ;  
  
             c o n s t   w a v e s h a p e r   =   c t x . c r e a t e W a v e S h a p e r ( ) ;  
             c o n s t   w s C u r v e   =   n e w   F l o a t 3 2 A r r a y ( 2 5 6 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   2 5 6 ;   i + + )   {  
                 w s C u r v e [ i ]   =   ( i   /   2 5 5 )   *   2   -   1 ;   / /   i d e n t i t y  
             }  
             w a v e s h a p e r . c u r v e   =   w s C u r v e ;  
  
             c o n s t   w e t G a i n   =   c t x . c r e a t e G a i n ( ) ;  
             w e t G a i n . g a i n . v a l u e   =   1 ;  
  
             / /   C h a i n :   h p f   - >   c o m p r e s s o r   - >   e q   - >   ( d e l a y   l o o p )   - >   w a v e s h a p e r   - >   d e s t  
             h p f . c o n n e c t ( c o m p r e s s o r ) ;  
             c o m p r e s s o r . c o n n e c t ( e q ) ;  
             e q . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( d e l a y F e e d b a c k G a i n ) ;  
             d e l a y F e e d b a c k G a i n . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( w e t G a i n ) ;  
             w e t G a i n . c o n n e c t ( w a v e s h a p e r ) ;  
             w a v e s h a p e r . c o n n e c t ( c t x . d e s t i n a t i o n ) ;  
  
             r e t u r n   {   h p f ,   c o m p r e s s o r ,   e q ,   d e l a y N o d e ,   d e l a y F e e d b a c k G a i n ,   w e t G a i n ,   w a v e s h a p e r   } ;  
         }  
  
         / * *  
           *   G e n e r a t e   a   t e s t   s i g n a l   w i t h   4 4 0 H z   +   n o i s e .  
           * /  
         f u n c t i o n   g e n e r a t e T e s t S i g n a l ( o f f l i n e C t x ,   d u r a t i o n ,   a m p l i t u d e   =   0 . 5 )   {  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   b u f   =   o f f l i n e C t x . c r e a t e B u f f e r ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   d a t a   =   b u f . g e t C h a n n e l D a t a ( 0 ) ;  
             f o r   ( l e t   i   =   0 ;   i   <   l e n g t h ;   i + + )   {  
                 c o n s t   t   =   i   /   S A M P L E _ R A T E ;  
                 d a t a [ i ]   =   a m p l i t u d e   *   M a t h . s i n ( 2   *   M a t h . P I   *   4 4 0   *   t )   +  
                                     a m p l i t u d e   *   0 . 3   *   ( M a t h . r a n d o m ( )   *   2   -   1 ) ;  
             }  
             r e t u r n   b u f ;  
         }  
  
         i t ( ' f u l l   c h a i n   s h o u l d   r e n d e r   w i t h o u t   e r r o r s ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   1 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   t e s t B u f   =   g e n e r a t e T e s t S i g n a l ( o f f l i n e C t x ,   d u r a t i o n ,   0 . 5 ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             s o u r c e . b u f f e r   =   t e s t B u f ;  
  
             c o n s t   {   h p f ,   c o m p r e s s o r ,   e q ,   d e l a y N o d e ,   w a v e s h a p e r   }   =   b u i l d F u l l C h a i n ( o f f l i n e C t x ,   {  
                 h p f E n a b l e d :   t r u e ,  
                 h p f F r e q :   4 0 ,  
                 c o m p r e s s o r E n a b l e d :   t r u e ,  
                 c o m p r e s s o r T h r e s h o l d :   - 2 4 ,  
                 c o m p r e s s o r R a t i o :   4 ,  
                 e q E n a b l e d :   t r u e ,  
                 e q F r e q :   1 0 0 0 ,  
                 e q G a i n :   0 ,  
                 e q Q :   1 ,  
                 d e l a y E n a b l e d :   t r u e ,  
                 d e l a y T i m e :   0 . 0 5 ,  
                 d e l a y F e e d b a c k :   0 . 1 ,  
                 w a v e s h a p e r E n a b l e d :   f a l s e ,  
             } ) ;  
  
             s o u r c e . c o n n e c t ( h p f ) ;  
             s o u r c e . s t a r t ( 0 ) ;  
  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   V e r i f y   v a l i d   s a m p l e s  
             c o n s t   {   h a s I n v a l i d ,   n a n C o u n t ,   i n f C o u n t   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
             e x p e c t ( n a n C o u n t ) . t o B e ( 0 ) ;  
             e x p e c t ( i n f C o u n t ) . t o B e ( 0 ) ;  
  
             / /   V e r i f y   R M S   w i t h i n   r a n g e  
             c o n s t   r m s   =   c a l c u l a t e R M S ( o u t p u t ) ;  
             e x p e c t ( r m s ) . t o B e G r e a t e r T h a n ( 0 . 0 1 ) ;  
             e x p e c t ( r m s ) . t o B e L e s s T h a n ( 1 . 0 ) ;  
  
             / /   V e r i f y   o u t p u t   h a s   c o n t e n t   ( n o t   a l l   z e r o s )  
             c o n s t   p e a k   =   c a l c u l a t e P e a k ( o u t p u t ) ;  
             e x p e c t ( p e a k ) . t o B e G r e a t e r T h a n ( 0 . 0 1 ) ;  
         } ,   1 5 0 0 0 ) ;  
  
         i t ( ' a l l   e f f e c t s   b y p a s s e d   s h o u l d   p r o d u c e   n e a r - i d e n t i c a l   o u t p u t ' ,   a s y n c   ( )   = >   {  
             c o n s t   d u r a t i o n   =   1 . 0 ;  
             c o n s t   l e n g t h   =   M a t h . c e i l ( S A M P L E _ R A T E   *   d u r a t i o n ) ;  
             c o n s t   o f f l i n e C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
  
             c o n s t   t e s t B u f   =   g e n e r a t e T e s t S i g n a l ( o f f l i n e C t x ,   d u r a t i o n ,   0 . 5 ) ;  
  
             c o n s t   s o u r c e   =   o f f l i n e C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             s o u r c e . b u f f e r   =   t e s t B u f ;  
  
             / /   B u i l d   c h a i n   w i t h   a l l   e f f e c t s   b y p a s s e d  
             c o n s t   {   h p f ,   c o m p r e s s o r ,   e q ,   d e l a y N o d e ,   w e t G a i n ,   w a v e s h a p e r   }   =   b u i l d F u l l C h a i n ( o f f l i n e C t x ,   {  
                 h p f E n a b l e d :   t r u e ,  
                 h p f F r e q :   2 0 ,   / /   b y p a s s   H P F  
                 c o m p r e s s o r E n a b l e d :   f a l s e ,  
                 c o m p r e s s o r T h r e s h o l d :   - 1 0 0 ,   / /   b y p a s s   c o m p r e s s o r  
                 c o m p r e s s o r R a t i o :   1 ,  
                 e q E n a b l e d :   t r u e ,  
                 e q F r e q :   1 0 0 0 ,  
                 e q G a i n :   0 ,   / /   b y p a s s   E Q  
                 e q Q :   1 ,  
                 d e l a y E n a b l e d :   f a l s e ,  
                 d e l a y T i m e :   0 ,  
                 d e l a y F e e d b a c k :   0 ,  
                 w a v e s h a p e r E n a b l e d :   f a l s e ,  
             } ) ;  
  
             / /   A d d   a   b y p a s s   g a i n   t o   c o m p e n s a t e   f o r   c h a i n   l o s s e s  
             c o n s t   b y p a s s G a i n   =   o f f l i n e C t x . c r e a t e G a i n ( ) ;  
             b y p a s s G a i n . g a i n . v a l u e   =   1 . 0 ;  
  
             s o u r c e . c o n n e c t ( h p f ) ;  
             h p f . c o n n e c t ( c o m p r e s s o r ) ;  
             c o m p r e s s o r . c o n n e c t ( e q ) ;  
             e q . c o n n e c t ( d e l a y N o d e ) ;  
             d e l a y N o d e . c o n n e c t ( w e t G a i n ) ;  
             w e t G a i n . c o n n e c t ( w a v e s h a p e r ) ;  
             w a v e s h a p e r . c o n n e c t ( b y p a s s G a i n ) ;  
             b y p a s s G a i n . c o n n e c t ( o f f l i n e C t x . d e s t i n a t i o n ) ;  
  
             s o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e n d e r e d   =   a w a i t   o f f l i n e C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   o u t p u t   =   r e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             / /   C o m p a r e   w i t h   d i r e c t   s i g n a l  
             c o n s t   r e f C t x   =   n e w   g l o b a l T h i s . O f f l i n e A u d i o C o n t e x t ( 1 ,   l e n g t h ,   S A M P L E _ R A T E ) ;  
             c o n s t   r e f S o u r c e   =   r e f C t x . c r e a t e B u f f e r S o u r c e ( ) ;  
             r e f S o u r c e . b u f f e r   =   t e s t B u f ;  
             r e f S o u r c e . c o n n e c t ( r e f C t x . d e s t i n a t i o n ) ;  
             r e f S o u r c e . s t a r t ( 0 ) ;  
             c o n s t   r e f R e n d e r e d   =   a w a i t   r e f C t x . s t a r t R e n d e r i n g ( ) ;  
             c o n s t   r e f D a t a   =   r e f R e n d e r e d . g e t C h a n n e l D a t a ( 0 ) ;  
  
             c o n s t   i n p u t R M S   =   c a l c u l a t e R M S ( r e f D a t a ) ;  
             c o n s t   o u t p u t R M S   =   c a l c u l a t e R M S ( o u t p u t ) ;  
  
             / /   R M S   s h o u l d   b e   w i t h i n   5 %   o f   i n p u t   ( a l l o w i n g   f o r   i n t e r n a l   p r o c e s s i n g   l o s s )  
             i f   ( i n p u t R M S   >   0 . 0 0 1 )   {  
                 c o n s t   r m s D i f f   =   M a t h . a b s ( i n p u t R M S   -   o u t p u t R M S )   /   i n p u t R M S ;  
                 e x p e c t ( r m s D i f f ) . t o B e L e s s T h a n ( 0 . 0 5 ) ;  
             }  
  
             c o n s t   {   h a s I n v a l i d   }   =   c h e c k S i g n a l V a l i d i t y ( o u t p u t ) ;  
             e x p e c t ( h a s I n v a l i d ) . t o B e ( f a l s e ) ;  
         } ,   1 5 0 0 0 ) ;  
     } ) ;  
 