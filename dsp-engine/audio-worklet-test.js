/**
 * AudioWorklet Simulator for Testing Frequency Bands
 * 
 * This script simulates the AudioWorklet environment to test
 * the calculateFrequencyBands function without needing to run
 * in a Chrome extension.
 */

// Mock AudioWorkletProcessor for testing
class MockAudioWorkletProcessor {
  constructor() {
    this.sampleRate = 44100;
    this.port = {
      postMessage: (data) => {
        console.log('[Mock Worklet]', JSON.stringify(data, null, 2));
      }
    };
  }
}

// Import RMS class (from rms.js)
// In real AudioWorklet, we would inline this, but for testing we can import
class RMS {
  static calculate(buffer) {
    let sum = 0;
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / length);
  }
}

// AudioAnalyzer class (from audio-worklet.js)
class AudioAnalyzer extends MockAudioWorkletProcessor {
  constructor() {
    super();
    this.fftSize = 1024;
    this.hopSize = this.fftSize / 4;
    this.bufferSize = this.fftSize;
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferCount = 0;
    this.frameCount = 0;
  }

  calculateRMS(buffer) {
    let sum = 0;
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      const sample = buffer[i];
      sum += sample * sample;
    }
    return Math.sqrt(sum / length);
  }

  calculateFFT(buffer, numBins = 256) {
    const bins = new Float32Array(numBins);
    const sampleRate = this.sampleRate;
    
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

  calculateFrequencyBands(fftData, sampleRate) {
    const numBins = fftData.length;
    
    const bassEnd = 3;    // 0-220Hz
    const midEnd = 52;    // 220-4400Hz
    const highEnd = numBins; // 4.4-22kHz
    
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let totalSum = 0;
    
    for (let i = 0; i < numBins; i++) {
      const energy = fftData[i] * fftData[i];
      totalSum += energy;
      if (i < bassEnd) {
        bassSum += energy;
      } else if (i < midEnd) {
        midSum += energy;
      } else {
        trebleSum += energy;
      }
    }
    
    const normalize = (val) => totalSum > 0 ? (val / totalSum) * 100 : 0;
    
    return {
      bass: normalize(bassSum),
      mid: normalize(midSum),
      treble: normalize(trebleSum)
    };
  }

  detectHighFrequencyAnomaly(fftData) {
    const totalEnergy = fftData.reduce((sum, val) => sum + val * val, 0);
    
    if (totalEnergy < 1e-10) {
      return 0;
    }
    
    let highFreqEnergy = 0;
    for (let i = 384; i < 512 && i < fftData.length; i++) {
      highFreqEnergy += fftData[i] * fftData[i];
    }
    
    return highFreqEnergy / totalEnergy;
  }

  processFrame() {
    this.frameCount++;
    
    const rms = this.calculateRMS(this.inputBuffer);
    const fft = this.calculateFFT(this.inputBuffer, 256);
    const bands = this.calculateFrequencyBands(fft, this.sampleRate);
    const highFreqAnomaly = this.detectHighFrequencyAnomaly(fft);
    
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

  generateTestSignal(type = 'sine', frequency = 440, amplitude = 0.5) {
    const buffer = new Float32Array(this.bufferSize);
    const sampleRate = this.sampleRate;
    
    for (let i = 0; i < this.bufferSize; i++) {
      const t = i / sampleRate;
      switch (type) {
        case 'sine':
          buffer[i] = amplitude * Math.sin(2 * Math.PI * frequency * t);
          break;
        case 'noise':
          buffer[i] = (Math.random() * 2 - 1) * amplitude;
          break;
        case 'bass':
          buffer[i] = amplitude * Math.sin(2 * Math.PI * 100 * t);
          break;
        case 'mid':
          buffer[i] = amplitude * Math.sin(2 * Math.PI * 1000 * t);
          break;
        case 'treble':
          buffer[i] = amplitude * Math.sin(2 * Math.PI * 10000 * t);
          break;
        default:
          buffer[i] = 0;
      }
    }
    
    return buffer;
  }
}

// Test function
function runTests() {
  console.log('=== AudioWorklet Frequency Bands Test ===\n');
  
  const analyzer = new AudioAnalyzer();
  
  // Test 1: Sine wave at 440Hz (should be in mid band)
  console.log('Test 1: 440Hz Sine Wave (Mid Band)');
  analyzer.inputBuffer = analyzer.generateTestSignal('sine', 440, 0.5);
  analyzer.processFrame();
  
  // Test 2: Sine wave at 100Hz (should be in bass band)
  console.log('\nTest 2: 100Hz Sine Wave (Bass Band)');
  analyzer.inputBuffer = analyzer.generateTestSignal('bass', 100, 0.5);
  analyzer.processFrame();
  
  // Test 3: Sine wave at 10000Hz (should be in treble band)
  console.log('\nTest 3: 10000Hz Sine Wave (Treble Band)');
  analyzer.inputBuffer = analyzer.generateTestSignal('treble', 10000, 0.5);
  analyzer.processFrame();
  
  // Test 4: White noise (should be distributed across all bands)
  console.log('\nTest 4: White Noise (Distributed)');
  analyzer.inputBuffer = analyzer.generateTestSignal('noise', 0, 0.5);
  analyzer.processFrame();
  
  // Test 5: Mix of frequencies
  console.log('\nTest 5: Mixed Frequencies (100Hz + 1000Hz + 10000Hz)');
  analyzer.inputBuffer = analyzer.generateTestSignal('sine', 100, 0.3);
  const buffer2 = analyzer.generateTestSignal('sine', 1000, 0.3);
  const buffer3 = analyzer.generateTestSignal('sine', 10000, 0.3);
  for (let i = 0; i < analyzer.bufferSize; i++) {
    analyzer.inputBuffer[i] = (buffer2[i] + buffer3[i]) / 2;
  }
  analyzer.processFrame();
  
  console.log('\n=== Tests Complete ===');
}

// Run tests
runTests();
