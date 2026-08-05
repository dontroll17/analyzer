/**
 * Limiter DSP — Soft-clipping limiter curve generation
 * 
 * Pure math functions for audio limiter effects.
 * No DOM or chrome API dependencies.
 * 
 * Extracted from offscreen.js to enable unit testing and coverage tracking.
 * Loaded as classic script in offscreen.html.
 */

/**
 * Create a soft-clipping limiter curve for AudioParam.setTableValue()
 * 
 * Implements a soft-knee limiter with configurable threshold and oversampling.
 * The curve maps input amplitudes (-1 to 1) to output amplitudes,
 * compressing signals above the threshold with a smooth knee transition.
 * 
 * @param {number} thresholdDb — Threshold in dB (e.g., -1 to -60)
 * @param {number} oversampleRate — Oversampling factor (2, 4, or 8)
 * @returns {Float32Array} Pre-computed transfer curve
 * 
 * @example
 * const curve = createLimiterCurve(-3, 4);
 * waveShaperNode.setTableValue(curve, 10);
 */
function createLimiterCurve(thresholdDb, oversampleRate) {
  // Convert dB threshold to linear amplitude
  const threshold = Math.pow(10, thresholdDb / 20);
  // 10ms at oversampled rate determines curve resolution
  const samples = 441 * oversampleRate;
  const curve = new Float32Array(samples);

  // Soft-knee: smooth transition region (±0.05 linear = ~0.4 dB)
  const knee = 0.05;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2 / samples) - 1; // Normalize to [-1, 1]
    let y;

    if (Math.abs(x) > threshold + knee) {
      // Hard limiting beyond knee — aggressive compression (0.1x gain above threshold)
      y = threshold + Math.sign(x) * (Math.abs(x) - threshold) * 0.1;
    } else if (Math.abs(x) > threshold - knee) {
      // Soft clipping region — quadratic interpolation
      const t = (Math.abs(x) - (threshold - knee)) / (2 * knee); // Normalized 0-1
      y = Math.sign(x) * (threshold - knee + t * t * knee);
    } else {
      // Pass-through below knee — unity gain
      y = x;
    }

    // Clamp to [-1, 1] to avoid DC offset or clipping artifacts
    curve[i] = Math.max(-1, Math.min(1, y));
  }

  // Final sample mirrors first for smooth interpolation across wrap-around
  curve[curve.length - 1] = -curve[0];

  return curve;
}

/**
 * Convert dB to linear amplitude
 * 
 * @param {number} db — Decibel value
 * @returns {number} Linear amplitude (0 to 1)
 */
function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Convert linear amplitude to dB
 * 
 * @param {number} linear — Linear amplitude (0 to 1)
 * @returns {number} Decibel value (0 to -Infinity)
 */
function linearToDb(linear) {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Calculate limiter knee width in dB
 * 
 * @param {number} kneeLinear — Linear knee width (default 0.05)
 * @returns {number} Knee width in dB
 */
function kneeLinearToDb(kneeLinear) {
  return 20 * Math.log10(1 + kneeLinear);
}

// Export for unit tests (Vitest coverage tracking)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createLimiterCurve, dbToLinear, linearToDb, kneeLinearToDb };
}
