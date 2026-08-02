// Test: Reproduce the actual bug with real FFT output
const FFT_SIZE = 1024;
const SAMPLE_RATE = 44100;
const HALF_N = FFT_SIZE / 2;

// Precomputed Hanning window
const HANNING = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANNING[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / FFT_SIZE));
}

// Precomputed bit-reversal
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

// Precomputed twiddle factors
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

// Hz to bin conversion
function hzToBin(hz) {
  return Math.floor(hz * FFT_SIZE / SAMPLE_RATE);
}

// Frequency bands calculation
function calculateFrequencyBands(fftData) {
  const bandEdges = [20, 250, 250, 4000, 4000, 16000];
  const edges = bandEdges.map(hz => hzToBin(hz));
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

console.log('=== Test: Real FFT of speech-like signals ===\n');

// Generate a speech-like signal:
// Fundamental frequency ~150Hz (male voice) + formants at 500Hz, 1500Hz, 2500Hz
function generateSpeechLikeSignal(durationSecs, sampleRate) {
  const numSamples = Math.floor(durationSecs * sampleRate);
  const buffer = new Float32Array(numSamples);
  const f0 = 150; // Fundamental
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Voice model: fundamental + harmonics with formant shaping
    let sample = 0;
    // Fundamental
    sample += Math.sin(2 * Math.PI * f0 * t);
    // 2nd harmonic (formant 1 at ~500Hz)
    sample += 0.6 * Math.sin(2 * Math.PI * 300 * t);
    sample += 0.4 * Math.sin(2 * Math.PI * 500 * t);
    // 4th-7th harmonics (formant 2 at ~1500Hz)
    sample += 0.5 * Math.sin(2 * Math.PI * 1000 * t);
    sample += 0.7 * Math.sin(2 * Math.PI * 1500 * t);
    sample += 0.3 * Math.sin(2 * Math.PI * 2000 * t);
    sample += 0.5 * Math.sin(2 * Math.PI * 2500 * t);
    // Higher harmonics
    sample += 0.2 * Math.sin(2 * Math.PI * 3500 * t);
    sample += 0.1 * Math.sin(2 * Math.PI * 5000 * t);
    
    // Add some amplitude modulation (prosody)
    sample *= (0.8 + 0.2 * Math.sin(2 * Math.PI * 5 * t)); // 5Hz modulation
    
    buffer[i] = sample / 5; // Normalize
  }
  return buffer;
}

// Generate signal for one frame (1024 samples)
const speechSignal = generateSpeechLikeSignal(1.0, SAMPLE_RATE);
// Take a chunk of 1024 samples
const frame = speechSignal.slice(0, 1024);

console.log('Input: Speech-like signal (150Hz fundamental + harmonics)');
console.log('Signal RMS:', Math.sqrt(frame.reduce((s, v) => s + v*v, 0) / frame.length).toFixed(4));

// Run FFT
const fftResult = fftReal1024(frame);

// Show top 20 frequency bins
console.log('\nTop 20 FFT bins:');
const magnitudes = [];
for (let i = 0; i < HALF_N; i++) {
  magnitudes.push({ bin: i, freq: i * SAMPLE_RATE / FFT_SIZE, mag: fftResult[i] });
}
magnitudes.sort((a, b) => b.mag - a.mag);
for (let i = 0; i < 20; i++) {
  const m = magnitudes[i];
  console.log(`  Bin ${m.bin} (${m.freq.toFixed(0)} Hz): ${m.mag.toFixed(4)}`);
}

// Calculate frequency bands
const bands = calculateFrequencyBands(fftResult);
console.log('\nFrequency bands:');
console.log(`  Bass:  ${bands.bass.toFixed(2)}%`);
console.log(`  Mid:   ${bands.mid.toFixed(2)}%`);
console.log(`  Treble: ${bands.treble.toFixed(2)}%`);
console.log(`  Sum:   ${(bands.bass + bands.mid + bands.treble).toFixed(2)}%`);

// Now test with silence (DC offset scenario from the logs)
console.log('\n=== Test: Near-silence with DC offset ===');
const silenceFrame = new Float32Array(1024).fill(0.0001); // Very small constant
const fftSilence = fftReal1024(silenceFrame);
const bandsSilence = calculateFrequencyBands(fftSilence);
console.log('Input: Near-silence (constant 0.0001)');
console.log('Frequency bands:');
console.log(`  Bass:  ${bandsSilence.bass.toFixed(2)}%`);
console.log(`  Mid:   ${bandsSilence.mid.toFixed(2)}%`);
console.log(`  Treble: ${bandsSilence.treble.toFixed(2)}%`);

// Test with actual silent buffer
console.log('\n=== Test: Pure silence ===');
const pureSilence = new Float32Array(1024);
const fftPureSilence = fftReal1024(pureSilence);
const bandsPureSilence = calculateFrequencyBands(fftPureSilence);
console.log('Input: Pure silence (all zeros)');
console.log('Frequency bands:');
console.log(`  Bass:  ${bandsPureSilence.bass.toFixed(6)}%`);
console.log(`  Mid:   ${bandsPureSilence.mid.toFixed(6)}%`);
console.log(`  Treble: ${bandsPureSilence.treble.toFixed(6)}%`);

// Test with very low energy (like the logs show)
console.log('\n=== Test: Very low energy signal ===');
const lowEnergy = new Float32Array(1024);
for (let i = 0; i < 1024; i++) {
  lowEnergy[i] = (Math.random() - 0.5) * 0.001; // Tiny random noise
}
const fftLowEnergy = fftReal1024(lowEnergy);
const bandsLowEnergy = calculateFrequencyBands(fftLowEnergy);
console.log('Input: Tiny random noise (±0.001)');
console.log('Frequency bands:');
console.log(`  Bass:  ${bandsLowEnergy.bass.toFixed(2)}%`);
console.log(`  Mid:   ${bandsLowEnergy.mid.toFixed(2)}%`);
console.log(`  Treble: ${bandsLowEnergy.treble.toFixed(2)}%`);
