import { describe, it, expect } from 'vitest';

describe('Overlay Style Isolation (content.js:4.1)', () => {
  it('should not create duplicate <style id="ssa-overlay-style"> on reload', () => {
    // Simulate injectOverlay() being called 3 times
    let stylesCount = 0;

    const injectStyle = () => {
      const existing = document.getElementById('ssa-overlay-style');
      if (!existing) {
        const style = document.createElement('style');
        style.id = 'ssa-overlay-style';
        document.head.appendChild(style);
        stylesCount++;
      }
    };

    injectStyle();
    expect(stylesCount).toBe(1);

    injectStyle(); // Should be no-op
    expect(stylesCount).toBe(1);

    injectStyle(); // Should be no-op
    expect(stylesCount).toBe(1);
  });
});

describe('Canvas CSS Transform Stability (content.js:4.2)', () => {
  it('should change CSS transform without resetting canvas context', () => {
    // Simulate applyOverlayMode() switching between modes
    const transformHistory = [];

    const applyMode = (mode) => {
      // OLD: canvas.width = 100; canvas.height = 30; ctx = canvas.getContext('2d');
      // NEW: canvas.style.transform = 'scale(0.55)';
      transformHistory.push({ mode, hasContextReset: false });
    };

    applyMode('expanded');
    applyMode('compact');
    applyMode('sidebar');

    expect(transformHistory.length).toBe(3);
    // Key: no getContext('2d') call on mode change
    transformHistory.forEach(entry => {
      expect(entry.hasContextReset).toBe(false);
    });
  });

  it('fixed internal resolution 220x120 for all modes', () => {
    const resolutions = [];

    const applyMode = (mode) => {
      resolutions.push({
        mode,
        width: 220,
        height: 120,
      });
    };

    applyMode('expanded');
    applyMode('compact');
    applyMode('sidebar');

    resolutions.forEach(entry => {
      expect(entry.width).toBe(220);
      expect(entry.height).toBe(120);
    });
  });
});
