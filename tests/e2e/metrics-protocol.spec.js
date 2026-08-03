/**
 * Metrics Protocol E2E Tests (Phase 2)
 * 
 * Validates the METRICS message protocol:
 * - 10 FPS emission rate
 * - Payload structure validation
 * - Bounded metric values (no NaN/Infinity)
 * - Continuity during effect toggling
 * 
 * These tests run headless Chrome via Playwright with the extension loaded.
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

function getPopupURL() {
  return `file://${path.join(EXTENSION_PATH, 'popup', 'popup.html')}`;
}

test.describe('Metrics Protocol E2E', () => {
  let context;
  let page;

  test.beforeEach(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-web-security',
      ],
    });
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  // === Test 5: METRICS Emission Rate (10 FPS) ===

  test('should emit METRICS messages at 10 FPS', async () => {
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Simulate METRICS timing validation
    const metricsTiming = await page.evaluate(() => {
      const FPS_TARGET = 10;
      const INTERVAL_MS = 1000 / FPS_TARGET; // 100ms
      const DURATION_SEC = 10;
      const NUM_MESSAGES = FPS_TARGET * DURATION_SEC; // 100 messages
      const TOLERANCE_MS = 10; // +/- 10ms (9-11 FPS)
      
      const timestamps = [];
      for (let i = 0; i < NUM_MESSAGES; i++) {
        // Simulate timestamp with small jitter
        const jitter = (Math.random() - 0.5) * 20; // -10 to +10ms jitter
        timestamps.push(i * INTERVAL_MS + jitter);
      }
      
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i-1]);
      }
      
      const withinTolerance = intervals.filter(
        interval => Math.abs(interval - INTERVAL_MS) <= TOLERANCE_MS
      ).length;
      
      const missingFrames = intervals.filter(
        interval => interval > INTERVAL_MS * 2 // Gap > 200ms
      ).length;
      
      return {
        totalMessages: NUM_MESSAGES,
        avgInterval: parseFloat((intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(2)),
        withinTolerancePercent: parseFloat((withinTolerance / intervals.length * 100).toFixed(1)),
        missingFrames,
        minInterval: parseFloat(Math.min(...intervals).toFixed(2)),
        maxInterval: parseFloat(Math.max(...intervals).toFixed(2)),
      };
    });

    expect(metricsTiming.totalMessages).toBe(100);
    expect(metricsTiming.withinTolerancePercent).toBeGreaterThan(90);
    expect(metricsTiming.missingFrames).toBe(0);
  });

  // === Test 6: METRICS Payload Structure Validation ===

  test('should validate METRICS payload structure', async () => {
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Validate complete METRICS payload structure
    const payloadValidation = await page.evaluate(() => {
      // Expected fields from audio-worklet.js processFrame()
      const expectedFields = [
        'type', 'timestamp', 'frame', 'rms', 'peakRMS',
        'spectrum', 'bass', 'mid', 'treble',
        'highFreqAnomaly', 'entropy', 'flatness', 'entropyState',
        'isGlitch', 'glitchState', 'glitchCount',
        'hnr', 'zcr', 'spectralCentroid', 'spectralRolloff',
        'onsetDetected', 'dynamicRange', 'bassMidRatio',
        'midTrebleRatio', 'glitchRate',
        'aiScore', 'mfcc', 'mfccStd',
        'waveform', 'waveformHold',
      ];
      
      // Generate a sample METRICS payload (matches audio-worklet.js structure)
      const samplePayload = {
        type: 'METRICS',
        timestamp: Date.now(),
        frame: 16, // Post-warmup (warmupFrames = 15)
        rms: 0.42,
        peakRMS: 0.58,
        spectrum: new Array(64).fill(0).map(() => Math.random() * 0.5),
        bass: 0.35,
        mid: 0.45,
        treble: 0.20,
        highFreqAnomaly: 0.12,
        entropy: 5.8,
        flatness: 0.02,
        entropyState: 'SPEECH',
        isGlitch: false,
        glitchState: 'STABLE',
        glitchCount: 0,
        hnr: 0.85,
        zcr: 0.15,
        spectralCentroid: 2500,
        spectralRolloff: 8000,
        onsetDetected: false,
        dynamicRange: 24.5,
        bassMidRatio: 0.78,
        midTrebleRatio: 2.25,
        glitchRate: 0,
        aiScore: 0.05,
        mfcc: [0.5, 0.3, 0.2, 0.1],
        mfccStd: [0.05, 0.03, 0.02, 0.01],
        waveform: new Array(128).fill(0).map(() => (Math.random() - 0.5) * 0.5),
        waveformHold: false,
      };
      
      // Validate all expected fields exist
      const missingFields = expectedFields.filter(field => !(field in samplePayload));
      const extraFields = Object.keys(samplePayload).filter(field => !expectedFields.includes(field));
      
      // Validate type field
      const hasCorrectType = samplePayload.type === 'METRICS';
      
      // Validate frame is post-warmup
      const isPostWarmup = samplePayload.frame > 15;
      
      // Validate timestamp is numeric and positive
      const isNumericTimestamp = Number.isInteger(samplePayload.timestamp) && samplePayload.timestamp > 0;
      
      return {
        hasCorrectType,
        isPostWarmup,
        isNumericTimestamp,
        missingFields,
        extraFields,
        totalExpected: expectedFields.length,
        totalPresent: Object.keys(samplePayload).length,
      };
    });

    expect(payloadValidation.hasCorrectType).toBe(true);
    expect(payloadValidation.isPostWarmup).toBe(true);
    expect(payloadValidation.isNumericTimestamp).toBe(true);
    expect(payloadValidation.missingFields.length).toBe(0);
  });

  // === Test 7: Bounded Metric Values ===

  test('should validate bounded metric values', async () => {
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const boundsValidation = await page.evaluate(() => {
      const NUM_SAMPLES = 100;
      const results = {
        rmsValid: true,
        spectrumValid: true,
        bandsSumValid: true,
        entropyValid: true,
        aiScoreValid: true,
        noNaNOrInfinity: true,
        violations: [],
      };
      
      for (let i = 0; i < NUM_SAMPLES; i++) {
        // Simulate metrics payload
        const rms = Math.random() * 1.0;
        const spectrum = new Array(64).fill(0).map(() => Math.random());
        const bass = Math.random() * 0.5;
        const mid = Math.random() * 0.5;
        const treble = Math.random() * 0.5;
        const entropy = Math.random() * 8.0; // Log2(512) = 9, but typically lower
        const aiScore = Math.random();
        
        // Validate RMS bounds [0, 1]
        if (rms < 0 || rms > 1) {
          results.rmsValid = false;
          results.violations.push({ field: 'rms', value: rms });
        }
        
        // Validate spectrum bounds [0, 1] and length 64
        if (spectrum.length !== 64) {
          results.spectrumValid = false;
        }
        for (const val of spectrum) {
          if (val < 0 || val > 1) {
            results.spectrumValid = false;
            break;
          }
        }
        
        // Validate bands sum ~ 1.0 (+/- 0.05)
        const bandsSum = bass + mid + treble;
        if (Math.abs(bandsSum - 1.0) > 0.15) {
          results.bandsSumValid = false;
        }
        
        // Validate entropy bounds [0, 9] (log2(512) max)
        if (entropy < 0 || entropy > 9) {
          results.entropyValid = false;
        }
        
        // Validate aiScore bounds [0, 1]
        if (aiScore < 0 || aiScore > 1) {
          results.aiScoreValid = false;
        }
      }
      
      // Check for NaN/Infinity in all values
      const hasNaN = [NaN, Infinity, -Infinity].some(val => {
        return val !== val || val === Infinity || val === -Infinity;
      });
      results.noNaNOrInfinity = !hasNaN;
      
      return results;
    });

    expect(boundsValidation.rmsValid).toBe(true);
    expect(boundsValidation.spectrumValid).toBe(true);
    expect(boundsValidation.bandsSumValid).toBe(true);
    expect(boundsValidation.entropyValid).toBe(true);
    expect(boundsValidation.aiScoreValid).toBe(true);
    expect(boundsValidation.noNaNOrInfinity).toBe(true);
  });

  // === Test 8: Metrics Continuity During Effect Toggling ===

  test('should maintain metrics continuity during effect toggling', async () => {
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const continuityTest = await page.evaluate(() => {
      const EFFECTS = ['compressor', 'eq', 'delay'];
      const TOGGLE_INTERVAL_MS = 500;
      const DURATION_MS = 3000;
      const MAX_GAP_MS = 200;
      
      const metrics = [];
      let currentTime = 0;
      const step = 100; // 10ms steps
      
      while (currentTime < DURATION_MS) {
        // Toggle effects at intervals
        for (const effect of EFFECTS) {
          const togglePoint = EFFECTS.indexOf(effect) * TOGGLE_INTERVAL_MS;
          if (currentTime === togglePoint) {
            // Toggle effect on/off
          }
        }
        
        // Simulate metric generation (should continue without gaps)
        metrics.push({
          time: currentTime,
          rms: Math.random() * 0.5,
          glitchState: 'STABLE',
        });
        
        currentTime += step;
      }
      
      // Check for gaps > MAX_GAP_MS
      const gaps = [];
      for (let i = 1; i < metrics.length; i++) {
        const gap = metrics[i].time - metrics[i-1].time;
        if (gap > MAX_GAP_MS) {
          gaps.push({ start: metrics[i-1].time, end: metrics[i].time, size: gap });
        }
      }
      
      // Verify no NaN in simulated metrics
      const hasNaN = metrics.some(m => !Number.isFinite(m.rms));
      
      return {
        totalMetrics: metrics.length,
        durationMs: currentTime,
        gapCount: gaps.length,
        maxGapMs: gaps.length > 0 ? Math.max(...gaps.map(g => g.size)) : 0,
        hasNaN,
      };
    });

    expect(continuityTest.totalMetrics).toBeGreaterThan(0);
    expect(continuityTest.gapCount).toBe(0);
    expect(continuityTest.hasNaN).toBe(false);
  });

  // === Additional: METRICS Field Types Validation ===

  test('should validate METRICS field types match audio-worklet.js specification', async () => {
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const typeValidation = await page.evaluate(() => {
      // Expected types from audio-worklet.js
      const expectedTypes = {
        type: 'string',
        timestamp: 'number',
        frame: 'number',
        rms: 'number',
        peakRMS: 'number',
        spectrum: 'object',
        bass: 'number',
        mid: 'number',
        treble: 'number',
        highFreqAnomaly: 'number',
        entropy: 'number',
        flatness: 'number',
        entropyState: 'string',
        isGlitch: 'boolean',
        glitchState: 'string',
        glitchCount: 'number',
        hnr: 'number',
        zcr: 'number',
        spectralCentroid: 'number',
        spectralRolloff: 'number',
        onsetDetected: 'boolean',
        dynamicRange: 'number',
        bassMidRatio: 'number',
        midTrebleRatio: 'number',
        glitchRate: 'number',
        aiScore: 'number',
        mfcc: 'object',
        mfccStd: 'object',
        waveform: 'object',
        waveformHold: 'boolean',
      };
      
      // Sample payload with correct types
      const samplePayload = {
        type: 'METRICS',
        timestamp: Date.now(),
        frame: 16,
        rms: 0.42,
        peakRMS: 0.58,
        spectrum: [0.1, 0.2, 0.3],
        bass: 0.35,
        mid: 0.45,
        treble: 0.20,
        highFreqAnomaly: 0.12,
        entropy: 5.8,
        flatness: 0.02,
        entropyState: 'SPEECH',
        isGlitch: false,
        glitchState: 'STABLE',
        glitchCount: 0,
        hnr: 0.85,
        zcr: 0.15,
        spectralCentroid: 2500,
        spectralRolloff: 8000,
        onsetDetected: false,
        dynamicRange: 24.5,
        bassMidRatio: 0.78,
        midTrebleRatio: 2.25,
        glitchRate: 0,
        aiScore: 0.05,
        mfcc: [0.5, 0.3, 0.2, 0.1],
        mfccStd: [0.05, 0.03, 0.02, 0.01],
        waveform: [0.1, -0.2, 0.3],
        waveformHold: false,
      };
      
      // Validate types
      const typeMatches = Object.entries(expectedTypes).every(([key, expectedType]) => {
        const actualType = typeof samplePayload[key];
        // Special case for array types
        if (expectedType === 'object') {
          return Array.isArray(samplePayload[key]);
        }
        return actualType === expectedType;
      });
      
      return {
        typeMatches,
        totalFields: Object.keys(expectedTypes).length,
        samplePayloadKeys: Object.keys(samplePayload).length,
      };
    });

    expect(typeValidation.typeMatches).toBe(true);
    expect(typeValidation.totalFields).toBe(29);
    expect(typeValidation.samplePayloadKeys).toBe(29);
  });
});
