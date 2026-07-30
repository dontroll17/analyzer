// ============================================================
// Real FFT: radix-2 Cooley-Tukey DIT (1024 points, real input)
// O(N log N) instead of O(N²) naive DFT — ~200x faster for N=1024
// ============================================================
const FFT_SIZE = 1024;
const HALF_N = FFT_SIZE / 2; // 512 frequency bins (Nyquist)

// Precomputed Hanning window: w[n] = 0.5 * (1 - cos(2πn/N))
// Eliminates spectral leakage at frame boundaries
const HANNING = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANNING[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / FFT_SIZE));
}

// Precomputed bit-reversal permutation table for Cooley-Tukey iterative FFT
// Enables in-place butterfly operations without temporary array allocation
const BIT_REVERSE = new Uint16Array(FFT_SIZE);
{
  const bits = Math.log2(FFT_SIZE); // 10
  for (let i = 0; i < FFT_SIZE; i++) {
    let rev = 0;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | ((i >> j) & 1);
    }
    BIT_REVERSE[i] = rev;
  }
}

// Precomputed twiddle factors table: ALL cos/sin values needed for all stages
// Layout: for each stage s (0..9), for each k (0..m/2-1), store [cos, sin]
// Total entries: sum(m/2 for m=2,4,8,...,1024) = 1+2+4+...+512 = 1023
// Access: twiddle[s * 1024 + k * 2] = cos, twiddle[s * 1024 + k * 2 + 1] = sin
// Using 1024 slots per stage for alignment (max m/2 = 512)
const TWIDDLE_DEPTH = 10; // log2(FFT_SIZE) = 10
const TWIDDLE_PER_STAGE = 1024;
const TWIDDLE_TABLE = new Float32Array(TWIDDLE_DEPTH * TWIDDLE_PER_STAGE * 2);
{
  for (let s = 0; s < TWIDDLE_DEPTH; s++) {
    const m = 1 << (s + 1); // 2, 4, 8, ..., 1024
    const halfM = m >> 1;
    const angle = -2 * Math.PI / m;
    const cosW = Math.cos(angle);
    const sinW = Math.sin(angle);
    
    let wRe = 1;
    let wIm = 0;
    for (let k = 0; k < halfM; k++) {
      const base = s * TWIDDLE_PER_STAGE * 2 + k * 2;
      TWIDDLE_TABLE[base] = wRe;     // cos(k * angle)
      TWIDDLE_TABLE[base + 1] = wIm; // sin(k * angle) [negative because angle < 0]
      // Recursive update
      const newRe = wRe * cosW - wIm * sinW;
      const newIm = wRe * sinW + wIm * cosW;
      wRe = newRe;
      wIm = newIm;
    }
  }
}

/**
 * In-place radix-2 FFT (DIT) — real input → complex output
 * Uses precomputed tables: BIT_REVERSE for permutation, HANNING for windowing.
 * Output: Float32Array of size 2*N interleaved [re0, im0, re1, im1, ..., reN-1, imN-1]
 * For real input, bins k and (N-k) are conjugate symmetric — only first N/2 are unique.
 */
function fftReal1024(input) {
  const N = FFT_SIZE;
  const tmp = new Float32Array(2 * N); // [re, im] interleaved

  // 1) Apply Hanning window
  for (let i = 0; i < N; i++) {
    tmp[2 * i] = input[i] * HANNING[i]; // re: real part
    tmp[2 * i + 1] = 0;                 // im: imaginary part = 0
  }

  // 2) Bit-reversal permutation
  const perm = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) {
    const j = BIT_REVERSE[i];
    perm[2 * i] = tmp[2 * j];
    perm[2 * i + 1] = tmp[2 * j + 1];
  }

  // 3) Cooley-Tukey iterative DIT FFT with precomputed twiddle table
  // Zero Math.cos/sin calls per frame — all twiddle factors precomputed
  for (let s = 0; s < TWIDDLE_DEPTH; s++) {
    const m = 1 << (s + 1); // 2, 4, 8, ..., 1024
    const halfM = m >> 1;
    const twiddleBase = s * TWIDDLE_PER_STAGE * 2; // table offset for this stage

    for (let k = 0; k < N; k += m) {
      for (let j = 0; j < halfM; j++) {
        // Load precomputed twiddle factor (cos, -sin)
        const twIdx = twiddleBase + j * 2;
        const wRe = TWIDDLE_TABLE[twIdx];
        const wIm = TWIDDLE_TABLE[twIdx + 1]; // already negative
        
        const idxU = 2 * (k + j);
        const idxT = 2 * (k + halfM + j);
        
        const uRe = perm[idxU];
        const uIm = perm[idxU + 1];
        const tReOrig = perm[idxT];
        const tImOrig = perm[idxT + 1];
        
        // Butterfly with precomputed twiddle
        const tRe = wRe * tReOrig - wIm * tImOrig;
        const tIm = wRe * tImOrig + wIm * tReOrig;
        
        perm[idxU] = uRe + tRe;
        perm[idxU + 1] = uIm + tIm;
        perm[idxT] = uRe - tRe;
        perm[idxT + 1] = uIm - tIm;
      }
    }
  }

  // 4) Extract magnitude spectrum: |X[k]| = sqrt(re² + im²)
  //    Only first N/2 bins are unique (symmetric for real input)
  const magnitude = new Float32Array(HALF_N);
  const scale = 2.0 / N; // normalization factor
  for (let k = 0; k < HALF_N; k++) {
    const re = perm[2 * k];
    const im = perm[2 * k + 1];
    magnitude[k] = Math.sqrt(re * re + im * im) * scale;
  }
  // DC bin (k=0) is not doubled — only bins 1..N/2-1 are mirrored
  magnitude[0] *= 0.5;

  return magnitude;
}

class AudioAnalyzer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fftSize = 1024;
    this.bufferSize = this.fftSize;
    
    // Двойные буферы для L/R каналов (stereo-aware)
    this.inputBuffers = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
    this.bufferCounts = [0, 0];
    this.waveformLeft = new Float32Array(this.bufferSize);
    this.waveformRight = new Float32Array(this.bufferSize);
    
    // Pre-allocate combinedFFT buffer (512 bins for 1024-point FFT — zero GC per frame)
    this.combinedFFT = new Float32Array(HALF_N);
    
    // Pre-allocate buffers for HNR autocorrelation (zero GC per frame)
    this._hnrAutocorr = new Float32Array(HALF_N);
    
    // Pre-allocate buffers for Spectral Flux onset detection
    this._prevFFT = new Float32Array(HALF_N);
    this._fluxHistory = new Float32Array(10); // Sliding window of 10 frames
    this._fluxIndex = 0;
    this._fluxSum = 0;
    
    // State per channel
    this.leftReady = false;
    this.rightReady = false;
    this.leftFrameData = null;
    this.rightFrameData = null;
    
    // Detected channel count (fixed for session)
    this.channelCount = 0;
    
    this.frameCount = 0;
    this.waveformFrameCounter = 0;
    this.WAVEFORM_THROTTLE = 1; // send waveform every frame for debugging
    this.warmupFrames = 15; // skip first N frames — buffers empty
    
    // Используем штатную глобальную переменную sampleRate воркета
    this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    // Glitch detector configuration
    this.glitchConfig = {
      highFreqThreshold: 0.85,      // Подняли с 0.75 до 0.85 (речь не перевалит за 85%)
      minTotalEnergy: 0.04,         // Игнорируем вдохи и тихий фон (RMS < 0.04)
      debounceTimeout: 800,         // Таймаут между глитчами
      driftThreshold: 0.70,         // DRIFT (бывш. WARNING) с 70%
      requiredConsecutiveFrames: 2  // Требуем 2 кадра аномалии подряд!
    };

    this.consecutiveGlitchFrames = 0; // Счетчик кадров подряд
    
    this.glitchState = 'STABLE';
    this.glitchCount = 0;
    this.lastGlitchTime = 0;
    
    // Обработка сообщений из main thread (настройки чувствительности)
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'SET_GITCH_CONFIG') {
        if (typeof event.data.highFreqThreshold === 'number' &&
            event.data.highFreqThreshold >= 0.60 &&
            event.data.highFreqThreshold <= 0.90) {
          this.glitchConfig.highFreqThreshold = event.data.highFreqThreshold;
        }
      }
      // Request DSP processing time
      if (event.data && event.data.type === 'REQUEST_DSP_TIME') {
        this.port.postMessage({
          type: 'DSP_TIME_REPORT',
          dspTime: this.lastDspTimeMs || 0
        });
      }
    };
  }

  calculateRMS(buffer) {
    let sum = 0;
    let peak = 0;
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      const sample = buffer[i];
      sum += sample * sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }
    return { rms: Math.sqrt(sum / length), peak };
  }

  /**
   * Настоящий radix-2 FFT (1024 точки) → 512 магнитудных бинов (0..Nyquist)
   * O(N log N) вместо O(N²) naive DFT — в ~200x быстрее для N=1024
   * 
   * С применением Hanning window для устранения spectral leakage
   * 
   * @param {Float32Array} buffer — 1024 сэмпла
   * @returns {Float32Array} magnitude spectrum, 512 бинов, |X[k]|
   */
  calculateFFT(buffer) {
    return fftReal1024(buffer);
  }

  /**
   * Преобразует Hz в индекс бина: bin[k] = k * sampleRate / FFT_SIZE
   * @param {number} hz — частота в Гц
   * @returns {number} индекс бина
   */
  _hzToBin(hz) {
    return Math.floor(hz * FFT_SIZE / this.sampleRate);
  }

  /**
   * Downsample 512 true FFT bins → 64 bins for popup visualization
   * Uses averaging (mean magnitude) per group — preserves energy distribution.
   */
  _downsampleSpectrum(source) {
    const out = new Float32Array(64);
    const groupSize = source.length / 64; // 8
    for (let g = 0; g < 64; g++) {
      let sum = 0;
      for (let i = 0; i < groupSize; i++) {
        sum += source[g * groupSize + i];
      }
      out[g] = sum / groupSize;
    }
    return out;
  }

  calculateBandEntropy(fftData) {
    // 4-band entropy с реальными Hz границами:
    // Bass(0-350Hz) | Voice(350-2000Hz) | Speech(2000-6000Hz) | Noise(6000-Nyquist)
    const boundaries = [350, 2000, 6000, this.sampleRate / 2];
    const edges = [0, ...boundaries.slice(0, -1)];
    
    let bandEnergies = [];
    let totalEnergy = 0;
    
    for (let b = 0; b < 4; b++) {
      const startBin = this._hzToBin(edges[b]);
      const endBin = this._hzToBin(boundaries[b]);
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
    return { entropy, bandEnergies, totalEnergy };
  }

  detectSpectralFlatness(fftData) {
    // Spectral flatness (Wiener entropy): ratio of geometric to arithmetic mean of power spectrum
    // Returns [0..1]: 0 = tonal (peaks), 1 = flat (white noise)
    // Uses true FFT power spectrum (magnitude²)
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

  calculateFrequencyBands(fftData) {
    // Реальные FFT бины → частоты: bin[k] = k * sampleRate / FFT_SIZE
    // sampleRate=44100, FFT_SIZE=1024 → 1 бин ≈ 43.07 Hz
    const nyquist = this.sampleRate / 2; // 22050 Hz

    const bassEnd = this._hzToBin(250);      // 0-250 Hz
    const midEnd = this._hzToBin(4000);      // 250-4000 Hz
    const trebleEnd = this._hzToBin(16000);  // 4000-16000 Hz (cap at 16kHz — most content is flat above)

    let bassSum = 0, bassCount = 0;
    let midSum = 0, midCount = 0;
    let trebleSum = 0, trebleCount = 0;

    for (let i = 0, n = fftData.length; i < n; i++) {
      const energy = fftData[i] * fftData[i];
      if (i < bassEnd) {
        bassSum += energy;
        bassCount++;
      } else if (i < midEnd) {
        midSum += energy;
        midCount++;
      } else if (i < trebleEnd) {
        trebleSum += energy;
        trebleCount++;
      }
    }

    // Use average energy per bin (not total) — equalizes bandwidth differences:
    // bass=6 bins, mid=89 bins, treble=368 bins.
    // Average per bin gives perceptually balanced bands.
    const bassAvg = bassCount > 0 ? bassSum / bassCount : 0;
    const midAvg = midCount > 0 ? midSum / midCount : 0;
    const trebleAvg = trebleCount > 0 ? trebleSum / trebleCount : 0;
    const totalAvg = bassAvg + midAvg + trebleAvg;

    const normalize = (val) => totalAvg > 0 ? (val / totalAvg) * 100 : 0;

    return {
      bass: normalize(bassAvg),
      mid: normalize(midAvg),
      treble: normalize(trebleAvg)
    };
  }

  detectHighFrequencyAnomaly(fftData) {
    const nyquist = this.sampleRate / 2;
    // Верхние 8 кГц: реальный Hz-based порог вместо "top 25% бинов"
    const hfStart = this._hzToBin(8000);
    
    const totalEnergy = fftData.reduce((sum, val) => sum + val * val, 0);
    if (totalEnergy < 1e-10) return 0;
    
    let highFreqEnergy = 0;
    for (let i = hfStart; i < fftData.length; i++) {
      highFreqEnergy += fftData[i] * fftData[i];
    }
    
    return highFreqEnergy / totalEnergy;
  }

  /**
   * C.2.3: Zero Crossing Rate (ZCR)
   * Counts sign changes in the waveform buffer.
   * High ZCR = noise/glitch, Low ZCR = tonal/stable
   * O(N) per frame, no allocations.
   */
  calculateZCR(buffer) {
    let crossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) {
        crossings++;
      }
    }
    // Convert to crossings per second
    const frameDuration = buffer.length / this.sampleRate;
    return crossings / frameDuration;
  }

  /**
   * C.2.4: Harmonic-to-Noise Ratio (HNR) approximation
   * Uses autocorrelation peak-to-valley ratio as proxy.
   * Optimized: computes on pre-allocated buffer, O(N²/2) but N=1024 is manageable.
   * Returns HNR in dB (higher = more harmonic).
   * NOTE: Compute every 2nd frame to stay within DSP budget.
   */
  calculateHNR(buffer) {
    const N = buffer.length;
    const maxLag = Math.floor(N / 4); // Limit search range
    const autocorr = this._hnrAutocorr;
    
    // Compute autocorrelation (lag 0 to maxLag)
    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < N - lag; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      autocorr[lag] = sum / (N - lag);
    }
    
    // Find max at lag 0 (should be the maximum)
    const maxCorr = Math.abs(autocorr[0]);
    
    // Find first valley after lag 0 (min in range [1, maxLag/2])
    let minCorr = Infinity;
    const valleyEnd = Math.floor(maxLag / 2);
    for (let lag = 1; lag <= valleyEnd; lag++) {
      const val = Math.abs(autocorr[lag]);
      if (val < minCorr) {
        minCorr = val;
      }
    }
    
    const signalPower = Math.max(maxCorr, 1e-10);
    const noisePower = Math.max(1e-10, signalPower - minCorr);
    
    return 10 * Math.log10(signalPower / noisePower);
  }

  /**
   * C.2.1: Spectral Centroid
   * Weighted average frequency of the spectrum.
   * Formula: Σ(f[k] * |X[k]|) / Σ(|X[k]|)
   * High centroid = bright/noisy, Low centroid = warm/tonal
   * Units: Hz
   */
  calculateSpectralCentroid(fftData) {
    let weightedSum = 0;
    let totalSum = 0;
    
    for (let k = 0; k < fftData.length; k++) {
      const freq = k * this.sampleRate / FFT_SIZE;
      weightedSum += freq * fftData[k];
      totalSum += fftData[k];
    }
    
    if (totalSum < 1e-10) return 0;
    return weightedSum / totalSum;
  }

  /**
   * C.2.2: Spectral Rolloff
   * Frequency below which 85% of spectral energy is contained.
   * Cumulative sum of magnitudes, find bin where sum >= threshold * totalSum
   * Units: Hz
   */
  calculateSpectralRolloff(fftData, threshold = 0.85) {
    let totalSum = 0;
    for (let k = 0; k < fftData.length; k++) {
      totalSum += fftData[k];
    }
    
    if (totalSum < 1e-10) return 0;
    
    const targetSum = totalSum * threshold;
    let cumulativeSum = 0;
    
    for (let k = 0; k < fftData.length; k++) {
      cumulativeSum += fftData[k];
      if (cumulativeSum >= targetSum) {
        return k * this.sampleRate / FFT_SIZE;
      }
    }
    
    // Should not reach here if threshold <= 1.0
    return this.sampleRate / 2;
  }

  /**
   * C.2.5: Spectral Flux for Onset Detection
   * Sum of positive differences between consecutive power spectra.
   * Onset when flux > 2x average flux (configurable).
   * Returns { flux, onsetDetected }
   */
  calculateSpectralFlux(currentFFT) {
    // Compute positive flux vs previous frame
    let flux = 0;
    for (let k = 0; k < currentFFT.length; k++) {
      const diff = currentFFT[k] * currentFFT[k] - this._prevFFT[k] * this._prevFFT[k];
      if (diff > 0) {
        flux += diff;
      }
    }
    
    // Update sliding window
    const oldEntry = this._fluxHistory[this._fluxIndex];
    this._fluxSum -= oldEntry;
    this._fluxHistory[this._fluxIndex] = flux;
    this._fluxSum += flux;
    this._fluxIndex = (this._fluxIndex + 1) % 10;
    
    // Copy current FFT to prev for next frame
    for (let k = 0; k < currentFFT.length; k++) {
      this._prevFFT[k] = currentFFT[k];
    }
    
    // Average flux
    let avgFlux = this._fluxSum / 10;
    if (avgFlux < 1e-10) avgFlux = 1e-10;
    
    // Onset detected if flux > 2x average
    const onsetDetected = flux > (2.0 * avgFlux);
    
    return { flux, onsetDetected };
  }

  /**
   * Glitch detection state machine
   * States: STABLE → DRIFT → GLITCH (transitions based on highFreqRatio + rms)
   * 
   * Transition logic:
   * 1. rms < minTotalEnergy → STABLE (ignore silence/breaths/quiet noise)
   * 2. highFreqRatio >= highFreqThreshold → count consecutive frames
   *    → if consecutive >= requiredConsecutiveFrames AND debounce timeout → GLITCH
   * 3. highFreqRatio >= driftThreshold (but < highFreqThreshold) → DRIFT
   * 4. Otherwise → STABLE (reset consecutive counter)
   * 
   * @param {number} rms - Root mean square energy (0–1)
   * @param {number} highFreqRatio - Ratio of high-frequency energy to total energy (0–1)
   * @returns {{ isGlitch: boolean, state: string }} Current state info
   */
  checkGlitchState(rms, highFreqRatio) {
    const config = this.glitchConfig;
    const now = Date.now();

    // 1. Silence threshold: ignore quiet signals (breaths, background noise)
    if (rms < config.minTotalEnergy) {
      this.consecutiveGlitchFrames = 0;
      this.glitchState = 'STABLE';
      return { isGlitch: false, state: 'STABLE' };
    }

    // 2. GLITCH detection: high-frequency anomaly for N consecutive frames
    if (highFreqRatio >= config.highFreqThreshold) {
      this.consecutiveGlitchFrames++;
      
      // Only count glitch if anomaly lasts for requiredConsecutiveFrames
      if (this.consecutiveGlitchFrames >= config.requiredConsecutiveFrames) {
        if (now - this.lastGlitchTime > config.debounceTimeout) {
          this.glitchCount++;
          this.lastGlitchTime = now;
          this.glitchState = 'GLITCH';
          return { isGlitch: true, state: 'GLITCH' };
        }
      }
      return { isGlitch: false, state: this.glitchState };
    }

    // Reset consecutive frame counter when anomaly ends
    this.consecutiveGlitchFrames = 0;

    // 3. DRIFT detection: elevated high-frequency energy (below glitch threshold)
    if (highFreqRatio >= config.driftThreshold) {
      this.glitchState = 'DRIFT';
      return { isGlitch: false, state: 'DRIFT' };
    }

    // 4. Back to STABLE
    this.glitchState = 'STABLE';
    return { isGlitch: false, state: 'STABLE' };
  }

  /**
    * Обработка кадра для одного канала (L или R)
    * Вызывается из process() когда буфер канала заполнен
    * 
    * NOTE: checkGlitchState() is called ONLY in processFrame() with combined
    * metrics. Calling it here would corrupt consecutiveGlitchFrames and glitchCount
    * because this function runs 2-3× per frame (per-channel + combined).
    */
  processChannelFrame(ch) {
    const buffer = this.inputBuffers[ch];
    const { rms, peak } = this.calculateRMS(buffer);
    const fft = this.calculateFFT(buffer);
    const bands = this.calculateFrequencyBands(fft);
    const highFreqAnomaly = this.detectHighFrequencyAnomaly(fft);
    
    // C.2.3: ZCR (per-channel, waveform-based metric)
    const zcr = this.calculateZCR(buffer);
    
    // Сохраняем данные для объединения позже
    const frameData = { rms, peak, fft, bands, highFreqAnomaly, zcr };
    
    if (ch === 0) {
      this.leftFrameData = frameData;
      // Копируем waveform
      for (let i = 0; i < buffer.length; i++) {
        this.waveformLeft[i] = buffer[i];
      }
      this.leftReady = true;
    } else {
      this.rightFrameData = frameData;
      // Копируем waveform
      for (let i = 0; i < buffer.length; i++) {
        this.waveformRight[i] = buffer[i];
      }
      this.rightReady = true;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const processStartTime = (typeof self !== 'undefined' && self.performance?.now) ? self.performance.now() : Date.now();
    
    // 1. Пробрасываем звук на динамики
    if (input && output && input.length > 0) {
      for (let channel = 0; channel < input.length; channel++) {
        if (output[channel]) {
          output[channel].set(input[channel]);
        }
      }
    }

    // 2. Буферизация по каналам
    // inputs[0] — массив блоков: inputs[0][0] = левый, inputs[0][1] = правый
    if (input && input.length > 0) {
      // Определяем количество каналов при первом вызове (фиксируем на всю сессию)
      if (this.channelCount === 0) {
        this.channelCount = input.length;
      }
      
      for (let ch = 0; ch < input.length; ch++) {
        const channelData = input[ch];
        const numSamples = channelData.length;
        
        for (let i = 0; i < numSamples; i++) {
          this.inputBuffers[ch][this.bufferCounts[ch]] = channelData[i];
          this.bufferCounts[ch]++;
          
          if (this.bufferCounts[ch] >= this.bufferSize) {
            this.processChannelFrame(ch);
            this.bufferCounts[ch] = 0;
          }
        }
      }
      
      // Отправляем фрейм когда ВСЕ каналы заполнены:
      // Mono (channelCount=1): достаточно левого
      // Stereo (channelCount=2): нужны оба канала — иначе мерцает MONO/STEREO
      if (this.leftReady && (this.channelCount === 1 || this.rightReady)) {
        this.processFrame();
        this.leftReady = false;
        this.rightReady = false;
        this.leftFrameData = null;
        this.rightFrameData = null;
      }
    }
    
    // Measure DSP processing time
    const nowTime = (typeof self !== 'undefined' && self.performance?.now) ? self.performance.now() : Date.now();
    const processElapsed = nowTime - processStartTime;
    // Smooth with exponential moving average (alpha=0.1)
    if (!this.lastDspTimeMs) {
      this.lastDspTimeMs = processElapsed;
    } else {
      this.lastDspTimeMs += (processElapsed - this.lastDspTimeMs) * 0.1;
    }
    
    return true;
  }

  processFrame() {
    this.frameCount++;
    this.waveformFrameCounter++;
    
    // Skip warmup frames — buffers empty, metrics are garbage (Infinity, 0)
    if (this.frameCount <= this.warmupFrames) return;
    
    const leftData = this.leftFrameData;
    const rightData = this.rightFrameData;
    
    // Combined RMS: используем максимальный peak для stereo
    const combinedRMS = leftData ? leftData.rms : (rightData ? rightData.rms : 0);
    const leftPeak = leftData ? leftData.peak : 0;
    const rightPeak = rightData ? rightData.peak : 0;
    const peakRMS = Math.max(leftPeak, rightPeak);
    
    // Combined FFT для entropy/flatness (сумма энергий обоих каналов)
    // Use pre-allocated buffer (buffer pooling — zero GC pressure)
    if (leftData && rightData) {
      for (let i = 0; i < leftData.fft.length; i++) {
        this.combinedFFT[i] = leftData.fft[i] + rightData.fft[i];
      }
    } else {
      // Copy from left or right FFT into combinedFFT
      const src = leftData ? leftData.fft : rightData.fft;
      for (let i = 0; i < src.length; i++) {
        this.combinedFFT[i] = src[i];
      }
    }
    
    // Frequency bands для combo
    let combinedBands;
    if (leftData && rightData) {
      combinedBands = {
        bass: (leftData.bands.bass + rightData.bands.bass) / 2,
        mid: (leftData.bands.mid + rightData.bands.mid) / 2,
        treble: (leftData.bands.treble + rightData.bands.treble) / 2
      };
    } else {
      combinedBands = leftData ? leftData.bands : rightData.bands;
    }
    
    // Glitch detection: максимальный highFreqAnomaly из каналов
    const leftHFA = leftData ? leftData.highFreqAnomaly : 0;
    const rightHFA = rightData ? rightData.highFreqAnomaly : 0;
    const combinedHighFreqAnomaly = Math.max(leftHFA, rightHFA);
    const glitchInfo = this.checkGlitchState(combinedRMS, combinedHighFreqAnomaly);
    
    // Entropy/flatness на combined FFT
    const bandEnt = this.calculateBandEntropy(this.combinedFFT);
    const flatness = this.detectSpectralFlatness(this.combinedFFT);
    const entropy = bandEnt.entropy;
    
    // Voice: concentrated in Voice+Speech bands, NOT flat → STABLE/DRIFT
    // Noise: spread across all 4 bands + flat spectrum → GLITCH
    // Music: Bass/Voice dominant → STABLE
    let entropyState = 'STABLE';
    if (entropy > 1.5 && flatness > 0.4) {
      entropyState = 'GLITCH';
    } else if (entropy > 1.0 || (flatness > 0.6 && entropy > 0.8)) {
      entropyState = 'DRIFT';
    }
    
    // C.2.1: Spectral Centroid (on combined FFT)
    const spectralCentroid = this.calculateSpectralCentroid(this.combinedFFT);
    
    // C.2.2: Spectral Rolloff (on combined FFT)
    const spectralRolloff = this.calculateSpectralRolloff(this.combinedFFT);
    
    // C.2.5: Spectral Flux / Onset Detection (on combined FFT)
    const { onsetDetected } = this.calculateSpectralFlux(this.combinedFFT);
    
    // C.2.3: Combined ZCR (average of left/right)
    let combinedZCR = 0;
    if (leftData && rightData) {
      combinedZCR = (leftData.zcr + rightData.zcr) / 2;
    } else {
      combinedZCR = leftData ? leftData.zcr : (rightData ? rightData.zcr : 0);
    }
    
    // C.2.4: HNR (compute every 2nd frame to stay within DSP budget)
    let hnr = 0;
    if (this.frameCount % 2 === 0) {
      const buffer = leftData ? this.waveformLeft : this.waveformRight;
      hnr = this.calculateHNR(buffer);
    }
    
    // C.2.8: Dynamic Range (Peak - RMS in dB)
    const peakdB = peakRMS > 0 ? 20 * Math.log10(peakRMS) : -Infinity;
    const rmsdB = combinedRMS > 0 ? 20 * Math.log10(combinedRMS) : -Infinity;
    const dynamicRange = peakdB - rmsdB; // >= 0 dB
    
    // C.2.10: Inter-band Energy Ratios (log-scaled, ~0dB = balanced)
    const bassMidRatio = combinedBands.mid > 1e-10
      ? 10 * Math.log10(combinedBands.bass / combinedBands.mid)
      : -Infinity;
    const midTrebleRatio = combinedBands.treble > 1e-10
      ? 10 * Math.log10(combinedBands.mid / combinedBands.treble)
      : -Infinity;
    
    // C.2.9: Glitch Rate (glitches per second, sliding 1s window)
    const now = Date.now();
    if (this._glitchWindow) {
      this._glitchWindow.push(now);
      // Remove entries older than 1s
      while (this._glitchWindow.length > 0 && this._glitchWindow[0] < now - 1000) {
        this._glitchWindow.shift();
      }
    } else {
      this._glitchWindow = [now];
    }
    
    // Throttle waveform to ~10 Hz (every 4 frames at 43 fps)
    const includeWaveform = (this.waveformFrameCounter % this.WAVEFORM_THROTTLE === 0);
    
    // Use new Float32Array() instead of Array.from() — single memcpy, no boxing
    // Downsample 512 true FFT bins → 64 bins for popup visualization
    const spectrumCopy = this._downsampleSpectrum(this.combinedFFT);
    
    const payload = {
      type: 'METRICS',
      timestamp: Date.now(),
      frame: this.frameCount,
      rms: combinedRMS,
      peakRMS: peakRMS,
      spectrum: spectrumCopy,
      bass: combinedBands.bass,
      mid: combinedBands.mid,
      treble: combinedBands.treble,
      rmsRight: rightData ? rightData.rms : undefined,
      bassRight: rightData ? rightData.bands.bass : undefined,
      midRight: rightData ? rightData.bands.mid : undefined,
      trebleRight: rightData ? rightData.bands.treble : undefined,
      highFreqAnomaly: combinedHighFreqAnomaly,
      entropy: entropy,
      flatness: flatness,
      entropyState: entropyState,
      isGlitch: glitchInfo.isGlitch,
      glitchState: glitchInfo.state,
      glitchCount: this.glitchCount,
      // C.2.x new metrics
      hnr: hnr,
      zcr: combinedZCR,
      spectralCentroid: spectralCentroid,
      spectralRolloff: spectralRolloff,
      onsetDetected: onsetDetected,
      // C.2.8–C.2.10
      dynamicRange: dynamicRange,
      bassMidRatio: bassMidRatio,
      midTrebleRatio: midTrebleRatio,
      glitchRate: this._glitchWindow ? this._glitchWindow.length : 0
    };
    
    if (includeWaveform) {
      // Create a copy BEFORE serialization — serialization converts Float32Array to plain object {0: val, 1: val}
      // Object.values() correctly extracts values in order: [val0, val1, ...]
      payload.waveform = Object.values(this.waveformLeft);
      if (rightData) {
        payload.waveformRight = Object.values(this.waveformRight);
      }
    } else {
      payload.waveformHold = true;
    }
    
    this.port.postMessage(payload);
  }
}

registerProcessor('audio-analyzer', AudioAnalyzer);