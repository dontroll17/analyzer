// Note: AudioWorklet doesn't support ES6 imports, so we inline the RMS function from rms.js
// RMS utility is available as separate module for testing in rms-test.js

// Store sample rate for use in constructor
// AudioWorkletProcessor runs in a separate context, so we need to access
// the sample rate that was set in the main thread's global scope
let storedSampleRate = 44100;

// Try to get sample rate from global scope (set by popup.js before instantiation)
if (typeof globalThis !== 'undefined' && typeof globalThis.workletSampleRate === 'number') {
  storedSampleRate = globalThis.workletSampleRate;
}

class AudioAnalyzer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fftSize = 1024;
    this.hopSize = this.fftSize / 4; // 25% overlap
    this.bufferSize = this.fftSize;
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferCount = 0;
    this.frameCount = 0;
    
    // Use stored sample rate - AudioWorkletProcessor doesn't receive sampleRate directly
    // The sample rate should be stored before this processor is instantiated
    this.sampleRate = storedSampleRate;
    
    // Glitch detector configuration
    this.glitchConfig = {
      highFreqThreshold: 0.75,      // 75% energy in HF band (default)
      minTotalEnergy: 0.01,         // Ignore silence (RMS < 0.01)
      debounceTimeout: 1000,        // ms between glitches
      warningThreshold: 0.60        // 60% = warning before glitch
    };
    
    // Glitch detection state
    this.glitchState = 'STABLE';    // STABLE, WARNING, GLITCH
    this.glitchCount = 0;
    this.lastGlitchTime = 0;
    
    // Log sample rate for debugging
    this.port.postMessage({
      type: 'DEBUG',
      message: 'AudioAnalyzer initialized with sampleRate: ' + this.sampleRate
    });
  }

  /**
   * Calculate RMS value from audio buffer
   * Uses RMS utility class from rms.js (inlined for AudioWorklet compatibility)
   */
  calculateRMS(buffer) {
    let sum = 0;
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      const sample = buffer[i];
      sum += sample * sample;
    }
    return Math.sqrt(sum / length);
  }

  /**
   * Calculate simple FFT magnitude spectrum
   * Uses Goertzel algorithm for specific frequency bins for efficiency
   */
  calculateFFT(buffer, numBins = 256) {
    const bins = new Float32Array(numBins);
    const sampleRate = this.sampleRate;
    
    // Calculate energy for each bin using simplified DFT
    for (let bin = 0; bin < numBins; bin++) {
      let real = 0;
      let imag = 0;
      const freq = (bin * sampleRate) / (2 * numBins);
      const angle = (2 * Math.PI * freq) / sampleRate;
      
      for (let i = 0; i < buffer.length; i++) {
        real += buffer[i] * Math.cos(angle * i);
        imag -= buffer[i] * Math.sin(angle * i);
      }
      
      bins[bin] = Math.sqrt(real * real + imag * imag);
    }
    
    return bins;
  }

  /**
   * Calculate frequency band energy with normalization
   */
  calculateFrequencyBands(fftData) {
    const numBins = fftData.length;
    const sampleRate = this.sampleRate;
    const nyquist = sampleRate / 2;
    
    // Define frequency bands based on 256 bins and 44.1kHz sample rate
    // Bass: 0-220Hz, Mid: 220-4400Hz, Treble: 4.4-22kHz
    // Bin width = sampleRate / (2 * numBins) = 44100 / 512 ≈ 86.13 Hz per bin
    
    // Bass (0-220Hz): approximately bins 0-2 (220/86.13 ≈ 2.55)
    const bassEnd = 3;
    
    // Mid (220-4400Hz): approximately bins 3-51 (4400/86.13 ≈ 51.08)
    const midEnd = 52;
    
    // Treble (4.4-22kHz): approximately bins 52-256 (22000/86.13 ≈ 255.4)
    const highEnd = numBins;    // 100-256 bins ≈ 4400-22000Hz
    
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let totalSum = 0;
    
    for (let i = 0; i < numBins; i++) {
      const energy = fftData[i] * fftData[i]; // Power
      totalSum += energy;
      if (i < bassEnd) {
        bassSum += energy;
      } else if (i < midEnd) {
        midSum += energy;
      } else {
        trebleSum += energy;
      }
    }
    
    // Normalize to percentage of total energy (0-100)
    // This gives meaningful percentages that work well with the UI
    const normalize = (val) => totalSum > 0 ? (val / totalSum) * 100 : 0;
    
    return {
      bass: normalize(bassSum),
      mid: normalize(midSum),
      treble: normalize(trebleSum)
    };
  }

  /**
   * Detect high-frequency anomaly (ultrasonic glitch detection)
   */
  detectHighFrequencyAnomaly(fftData) {
    const totalEnergy = fftData.reduce((sum, val) => sum + val * val, 0);
    
    if (totalEnergy < 1e-10) {
      return 0;
    }
    
    // Check high frequency bins (384-512 ≈ 12kHz-16kHz at 44.1kHz)
    // These should normally have very low energy in music/audio
    let highFreqEnergy = 0;
    for (let i = 384; i < 512 && i < fftData.length; i++) {
      highFreqEnergy += fftData[i] * fftData[i];
    }
    
    return highFreqEnergy / totalEnergy;
  }

  /**
   * Check if current metrics indicate a glitch
   * Returns: { isGlitch: boolean, state: string }
   */
  checkGlitchState(rms, highFreqRatio) {
    const config = this.glitchConfig;
    const now = Date.now();
    
    // Check if total energy is sufficient (ignore silence)
    if (rms < config.minTotalEnergy) {
      this.glitchState = 'STABLE';
      return { isGlitch: false, state: 'STABLE' };
    }
    
    // Check for glitch condition
    if (highFreqRatio >= config.highFreqThreshold) {
      // Check debounce timeout
      if (now - this.lastGlitchTime > config.debounceTimeout) {
        this.glitchCount++;
        this.lastGlitchTime = now;
        this.glitchState = 'GLITCH';
        return { isGlitch: true, state: 'GLITCH' };
      } else {
        // Within debounce period, stay in current state
        return { isGlitch: false, state: this.glitchState };
      }
    }
    
    // Check for warning condition
    if (highFreqRatio >= config.warningThreshold) {
      this.glitchState = 'WARNING';
      return { isGlitch: false, state: 'WARNING' };
    }
    
    // Normal state
    this.glitchState = 'STABLE';
    return { isGlitch: false, state: 'STABLE' };
  }

  /**
   * Main processing function called by AudioWorklet
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Check if we have input data
    if (input.length > 0 && input[0].length > 0) {
      const channelData = input[0];
      const numSamples = channelData.length;
      
      // Update input buffer
      for (let i = 0; i < numSamples; i++) {
        this.inputBuffer[this.bufferCount] = channelData[i];
        this.bufferCount++;
        
        // When buffer is full, process frame
        if (this.bufferCount >= this.bufferSize) {
          this.processFrame();
          this.bufferCount = 0;
        }
      }
    }
    
    // Do NOT pass audio through to avoid feedback loop
    // We only need to analyze the audio, not play it back
    return true;
  }

  /**
   * Process a single audio frame and send metrics
   */
  processFrame() {
    this.frameCount++;
    
    // Calculate metrics
    const rms = this.calculateRMS(this.inputBuffer);
    const fft = this.calculateFFT(this.inputBuffer, 256);
    const bands = this.calculateFrequencyBands(fft);
    const highFreqAnomaly = this.detectHighFrequencyAnomaly(fft);
    
    // Check glitch state
    const glitchInfo = this.checkGlitchState(rms, highFreqAnomaly);
    
    // Send metrics to main thread
    this.port.postMessage({
      type: 'METRICS',
      timestamp: Date.now(),
      frame: this.frameCount,
      rms: rms,
      spectrum: Array.from(fft),
      bass: bands.bass,
      mid: bands.mid,
      treble: bands.treble,
      highFreqAnomaly: highFreqAnomaly,
      isGlitch: glitchInfo.isGlitch,
      glitchState: glitchInfo.state,
      glitchCount: this.glitchCount
    });
  }
}

// Register the worklet processor
registerProcessor('audio-analyzer', AudioAnalyzer);
