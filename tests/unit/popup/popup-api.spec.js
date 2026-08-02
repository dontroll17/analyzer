/**
 * Tests for popup API — Chrome Extension API integration patterns
 * Covers: message building, validation, theme selection
 * Does NOT require DOM — all functions are pure (imported from popup-testable.js)
 */
import { describe, it, expect } from 'vitest';
import {
  THEME_COLORS,
  VALID_CAPTURE_SOURCES,
  STORAGE_KEYS,
  getThemeColors,
  getThemeColor,
  isValidCaptureSource,
  getDefaultCaptureSource,
  buildStartCaptureMessage,
  buildStopCaptureMessage,
  buildRequestStatusMessage,
  buildRequestMetricsMessage,
  buildEffectsMessage,
  RMS_LEVELS,
  classifyRmsLevel,
  rmsToPercentage,
  getRmsColor,
  calculateBandPercentage,
  SENSITIVITY_RANGE,
  isValidSensitivity,
  getDefaultSensitivity,
  clampSensitivity,
  DEFAULT_OSC_OPTIONS,
  VALID_OSC_OPTION_KEYS,
  isValidOscOption,
  mergeOscOptions,
  DEFAULT_COMPRESSOR_SETTINGS,
  COMPRESSOR_RANGES,
  isValidCompressorParam,
  getCompressorParamLabel,
  validateCompressorSettings,
  DEFAULT_EQ_SETTINGS,
  EQ_FILTER_TYPES,
  buildEqMessage,
  DEFAULT_DELAY_SETTINGS,
  DEFAULT_LIMITER_SETTINGS,
  clamp,
  lerp,
  remap,
  generateMessageId,
  calculateAverage,
  calculateStdDev,
  formatRms,
  formatPercentage,
  isAnomalous,
  calculateBandRatioDb,
} from '../../../popup/popup-testable.js';

// ============================================
// THEME_COLORS structure validation
// ============================================
describe('THEME_COLORS structure', () => {
  it('has all three themes: dark, light, neon', () => {
    expect(THEME_COLORS).toHaveProperty('dark');
    expect(THEME_COLORS).toHaveProperty('light');
    expect(THEME_COLORS).toHaveProperty('neon');
  });

  it('each theme has glitch, rms, canvas, channel categories', () => {
    for (const theme of Object.keys(THEME_COLORS)) {
      expect(THEME_COLORS[theme]).toHaveProperty('glitch');
      expect(THEME_COLORS[theme]).toHaveProperty('rms');
      expect(THEME_COLORS[theme]).toHaveProperty('canvas');
      expect(THEME_COLORS[theme]).toHaveProperty('channel');
    }
  });

  it('glitch colors are valid hex values', () => {
    for (const theme of Object.keys(THEME_COLORS)) {
      for (const [state, color] of Object.entries(THEME_COLORS[theme].glitch)) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('rms colors are valid hex values', () => {
    for (const theme of Object.keys(THEME_COLORS)) {
      for (const [level, color] of Object.entries(THEME_COLORS[theme].rms)) {
        if (level !== 'default') {
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
      }
    }
  });
});

// ============================================
// VALID_CAPTURE_SOURCES / VALID_OVERLAY_MODES
// ============================================
describe('Constant validations', () => {
  it('VALID_CAPTURE_SOURCES has exactly 3 sources', () => {
    expect(VALID_CAPTURE_SOURCES).toHaveLength(3);
    expect(VALID_CAPTURE_SOURCES).toContain('tab');
    expect(VALID_CAPTURE_SOURCES).toContain('mic');
    expect(VALID_CAPTURE_SOURCES).toContain('combined');
  });

  it('STORAGE_KEYS has DROP_COUNT', () => {
    expect(STORAGE_KEYS).toHaveProperty('DROP_COUNT', 'ssa_audio_drop_count');
  });
});

// ============================================
// Theme helper functions
// ============================================
describe('Theme helpers', () => {
  it('getThemeColors returns neon for undefined input', () => {
    expect(getThemeColors(undefined)).toBe(THEME_COLORS.neon);
  });

  it('getThemeColors returns neon for unknown theme', () => {
    expect(getThemeColors('unknown-theme')).toBe(THEME_COLORS.neon);
  });

  it('getThemeColors returns correct object for known themes', () => {
    expect(getThemeColors('dark')).toBe(THEME_COLORS.dark);
    expect(getThemeColors('light')).toBe(THEME_COLORS.light);
    expect(getThemeColors('neon')).toBe(THEME_COLORS.neon);
  });

  it('getThemeColor returns correct hex for glitch.STABLE in neon theme', () => {
    expect(getThemeColor('neon', 'glitch', 'STABLE')).toBe('#00E5FF');
  });

  it('getThemeColor returns correct hex for rms.HIGH in dark theme', () => {
    expect(getThemeColor('dark', 'rms', 'HIGH')).toBe('#00B8D4');
  });

  it('getThemeColor returns default for invalid category', () => {
    const result = getThemeColor('neon', 'invalidCategory', 'someKey');
    expect(result).toBe('#000000'); // fallback
  });

  it('getThemeColor returns default key for invalid sub-key', () => {
    const result = getThemeColor('neon', 'rms', 'nonexistent');
    expect(result).toBe('#000000');
  });

  it('all neon glitch states have distinct colors', () => {
    const colors = Object.values(THEME_COLORS.neon.glitch);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});

// ============================================
// Validation helper functions
// ============================================
describe('Validation helpers', () => {
  it('isValidCaptureSource accepts valid sources', () => {
    expect(isValidCaptureSource('tab')).toBe(true);
    expect(isValidCaptureSource('mic')).toBe(true);
    expect(isValidCaptureSource('combined')).toBe(true);
  });

  it('isValidCaptureSource rejects invalid values', () => {
    expect(isValidCaptureSource('')).toBe(false);
    expect(isValidCaptureSource(null)).toBe(false);
    expect(isValidCaptureSource(undefined)).toBe(false);
    expect(isValidCaptureSource('camera')).toBe(false);
    expect(isValidCaptureSource(123)).toBe(false);
  });

  it('getDefaultCaptureSource returns "tab"', () => {
    expect(getDefaultCaptureSource()).toBe('tab');
  });
});

// ============================================
// Message builder functions
// ============================================
describe('Message builders', () => {
  describe('buildStartCaptureMessage', () => {
    it('creates message with default capture source', () => {
      const msg = buildStartCaptureMessage(undefined);
      expect(msg).toEqual({ type: 'START_CAPTURE', captureSource: 'tab' });
    });

    it('creates message with explicit capture source', () => {
      expect(buildStartCaptureMessage('mic')).toEqual({
        type: 'START_CAPTURE',
        captureSource: 'mic'
      });
    });
  });

  // ============================================

  describe('buildStartCaptureMessage extended', () => {
    it('creates message with combined capture source', () => {
      expect(buildStartCaptureMessage('combined')).toEqual({
        type: 'START_CAPTURE',
        captureSource: 'combined'
      });
    });

    it('defaults to "tab" for empty string input', () => {
      const msg = buildStartCaptureMessage('');
      expect(msg.captureSource).toBe('tab');
    });

    it('does NOT include tabStreamId (MV3 API fix)', () => {
      const msg = buildStartCaptureMessage('tab');
      expect(msg).not.toHaveProperty('tabStreamId');
      expect(msg).not.toHaveProperty('targetTab');
      expect(msg).not.toHaveProperty('consumerTabId');
    });
  });

  describe('buildStopCaptureMessage', () => {
    it('creates simple stop message', () => {
      expect(buildStopCaptureMessage()).toEqual({ type: 'STOP_CAPTURE' });
    });
  });

  describe('buildRequestStatusMessage', () => {
    it('creates request status message', () => {
      expect(buildRequestStatusMessage()).toEqual({ type: 'REQUEST_STATUS' });
    });
  });

  describe('buildRequestMetricsMessage', () => {
    it('creates request metrics message', () => {
      expect(buildRequestMetricsMessage()).toEqual({ type: 'REQUEST_METRICS' });
    });
  });
});

// ============================================
// Effects message builders
// ============================================
describe('Effects message builders', () => {
  it('buildEffectsMessage COMPRESSOR creates correct type', () => {
    const msg = buildEffectsMessage('COMPRESSOR', { enabled: true, threshold: -24 });
    expect(msg.type).toBe('_SSA_SET_COMPRESSOR');
    expect(msg.active).toBe(true);
    expect(msg.threshold).toBe(-24);
  });

  it('buildEffectsMessage LIMITER creates correct type', () => {
    const msg = buildEffectsMessage('LIMITER', { enabled: true, threshold: -3 });
    expect(msg.type).toBe('_SSA_SET_LIMITER');
    expect(msg.active).toBe(true);
  });

  it('buildEffectsMessage EQ creates correct type', () => {
    const msg = buildEffectsMessage('EQ', { enabled: true, peakFreq: 1000 });
    expect(msg.type).toBe('_SSA_SET_EQ');
    expect(msg.active).toBe(true);
  });

  it('buildEffectsMessage DELAY creates correct type', () => {
    const msg = buildEffectsMessage('DELAY', { enabled: true, delayTime: 500 });
    expect(msg.type).toBe('_SSA_SET_DELAY');
    expect(msg.active).toBe(true);
  });

  it('buildEffectsMessage with disabled effect sets active false', () => {
    const msg = buildEffectsMessage('COMPRESSOR', { enabled: false });
    expect(msg.active).toBe(false);
  });

  it('buildEffectsMessage without params object', () => {
    const msg = buildEffectsMessage('LIMITER', null);
    expect(msg.type).toBe('_SSA_SET_LIMITER');
    expect(msg.active).toBe(false);
  });
});

// ============================================
// RMS analysis helpers
// ============================================
describe('RMS analysis helpers', () => {
  it('RMS_LEVELS has correct boundaries', () => {
    expect(RMS_LEVELS.SILENCE).toBe(0.01);
    expect(RMS_LEVELS.LOW).toBe(0.1);
    expect(RMS_LEVELS.MEDIUM).toBe(0.3);
    expect(RMS_LEVELS.HIGH).toBe(0.7);
  });

  it('classifyRmsLevel returns SILENCE for low values', () => {
    expect(classifyRmsLevel(0)).toBe('SILENCE');
    expect(classifyRmsLevel(0.005)).toBe('SILENCE');
    expect(classifyRmsLevel(0.0099)).toBe('SILENCE');
  });

  it('classifyRmsLevel returns LOW for 0.01-0.1', () => {
    expect(classifyRmsLevel(0.01)).toBe('LOW');
    expect(classifyRmsLevel(0.05)).toBe('LOW');
    expect(classifyRmsLevel(0.099)).toBe('LOW');
  });

  it('classifyRmsLevel returns MEDIUM for 0.1-0.3', () => {
    expect(classifyRmsLevel(0.1)).toBe('MEDIUM');
    expect(classifyRmsLevel(0.2)).toBe('MEDIUM');
    expect(classifyRmsLevel(0.299)).toBe('MEDIUM');
  });

  it('classifyRmsLevel returns HIGH for 0.3-0.7', () => {
    expect(classifyRmsLevel(0.3)).toBe('HIGH');
    expect(classifyRmsLevel(0.5)).toBe('HIGH');
    expect(classifyRmsLevel(0.699)).toBe('HIGH');
  });

  it('classifyRmsLevel returns CRITICAL for 0.7+', () => {
    expect(classifyRmsLevel(0.7)).toBe('CRITICAL');
    expect(classifyRmsLevel(0.8)).toBe('CRITICAL');
    expect(classifyRmsLevel(1.0)).toBe('CRITICAL');
  });

  it('rmsToPercentage converts correctly', () => {
    expect(rmsToPercentage(0)).toBe(0);
    expect(rmsToPercentage(0.5)).toBe(50);
    expect(rmsToPercentage(1.0)).toBe(100);
    expect(rmsToPercentage(0.333)).toBe(33);
  });

  it('rmsToPercentage clamps values', () => {
    expect(rmsToPercentage(-0.5)).toBe(0);
    expect(rmsToPercentage(1.5)).toBe(100);
  });

  it('getRmsColor returns correct color for level', () => {
    expect(getRmsColor('SILENCE', 'neon')).toBe('#FF007F');
    expect(getRmsColor('LOW', 'neon')).toBe('#9D00FF');
    expect(getRmsColor('MEDIUM', 'neon')).toBe('#00E5FF');
    expect(getRmsColor('HIGH', 'neon')).toBe('#00B8D4');
    expect(getRmsColor('CRITICAL', 'neon')).toBe('#FF4DA6');
  });

  it('getRmsColor defaults to neon theme', () => {
    expect(getRmsColor('SILENCE')).toBe('#FF007F');
  });

  it('calculateBandPercentage returns correct values', () => {
    expect(calculateBandPercentage(0.5, 1.0)).toBe(50);
    expect(calculateBandPercentage(1.0, 1.0)).toBe(100);
    expect(calculateBandPercentage(0, 1.0)).toBe(0);
  });

  it('calculateBandPercentage handles zero maxEnergy', () => {
    expect(calculateBandPercentage(1.0, 0)).toBe(0);
    expect(calculateBandPercentage(1.0, -1)).toBe(0);
  });
});

// ============================================
// Integration: Message chain consistency
// ============================================
describe('Message chain consistency', () => {
  it('popup → bg → offscreen message flow is valid', () => {
    // Step 1: popup builds START_CAPTURE
    const popupMsg = buildStartCaptureMessage('tab');
    expect(popupMsg.type).toBe('START_CAPTURE');
    expect(isValidCaptureSource(popupMsg.captureSource)).toBe(true);

    // Step 2: bg forwards to offscreen (no targetTab — Bug-NEW fix verified)
    const offscreenMsg = {
      type: '_OFFSCREEN_START',
      captureSource: popupMsg.captureSource
    };
    expect(offscreenMsg).not.toHaveProperty('tabStreamId');
    expect(offscreenMsg).not.toHaveProperty('targetTab');

    // Step 3: valid capture source reaches offscreen
    expect(isValidCaptureSource(offscreenMsg.captureSource)).toBe(true);
  });

  it('all message types are unique and non-colliding', () => {
    const messages = [
      buildStartCaptureMessage('tab'),
      buildStopCaptureMessage(),
      buildRequestStatusMessage(),
      buildRequestMetricsMessage(),
    ];

    const types = messages.map(m => m.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });
});

// ============================================
// Sensitivity validation helpers
// ============================================
describe('Sensitivity validation helpers', () => {
  it('SENSITIVITY_RANGE has correct values', () => {
    expect(SENSITIVITY_RANGE.MIN).toBe(60);
    expect(SENSITIVITY_RANGE.MAX).toBe(90);
    expect(SENSITIVITY_RANGE.DEFAULT).toBe(85);
  });

  it('isValidSensitivity accepts valid values', () => {
    expect(isValidSensitivity(60)).toBe(true);
    expect(isValidSensitivity(75)).toBe(true);
    expect(isValidSensitivity(85)).toBe(true);
    expect(isValidSensitivity(90)).toBe(true);
  });

  it('isValidSensitivity rejects out-of-range values', () => {
    expect(isValidSensitivity(59)).toBe(false);
    expect(isValidSensitivity(91)).toBe(false);
    expect(isValidSensitivity(0)).toBe(false);
    expect(isValidSensitivity(100)).toBe(false);
  });

  it('isValidSensitivity rejects non-number values', () => {
    expect(isValidSensitivity('85')).toBe(false);
    expect(isValidSensitivity(null)).toBe(false);
    expect(isValidSensitivity(undefined)).toBe(false);
    expect(isValidSensitivity(NaN)).toBe(false);
  });

  it('getDefaultSensitivity returns 85', () => {
    expect(getDefaultSensitivity()).toBe(85);
  });

  it('clampSensitivity clamps to range', () => {
    expect(clampSensitivity(50)).toBe(85); // invalid → returns default
    expect(clampSensitivity(60)).toBe(60); // valid, at min
    expect(clampSensitivity(85)).toBe(85); // valid, middle
    expect(clampSensitivity(90)).toBe(90); // valid, at max
    expect(clampSensitivity(100)).toBe(85); // invalid (>90) → returns default
  });

  it('clampSensitivity returns default for invalid input', () => {
    expect(clampSensitivity(NaN)).toBe(85);
    expect(clampSensitivity('invalid')).toBe(85);
    expect(clampSensitivity(null)).toBe(85);
  });
});

// ============================================
// Oscilloscope options helpers
// ============================================
describe('Oscilloscope options helpers', () => {
  it('DEFAULT_OSC_OPTIONS has correct defaults', () => {
    expect(DEFAULT_OSC_OPTIONS.freeze).toBe(false);
    expect(DEFAULT_OSC_OPTIONS.zoom).toBe(false);
    expect(DEFAULT_OSC_OPTIONS.logScale).toBe(false);
  });

  it('VALID_OSC_OPTION_KEYS has exactly 3 keys', () => {
    expect(VALID_OSC_OPTION_KEYS).toHaveLength(3);
    expect(VALID_OSC_OPTION_KEYS).toContain('freeze');
    expect(VALID_OSC_OPTION_KEYS).toContain('zoom');
    expect(VALID_OSC_OPTION_KEYS).toContain('logScale');
  });

  it('isValidOscOption accepts valid key-value pairs', () => {
    expect(isValidOscOption('freeze', true)).toBe(true);
    expect(isValidOscOption('zoom', false)).toBe(true);
    expect(isValidOscOption('logScale', true)).toBe(true);
  });

  it('isValidOscOption rejects invalid keys', () => {
    expect(isValidOscOption('invalid', true)).toBe(false);
    expect(isValidOscOption('', false)).toBe(false);
    expect(isValidOscOption(null, true)).toBe(false);
  });

  it('isValidOscOption rejects non-boolean values', () => {
    expect(isValidOscOption('freeze', 'true')).toBe(false);
    expect(isValidOscOption('freeze', 1)).toBe(false);
    expect(isValidOscOption('freeze', null)).toBe(false);
  });

  it('mergeOscOptions returns defaults when no input', () => {
    const result = mergeOscOptions();
    expect(result).toEqual(DEFAULT_OSC_OPTIONS);
  });

  it('mergeOscOptions merges valid boolean overrides', () => {
    const result = mergeOscOptions({ freeze: true, zoom: true });
    expect(result.freeze).toBe(true);
    expect(result.zoom).toBe(true);
    expect(result.logScale).toBe(false);
  });

  it('mergeOscOptions ignores invalid non-boolean values', () => {
    const result = mergeOscOptions({ freeze: 'yes', zoom: 1 });
    expect(result.freeze).toBe(false);
    expect(result.zoom).toBe(false);
  });
});

// ============================================
// Compressor validation helpers
// ============================================
describe('Compressor validation helpers', () => {
  it('COMPRESSOR_RANGES has correct ranges', () => {
    expect(COMPRESSOR_RANGES.threshold).toEqual({ min: -100, max: 0 });
    expect(COMPRESSOR_RANGES.knee).toEqual({ min: 0, max: 40 });
    expect(COMPRESSOR_RANGES.ratio).toEqual({ min: 1, max: 20 });
    expect(COMPRESSOR_RANGES.attack).toEqual({ min: 0, max: 100 });
    expect(COMPRESSOR_RANGES.release).toEqual({ min: 0, max: 1000 });
  });

  it('isValidCompressorParam accepts valid values', () => {
    expect(isValidCompressorParam('threshold', -24)).toBe(true);
    expect(isValidCompressorParam('ratio', 12)).toBe(true);
    expect(isValidCompressorParam('attack', 3)).toBe(true);
  });

  it('isValidCompressorParam rejects out-of-range values', () => {
    expect(isValidCompressorParam('threshold', -101)).toBe(false);
    expect(isValidCompressorParam('threshold', 1)).toBe(false);
    expect(isValidCompressorParam('ratio', 0)).toBe(false);
    expect(isValidCompressorParam('ratio', 21)).toBe(false);
  });

  it('isValidCompressorParam rejects invalid param names', () => {
    expect(isValidCompressorParam('invalid', 50)).toBe(false);
    expect(isValidCompressorParam('', 50)).toBe(false);
  });

  it('isValidCompressorParam rejects NaN and non-numbers', () => {
    expect(isValidCompressorParam('threshold', NaN)).toBe(false);
    expect(isValidCompressorParam('threshold', 'fast')).toBe(false);
  });

  it('getCompressorParamLabel returns correct labels', () => {
    expect(getCompressorParamLabel('threshold')).toBe('Threshold (dB)');
    expect(getCompressorParamLabel('knee')).toBe('Knee (dB)');
    expect(getCompressorParamLabel('ratio')).toBe('Ratio');
    expect(getCompressorParamLabel('attack')).toBe('Attack (ms)');
    expect(getCompressorParamLabel('release')).toBe('Release (ms)');
  });

  it('getCompressorParamLabel returns param name for unknown params', () => {
    expect(getCompressorParamLabel('unknown')).toBe('unknown');
  });

  it('validateCompressorSettings returns valid for correct settings', () => {
    const result = validateCompressorSettings(DEFAULT_COMPRESSOR_SETTINGS);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateCompressorSettings returns errors for invalid settings', () => {
    const result = validateCompressorSettings({
      threshold: -24,
      knee: 30,
      ratio: 12,
      attack: 3,
      release: 250,
    });
    expect(result.isValid).toBe(true);
  });

  it('validateCompressorSettings rejects invalid settings and returns cleaned defaults', () => {
    const result = validateCompressorSettings({
      threshold: -150, // out of range
      knee: 30,
      ratio: 12,
      attack: 3,
      release: 250,
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.cleaned.threshold).toBe(-24); // default value
  });

  it('validateCompressorSettings returns error for null input', () => {
    const result = validateCompressorSettings(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Settings must be an object');
    expect(result.cleaned).toEqual({});
  });

  it('validateCompressorSettings handles undefined values with defaults', () => {
    const result = validateCompressorSettings({ threshold: -24 });
    expect(result.isValid).toBe(true);
    expect(result.cleaned.knee).toBe(30);
    expect(result.cleaned.ratio).toBe(12);
  });
});

// ============================================
// Default settings validation
// ============================================
describe('Default settings validation', () => {
  it('DEFAULT_EQ_SETTINGS has all required params', () => {
    expect(DEFAULT_EQ_SETTINGS.hpfFreq).toBe(20);
    expect(DEFAULT_EQ_SETTINGS.lpfFreq).toBe(22050);
    expect(DEFAULT_EQ_SETTINGS.peakFreq).toBe(1000);
    expect(DEFAULT_EQ_SETTINGS.peakGain).toBe(0);
    expect(DEFAULT_EQ_SETTINGS.peakQ).toBe(1);
  });

  it('EQ_FILTER_TYPES has correct values', () => {
    expect(EQ_FILTER_TYPES.HPF).toBe('highpass');
    expect(EQ_FILTER_TYPES.LPF).toBe('lowpass');
    expect(EQ_FILTER_TYPES.PEAKING).toBe('peaking');
  });

  it('DEFAULT_DELAY_SETTINGS has correct defaults', () => {
    expect(DEFAULT_DELAY_SETTINGS.delayTime).toBe(0);
    expect(DEFAULT_DELAY_SETTINGS.feedback).toBe(0);
    expect(DEFAULT_DELAY_SETTINGS.mix).toBe(0);
  });

  it('DEFAULT_LIMITER_SETTINGS has correct defaults', () => {
    expect(DEFAULT_LIMITER_SETTINGS.threshold).toBe(-1);
    expect(DEFAULT_LIMITER_SETTINGS.attack).toBe(1);
    expect(DEFAULT_LIMITER_SETTINGS.release).toBe(100);
  });

  it('buildEqMessage delegates to buildEffectsMessage', () => {
    const msg = buildEqMessage({ enabled: true, peakFreq: 1000 });
    expect(msg.type).toBe('_SSA_SET_EQ');
    expect(msg.enabled).toBe(true);
    expect(msg.peakFreq).toBe(1000);
  });
});

// ============================================
// Utility function helpers
// ============================================
describe('Utility functions', () => {
  it('clamp returns min when value below range', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('clamp returns max when value above range', () => {
    expect(clamp(200, 0, 100)).toBe(100);
  });

  it('clamp returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });

  it('lerp returns correct interpolated values', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('lerp clamps t to [0, 1]', () => {
    expect(lerp(0, 100, -1)).toBe(0);
    expect(lerp(0, 100, 2)).toBe(100);
  });

  it('remap converts between ranges', () => {
    expect(remap(50, 0, 100, 0, 1000)).toBe(500);
    expect(remap(0, 0, 100, -100, 100)).toBe(-100);
    expect(remap(100, 0, 100, -100, 100)).toBe(100);
  });

  it('calculateAverage returns correct average', () => {
    expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
    expect(calculateAverage([10])).toBe(10);
  });

  it('calculateAverage returns 0 for empty/null arrays', () => {
    expect(calculateAverage([])).toBe(0);
    expect(calculateAverage(null)).toBe(0);
    expect(calculateAverage(undefined)).toBe(0);
  });

  it('calculateStdDev returns correct standard deviation', () => {
    const data = [2, 4, 4, 4, 5, 7, 9, 9, 10, 10];
    const result = calculateStdDev(data);
    expect(result).toBeCloseTo(2.8, 1);
  });

  it('calculateStdDev returns 0 for small arrays', () => {
    expect(calculateStdDev([1])).toBe(0);
    expect(calculateStdDev([])).toBe(0);
    expect(calculateStdDev(null)).toBe(0);
  });

  it('formatRms formats with correct decimals', () => {
    expect(formatRms(0.12345, 3)).toBe('0.123');
    expect(formatRms(0.5, 2)).toBe('0.50');
    expect(formatRms(0.9999, 4)).toBe('0.9999');
  });

  it('formatPercentage formats with % sign', () => {
    expect(formatPercentage(50)).toBe('50.0%');
    expect(formatPercentage(33.333, 2)).toBe('33.33%');
    expect(formatPercentage(100)).toBe('100.0%');
  });

  it('isAnomalous detects values above threshold', () => {
    expect(isAnomalous(80, 50, 'above')).toBe(true);
    expect(isAnomalous(30, 50, 'above')).toBe(false);
    expect(isAnomalous(50, 50, 'above')).toBe(false);
  });

  it('isAnomalous detects values below threshold', () => {
    expect(isAnomalous(20, 50, 'below')).toBe(true);
    expect(isAnomalous(80, 50, 'below')).toBe(false);
    expect(isAnomalous(50, 50, 'below')).toBe(false);
  });

  it('isAnomalous defaults to above direction', () => {
    expect(isAnomalous(80, 50)).toBe(true);
  });

  it('calculateBandRatioDb returns correct dB ratio', () => {
    expect(calculateBandRatioDb(1, 1)).toBe(0);
    expect(calculateBandRatioDb(10, 1)).toBeCloseTo(10, 1);
    expect(calculateBandRatioDb(1, 10)).toBeCloseTo(-10, 1);
  });

  it('calculateBandRatioDb returns -Infinity for zero denominator', () => {
    expect(calculateBandRatioDb(1, 0)).toBe(-Infinity);
    expect(calculateBandRatioDb(1, -1)).toBe(-Infinity);
  });

  it('generateMessageId returns unique IDs', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    expect(id1).toMatch(/^msg_\d+_[a-z0-9]{6}$/);
    expect(id1).not.toBe(id2);
  });
});
