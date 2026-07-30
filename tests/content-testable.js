// content-testable.js — Pure logic extracted from content.js for testing
// No browser APIs, no chrome.* — pure functions

// ======================== Overlay State Manager ========================

const OVERLAY_MODES = ['expanded', 'compact', 'sidebar', 'mini'];

/**
 * Extract overlayModeManager as pure module
 */
class OverlayModeManager {
  constructor(initialMode = 'expanded') {
    this.mode = initialMode;
    this.listeners = [];
  }

  getMode() { return this.mode; }

  setMode(mode) {
    if (!OVERLAY_MODES.includes(mode)) {
      throw new Error(`Invalid overlay mode: ${mode}`);
    }
    const prev = this.mode;
    this.mode = mode;
    this.listeners.forEach(fn => fn(prev, mode));
    return prev;
  }

  cycle() {
    const idx = OVERLAY_MODES.indexOf(this.mode);
    const next = OVERLAY_MODES[(idx + 1) % OVERLAY_MODES.length];
    return this.setMode(next);
  }

  onModeChange(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  /**
   * Apply position based on mode — pure function
   */
  static computePosition(mode, currentX, currentY) {
    if (mode === 'sidebar') {
      return { x: 0, y: 20 };
    }
    return { x: currentX, y: currentY };
  }

  /**
   * Compute canvas size based on mode
   */
  static computeCanvasSize(mode) {
    switch (mode) {
      case 'sidebar': return { width: 220, height: 120 };
      case 'compact': return { width: 100, height: 30 };
      case 'mini': return { width: 0, height: 0 };
      default: return { width: 120, height: 30 };
    }
  }

  /**
   * Check if overlay should be visible in this mode
   */
  static isVisible(mode) {
    return mode !== 'mini';
  }

  /**
   * Check if overlay should be draggable in this mode
   */
  static isDraggable(mode, isPinned) {
    if (isPinned) return false;
    if (mode === 'mini') return false;
    return true;
  }
}

// ======================== Pin State Manager ========================

class PinStateManager {
  constructor() {
    this.isPinned = false;
  }

  toggle() {
    this.isPinned = !this.isPinned;
    return this.isPinned;
  }

  set(pinned) {
    this.isPinned = !!pinned;
    return this.isPinned;
  }

  get() { return this.isPinned; }

  /**
   * Check if drag should be allowed
   */
  isDragAllowed(isPinned) {
    return !isPinned;
  }

  /**
   * Get cursor style based on pin state
   */
  getCursorStyle(isPinned) {
    return isPinned ? 'default' : 'grab';
  }

  /**
   * Get opacity based on pin state
   */
  getOpacity(isPinned) {
    return isPinned ? 1.0 : 0.9;
  }
}

// ======================== Metrics Update ========================

/**
 * Glitch state color mapping
 */
function getGlitchColor(state) {
  switch (state) {
    case 'GLITCH': return '#FF007F';
    case 'DRIFT': return '#9D00FF';
    case 'STABLE':
    default: return '#00E5FF';
  }
}

/**
 * Update metrics display data — pure function
 */
function computeMetricsDisplay(data) {
  return {
    currentRMS: data.rms || 0,
    currentGlitchState: data.glitchState || 'STABLE',
    currentGlitchCount: data.glitchCount || 0,
    currentEntropy: data.entropy || 0,
    currentFlatness: data.flatness || 0,
    currentRTT: data.rtt || 0,
    currentAudioDrops: data.audioDrops || 0,
  };
}

/**
 * Compute metrics HTML row based on mode
 */
function computeMetricsHtml(metrics, mode) {
  const { currentGlitchCount, currentEntropy, currentFlatness, currentRTT, currentAudioDrops, currentGlitchState } = metrics;

  const parts = [
    `<span class="ssa-metric-item"><span class="ssa-metric-label">GL:</span><span class="ssa-metric-value">${currentGlitchCount}</span></span>`,
    `<span class="ssa-metric-item"><span class="ssa-metric-label">H:</span><span class="ssa-metric-value">${currentEntropy.toFixed(2)}</span></span>`,
    `<span class="ssa-metric-item"><span class="ssa-metric-label">F:</span><span class="ssa-metric-value">${currentFlatness.toFixed(2)}</span></span>`,
  ];

  if (currentRTT > 0) {
    parts.push(`<span class="ssa-metric-item"><span class="ssa-metric-label">RTT:</span><span class="ssa-metric-value">${currentRTT.toFixed(0)}ms</span></span>`);
  }

  if (currentAudioDrops > 0) {
    parts.push(`<span class="ssa-metric-item"><span class="ssa-metric-label">Drops:</span><span class="ssa-metric-value">${currentAudioDrops}</span></span>`);
  }

  // Sidebar mode shows additional State metric
  if (mode === 'sidebar' && currentEntropy > 0) {
    const color = getGlitchColor(currentGlitchState);
    parts.push(`<span class="ssa-metric-item"><span class="ssa-metric-label">State:</span><span class="ssa-metric-value" style="color: ${color}">${currentGlitchState}</span></span>`);
  }

  return parts.join('');
}

/**
 * Compute mode button tooltip
 */
function computeModeBtnTitle(mode) {
  const titles = {
    expanded: 'Switch to Compact',
    compact: 'Switch to Sidebar',
    sidebar: 'Switch to Mini',
    mini: 'Show Overlay',
  };
  return titles[mode] || 'Toggle mode';
}

// ======================== Glitch Timeline Drawing ========================

/**
 * Compute glitch timeline points for canvas drawing
 */
function computeGlitchTimelinePoints(timelineData, width, maxPoints) {
  if (!timelineData || timelineData.length < 2) {
    return [];
  }

  const data = timelineData.slice(-maxPoints);
  const step = width / maxPoints;
  const timelineY = 100 - 10; // bottom offset
  const timelineHeight = 8;

  return data.map((point, i) => ({
    x: i * step,
    y: point.state === 'GLITCH' ? timelineY - timelineHeight : timelineY,
    state: point.state,
  }));
}

/**
 * Compute heatmap row for a frequency band
 */
function computeHeatmapBand(bandData, width, maxPoints) {
  const data = bandData.slice(-maxPoints);
  const step = width / maxPoints;

  return data.map((value, i) => ({
    x: i * step,
    value,
    color: value > 0.7 ? '#FF007F' : value > 0.3 ? '#9D00FF' : '#00E5FF',
  }));
}

// ======================== Overlay CSS Class ========================

/**
 * Compute CSS class suffix based on overlay mode
 */
function computeOverlayCSSClass(mode) {
  const prefixes = {
    expanded: 'ssa-expanded',
    compact: 'ssa-compact',
    sidebar: 'ssa-sidebar',
    mini: 'ssa-mini',
  };
  return prefixes[mode] || 'ssa-expanded';
}

// ======================== Sidebar Metrics ========================

/**
 * Compute sidebar-only State metric HTML
 * Returns empty string if conditions not met
 */
function computeSidebarStateMetric(metrics) {
  if (metrics.currentEntropy <= 0) {
    return '';
  }
  const color = getGlitchColor(metrics.currentGlitchState);
  return `<span class="ssa-metric-item">
    <span class="ssa-metric-label">State:</span>
    <span class="ssa-metric-value" style="color: ${color}">${metrics.currentGlitchState}</span>
  </span>`;
}

// ======================== Mini Badge Logic ========================

/**
 * Compute mini badge position relative to overlay rect
 */
function computeMiniBadgePosition(overlayRect, viewportWidth, viewportHeight) {
  return {
    right: viewportWidth - overlayRect.right + 5,
    bottom: viewportHeight - overlayRect.bottom + 5,
  };
}

// ======================== RMS Normalization ========================

/**
 * Normalize RMS value for canvas rendering (0-1 range)
 */
function normalizeRMS(rms) {
  return Math.min(1, rms * 2);
}

// ======================== Position Clamping ========================

/**
 * Clamp overlay position to viewport bounds
 */
function clampPosition(x, y, overlayWidth, overlayHeight, viewportWidth, viewportHeight) {
  return {
    x: Math.max(0, Math.min(viewportWidth - overlayWidth, x)),
    y: Math.max(0, Math.min(viewportHeight - overlayHeight, y)),
  };
}

// ======================== Drag Offset Calculation ========================

/**
 * Calculate drag offset from mouse event and current position
 */
function computeDragOffset(clientX, clientY, positionX, positionY) {
  return {
    offsetX: clientX - positionX,
    offsetY: clientY - positionY,
  };
}

// ======================== Metrics HTML Builder ========================

/**
 * Build complete metrics HTML row (non-sidebar modes)
 */
function buildMetricsRow(metrics) {
  const {
    currentGlitchCount,
    currentEntropy,
    currentFlatness,
    currentRTT,
    currentAudioDrops,
  } = metrics;

  const parts = [
    `<span class="ssa-metric-item"><span class="ssa-metric-label">GL:</span><span class="ssa-metric-value">${currentGlitchCount}</span></span>`,
    `<span class="ssa-metric-item"><span class="ssa-metric-label">H:</span><span class="ssa-metric-value">${currentEntropy.toFixed(2)}</span></span>`,
    `<span class="ssa-metric-item"><span class="ssa-metric-label">F:</span><span class="ssa-metric-value">${currentFlatness.toFixed(2)}</span></span>`,
  ];

  if (currentRTT > 0) {
    parts.push(`<span class="ssa-metric-item"><span class="ssa-metric-label">RTT:</span><span class="ssa-metric-value">${currentRTT.toFixed(0)}ms</span></span>`);
  }

  if (currentAudioDrops > 0) {
    parts.push(`<span class="ssa-metric-item"><span class="ssa-metric-label">Drops:</span><span class="ssa-metric-value">${currentAudioDrops}</span></span>`);
  }

  return parts.join('');
}

// ======================== Canvas Rendering ========================

/**
 * Compute RMS bar dimensions for canvas
 */
function computeRMSBar(rms, canvasHeight) {
  const normalized = normalizeRMS(rms);
  return {
    height: normalized * canvasHeight * 0.8,
    y: (canvasHeight / 2) - (normalized * canvasHeight * 0.8) / 2,
  };
}

/**
 * Compute canvas center Y
 */
function computeCanvasCenterY(canvasHeight) {
  return canvasHeight / 2;
}

// ======================== Export for testing ========================
module.exports = {
  OverlayModeManager,
  PinStateManager,
  getGlitchColor,
  computeMetricsDisplay,
  computeMetricsHtml,
  computeModeBtnTitle,
  computeGlitchTimelinePoints,
  computeHeatmapBand,
  computeOverlayCSSClass,
  computeSidebarStateMetric,
  computeMiniBadgePosition,
  normalizeRMS,
  clampPosition,
  computeDragOffset,
  buildMetricsRow,
  computeRMSBar,
  computeCanvasCenterY,
};
