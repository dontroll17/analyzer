import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSettings, saveSetting, getSettings, resetSettings } from '../../popup/config.js';

describe('popup/config.js — Settings Manager', () => {
  beforeEach(() => {
    chrome.storage.local._data = {};
    vi.clearAllMocks();
  });

  // ============================================
  // loadSettings
  // ============================================
  describe('loadSettings', () => {
    it('returns default values when no settings stored', async () => {
      const settings = await loadSettings();
      expect(settings.theme).toBe('neon');
      expect(settings.glitchSensitivity).toBe(85);
      expect(settings.oscFreeze).toBe(false);
      expect(settings.oscZoom).toBe(false);
      expect(settings.oscLogScale).toBe(false);
      expect(settings.oscSplit).toBe(false);
      expect(settings.oscRefSet).toBe(false);
      expect(settings.perfVisible).toBe(false);
      expect(settings.captureSource).toBe('tab');
      expect(settings.heatmapEnabled).toBe(true);
    });

    it('loads stored theme', async () => {
      chrome.storage.local._data[chrome.storage.local._data ? 'ssa_theme' : ''] = 'dark';
      // Directly set via KEYS mapping
      const KEYS = { theme: 'ssa_theme' };
      chrome.storage.local._data[KEYS.theme] = 'dark';

      const settings = await loadSettings();
      expect(settings.theme).toBe('dark');
    });

    it('loads stored glitch sensitivity', async () => {
      chrome.storage.local._data.ssa_glitchSensitivity = 70;
      const settings = await loadSettings();
      expect(settings.glitchSensitivity).toBe(70);
    });

    it('uses ?? for glitchSensitivity (allows 0)', async () => {
      chrome.storage.local._data.ssa_glitchSensitivity = 0;
      const settings = await loadSettings();
      expect(settings.glitchSensitivity).toBe(0);
    });

    it('loads stored osc options', async () => {
      chrome.storage.local._data.ssa_oscOptions = { freeze: true, zoom: true, logScale: true };
      const settings = await loadSettings();
      expect(settings.oscFreeze).toBe(true);
      expect(settings.oscZoom).toBe(true);
      expect(settings.oscLogScale).toBe(true);
    });

    it('loads oscSplit from separate storage key', async () => {
      chrome.storage.local._data.ssa_oscSplit = true;
      const settings = await loadSettings();
      expect(settings.oscSplit).toBe(true);
    });

    it('loads oscRefSet flag', async () => {
      chrome.storage.local._data.ssa_oscRefSet = true;
      const settings = await loadSettings();
      expect(settings.oscRefSet).toBe(true);
    });

    it('loads perfMonitorVisible', async () => {
      chrome.storage.local._data.ssa_perfMonitorVisible = true;
      const settings = await loadSettings();
      expect(settings.perfVisible).toBe(true);
    });

    it('loads captureSource', async () => {
      chrome.storage.local._data.ssa_captureSource = 'mic';
      const settings = await loadSettings();
      expect(settings.captureSource).toBe('mic');
    });

    it('uses ?? for heatmapEnabled (allows false)', async () => {
      chrome.storage.local._data.ssa_heatmapEnabled = false;
      const settings = await loadSettings();
      expect(settings.heatmapEnabled).toBe(false);
    });

    it('handles partial settings storage', async () => {
      chrome.storage.local._data.ssa_theme = 'cyberpunk';
      chrome.storage.local._data.ssa_captureSource = 'combined';

      const settings = await loadSettings();
      expect(settings.theme).toBe('cyberpunk');
      expect(settings.glitchSensitivity).toBe(85); // default
      expect(settings.captureSource).toBe('combined');
      expect(settings.heatmapEnabled).toBe(true); // default
    });
  });

  // ============================================
  // saveSetting
  // ============================================
  describe('saveSetting', () => {
    it('saves theme correctly', async () => {
      await saveSetting('theme', 'dark');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ ssa_theme: 'dark' });
    });

    it('saves glitchSensitivity correctly', async () => {
      await saveSetting('glitchSensitivity', 75);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ ssa_glitchSensitivity: 75 });
    });

    it('saves oscFreeze with oscOptions group', async () => {
      await saveSetting('oscFreeze', true);
      const calls = chrome.storage.local.set.mock.calls;
      // Should save both oscOptions group and oscRefSet
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const oscOptionsCall = calls.find(call => call[0].ssa_oscOptions);
      expect(oscOptionsCall).toBeDefined();
    });

    it('saves oscZoom with oscOptions group', async () => {
      await saveSetting('oscZoom', true);
      const calls = chrome.storage.local.set.mock.calls;
      const oscOptionsCall = calls.find(call => call[0].ssa_oscOptions);
      expect(oscOptionsCall).toBeDefined();
    });

    it('saves oscLogScale with oscOptions group', async () => {
      await saveSetting('oscLogScale', true);
      const calls = chrome.storage.local.set.mock.calls;
      const oscOptionsCall = calls.find(call => call[0].ssa_oscOptions);
      expect(oscOptionsCall).toBeDefined();
    });

    it('saves oscSplit separately', async () => {
      await saveSetting('oscSplit', true);
      const calls = chrome.storage.local.set.mock.calls;
      expect(calls.some(call => call[0].ssa_oscSplit)).toBe(true);
    });

    it('saves captureSource', async () => {
      await saveSetting('captureSource', 'mic');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ ssa_captureSource: 'mic' });
    });

    it('saves heatmapEnabled', async () => {
      await saveSetting('heatmapEnabled', false);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ ssa_heatmapEnabled: false });
    });

    it('warns on unknown key', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await saveSetting('unknownKey', 'value');
      expect(consoleSpy).toHaveBeenCalledWith('[Config] Unknown setting key:', 'unknownKey');
      consoleSpy.mockRestore();
    });

    it('handles storing false values for grouped options', async () => {
      await saveSetting('oscFreeze', false);
      const calls = chrome.storage.local.set.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // getSettings (alias for loadSettings)
  // ============================================
  describe('getSettings', () => {
    it('returns same data as loadSettings', async () => {
      chrome.storage.local._data.ssa_theme = 'light';
      chrome.storage.local._data.ssa_glitchSensitivity = 80;

      const settings1 = await loadSettings();
      const settings2 = await getSettings();

      expect(settings2.theme).toBe(settings1.theme);
      expect(settings2.glitchSensitivity).toBe(settings1.glitchSensitivity);
    });
  });

  // ============================================
  // resetSettings
  // ============================================
  describe('resetSettings', () => {
    it('clears all settings from storage', async () => {
      chrome.storage.local._data.ssa_theme = 'dark';
      chrome.storage.local._data.ssa_glitchSensitivity = 75;
      chrome.storage.local._data.ssa_captureSource = 'mic';

      await resetSettings();

      expect(chrome.storage.local.clear).toHaveBeenCalled();
    });
  });
});
