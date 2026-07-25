/**
 * Tests for RMS Calculator
 * 
 * Run in browser console or Node.js environment
 */

// Import RMS (Node.js compatible)
const RMS = require('./rms.js');

console.log('=== RMS Calculator Tests ===\n');

// Test 1: Silence (zeros)
console.log('Test 1: Silence (all zeros)');
const silence = new Float32Array(1024).fill(0);
const rmsSilence = RMS.calculateStatic(silence);
console.log('  Expected: 0, Got:', rmsSilence.toFixed(6));
console.log('  Classification:', RMS.classifyLevel(rmsSilence));
console.log('  dBFS:', RMS.calculateDBFSStatic(silence).toFixed(2), 'dB');
console.log();

// Test 2: Maximum amplitude (clipping)
console.log('Test 2: Maximum amplitude (clipping)');
const maxAmplitude = new Float32Array(1024).fill(1.0);
const rmsMax = RMS.calculateStatic(maxAmplitude);
console.log('  Expected: 1.0, Got:', rmsMax.toFixed(6));
console.log('  Classification:', RMS.classifyLevel(rmsMax));
console.log('  dBFS:', RMS.calculateDBFSStatic(maxAmplitude).toFixed(2), 'dB');
console.log();

// Test 3: Negative maximum amplitude
console.log('Test 3: Negative maximum amplitude');
const negMaxAmplitude = new Float32Array(1024).fill(-1.0);
const rmsNegMax = RMS.calculateStatic(negMaxAmplitude);
console.log('  Expected: 1.0, Got:', rmsNegMax.toFixed(6));
console.log('  Classification:', RMS.classifyLevel(rmsNegMax));
console.log();

// Test 4: Sine wave (theoretical RMS = 1/√2 ≈ 0.707)
console.log('Test 4: Sine wave (theoretical RMS ≈ 0.707)');
const sineWave = new Float32Array(1024);
for (let i = 0; i < 1024; i++) {
  sineWave[i] = Math.sin((i / 1024) * 2 * Math.PI);
}
const rmsSine = RMS.calculateStatic(sineWave);
console.log('  Expected: ~0.707, Got:', rmsSine.toFixed(6));
console.log('  Classification:', RMS.classifyLevel(rmsSine));
console.log();

// Test 5: Noise
console.log('Test 5: Random noise');
const noise = new Float32Array(1024);
for (let i = 0; i < 1024; i++) {
  noise[i] = (Math.random() * 2 - 1) * 0.5; // -0.5 to +0.5
}
const rmsNoise = RMS.calculateStatic(noise);
console.log('  Got:', rmsNoise.toFixed(6));
console.log('  Classification:', RMS.classifyLevel(rmsNoise));
console.log();

// Test 6: Sliding window RMS (instance method)
console.log('Test 6: Sliding window RMS');
const rmsInstance = new RMS();
const slidingTest = new Float32Array(2048);
for (let i = 0; i < 2048; i++) {
  slidingTest[i] = Math.sin((i / 512) * 2 * Math.PI);
}
const rmsSliding = rmsInstance.calculateSliding(slidingTest, 1024);
console.log('  Sliding RMS (1024 window):', rmsSliding.toFixed(6));
console.log();

// Test 7: Percentage conversion
console.log('Test 7: Percentage conversion');
console.log('  RMS 0.5 →', RMS.rmsToPercentage(0.5), '%');
console.log('  RMS 0.707 →', RMS.rmsToPercentage(0.707), '%');
console.log('  RMS 1.0 →', RMS.rmsToPercentage(1.0), '%');
console.log();

// Test 8: Classify various levels
console.log('Test 8: Level classification');
const testLevels = [0.001, 0.05, 0.15, 0.5, 0.8];
testLevels.forEach(level => {
  console.log('  RMS', level.toFixed(3), '→', RMS.classifyLevel(level));
});
console.log();

// Test 9: Instance-based calculation
console.log('Test 9: Instance-based calculation');
const rmsInstance2 = new RMS();
const buffer1 = new Float32Array([0.5, -0.5, 0.5, -0.5]);
const buffer2 = new Float32Array([0.3, 0.3, 0.3, 0.3]);
console.log('  First buffer RMS:', rmsInstance2.calculate(buffer1).toFixed(6));
console.log('  Second buffer RMS:', rmsInstance2.calculate(buffer2).toFixed(6));
console.log('  Total samples processed:', rmsInstance2.sampleCount);
rmsInstance2.reset();
console.log('  After reset - samples:', rmsInstance2.sampleCount);
console.log();

// Test 10: Edge cases
console.log('Test 10: Edge cases');
console.log('  Empty buffer:', RMS.calculateStatic([]));
console.log('  Single sample (1.0):', RMS.calculateStatic([1.0]).toFixed(6));
console.log('  Single sample (0.0):', RMS.calculateStatic([0.0]).toFixed(6));

console.log('\n=== All tests completed ===');
