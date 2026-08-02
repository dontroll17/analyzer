// dsp-engine-testable.js — Pure logic extracted from audio-worklet.js for testing

const FFT_SIZE = 1024;
const HALF_N = FFT_SIZE / 2;

// Precomputed Hanning window
const HANNING = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANNING[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / FFT_SIZE));
}

// Precomputed bit-reversal permutation
const BIT_REVERSE = new Uint16Array(FFT_SIZE);
{
  const bits = Math.log2(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    let rev = 0;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | ((i >> j) & 1);
    }
    BIT_REVERSE[i] = rev;
  }
}

// Precomputed twiddle factors table
const TWIDDLE_DEPTH = 10;
const TWIDDLE_PER_STAGE = 1024;
const TWIDDLE_TABLE = new Float32Array(TWIDDLE_DEPTH * TWIDDLE_PER_STAGE * 2);
{
  for (let s = 0; s < TWIDDLE_DEPTH; s++) {
    const m = 1 << (s + 1);
    const halfM = m >> 1;
    const angle = -2 * Math.PI / m;
    const cosW = Math.cos(angle);
    const sinW = Math.sin(angle);
    let wRe = 1;
    let wIm = 0;
    for (let k = 0; k < halfM; k++) {
      const base = s * TWIDDLE_PER_STAGE * 2 + k * 2;
      TWIDDLE_TABLE[base] = wRe;
      TWIDDLE_TABLE[base + 1] = wIm;
      const newRe = wRe * cosW - wIm * sinW;
      const newIm = wRe * sinW + wIm * cosW;
      wRe = newRe;
      wIm = newIm;
    }
  }
}

function fftReal1024(input) {
  const N = FFT_SIZE;
  const tmp = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) {
    tmp[2 * i] = input[i] * HANNING[i];
    tmp[2 * i + 1] = 0;
  }
  const perm = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) {
    const j = BIT_REVERSE[i];
    perm[2 * i] = tmp[2 * j];
    perm[2 * i + 1] = tmp[2 * j + 1];
  }
  for (let s = 0; s < TWIDDLE_DEPTH; s++) {
    const m = 1 << (s + 1);
    const halfM = m >> 1;
    const twiddleBase = s * TWIDDLE_PER_STAGE * 2;
    for (let k = 0; k < N; k += m) {
      for (let j = 0; j < halfM; j++) {
        const twIdx = twiddleBase + j * 2;
        const wRe = TWIDDLE_TABLE[twIdx];
        const wIm = TWIDDLE_TABLE[twIdx + 1];
        const idxU = 2 * (k + j);
        const idxT = 2 * (k + halfM + j);
        const uRe = perm[idxU];
        const uIm = perm[idxU + 1];
        const tReOrig = perm[idxT];
        const tImOrig = perm[idxT + 1];
        const tRe = wRe * tReOrig - wIm * tImOrig;
        const tIm = wRe * tImOrig + wIm * tReOrig;
        perm[idxU] = uRe + tRe;
        perm[idxU + 1] = uIm + tIm;
        perm[idxT] = uRe - tRe;
        perm[idxT + 1] = uIm - tIm;
      }
    }
  }
  const magnitude = new Float32Array(HALF_N);
  const scale = 2.0 / N;
  for (let k = 0; k < HALF_N; k++) {
    const re = perm[2 * k];
    const im = perm[2 * k + 1];
    magnitude[k] = Math.sqrt(re * re + im * im) * scale;
  }
  magnitude[0] *= 0.5;
  return magnitude;
}

function hzToBin(hz, sampleRate) {
  sampleRate = sampleRate || 44100;
  return Math.floor(hz * FFT_SIZE / sampleRate);
}

function downsampleSpectrum(source) {
  const out = new Float32Array(64);
  const groupSize = source.length / 64;
  for (let g = 0; g < 64; g++) {
    let sum = 0;
    for (let i = 0; i < groupSize; i++) {
      sum += source[g * groupSize + i];
    }
    out[g] = sum / groupSize;
  }
  return out;
}

function calculateBandEntropy(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  const boundaries = [350, 2000, 6000, sampleRate / 2];
  const edges = [0, boundaries[0], boundaries[1], boundaries[2]];
  let bandEnergies = [];
  let totalEnergy = 0;
  for (let b = 0; b < 4; b++) {
    const startBin = hzToBin(edges[b], sampleRate);
    const endBin = hzToBin(boundaries[b], sampleRate);
    const clampedEnd = Math.min(fftData.length, endBin);
    let energy = 0;
    for (let i = startBin; i < clampedEnd; i++) {
      energy += fftData[i] * fftData[i];
    }
    bandEnergies.push(energy);
    totalEnergy += energy;
  }
  if (totalEnergy < 1e-10) return 0;
  let entropy = 0;
  for (let i = 0; i < 4; i++) {
    if (bandEnergies[i] < 1e-10) continue;
    const p = bandEnergies[i] / totalEnergy;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function detectSpectralFlatness(fftData) {
  const n = fftData.length;
  let arithmeticMean = 0;
  let logSum = 0;
  for (let i = 0; i < n; i++) {
    const power = fftData[i] * fftData[i];
    arithmeticMean += power;
    if (power > 1e-10) logSum += Math.log(power);
  }
  arithmeticMean /= n;
  const geometricMean = n > 0 ? Math.exp(logSum / n) : 0;
  if (arithmeticMean < 1e-10) return 0;
  return geometricMean / arithmeticMean;
}

function calculateFrequencyBands(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  const bassEnd = hzToBin(250, sampleRate);
  const midEnd = hzToBin(4000, sampleRate);
  const trebleEnd = hzToBin(16000, sampleRate);
  let bassSum = 0, bassCount = 0;
  let midSum = 0, midCount = 0;
  let trebleSum = 0, trebleCount = 0;
  for (let i = 0, n = fftData.length; i < n; i++) {
    const energy = fftData[i] * fftData[i];
    if (i < bassEnd) { bassSum += energy; bassCount++; }
    else if (i < midEnd) { midSum += energy; midCount++; }
    else if (i < trebleEnd) { trebleSum += energy; trebleCount++; }
  }
  const bassAvg = bassCount > 0 ? bassSum / bassCount : 0;
  const midAvg = midCount > 0 ? midSum / midCount : 0;
  const trebleAvg = trebleCount > 0 ? trebleSum / trebleCount : 0;
  const totalAvg = bassAvg + midAvg + trebleAvg;
  const normalize = function(val) { return totalAvg > 0 ? (val / totalAvg) * 100 : 0; };
  return { bass: normalize(bassAvg), mid: normalize(midAvg), treble: normalize(trebleAvg) };
}

function detectHighFrequencyAnomaly(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  const hfStart = hzToBin(8000, sampleRate);
  const totalEnergy = fftData.reduce(function(sum, val) { return sum + val * val; }, 0);
  if (totalEnergy < 1e-10) return 0;
  let highFreqEnergy = 0;
  for (let i = hfStart; i < fftData.length; i++) {
    highFreqEnergy += fftData[i] * fftData[i];
  }
  return highFreqEnergy / totalEnergy;
}

function calculateZCR(buffer) {
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) crossings++;
  }
  return crossings / (buffer.length / 44100);
}

function calculateRMS(buffer) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i];
    sum += sample * sample;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
  }
  return { rms: Math.sqrt(sum / buffer.length), peak: peak };
}

function calculateSpectralCentroid(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  let weightedSum = 0;
  let totalSum = 0;
  for (let k = 0; k < fftData.length; k++) {
    const freq = k * sampleRate / FFT_SIZE;
    weightedSum += freq * fftData[k];
    totalSum += fftData[k];
  }
  if (totalSum < 1e-10) return 0;
  return weightedSum / totalSum;
}

function calculateSpectralRolloff(fftData, sampleRate, threshold) {
  sampleRate = sampleRate || 44100;
  threshold = threshold || 0.85;
  let totalSum = 0;
  for (let k = 0; k < fftData.length; k++) totalSum += fftData[k];
  if (totalSum < 1e-10) return 0;
  const targetSum = totalSum * threshold;
  let cumulativeSum = 0;
  for (let k = 0; k < fftData.length; k++) {
    cumulativeSum += fftData[k];
    if (cumulativeSum >= targetSum) return k * sampleRate / FFT_SIZE;
  }
  return sampleRate / 2;
}

function checkGlitchState(rms, highFreqRatio, config) {
  var defaults = {
    highFreqThreshold: 0.85,
    minTotalEnergy: 0.04,
    debounceTimeout: 800,
    driftThreshold: 0.70,
    requiredConsecutiveFrames: 2
  };
  var c = config || defaults;
  var state = {
    consecutiveGlitchFrames: 0,
    glitchState: 'STABLE',
    glitchCount: 0,
    lastGlitchTime: 0
  };
  if (rms < c.minTotalEnergy) {
    return { isGlitch: false, state: 'STABLE', stateInfo: state };
  }
  if (highFreqRatio >= c.highFreqThreshold) {
    state.consecutiveGlitchFrames = 1;
    if (state.consecutiveGlitchFrames >= c.requiredConsecutiveFrames) {
      var now = Date.now();
      if (now - state.lastGlitchTime > c.debounceTimeout) {
        state.glitchCount = 1;
        state.lastGlitchTime = now;
        state.glitchState = 'GLITCH';
        return { isGlitch: true, state: 'GLITCH', stateInfo: state };
      }
    }
    return { isGlitch: false, state: state.glitchState, stateInfo: state };
  }
  state.consecutiveGlitchFrames = 0;
  if (highFreqRatio >= c.driftThreshold) {
    state.glitchState = 'DRIFT';
    return { isGlitch: false, state: 'DRIFT', stateInfo: state };
  }
  state.glitchState = 'STABLE';
  return { isGlitch: false, state: 'STABLE', stateInfo: state };
}

module.exports = {
  fftReal1024,
  hzToBin,
  downsampleSpectrum,
  calculateBandEntropy,
  detectSpectralFlatness,
  calculateFrequencyBands,
  detectHighFrequencyAnomaly,
  calculateZCR,
  calculateRMS,
  calculateSpectralCentroid,
  calculateSpectralRolloff,
  checkGlitchState,
  calculateMFCC,
  FFT_SIZE,
  HALF_N
};

// ============================================================
// V4: MFCC extraction (13 coefficients)
// ============================================================

const MFCC_MEL_FILTERS = 40;
const MFCC_MFCC_COEFFS = 13;

function _hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
function _melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

function _createMelFilterBank(numBins, sampleRate) {
  const nyquist = sampleRate / 2;
  const melMin = _hzToMel(20);
  const melMax = _hzToMel(nyquist);
  const melStep = (melMax - melMin) / (MFCC_MEL_FILTERS + 1);

  const filterEdges = [];
  for (let i = 0; i <= MFCC_MEL_FILTERS + 1; i++) {
    filterEdges.push(_melToHz(melMin + i * melStep));
  }

  const binEdges = filterEdges.map(function(hz) { return Math.floor(hz * FFT_SIZE / sampleRate); });

  const banks = [];
  for (let i = 0; i < MFCC_MEL_FILTERS; i++) {
    const start = Math.max(0, binEdges[i]);
    const end = Math.min(numBins - 1, binEdges[i + 2]);
    if (start < end) {
      banks.push({ start: start, end: end });
    }
  }
  return banks;
}

function _createDCTMatrix(numCoeffs, numBands) {
  const matrix = new Float32Array(numCoeffs * numBands);
  for (let k = 0; k < numCoeffs; k++) {
    for (let n = 0; n < numBands; n++) {
      const idx = k * numBands + n;
      matrix[idx] = Math.cos(Math.PI * k * (2 * n + 1) / (2 * numBands));
    }
  }
  return matrix;
}

// Precomputed for default sample rate
var _melBanks = null;
var _dctMatrix = null;

function _ensureMelBank(sampleRate) {
  sampleRate = sampleRate || 44100;
  if (_melBanks && _dctMatrix) return;
  _melBanks = _createMelFilterBank(HALF_N, sampleRate);
  _dctMatrix = _createDCTMatrix(MFCC_MFCC_COEFFS, MFCC_MEL_FILTERS);
}

/**
 * Compute MFCC (13 coefficients) from magnitude spectrum
 * @param {Float32Array} fftData - magnitude spectrum (512 bins)
 * @param {number} sampleRate - sample rate (default 44100)
 * @returns {Float32Array} 13 MFCC coefficients or null
 */
function calculateMFCC(fftData, sampleRate) {
  sampleRate = sampleRate || 44100;
  _ensureMelBank(sampleRate);
  
  if (!_melBanks || _melBanks.length === 0) {
    return null;
  }

  // Step 1: Mel filter bank energies
  var melEnergy = new Float32Array(MFCC_MEL_FILTERS);
  for (var f = 0; f < MFCC_MEL_FILTERS; f++) {
    var filter = _melBanks[f];
    var energy = 0;
    for (var b = filter.start; b <= filter.end; b++) {
      var mag = fftData[b];
      energy += mag * mag;
    }
    melEnergy[f] = energy;
  }

  // Step 2: Log compression
  for (var f = 0; f < MFCC_MEL_FILTERS; f++) {
    melEnergy[f] = Math.log(melEnergy[f] + 1e-10);
  }

  // Step 3: DCT-II → 13 coefficients
  var mfcc = new Float32Array(MFCC_MFCC_COEFFS);
  for (var k = 0; k < MFCC_MFCC_COEFFS; k++) {
    var sum = 0;
    var rowOffset = k * MFCC_MEL_FILTERS;
    for (var n = 0; n < MFCC_MEL_FILTERS; n++) {
      sum += melEnergy[n] * _dctMatrix[rowOffset + n];
    }
    mfcc[k] = sum;
  }

  return mfcc;
}
