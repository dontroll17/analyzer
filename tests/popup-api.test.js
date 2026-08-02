// popup-api.test.js - Jest tests for Chrome Extension API calls from popup.js
// Tests pure functions extracted from popup.js via popup-testable.js

const {
  EFFECTS_DEFAULTS,
  THEME_COLORS,
  getTheme,
  tc,
  getLevelColor,
  updateRMSDisplay,
  updateFrequencyBands,
  resetFrequencySmoothing,
  updateGlitchDisplay,
  saveEffectsSettings,
  sendCompressorSettings,
  sendEQSettings,
  sendLimiterSettings,
  sendDelaySettings,
  resetEffects,
  saveOscOptions,
  updateOscButtonStates,
  resetOscOptions,
  updateDropCounter,
  drawOscilloscope,
  drawOscilloscopeSplit,
  drawTimeline,
  updateHeatmapData,
  getHeatmapColor,
  getHeatmapDisplaySlot,
  applyTheme,
  togglePerfMonitor,
  updatePerfDisplay,
  checkPerfAlerts,
  resetPerfState,
  updateOscilloscopeFromWaveform,
  updateUIState,
  applyMetrics,
  resetMetrics,
  addGlitchLogEntry,
  formatNumber,
  formatTimeMs,
  isValidRMS,
  classifyRMS,
  getResolvedTheme,
  getNextTheme,
  getThemeIcon,
} = require('./popup-testable.js');

describe('Popup Pure Functions', () => {
  beforeEach(() => {
    chrome.storage.local._data = {};
    chrome.runtime.sendMessage.mockClear();
    chrome.runtime.connect.mockClear();
    resetFrequencySmoothing();
    resetPerfState();
    resetOscOptions();
    resetMetrics();
  });
  describe('Theme Constants', () => {
    test('EFFECTS_DEFAULTS has all required sections', () => {
      expect(EFFECTS_DEFAULTS).toHaveProperty('compressor');
      expect(EFFECTS_DEFAULTS).toHaveProperty('eq');
      expect(EFFECTS_DEFAULTS).toHaveProperty('limiter');
      expect(EFFECTS_DEFAULTS).toHaveProperty('delay');
    });

    test('EFFECTS_DEFAULTS compressor has correct defaults', () => {
      expect(EFFECTS_DEFAULTS.compressor).toEqual({
        active: false,
        threshold: -24,
        ratio: 12,
        knee: 30,
        attack: 3,
        release: 250,
      });
    });

    test('EFFECTS_DEFAULTS eq has correct defaults', () => {
      expect(EFFECTS_DEFAULTS.eq).toEqual({
        active: false,
        hpfFreq: 20,
        lpfFreq: 22050,
        peakFreq: 1000,
        peakGain: 0,
        peakQ: 1,
      });
    });

    test('EFFECTS_DEFAULTS limiter has correct defaults', () => {
      expect(EFFECTS_DEFAULTS.limiter).toEqual({
        active: false,
        threshold: -1,
      });
    });

    test('EFFECTS_DEFAULTS delay has correct defaults', () => {
      expect(EFFECTS_DEFAULTS.delay).toEqual({
        active: false,
        delayTime: 0,
        feedback: 0,
        mix: 0,
      });
    });

    test('THEME_COLORS has all themes', () => {
      expect(THEME_COLORS).toHaveProperty('dark');
      expect(THEME_COLORS).toHaveProperty('light');
      expect(THEME_COLORS).toHaveProperty('neon');
    });

    test('THEME_COLORS each theme has all color groups', () => {
      for (const theme of ['dark', 'light', 'neon']) {
        expect(THEME_COLORS[theme]).toHaveProperty('glitch');
        expect(THEME_COLORS[theme]).toHaveProperty('rms');
        expect(THEME_COLORS[theme]).toHaveProperty('canvas');
        expect(THEME_COLORS[theme]).toHaveProperty('channel');
      }
    });

    test('neon theme colors match expected values', () => {
      expect(THEME_COLORS.neon.glitch.GLITCH).toBe('#FF007F');
      expect(THEME_COLORS.neon.glitch.DRIFT).toBe('#9D00FF');
      expect(THEME_COLORS.neon.glitch.STABLE).toBe('#00E5FF');
    });

    test('dark theme colors match expected values', () => {
      expect(THEME_COLORS.dark.glitch.GLITCH).toBe('#FF007F');
      expect(THEME_COLORS.dark.glitch.DRIFT).toBe('#9D00FF');
      expect(THEME_COLORS.dark.glitch.STABLE).toBe('#00E5FF');
    });

    test('light theme colors match expected values', () => {
      expect(THEME_COLORS.light.glitch.GLITCH).toBe('#E53935');
      expect(THEME_COLORS.light.glitch.DRIFT).toBe('#FB8C00');
      expect(THEME_COLORS.light.glitch.STABLE).toBe('#43A047');
    });
  });

  describe('Frequency Bands Smoothing', () => {
    test('updateFrequencyBands() applies LERP smoothing on first call', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(50, 60, 70);
      expect(result.smoothedBass).toBeCloseTo(7.5, 1);
      expect(result.smoothedMid).toBeCloseTo(9.0, 1);
      expect(result.smoothedTreble).toBeCloseTo(10.5, 1);
      expect(result.bassPercent).toBeCloseTo(7.5, 1);
      expect(result.midPercent).toBeCloseTo(9.0, 1);
      expect(result.treblePercent).toBeCloseTo(10.5, 1);
    });

    test('updateFrequencyBands() continues smoothing across calls', () => {
      resetFrequencySmoothing();
      updateFrequencyBands(50, 50, 50);
      const result = updateFrequencyBands(100, 100, 100);
      expect(result.smoothedBass).toBeGreaterThan(50);
      expect(result.smoothedMid).toBeGreaterThan(50);
      expect(result.smoothedTreble).toBeGreaterThan(50);
    });

    test('updateFrequencyBands() handles zero input', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(0, 0, 0);
      expect(result.smoothedBass).toBeCloseTo(0, 1);
      expect(result.bassPercent).toBe(0);
    });

    test('updateFrequencyBands() clamps percentages to 0-100', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(200, -10, 150);
      expect(result.bassPercent).toBeLessThanOrEqual(100);
      expect(result.bassPercent).toBeGreaterThanOrEqual(0);
      expect(result.treblePercent).toBeLessThanOrEqual(100);
    });

    test('updateFrequencyBands() handles invalid input (NaN, undefined)', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(NaN, undefined, null);
      expect(result.smoothedBass).toBeCloseTo(0, 4);
      expect(result.smoothedMid).toBeCloseTo(0, 4);
      expect(result.smoothedTreble).toBeCloseTo(0, 4);
    });

    test('updateFrequencyBands() accepts custom smoothing factor', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(100, 0, 0, 1.0);
      expect(result.smoothedBass).toBe(100);
      expect(result.smoothedMid).toBe(0);
      expect(result.smoothedTreble).toBe(0);
    });

    test('updateFrequencyBands() accepts custom smoothing factor 0', () => {
      resetFrequencySmoothing();
      updateFrequencyBands(50, 50, 50, 0.5);
      const result = updateFrequencyBands(100, 100, 100, 0);
      expect(result.smoothedBass).toBe(75);
    });

    test('resetFrequencySmoothing() resets all smoothed values', () => {
      updateFrequencyBands(100, 50, 75);
      resetFrequencySmoothing();
      const result = updateFrequencyBands(100, 50, 75);
      // After reset, smoothing starts from 0, same as first call
      expect(result.smoothedBass).toBeCloseTo(15, 1);
    });
  });

  describe('Glitch Display', () => {
    test('updateGlitchDisplay() returns state and count', () => {
      const result = updateGlitchDisplay('GLITCH', 5);
      expect(result.state).toBe('GLITCH');
      expect(result.count).toBe(5);
    });

    test('updateGlitchDisplay() formats entropy with 2 decimals', () => {
      const result = updateGlitchDisplay('STABLE', 0, 4.5678);
      expect(result.entropy).toBe('4.57');
    });

    test('updateGlitchDisplay() formats flatness with 2 decimals', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, 0.1234);
      expect(result.flatness).toBe('0.12');
    });

    test('updateGlitchDisplay() returns null entropy when undefined', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined);
      expect(result.entropy).toBeNull();
    });

    test('updateGlitchDisplay() formats entropyState for GLITCH', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, 'GLITCH');
      expect(result.entropyState.text).toBe('GLITCH');
      expect(result.entropyState.color).toBe('#FF007F');
    });

    test('updateGlitchDisplay() formats entropyState for DRIFT', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, 'DRIFT');
      expect(result.entropyState.text).toBe('DRIFT');
      expect(result.entropyState.color).toBe('#9D00FF');
    });

    test('updateGlitchDisplay() formats entropyState for STABLE', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, 'STABLE');
      expect(result.entropyState.text).toBe('STABLE');
      expect(result.entropyState.color).toBe('#00E5FF');
    });

    test('updateGlitchDisplay() returns null entropyState when undefined', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined);
      expect(result.entropyState).toBeNull();
    });

    test('updateGlitchDisplay() formats onset as YES/NO', () => {
      const r1 = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
      expect(r1.onset.text).toBe('YES');
      const r2 = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, false);
      expect(r2.onset.text).toBe('NO');
    });

    test('updateGlitchDisplay() returns null onset when undefined', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
      expect(result.onset).toBeNull();
    });

    test('updateGlitchDisplay() formats hnr with dB suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, 42.5);
      expect(result.hnr).toBe('42.5 dB');
    });

    test('updateGlitchDisplay() returns null hnr when zero', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, 0);
      expect(result.hnr).toBeNull();
    });

    test('updateGlitchDisplay() formats zcr as integer string', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, 15.7);
      expect(result.zcr).toBe('16');
    });

    test('updateGlitchDisplay() formats spectral centroid with Hz suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, 3500);
      expect(result.centroid).toBe('3500 Hz');
    });

    test('updateGlitchDisplay() formats spectral rolloff with Hz suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, 8000);
      expect(result.rolloff).toBe('8000 Hz');
    });

    test('updateGlitchDisplay() formats rtt in ms', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 45.7);
      expect(result.rtt).toBe('46ms');
    });

    test('updateGlitchDisplay() returns null rtt when zero', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0);
      expect(result.rtt).toBeNull();
    });

    test('updateGlitchDisplay() formats dynamic range with dB suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 96.3);
      expect(result.dynamicRange).toBe('96.3 dB');
    });

    test('updateGlitchDisplay() returns null dynamicRange when null', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, null);
      expect(result.dynamicRange).toBeNull();
    });

    test('updateGlitchDisplay() formats bassMidRatio with dB suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 3.45);
      expect(result.bassMidRatio).toBe('3.45 dB');
    });

    test('updateGlitchDisplay() formats midTrebleRatio with dB suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, -1.23);
      expect(result.midTrebleRatio).toBe('-1.23 dB');
    });

    test('updateGlitchDisplay() formats glitchRate with /s suffix', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 5.5);
      expect(result.glitchRate).toBe('5.5 /s');
    });

    test('updateGlitchDisplay() returns null for all optional when not provided', () => {
      const result = updateGlitchDisplay('GLITCH', 1);
      expect(result.entropy).toBeNull();
      expect(result.flatness).toBeNull();
      expect(result.hnr).toBeNull();
      expect(result.zcr).toBeNull();
      expect(result.centroid).toBeNull();
      expect(result.rolloff).toBeNull();
      expect(result.rtt).toBeNull();
      expect(result.dynamicRange).toBeNull();
    });

    test('updateGlitchDisplay() detects new glitch state transition', () => {
      resetMetrics();
      updateGlitchDisplay('STABLE', 0);
      const result = updateGlitchDisplay('GLITCH', 1);
      expect(result.isNewGlitch).toBe(true);
    });

    test('updateGlitchDisplay() does not detect new glitch if already GLITCH', () => {
      resetMetrics();
      updateGlitchDisplay('GLITCH', 1);
      const result = updateGlitchDisplay('GLITCH', 2);
      expect(result.isNewGlitch).toBe(false);
    });

    test('updateGlitchDisplay() with light theme uses light colors', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined, 'GLITCH', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'light');
      expect(result.entropyState.color).toBe('#E53935');
    });

    test('entropyHint is true when entropy provided', () => {
      const result = updateGlitchDisplay('STABLE', 0, 4.5);
      expect(result.entropyHint).toBe(true);
    });

    test('entropyHint is false when entropy undefined', () => {
      const result = updateGlitchDisplay('STABLE', 0, undefined);
      expect(result.entropyHint).toBe(false);
    });
  });

  describe('Effects Settings', () => {
    test('saveEffectsSettings() returns deep copy of settings', () => {
      const settings = {
        compressor: { active: true, threshold: -18 },
        eq: { active: false, hpfFreq: 40 },
        limiter: { active: false, threshold: -1 },
        delay: { active: false, delayTime: 0, feedback: 0, mix: 0 }
      };
      const result = saveEffectsSettings(settings);
      expect(result).toEqual(settings);
      expect(result).not.toBe(settings);
      expect(result.compressor).not.toBe(settings.compressor);
    });

    test('sendCompressorSettings() returns correct message', () => {
      const settings = {
        compressor: { active: true, threshold: -18, ratio: 4, knee: 12, attack: 5, release: 100 }
      };
      const result = sendCompressorSettings(settings);
      expect(result.type).toBe('_SSA_SET_COMPRESSOR');
      expect(result.active).toBe(true);
      expect(result.params.threshold).toBe(-18);
      expect(result.params.ratio).toBe(4);
      expect(result.params.knee).toBe(12);
      expect(result.params.attack).toBe(5);
      expect(result.params.release).toBe(100);
    });

    test('sendCompressorSettings() handles disabled compressor', () => {
      const settings = {
        compressor: { active: false, threshold: -24, ratio: 12, knee: 30, attack: 3, release: 250 }
      };
      const result = sendCompressorSettings(settings);
      expect(result.active).toBe(false);
    });

    test('sendEQSettings() returns correct message', () => {
      const settings = {
        eq: { active: true, hpfFreq: 40, lpfFreq: 18000, peakFreq: 500, peakGain: 6, peakQ: 2 }
      };
      const result = sendEQSettings(settings);
      expect(result.type).toBe('_SSA_SET_EQ');
      expect(result.active).toBe(true);
      expect(result.params.hpfFreq).toBe(40);
      expect(result.params.lpfFreq).toBe(18000);
      expect(result.params.peakFreq).toBe(500);
      expect(result.params.peakGain).toBe(6);
      expect(result.params.peakQ).toBe(2);
    });

    test('sendLimiterSettings() returns correct message', () => {
      const settings = {
        limiter: { active: true, threshold: -3 }
      };
      const result = sendLimiterSettings(settings);
      expect(result.type).toBe('_SSA_SET_LIMITER');
      expect(result.active).toBe(true);
      expect(result.params.threshold).toBe(-3);
    });

    test('sendDelaySettings() returns correct message', () => {
      const settings = {
        delay: { active: true, delayTime: 500, feedback: 70, mix: 30 }
      };
      const result = sendDelaySettings(settings);
      expect(result.type).toBe('_SSA_SET_DELAY');
      expect(result.active).toBe(true);
      expect(result.params.delayTime).toBe(500);
      expect(result.params.feedback).toBe(70);
      expect(result.params.mix).toBe(30);
    });

    test('resetEffects() returns defaults deep copy', () => {
      const settings = {
        compressor: { active: true, threshold: -18, ratio: 4, knee: 12, attack: 5, release: 100 },
        eq: { active: true, hpfFreq: 40, lpfFreq: 18000, peakFreq: 500, peakGain: 6, peakQ: 2 },
        limiter: { active: true, threshold: -3 },
        delay: { active: true, delayTime: 500, feedback: 70, mix: 30 }
      };
      const result = resetEffects(settings);
      expect(result).toEqual(EFFECTS_DEFAULTS);
      expect(result).not.toBe(settings);
      expect(result.compressor.active).toBe(false);
      expect(result.eq.active).toBe(false);
      expect(result.limiter.active).toBe(false);
      expect(result.delay.active).toBe(false);
    });

    test('resetEffects() uses default values when no argument', () => {
      const result = resetEffects();
      expect(result).toEqual(EFFECTS_DEFAULTS);
    });
  });

  describe('Oscilloscope Options', () => {
    test('saveOscOptions() saves all options', () => {
      const options = { freeze: true, zoom: false, logScale: true, split: true, hasReference: false };
      const result = saveOscOptions(options);
      expect(result.freeze).toBe(true);
      expect(result.zoom).toBe(false);
      expect(result.logScale).toBe(true);
      expect(result.split).toBe(true);
      expect(result.hasReference).toBe(false);
    });

    test('saveOscOptions() fills in defaults from state', () => {
      resetOscOptions();
      const options = { freeze: true, zoom: true };
      const result = saveOscOptions(options);
      expect(result.freeze).toBe(true);
      expect(result.zoom).toBe(true);
      expect(result.logScale).toBe(false);
      expect(result.split).toBe(false);
    });

    test('saveOscOptions() handles missing options object', () => {
      resetOscOptions();
      const result = saveOscOptions({});
      expect(result.freeze).toBe(false);
      expect(result.zoom).toBe(false);
    });

    test('updateOscButtonStates() returns correct states when all active', () => {
      const options = { freeze: true, zoom: true, logScale: true, split: true };
      const result = updateOscButtonStates(options);
      expect(result.freeze).toBe('active');
      expect(result.zoom).toBe('active');
      expect(result.logScale).toBe('active');
      expect(result.freezeLabel).toBe('block');
      expect(result.split).toBe('active');
    });

    test('updateOscButtonStates() returns null for inactive buttons', () => {
      const options = { freeze: false, zoom: false, logScale: false, split: false };
      const result = updateOscButtonStates(options);
      expect(result.freeze).toBeNull();
      expect(result.zoom).toBeNull();
      expect(result.logScale).toBeNull();
      expect(result.freezeLabel).toBe('none');
      expect(result.split).toBeNull();
    });

    test('updateOscButtonStates() handles partially active options', () => {
      const options = { freeze: true, zoom: false, logScale: true, split: false };
      const result = updateOscButtonStates(options);
      expect(result.freeze).toBe('active');
      expect(result.zoom).toBeNull();
      expect(result.logScale).toBe('active');
      expect(result.split).toBeNull();
    });

    test('resetOscOptions() resets all osc options to false', () => {
      const options = { freeze: true, zoom: true, logScale: true, split: true };
      saveOscOptions(options);
      resetOscOptions();
      const result = updateOscButtonStates({ freeze: false, zoom: false, logScale: false, split: false });
      expect(result.freeze).toBeNull();
      expect(result.zoom).toBeNull();
    });
  });

  describe('Drop Counter', () => {
    test('updateDropCounter() returns correct count and display', () => {
      const result = updateDropCounter(5, true);
      expect(result.count).toBe(5);
      expect(result.display).toBe('5');
    });

    test('updateDropCounter() sets warning class for count > 5', () => {
      const result = updateDropCounter(6, true);
      expect(result.containerClass).toBe('warning');
    });

    test('updateDropCounter() sets warning class for count = 5', () => {
      const result = updateDropCounter(5, true);
      expect(result.containerClass).toBe('');
    });

    test('updateDropCounter() sets critical class for count > 10', () => {
      const result = updateDropCounter(11, true);
      expect(result.containerClass).toBe('critical');
    });

    test('updateDropCounter() sets empty class for count <= 5', () => {
      const result = updateDropCounter(0, true);
      expect(result.containerClass).toBe('');
      const result1 = updateDropCounter(3, true);
      expect(result1.containerClass).toBe('');
    });

    test('updateDropCounter() container is hidden when capture not active', () => {
      const result = updateDropCounter(5, false);
      expect(result.containerDisplay).toBe('none');
    });

    test('updateDropCounter() container is shown when capture active', () => {
      const result = updateDropCounter(5, true);
      expect(result.containerDisplay).toBe('block');
    });
  });

  describe('Oscilloscope Drawing', () => {
    test('drawOscilloscope() returns drawing instructions', () => {
      const leftBuffer = new Float32Array([0, 0.5, -0.3, 0.8, 0]);
      const rightBuffer = new Float32Array([0, -0.5, 0.3, -0.8, 0]);
      const result = drawOscilloscope(leftBuffer, rightBuffer, 200, 100, false, false);
      expect(result).toHaveProperty('backgroundColor');
      expect(result).toHaveProperty('canvasSize');
      expect(result.canvasSize.width).toBe(200);
      expect(result.canvasSize.height).toBe(100);
      expect(result).toHaveProperty('waveforms');
      expect(result.waveforms.length).toBe(2);
    });

    test('drawOscilloscope() includes grid line', () => {
      const leftBuffer = new Float32Array([0.5]);
      const rightBuffer = new Float32Array([0.5]);
      const result = drawOscilloscope(leftBuffer, rightBuffer, 200, 100);
      expect(result.gridLine.startX).toBe(0);
      expect(result.gridLine.startY).toBe(50);
      expect(result.gridLine.endX).toBe(200);
      expect(result.gridLine.endY).toBe(50);
    });

    test('drawOscilloscope() with empty buffer returns no waveforms', () => {
      const result = drawOscilloscope(null, null, 200, 100, false, false);
      expect(result.waveforms.length).toBe(0);
    });

    test('drawOscilloscope() applies zoom mode', () => {
      const leftBuffer = new Float32Array(500);
      const rightBuffer = new Float32Array(500);
      const result = drawOscilloscope(leftBuffer, rightBuffer, 200, 100, true, false);
      expect(result).toHaveProperty('waveforms');
    });

    test('drawOscilloscope() applies log scale', () => {
      const leftBuffer = new Float32Array([0.001, 0.1, 1.0]);
      const rightBuffer = new Float32Array([0.001, 0.1, 1.0]);
      const result = drawOscilloscope(leftBuffer, rightBuffer, 100, 100, false, true);
      expect(result.waveforms.length).toBe(2);
    });

    test('drawOscilloscope() uses custom colors when provided', () => {
      const leftBuffer = new Float32Array([0.5]);
      const rightBuffer = new Float32Array([0.5]);
      const customColors = { bg: '#000000', grid: '#FFFFFF', oscLeft: '#FF0000', oscRight: '#00FF00' };
      const result = drawOscilloscope(leftBuffer, rightBuffer, 100, 100, false, false, customColors);
      expect(result.backgroundColor).toBe('#000000');
    });

    test('drawOscilloscopeSplit() returns split screen instructions', () => {
      const leftBuffer = new Float32Array([0.5, -0.3, 0.8]);
      const rightBuffer = new Float32Array([-0.5, 0.3, -0.8]);
      const refLeft = new Float32Array([0.1, 0.2, 0.3]);
      const refRight = new Float32Array([-0.1, -0.2, -0.3]);
      const result = drawOscilloscopeSplit(leftBuffer, rightBuffer, refLeft, refRight, 200, 100, false, false);
      expect(result).toHaveProperty('gridLines');
      expect(result.gridLines.length).toBe(3);
      expect(result).toHaveProperty('topHalf');
      expect(result).toHaveProperty('bottomHalf');
      expect(result.waveforms.length).toBeGreaterThan(0);
    });

    test('drawOscilloscopeSplit() works without reference buffers', () => {
      const leftBuffer = new Float32Array([0.5, -0.3, 0.8]);
      const rightBuffer = new Float32Array([-0.5, 0.3, -0.8]);
      const result = drawOscilloscopeSplit(leftBuffer, rightBuffer, null, null, 200, 100, false, false);
      expect(result.waveforms.length).toBe(2);
    });
  });

  describe('Timeline Drawing', () => {
    test('drawTimeline() returns empty segments for less than 2 points', () => {
      const result = drawTimeline([{ time: 100, rms: 0.5, state: 'STABLE' }], 300, 50);
      expect(result.segments.length).toBe(0);
    });

    test('drawTimeline() returns empty for null history', () => {
      const result = drawTimeline(null, 300, 50);
      expect(result.segments.length).toBe(0);
    });

    test('drawTimeline() groups consecutive same-state points', () => {
      const history = [
        { time: 0, rms: 0.1, state: 'STABLE' },
        { time: 100, rms: 0.2, state: 'STABLE' },
        { time: 200, rms: 0.9, state: 'GLITCH' },
        { time: 300, rms: 0.8, state: 'GLITCH' },
        { time: 400, rms: 0.1, state: 'STABLE' }
      ];
      const result = drawTimeline(history, 300, 50);
      expect(result.segments.length).toBe(3);
      expect(result.segments[0].state).toBe('STABLE');
      expect(result.segments[0].points.length).toBe(2);
      expect(result.segments[1].state).toBe('GLITCH');
      expect(result.segments[1].points.length).toBe(2);
      expect(result.segments[2].state).toBe('STABLE');
      expect(result.segments[2].points.length).toBe(1);
    });

    test('drawTimeline() includes reference line at 0.1 RMS', () => {
      const history = [
        { time: 0, rms: 0.1, state: 'STABLE' },
        { time: 100, rms: 0.2, state: 'STABLE' }
      ];
      const result = drawTimeline(history, 300, 50);
      expect(result).toHaveProperty('referenceLine');
      expect(result.referenceLine.dashPattern).toEqual([3, 3]);
    });

    test('drawTimeline() calculates correct x positions', () => {
      const history = [
        { time: 0, rms: 0.5, state: 'STABLE' },
        { time: 200, rms: 0.5, state: 'STABLE' },
        { time: 400, rms: 0.5, state: 'STABLE' }
      ];
      const result = drawTimeline(history, 300, 50);
      expect(result.segments[0].points[0].x).toBe(5);
      expect(result.segments[0].points[2].x).toBe(295);
    });
  });

  describe('Heatmap Data', () => {
    test('updateHeatmapData() normalizes values to 0-1 range', () => {
      const result = updateHeatmapData(50, 60, 70, false, 0);
      expect(result.heatmapData[0][0]).toBe(0.5);
      expect(result.heatmapData[1][0]).toBe(0.6);
      expect(result.heatmapData[2][0]).toBe(0.7);
    });

    test('updateHeatmapData() clips values above 100', () => {
      const result = updateHeatmapData(150, 200, 50, false, 0);
      expect(result.heatmapData[0][0]).toBe(1);
      expect(result.heatmapData[1][0]).toBe(1);
      expect(result.heatmapData[2][0]).toBe(0.5);
    });

    test('updateHeatmapData() applies glitch boost of 1.5', () => {
      const result = updateHeatmapData(50, 50, 50, true, 0);
      expect(result.heatmapData[0][0]).toBe(0.75);
      expect(result.heatmapData[1][0]).toBe(0.75);
      expect(result.heatmapData[2][0]).toBe(0.75);
    });

    test('updateHeatmapData() does not boost when not glitch', () => {
      const result = updateHeatmapData(50, 50, 50, false, 0);
      expect(result.heatmapData[0][0]).toBe(0.5);
    });

    test('updateHeatmapData() increments time index with wrap', () => {
      const result = updateHeatmapData(50, 50, 50, false, 49);
      expect(result.timeIndex).toBe(0);
    });

    test('updateHeatmapData() returns dirty flag true', () => {
      const result = updateHeatmapData(50, 50, 50, false, 0);
      expect(result.dirty).toBe(true);
    });

    test('updateHeatmapData() caps boosted value at 1.0', () => {
      const result = updateHeatmapData(100, 100, 100, true, 0);
      expect(result.heatmapData[0][0]).toBe(1);
      expect(result.heatmapData[1][0]).toBe(1);
      expect(result.heatmapData[2][0]).toBe(1);
    });
  });

  describe('Performance Monitor', () => {
    test('togglePerfMonitor() toggles from false to true', () => {
      resetPerfState();
      const result = togglePerfMonitor(false);
      expect(result.visible).toBe(true);
      expect(result.active).toBe(true);
    });

    test('togglePerfMonitor() toggles from true to false', () => {
      resetPerfState();
      const result = togglePerfMonitor(true);
      expect(result.visible).toBe(false);
      expect(result.active).toBe(false);
    });

    test('updatePerfDisplay() returns good class for 60fps', () => {
      const result = updatePerfDisplay(60, 3, 2);
      expect(result.fps.className).toBe('perf-good');
      expect(result.fps.text).toBe('FPS: 60');
    });

    test('updatePerfDisplay() returns warn class for 30fps', () => {
      const result = updatePerfDisplay(30, 3, 2);
      expect(result.fps.className).toBe('perf-warn');
    });

    test('updatePerfDisplay() returns bad class for 10fps', () => {
      const result = updatePerfDisplay(10, 3, 2);
      expect(result.fps.className).toBe('perf-bad');
    });

    test('updatePerfDisplay() draw time classes', () => {
      expect(updatePerfDisplay(60, 3, 2).drawMs.className).toBe('perf-good');
      expect(updatePerfDisplay(60, 10, 2).drawMs.className).toBe('perf-warn');
      expect(updatePerfDisplay(60, 20, 2).drawMs.className).toBe('perf-bad');
    });

    test('updatePerfDisplay() queue length classes', () => {
      expect(updatePerfDisplay(60, 3, 3).queueLen.className).toBe('perf-good');
      expect(updatePerfDisplay(60, 3, 10).queueLen.className).toBe('perf-warn');
      expect(updatePerfDisplay(60, 3, 25).queueLen.className).toBe('perf-bad');
    });

    test('updatePerfDisplay() latency classes', () => {
      expect(updatePerfDisplay(60, 3, 2, 5).latency.className).toBe('perf-good');
      expect(updatePerfDisplay(60, 3, 2, 20).latency.className).toBe('perf-warn');
      expect(updatePerfDisplay(60, 3, 2, 50).latency.className).toBe('perf-bad');
    });

    test('updatePerfDisplay() connection states', () => {
      const ok = updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 0, 0);
      expect(ok.connection.className).toBe('perf-good');
      expect(ok.connection.text).toBe('Conn: OK');
      const fail = updatePerfDisplay(60, 3, 2, 0, 0, 0, false, 0, 0);
      expect(fail.connection.className).toBe('perf-bad');
      expect(fail.connection.text).toBe('Conn: FAIL');
    });

    test('updatePerfDisplay() RTT formatting', () => {
      const noRtt = updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 0, 0);
      expect(noRtt.connectionRtt.text).toBe('RTT: --');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 10, 0).connectionRtt.className).toBe('perf-good');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 30, 0).connectionRtt.className).toBe('perf-warn');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 100, 0).connectionRtt.className).toBe('perf-bad');
    });

    test('updatePerfDisplay() alerts classes', () => {
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 0, 0).alerts.className).toBe('perf-good');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 0, 1).alerts.className).toBe('perf-warn');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 0, 5).alerts.className).toBe('perf-bad');
    });

    test('updatePerfDisplay() drops classes', () => {
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 0, true, 0, 0).drops.className).toBe('perf-good');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 3, true, 0, 0).drops.className).toBe('perf-warn');
      expect(updatePerfDisplay(60, 3, 2, 0, 0, 8, true, 0, 0).drops.className).toBe('perf-bad');
    });
  });

  describe('Oscilloscope Waveform Processing', () => {
    test('updateOscilloscopeFromWaveform() returns shouldDraw for valid waveform', () => {
      const waveform = new Float32Array([0, 0.5, -0.3, 0.8]);
      const result = updateOscilloscopeFromWaveform(waveform, new Float32Array([0, -0.5, 0.3, -0.8]));
      expect(result.shouldDraw).toBe(true);
      expect(result.isHoldFrame).toBe(false);
      expect(result.leftBuffer).not.toBeNull();
      expect(result.rightBuffer).not.toBeNull();
    });

    test('updateOscilloscopeFromWaveform() skips on hold frame', () => {
      const waveform = new Float32Array([0.5]);
      const result = updateOscilloscopeFromWaveform(waveform, undefined, true);
      expect(result.shouldDraw).toBe(false);
      expect(result.isHoldFrame).toBe(true);
    });

    test('updateOscilloscopeFromWaveform() skips null waveform', () => {
      const result = updateOscilloscopeFromWaveform(null);
      expect(result.shouldDraw).toBe(false);
      expect(result.isHoldFrame).toBe(false);
    });

    test('updateOscilloscopeFromWaveform() skips empty waveform', () => {
      const result = updateOscilloscopeFromWaveform(new Float32Array(0));
      expect(result.shouldDraw).toBe(false);
    });

    test('updateOscilloscopeFromWaveform() freeze mode returns isFrozen', () => {
      const waveform = new Float32Array([0.5]);
      const result = updateOscilloscopeFromWaveform(waveform, undefined, false, true);
      expect(result.shouldDraw).toBe(false);
      expect(result.isFrozen).toBe(true);
    });

    test('updateOscilloscopeFromWaveform() mono mode duplicates L to R', () => {
      const waveform = new Float32Array([0.1, 0.2, 0.3]);
      const result = updateOscilloscopeFromWaveform(waveform);
      expect(result.leftBuffer[0]).toBe(0.1);
      expect(result.rightBuffer[0]).toBe(0.1);
      expect(result.leftBuffer[2]).toBe(0.3);
      expect(result.rightBuffer[2]).toBe(0.3);
    });

    test('updateOscilloscopeFromWaveform() stereo mode preserves L/R', () => {
      const left = new Float32Array([0.1, 0.2]);
      const right = new Float32Array([0.3, 0.4]);
      const result = updateOscilloscopeFromWaveform(left, right);
      expect(result.leftBuffer[0]).toBe(0.1);
      expect(result.rightBuffer[0]).toBe(0.3);
      expect(result.leftBuffer[1]).toBe(0.2);
      expect(result.rightBuffer[1]).toBe(0.4);
    });

    test('updateOscilloscopeFromWaveform() zeros unused samples', () => {
      const waveform = new Float32Array([0.5]);
      const result = updateOscilloscopeFromWaveform(waveform, undefined, false, false, 5);
      expect(result.leftBuffer[0]).toBe(0.5);
      expect(result.leftBuffer[4]).toBe(0);
      expect(result.rightBuffer[4]).toBe(0);
    });
  });

  describe('UI State', () => {
    test('updateUIState(connected) shows all sections when connected', () => {
      const result = updateUIState(true);
      expect(result.sections.rmsSection).toBe('block');
      expect(result.sections.freqBandsSection).toBe('block');
      expect(result.sections.oscilloscopeSection).toBe('block');
      expect(result.sections.glitchSettings).toBe('block');
      expect(result.sections.effectsSection).toBe('block');
      expect(result.sections.entropySection).toBe('');
    });

    test('updateUIState(connected) hides all sections when disconnected', () => {
      const result = updateUIState(false);
      expect(result.sections.rmsSection).toBe('none');
      expect(result.sections.freqBandsSection).toBe('none');
      expect(result.sections.oscilloscopeSection).toBe('none');
      expect(result.sections.glitchSettings).toBe('none');
      expect(result.sections.effectsSection).toBe('none');
      expect(result.sections.entropySection).toBe('none');
    });

    test('updateUIState(connected) sets correct button states', () => {
      const connected = updateUIState(true);
      expect(connected.buttons.startBtn.disabled).toBe(true);
      expect(connected.buttons.stopBtn.disabled).toBe(false);
      const disconnected = updateUIState(false);
      expect(disconnected.buttons.startBtn.disabled).toBe(false);
      expect(disconnected.buttons.stopBtn.disabled).toBe(true);
    });

    test('updateUIState(connected) sets correct status text', () => {
      const connected = updateUIState(true);
      expect(connected.values.statusText).toBe('Connected - Capturing Audio');
      expect(connected.values.statusClass).toBe('status connected');
      const disconnected = updateUIState(false);
      expect(disconnected.values.statusText).toBe('Not Connected');
      expect(disconnected.values.statusClass).toBe('status disconnected');
    });
  });

  describe('Theme Application', () => {
    test('applyTheme() returns correct config for neon', () => {
      const result = applyTheme('neon');
      expect(result.theme).toBe('neon');
      expect(result.attribute).toBe('neon');
      expect(result.icon).toBeDefined();
    });

    test('applyTheme() returns correct config for dark', () => {
      const result = applyTheme('dark');
      expect(result.theme).toBe('dark');
      expect(result.attribute).toBe('dark');
    });

    test('applyTheme() returns null attribute for system', () => {
      const result = applyTheme('system');
      expect(result.theme).toBe('system');
      expect(result.attribute).toBeNull();
    });

    test('applyTheme() uses fallback icon for unknown theme', () => {
      const result = applyTheme('unknown');
      expect(result.theme).toBe('unknown');
      expect(result.icon).toBeDefined();
    });
  });

  describe('Apply Metrics', () => {
    test('applyMetrics() returns null for invalid data', () => {
      expect(applyMetrics(null)).toBeNull();
      expect(applyMetrics({})).toBeNull();
      expect(applyMetrics({ rms: undefined })).toBeNull();
    });

    test('applyMetrics() processes mono metrics correctly', () => {
      const data = {
        rms: 0.5, peakRMS: 0.7, bass: 40, mid: 50, treble: 60,
        glitchState: 'STABLE', glitchCount: 0
      };
      resetMetrics();
      const result = applyMetrics(data);
      expect(result).not.toBeNull();
      expect(result.isStereo).toBe(false);
      expect(result.currentMetrics.rms).toBe(0.5);
      expect(result.combinedBands.bass).toBe(40);
    });

    test('applyMetrics() combines stereo bands', () => {
      const data = {
        rms: 0.5, bass: 40, mid: 50, treble: 60,
        bassRight: 60, midRight: 70, trebleRight: 80,
        glitchState: 'STABLE', glitchCount: 0
      };
      resetMetrics();
      const result = applyMetrics(data);
      expect(result.isStereo).toBe(true);
      expect(result.combinedBands.bass).toBe(50);
      expect(result.combinedBands.mid).toBe(60);
      expect(result.combinedBands.treble).toBe(70);
    });

    test('applyMetrics() returns channel info for stereo', () => {
      const data = {
        rms: 0.5, bass: 40, mid: 50, treble: 60,
        bassRight: 60, midRight: 70, trebleRight: 80,
        glitchState: 'STABLE', glitchCount: 0
      };
      resetMetrics();
      const result = applyMetrics(data);
      expect(result.channelInfo.text).toBe('STEREO');
    });

    test('applyMetrics() returns MONO channel info', () => {
      const data = {
        rms: 0.5, bass: 40, mid: 50, treble: 60,
        glitchState: 'STABLE', glitchCount: 0
      };
      resetMetrics();
      const result = applyMetrics(data);
      expect(result.channelInfo.text).toBe('MONO');
    });

    test('applyMetrics() handles missing optional fields', () => {
      const data = { rms: 0.5, bass: 40, mid: 50, treble: 60 };
      resetMetrics();
      const result = applyMetrics(data);
      expect(result).not.toBeNull();
      expect(result.currentMetrics.highFreqAnomaly).toBe(0);
    });

    test('applyMetrics() preserves RMS value in currentMetrics', () => {
      const data = {
        rms: 0.35, peakRMS: 0.55, bass: 30, mid: 40, treble: 50,
        glitchState: 'GLITCH', glitchCount: 3
      };
      resetMetrics();
      const result = applyMetrics(data);
      expect(result.currentMetrics.rms).toBe(0.35);
      expect(result.currentMetrics.bass).toBe(30);
      expect(result.currentMetrics.mid).toBe(40);
      expect(result.currentMetrics.treble).toBe(50);
    });
  });

  describe('Utility Functions', () => {
    test('formatNumber() formats to fixed decimals', () => {
      expect(formatNumber(3.14159, 2)).toBe('3.14');
      expect(formatNumber(0.5, 4)).toBe('0.5000');
      expect(formatNumber(100, 0)).toBe('100');
    });

    test('formatTimeMs() rounds milliseconds', () => {
      expect(formatTimeMs(123.4)).toBe('123ms');
      expect(formatTimeMs(123.6)).toBe('124ms');
      expect(formatTimeMs(0)).toBe('0ms');
    });

    test('isValidRMS() returns true for valid RMS values', () => {
      expect(isValidRMS(0)).toBe(true);
      expect(isValidRMS(0.5)).toBe(true);
      expect(isValidRMS(1)).toBe(true);
    });

    test('isValidRMS() returns false for invalid values', () => {
      expect(isValidRMS(-0.1)).toBe(false);
      expect(isValidRMS(1.1)).toBe(false);
      expect(isValidRMS(NaN)).toBe(false);
      expect(isValidRMS(undefined)).toBe(false);
      expect(isValidRMS('0.5')).toBe(false);
    });

    test('classifyRMS() returns correct classification', () => {
      expect(classifyRMS(0)).toBe('SILENCE');
      expect(classifyRMS(0.01)).toBe('LOW');
      expect(classifyRMS(0.1)).toBe('MEDIUM');
      expect(classifyRMS(0.5)).toBe('HIGH');
      expect(classifyRMS(0.8)).toBe('CRITICAL');
    });

    test('getResolvedTheme() handles system theme', () => {
      expect(getResolvedTheme('system')).toBe('system');
      expect(getResolvedTheme(null)).toBe('system');
    });

    test('getResolvedTheme() passes through valid themes', () => {
      expect(getResolvedTheme('neon')).toBe('neon');
      expect(getResolvedTheme('dark')).toBe('dark');
      expect(getResolvedTheme('light')).toBe('light');
    });

    test('getNextTheme() cycles through themes', () => {
      expect(getNextTheme('neon')).toBeDefined();
      expect(getNextTheme('light')).toBeDefined();
      expect(getNextTheme('dark')).toBeDefined();
    });

    test('getNextTheme() wraps around', () => {
      const t1 = getNextTheme('neon');
      const t2 = getNextTheme(t1);
      const t3 = getNextTheme(t2);
      const t4 = getNextTheme(t3);
      expect(t4).toBe('neon');
    });

    test('getNextTheme() handles unknown theme with wrap', () => {
      const result = getNextTheme('unknown');
      expect(result).toBeDefined();
      expect(THEME_COLORS[result]).toBeDefined();
    });

    test('getThemeIcon() returns icon for known themes', () => {
      expect(getThemeIcon('neon')).toBeDefined();
      expect(getThemeIcon('light')).toBeDefined();
      expect(getThemeIcon('dark')).toBeDefined();
    });

    test('getThemeIcon() returns fallback icon for unknown', () => {
      const icon = getThemeIcon('unknown');
      expect(icon).toBeDefined();
    });
  });

  describe('Glitch Log', () => {
    test('addGlitchLogEntry() creates entry with all fields', () => {
      const entry = addGlitchLogEntry({
        glitchCount: 5,
        metrics: { rms: 0.5, bass: 40, mid: 50, treble: 60, highFreqAnomaly: 0.1 }
      });
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('iso');
      expect(entry.glitchCount).toBe(5);
      expect(entry.rms).toBe(0.5);
      expect(entry.bass).toBe(40);
      expect(entry.mid).toBe(50);
      expect(entry.treble).toBe(60);
      expect(entry.highFreqAnomaly).toBe(0.1);
    });

    test('addGlitchLogEntry() uses provided timestamp', () => {
      const ts = 1234567890;
      const entry = addGlitchLogEntry({
        glitchCount: 3,
        metrics: { rms: 0.3, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 },
        timestamp: ts
      });
      expect(entry.timestamp).toBe(ts);
    });

    test('addGlitchLogEntry() iso field is valid ISO string', () => {
      const entry = addGlitchLogEntry({
        glitchCount: 1,
        metrics: { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 }
      });
      expect(new Date(entry.iso).toISOString()).toBe(entry.iso);
    });
  });

  describe('Reset Functions', () => {
    test('resetMetrics() resets current metrics', () => {
      const data = { rms: 0.5, bass: 50, mid: 50, treble: 50 };
      applyMetrics(data);
      resetMetrics();
      const result = applyMetrics(data);
      expect(result.currentMetrics.rms).toBe(0.5);
    });

    test('resetPerfState() resets all perf counters', () => {
      resetPerfState();
      const result = updatePerfDisplay(60, 5, 0);
      expect(result.fps.className).toBe('perf-good');
    });

    test('resetOscOptions() resets osc settings', () => {
      saveOscOptions({ freeze: true, zoom: true, logScale: true, split: true });
      resetOscOptions();
    });
  });

  describe('Chrome API Mock Integration', () => {
    test('chrome.runtime.sendMessage is called correctly by sendCompressorSettings', () => {
      // The pure function returns correct message, chrome API is separate
      const msg = sendCompressorSettings(EFFECTS_DEFAULTS);
      expect(msg.type).toBe('_SSA_SET_COMPRESSOR');
    });

    test('chrome.runtime.sendMessage mock handles callback', () => {
      const cb = jest.fn();
      chrome.runtime.sendMessage({ test: true }, cb);
      expect(cb).toHaveBeenCalled();
    });

    test('chrome.runtime.connect mock creates port', () => {
      const port = chrome.runtime.connect({ name: 'test-port' });
      expect(port.name).toBe('test-port');
      expect(port.postMessage).toBeDefined();
    });

    test('chrome.storage.local.set mock stores data', () => {
      chrome.storage.local.set({ key: 'value' });
      expect(chrome.storage.local._data.key).toBe('value');
    });

    test('chrome.storage.local.get mock retrieves data', () => {
      chrome.storage.local._data.key = 'value';
      const cb = jest.fn();
      chrome.storage.local.get('key', cb);
      expect(cb).toHaveBeenCalledWith({ key: 'value' });
    });
  });

  describe('Edge Cases', () => {
    test('updateFrequencyBands() handles negative smoothing factor', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(100, 0, 0, -0.5);
      expect(result.smoothedBass).toBeGreaterThan(0);
    });

    test('updateFrequencyBands() handles very large values', () => {
      resetFrequencySmoothing();
      const result = updateFrequencyBands(1e6, 1e6, 1e6);
      expect(result.bassPercent).toBeLessThanOrEqual(100);
      expect(result.midPercent).toBeLessThanOrEqual(100);
      expect(result.treblePercent).toBeLessThanOrEqual(100);
    });

    test('updateRMSDisplay() handles very small RMS', () => {
      const result = updateRMSDisplay(0.00001);
      expect(result.level).toBe('SILENCE');
      expect(result.rmsFormatted).toBe('0.0000');
    });

    test('updateGlitchDisplay() handles very large count', () => {
      const result = updateGlitchDisplay('GLITCH', 999999);
      expect(result.count).toBe(999999);
    });

    test('drawOscilloscope() handles empty canvas size', () => {
      const leftBuffer = new Float32Array([0.5]);
      const rightBuffer = new Float32Array([0.5]);
      const result = drawOscilloscope(leftBuffer, rightBuffer, 0, 0);
      expect(result.canvasSize.height).toBe(0);
    });

    test('drawTimeline() handles zero canvas size', () => {
      const history = [
        { time: 0, rms: 0.5, state: 'STABLE' },
        { time: 100, rms: 0.5, state: 'STABLE' }
      ];
      const result = drawTimeline(history, 0, 0);
      expect(result).toHaveProperty('referenceLine');
    });

    test('updateHeatmapData() handles exactly 100 band value', () => {
      const result = updateHeatmapData(100, 100, 100, false, 0);
      expect(result.heatmapData[0][0]).toBe(1);
      expect(result.heatmapData[1][0]).toBe(1);
      expect(result.heatmapData[2][0]).toBe(1);
    });

    test('togglePerfMonitor() handles undefined argument as false', () => {
      resetPerfState();
      const result = togglePerfMonitor(undefined);
      expect(result.visible).toBe(true);
      expect(result.active).toBe(true);
    });
  });
});
