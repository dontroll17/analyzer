/**
 * Generate test audio fixtures for fake audio capture E2E tests.
 * 
 * Outputs: tests/e2e/fixtures/*.wav
 * - 1kHz_sine.wav: 1000Hz sine wave at -6dBFS
 * - glitch.wav: sine with periodic digital clipping artifacts
 * - silence.wav: 1 second of silence (zero samples)
 * 
 * Usage: node scripts/generate-audio-fixtures.js
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION_SEC = 1;
const NUM_SAMPLES = SAMPLE_RATE * DURATION_SEC;
const NUM_CHANNELS = 1; // Mono
const BITS_PER_SAMPLE = 16;

/**
 * Encode a WAV file and write to disk.
 * @param {string} filePath 
 * @param {Float32Array} samples 
 * @param {number} sampleRate 
 */
function writeWav(filePath, samples, sampleRate) {
  const numSamples = samples.length;
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const blockAlign = NUM_CHANNELS * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize; // 44 bytes WAV header

  const buffer = Buffer.alloc(bufferSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write('WAVE', 8);
  
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Write samples as 16-bit PCM
  for (let i = 0; i < numSamples; i++) {
    // Clamp to [-1, 1] and convert to 16-bit
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = sample < 0 
      ? sample * 0x8000 
      : sample * 0x7FFF;
    buffer.writeInt16LE(intSample, 44 + i * bytesPerSample);
  }
  
  fs.writeFileSync(filePath, buffer);
  console.log(`  ✓ ${path.basename(filePath)}: ${numSamples} samples (${(numSamples / sampleRate).toFixed(2)}s), ${(bufferSize / 1024).toFixed(1)}KB`);
}

/**
 * Generate 1kHz sine wave at -6dBFS.
 */
function generate1kHzSine() {
  const samples = new Float32Array(NUM_SAMPLES);
  const frequency = 1000;
  const amplitude = 0.5; // -6dBFS ≈ 0.5 linear
  
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * t);
  }
  
  return samples;
}

/**
 * Generate glitch audio: clean sine with periodic digital clipping bursts.
 * Every 100 samples, inject a burst of clipped samples.
 */
function generateGlitch() {
  const samples = new Float32Array(NUM_SAMPLES);
  const frequency = 1000;
  const amplitude = 0.4;
  
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * t);
    
    // Inject digital clipping artifacts every 100 samples
    if (i % 100 < 5 && i > 10) {
      // Hard clip: snap to ±1.0
      samples[i] = samples[i] > 0 ? 1.0 : -1.0;
    }
  }
  
  return samples;
}

/**
 * Generate silence (zero samples).
 */
function generateSilence() {
  return new Float32Array(NUM_SAMPLES);
}

// Main
const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'e2e', 'fixtures');

// Create fixtures directory if it doesn't exist
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  console.log(`Created fixtures directory: ${FIXTURES_DIR}`);
}

console.log(`\nGenerating audio fixtures (${SAMPLE_RATE}Hz, ${DURATION_SEC}s, ${BITS_PER_SAMPLE}-bit PCM):\n`);

// Generate and write each fixture
const generators = [
  { name: '1kHz_sine.wav', fn: generate1kHzSine },
  { name: 'glitch.wav', fn: generateGlitch },
  { name: 'silence.wav', fn: generateSilence },
];

for (const { name, fn } of generators) {
  const filePath = path.join(FIXTURES_DIR, name);
  const samples = fn();
  writeWav(filePath, samples, SAMPLE_RATE);
}

console.log(`\nDone. ${generators.length} fixtures generated.\n`);
