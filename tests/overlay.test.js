const {
  OverlayModeManager,
  PinStateManager,
  getGlitchColor,
  computeMetricsDisplay,
  computeMetricsHtml,
  computeModeBtnTitle,
  computeGlitchTimelinePoints,
  computeHeatmapBand,
} = require('./content-testable');

// ======================== OverlayModeManager Tests ========================

describe('OverlayModeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new OverlayModeManager('expanded');
  });

  describe('initialization', () => {
    test('creates with default expanded mode', () => {
      expect(manager.getMode()).toBe('expanded');
    });

    test('creates with specified mode', () => {
      manager = new OverlayModeManager('compact');
      expect(manager.getMode()).toBe('compact');
    });

    test('throws on invalid mode via setMode', () => {
      expect(() => {
        manager.setMode('invalid');
      }).toThrow('Invalid overlay mode: invalid');
    });
  });

  describe('setMode()', () => {
    test('changes mode', () => {
      const prev = manager.setMode('compact');
      expect(prev).toBe('expanded');
      expect(manager.getMode()).toBe('compact');
    });

    test('triggers listeners on mode change', () => {
      const listener = jest.fn();
      manager.onModeChange(listener);
      manager.setMode('compact');
      expect(listener).toHaveBeenCalledWith('expanded', 'compact');
    });

    test('returns previous mode', () => {
      const prev = manager.setMode('sidebar');
      expect(prev).toBe('expanded');
    });
  });

  describe('cycle()', () => {
    test('cycles through all modes in order', () => {
      const sequence = [];
      manager.onModeChange((prev, next) => sequence.push(next));

      manager.cycle();
      expect(manager.getMode()).toBe('compact');

      manager.cycle();
      expect(manager.getMode()).toBe('sidebar');

      manager.cycle();
      expect(manager.getMode()).toBe('mini');

      manager.cycle();
      expect(manager.getMode()).toBe('expanded');

      expect(sequence).toEqual(['compact', 'sidebar', 'mini', 'expanded']);
    });

    test('wraps from mini to expanded', () => {
      manager.setMode('mini');
      manager.cycle();
      expect(manager.getMode()).toBe('expanded');
    });
  });

  describe('static computePosition()', () => {
    test('sidebar mode always returns top-left position', () => {
      const pos = OverlayModeManager.computePosition('sidebar', 9999, 9999);
      expect(pos).toEqual({ x: 0, y: 20 });
    });

    test('other modes preserve current position', () => {
      let pos = OverlayModeManager.computePosition('expanded', 100, 50);
      expect(pos).toEqual({ x: 100, y: 50 });

      pos = OverlayModeManager.computePosition('compact', 500, 300);
      expect(pos).toEqual({ x: 500, y: 300 });

      pos = OverlayModeManager.computePosition('mini', 10, 10);
      expect(pos).toEqual({ x: 10, y: 10 });
    });
  });

  describe('static computeCanvasSize()', () => {
    test('sidebar mode has largest canvas', () => {
      const size = OverlayModeManager.computeCanvasSize('sidebar');
      expect(size).toEqual({ width: 220, height: 120 });
    });

    test('compact mode has smallest canvas', () => {
      const size = OverlayModeManager.computeCanvasSize('compact');
      expect(size).toEqual({ width: 100, height: 30 });
    });

    test('expanded mode has default canvas', () => {
      const size = OverlayModeManager.computeCanvasSize('expanded');
      expect(size).toEqual({ width: 120, height: 30 });
    });

    test('mini mode returns zero size', () => {
      const size = OverlayModeManager.computeCanvasSize('mini');
      expect(size).toEqual({ width: 0, height: 0 });
    });
  });

  describe('static isVisible()', () => {
    test('expanded is visible', () => {
      expect(OverlayModeManager.isVisible('expanded')).toBe(true);
    });

    test('compact is visible', () => {
      expect(OverlayModeManager.isVisible('compact')).toBe(true);
    });

    test('sidebar is visible', () => {
      expect(OverlayModeManager.isVisible('sidebar')).toBe(true);
    });

    test('mini is NOT visible', () => {
      expect(OverlayModeManager.isVisible('mini')).toBe(false);
    });
  });

  describe('static isDraggable()', () => {
    test('expandable when pinned is false', () => {
      expect(OverlayModeManager.isDraggable('expanded', false)).toBe(true);
    });

    test('non-draggable when pinned is true', () => {
      expect(OverlayModeManager.isDraggable('expanded', true)).toBe(false);
      expect(OverlayModeManager.isDraggable('compact', true)).toBe(false);
      expect(OverlayModeManager.isDraggable('sidebar', true)).toBe(false);
    });

    test('mini mode is never draggable', () => {
      expect(OverlayModeManager.isDraggable('mini', false)).toBe(false);
    });
  });
});

// ======================== PinStateManager Tests ========================

describe('PinStateManager', () => {
  let pinManager;

  beforeEach(() => {
    pinManager = new PinStateManager();
  });

  describe('initialization', () => {
    test('starts as unpinned', () => {
      expect(pinManager.get()).toBe(false);
    });
  });

  describe('toggle()', () => {
    test('toggles from false to true', () => {
      const result = pinManager.toggle();
      expect(result).toBe(true);
      expect(pinManager.get()).toBe(true);
    });

    test('toggles from true to false', () => {
      pinManager.set(true);
      const result = pinManager.toggle();
      expect(result).toBe(false);
      expect(pinManager.get()).toBe(false);
    });

    test('multiple toggles alternate correctly', () => {
      pinManager.toggle(); // true
      pinManager.toggle(); // false
      pinManager.toggle(); // true
      expect(pinManager.get()).toBe(true);
    });
  });

  describe('set()', () => {
    test('sets to true', () => {
      const result = pinManager.set(true);
      expect(result).toBe(true);
      expect(pinManager.get()).toBe(true);
    });

    test('sets to false', () => {
      pinManager.set(true);
      const result = pinManager.set(false);
      expect(result).toBe(false);
      expect(pinManager.get()).toBe(false);
    });

    test('coerces truthy values to true', () => {
      expect(pinManager.set(1)).toBe(true);
      expect(pinManager.set('yes')).toBe(true);
      expect(pinManager.set({})).toBe(true);
    });

    test('coerces falsy values to false', () => {
      expect(pinManager.set(0)).toBe(false);
      expect(pinManager.set('')).toBe(false);
      expect(pinManager.set(null)).toBe(false);
      expect(pinManager.set(undefined)).toBe(false);
    });
  });

  describe('isDragAllowed()', () => {
    test('returns true when not pinned', () => {
      pinManager.set(false);
      expect(pinManager.isDragAllowed(false)).toBe(true);
    });

    test('returns false when pinned', () => {
      pinManager.set(true);
      expect(pinManager.isDragAllowed(true)).toBe(false);
    });
  });

  describe('getCursorStyle()', () => {
    test('returns default cursor when pinned', () => {
      expect(pinManager.getCursorStyle(true)).toBe('default');
    });

    test('returns grab cursor when unpinned', () => {
      expect(pinManager.getCursorStyle(false)).toBe('grab');
    });
  });

  describe('getOpacity()', () => {
    test('returns 1.0 when pinned', () => {
      expect(pinManager.getOpacity(true)).toBe(1.0);
    });

    test('returns 0.9 when unpinned', () => {
      expect(pinManager.getOpacity(false)).toBe(0.9);
    });
  });
});

// ======================== getGlitchColor Tests ========================

describe('getGlitchColor', () => {
  test('returns pink for GLITCH state', () => {
    expect(getGlitchColor('GLITCH')).toBe('#FF007F');
  });

  test('returns purple for DRIFT state', () => {
    expect(getGlitchColor('DRIFT')).toBe('#9D00FF');
  });

  test('returns cyan for STABLE state', () => {
    expect(getGlitchColor('STABLE')).toBe('#00E5FF');
  });

  test('returns cyan for unknown state (default)', () => {
    expect(getGlitchColor('UNKNOWN')).toBe('#00E5FF');
    expect(getGlitchColor('')).toBe('#00E5FF');
    expect(getGlitchColor(null)).toBe('#00E5FF');
    expect(getGlitchColor(undefined)).toBe('#00E5FF');
  });

  test('case-sensitive matching', () => {
    expect(getGlitchColor('glitch')).toBe('#00E5FF');
    expect(getGlitchColor('Stable')).toBe('#00E5FF');
  });
});


// ======================== computeMetricsDisplay Tests ========================

describe('computeMetricsDisplay', () => {
  test('returns default values for empty data', () => {
    const result = computeMetricsDisplay({});
    expect(result).toEqual({
      currentRMS: 0,
      currentGlitchState: 'STABLE',
      currentGlitchCount: 0,
      currentEntropy: 0,
      currentFlatness: 0,
      currentRTT: 0,
      currentAudioDrops: 0,
    });
  });

  test('maps all fields from input data', () => {
    const data = {
      rms: 0.85,
      glitchState: 'GLITCH',
      glitchCount: 12,
      entropy: 4.5,
      flatness: 0.15,
      rtt: 45,
      audioDrops: 3,
    };
    const result = computeMetricsDisplay(data);
    expect(result).toEqual({
      currentRMS: 0.85,
      currentGlitchState: 'GLITCH',
      currentGlitchCount: 12,
      currentEntropy: 4.5,
      currentFlatness: 0.15,
      currentRTT: 45,
      currentAudioDrops: 3,
    });
  });

  test('defaults missing optional fields to 0', () => {
    const result = computeMetricsDisplay({ rms: 0.5 });
    expect(result.currentRMS).toBe(0.5);
    expect(result.currentRTT).toBe(0);
    expect(result.currentAudioDrops).toBe(0);
  });

  test('handles null/undefined data gracefully', () => {
    expect(() => computeMetricsDisplay(null)).toThrow();
    expect(() => computeMetricsDisplay(undefined)).toThrow();
  });
});

// ======================== computeMetricsHtml Tests ========================

describe('computeMetricsHtml', () => {
  const baseMetrics = {
    currentGlitchCount: 5,
    currentEntropy: 3.75,
    currentFlatness: 0.22,
    currentRTT: 0,
    currentAudioDrops: 0,
    currentGlitchState: 'STABLE',
  };

  test('renders base metrics in expanded mode', () => {
    const html = computeMetricsHtml(baseMetrics, 'expanded');
    expect(html).toContain('GL:');
    expect(html).toContain('5');
    expect(html).toContain('H:');
    expect(html).toContain('3.75');
    expect(html).toContain('F:');
    expect(html).toContain('0.22');
  });

  test('excludes RTT when zero', () => {
    const html = computeMetricsHtml(baseMetrics, 'expanded');
    expect(html).not.toContain('RTT:');
  });

  test('includes RTT when non-zero', () => {
    const metrics = { ...baseMetrics, currentRTT: 123 };
    const html = computeMetricsHtml(metrics, 'expanded');
    expect(html).toContain('RTT:');
    expect(html).toContain('123ms');
  });

  test('excludes Drops when zero', () => {
    const html = computeMetricsHtml(baseMetrics, 'expanded');
    expect(html).not.toContain('Drops:');
  });

  test('includes Drops when non-zero', () => {
    const metrics = { ...baseMetrics, currentAudioDrops: 7 };
    const html = computeMetricsHtml(metrics, 'expanded');
    expect(html).toContain('Drops:');
    expect(html).toContain('7');
  });

  test('adds State metric in sidebar mode when entropy > 0', () => {
    const metrics = { ...baseMetrics, currentEntropy: 4.0, currentGlitchState: 'GLITCH' };
    const html = computeMetricsHtml(metrics, 'sidebar');
    expect(html).toContain('State:');
    expect(html).toContain('GLITCH');
    expect(html).toContain('color: #FF007F');
  });

  test('excludes State metric in sidebar mode when entropy is zero', () => {
    const metrics = { ...baseMetrics, currentEntropy: 0, currentGlitchState: 'GLITCH' };
    const html = computeMetricsHtml(metrics, 'sidebar');
    expect(html).not.toContain('State:');
  });

  test('excludes State metric in non-sidebar modes', () => {
    const metrics = { ...baseMetrics, currentEntropy: 4.0, currentGlitchState: 'DRIFT' };
    const html1 = computeMetricsHtml(metrics, 'expanded');
    const html2 = computeMetricsHtml(metrics, 'compact');
    const html3 = computeMetricsHtml(metrics, 'mini');
    expect(html1).not.toContain('State:');
    expect(html2).not.toContain('State:');
    expect(html3).not.toContain('State:');
  });

  test('uses correct color for DRIFT state in sidebar', () => {
    const metrics = { ...baseMetrics, currentEntropy: 3.0, currentGlitchState: 'DRIFT' };
    const html = computeMetricsHtml(metrics, 'sidebar');
    expect(html).toContain('color: #9D00FF');
  });

  test('uses correct color for STABLE state in sidebar', () => {
    const metrics = { ...baseMetrics, currentEntropy: 3.0, currentGlitchState: 'STABLE' };
    const html = computeMetricsHtml(metrics, 'sidebar');
    expect(html).toContain('color: #00E5FF');
  });

  test('rounds entropy and flatness to 2 decimals', () => {
    const metrics = { ...baseMetrics, currentEntropy: 3.14159, currentFlatness: 0.999 };
    const html = computeMetricsHtml(metrics, 'expanded');
    expect(html).toContain('3.14');
    expect(html).toContain('1.00');
  });
});

// ======================== computeModeBtnTitle Tests ========================

describe('computeModeBtnTitle', () => {
  test('returns correct title for expanded', () => {
    expect(computeModeBtnTitle('expanded')).toBe('Switch to Compact');
  });

  test('returns correct title for compact', () => {
    expect(computeModeBtnTitle('compact')).toBe('Switch to Sidebar');
  });

  test('returns correct title for sidebar', () => {
    expect(computeModeBtnTitle('sidebar')).toBe('Switch to Mini');
  });

  test('returns correct title for mini', () => {
    expect(computeModeBtnTitle('mini')).toBe('Show Overlay');
  });

  test('returns fallback for unknown mode', () => {
    expect(computeModeBtnTitle('unknown')).toBe('Toggle mode');
  });
});

// ======================== computeGlitchTimelinePoints Tests ========================

describe('computeGlitchTimelinePoints', () => {
  test('returns empty array for null input', () => {
    expect(computeGlitchTimelinePoints(null, 200, 50)).toEqual([]);
  });

  test('returns empty array for fewer than 2 points', () => {
    expect(computeGlitchTimelinePoints([{}], 200, 50)).toEqual([]);
  });

  test('computes correct number of points from large dataset', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      state: i % 10 === 0 ? 'GLITCH' : 'STABLE',
    }));
    const result = computeGlitchTimelinePoints(data, 200, 50);
    expect(result.length).toBe(50);
  });

  test('GLITCH points have offset Y', () => {
    const data = [
      { state: 'STABLE' },
      { state: 'GLITCH' },
      { state: 'STABLE' },
      { state: 'GLITCH' },
    ];
    const result = computeGlitchTimelinePoints(data, 100, 4);
    // timelineY = 100 - 10 = 90, timelineHeight = 8, GLITCH y = 82
    expect(result[0].y).toBe(90);
    expect(result[1].y).toBe(82);
    expect(result[2].y).toBe(90);
    expect(result[3].y).toBe(82);
  });

  test('points have correct X positions', () => {
    const data = [
      { state: 'STABLE' },
      { state: 'STABLE' },
      { state: 'STABLE' },
    ];
    const result = computeGlitchTimelinePoints(data, 300, 3);
    // step = 300 / 3 = 100
    expect(result[0].x).toBe(0);
    expect(result[1].x).toBe(100);
    expect(result[2].x).toBe(200);
  });

  test('preserves state in each point', () => {
    const data = [
      { state: 'GLITCH' },
      { state: 'DRIFT' },
      { state: 'STABLE' },
    ];
    const result = computeGlitchTimelinePoints(data, 100, 3);
    expect(result[0].state).toBe('GLITCH');
    expect(result[1].state).toBe('DRIFT');
    expect(result[2].state).toBe('STABLE');
  });
});

// ======================== computeHeatmapBand Tests ========================

describe('computeHeatmapBand', () => {
  test('returns empty array for empty input', () => {
    expect(computeHeatmapBand([], 200, 50)).toEqual([]);
  });

  test('computes correct number of points from large dataset', () => {
    const data = Array.from({ length: 100 }, (_, i) => i / 100);
    const result = computeHeatmapBand(data, 200, 50);
    expect(result.length).toBe(50);
  });

  test('GLITCH color for value > 0.7', () => {
    const data = [0.8, 0.9, 1.0];
    const result = computeHeatmapBand(data, 100, 3);
    result.forEach((point) => {
      expect(point.color).toBe('#FF007F');
    });
  });

  test('DRIFT color for value > 0.3 and <= 0.7', () => {
    const data = [0.31, 0.5, 0.7];
    const result = computeHeatmapBand(data, 100, 3);
    result.forEach((point) => {
      expect(point.color).toBe('#9D00FF');
    });
  });

  test('STABLE color for value <= 0.3', () => {
    const data = [0.0, 0.1, 0.3];
    const result = computeHeatmapBand(data, 100, 3);
    result.forEach((point) => {
      expect(point.color).toBe('#00E5FF');
    });
  });

  test('points have correct X positions', () => {
    const data = [0.5, 0.6, 0.7];
    const result = computeHeatmapBand(data, 150, 3);
    // step = 150 / 3 = 50
    expect(result[0].x).toBe(0);
    expect(result[1].x).toBe(50);
    expect(result[2].x).toBe(100);
  });

  test('preserves original values', () => {
    const data = [0.123, 0.456, 0.789];
    const result = computeHeatmapBand(data, 100, 3);
    expect(result[0].value).toBe(0.123);
    expect(result[1].value).toBe(0.456);
    expect(result[2].value).toBe(0.789);
  });
});

// ======================== Integration Tests ========================

describe('Integration: Full metrics flow', () => {
  test('complete pipeline from raw data to HTML rendering', () => {
    const rawData = {
      rms: 0.75,
      glitchState: 'GLITCH',
      glitchCount: 15,
      entropy: 4.2,
      flatness: 0.18,
      rtt: 85,
      audioDrops: 2,
    };

    const metrics = computeMetricsDisplay(rawData);
    const expandedHtml = computeMetricsHtml(metrics, 'expanded');
    const sidebarHtml = computeMetricsHtml(metrics, 'sidebar');

    expect(expandedHtml).toContain('GL:');
    expect(expandedHtml).toContain('85ms');
    expect(expandedHtml).toContain('Drops:');
    expect(expandedHtml).not.toContain('State:');

    expect(sidebarHtml).toContain('State:');
    expect(sidebarHtml).toContain('GLITCH');
    expect(sidebarHtml).toContain('color: #FF007F');
  });

  test('mode cycle with position preservation', () => {
    const manager = new OverlayModeManager('expanded');
    const positions = [];

    manager.onModeChange((prev, next) => {
      const pos = OverlayModeManager.computePosition(next, 100, 50);
      positions.push({ mode: next, position: pos });
    });

    manager.cycle();
    manager.cycle();
    manager.cycle();

    expect(positions[0].position.x).toBe(100);
    expect(positions[1].position.x).toBe(0);
    expect(positions[2].position.x).toBe(100);
  });

  test('pin state affects drag behavior across modes', () => {
    const pinManager = new PinStateManager();
    const modeManager = new OverlayModeManager('expanded');

    pinManager.set(true);

    expect(OverlayModeManager.isDraggable(modeManager.getMode(), pinManager.get())).toBe(false);

    modeManager.setMode('sidebar');
    expect(OverlayModeManager.isDraggable(modeManager.getMode(), pinManager.get())).toBe(false);
  });
});

// ======================== Edge Cases ========================

describe('Edge Cases', () => {
  test('NaN values fall through to default 0 via || operator', () => {
    const result = computeMetricsDisplay({ rms: NaN, glitchCount: NaN });
    // NaN || 0 = 0 in JS, so NaN falls through to default
    expect(result.currentRMS).toBe(0);
    expect(result.currentGlitchCount).toBe(0);
  });

  test('handles extreme values in metrics HTML', () => {
    const metrics = {
      currentGlitchCount: 999999,
      currentEntropy: 999.999,
      currentFlatness: -0.5,
      currentRTT: 9999,
      currentAudioDrops: 999,
      currentGlitchState: 'GLITCH',
    };
    const html = computeMetricsHtml(metrics, 'sidebar');
    expect(html).toContain('999999');
    expect(html).toContain('1000.00');
    expect(html).toContain('9999ms');
    expect(html).toContain('Drops:');
  });

  test('handles many listeners on mode change', () => {
    const manager = new OverlayModeManager('expanded');
    const callCounts = {};

    for (let i = 0; i < 10; i++) {
      const id = i;
      callCounts[id] = 0;
      manager.onModeChange(() => {
        callCounts[id]++;
      });
    }

    manager.cycle();
    manager.cycle();

    Object.values(callCounts).forEach((count) => {
      expect(count).toBe(2);
    });
  });

  test('removes listeners on unsubscription', () => {
    const manager = new OverlayModeManager('expanded');
    const listener = jest.fn();

    const unsubscribe = manager.onModeChange(listener);
    manager.cycle();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    manager.cycle();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
