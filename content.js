// content.js — Overlay widget for Stream Sensation Analyzer
const log = (self.__logger?.forModule('content')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[CONTENT]', m, ...a),
  error: (m, ...a) => console.error('[CONTENT]', m, ...a),
};

let overlayVisible = false;
let overlayPort = null;
let captureActive = false;

// Overlay state
let overlayPosition = { x: window.innerWidth - 220, y: 20 };
let overlayMode = 'expanded'; // 'expanded' | 'compact' | 'mini'
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

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
const OVERLAY_CSS = `
  #ssa-overlay {
    position: fixed;
    z-index: 999999;
    background: rgba(11, 12, 16, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 10px;
    color: #FFFFFF;
    user-select: none;
    cursor: grab;
    min-width: 200px;
    transition: min-width 0.2s ease, box-shadow 0.3s ease, opacity 0.3s ease;
  }
  #ssa-overlay:hover {
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.5);
  }
  #ssa-overlay.dragging {
    cursor: grabbing;
    opacity: 0.9;
  }
  #ssa-overlay.ssa-compact {
    min-width: auto;
    padding: 3px 6px;
  }
  #ssa-overlay.ssa-expanded {
    min-width: 200px;
  }
  #ssa-overlay-canvas {
    width: 200px;
    height: 100px;
    border-radius: 4px;
    margin-right: 6px;
    background: rgba(0, 0, 0, 0.4);
    filter: drop-shadow(0 0 3px rgba(0, 229, 255, 0.3));
    flex-shrink: 0;
  }
  .ssa-compact #ssa-overlay-canvas {
    width: 100px;
    height: 30px;
  }
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

// Save position to storage with debounce
let savePositionTimer = null;
function savePositionDebounce() {
  if (savePositionTimer) clearTimeout(savePositionTimer);
  savePositionTimer = setTimeout(() => {
    chrome.storage.local.set({ [STORAGE_KEY]: overlayPosition });
  }, 500);
}

// Load saved position
function loadPosition() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY] && typeof result[STORAGE_KEY] === 'object') {
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
  
  // Update mini bar
  if (rmsMiniBarEl) {
    const percentage = Math.min(100, currentRMS * 100);
    rmsMiniBarEl.style.width = percentage + '%';
    rmsMiniBarEl.style.background = getGlitchColor(currentGlitchState);
  }
  
  // Update metrics row (expanded mode)
  if (overlayMode === 'expanded') {
    const metricsEl = overlayEl.querySelector('.ssa-metrics-row');
    if (metricsEl) {
      metricsEl.innerHTML = `
        <span class="ssa-metric-item">
          <span class="ssa-metric-label">GL:</span>
          <span class="ssa-metric-value">${currentGlitchCount}</span>
        </span>
        <span class="ssa-metric-item">
          <span class="ssa-metric-label">H:</span>
          <span class="ssa-metric-value">${currentEntropy.toFixed(2)}</span>
        </span>
        <span class="ssa-metric-item">
          <span class="ssa-metric-label">F:</span>
          <span class="ssa-metric-value">${currentFlatness.toFixed(2)}</span>
        </span>
        ${currentRTT > 0 ? `
        <span class="ssa-metric-item">
          <span class="ssa-metric-label">RTT:</span>
          <span class="ssa-metric-value">${currentRTT.toFixed(0)}ms</span>
        </span>` : ''}
        ${currentAudioDrops > 0 ? `
        <span class="ssa-metric-item">
          <span class="ssa-metric-label">Drops:</span>
          <span class="ssa-metric-value">${currentAudioDrops}</span>
        </span>` : ''}
      `;
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
  
  // Position badge at bottom-right of overlay
  if (overlayEl) {
    const rect = overlayEl.getBoundingClientRect();
    miniBadgeEl.style.right = (window.innerWidth - rect.right - 5) + 'px';
    miniBadgeEl.style.bottom = (window.innerHeight - rect.bottom + 5) + 'px';
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

// Cycle through overlay modes
function cycleOverlayMode() {
  const modes = ['expanded', 'compact', 'mini'];
  const currentIndex = modes.indexOf(overlayMode);
  overlayMode = modes[(currentIndex + 1) % modes.length];
  
  // Save mode to storage
  chrome.storage.local.set({ [MODE_STORAGE_KEY]: overlayMode });
  
  applyOverlayMode();
}

// Apply overlay mode to DOM
function applyOverlayMode() {
  if (!overlayEl) return;
  
  // Remove all mode classes
  overlayEl.classList.remove('ssa-expanded', 'ssa-compact');
  
  switch (overlayMode) {
    case 'expanded':
      overlayEl.classList.add('ssa-expanded');
      overlayEl.style.display = 'flex';
      if (miniBadgeEl) miniBadgeEl.style.display = 'none';
      break;
      
    case 'compact':
      overlayEl.classList.add('ssa-compact');
      overlayEl.style.display = 'flex';
      if (miniBadgeEl) miniBadgeEl.style.display = 'none';
      break;
      
    case 'mini':
      overlayEl.style.display = 'none';
      if (miniBadgeEl) {
        miniBadgeEl.style.display = 'block';
        updateMiniBadge();
        showMiniBadge();
      }
      break;
  }
  
  // Toggle visibility of overlay elements based on mode
  const canvas = overlayEl.querySelector('#ssa-overlay-canvas');
  const statusText = overlayEl.querySelector('#ssa-status-text');
  const rmsValue = overlayEl.querySelector('#ssa-rms-value');
  const metricsRow = overlayEl.querySelector('.ssa-metrics-row');
  
  if (overlayMode === 'compact') {
    if (canvas) canvas.style.width = '100px';
    if (statusText) statusText.style.display = 'none';
    if (rmsValue) rmsValue.style.display = 'none';
    if (metricsRow) metricsRow.style.display = 'none';
  } else {
    if (canvas) canvas.style.width = '';
    if (statusText) statusText.style.display = '';
    if (rmsValue) rmsValue.style.display = '';
    if (metricsRow) metricsRow.style.display = '';
  }
}

// Inject overlay widget into the page
function injectOverlay() {
  if (overlayEl) return; // Already injected
  
  // Load saved mode
  chrome.storage.local.get([MODE_STORAGE_KEY], (result) => {
    if (result[MODE_STORAGE_KEY] && ['expanded', 'compact', 'mini'].includes(result[MODE_STORAGE_KEY])) {
      overlayMode = result[MODE_STORAGE_KEY];
    }
  });
  
  // Inject CSS
  const styleEl = document.createElement('style');
  styleEl.id = 'ssa-overlay-style';
  styleEl.textContent = OVERLAY_CSS;
  document.head.appendChild(styleEl);
  
  // Create overlay element
  overlayEl = document.createElement('div');
  overlayEl.id = 'ssa-overlay';
  overlayEl.style.left = overlayPosition.x + 'px';
  overlayEl.style.top = overlayPosition.y + 'px';
  overlayEl.classList.add('ssa-' + overlayMode);
  
  overlayEl.innerHTML = `
    <canvas id="ssa-overlay-canvas" width="120" height="30"></canvas>
    <div class="ssa-status-dot" id="ssa-status-dot"></div>
    <span class="ssa-status-text" id="ssa-status-text">STABLE</span>
    <span class="ssa-rms-value" id="ssa-rms-value">RMS: 0.000</span>
    <div class="ssa-rms-mini-bar">
      <div class="ssa-rms-mini-bar-fill" id="ssa-rms-mini-bar-fill" style="width: 0%;"></div>
    </div>
    <div class="ssa-metrics-row"></div>
    <div class="ssa-controls">
      <button class="ssa-btn" id="ssa-mode-btn" title="Toggle mode">⊞</button>
      <button class="ssa-btn" id="ssa-pin-btn" title="Pin overlay">📌</button>
      <button class="ssa-btn" id="ssa-close-btn" title="Close">X</button>
    </div>
  `;
  
  document.body.appendChild(overlayEl);
  
  // Cache element references
  canvasEl = document.getElementById('ssa-overlay-canvas');
  ctx = canvasEl ? canvasEl.getContext('2d') : null;
  statusDotEl = document.getElementById('ssa-status-dot');
  statusTextEl = document.getElementById('ssa-status-text');
  rmsValueEl = document.getElementById('ssa-rms-value');
  rmsMiniBarEl = document.getElementById('ssa-rms-mini-bar-fill');
  modeToggleBtnEl = document.getElementById('ssa-mode-btn');
  pinBtnEl = document.getElementById('ssa-pin-btn');
  closeBtnEl = document.getElementById('ssa-close-btn');
  
  // Create mini badge
  miniBadgeEl = document.createElement('div');
  miniBadgeEl.id = 'ssa-mini-badge';
  miniBadgeEl.className = 'ssa-mini-badge';
  document.body.appendChild(miniBadgeEl);
  
  // Mini badge click → show overlay
  miniBadgeEl.addEventListener('click', () => {
    if (overlayMode === 'mini') {
      overlayMode = 'expanded';
      chrome.storage.local.set({ [MODE_STORAGE_KEY]: overlayMode });
      applyOverlayMode();
      showOverlay();
    }
  });
  
  // Mini badge hover → show temporarily
  miniBadgeEl.addEventListener('mouseenter', showMiniBadge);
  
  // Drag handling
  overlayEl.addEventListener('mousedown', (e) => {
    // Don't drag when clicking controls
    if (e.target.closest('.ssa-controls')) return;
    
    isDragging = true;
    dragOffsetX = e.clientX - overlayPosition.x;
    dragOffsetY = e.clientY - overlayPosition.y;
    overlayEl.classList.add('dragging');
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    overlayPosition.x = e.clientX - dragOffsetX;
    overlayPosition.y = e.clientY - dragOffsetY;
    
    // Clamp to viewport
    overlayPosition.x = Math.max(0, Math.min(window.innerWidth - OVERLAY_WIDTH, overlayPosition.x));
    overlayPosition.y = Math.max(0, Math.min(window.innerHeight - OVERLAY_HEIGHT, overlayPosition.y));
    
    overlayEl.style.left = overlayPosition.x + 'px';
    overlayEl.style.top = overlayPosition.y + 'px';
    
    // Update mini badge position
    if (overlayMode === 'mini') updateMiniBadge();
    
    savePositionDebounce();
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      overlayEl.classList.remove('dragging');
      savePosition();
    }
  });
  
  // Mode toggle button
  if (modeToggleBtnEl) {
    modeToggleBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleOverlayMode();
    });
  }
  
  // Pin button
  let isPinned = false;
  if (pinBtnEl) {
    pinBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      isPinned = !isPinned;
      pinBtnEl.textContent = isPinned ? '📍' : '📌';
      pinBtnEl.style.background = isPinned ? 'rgba(0, 229, 255, 0.3)' : '';
    });
  }
  
  // Close button
  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      hideOverlay();
    });
  }
}

// Save position to storage
function savePosition() {
  chrome.storage.local.set({ [STORAGE_KEY]: overlayPosition });
}

// Show overlay
function showOverlay() {
  if (overlayVisible) return;
  
  loadPosition();
  injectOverlay();
  overlayVisible = true;
  
  applyOverlayMode();
  
  // Reset to saved position
  overlayEl.style.left = overlayPosition.x + 'px';
  overlayEl.style.top = overlayPosition.y + 'px';
  
  // Connect to background for metrics
  connectToMetrics();
  
  // Schedule mini badge auto-hide if in mini mode
  if (overlayMode === 'mini') {
    scheduleMiniBadgeHide();
  }
}

// Hide overlay
function hideOverlay() {
  if (!overlayVisible) return;
  
  overlayVisible = false;
  
  if (overlayEl) {
    overlayEl.style.display = 'none';
  }
  
  // Hide mini badge
  if (miniBadgeEl) {
    miniBadgeEl.classList.remove('visible', 'hidden');
    miniBadgeEl.style.display = 'none';
  }
  
  // Clear hide timer
  if (miniBadgeHideTimer) {
    clearTimeout(miniBadgeHideTimer);
    miniBadgeHideTimer = null;
  }
  
  // Disconnect metrics port
  if (overlayPort) {
    overlayPort.disconnect();
    overlayPort = null;
  }
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
  if (overlayPort) return;
  
  overlayPort = chrome.runtime.connect({ name: 'overlay-metrics' });
  
  overlayPort.onMessage.addListener((data) => {
    if (data && data.type === 'METRICS') {
      updateOverlayDisplay(data);
    }
  });
  
  overlayPort.onDisconnect.addListener(() => {
    overlayPort = null;
    // Reconnect after 2s if overlay is still visible
    if (overlayVisible) {
      setTimeout(() => {
        if (overlayVisible) {
          connectToMetrics();
        }
      }, 2000);
    }
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === '_SSA_SHOW_OVERLAY') {
    captureActive = true;
    showOverlay();
    sendResponse({ ok: true });
  }
  
  if (message.type === '_SSA_HIDE_OVERLAY') {
    captureActive = false;
    hideOverlay();
    sendResponse({ ok: true });
  }
  
  return false;
});

// Also listen for extension icon click to toggle overlay
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'overlay-toggle') {
    port.onMessage.addListener((data) => {
      if (data && data.type === 'TOGGLE') {
        toggleOverlay();
      }
    });
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


