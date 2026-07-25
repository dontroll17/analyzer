class AudioAnalyzer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fftSize = 1024;
    this.hopSize = this.fftSize / 4; // 25% overlap
    this.bufferSize = this.fftSize;
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferCount = 0;
    this.frameCount = 0;
  }

  /**
   * Calculate RMS value from audio buffer
   */
  calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i];
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
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
   * Calculate frequency band energy
   */
  calculateFrequencyBands(fftData, sampleRate) {
    const numBins = fftData.length;
    const nyquist = sampleRate / 2;
    
    // Define frequency bands (in bins)
    const lowEnd = 10;      // 0-10 bins ≈ 0-220Hz at 44.1kHz
    const midEnd = 100;     // 10-100 bins ≈ 220-4400Hz
    const highEnd = 256;    // 100-256 bins ≈ 4400-22000Hz
    
    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    
    for (let i = 0; i < numBins; i++) {
      const energy = fftData[i] * fftData[i]; // Power
      if (i < lowEnd) {
        lowSum += energy;
      } else if (i < midEnd) {
        midSum += energy;
      } else if (i < highEnd) {
        highSum += energy;
      }
    }
    
    return {
      bass: lowSum,
      mid: midSum,
      treble: highSum
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
    
    // Pass audio through to output (loopback)
    const output = outputs[0];
    if (output.length > 0 && input.length > 0) {
      const outputChannel = output[0];
      const inputChannel = input[0];
      
      for (let i = 0; i < inputChannel.length; i++) {
        outputChannel[i] = inputChannel[i];
      }
    }
    
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
    const bands = this.calculateFrequencyBands(fft, this.sampleRate);
    const highFreqAnomaly = this.detectHighFrequencyAnomaly(fft);
    
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
      highFreqAnomaly: highFreqAnomaly
    });
  }
}

// Register the worklet processor
registerProcessor('audio-analyzer', AudioAnalyzer);
