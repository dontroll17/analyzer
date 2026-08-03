/**
 * Synthetic signal generators for DSP testing
 * Pure functions — no browser dependencies, no side effects
 * Can be imported in Vitest, Node.js, or browser
 */

/**
 * Generate a pure sine wave buffer
 * @param {number} frequency - Frequency in Hz
 * @param {number} length - Number of samples
 * @param {number} sampleRate - Sample rate (default 44100)
 * @returns {Float32Array}
 */
export function generateSine(frequency, length, sampleRate = 44100) {
  const buffer = new Float32Array(length);
  const angularFreq = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin(angularFreq * i);
  }
  return buffer;
}

/**
 * Generate white noise buffer (uniform distribution)
 * @param {number} length - Number of samples
 * @param {number} seed - Optional seed for reproducibility
 * @returns {Float32Array}
 */
export function generateWhiteNoise(length, seed) {
  // Simple seeded PRNG (mulberry32)
  let s = seed || Math.random() * 0xFFFFFFFF;
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    s |= 0;
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    ((t = (t ^ t >>> 14) >>> 0) / 4294967296) >= 0.5 ?
      (buffer[i] = (t / 2147483648) - 1) :
      (buffer[i] = (t / 2147483648));
    s = t;
  }
  return buffer;
}

/**
 * Generate a silent buffer (all zeros)
 * @param {number} length - Number of samples
 * @returns {Float32Array}
 */
export function generateSilence(length) {
  return new Float32Array(length);
}

/**
 * Generate multi-tone signal
 * @param {number[]} frequencies - Array of frequencies in Hz
 * @param {number} length - Number of samples
 * @param {number} sampleRate - Sample rate
 * @param {number[]} amplitudes - Optional amplitudes (default 1 for each)
 * @returns {Float32Array}
 */
export function generateMultiTone(frequencies, length, sampleRate = 44100, amplitudes) {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let f = 0; f < frequencies.length; f++) {
      const amp = amplitudes ? amplitudes[f] : 1 / frequencies.length;
      sum += amp * Math.sin((2 * Math.PI * frequencies[f] * i) / sampleRate);
    }
    buffer[i] = sum;
  }
  return buffer;
}

/**
 * Generate noise with controlled SNR mixed with a signal
 * @param {Float32Array} signal - Original signal
 * @param {number} snrDb - Signal-to-noise ratio in dB
 * @returns {Float32Array} Signal + noise
 */
export function generateNoisySignal(signal, snrDb) {
  const signalPower = signal.reduce((sum, s) => sum + s * s, 0) / signal.length;
  const noisePower = signalPower / (10 ** (snrDb / 10));
  const noise = generateWhiteNoise(signal.length).map(() =>
    (Math.sqrt(2) * noisePower ** 0.5 * (Math.random() - 0.5))
  );
  // Scale noise properly
  const noiseStd = Math.sqrt(noisePower);
  const scaledNoise = generateWhiteNoise(signal.length).map(() =>
    noiseStd * (Math.random() * 2 - 1)
  );
  return new Float32Array(signal.length).map((_, i) => signal[i] + scaledNoise[i]);
}

/**
 * Generate impulse (delta function)
 * @param {number} index - Position of impulse
 * @param {number} length - Buffer length
 * @returns {Float32Array}
 */
export function generateImpulse(index, length) {
  const buffer = new Float32Array(length);
  buffer[index] = 1;
  return buffer;
}

/**
 * Generate linear chirp (sweep)
 * @param {number} fStart - Start frequency in Hz
 * @param {number} fEnd - End frequency in Hz
 * @param {number} length - Number of samples
 * @param {number} sampleRate - Sample rate
 * @returns {Float32Array}
 */
export function generateChirp(fStart, fEnd, length, sampleRate = 44100) {
  const buffer = new Float32Array(length);
  const phaseIncrement = (fEnd - fStart) / length;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const f = fStart + phaseIncrement * i;
    phase += (2 * Math.PI * f) / sampleRate;
    buffer[i] = Math.sin(phase);
  }
  return buffer;
}

/**
 * Generate amplitude-modulated signal
 * @param {number} carrierFreq - Carrier frequency in Hz
 * @param {number} modFreq - Modulation frequency in Hz
 * @param {number} modIndex - Modulation index (0-1)
 * @param {number} length - Number of samples
 * @param {number} sampleRate - Sample rate
 * @returns {Float32Array}
 */
export function generateAMSignal(carrierFreq, modFreq, modIndex, length, sampleRate = 44100) {
  const buffer = new Float32Array(length);
  const modAngularFreq = (2 * Math.PI * modFreq) / sampleRate;
  const carrierAngularFreq = (2 * Math.PI * carrierFreq) / sampleRate;
  for (let i = 0; i < length; i++) {
    const mod = 1 + modIndex * Math.sin(modAngularFreq * i);
    buffer[i] = mod * Math.sin(carrierAngularFreq * i);
  }
  return buffer;
}

/**
 * Calculate expected FFT bin for a given frequency
 * @param {number} frequency - Frequency in Hz
 * @param {number} fftSize - FFT size
 * @param {number} sampleRate - Sample rate
 * @returns {number} Bin index
 */
export function frequencyToBin(frequency, fftSize, sampleRate) {
  return Math.floor(frequency * fftSize / sampleRate);
}

/**
 * Validate that all samples are finite
 * @param {Float32Array} buffer - Audio buffer to validate
 * @returns {object} { valid: boolean, firstInvalidIndex: number|null, nanCount: number }
 */
export function validateBuffer(buffer) {
  let firstInvalid = null;
  let nanCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (!Number.isFinite(buffer[i])) {
      if (firstInvalid === null) firstInvalid = i;
      nanCount++;
    }
  }
  return { valid: nanCount === 0, firstInvalidIndex: firstInvalid, nanCount };
}

/**
 * Calculate peak-to-peak amplitude
 * @param {Float32Array} buffer
 * @returns {number}
 */
export function peakToPeak(buffer) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] < min) min = buffer[i];
    if (buffer[i] > max) max = buffer[i];
  }
  return max - min;
}
