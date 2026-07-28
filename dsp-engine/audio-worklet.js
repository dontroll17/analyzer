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
    
    // Pre-allocate combinedFFT buffer (buffer pooling — zero GC per frame)
    this.combinedFFT = new Float32Array(64);
    
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
   * Оптимизированный спектральный анализ (64 бина)
   * Убирает зависания UI и лаги в воркете
   */
  calculateFFT(buffer, numBins = 64) {
    const bins = new Float32Array(numBins);
    const step = Math.floor(buffer.length / numBins);

    for (let bin = 0; bin < numBins; bin++) {
      let sum = 0;
      const start = bin * step;
      for (let i = 0; i < step; i++) {
        const sample = buffer[start + i];
        sum += sample * sample;
      }
      bins[bin] = Math.sqrt(sum / step);
    }
    
    return bins;
  }

  calculateBandEntropy(fftData) {
    // 4-band entropy: Bass(0-350Hz) | Voice(350-2000Hz) | Speech(2000-6000Hz) | Noise(6000-22050Hz)
    // Bass must include bin 0 (0-344Hz) since FFT resolution is ~344Hz/bin
    const numBins = fftData.length;
    const nyquist = this.sampleRate / 2;
    const binWidth = nyquist / numBins;
    
    const boundaries = [350, 2000, 6000, nyquist];
    const edges = [0, ...boundaries.slice(0, -1)];
    
    let bandEnergies = [];
    let totalEnergy = 0;
    
    for (let b = 0; b < 4; b++) {
      const startBin = Math.floor(edges[b] / binWidth);
      const endBin = Math.min(numBins, Math.floor(boundaries[b] / binWidth));
      let energy = 0;
      for (let i = startBin; i < endBin; i++) {
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
    // How "flat" the spectrum is — noise has flat spectrum, voice/music has peaks
    // Returns [0..1]: 0 = tonal (peaks), 1 = flat (noise)
    const n = fftData.length;
    let arithmeticMean = 0;
    let geometricMean = 0;
    let logSum = 0;
    
    for (let i = 0; i < n; i++) {
      const power = fftData[i] * fftData[i];
      arithmeticMean += power;
      if (power > 1e-10) logSum += Math.log(power);
    }
    arithmeticMean /= n;
    geometricMean = n > 0 ? Math.exp(logSum / n) : 0;
    
    if (arithmeticMean < 1e-10) return 0;
    return geometricMean / arithmeticMean;
  }

  calculateFrequencyBands(fftData) {
    const numBins = fftData.length; // 64
    const nyquist = this.sampleRate / 2; // 22050 Hz
    const binWidth = nyquist / numBins; // ~344.5 Hz per bin
  
    // Точный расчет индексов бинов по частотам Гц:
  // Bass: 0 - 220 Hz  -> бин 0
  // Mid: 220 - 4400 Hz -> бины 1..12
  // Treble: 4400 - 22000 Hz -> бины 13..63
    const bassEnd = Math.max(1, Math.floor(220 / binWidth));
    const midEnd = Math.min(numBins - 1, Math.floor(4400 / binWidth));
  
    let bassSum = 0, bassCount = 0;
    let midSum = 0, midCount = 0;
    let trebleSum = 0, trebleCount = 0;
  
    for (let i = 0; i < numBins; i++) {
    const energy = fftData[i] * fftData[i];
    if (i < bassEnd) {
      bassSum += energy;
      bassCount++;
    } else if (i < midEnd) {
      midSum += energy;
      midCount++;
    } else {
      trebleSum += energy;
      trebleCount++;
    }
    }
  
    // Усредняем энергию на один бин, чтобы 48 бинов ВЧ не перевешивали 12 бинов СЧ
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
    const totalEnergy = fftData.reduce((sum, val) => sum + val * val, 0);
    if (totalEnergy < 1e-10) return 0;
    
    // Верхняя четверть спектра (для 64 бинов это бины 48-63)
    let highFreqEnergy = 0;
    const startBin = Math.floor(fftData.length * 0.75);
    
    for (let i = startBin; i < fftData.length; i++) {
      highFreqEnergy += fftData[i] * fftData[i];
    }
    
    return highFreqEnergy / totalEnergy;
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
   */
  processChannelFrame(ch) {
    const buffer = this.inputBuffers[ch];
    const { rms, peak } = this.calculateRMS(buffer);
    const fft = this.calculateFFT(buffer, 64);
    const bands = this.calculateFrequencyBands(fft);
    const highFreqAnomaly = this.detectHighFrequencyAnomaly(fft);
    const glitchInfo = this.checkGlitchState(rms, highFreqAnomaly);
    
    // Сохраняем данные для объединения позже
    const frameData = { rms, peak, fft, bands, highFreqAnomaly, glitchInfo };
    
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
    
    return true;
  }

  processFrame() {
    this.frameCount++;
    this.waveformFrameCounter++;
    
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
    
    // Throttle waveform to ~10 Hz (every 4 frames at 43 fps)
    const includeWaveform = (this.waveformFrameCounter % this.WAVEFORM_THROTTLE === 0);
    
    // Use new Float32Array() instead of Array.from() — single memcpy, no boxing
    const spectrumCopy = new Float32Array(this.combinedFFT);
    
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
      glitchCount: this.glitchCount
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