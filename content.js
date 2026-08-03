// content.js — Overlay widget for Stream Sensation Analyzer
// Guard: don't run on chrome:// or other non-web URLs
if (location.href.startsWith('chrome://') || location.href.startsWith('chrome-extension://')) {
  if (self.__logger?.forModule('content')) {
    self.__logger.forModule('content').warn('content.js not loaded on non-web page');
  }
  // Prevent any content script code from running
  throw new Error('content.js not supported on this page');
}

const log = (self.__logger?.forModule('content')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[CONTENT]', m, ...a),
  error: (m, ...a) => console.error('[CONTENT]', m, ...a),
};

log.info('content.js loaded on', location.href);

// Guard: prevent double injection (used with chrome.scripting.executeScript in Phase 4)
if (typeof window.__ssaContentInitialized !== 'undefined') {
  log.info('content.js already initialized, skipping duplicate load');
} else {
  window.__ssaContentInitialized = true;
}

let overlayVisible = false;
let overlayPort = null;
let captureActive = false;
let overlayShadow = null; // shadow root for querySelector
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Overlay state
let overlayPosition = { x: window.innerWidth - 220, y: 20 };
let overlayMode = 'expanded'; // 'expanded' | 'compact' | 'mini'
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// (No global handlers — inline handlers are created/removed in mousedown/mouseup)

// Mini badge state
let miniBadgeEl = null;
let miniBadgeVisible = false;
let miniBadgeHideTimer = null;

// Cache DOM references
let overlayEl = null;
let canvasEl = null;
let ctx = null;
let statusDotEl = null;
let statusTextEl = null;
let rmsValueEl = null;
let rmsMiniBarEl = null;
let modeToggleBtnEl = null;
let pinBtnEl = null;
let closeBtnEl = null;

// Metrics for display
let currentRMS = 0;
let currentGlitchState = 'STABLE';
let currentGlitchCount = 0;
let currentEntropy = 0;
let currentFlatness = 0;
let currentRTT = 0;
let currentAudioDrops = 0;

// Cached metric element references (avoid innerHTML thrashing)
let metricGlitchEl = null;
let metricEntropyEl = null;
let metricFlatnessEl = null;
let metricRttEl = null;
let metricDropsEl = null;
let metricEntropyStateEl = null;
let metricAiScoreEl = null;
let currentAiScore = 0;

// Waveform data (from popup metrics)
let leftChannelHistory = new Float32Array(1024);
let rightChannelHistory = new Float32Array(1024);
let waveformBufferLeft = null;
let waveformBufferRight = null;
let pendingWaveformUpdate = false;
let lastWaveformDraw = 0;
const WAVEFORM_DRAW_INTERVAL = 66; // ~15fps

// Glitch timeline data
let glitchTimelineData = []; // {time, state, rms}
let glitchTimelineMax = 200;

// Heatmap data
let heatmapData = [new Float32Array(50), new Float32Array(50), new Float32Array(50)];
let heatmapTimeIndex = 0;
let heatmapDirty = false;
let lastHeatmapDraw = 0;

const OVERLAY_WIDTH = 200;
const OVERLAY_HEIGHT = 50;
const OVERLAY_CANVAS_WIDTH = 200;
const OVERLAY_CANVAS_HEIGHT = 100;
const OVERLAY_MINI_SIZE = 20;
const MINI_BADGE_HIDE_MS = 30000;
const STORAGE_KEY = 'overlayPosition';
const MODE_STORAGE_KEY = 'overlayMode';
const OVERLAY_CSS_GLOBAL = `
  #ssa-overlay:hover { box-shadow: 0 0 18px rgba(0, 229, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.5); }
  #ssa-overlay.dragging { cursor: grabbing; opacity: 0.9; }
`;
const OVERLAY_CSS = `
  .ssa-mini-badge {
    display: none;
    position: fixed;
    z-index: 999998;
    width: ${OVERLAY_MINI_SIZE}px;
    height: ${OVERLAY_MINI_SIZE}px;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .ssa-mini-badge:hover {
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.8);
    transform: scale(1.2);
  }
  .ssa-mini-badge.visible {
    display: block;
  }
  .ssa-mini-badge.hidden {
    opacity: 0;
    pointer-events: none;
  }
  .ssa-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
  }
  .ssa-status-text {
    font-weight: bold;
    margin-right: 8px;
    white-space: nowrap;
    min-width: 55px;
    color: #00E5FF;
  }
  .ssa-rms-value {
    font-weight: bold;
    margin-right: 8px;
    white-space: nowrap;
    font-size: 10px;
    color: #C5C6C7;
  }
  .ssa-rms-mini-bar {
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .ssa-rms-mini-bar-fill {
    height: 100%;
    background: #00E5FF;
    border-radius: 2px;
    transition: width 0.1s ease-out;
    box-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
  }
  .ssa-controls {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .ssa-btn {
    width: 18px;
    height: 18px;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 3px;
    background: rgba(0, 229, 255, 0.08);
    color: #00E5FF;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    padding: 0;
    margin: 0;
    transition: background-color 0.2s, box-shadow 0.2s;
  }
  .ssa-btn:hover {
    background: rgba(0, 229, 255, 0.2);
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
  }
  .ssa-metrics-row {
    display: flex;
    gap: 6px;
    font-size: 9px;
    color: #C5C6C7;
    margin-top: 2px;
    flex-wrap: wrap;
  }
  .ssa-metric-item {
    white-space: nowrap;
  }
  .ssa-metric-label {
    color: #8899AA;
  }
  .ssa-metric-value {
    color: #00E5FF;
    font-weight: bold;
  }
  .ssa-expanded .ssa-metrics-row {
    display: flex;
  }
  .ssa-compact .ssa-metrics-row,
  .ssa-mini-badge ~ .ssa-metrics-row {
    display: none;
  }
`;

// Safe chrome.storage wrapper — guard against undefined in invalid contexts
function safeStorageGet(keys, callback) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(keys, callback);
}

function safeStorageSet(obj) {
  if (!chrome.storage?.local) return;
  chrome.storage.local.set(obj);
}

// === Context Guard ===
function _isContextValid() {
  return !!(chrome.runtime?.id && chrome.storage?.local);
}

function safeChromeAPI(fn, fallback) {
  if (!_isContextValid()) {
    hideOverlay();
    return;
  }
  try {
    return fn();
  } catch (e) {
    if (e.message?.includes('Extension context invalidated')) {
      hideOverlay();
    }
    if (fallback) fallback(e);
  }
}

// === Safe DOM operations wrapper (YouTube compatibility) ===
// YouTube aggressively manipulates DOM which can invalidate extension context
// This wrapper catches all errors and hides overlay on context invalidation
function safeDOM(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    if (e.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
      log.warn('Extension context invalidated during DOM operation, hiding overlay');
      hideOverlay();
    } else {
      log.warn('DOM operation failed:', e.message);
    }
    if (fallback) return fallback();
  }
}

// Save position to storage with debounce
let savePositionTimer = null;
function savePositionDebounce() {
  if (savePositionTimer) clearTimeout(savePositionTimer);
  savePositionTimer = setTimeout(() => {
    safeStorageSet({ [STORAGE_KEY]: overlayPosition });
  }, 500);
}

// Load saved position
function loadPosition() {
  safeStorageGet([STORAGE_KEY], (result) => {
    if (result && result[STORAGE_KEY] && typeof result[STORAGE_KEY] === 'object') {
      overlayPosition = { ...overlayPosition, ...result[STORAGE_KEY] };
    }
  });
}

// Get glitch state color
function getGlitchColor(state) {
  switch (state) {
    case 'GLITCH': return '#FF007F';
    case 'DRIFT': return '#9D00FF';
    case 'STABLE':
    default: return '#00E5FF';
  }
}

// Draw overlay canvas (waveform + glitch timeline)
function drawOverlayCanvas(rms) {
  if (!ctx) return;
  
  const w = canvasEl.width;
  const h = canvasEl.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // Draw simple waveform placeholder (flat line with small bumps)
  const normalizedRMS = Math.min(1, rms * 2);
  const barHeight = normalizedRMS * h * 0.8;
  
  // Center line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  
  // RMS bar
  const color = getGlitchColor(currentGlitchState);
  ctx.fillStyle = color;
  ctx.fillRect(w / 2 - 20, h / 2 - barHeight / 2, 40, barHeight);
  
  // Glitch timeline mini-graph at bottom (only in expanded mode)
  if (overlayMode === 'expanded' && glitchTimelineData.length > 1) {
    const timelineY = h - 10;
    const timelineHeight = 8;
    const step = w / glitchTimelineMax;
    
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < glitchTimelineData.length; i++) {
      const x = i * step;
      const point = glitchTimelineData[i];
      const y = point.state === 'GLITCH' 
        ? timelineY - timelineHeight 
        : timelineY;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
}

// Update overlay display
function updateOverlayDisplay(data) {
  if (!overlayVisible) return;
  
  currentRMS = data.rms || 0;
  currentGlitchState = data.glitchState || 'STABLE';
  currentGlitchCount = data.glitchCount || 0;
  currentEntropy = data.entropy || 0;
  currentFlatness = data.flatness || 0;
  currentRTT = data.rtt || 0;
  currentAudioDrops = data.audioDrops || 0;
  currentAiScore = data.aiScore || 0;
  
  // Update status dot
  if (statusDotEl) {
    statusDotEl.style.background = getGlitchColor(currentGlitchState);
  }
  
  // Update status text
  if (statusTextEl) {
    statusTextEl.textContent = currentGlitchState;
  }
  
  // Update RMS value
  if (rmsValueEl) {
    rmsValueEl.textContent = 'RMS: ' + currentRMS.toFixed(3);
  }
  
  // Update AI Score with color coding
  if (metricAiScoreEl) {
    metricAiScoreEl.textContent = currentAiScore;
    if (currentAiScore >= 70) {
      metricAiScoreEl.style.color = '#FF007F'; // Red - high AI probability
    } else if (currentAiScore >= 40) {
      metricAiScoreEl.style.color = '#FFD700'; // Yellow - moderate
    } else {
      metricAiScoreEl.style.color = '#00E5FF'; // Cyan - low AI probability
    }
  }
  
  // Update mini bar
  if (rmsMiniBarEl) {
    const percentage = Math.min(100, currentRMS * 100);
    rmsMiniBarEl.style.width = percentage + '%';
    rmsMiniBarEl.style.background = getGlitchColor(currentGlitchState);
  }
  
  // Update metrics row (expanded mode) — textContent instead of innerHTML
  if (overlayMode === 'expanded' || overlayMode === 'sidebar') {
    if (metricGlitchEl) metricGlitchEl.textContent = currentGlitchCount;
    if (metricEntropyEl) metricEntropyEl.textContent = currentEntropy.toFixed(2);
    if (metricFlatnessEl) metricFlatnessEl.textContent = currentFlatness.toFixed(2);
    
    // RTT (dynamic)
    if (metricRttEl) {
      if (currentRTT > 0) {
        // Reconstruct the element (label is static)
        const parent = metricRttEl.parentElement;
        if (parent) parent.style.display = '';
        metricRttEl.textContent = currentRTT.toFixed(0) + 'ms';
      } else {
        const parent = metricRttEl.parentElement;
        if (parent) parent.style.display = 'none';
      }
    }
    
    // Audio drops (dynamic)
    if (metricDropsEl) {
      if (currentAudioDrops > 0) {
        const parent = metricDropsEl.parentElement;
        if (parent) parent.style.display = '';
        metricDropsEl.textContent = currentAudioDrops;
      } else {
        const parent = metricDropsEl.parentElement;
        if (parent) parent.style.display = 'none';
      }
    }
    
    // Entropy state (sidebar mode)
    if (metricEntropyStateEl && overlayMode === 'sidebar' && currentEntropy > 0) {
      const parent = metricEntropyStateEl.parentElement;
      if (parent) parent.style.display = '';
      metricEntropyStateEl.textContent = currentGlitchState;
      metricEntropyStateEl.style.color = getGlitchColor(currentGlitchState);
    } else if (metricEntropyStateEl) {
      const parent = metricEntropyStateEl.parentElement;
      if (parent) parent.style.display = 'none';
    }
  }
  
  // Draw on canvas
  drawOverlayCanvas(currentRMS);
}

// Update mini badge color and visibility
function updateMiniBadge() {
  if (!miniBadgeEl) return;
  
  const color = getGlitchColor(currentGlitchState);
  miniBadgeEl.style.background = color;
  miniBadgeEl.style.boxShadow = `0 0 8px ${color}80`;
  
  // Position badge at bottom-right of overlay (use fixed positioning relative to viewport)
  if (overlayEl) {
    const rect = overlayEl.getBoundingClientRect();
    miniBadgeEl.style.position = 'fixed';
    miniBadgeEl.style.right = (window.innerWidth - rect.right + 5) + 'px';
    miniBadgeEl.style.bottom = (window.innerHeight - rect.bottom + 5) + 'px';
    miniBadgeEl.style.left = '';
    miniBadgeEl.style.top = '';
  }
}

// Show mini badge
function showMiniBadge() {
  if (!miniBadgeEl) return;
  
  miniBadgeEl.classList.add('visible');
  miniBadgeEl.classList.remove('hidden');
  miniBadgeVisible = true;
  
  // Clear hide timer
  if (miniBadgeHideTimer) {
    clearTimeout(miniBadgeHideTimer);
    miniBadgeHideTimer = null;
  }
}

// Hide mini badge after delay
function scheduleMiniBadgeHide() {
  if (overlayMode !== 'mini' || !miniBadgeEl) return;
  
  miniBadgeHideTimer = setTimeout(() => {
    miniBadgeEl.classList.add('hidden');
    miniBadgeVisible = false;
  }, MINI_BADGE_HIDE_MS);
}

// Update mode button title
function updateModeBtn() {
  if (!overlayShadow) return;
  const btn = overlayShadow.getElementById('ssa-mode-btn');
  if (!btn) return;
  const titles = {
    expanded: 'Switch to Compact',
    compact: 'Switch to Sidebar',
    sidebar: 'Switch to Mini',
    mini: 'Show Overlay'
  };
  btn.title = titles[overlayMode] || 'Toggle mode';
}

// Cycle through overlay modes
function cycleOverlayMode() {
  const modes = ['expanded', 'compact', 'sidebar', 'mini'];
  const currentIndex = modes.indexOf(overlayMode);
  overlayMode = modes[(currentIndex + 1) % modes.length];
  
  // Save mode to storage
  safeStorageSet({ [MODE_STORAGE_KEY]: overlayMode });
  
  applyOverlayMode();
  updateModeBtn();
}

// Apply overlay mode to DOM
function applyOverlayMode() {
  try {
    if (!overlayEl) return;
    
    // Remove all mode classes
    overlayEl.classList.remove('ssa-expanded', 'ssa-compact', 'ssa-sidebar');
    
    switch (overlayMode) {
      case 'expanded':
        overlayEl.classList.add('ssa-expanded');
        overlayEl.style.display = 'flex';
        overlayEl.style.width = '';
        overlayEl.style.height = '';
        overlayEl.style.flexDirection = '';
        overlayEl.style.minWidth = '200px';
        overlayEl.style.top = '';
      overlayEl.style.left = '';
      overlayEl.style.borderRadius = '6px';
      overlayEl.style.borderLeft = '';
      overlayEl.style.borderRight = '';
      if (miniBadgeEl) miniBadgeEl.style.display = 'none';
      break;
      
    case 'compact':
      overlayEl.classList.add('ssa-compact');
      overlayEl.style.display = 'flex';
      overlayEl.style.width = '';
      overlayEl.style.height = '';
      overlayEl.style.top = '';
      overlayEl.style.left = '';
      if (miniBadgeEl) miniBadgeEl.style.display = 'none';
      break;
      
    case 'sidebar':
      overlayEl.classList.add('ssa-sidebar');
      overlayEl.style.display = 'flex';
      overlayEl.style.flexDirection = 'column';
      overlayEl.style.width = '240px';
      overlayEl.style.minWidth = '240px';
      overlayEl.style.height = 'calc(100vh - 40px)';
      // Position sidebar on the left side
      overlayPosition.x = 0;
      overlayPosition.y = 20;
      overlayEl.style.left = '0px';
      overlayEl.style.top = '20px';
      overlayEl.style.borderRadius = '0';
      overlayEl.style.borderLeft = 'none';
      overlayEl.style.borderRight = '1px solid rgba(0,229,255,0.25)';
      savePosition();
      if (miniBadgeEl) miniBadgeEl.style.display = 'none';
      break;
      
    case 'mini':
      overlayEl.style.display = 'none';
      overlayEl.style.width = '';
      overlayEl.style.height = '';
      overlayEl.style.top = '';
      overlayEl.style.left = '';
      if (miniBadgeEl) {
        miniBadgeEl.style.display = 'block';
        updateMiniBadge();
        showMiniBadge();
      }
      break;
  }
  
  // Toggle visibility of overlay elements based on mode — shadow DOM
  const shadow = overlayEl.shadowRoot;
  const canvas = shadow.getElementById('ssa-overlay-canvas');
  const statusText = shadow.getElementById('ssa-status-text');
  const rmsValue = shadow.getElementById('ssa-rms-value');
  const metricsRow = shadow.querySelector('.ssa-metrics-row');
  
  if (overlayMode === 'compact') {
    if (canvas) {
      canvas.style.transform = 'scale(0.83)';
      canvas.style.transformOrigin = 'top left';
      canvas.style.transformBox = 'fill-box';
    }
    if (statusText) statusText.style.display = 'none';
    if (rmsValue) rmsValue.style.display = 'none';
    if (metricsRow) metricsRow.style.display = 'none';
  } else if (overlayMode === 'sidebar') {
    if (canvas) {
      canvas.style.transform = 'scale(1)';
    }
    if (statusText) statusText.style.display = '';
    if (rmsValue) statusText.style.display = '';
    if (metricsRow) metricsRow.style.display = '';
  } else {
    // expanded
    if (canvas) {
      canvas.style.transform = 'scale(0.55)';
      canvas.style.transformOrigin = 'top left';
      canvas.style.transformBox = 'fill-box';
    }
    if (statusText) statusText.style.display = '';
    if (rmsValue) rmsValue.style.display = '';
    if (metricsRow) metricsRow.style.display = '';
  }
  
  // Fixed internal resolution for canvas — avoids context reset on mode change
  if (canvas) {
    canvas.id = overlayMode === 'sidebar' ? 'ssa-sidebar-canvas' : 'ssa-overlay-canvas';
    canvas.width = 220;
    canvas.height = 120;
    // Only re-init context on first load, not on mode switch
    if (!ctx) {
      ctx = canvas.getContext('2d');
    }
  }
  } // end try
  catch (e) {
    if (e.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
      hideOverlay();
    }
  }
}

// Inject overlay widget into the page using Shadow DOM (site cannot destroy it)
function injectOverlay() {
  try {
    if (overlayEl) return; // Already injected
    
    // Pin state — declared at top to avoid TDZ ReferenceError
    let isPinned = false;
    
    // Load saved mode
    safeStorageGet([MODE_STORAGE_KEY], (result) => {
      if (result && result[MODE_STORAGE_KEY] && ['expanded', 'compact', 'sidebar', 'mini'].includes(result[MODE_STORAGE_KEY])) {
        overlayMode = result[MODE_STORAGE_KEY];
      }
    });
  
  // Create overlay element
  overlayEl = document.createElement('div');
  overlayEl.id = 'ssa-overlay';
  overlayEl.style.left = overlayPosition.x + 'px';
  overlayEl.style.top = overlayPosition.y + 'px';
  overlayEl.classList.add('ssa-' + overlayMode);
  
  // Use Shadow DOM — site DOM manipulation cannot destroy our content
  const shadow = overlayEl.attachShadow({ mode: 'open' });
  overlayShadow = shadow;
  
  // Inject global CSS for shadow host (:hover, :dragging) — guard against duplicates
  if (!document.getElementById('ssa-overlay-style')) {
    const globalStyle = document.createElement('style');
    globalStyle.id = 'ssa-overlay-style';
    globalStyle.textContent = OVERLAY_CSS_GLOBAL;
    document.head.appendChild(globalStyle);
  }
  
  // Inject shadow-internal CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);
  
  // Create overlay content inside shadow root
  shadow.innerHTML = `
    <div id="ssa-host" style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;">
      <canvas id="ssa-overlay-canvas" width="120" height="30"></canvas>
      <div class="ssa-status-dot" id="ssa-status-dot"></div>
      <span class="ssa-status-text" id="ssa-status-text">STABLE</span>
      <span class="ssa-rms-value" id="ssa-rms-value">RMS: 0.000</span>
      <div class="ssa-rms-mini-bar">
        <div class="ssa-rms-mini-bar-fill" id="ssa-rms-mini-bar-fill" style="width: 0%;"></div>
      </div>
      <div class="ssa-metrics-row">
        <span class="ssa-metric-item"><span class="ssa-metric-label">GL:</span><span class="ssa-metric-value"></span></span>
        <span class="ssa-metric-item"><span class="ssa-metric-label">H:</span><span class="ssa-metric-value"></span></span>
        <span class="ssa-metric-item"><span class="ssa-metric-label">F:</span><span class="ssa-metric-value"></span></span>
        <span class="ssa-metric-item"><span class="ssa-metric-label">AI:</span><span class="ssa-metric-value"></span></span>
        <span class="ssa-metric-item" style="display:none"><span class="ssa-metric-label">RTT:</span><span class="ssa-metric-value"></span></span>
        <span class="ssa-metric-item" style="display:none"><span class="ssa-metric-label">Drops:</span><span class="ssa-metric-value"></span></span>
        <span class="ssa-metric-item" style="display:none"><span class="ssa-metric-label">State:</span><span class="ssa-metric-value"></span></span>
      </div>
      <div class="ssa-controls">
        <button class="ssa-btn" id="ssa-mode-btn" title="Toggle mode">⊞</button>
        <button class="ssa-btn" id="ssa-pin-btn" title="Pin overlay">📌</button>
        <button class="ssa-btn" id="ssa-close-btn" title="Close">X</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlayEl);
  
  // Apply shadow-host styles directly (was previously in CSS)
  overlayEl.style.cssText = `position:fixed;z-index:999999;background:rgba(11,12,16,0.9);border:1px solid rgba(0,229,255,0.25);border-radius:6px;box-shadow:0 0 12px rgba(0,229,255,0.15),0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:space-between;padding:4px 8px;font-family:system-ui,-apple-system,sans-serif;font-size:10px;color:#fff;user-select:none;cursor:grab;min-width:200px;transition:min-width 0.2s ease,box-shadow 0.3s ease,opacity 0.3s ease;left:${overlayPosition.x}px;top:${overlayPosition.y}px;`;
  
  // Cache element references — they are inside shadow root!
  const host = shadow.getElementById('ssa-host');
  canvasEl = shadow.getElementById('ssa-overlay-canvas');
  ctx = canvasEl ? canvasEl.getContext('2d') : null;
  statusDotEl = shadow.getElementById('ssa-status-dot');
  statusTextEl = shadow.getElementById('ssa-status-text');
  rmsValueEl = shadow.getElementById('ssa-rms-value');
  rmsMiniBarEl = shadow.getElementById('ssa-rms-mini-bar-fill');
  modeToggleBtnEl = shadow.getElementById('ssa-mode-btn');
  pinBtnEl = shadow.getElementById('ssa-pin-btn');
  closeBtnEl = shadow.getElementById('ssa-close-btn');
  
  // Cache metric value elements for textContent updates (no innerHTML)
  const metricsRowEl = shadow.querySelector('.ssa-metrics-row');
  if (metricsRowEl && !metricGlitchEl) {
    const spans = metricsRowEl.querySelectorAll('.ssa-metric-value');
    if (spans.length >= 4) {
      metricGlitchEl = spans[0];
      metricEntropyEl = spans[1];
      metricFlatnessEl = spans[2];
      metricAiScoreEl = spans[3];
      if (spans[4]) metricRttEl = spans[4];
      if (spans[5]) metricDropsEl = spans[5];
      if (spans[6]) metricEntropyStateEl = spans[6];
    }
  }
  
  // Create mini badge — also in shadow DOM
  const miniBadgeShadow = document.createElement('div');
  miniBadgeShadow.id = 'ssa-mini-badge';
  miniBadgeShadow.className = 'ssa-mini-badge';
  shadow.appendChild(miniBadgeShadow);
  miniBadgeEl = miniBadgeShadow;
  
  // Mini badge click → show overlay
  miniBadgeEl.addEventListener('click', () => {
    if (overlayMode === 'mini') {
      overlayMode = 'expanded';
      safeStorageSet({ [MODE_STORAGE_KEY]: overlayMode });
      applyOverlayMode();
      showOverlay();
    }
  });
  
  // Mini badge hover → show temporarily
  miniBadgeEl.addEventListener('mouseenter', showMiniBadge);
  
  // Drag handling — shadow root, use composed path
  overlayEl.addEventListener('mousedown', (e) => {
    // Don't drag when clicking controls or when pinned
    const path = e.composedPath();
    const target = path[0];
    if (target.closest && target.closest('.ssa-controls')) return;
    if (isPinned) return;
    
    isDragging = true;
    dragOffsetX = e.clientX - overlayPosition.x;
    dragOffsetY = e.clientY - overlayPosition.y;
    overlayEl.classList.add('dragging');
    e.preventDefault();
    
    // Inline handlers attached here, removed on mouseup — prevents duplicates
    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      
      overlayPosition.x = moveEvent.clientX - dragOffsetX;
      overlayPosition.y = moveEvent.clientY - dragOffsetY;
      
      // Clamp to viewport
      overlayPosition.x = Math.max(0, Math.min(window.innerWidth - OVERLAY_WIDTH, overlayPosition.x));
      overlayPosition.y = Math.max(0, Math.min(window.innerHeight - OVERLAY_HEIGHT, overlayPosition.y));
      
      overlayEl.style.left = overlayPosition.x + 'px';
      overlayEl.style.top = overlayPosition.y + 'px';
      
      // Update mini badge position
      if (overlayMode === 'mini') updateMiniBadge();
      
      savePositionDebounce();
    };
    
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      overlayEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      savePosition();
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  // Mode toggle button
  if (modeToggleBtnEl) {
    modeToggleBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleOverlayMode();
    });
  }
  
  // Pin button — locks overlay position (prevents drag)
  if (pinBtnEl) {
    pinBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      isPinned = !isPinned;
      pinBtnEl.textContent = isPinned ? '📍' : '📌';
      pinBtnEl.style.background = isPinned ? 'rgba(0, 229, 255, 0.3)' : '';
      overlayEl.style.cursor = isPinned ? 'default' : 'grab';
      overlayEl.style.opacity = isPinned ? '1' : '0.9';
    });
  }
  
  // Close button
  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      hideOverlay();
    });
  }
  } // end try
  catch (e) {
    if (e.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
      hideOverlay();
    }
  }
}

// Save position to storage
function savePosition() {
  safeStorageSet({ [STORAGE_KEY]: overlayPosition });
}

// Show overlay
function showOverlay() {
  try {
    log.info('showOverlay() called');
    if (overlayVisible) return;
    
    loadPosition();
    injectOverlay();
    overlayVisible = true;
    
    applyOverlayMode();
    
    // Apply position based on mode
    if (overlayMode === 'sidebar') {
      overlayPosition.x = 0;
      overlayPosition.y = 20;
    }
    overlayEl.style.left = overlayPosition.x + 'px';
    overlayEl.style.top = overlayPosition.y + 'px';
    
    // Connect to background for metrics
    connectToMetrics();
    
    // Schedule mini badge auto-hide if in mini mode
    if (overlayMode === 'mini') {
      scheduleMiniBadgeHide();
    }
  } // end try
  catch (e) {
    if (e.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
      hideOverlay();
    }
  }
}

// Hide overlay
function hideOverlay() {
  if (!overlayVisible) return;
  
  overlayVisible = false;
  
  // Full cleanup on hide: cancel rAF, remove DOM, clear all references
  destroyOverlay();
}

// === Full overlay destruction (Section 4 — Content.js Context Guard) ===
// Called on context invalidation, hide, or max reconnect attempts.
// Performs complete cleanup: cancels rAF, removes Shadow DOM, nulls all cached refs.
function destroyOverlay() {
  // Cancel any pending rAF (waveform draw timers)
  // Note: we don't have a stored rAF handle, but we clear the flag
  pendingOscDraw = null;
  pendingWaveformUpdate = false;
  
  // Disconnect metrics port
  if (overlayPort) {
    try { overlayPort.disconnect(); } catch (_) {}
    overlayPort = null;
  }
  
  // Remove Shadow DOM overlay from page
  if (overlayEl) {
    try { overlayEl.remove(); } catch (_) {}
    overlayEl = null;
  }
  overlayShadow = null;
  
  // Remove mini badge
  if (miniBadgeEl) {
    try { miniBadgeEl.remove(); } catch (_) {}
    miniBadgeEl = null;
  }
  
  // Remove global style (if still present)
  const styleEl = document.getElementById('ssa-overlay-style');
  if (styleEl) {
    try { styleEl.remove(); } catch (_) {}
  }
  
  // Clear hide timer
  if (miniBadgeHideTimer) {
    clearTimeout(miniBadgeHideTimer);
    miniBadgeHideTimer = null;
  }
  
  // Null all cached DOM references to prevent stale access
  canvasEl = null;
  ctx = null;
  statusDotEl = null;
  statusTextEl = null;
  rmsValueEl = null;
  rmsMiniBarEl = null;
  modeToggleBtnEl = null;
  pinBtnEl = null;
  closeBtnEl = null;
  metricGlitchEl = null;
  metricEntropyEl = null;
  metricFlatnessEl = null;
  metricRttEl = null;
  metricDropsEl = null;
  metricEntropyStateEl = null;
  metricAiScoreEl = null;
  
  // Clear state
  captureActive = false;
  reconnectAttempts = 0;
}

// Toggle overlay visibility
function toggleOverlay() {
  if (overlayVisible) {
    hideOverlay();
  } else {
    showOverlay();
  }
}

// Disconnect from metrics relay
function disconnectMetrics() {
  if (overlayPort) {
    overlayPort.disconnect();
    overlayPort = null;
  }
}

// Connect to background for metrics
function connectToMetrics() {
  // Guard: extension context invalidated (SW restart / extension update)
  if (!_isContextValid()) {
    log.warn('Context invalid, not connecting');
    hideOverlay();
    return;
  }
  
  if (overlayPort) return;
  
  try {
    overlayPort = chrome.runtime.connect({ name: 'overlay-metrics' });
  } catch (e) {
    // Context invalidated during connect
    hideOverlay();
    return;
  }
  // Always consume lastError to prevent console spam
  void chrome.runtime.lastError;
  
  log.info('connectToMetrics()');
  log.info('overlayPort connected');
  
  overlayPort.onMessage.addListener((data) => {
    if (data && data.type === 'METRICS') {
      reconnectAttempts = 0; // Reset on successful message
      log.debug('Received METRICS:', data.glitchState, data.rms?.toFixed(3));
      updateOverlayDisplay(data);
    }
  });
  
  overlayPort.onDisconnect.addListener(() => {
    overlayPort = null;
    
    // Context invalidated — perform full cleanup, do NOT reconnect
    if (!_isContextValid()) {
      log.warn('Context invalidated on disconnect — performing full cleanup');
      destroyOverlay();
      return;
    }
    
    // Otherwise, try reconnect with exponential backoff
    if (overlayVisible && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = 2000 * reconnectAttempts; // Exponential backoff
      setTimeout(() => {
        if (overlayVisible && chrome.runtime?.id && _isContextValid()) {
          connectToMetrics();
        }
      }, delay);
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log.error('Max reconnect attempts reached, hiding overlay');
      destroyOverlay();
    } else {
      // Disconnect for unknown reason — hide overlay
      destroyOverlay();
    }
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log.debug('onMessage received:', message?.type, 'from:', sender?.id);
  if (message.type === '_SSA_SHOW_OVERLAY') {
    log.info('_SSA_SHOW_OVERLAY received');
    captureActive = true;
    showOverlay();
    sendResponse({ ok: true });
  }
  
  if (message.type === '_SSA_HIDE_OVERLAY') {
    log.info('_SSA_HIDE_OVERLAY received');
    captureActive = false;
    hideOverlay();
    sendResponse({ ok: true });
  }
  
  return false;
});

// Also listen for extension icon click to toggle overlay
// Also listen for extension icon click to toggle overlay
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'overlay-toggle') {
    port.onMessage.addListener((data) => {
      if (data && data.type === 'TOGGLE') {
        toggleOverlay();
      }
    });
  }
  
  // Detect orphan overlay after extension reload (TK-6)
  // If overlay still exists when new connection is established,
  // it means the old content.js didn't clean up properly
  if (port.name === 'overlay-metrics' && overlayEl) {
    log.info('Orphan overlay detected after reload, destroying');
    destroyOverlay();
  }
});

// Auto-hide when page is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && overlayVisible) {
    hideOverlay();
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  if (miniBadgeEl) {
    miniBadgeEl.remove();
    miniBadgeEl = null;
  }
  const styleEl = document.getElementById('ssa-overlay-style');
  if (styleEl) styleEl.remove();
});

// === Extension context invalidation handling (Phase 2.4) ===
// Suppresses uncaught errors from DOM operations after extension update/restart
// Hides overlay silently — no console spam
window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
    // destroyOverlay() (via hideOverlay()) already removes style element — no duplicate cleanup
    hideOverlay();
  }
});

// === YouTube-specific error handling ===
// YouTube's aggressive DOM manipulation can cause errors when we access shadow DOM
// Wrap all overlay operations in try-catch to prevent uncaught errors
function safeOverlayOperation(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    if (e.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
      log.warn('Extension context invalidated during overlay operation');
      hideOverlay();
    } else {
      log.warn('Safe operation failed:', e.message);
    }
    if (fallback) return fallback();
  }
}