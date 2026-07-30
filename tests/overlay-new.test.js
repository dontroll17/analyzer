const {
  computeOverlayCSSClass,
  computeSidebarStateMetric,
  computeMiniBadgePosition,
  normalizeRMS,
  clampPosition,
  computeDragOffset,
  buildMetricsRow,
  computeRMSBar,
  computeCanvasCenterY,
  OverlayModeManager,
  PinStateManager,
  getGlitchColor,
  computeMetricsDisplay,
  computeMetricsHtml,
  computeModeBtnTitle,
  computeGlitchTimelinePoints,
  computeHeatmapBand,
} = require('./content-testable');

// ======================== computeOverlayCSSClass Tests ========================

describe('computeOverlayCSSClass', () => {
  test('returns correct class for expanded', () => {
    expect(computeOverlayCSSClass('expanded')).toBe('ssa-expanded');
  });

  test('returns correct class for compact', () => {
    expect(computeOverlayCSSClass('compact')).toBe('ssa-compact');
  });

  test('returns correct class for sidebar', () => {
    expect(computeOverlayCSSClass('sidebar')).toBe('ssa-sidebar');
  });

  test('returns correct class for mini', () => {
    expect(computeOverlayCSSClass('mini')).toBe('ssa-mini');
  });

  test('returns default class for unknown mode', () => {
    expect(computeOverlayCSSClass('unknown')).toBe('ssa-expanded');
    expect(computeOverlayCSSClass('')).toBe('ssa-expanded');
    expect(computeOverlayCSSClass(null)).toBe('ssa-expanded');
  });
});

// ======================== computeSidebarStateMetric Tests ========================

describe('computeSidebarStateMetric', () => {
  test('returns empty string when entropy is zero', () => {
    const metrics = { currentEntropy: 0, currentGlitchState: 'GLITCH' };
    expect(computeSidebarStateMetric(metrics)).toBe('');
  });

  test('returns empty string when entropy is null', () => {
    const metrics = { currentEntropy: null, currentGlitchState: 'GLITCH' };
    expect(computeSidebarStateMetric(metrics)).toBe('');
  });

  test('returns State HTML when entropy > 0', () => {
    const metrics = { currentEntropy: 4.0, currentGlitchState: 'GLITCH' };
    const result = computeSidebarStateMetric(metrics);
    expect(result).toContain('State:');
    expect(result).toContain('GLITCH');
    expect(result).toContain('color: #FF007F');
  });

  test('uses correct color for DRIFT state', () => {
    const metrics = { currentEntropy: 3.5, currentGlitchState: 'DRIFT' };
    const result = computeSidebarStateMetric(metrics);
    expect(result).toContain('color: #9D00FF');
  });

  test('uses correct color for STABLE state', () => {
    const metrics = { currentEntropy: 2.0, currentGlitchState: 'STABLE' };
    const result = computeSidebarStateMetric(metrics);
    expect(result).toContain('color: #00E5FF');
  });

  test('returns correct HTML structure', () => {
    const metrics = { currentEntropy: 1.0, currentGlitchState: 'GLITCH' };
    const result = computeSidebarStateMetric(metrics);
    expect(result).toContain('ssa-metric-item');
    expect(result).toContain('ssa-metric-label');
    expect(result).toContain('ssa-metric-value');
  });
});

// ======================== computeMiniBadgePosition Tests ========================

describe('computeMiniBadgePosition', () => {
  test('computes correct position for overlay in top-left', () => {
    const overlayRect = { left: 0, top: 0, right: 100, bottom: 50 };
    const pos = computeMiniBadgePosition(overlayRect, 1920, 1080);
    expect(pos.right).toBe(1920 - 100 + 5);
    expect(pos.bottom).toBe(1080 - 50 + 5);
  });

  test('computes correct position for overlay in center', () => {
    const overlayRect = { left: 800, top: 400, right: 1000, bottom: 450 };
    const pos = computeMiniBadgePosition(overlayRect, 1920, 1080);
    expect(pos.right).toBe(1920 - 1000 + 5);
    expect(pos.bottom).toBe(1080 - 450 + 5);
  });

  test('computes correct position for overlay in bottom-right', () => {
    const overlayRect = { left: 1800, top: 1000, right: 1900, bottom: 1050 };
    const pos = computeMiniBadgePosition(overlayRect, 1920, 1080);
    expect(pos.right).toBe(1920 - 1900 + 5);
    expect(pos.bottom).toBe(1080 - 1050 + 5);
  });

  test('position values are always positive for valid rects', () => {
    const overlayRect = { left: 100, top: 100, right: 300, bottom: 200 };
    const pos = computeMiniBadgePosition(overlayRect, 1920, 1080);
    expect(pos.right).toBeGreaterThan(0);
    expect(pos.bottom).toBeGreaterThan(0);
  });
});

// ======================== normalizeRMS Tests ========================

describe('normalizeRMS', () => {
  test('returns 0 for RMS 0', () => {
    expect(normalizeRMS(0)).toBe(0);
  });

  test('returns 0.5 for RMS 0.25', () => {
    expect(normalizeRMS(0.25)).toBe(0.5);
  });

  test('returns 1.0 for RMS 0.5', () => {
    expect(normalizeRMS(0.5)).toBe(1);
  });

  test('caps at 1.0 for RMS > 0.5', () => {
    expect(normalizeRMS(0.6)).toBe(1);
    expect(normalizeRMS(0.8)).toBe(1);
    expect(normalizeRMS(1.0)).toBe(1);
    expect(normalizeRMS(2.0)).toBe(1);
  });

  test('handles fractional values correctly', () => {
    expect(normalizeRMS(0.1)).toBe(0.2);
    expect(normalizeRMS(0.3)).toBe(0.6);
    expect(normalizeRMS(0.4)).toBe(0.8);
  });

  test('handles negative values', () => {
    expect(normalizeRMS(-0.5)).toBe(-1);
  });
});

// ======================== clampPosition Tests ========================

describe('clampPosition', () => {
  test('keeps position within bounds', () => {
    const pos = clampPosition(100, 100, 200, 100, 1920, 1080);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(100);
  });

  test('clamps X to 0 when negative', () => {
    const pos = clampPosition(-50, 100, 200, 100, 1920, 1080);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(100);
  });

  test('clamps X to max when exceeds viewport', () => {
    const pos = clampPosition(1900, 100, 200, 100, 1920, 1080);
    expect(pos.x).toBe(1920 - 200);
    expect(pos.y).toBe(100);
  });

  test('clamps Y to 0 when negative', () => {
    const pos = clampPosition(100, -30, 200, 100, 1920, 1080);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(0);
  });

  test('clamps Y to max when exceeds viewport', () => {
    const pos = clampPosition(100, 1060, 200, 100, 1920, 1080);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(1080 - 100);
  });

  test('handles overlay larger than viewport', () => {
    const pos = clampPosition(0, 0, 2000, 1100, 1920, 1080);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  test('handles zero-size overlay', () => {
    const pos = clampPosition(100, 100, 0, 0, 1920, 1080);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(100);
  });
});

// ======================== computeDragOffset Tests ========================

describe('computeDragOffset', () => {
  test('computes offset correctly', () => {
    const offset = computeDragOffset(200, 300, 100, 50);
    expect(offset.offsetX).toBe(100);
    expect(offset.offsetY).toBe(250);
  });

  test('returns zero offset when mouse equals position', () => {
    const offset = computeDragOffset(100, 200, 100, 200);
    expect(offset.offsetX).toBe(0);
    expect(offset.offsetY).toBe(0);
  });

  test('handles negative positions', () => {
    const offset = computeDragOffset(0, 0, -50, -50);
    expect(offset.offsetX).toBe(50);
    expect(offset.offsetY).toBe(50);
  });

  test('handles large coordinates', () => {
    const offset = computeDragOffset(5000, 5000, 4000, 4000);
    expect(offset.offsetX).toBe(1000);
    expect(offset.offsetY).toBe(1000);
  });
});

// ======================== buildMetricsRow Tests ========================

describe('buildMetricsRow', () => {
  const baseMetrics = {
    currentGlitchCount: 5,
    currentEntropy: 3.75,
    currentFlatness: 0.22,
    currentRTT: 0,
    currentAudioDrops: 0,
  };

  test('includes GL, H, F metrics always', () => {
    const html = buildMetricsRow(baseMetrics);
    expect(html).toContain('GL:');
    expect(html).toContain('5');
    expect(html).toContain('H:');
    expect(html).toContain('3.75');
    expect(html).toContain('F:');
    expect(html).toContain('0.22');
  });

  test('excludes RTT when zero', () => {
    const html = buildMetricsRow(baseMetrics);
    expect(html).not.toContain('RTT:');
  });

  test('includes RTT when positive', () => {
    const metrics = { ...baseMetrics, currentRTT: 123 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('RTT:');
    expect(html).toContain('123ms');
  });

  test('excludes Drops when zero', () => {
    const html = buildMetricsRow(baseMetrics);
    expect(html).not.toContain('Drops:');
  });

  test('includes Drops when positive', () => {
    const metrics = { ...baseMetrics, currentAudioDrops: 7 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('Drops:');
    expect(html).toContain('7');
  });

  test('includes both RTT and Drops when both positive', () => {
    const metrics = { ...baseMetrics, currentRTT: 85, currentAudioDrops: 3 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('RTT:');
    expect(html).toContain('85ms');
    expect(html).toContain('Drops:');
    expect(html).toContain('3');
  });

  test('RTT rounds to nearest ms', () => {
    const metrics = { ...baseMetrics, currentRTT: 45.7 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('46ms');
  });

  test('entropy and flatness rounded to 2 decimals', () => {
    const metrics = { ...baseMetrics, currentEntropy: 3.14159, currentFlatness: 0.999 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('3.14');
    expect(html).toContain('1.00');
  });

  test('handles extreme glitch count', () => {
    const metrics = { ...baseMetrics, currentGlitchCount: 999999 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('999999');
  });

  test('handles negative flatness', () => {
    const metrics = { ...baseMetrics, currentFlatness: -0.5 };
    const html = buildMetricsRow(metrics);
    expect(html).toContain('-0.50');
  });

  test('produces valid HTML structure', () => {
    const html = buildMetricsRow(baseMetrics);
    expect(html).toContain('ssa-metric-item');
    expect(html).toContain('ssa-metric-label');
    expect(html).toContain('ssa-metric-value');
  });

  test('empty string for RTT and Drops when both zero', () => {
    const html = buildMetricsRow(baseMetrics);
    expect(html).toContain('GL:');
    expect(html).toContain('H:');
    expect(html).toContain('F:');
    expect(html).not.toContain('RTT:');
    expect(html).not.toContain('Drops:');
    const itemCount = (html.match(/ssa-metric-item/g) || []).length;
    expect(itemCount).toBe(3); // GL, H, F
  });

  test('5 metric items when RTT and Drops present', () => {
    const metrics = { ...baseMetrics, currentRTT: 50, currentAudioDrops: 2 };
    const html = buildMetricsRow(metrics);
    const itemCount = (html.match(/ssa-metric-item/g) || []).length;
    expect(itemCount).toBe(5); // GL, H, F, RTT, Drops
  });
});

// ======================== computeRMSBar Tests ========================

describe('computeRMSBar', () => {
  test('returns zero height for RMS 0', () => {
    const bar = computeRMSBar(0, 100);
    expect(bar.height).toBe(0);
  });

  test('computes correct height for RMS 0.5 in 100px canvas', () => {
    const bar = computeRMSBar(0.5, 100);
    expect(bar.height).toBe(80);
  });

  test('computes correct height for RMS 0.25 in 100px canvas', () => {
    const bar = computeRMSBar(0.25, 100);
    expect(bar.height).toBe(40);
  });

  test('caps height at 80% of canvas height', () => {
    const bar = computeRMSBar(1.0, 100);
    expect(bar.height).toBe(80);
  });

  test('computes correct Y centering', () => {
    const bar = computeRMSBar(0.5, 100);
    expect(bar.y).toBe(10);
  });

  test('works with different canvas heights', () => {
    const bar50 = computeRMSBar(0.5, 50);
    expect(bar50.height).toBe(40);
    expect(bar50.y).toBe(5);
  });
});

// ======================== computeCanvasCenterY Tests ========================

describe('computeCanvasCenterY', () => {
  test('returns correct center for 100px canvas', () => {
    expect(computeCanvasCenterY(100)).toBe(50);
  });

  test('returns correct center for 30px canvas', () => {
    expect(computeCanvasCenterY(30)).toBe(15);
  });

  test('returns correct center for 120px canvas', () => {
    expect(computeCanvasCenterY(120)).toBe(60);
  });

  test('returns zero for zero-height canvas', () => {
    expect(computeCanvasCenterY(0)).toBe(0);
  });
});

// ======================== Integration: Full Pipeline Tests ========================

describe('Integration: Full overlay metrics pipeline', () => {
  test('raw data to metrics display to HTML row to sidebar metric', () => {
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
    expect(metrics.currentGlitchCount).toBe(15);
    expect(metrics.currentEntropy).toBe(4.2);
    expect(metrics.currentFlatness).toBe(0.18);
    expect(metrics.currentRTT).toBe(85);
    expect(metrics.currentAudioDrops).toBe(2);
    expect(metrics.currentGlitchState).toBe('GLITCH');

    const rowHtml = buildMetricsRow(metrics);
    expect(rowHtml).toContain('GL:');
    expect(rowHtml).toContain('15');
    expect(rowHtml).toContain('RTT:');
    expect(rowHtml).toContain('85ms');
    expect(rowHtml).toContain('Drops:');
    expect(rowHtml).toContain('2');

    const sidebarMetric = computeSidebarStateMetric(metrics);
    expect(sidebarMetric).toContain('State:');
    expect(sidebarMetric).toContain('GLITCH');
    expect(sidebarMetric).toContain('color: #FF007F');
  });

  test('mode transition with position clamping', () => {
    const manager = new OverlayModeManager('expanded');
    const positions = [];

    manager.onModeChange((prev, next) => {
      positions.push({ prev, next });
    });

    manager.cycle();
    manager.cycle();
    manager.cycle();
    manager.cycle();

    expect(positions).toHaveLength(4);
    expect(positions[0]).toEqual({ prev: 'expanded', next: 'compact' });
    expect(positions[1]).toEqual({ prev: 'compact', next: 'sidebar' });
    expect(positions[2]).toEqual({ prev: 'sidebar', next: 'mini' });
    expect(positions[3]).toEqual({ prev: 'mini', next: 'expanded' });
  });

  test('pin state blocks drag across all modes', () => {
    const pinManager = new PinStateManager();
    const modeManager = new OverlayModeManager('expanded');

    pinManager.set(true);

    ['expanded', 'compact', 'sidebar', 'mini'].forEach((mode) => {
      modeManager.setMode(mode);
      expect(OverlayModeManager.isDraggable(mode, pinManager.get())).toBe(false);
    });
  });

  test('canvas size changes with mode', () => {
    const sizes = {
      expanded: { width: 120, height: 30 },
      compact: { width: 100, height: 30 },
      sidebar: { width: 220, height: 120 },
      mini: { width: 0, height: 0 },
    };

    Object.entries(sizes).forEach(([mode, expected]) => {
      const size = OverlayModeManager.computeCanvasSize(mode);
      expect(size).toEqual(expected);
    });
  });

  test('RMS normalization in context of canvas rendering', () => {
    const canvasHeight = 100;

    const lowBar = computeRMSBar(0.1, canvasHeight);
    expect(lowBar.height).toBe(16);

    const medBar = computeRMSBar(0.3, canvasHeight);
    expect(medBar.height).toBe(48);

    const highBar = computeRMSBar(0.9, canvasHeight);
    expect(highBar.height).toBe(80);
  });

  test('glitch timeline with mixed states', () => {
    const data = [
      { state: 'STABLE', rms: 0.1 },
      { state: 'GLITCH', rms: 0.9 },
      { state: 'DRIFT', rms: 0.5 },
      { state: 'GLITCH', rms: 0.85 },
      { state: 'STABLE', rms: 0.2 },
    ];

    const points = computeGlitchTimelinePoints(data, 200, 5);
    expect(points).toHaveLength(5);
    expect(points[0].y).toBe(90);
    expect(points[1].y).toBe(82);
    expect(points[2].y).toBe(90);
    expect(points[3].y).toBe(82);
    expect(points[4].y).toBe(90);
  });

  test('heatmap with gradient values', () => {
    const data = [0.1, 0.3, 0.5, 0.7, 0.9];
    const points = computeHeatmapBand(data, 200, 5);

    expect(points[0].color).toBe('#00E5FF');
    expect(points[1].color).toBe('#00E5FF');
    expect(points[2].color).toBe('#9D00FF');
    expect(points[3].color).toBe('#9D00FF');
    expect(points[4].color).toBe('#FF007F');
  });

  test('mini badge position updates with overlay move', () => {
    const viewportW = 1920;
    const viewportH = 1080;

    let rect = { left: 1700, top: 50, right: 1900, bottom: 100 };
    let badge = computeMiniBadgePosition(rect, viewportW, viewportH);
    expect(badge.right).toBe(25);

    rect = { left: 1600, top: 50, right: 1800, bottom: 100 };
    badge = computeMiniBadgePosition(rect, viewportW, viewportH);
    expect(badge.right).toBe(125);
  });

  test('drag offset calculation with clamping', () => {
    const initialOffset = computeDragOffset(500, 300, 400, 200);
    expect(initialOffset.offsetX).toBe(100);
    expect(initialOffset.offsetY).toBe(100);

    let newX = 500 - initialOffset.offsetX;
    let newY = 300 - initialOffset.offsetY;

    const clamped = clampPosition(newX, newY, 200, 100, 1920, 1080);
    expect(clamped.x).toBe(400);
    expect(clamped.y).toBe(200);
  });

  test('full mode cycle with all managers', () => {
    const modeManager = new OverlayModeManager('expanded');
    const pinManager = new PinStateManager();
    const modeSequence = [];
    const positionHistory = [];

    modeManager.onModeChange((prev, next) => {
      modeSequence.push(next);
      const pos = OverlayModeManager.computePosition(next, 800, 400);
      positionHistory.push({ mode: next, pos });
    });

    pinManager.set(false);

    modeManager.cycle();
    modeManager.cycle();
    modeManager.cycle();
    modeManager.cycle();

    expect(modeSequence).toEqual(['compact', 'sidebar', 'mini', 'expanded']);

    const sidebarEntry = positionHistory.find((p) => p.mode === 'sidebar');
    expect(sidebarEntry.pos).toEqual({ x: 0, y: 20 });

    const expandedEntry = positionHistory.find((p) => p.mode === 'expanded');
    expect(expandedEntry.pos).toEqual({ x: 800, y: 400 });
  });

  test('metrics with all zero values produces minimal HTML', () => {
    const metrics = {
      currentGlitchCount: 0,
      currentEntropy: 0,
      currentFlatness: 0,
      currentRTT: 0,
      currentAudioDrops: 0,
    };

    const html = buildMetricsRow(metrics);
    expect(html).toContain('GL:');
    expect(html).toContain('0');
    expect(html).toContain('H:');
    expect(html).toContain('0.00');
    expect(html).toContain('F:');
    expect(html).toContain('0.00');
    expect(html).not.toContain('RTT:');
    expect(html).not.toContain('Drops:');
  });

  test('computeOverlayCSSClass matches OverlayModeManager modes', () => {
    const modes = ['expanded', 'compact', 'sidebar', 'mini'];
    const expectedClasses = ['ssa-expanded', 'ssa-compact', 'ssa-sidebar', 'ssa-mini'];

    modes.forEach((mode, i) => {
      expect(computeOverlayCSSClass(mode)).toBe(expectedClasses[i]);
      expect(OverlayModeManager.isVisible(mode)).toBe(i < 3);
    });
  });

  test('Edge: NaN values in metrics row', () => {
    const metrics = {
      currentGlitchCount: NaN,
      currentEntropy: NaN,
      currentFlatness: NaN,
      currentRTT: 50,
      currentAudioDrops: 0,
    };

    const html = buildMetricsRow(metrics);
    expect(html).toContain('GL:');
  });

  test('Edge: Extremely large values', () => {
    const metrics = {
      currentGlitchCount: 999999999,
      currentEntropy: 999.999,
      currentFlatness: 999.999,
      currentRTT: 99999,
      currentAudioDrops: 99999,
    };

    const html = buildMetricsRow(metrics);
    expect(html).toContain('999999999');
    expect(html).toContain('1000.00');
    expect(html).toContain('99999ms');
  });
});

