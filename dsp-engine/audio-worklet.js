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
 * 
 * Optional dest buffers for zero-allocation path (used by AudioAnalyzer).
 */
function fftReal1024(input, destTmp, destPerm, destMagnitude) {
  const N = FFT_SIZE;
  const tmp = destTmp || new Float32Array(2 * N); // [re, im] interleaved

  // 1) Apply Hanning window
  for (let i = 0; i < N; i++) {
    tmp[2 * i] = input[i] * HANNING[i]; // re: real part
    tmp[2 * i + 1] = 0;                 // im: imaginary part = 0
  }

  // 2) Bit-reversal permutation
  const perm = destPerm || new Float32Array(2 * N);
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
  const magnitude = destMagnitude || new Float32Array(HALF_N);
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

/**
 * In-place radix-2 IFFT (DIT) — complex input → complex output
 * Reuses same Cooley-Tukey butterfly with conjugated twiddle (+wIm instead of -wIm)
 * Output: Float32Array of size 2*N interleaved [re0, im0, re1, im1, ..., reN-1, imN-1]
 * Normalization: divide all outputs by N for proper IFFT scaling
 * 
 * @param {Float32Array} input — [re0, im0, re1, im1, ..., reN-1, imN-1]
 * @param {Float32Array} [destTmp] — optional temp buffer
 * @param {Float32Array} [destPerm] — optional perm buffer
 * @param {Float32Array} [destOutput] — optional output buffer
 * @returns {Float32Array} — IFFT output (real signal)
 */
function ifftComplex1024(input, destTmp, destPerm, destOutput) {
  const N = FFT_SIZE;
  const tmp = destTmp || new Float32Array(2 * N); // [re, im] interleaved

  // Copy input with conjugated twiddle (flip sign of imaginary part)
  // For IFFT: we conjugate the input, run FFT, then conjugate output and divide by N
  for (let i = 0; i < N; i++) {
    tmp[2 * i] = input[2 * i];      // re: unchanged
    tmp[2 * i + 1] = -input[2 * i + 1]; // im: conjugate
  }

  // Bit-reversal permutation
  const perm = destPerm || new Float32Array(2 * N);
  for (let i = 0; i < N; i++) {
    const j = BIT_REVERSE[i];
    perm[2 * i] = tmp[2 * j];
    perm[2 * i + 1] = tmp[2 * j + 1];
  }

  // Cooley-Tukey DIT FFT with CONJUGATED twiddle (+wIm instead of -wIm)
  for (let s = 0; s < TWIDDLE_DEPTH; s++) {
    const m = 1 << (s + 1);
    const halfM = m >> 1;
    const twiddleBase = s * TWIDDLE_PER_STAGE * 2;

    for (let k = 0; k < N; k += m) {
      for (let j = 0; j < halfM; j++) {
        // Load precomputed twiddle (cos, -sin) — negate to get (+sin) for IFFT
        const twIdx = twiddleBase + j * 2;
        const wRe = TWIDDLE_TABLE[twIdx];
        const wIm = -TWIDDLE_TABLE[twIdx + 1]; // flip sign: -(-sin) = +sin

        const idxU = 2 * (k + j);
        const idxT = 2 * (k + halfM + j);

        const uRe = perm[idxU];
        const uIm = perm[idxU + 1];
        const tReOrig = perm[idxT];
        const tImOrig = perm[idxT + 1];

        // Butterfly with conjugated twiddle
        const tRe = wRe * tReOrig - wIm * tImOrig;
        const tIm = wRe * tImOrig + wIm * tReOrig;

        perm[idxU] = uRe + tRe;
        perm[idxU + 1] = uIm + tIm;
        perm[idxT] = uRe - tRe;
        perm[idxT + 1] = uIm - tIm;
      }
    }
  }

  // Extract real parts, conjugate back, and normalize by N
  const output = destOutput || new Float32Array(N);
  for (let i = 0; i < N; i++) {
    output[i] = perm[2 * i] / N; // real part / N, imag part should be ~0
  }

  return output;
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
    
    // Pre-allocate buffers for HNR (zero GC per frame)
    this._hnrAutocorr = new Float32Array(HALF_N);
    this._hnrPower = new Float32Array(HALF_N);  // PSD buffer for Wiener–Khinchin
    this._hnrIFFTInput = new Float32Array(FFT_SIZE); // Complex buffer for IFFT (real-only → 512 unique)
    
    // Pre-allocate buffers for Spectral Flux onset detection
    this._prevFFT = new Float32Array(HALF_N);
    this._fluxHistory = new Float32Array(10); // Sliding window of 10 frames
    this._fluxIndex = 0;
    this._fluxSum = 0;
    
    // === C-1/H-3/H-4: Zero-allocation buffers for FFT, MFCC, downsample ===
    // Pre-allocated in constructor → eliminates ~656 KB/s GC pressure at 43 fps
    this._fftTmp = new Float32Array(2 * FFT_SIZE);       // tmp for fftReal1024
    this._fftPerm = new Float32Array(2 * FFT_SIZE);       // perm for fftReal1024
    this._fftMagnitude = new Float32Array(HALF_N);        // magnitude output for fftReal1024
    
    this._ifftTmp = new Float32Array(2 * FFT_SIZE);       // tmp for ifftComplex1024
    this._ifftPerm = new Float32Array(2 * FFT_SIZE);      // perm for ifftComplex1024
    this._ifftOutput = new Float32Array(FFT_SIZE);        // real output for ifftComplex1024
    
    this._mfccMelEnergy = new Float32Array(MFCC_MEL_FILTERS); // mel filter energies
    this._mfccResult = new Float32Array(MFCC_MFCC_COEFFS);      // MFCC output
    
    this._downsampleOutput = new Float32Array(64);           // spectrum downsample output
    
    // Pre-allocated for MFCC top-4 (H-3 fix: eliminates 2 Array allocations/frame at 43 Hz)
    this._mfccTop4 = new Float32Array(4);
    this._mfccStdTop4 = new Float32Array(4);
    
    this._melBankSampleRate = 0; // Track sample rate for Mel bank rebuild
    
    // State per channel
    this.leftReady = false;
    this.rightReady = false;
    this.leftFrameData = null;
    this.rightFrameData = null;
    
    // Detected channel count (fixed for session)
    this.channelCount = 0;
    
    this.frameCount = 0;
    this.waveformFrameCounter = 0;
    this.WAVEFORM_THROTTLE = 4; // ~10fps waveform — reduces MessagePort serialization by ~75% without visible quality loss
    
    // === P.2 DSP DECIMATION: Two-level quantization ===
    // K=8: heavy spectral analysis runs every 8th quantum (~43 Hz vs ~344 Hz)
    // Light frame: RMS/peak every quantum (~344 Hz, <1ms)
    // Heavy frame: FFT/MFCC/HNR every K=8 quanta (~43 Hz, <1.5ms)
    this.DECIMATION_K = 8;
    this._quantumInCycle = 0; // 0..K-1 counter
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
    
    // === H-10: Circular buffer for glitch rate (zero-allocation) ===
    // Replaces array push/shift with O(1) circular buffer
    this._glitchBufSize = 64;
    this._glitchBuffer = new Float32Array(this._glitchBufSize);
    this._glitchBufHead = 0;
    this._glitchBufTime = 0; // base timestamp
    this._glitchBufFilled = 0;
    
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
   /**
    * Compute 1024-point FFT of input buffer.
    * C-1: Uses pre-allocated buffers → zero GC per call.
    */
   calculateFFT(buffer) {
     return fftReal1024(buffer, this._fftTmp, this._fftPerm, this._fftMagnitude);
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
    * C-1/H-4: Uses pre-allocated this._downsampleOutput → zero GC per frame.
    */
   _downsampleSpectrum(source) {
     const out = this._downsampleOutput;
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
    // Logarithmic bands (octave-based) — matches human hearing perception.
    // Linear FFT bins (43 Hz/bin) heavily over-represent bass when using per-bin averaging
    // because bass (0-250Hz) has only ~6 bins while mid (250-4000Hz) has ~87 bins.
    // For speech, fundamental freq (85-300 Hz) concentrates in bass bins → 99% bass artifact.
    // Solution: count logarithmic octave bands instead of linear FFT bins.
    const nyquist = this.sampleRate / 2; // 22050 Hz

    // Logarithmic center frequencies: 50, 160, 500, 1600, 5000, 16000 Hz
    // Bands: Bass(20-250Hz) | Mid(250-4000Hz) | Treble(4000-16000Hz)
    // Each band covers ~2 octaves for balanced representation.
    const bandEdges = [
      20, 250,   // Bass
      250, 4000, // Mid
      4000, 16000 // Treble (cap at 16kHz)
    ];

    // Convert Hz to bin indices (logarithmic spacing)
    const edges = bandEdges.map(hz => this._hzToBin(hz));

    let bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;

    for (let i = 0, n = fftData.length; i < n; i++) {
      const energy = fftData[i] * fftData[i];
      if (i < edges[1]) {
        bassEnergy += energy;
      } else if (i < edges[3]) {
        midEnergy += energy;
      } else if (i < edges[5]) {
        trebleEnergy += energy;
      }
    }

    const totalEnergy = bassEnergy + midEnergy + trebleEnergy;
    const normalize = (val) => totalEnergy > 0 ? (val / totalEnergy) * 100 : 0;

    return {
      bass: normalize(bassEnergy),
      mid: normalize(midEnergy),
      treble: normalize(trebleEnergy)
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
    * C.2.4: Harmonic-to-Noise Ratio (HNR) via Wiener–Khinchin theorem
    * 
    * Uses the theorem: autocorrelation r(τ) = IFFT{|X(k)|²}
    * This reduces O(N²) direct autocorrelation to O(N log N) via FFT/IFFT.
    * 
    * Steps:
    *   1. FFT(buffer) → X(k) [complex spectrum]
    *   2. P(k) = |X(k)|² = re² + im² → Power Spectral Density
    *   3. IFFT(P(k)) → r(τ) [autocorrelation]
    *   4. HNR = 10·log₁₀(r(0) / min(r[1..maxLag/2]))
    * 
    * Expected speedup: ~95% fewer MAC operations (N·log₂(N) vs N²/2)
    * For N=1024: ~10K MAC vs ~524K MAC
    * C-1: Uses pre-allocated FFT buffers → zero GC per frame.
    * Returns HNR in dB (higher = more harmonic).
    */
   calculateHNR(buffer) {
     const N = FFT_SIZE;
     const maxLag = Math.floor(N / 4); // Limit search range (0..256 lags)
     
     // Step 1: FFT of input buffer (applies Hanning window internally)
     // C-1: Use pre-allocated buffers to avoid per-frame allocation
     const spectrum = fftReal1024(buffer, this._fftTmp, this._fftPerm, this._hnrPower);
     
     // Step 2: Power Spectral Density is now in this._hnrPower (reused)
     // Step 3: IFFT of PSD → autocorrelation r(τ)
     // Wiener–Khinchin theorem: r(τ) = IFFT{|X(k)|²}
     // IFFT input: create complex array [P(0), 0, P(1), 0, ..., P(N/2-1), 0]
     // (real-only PSD because autocorrelation is real-valued)
     const ifftInput = this._hnrIFFTInput;
     for (let k = 0; k < HALF_N; k++) {
       ifftInput[2 * k] = this._hnrPower[k];   // real part = PSD
       ifftInput[2 * k + 1] = 0;                // imaginary part = 0
     }
     
     // C-1: Use pre-allocated IFFT buffers
     const autocorr = ifftComplex1024(ifftInput, this._ifftTmp, this._ifftPerm, this._hnrAutocorr);
     
     // Step 4: HNR from autocorrelation peak-to-valley ratio
     // r(0) = total signal power, r(lag>0) = correlation component (harmonic)
     const maxCorr = Math.abs(autocorr[0]);
     
     // Find minimum in valley range [1, maxLag/2]
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
    
    // === DEFENSIVE GUARD: Validate computed metrics ===
    // Prevent NaN/Infinity from corrupting the metrics pipeline
    if (!Number.isFinite(rms) || !Number.isFinite(peak) || rms < 0 || peak < 0) {
      // Silently skip this frame — buffer may be empty/corrupted during context transitions
      return;
    }
    
    const fft = this.calculateFFT(buffer);
    const bands = this.calculateFrequencyBands(fft);
    const highFreqAnomaly = this.detectHighFrequencyAnomaly(fft);
    const zcr = this.calculateZCR(buffer);
    
    // Validate band percentages
    if (!Number.isFinite(bands.bass) || !Number.isFinite(bands.mid) || !Number.isFinite(bands.treble)) {
      return;
    }
    
    // Validate high frequency anomaly
    if (!Number.isFinite(highFreqAnomaly) || highFreqAnomaly < 0 || highFreqAnomaly > 1) {
      return;
    }
    
    // Validate ZCR
    if (!Number.isFinite(zcr) || zcr < 0) {
      return;
    }
    // === END DEFENSIVE GUARD ===
    
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
    const processStartTime = (typeof self !== 'undefined' && self.performance?.now) ? self.performance.now() : Date.now();
    
    // Debug: log actual frame count per channel
    if (!this._processCount) this._processCount = 0;
    this._processCount++;
    if (this._processCount === 1 || this._processCount === 100 || this._processCount % 500 === 0) {
      // Debug logging removed for production
    }
    
    const input = inputs[0];
    const output = outputs[0];
    
    // === DEFENSIVE GUARDS ===
    // Guard 1: If input is missing or empty, passthrough + return (no metrics this block)
    if (!input || input.length === 0) {
      // Still passthrough if output exists
      if (output && output.length > 0) {
        for (let ch = 0; ch < output.length; ch++) {
          if (output[ch]) output[ch].fill(0);
        }
      }
      return true;
    }
    
    // Guard 2: Validate all sample data — reject NaN/Infinity to prevent metric corruption
    let hasInvalidData = false;
    for (let ch = 0; ch < input.length; ch++) {
      const channelData = input[ch];
      if (!channelData || channelData.length === 0) {
        hasInvalidData = true;
        break;
      }
      for (let i = 0; i < channelData.length; i++) {
        if (!Number.isFinite(channelData[i])) {
          hasInvalidData = true;
          break;
        }
      }
      if (hasInvalidData) break;
    }
    
    // If invalid data detected, passthrough zeros and skip metrics
    if (hasInvalidData) {
      if (output && output.length > 0) {
        for (let ch = 0; ch < output.length; ch++) {
          if (output[ch]) output[ch].fill(0);
        }
      }
      return true;
    }
    // === END DEFENSIVE GUARDS ===
    
    // 1. Пробрасываем звук на динамики
    if (output && output.length > 0) {
      for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
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
        // === P.2: Two-level DSP quantization ===
        // Increment decimation counter
        this._quantumInCycle = (this._quantumInCycle + 1) % this.DECIMATION_K;
        const isHeavyFrame = (this._quantumInCycle === 0); // Every K-th quantum
        
        if (isHeavyFrame) {
          this.processHeavyFrame(); // FFT/MFCC/HNR/AI every K quanta
        } else {
          this.processLightFrame(); // RMS/peak/glitch every quantum
        }
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

  /**
   * P.2: Light frame — runs EVERY quantum (~344 Hz)
   * Only fast metrics from processChannelFrame(): RMS, peak, bands, ZCR, HFA
   * No FFT, no MFCC, no HNR — those are deferred to heavy frame
   * Budget: < 1ms per frame
   */
  processLightFrame() {
    this.frameCount++;
    this.waveformFrameCounter++;

    // Skip warmup frames — buffers empty, metrics are garbage (Infinity, 0)
    if (this.frameCount <= this.warmupFrames) {
      return;
    }

    const leftData = this.leftFrameData;
    const rightData = this.rightFrameData;

    // Combined RMS: max peak for stereo
    const combinedRMS = leftData ? leftData.rms : (rightData ? rightData.rms : 0);
    const leftPeak = leftData ? leftData.peak : 0;
    const rightPeak = rightData ? rightData.peak : 0;
    const peakRMS = Math.max(leftPeak, rightPeak);

    // Combined FFT for entropy/flatness (sum of energies — just add arrays)
    if (leftData && rightData) {
      for (let i = 0; i < leftData.fft.length; i++) {
        this.combinedFFT[i] = leftData.fft[i] + rightData.fft[i];
      }
    } else {
      const src = leftData ? leftData.fft : rightData.fft;
      for (let i = 0; i < src.length; i++) {
        this.combinedFFT[i] = src[i];
      }
    }

    // Frequency bands for combo
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

    // Glitch detection: max highFreqAnomaly from channels
    const leftHFA = leftData ? leftData.highFreqAnomaly : 0;
    const rightHFA = rightData ? rightData.highFreqAnomaly : 0;
    const combinedHighFreqAnomaly = Math.max(leftHFA, rightHFA);
    const glitchInfo = this.checkGlitchState(combinedRMS, combinedHighFreqAnomaly);

    // Entropy/flatness on combined FFT (O(N) — fast, no heavy allocations)
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

    // Combined ZCR (average of left/right)
    let combinedZCR = 0;
    if (leftData && rightData) {
      combinedZCR = (leftData.zcr + rightData.zcr) / 2;
    } else {
      combinedZCR = leftData ? leftData.zcr : (rightData ? rightData.zcr : 0);
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

    // C.2.9: Glitch Rate — circular buffer (H-10 fix, O(1) append)
    const now = Date.now();
    if (this._glitchBufTime === 0) {
      this._glitchBufTime = now;
    }
    const relTime = now - this._glitchBufTime;
    this._glitchBuffer[this._glitchBufHead] = relTime;
    this._glitchBufHead = (this._glitchBufHead + 1) % this._glitchBufSize;
    if (this._glitchBufFilled < this._glitchBufSize) {
      this._glitchBufFilled++;
    }
    let glitchRate = 0;
    for (let i = 0; i < this._glitchBufFilled; i++) {
      const slotIdx = (this._glitchBufHead - this._glitchBufFilled + i + this._glitchBufSize) % this._glitchBufSize;
      if (relTime - this._glitchBuffer[slotIdx] <= 1000) {
        glitchRate++;
      }
    }

    // Throttle waveform to ~10 Hz (every 4 frames at 43 fps)
    const includeWaveform = (this.waveformFrameCounter % this.WAVEFORM_THROTTLE === 0);

    // Downsample 512 true FFT bins → 64 bins for popup visualization
    const spectrumCopy = this._downsampleSpectrum(this.combinedFFT);

    // === LIGHT FRAME DEFENSIVE GUARD ===
    const lightCriticalMetrics = [combinedRMS, peakRMS, entropy, flatness,
                                 combinedBands.bass, combinedBands.mid, combinedBands.treble,
                                 combinedHighFreqAnomaly, combinedZCR,
                                 dynamicRange, bassMidRatio, midTrebleRatio];

    for (const val of lightCriticalMetrics) {
      if (!Number.isFinite(val)) {
        return;
      }
    }
    // === END LIGHT GUARD ===

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
      // C.2.3: ZCR
      zcr: combinedZCR,
      // C.2.8–C.2.10
      dynamicRange: dynamicRange,
      bassMidRatio: bassMidRatio,
      midTrebleRatio: midTrebleRatio,
      glitchRate: glitchRate,
      // Light frame zeros (heavy frame fills these)
      hnr: 0,
      spectralCentroid: 0,
      spectralRolloff: 0,
      onsetDetected: false,
      // V4: AI Detection (deferred to heavy frame)
      aiScore: 0,
      mfcc: [],
      mfccStd: []
    };

    if (includeWaveform) {
      payload.waveform = Object.values(this.waveformLeft);
      if (rightData) {
        payload.waveformRight = Object.values(this.waveformRight);
      }
    } else {
      payload.waveformHold = true;
    }

    this.port.postMessage(payload);
  }

  processHeavyFrame() {
    this.frameCount++;
    this.waveformFrameCounter++;
    
    // Skip warmup frames — buffers empty, metrics are garbage (Infinity, 0)
    if (this.frameCount <= this.warmupFrames) {
      return;
    }
    
    // V4: declare aiScore variable hoisted via var
    var aiScore = 0;
    
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
    
    // C.2.4: HNR via Wiener–Khinchin (O(N log N) — HEAVY, every K frames)
    // Skip in light frames — deferred via decimation
    let hnr = 0;
    const buffer = leftData ? this.waveformLeft : this.waveformRight;
    hnr = this.calculateHNR(buffer);
    if (!Number.isFinite(hnr)) hnr = 0;
    
    // C.2.8: Dynamic Range (Peak - RMS in dB)
    const peakdB = peakRMS > 0 ? 20 * Math.log10(peakRMS) : -Infinity;
    const rmsdB = combinedRMS > 0 ? 20 * Math.log10(combinedRMS) : -Infinity;
    const dynamicRange = peakdB - rmsdB; // >= 0 dB
    
    // V4.1: MFCC extraction (13 coefficients) on combined FFT — HEAVY, every K frames
    // C-1/H-3: Use pre-allocated buffers → zero GC per heavy frame
    _ensureMelBank(this.sampleRate);
    const mfcc = calculateMFCC(this.combinedFFT, this._mfccMelEnergy, this._mfccResult);
    
    // V4.2: Temporal statistics (mean/stddev over 100-frame sliding window)
    // Rolling window for each MFCC coefficient
    if (mfcc) {
      if (!this._mfccWindow) {
        this._mfccWindow = [];
        this._mfccIndex = 0;
        this._mfccCount = 0;
      }
      // Store in circular buffer (window size: 100 frames ≈ 2.3s)
      const winSize = 100;
      if (!this._mfccBuffer) {
        this._mfccBuffer = new Float32Array(winSize * MFCC_MFCC_COEFFS);
      }
      // Store current frame
      for (let c = 0; c < MFCC_MFCC_COEFFS; c++) {
        const idx = this._mfccIndex * MFCC_MFCC_COEFFS + c;
        this._mfccBuffer[idx] = mfcc[c];
      }
      this._mfccIndex = (this._mfccIndex + 1) % winSize;
      if (this._mfccCount < winSize) this._mfccCount++;
      
      // Compute mean per coefficient
      const mfccMean = new Float32Array(MFCC_MFCC_COEFFS);
      const mfccStd = new Float32Array(MFCC_MFCC_COEFFS);
      for (let c = 0; c < MFCC_MFCC_COEFFS; c++) {
        let sum = 0;
        const start = Math.max(0, this._mfccIndex - this._mfccCount);
        const end = this._mfccIndex;
        const count = end - start + (end === 0 && this._mfccIndex === 0 ? 0 : (this._mfccIndex === 0 ? winSize - start : 0));
        
        // Simplified: iterate over filled frames
        const filledFrames = this._mfccCount;
        const startIdx = filledFrames >= winSize ? ((this._mfccIndex - winSize + winSize) % winSize) : 
                         (this._mfccIndex - filledFrames + winSize) % winSize;
        
        for (let f = 0; f < filledFrames; f++) {
          const frameIdx = (startIdx + f) % winSize;
          sum += this._mfccBuffer[frameIdx * MFCC_MFCC_COEFFS + c];
        }
        mfccMean[c] = sum / filledFrames;
        
        // Stddev
        let varSum = 0;
        for (let f = 0; f < filledFrames; f++) {
          const frameIdx = (startIdx + f) % winSize;
          const diff = this._mfccBuffer[frameIdx * MFCC_MFCC_COEFFS + c] - mfccMean[c];
          varSum += diff * diff;
        }
        mfccStd[c] = Math.sqrt(varSum / filledFrames);
      }
      
      // V4.3: Rule-based aiScore (0-100)
      // AI-generated audio has distinct MFCC patterns:
      // - Lower temporal variance in coefficients (smoother transitions)
      // - Different spectral envelope shape
      // - Lower high-frequency content
      // - Lower ZCR and HNR variance
      
      const mfccStdSum = mfccStd.reduce((s, v) => s + v, 0);
      const mfccMeanSum = Math.abs(mfccMean.reduce((s, v) => s + v, 0));
      
      // Heuristic features — tuned for real speech (M.3: wider thresholds to reduce FP)
      // AI-generated audio has distinct MFCC patterns:
      // - Lower temporal variance in coefficients (smoother transitions)
      // - Lower high-frequency content (anti-aliasing filters in TTS)
      // - Constrained ZCR range (synthetic voices less variable)
      // - Mid-range entropy (neither fully tonal nor fully noisy)
      //
      // M.3 thresholds: widened to reduce false positives on processed human speech
      // (professional voiceover, EQ/compressor chains, de-essers)
      const lowTemporalVariance = mfccStdSum < 3.5 ? 1 : 0;       // widened from 2.0 (processed speech has low variance)
      const lowHighFreq = combinedHighFreqAnomaly < 0.25 ? 1 : 0;  // widened from 0.15 (de-essers cut HF)
      const moderateZCR = combinedZCR > 1500 && combinedZCR < 8000 ? 1 : 0; // widened (human variation)
      const moderateEntropy = entropy > 0.8 && entropy < 2.0 ? 1 : 0;  // widened from 1.2-1.8
      
       // Weighted score
       aiScore = 0;
       aiScore += lowTemporalVariance * 25;  // MFCC temporal smoothness
       aiScore += lowHighFreq * 20;           // Low HF energy
       aiScore += moderateZCR * 20;           // Constrained ZCR
       aiScore += moderateEntropy * 15;       // Mid-range entropy
       aiScore += (flatness > 0.35 ? 10 : 0); // Spectral flatness
       
        aiScore = Math.min(100, Math.max(0, Math.round(aiScore)));
        
        // V4.2: Compute mfccTop4 and mfccStdTop4 for payload (H-3: pre-allocated, zero-allocation)
        this._mfccTop4.set(mfcc.subarray(0, 4)); // Top 4 coefficients (most discriminative)
        this._mfccStdTop4.set(mfccStd.subarray(0, 4));
     }
    
     // C.2.10: Inter-band Energy Ratios (log-scaled, ~0dB = balanced)
     const bassMidRatio = combinedBands.mid > 1e-10
       ? 10 * Math.log10(combinedBands.bass / combinedBands.mid)
       : -Infinity;
     const midTrebleRatio = combinedBands.treble > 1e-10
       ? 10 * Math.log10(combinedBands.mid / combinedBands.treble)
       : -Infinity;
     
     // C.2.9: Glitch Rate — circular buffer (H-10 fix, O(1) append)
     const now = Date.now();
     if (this._glitchBufTime === 0) {
       this._glitchBufTime = now;
     }
     const relTimeHeavy = now - this._glitchBufTime;
     this._glitchBuffer[this._glitchBufHead] = relTimeHeavy;
     this._glitchBufHead = (this._glitchBufHead + 1) % this._glitchBufSize;
     if (this._glitchBufFilled < this._glitchBufSize) {
       this._glitchBufFilled++;
     }
     let glitchRateHeavy = 0;
     for (let i = 0; i < this._glitchBufFilled; i++) {
       const slotIdx = (this._glitchBufHead - this._glitchBufFilled + i + this._glitchBufSize) % this._glitchBufSize;
       if (relTimeHeavy - this._glitchBuffer[slotIdx] <= 1000) {
         glitchRateHeavy++;
       }
     }
     
     // Throttle waveform to ~10 Hz (every 4 frames at 43 fps)
     const includeWaveform = (this.waveformFrameCounter % this.WAVEFORM_THROTTLE === 0);
     
     // Use new Float32Array() instead of Array.from() — single memcpy, no boxing
     // Downsample 512 true FFT bins → 64 bins for popup visualization
     const spectrumCopy = this._downsampleSpectrum(this.combinedFFT);
     
     // === FINAL DEFENSIVE GUARD: Validate entire payload before serialization ===
     // Catch any remaining NaN/Infinity values that slipped through earlier checks
    const criticalMetrics = [combinedRMS, peakRMS, entropy, flatness, 
                             combinedBands.bass, combinedBands.mid, combinedBands.treble,
                             combinedHighFreqAnomaly, combinedZCR, spectralCentroid, spectralRolloff,
                             hnr, dynamicRange, bassMidRatio, midTrebleRatio,
                             aiScore || 0];
    
    for (const val of criticalMetrics) {
      if (!Number.isFinite(val)) {
        // Silently skip this frame — one corrupted metric invalidates the entire payload
        return;
      }
    }
    // === END FINAL GUARD ===
    
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
      glitchRate: glitchRateHeavy,
      // V4: AI Detection
      aiScore: aiScore,
      mfcc: this._mfccTop4,
      mfccStd: this._mfccStdTop4
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

// ============================================================
// V4: AI Detection — Mel Filter Bank + DCT for MFCC
// ============================================================

// Mel filter bank: 40 filters across 512 FFT bins
// Each filter: [startBin, endBin, centerWeightedBin]
const MFCC_MEL_FILTERS = 40;
const MFCC_MFCC_COEFFS = 13;

function _hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
function _melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

// Precompute Mel filter bank for given sample rate
function _createMelFilterBank(numBins, sampleRate) {
  const nyquist = sampleRate / 2;
  const melMin = _hzToMel(20);
  const melMax = _hzToMel(nyquist);
  const melStep = (melMax - melMin) / (MFCC_MEL_FILTERS + 1);

  // Precompute filter edges in Hz
  const filterEdges = [];
  for (let i = 0; i <= MFCC_MEL_FILTERS + 1; i++) {
    filterEdges.push(_melToHz(melMin + i * melStep));
  }

  // Convert to bin indices
  const binEdges = filterEdges.map(hz => Math.floor(hz * FFT_SIZE / sampleRate));

  // Build filter bank: each filter maps FFT bins → mel band energies
  // For efficiency, store: [start, end, peakBin] per filter
  // During processing, sum magnitude² for bins in range [start, end]
  const banks = [];
  for (let i = 0; i < MFCC_MEL_FILTERS; i++) {
    const start = Math.max(0, binEdges[i]);
    const end = Math.min(numBins - 1, binEdges[i + 2]);
    const peak = binEdges[i + 1];
    if (start < end) {
      banks.push({ start, end, peak });
    }
  }
  return banks;
}

// Precomputed DCT-II matrix (13 coefficients × MFCC_MEL_FILTERS bands)
// DCT-II: X[k] = sum_{n=0}^{N-1} x[n] * cos(π*k*(2n+1)/(2N))
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

// Create Mel filter bank and DCT for runtime sample rate
let _melBanks = null;
let _dctMatrix = null;

function _ensureMelBank(sampleRate) {
  if (_melBanks && _melBanks.length > 0 && _melBanks[0].peak > 0) {
    // Already initialized — reuse
    return;
  }
  // Check if already built
  if (_melBanks && _melBanks.length === MFCC_MEL_FILTERS && _dctMatrix) {
    return;
  }
  _melBanks = _createMelFilterBank(HALF_N, sampleRate);
  _dctMatrix = _createDCTMatrix(MFCC_MFCC_COEFFS, MFCC_MEL_FILTERS);
}

/**
 * Compute MFCC (13 coefficients) from magnitude spectrum
 * Step 1: Apply Mel filter bank → mel-spectral energy (40 bands)
 * Step 2: Log compression → log(melEnergy + epsilon)
 * Step 3: DCT-II → 13 MFCC coefficients
 * 
 * Pre-allocated buffers for zero GC per frame.
 * O(N) with small constants — suitable for real-time DSP.
 * 
 * @param {Float32Array} fftData — magnitude spectrum (512 bins)
 * @returns {Float32Array} 13 MFCC coefficients
 */
/**
 * Calculate 13 MFCC coefficients from FFT magnitude spectrum.
 * C-1/H-3: Optional dest buffers for zero-allocation path.
 */
function calculateMFCC(fftData, destMelEnergy, destMfcc) {
  // Ensure Mel filter bank is initialized
  if (!_melBanks || _melBanks.length === 0) {
    return null;
  }

  // Step 1: Mel filter bank energies (sum of magnitude² in each band)
  const melEnergy = destMelEnergy || new Float32Array(MFCC_MEL_FILTERS);
  for (let f = 0; f < MFCC_MEL_FILTERS; f++) {
    const filter = _melBanks[f];
    let energy = 0;
    for (let b = filter.start; b <= filter.end; b++) {
      const mag = fftData[b];
      energy += mag * mag;
    }
    melEnergy[f] = energy;
  }

  // Step 2: Log compression
  for (let f = 0; f < MFCC_MEL_FILTERS; f++) {
    melEnergy[f] = Math.log(melEnergy[f] + 1e-10);
  }

  // Step 3: DCT-II → 13 coefficients
  const mfcc = destMfcc || new Float32Array(MFCC_MFCC_COEFFS);
  for (let k = 0; k < MFCC_MFCC_COEFFS; k++) {
    let sum = 0;
    const rowOffset = k * MFCC_MEL_FILTERS;
    for (let n = 0; n < MFCC_MEL_FILTERS; n++) {
      sum += melEnergy[n] * _dctMatrix[rowOffset + n];
    }
    mfcc[k] = sum;
  }

  return mfcc;
}

registerProcessor('audio-analyzer', AudioAnalyzer);