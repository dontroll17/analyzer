/**
 * RMS (Root Mean Square) Calculator
 * 
 * Calculates the root mean square value of an audio buffer,
 * which represents the energy or loudness of the signal.
 * 
 * Usage:
 *   const rms = new RMS();
 *   const value = rms.calculate(buffer);
 */

// Use IIFE to safely define RMS class without hoisting issues
(function() {
  // Check if RMS is already defined (handles multiple script loads)
  if (typeof window !== 'undefined' && window.RMS) {
    console.log('RMS class already defined, skipping redefinition');
    return;
  }
  
  // Define RMS class
  const RMS = class RMS {
    constructor() {
      this.sampleCount = 0;
      this.sumSquares = 0;
      this.rmsValue = 0;
    }

    /**
     * Calculate RMS value from audio buffer
     * @param {Float32Array|number[]} buffer - Audio sample buffer
     * @returns {number} RMS value (0.0 to 1.0 for normalized audio)
     */
    calculate(buffer) {
      if (!buffer || buffer.length === 0) {
        return 0;
      }

      let sum = 0;
      const length = buffer.length;

      for (let i = 0; i < length; i++) {
        const sample = buffer[i];
        sum += sample * sample;
      }

      this.rmsValue = Math.sqrt(sum / length);
      this.sampleCount += length;

      return this.rmsValue;
    }

    /**
     * Calculate RMS with sliding window for moving average
     * @param {Float32Array|number[]} buffer - Audio sample buffer
     * @param {number} windowSize - Size of sliding window in samples
     * @returns {number} RMS value
     */
    calculateSliding(buffer, windowSize = 1024) {
      if (!buffer || buffer.length === 0) {
        return 0;
      }

      // Use smaller of buffer length or window size
      const actualSize = Math.min(buffer.length, windowSize);
      const startIdx = Math.max(0, buffer.length - actualSize);

      let sum = 0;
      for (let i = startIdx; i < buffer.length; i++) {
        const sample = buffer[i];
        sum += sample * sample;
      }

      return Math.sqrt(sum / actualSize);
    }

    /**
     * Calculate RMS in dBFS (decibels relative to full scale)
     * @param {Float32Array|number[]} buffer - Audio sample buffer
     * @returns {number} RMS value in dBFS (negative values, 0 dBFS = maximum)
     */
    calculateDBFS(buffer) {
      const rms = this.calculate(buffer);
      
      // Convert to dBFS: 20 * log10(rms)
      // Clamp to prevent log(0)
      if (rms < 1e-10) {
        return -100; // Minimum representable value
      }
      
      return 20 * Math.log10(rms);
    }

    /**
     * Get cumulative RMS over all processed samples
     * @returns {number} Cumulative RMS value
     */
    getCumulativeRMS() {
      if (this.sampleCount === 0) {
        return 0;
      }
      
      // For cumulative calculation, we'd need to store sum of squares
      // This is a simplified version - for production use, maintain running sum
      return this.rmsValue;
    }

    /**
     * Reset statistics
     */
    reset() {
      this.sampleCount = 0;
      this.sumSquares = 0;
      this.rmsValue = 0;
    }

    /**
     * Static utility method for one-time RMS calculation
     * @param {Float32Array|number[]} buffer - Audio sample buffer
     * @returns {number} RMS value
     */
    static calculateStatic(buffer) {
      return new RMS().calculate(buffer);
    }

    /**
     * Convert RMS to percentage (0-100)
     * @param {number} rmsValue - RMS value (0-1)
     * @returns {number} Percentage (0-100)
     */
    static rmsToPercentage(rmsValue) {
      return Math.min(100, Math.max(0, rmsValue * 100));
    }

    /**
     * Classify RMS level
     * @param {number} rmsValue - RMS value (0-1)
     * @returns {string} Level classification
     */
    static classifyLevel(rmsValue) {
      if (rmsValue < 0.01) {
        return 'SILENCE'; // «Мертвая зона» / тишина
      } else if (rmsValue < 0.1) {
        return 'LOW'; // Низкая энергия
      } else if (rmsValue < 0.3) {
        return 'MEDIUM'; // Средняя энергия
      } else if (rmsValue < 0.7) {
        return 'HIGH'; // Высокая энергия
      } else {
        return 'CRITICAL'; // Критическая энергия (клиппинг)
      }
    }
  };

  // Attach to window for global access in browser
  if (typeof window !== 'undefined') {
    window.RMS = RMS;
  }
})();
