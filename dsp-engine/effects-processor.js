// effects-processor.js — Pure DSP processors for audio effects
// Zero dependencies: no AudioContext, no Web Audio API
// Works with Float32Array buffers directly
// Can be tested in any environment (Vitest, Node.js)

const { createLimiterCurve } = require('./limiter.js');
const { processDelayChannel, createDelayBuffer, DEFAULT_SAMPLE_RATE } = require('./delay-utils.js');

/**
 * dB to linear conversion
 */
function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Linear to dB conversion
 */
function linearToDb(linear) {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Process audio through a dynamics compressor.
 * Implements a simple but effective compression curve with soft knee.
 * 
 * Compression formula:
 * - Below threshold-knee: unity gain (no processing)
 * - In knee region: smooth transition
 * - Above threshold+noe: compressed by ratio
 * 
 * @param {Float32Array} input - Input audio samples
 * @param {Object} params - Compressor parameters
 * @param {number} params.threshold - Threshold in dB (-100 to 0)
 * @param {number} params.knee - Knee width in dB (0-40)
 * @param {number} params.ratio - Compression ratio (1-20)
 * @returns {Float32Array} - Processed audio samples
 */
function processCompressor(input, params) {
  const { threshold = -24, knee = 30, ratio = 12 } = params;
  
  const thresholdLinear = dbToLinear(threshold);
  const kneeLinear = dbToLinear(threshold - knee / 2); // Center of knee
  const kneeWidth = dbToLinear(knee / 2);
  
  const output = new Float32Array(input.length);
  
  for (let i = 0; i < input.length; i++) {
    const sample = input[i];
    const absSample = Math.abs(sample);
    let outputSample = sample;
    
    if (absSample > kneeLinear) {
      if (absSample >= kneeLinear + kneeWidth) {
        // Hard compression region
        const excess = absSample - thresholdLinear;
        const compressedExcess = excess / ratio;
        outputSample = Math.sign(sample) * (thresholdLinear + compressedExcess);
      } else {
        // Soft knee region - quadratic interpolation
        const t = (absSample - kneeLinear) / kneeWidth; // 0 to 1
        const tSquared = t * t;
        const baseGain = 1.0;
        const compressedGain = 1.0 / ratio;
        // Smooth transition
        const gain = baseGain + (compressedGain - baseGain) * tSquared;
        outputSample = sample * gain;
      }
    }
    
    // Clamp to [-1, 1]
    output[i] = Math.max(-1, Math.min(1, outputSample));
  }
  
  return output;
}

/**
 * Process audio through a soft-clipping limiter.
 * Uses WaveShaperNode-style curve applied to samples.
 * 
 * @param {Float32Array} input - Input audio samples
 * @param {number} thresholdDb - Threshold in dB (-60 to 0)
 * @returns {Float32Array} - Processed audio samples
 */
function processLimiter(input, thresholdDb) {
  const curve = createLimiterCurve(thresholdDb, 4);
  const curveLength = curve.length;
  const halfCurveLength = curveLength / 2;
  
  const output = new Float32Array(input.length);
  
  for (let i = 0; i < input.length; i++) {
    // Map sample from [-1, 1] to curve index [0, curveLength-1]
    const normalizedIndex = Math.floor(((input[i] + 1) / 2) * (curveLength - 1));
    const clampedIndex = Math.max(0, Math.min(curveLength - 1, normalizedIndex));
    output[i] = curve[clampedIndex];
  }
  
  return output;
}

/**
 * Biquad filter coefficients
 */
class BiquadCoefficients {
  constructor(b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0) {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
  }
}

/**
 * Calculate biquad filter coefficients for high-pass filter
 * @param {number} frequency - Cutoff frequency in Hz
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} Q - Quality factor (default 0.707 for Butterworth)
 * @returns {BiquadCoefficients}
 */
function calculateHPFCoefficients(frequency, sampleRate, Q = 0.707) {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  
  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;
  
  return new BiquadCoefficients(
    b0 / a0,
    b1 / a0,
    b2 / a0,
    a1 / a0,
    a2 / a0
  );
}

/**
 * Calculate biquad filter coefficients for low-pass filter
 * @param {number} frequency - Cutoff frequency in Hz
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} Q - Quality factor (default 0.707 for Butterworth)
 * @returns {BiquadCoefficients}
 */
function calculateLPFCoefficients(frequency, sampleRate, Q = 0.707) {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;
  
  return new BiquadCoefficients(
    b0 / a0,
    b1 / a0,
    b2 / a0,
    a1 / a0,
    a2 / a0
  );
}

/**
 * Calculate biquad filter coefficients for peaking filter
 * @param {number} frequency - Center frequency in Hz
 * @param {number} gainDb - Gain in dB (positive for boost, negative for cut)
 * @param {number} Q - Quality factor
 * @param {number} sampleRate - Sample rate in Hz
 * @returns {BiquadCoefficients}
 */
function calculatePeakingCoefficients(frequency, gainDb, Q, sampleRate) {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const A = dbToLinear(gainDb / 2);
  const alpha = sinW0 / (2 * Q);
  
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha / A;
  
  return new BiquadCoefficients(
    b0 / a0,
    b1 / a0,
    b2 / a0,
    a1 / a0,
    a2 / a0
  );
}

/**
 * Apply biquad filter to audio buffer
 * @param {Float32Array} input - Input audio samples
 * @param {BiquadCoefficients} coeffs - Filter coefficients
 * @returns {Float32Array} - Filtered audio samples
 */
function applyBiquadFilter(input, coeffs) {
  const output = new Float32Array(input.length);
  let prevInput1 = 0;
  let prevInput2 = 0;
  let prevOutput1 = 0;
  let prevOutput2 = 0;
  
  for (let i = 0; i < input.length; i++) {
    const outputSample = coeffs.b0 * input[i] +
                         coeffs.b1 * prevInput1 +
                         coeffs.b2 * prevInput2 -
                         coeffs.a1 * prevOutput1 -
                         coeffs.a2 * prevOutput2;
    
    output[i] = outputSample;
    
    // Shift history
    prevInput2 = prevInput1;
    prevInput1 = input[i];
    prevOutput2 = prevOutput1;
    prevOutput1 = outputSample;
  }
  
  return output;
}

/**
 * Process audio through parametric EQ (HPF + LPF + Peaking)
 * Chain: Input → HPF → LPF → Peaking → Output
 * 
 * @param {Float32Array} input - Input audio samples
 * @param {Object} params - EQ parameters
 * @param {number} params.hpfFreq - HPF cutoff frequency in Hz (default 20)
 * @param {number} params.lpfFreq - LPF cutoff frequency in Hz (default 22050)
 * @param {number} params.peakFreq - Peaking center frequency in Hz (default 1000)
 * @param {number} params.peakGain - Peaking gain in dB (default 0)
 * @param {number} params.peakQ - Peaking Q factor (default 1)
 * @param {number} sampleRate - Sample rate in Hz (default 44100)
 * @returns {Float32Array} - Processed audio samples
 */
function processEQ(input, params, sampleRate) {
  const {
    hpfFreq = 20,
    lpfFreq = 22050,
    peakFreq = 1000,
    peakGain = 0,
    peakQ = 1
  } = params;
  
  let output = input;
  
  // Apply HPF
  const hpfCoeffs = calculateHPFCoefficients(hpfFreq, sampleRate);
  output = applyBiquadFilter(output, hpfCoeffs);
  
  // Apply LPF
  const lpfCoeffs = calculateLPFCoefficients(lpfFreq, sampleRate);
  output = applyBiquadFilter(output, lpfCoeffs);
  
  // Apply Peaking
  const peakCoeffs = calculatePeakingCoefficients(peakFreq, peakGain, peakQ, sampleRate);
  output = applyBiquadFilter(output, peakCoeffs);
  
  return output;
}

/**
 * Process audio through delay effect.
 * 
 * @param {Float32Array} input - Input audio samples
 * @param {Object} params - Delay parameters
 * @param {number} params.delayTime - Delay time in milliseconds (0-1000)
 * @param {number} params.feedback - Feedback coefficient (0-0.95)
 * @param {number} params.mix - Wet/dry mix (0-1)
 * @param {Float32Array} buffer - Delay buffer (should be large enough)
 * @param {number} initialWriteIndex - Initial write index
 * @param {number} sampleRate - Sample rate in Hz (default 44100)
 * @returns {{ output: Float32Array, finalWriteIndex: number }} - Processed audio and final index
 */
function processDelay(input, params, buffer, initialWriteIndex, sampleRate) {
  const { delayTime, feedback, mix } = params;
  
  // Convert delayTime from milliseconds to seconds
  const delayTimeSeconds = (delayTime || 0) / 1000;
  
  const result = processDelayChannel(
    input,
    delayTimeSeconds,
    feedback || 0,
    mix || 0,
    sampleRate || DEFAULT_SAMPLE_RATE,
    buffer,
    initialWriteIndex || 0
  );
  
  return result;
}

/**
 * Calculate RMS of a buffer
 */
function calculateRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Calculate peak amplitude of a buffer
 */
function calculatePeak(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/**
 * Calculate spectral energy in a frequency range
 */
function calculateBandEnergy(buffer, sampleRate, lowFreq, highFreq) {
  // Simple energy calculation for frequency band
  // For testing purposes, we'll use RMS of differentiated signal
  // as a proxy for high-frequency content
  let energy = 0;
  const diffThreshold = highFreq / (sampleRate / 2);
  
  for (let i = 1; i < buffer.length; i++) {
    const diff = buffer[i] - buffer[i - 1];
    if (diff > diffThreshold || diff < -diffThreshold) {
      energy += diff * diff;
    }
  }
  
  return energy / buffer.length;
}

module.exports = {
  // DSP processors
  processCompressor,
  processLimiter,
  processEQ,
  processDelay,
  
  // Biquad filter helpers
  BiquadCoefficients,
  calculateHPFCoefficients,
  calculateLPFCoefficients,
  calculatePeakingCoefficients,
  applyBiquadFilter,
  
  // Utilities
  dbToLinear,
  linearToDb,
  calculateRMS,
  calculatePeak,
  calculateBandEnergy
};
