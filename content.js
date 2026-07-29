// content.js — Overlay widget for Stream Sensation Analyzer
// Injects a draggable Canvas widget on web pages when capture is active

let overlayVisible = false;
let overlayCollapsed = false;
let overlayPort = null;
let captureActive = false;

// Overlay state
let overlayPosition = { x: window.innerWidth - 220, y: 20 };
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Cache DOM references
let overlayEl = null;
let canvasEl = null;
let ctx = null;
let statusDotEl = null;
let statusTextEl = null;
let rmsValueEl = null;
let rmsMiniBarEl = null;
let collapseBtnEl = null;
let closeBtnEl = null;

// Metrics for display
let currentRMS = 0;
let currentGlitchState = 'STABLE';
let currentGlitchCount = 0;

const OVERLAY_WIDTH = 200;
const OVERLAY_COLLAPSED_WIDTH = 60;
const OVERLAY_HEIGHT = 50;
const STORAGE_KEY = 'overlayPosition';
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
    min-width: 60px;
    transition: min-width 0.2s ease, box-shadow 0.3s ease;
  }
  #ssa-overlay:hover {
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.5);
  }
  #ssa-overlay.dragging {
    cursor: grabbing;
    opacity: 0.9;
  }
  #ssa-overlay.collapsed {
    min-width: 60px;
  }
  #ssa-overlay-canvas {
    width: 120px;
    height: 30px;
    border-radius: 4px;
    margin-right: 6px;
    background: rgba(0, 0, 0, 0.4);
    filter: drop-shadow(0 0 3px rgba(0, 229, 255, 0.3));
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

// Draw mini RMS bar on canvas
function drawMiniBar(rms) {
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
}

// Update overlay display
function updateOverlayDisplay(data) {
  if (!overlayVisible) return;
  
  currentRMS = data.rms || 0;
  currentGlitchState = data.glitchState || 'STABLE';
  currentGlitchCount = data.glitchCount || 0;
  
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
  
  // Draw on canvas
  drawMiniBar(currentRMS);
}

// Inject overlay widget into the page
function injectOverlay() {
  if (overlayEl) return; // Already injected
  
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
  
  overlayEl.innerHTML = `
    <canvas id="ssa-overlay-canvas" width="120" height="30"></canvas>
    <div class="ssa-status-dot" id="ssa-status-dot"></div>
    <span class="ssa-status-text" id="ssa-status-text">STABLE</span>
    <span class="ssa-rms-value" id="ssa-rms-value">RMS: 0.000</span>
    <div class="ssa-rms-mini-bar">
      <div class="ssa-rms-mini-bar-fill" id="ssa-rms-mini-bar-fill" style="width: 0%;"></div>
    </div>
    <div class="ssa-controls">
      <button class="ssa-btn" id="ssa-collapse-btn" title="Collapse">[-]</button>
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
  collapseBtnEl = document.getElementById('ssa-collapse-btn');
  closeBtnEl = document.getElementById('ssa-close-btn');
  
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
    overlayPosition.x = Math.max(0, Math.min(window.innerWidth - OVERLAY_COLLAPSED_WIDTH, overlayPosition.x));
    overlayPosition.y = Math.max(0, Math.min(window.innerHeight - OVERLAY_HEIGHT, overlayPosition.y));
    
    overlayEl.style.left = overlayPosition.x + 'px';
    overlayEl.style.top = overlayPosition.y + 'px';
    
    savePositionDebounce();
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      overlayEl.classList.remove('dragging');
      savePosition();
    }
  });
  
  // Collapse button
  if (collapseBtnEl) {
    collapseBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCollapse();
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

// Toggle collapse state
function toggleCollapse() {
  if (!overlayEl) return;
  
  overlayCollapsed = !overlayCollapsed;
  
  if (overlayCollapsed) {
    overlayEl.classList.add('collapsed');
    if (canvasEl) canvasEl.style.display = 'none';
    if (statusTextEl) statusTextEl.style.display = 'none';
    if (rmsValueEl) rmsValueEl.style.display = 'none';
    if (rmsMiniBarEl && rmsMiniBarEl.parentElement) rmsMiniBarEl.parentElement.style.display = 'none';
  } else {
    overlayEl.classList.remove('collapsed');
    if (canvasEl) canvasEl.style.display = '';
    if (statusTextEl) statusTextEl.style.display = '';
    if (rmsValueEl) rmsValueEl.style.display = '';
    if (rmsMiniBarEl && rmsMiniBarEl.parentElement) rmsMiniBarEl.parentElement.style.display = '';
  }
  
  savePosition();
}

// Show overlay
function showOverlay() {
  if (overlayVisible) return;
  
  loadPosition();
  injectOverlay();
  overlayVisible = true;
  overlayCollapsed = false;
  
  // Restore visibility
  if (canvasEl) canvasEl.style.display = '';
  if (statusTextEl) statusTextEl.style.display = '';
  if (rmsValueEl) rmsValueEl.style.display = '';
  if (rmsMiniBarEl && rmsMiniBarEl.parentElement) rmsMiniBarEl.parentElement.style.display = '';
  
  // Reset to saved position
  overlayEl.style.left = overlayPosition.x + 'px';
  overlayEl.style.top = overlayPosition.y + 'px';
  
  // Connect to background for metrics
  connectToMetrics();
}

// Hide overlay
function hideOverlay() {
  if (!overlayVisible) return;
  
  overlayVisible = false;
  
  if (overlayEl) {
    overlayEl.style.display = 'none';
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
  const styleEl = document.getElementById('ssa-overlay-style');
  if (styleEl) styleEl.remove();
});


