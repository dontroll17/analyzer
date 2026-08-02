// Test: Verify frequency band distribution with a known FFT spectrum

// Simulate the same FFT bin calculation as in audio-worklet.js
const FFT_SIZE = 1024;
const SAMPLE_RATE = 44100;
const HALF_N = FFT_SIZE / 2; // 512 bins

// Replicate _hzToBin
function hzToBin(hz) {
  return Math.floor(hz * FFT_SIZE / SAMPLE_RATE);
}

// Replicate calculateFrequencyBands
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

// Edge conversions
console.log('=== FFT Bin Edges (44100Hz, FFT_SIZE=1024) ===');
console.log('Bin width:', SAMPLE_RATE / FFT_SIZE, 'Hz');
console.log('_hzToBin(20) =', hzToBin(20), '=>', hzToBin(20) * SAMPLE_RATE / FFT_SIZE, 'Hz');
console.log('_hzToBin(250) =', hzToBin(250), '=>', hzToBin(250) * SAMPLE_RATE / FFT_SIZE, 'Hz');
console.log('_hzToBin(4000) =', hzToBin(4000), '=>', hzToBin(4000) * SAMPLE_RATE / FFT_SIZE, 'Hz');
console.log('_hzToBin(16000) =', hzToBin(16000), '=>', hzToBin(16000) * SAMPLE_RATE / FFT_SIZE, 'Hz');

// Bin counts
const bassBins = hzToBin(250); // bins 0 to 5-1 = 0-4 (5 bins)
const midBins = hzToBin(4000) - hzToBin(250); // 93-5 = 88 bins
const trebleBins = hzToBin(16000) - hzToBin(4000); // 371-93 = 278 bins
console.log('\n=== Bin Counts ===');
console.log('Bass bins:', bassBins, '(20-250Hz)');
console.log('Mid bins:', midBins, '(250-4000Hz)');
console.log('Treble bins:', trebleBins, '(4000-16000Hz)');

// Test 1: Sine wave at 100 Hz → should concentrate in bass bins
// Bin index for 100 Hz: 100 * 1024 / 44100 ≈ 2
console.log('\n=== Test 1: Sine at 100 Hz ===');
const fft100Hz = new Float32Array(HALF_N);
const bin100 = hzToBin(100);
console.log('100 Hz → bin', bin100);
fft100Hz[bin100] = 1.0; // Strong signal at 100Hz
const result1 = calculateFrequencyBands(fft100Hz);
console.log('Result:', result1);
console.log('Sum:', result1.bass + result1.mid + result1.treble);
console.assert(result1.bass > 50, '100Hz should be mostly bass');

// Test 2: Flat spectrum (white noise simulation)
// All bins have equal magnitude → energy proportional to bin count
console.log('\n=== Test 2: White noise (flat spectrum) ===');
const fftNoise = new Float32Array(HALF_N).fill(1.0);
const result2 = calculateFrequencyBands(fftNoise);
console.log('Result:', result2);
console.log('Sum:', result2.bass + result2.mid + result2.treble);
console.log('Expected ratio (by bin count):', 
  `bass=${(bassBins / (bassBins + midBins + trebleBins) * 100).toFixed(1)}% ` +
  `mid=${(midBins / (bassBins + midBins + trebleBins) * 100).toFixed(1)}% ` +
  `treble=${(trebleBins / (bassBins + midBins + trebleBins) * 100).toFixed(1)}%`
);

// Test 3: Speech-like spectrum (fundamental ~150Hz + harmonics)
// Fundamental in bass, harmonics spread to mid
console.log('\n=== Test 3: Speech-like spectrum ===');
const fftSpeech = new Float32Array(HALF_N);
// Fundamental at 150Hz (bin 3-4)
const bin150 = hzToBin(150);
fftSpeech[bin150] = 1.0;
// Harmonics at 300, 450, 600, 900, 1200, 1800, 2400, 3000 Hz
[300, 450, 600, 900, 1200, 1800, 2400, 3000].forEach(hz => {
  const bin = Math.round(hz * FFT_SIZE / SAMPLE_RATE);
  if (bin < HALF_N) fftSpeech[bin] = 0.5 / Math.log2(hz / 150 + 1);
});
const result3 = calculateFrequencyBands(fftSpeech);
console.log('Result:', result3);
console.log('Sum:', result3.bass + result3.mid + result3.treble);

// Test 4: Mid-range music (vocals at 1-3kHz)
console.log('\n=== Test 4: Vocals at 1-3kHz ===');
const fftVocals = new Float32Array(HALF_N);
[1000, 1500, 2000, 2500, 3000].forEach(hz => {
  const bin = Math.round(hz * FFT_SIZE / SAMPLE_RATE);
  if (bin < HALF_N) fftVocals[bin] = 1.0;
});
const result4 = calculateFrequencyBands(fftVocals);
console.log('Result:', result4);
console.log('Sum:', result4.bass + result4.mid + result4.treble);

// Test 5: High-frequency content (8-12kHz)
console.log('\n=== Test 5: High-freq at 8-12kHz ===');
const fftHF = new Float32Array(HALF_N);
[8000, 10000, 12000].forEach(hz => {
  const bin = Math.round(hz * FFT_SIZE / SAMPLE_RATE);
  if (bin < HALF_N) fftHF[bin] = 1.0;
});
const result5 = calculateFrequencyBands(fftHF);
console.log('Result:', result5);
console.log('Sum:', result5.bass + result5.mid + result5.treble);

// Test 6: Combined bass (60Hz) + mid (800Hz) with equal energy
console.log('\n=== Test 6: Combined 60Hz + 800Hz ===');
const fftCombined = new Float32Array(HALF_N);
fftCombined[hzToBin(60)] = 1.0;
fftCombined[hzToBin(800)] = 1.0;
const result6 = calculateFrequencyBands(fftCombined);
console.log('Result:', result6);
console.log('Sum:', result6.bass + result6.mid + result6.treble);
// Expected: bass and mid roughly equal since both have 1 bin with equal amplitude

console.log('\n=== VERIFICATION: All sums should be 100% ===');
console.log('Test 1 (100Hz):', (result1.bass + result1.mid + result1.treble).toFixed(4), '%');
console.log('Test 2 (Noise):', (result2.bass + result2.mid + result2.treble).toFixed(4), '%');
console.log('Test 3 (Speech):', (result3.bass + result3.mid + result3.treble).toFixed(4), '%');
console.log('Test 4 (Vocals):', (result4.bass + result4.mid + result4.treble).toFixed(4), '%');
console.log('Test 5 (HF):', (result5.bass + result5.mid + result5.treble).toFixed(4), '%');
console.log('Test 6 (Combined):', (result6.bass + result6.mid + result6.treble).toFixed(4), '%');
