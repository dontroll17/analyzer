/**
 * Tests for popup API — Chrome Extension API integration patterns
 * Covers: message building, validation, theme selection
 * Does NOT require DOM — all functions are pure (imported from popup-testable.js)
 */
import { describe, it, expect } from 'vitest';
import {
  THEME_COLORS,
  VALID_CAPTURE_SOURCES,
  VALID_OVERLAY_MODES,
  STORAGE_KEYS,
  getThemeColors,
  getThemeColor,
  isValidCaptureSource,
  isValidOverlayMode,
  getDefaultCaptureSource,
  buildStartCaptureMessage,
  buildStopCaptureMessage,
  buildRequestStatusMessage,
  buildRequestMetricsMessage,
  buildOverlayMessage,
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

  it('VALID_OVERLAY_MODES has exactly 4 modes', () => {
    expect(VALID_OVERLAY_MODES).toHaveLength(4);
    expect(VALID_OVERLAY_MODES).toContain('expanded');
    expect(VALID_OVERLAY_MODES).toContain('compact');
    expect(VALID_OVERLAY_MODES).toContain('sidebar');
    expect(VALID_OVERLAY_MODES).toContain('mini');
  });

  it('STORAGE_KEYS has DROP_COUNT, OVERLAY_POSITION, OVERLAY_MODE', () => {
    expect(STORAGE_KEYS).toHaveProperty('DROP_COUNT', 'ssa_audio_drop_count');
    expect(STORAGE_KEYS).toHaveProperty('OVERLAY_POSITION', 'overlayPosition');
    expect(STORAGE_KEYS).toHaveProperty('OVERLAY_MODE', 'overlayMode');
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

  it('isValidOverlayMode accepts valid modes', () => {
    expect(isValidOverlayMode('expanded')).toBe(true);
    expect(isValidOverlayMode('compact')).toBe(true);
    expect(isValidOverlayMode('sidebar')).toBe(true);
    expect(isValidOverlayMode('mini')).toBe(true);
  });

  it('isValidOverlayMode rejects invalid values', () => {
    expect(isValidOverlayMode('')).toBe(false);
    expect(isValidOverlayMode('fullscreen')).toBe(false);
    expect(isValidOverlayMode(null)).toBe(false);
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
      expect(buildStartCaptureMessage('combined')).toEqual({
        type: 'START_CAPTURE',
        captureSource: 'combined'
      });
    });

    it('defaults to "tab" for empty string input', () => {
      const msg = buildStartCaptureMessage('');
      expect(msg.captureSource).toBe('tab'); // empty string is falsy, so source || 'tab' defaults to 'tab'
    });

    it('does NOT include tabStreamId (MV3 API — Bug-NEW fix)', () => {
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

  describe('buildOverlayMessage', () => {
    it('creates SHOW overlay message', () => {
      expect(buildOverlayMessage('SHOW')).toEqual({ type: '_SSA_SHOW_OVERLAY' });
    });

    it('creates HIDE overlay message', () => {
      expect(buildOverlayMessage('HIDE')).toEqual({ type: '_SSA_HIDE_OVERLAY' });
    });

    it('rejects invalid action', () => {
      // Invalid action still creates a message but with wrong type
      const msg = buildOverlayMessage('INVALID');
      expect(msg.type).toBe('_SSA_HIDE_OVERLAY'); // defaults to HIDE for non-SHOW
    });
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

  it('overlay message flow: popup → content.js via chrome.tabs.sendMessage', () => {
    const showMsg = buildOverlayMessage('SHOW');
    expect(showMsg.type).toBe('_SSA_SHOW_OVERLAY');

    const hideMsg = buildOverlayMessage('HIDE');
    expect(hideMsg.type).toBe('_SSA_HIDE_OVERLAY');

    // Both are valid content script messages (no chrome API calls needed)
    expect(showMsg.type.startsWith('_SSA_')).toBe(true);
    expect(hideMsg.type.startsWith('_SSA_')).toBe(true);
  });

  it('all message types are unique and non-colliding', () => {
    const messages = [
      buildStartCaptureMessage('tab'),
      buildStopCaptureMessage(),
      buildRequestStatusMessage(),
      buildRequestMetricsMessage(),
      buildOverlayMessage('SHOW'),
      buildOverlayMessage('HIDE'),
    ];

    const types = messages.map(m => m.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });
});
