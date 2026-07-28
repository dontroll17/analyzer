import { RMS } from '../dsp-engine/rms.js';

// ============================================
// Theme Colors
// ============================================
const THEME_COLORS = {
  dark: {
    glitch: { GLITCH: '#f44336', DRIFT: '#FF9800', STABLE: '#4CAF50' },
    rms: { SILENCE: '#ff6b6b', LOW: '#ffa94d', MEDIUM: '#95df6c', HIGH: '#3ac7a3', CRITICAL: '#d9363e', default: '#333' },
    canvas: { bg: '#1a1a1a', grid: '#333333', oscLeft: '#2196F3', oscRight: '#f44336', timelineRef: '#333' },
    channel: { stereo: '#4CAF50', mono: '#888' }
  },
  light: {
    glitch: { GLITCH: '#E53935', DRIFT: '#FB8C00', STABLE: '#43A047' },
    rms: { SILENCE: '#ef5350', LOW: '#FFA726', MEDIUM: '#66BB6A', HIGH: '#26A69A', CRITICAL: '#D32F2F', default: '#bdbdbd' },
    canvas: { bg: '#fafafa', grid: '#e0e0e0', oscLeft: '#1E88E5', oscRight: '#E53935', timelineRef: '#e0e0e0' },
    channel: { stereo: '#43A047', mono: '#666' }
  }
};

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function tc(key) {
  return THEME_COLORS[getTheme()][key];
}

// ============================================
// DOM Elements
// ============================================
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');
const rmsSection = document.getElementById('rmsSection');
const rmsValue = document.getElementById('rmsValue');
const peakValue = document.getElementById('peakValue');
const rmsLevel = document.getElementById('rmsLevel');
const rmsBar = document.getElementById('rmsBar');
const freqBandsSection = document.getElementById('freqBandsSection');
const bassBar = document.getElementById('bassBar');
const midBar = document.getElementById('midBar');
const trebleBar = document.getElementById('trebleBar');
const bassValue = document.getElementById('bassValue');
const midValue = document.getElementById('midValue');
const trebleValue = document.getElementById('trebleValue');

// Oscilloscope elements
const oscilloscopeCanvas = document.getElementById('oscilloscopeCanvas');
const oscilloscopeCtx = oscilloscopeCanvas ? oscilloscopeCanvas.getContext('2d') : null;
const exportBtn = document.getElementById('exportBtn');
const exportLogBtn = document.getElementById('exportLogBtn');
const oscilloscopeSection = document.getElementById('oscilloscopeSection');
const timelineCanvas = document.getElementById('timelineCanvas');
const timelineCtx = timelineCanvas ? timelineCanvas.getContext('2d') : null;
const timelineSection = document.getElementById('timelineSection');
const channelIndicator = document.getElementById('channelIndicator');

// Entropy section elements
const entropySection = document.getElementById('entropySection');
const entropyValue = document.getElementById('entropyValue');
const entropyState = document.getElementById('entropyState');
const flatnessValue = document.getElementById('flatnessValue');
const entropyHint = document.getElementById('entropyHint');

// Glitch settings elements
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValue = document.getElementById('thresholdValue');
const resetSensitivityBtn = document.getElementById('resetSensitivityBtn');
const glitchSettings = document.getElementById('glitchSettings');
const glitchStatus = document.getElementById('glitchStatus');
const glitchStateDot = document.getElementById('glitchStateDot');

// Glitch log (max 500 entries, FIFO)
const GLITCH_LOG_MAX = 500;
let glitchLog = [];
let currentMetrics = { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 };
let lastGlitchState = 'STABLE';

// Glitch timeline history
var TIMELINE_MAX = 300;
var glitchHistory = [];
var lastTimelineRecord = 0;
var CAPTURE_START_TIME = 0;

// Oscilloscope history buffers
const HISTORY_SIZE = 1024;
let leftChannelHistory = new Float32Array(HISTORY_SIZE);
let rightChannelHistory = new Float32Array(HISTORY_SIZE);
let leftHead = 0;
let rightHead = 0;

// Context & Streams state
let popupAudioContext = null;
let popupMediaStreamSource = null;
let popupWorkletNode = null;
let popupCaptureStream = null;

let smoothedBass = 0;
let smoothedMid = 0;
let smoothedTreble = 0;

// Функция визуализации состояния глитч-детектора (глобальная)
function updateGlitchStatus(state, count) {
  const statusEl = document.getElementById('glitchStatus');
  const countEl = document.getElementById('glitchCount');
  const dotEl = document.getElementById('glitchStateDot');
  const glitchSectionEl = document.getElementById('glitchSection');
  const colors = tc('glitch');

  if (countEl) countEl.textContent = count;
  if (!statusEl) return;

  statusEl.textContent = state;

  switch (state) {
    case 'GLITCH':
      statusEl.style.color = colors.GLITCH;
      if (dotEl) dotEl.style.background = colors.GLITCH;
      if (glitchSectionEl) glitchSectionEl.classList.add('glitch-pulse');
      if (lastGlitchState !== 'GLITCH') {
        addGlitchLogEntry(count);
      }
      break;
    case 'DRIFT':
      statusEl.style.color = colors.DRIFT;
      if (dotEl) dotEl.style.background = colors.DRIFT;
      if (glitchSectionEl) glitchSectionEl.classList.remove('glitch-pulse');
      break;
    case 'STABLE':
    default:
      statusEl.style.color = colors.STABLE;
      if (dotEl) dotEl.style.background = colors.STABLE;
      if (glitchSectionEl) glitchSectionEl.classList.remove('glitch-pulse');
      break;
  }
  lastGlitchState = state;
}

// Коэффициент сглаживания (от 0.05 до 0.3):
// Меньше = более плавно/инертно, Больше = более резко
const SMOOTHING_FACTOR = 0.15;

// Update UI state
function updateUI(connected) {
  if (connected) {
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (statusDiv) {
      statusDiv.textContent = 'Connected - Capturing Audio';
      statusDiv.className = 'status connected';
    }
    if (rmsSection) rmsSection.style.display = 'block';
    if (freqBandsSection) freqBandsSection.style.display = 'block';
    if (oscilloscopeSection) oscilloscopeSection.style.display = 'block';
    if (glitchSettings) glitchSettings.style.display = 'block';
    if (timelineSection) timelineSection.style.display = 'block';
    if (entropySection) entropySection.style.display = '';
    if (entropyHint) entropyHint.style.display = '';
  } else {
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (statusDiv) {
      statusDiv.textContent = 'Not Connected';
      statusDiv.className = 'status disconnected';
    }
    if (rmsSection) rmsSection.style.display = 'none';
    if (freqBandsSection) freqBandsSection.style.display = 'none';
    if (oscilloscopeSection) oscilloscopeSection.style.display = 'none';
    if (glitchSettings) glitchSettings.style.display = 'none';
    if (timelineSection) timelineSection.style.display = 'none';
    if (entropySection) entropySection.style.display = 'none';
    if (entropyHint) entropyHint.style.display = 'none';

    // Сброс всех сглаженных переменных и счетчиков
    smoothedBass = 0;
    smoothedMid = 0;
    smoothedTreble = 0;
    glitchLog = [];
    glitchHistory = [];
    CAPTURE_START_TIME = 0;
    lastTimelineRecord = 0;

    if (rmsValue) rmsValue.textContent = '0.0000';
    if (peakValue) peakValue.textContent = 'Peak: --';
    if (rmsLevel) rmsLevel.textContent = 'Level: --';
    if (rmsBar) rmsBar.style.width = '0%';
    
    if (bassBar) bassBar.style.width = '0%';
    if (midBar) midBar.style.width = '0%';
    if (trebleBar) trebleBar.style.width = '0%';
    
    if (glitchStatus) {
      glitchStatus.textContent = 'STABLE';
      glitchStatus.style.color = tc('glitch').STABLE;
    }
    if (glitchStateDot) {
      glitchStateDot.style.background = tc('glitch').STABLE;
    }
    if (glitchSettings) glitchSettings.classList.remove('glitch-pulse');
    if (thresholdSlider) thresholdSlider.value = 85;
    if (thresholdValue) thresholdValue.textContent = '85%';

    if (entropyValue) entropyValue.textContent = '0.00';
    if (flatnessValue) flatnessValue.textContent = '0.00';
    if (entropyState) {
      entropyState.textContent = 'STABLE';
      entropyState.style.color = tc('glitch').STABLE;
    }
  }
}

function getLevelColor(level) {
  const colors = tc('rms');
  return colors[level] || colors.default;
}

function updateRMSDisplay(rmsValueNum, peakRms) {
  const rmsFormatted = rmsValueNum.toFixed(4);
  const level = RMS.classifyLevel(rmsValueNum);
  const percentage = RMS.rmsToPercentage(rmsValueNum);
  
  if (rmsValue) {
    rmsValue.textContent = rmsFormatted;
    rmsValue.style.color = getLevelColor(level);
  }
  if (peakValue && peakRms !== undefined) {
    peakValue.textContent = 'Peak: ' + peakRms.toFixed(4);
  }
  if (rmsLevel) {
    rmsLevel.textContent = 'Level: ' + level + ' (' + percentage.toFixed(1) + '%)';
  }
  if (rmsBar) {
    rmsBar.style.width = percentage + '%';
    rmsBar.style.backgroundColor = getLevelColor(level);
  }
}

function updateFrequencyBands(bass, mid, treble, maxEnergy = 1.0) {
  const isValid = (val) => typeof val === 'number' && isFinite(val) && val >= 0;
  
  const rawBass = isValid(bass) ? bass : 0;
  const rawMid = isValid(mid) ? mid : 0;
  const rawTreble = isValid(treble) ? treble : 0;

  // Формула сглаживания LERP (Linear Interpolation):
  // Current = Current + (Target - Current) * Factor
  smoothedBass += (rawBass - smoothedBass) * SMOOTHING_FACTOR;
  smoothedMid += (rawMid - smoothedMid) * SMOOTHING_FACTOR;
  smoothedTreble += (rawTreble - smoothedTreble) * SMOOTHING_FACTOR;

  const bassPercent = Math.min(100, Math.max(0, smoothedBass));
  const midPercent = Math.min(100, Math.max(0, smoothedMid));
  const treblePercent = Math.min(100, Math.max(0, smoothedTreble));

  // Обновляем ширину полос
  if (bassBar) bassBar.style.width = bassPercent + '%';
  if (midBar) midBar.style.width = midPercent + '%';
  if (trebleBar) trebleBar.style.width = treblePercent + '%';

  // Обновляем текстовые значения
  if (bassValue) bassValue.textContent = Math.round(bassPercent) + '%';
  if (midValue) midValue.textContent = Math.round(midPercent) + '%';
  if (trebleValue) trebleValue.textContent = Math.round(treblePercent) + '%';
}

function updateOscilloscope(leftSamples, rightSamples) {
  if (!oscilloscopeCtx || !oscilloscopeCanvas) return;

  const canvasWidth = oscilloscopeCanvas.width;
  const canvasHeight = oscilloscopeCanvas.height;
  const centerY = canvasHeight / 2;
  const colors = tc('canvas');

  oscilloscopeCtx.fillStyle = colors.bg;
  oscilloscopeCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  oscilloscopeCtx.strokeStyle = colors.grid;
  oscilloscopeCtx.lineWidth = 1;
  oscilloscopeCtx.beginPath();
  oscilloscopeCtx.moveTo(0, centerY);
  oscilloscopeCtx.lineTo(canvasWidth, centerY);
  oscilloscopeCtx.stroke();

  if (leftSamples.length > 0) {
    oscilloscopeCtx.strokeStyle = colors.oscLeft;
    oscilloscopeCtx.lineWidth = 1.5;
    oscilloscopeCtx.beginPath();

    for (let i = 0; i < leftSamples.length; i++) {
      const x = (i / leftSamples.length) * canvasWidth;
      const y = centerY - (leftSamples[i] * centerY);
      if (i === 0) oscilloscopeCtx.moveTo(x, y);
      else oscilloscopeCtx.lineTo(x, y);
    }
    oscilloscopeCtx.stroke();
  }

  if (rightSamples.length > 0) {
    oscilloscopeCtx.strokeStyle = colors.oscRight;
    oscilloscopeCtx.lineWidth = 1.5;
    oscilloscopeCtx.beginPath();

    for (let i = 0; i < rightSamples.length; i++) {
      const x = (i / rightSamples.length) * canvasWidth;
      const y = centerY - (rightSamples[i] * centerY);
      if (i === 0) oscilloscopeCtx.moveTo(x, y);
      else oscilloscopeCtx.lineTo(x, y);
    }
    oscilloscopeCtx.stroke();
  }
}

function getBufferedSamples(buffer, head) {
  const result = [];
  for (let i = 0; i < buffer.length; i++) {
    const index = (head + i) % buffer.length;
    result.push(buffer[index]);
  }
  return result;
}

function updateOscilloscopeFromWaveform(waveform, hold, waveformRight) {
  // Hold frame: keep current drawing, skip update
  if (hold === true) return;
  
  // No waveform data and no hold signal — skip (canvas keeps previous frame)
  if (!waveform || waveform.length === 0) return;
  
  if (waveformRight && waveformRight.length > 0) {
    // Stereo: separate L/R waveforms
    var waveL = waveform;
    var waveR = waveformRight;
    for (let i = 0; i < waveL.length && i < HISTORY_SIZE; i++) {
      leftChannelHistory[i] = waveL[i];
    }
    for (let i = 0; i < waveR.length && i < HISTORY_SIZE; i++) {
      rightChannelHistory[i] = waveR[i];
    }
    for (let i = waveL.length; i < HISTORY_SIZE; i++) {
      leftChannelHistory[i] = 0;
    }
    for (let i = waveR.length; i < HISTORY_SIZE; i++) {
      rightChannelHistory[i] = 0;
    }
  } else {
    // Mono: same data for both channels
    var wave = waveform;
    for (let i = 0; i < wave.length && i < HISTORY_SIZE; i++) {
      leftChannelHistory[i] = wave[i];
      rightChannelHistory[i] = wave[i];
    }
    for (let i = wave.length; i < HISTORY_SIZE; i++) {
      leftChannelHistory[i] = 0;
      rightChannelHistory[i] = 0;
    }
  }
  leftHead = 0;
  rightHead = 0;
  
  var leftSamples = getBufferedSamples(leftChannelHistory, leftHead);
  var rightSamples = getBufferedSamples(rightChannelHistory, rightHead);
  updateOscilloscope(leftSamples, rightSamples);
}

function updateGlitchDisplay(state, count, entropy, entropyStateVal, flatness) {
  updateGlitchStatus(state, count);

  if (entropySection && entropy !== undefined) {
    entropySection.style.display = 'block';
  }
  if (entropyValue && entropy !== undefined) {
    entropyValue.textContent = entropy.toFixed(2);
  }
  if (flatnessValue !== null && flatness !== undefined) {
    flatnessValue.textContent = flatness.toFixed(2);
  }
  if (entropyState !== null && entropyStateVal) {
    entropyState.textContent = entropyStateVal;
    const colors = tc('glitch');
    switch (entropyStateVal) {
      case 'GLITCH':
        entropyState.style.color = colors.GLITCH;
        break;
      case 'DRIFT':
        entropyState.style.color = colors.DRIFT;
        break;
      case 'STABLE':
      default:
        entropyState.style.color = colors.STABLE;
        break;
    }
  }
}

function drawTimeline() {
  if (!timelineCtx || !timelineCanvas) return;

  var canvasWidth = timelineCanvas.width;
  var canvasHeight = timelineCanvas.height;
  var padding = 5;
  const colors = tc('canvas');

  timelineCtx.fillStyle = colors.bg;
  timelineCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (glitchHistory.length < 2) return;

  // Draw RMS line with color coding
  timelineCtx.lineWidth = 1.5;
  timelineCtx.beginPath();

  for (var i = 0; i < glitchHistory.length; i++) {
    var point = glitchHistory[i];
    var x = (point.time / (glitchHistory[glitchHistory.length - 1].time || 1)) * (canvasWidth - padding * 2) + padding;
    var y = canvasHeight - padding - (point.rms * (canvasHeight - padding * 2));

    var color;
    switch (point.state) {
      case 'GLITCH': color = tc('glitch').GLITCH; break;
      case 'DRIFT': color = tc('glitch').DRIFT; break;
      default: color = tc('glitch').STABLE; break;
    }

    if (i === 0) {
      timelineCtx.strokeStyle = color;
      timelineCtx.moveTo(x, y);
    } else {
      var prevPoint = glitchHistory[i - 1];
      var prevX = (prevPoint.time / (glitchHistory[glitchHistory.length - 1].time || 1)) * (canvasWidth - padding * 2) + padding;
      var prevY = canvasHeight - padding - (prevPoint.rms * (canvasHeight - padding * 2));
      timelineCtx.moveTo(prevX, prevY);
      timelineCtx.lineTo(x, y);
      timelineCtx.stroke();
      timelineCtx.strokeStyle = color;
      timelineCtx.beginPath();
      timelineCtx.moveTo(x, y);
    }
  }
  timelineCtx.stroke();

  // Draw 0.1 reference line
  timelineCtx.strokeStyle = colors.timelineRef;
  timelineCtx.lineWidth = 1;
  timelineCtx.setLineDash([3, 3]);
  var refY = canvasHeight - padding - (0.1 * (canvasHeight - padding * 2));
  timelineCtx.beginPath();
  timelineCtx.moveTo(padding, refY);
  timelineCtx.lineTo(canvasWidth - padding, refY);
  timelineCtx.stroke();
  timelineCtx.setLineDash([]);
}

// Инициализация Audio Processing и сквозного проброса звука
async function initAudioProcessing(stream) {
  popupCaptureStream = stream;
  
  try {
    popupAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    
    if (popupAudioContext.state === 'suspended') {
      await popupAudioContext.resume();
    }

    popupMediaStreamSource = popupAudioContext.createMediaStreamSource(stream);
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    
    console.log('[Popup] Adding AudioWorklet module...');
    console.log('[Popup] Worklet URL:', workletPath);
    
    await popupAudioContext.audioWorklet.addModule(workletPath);

    popupWorkletNode = new AudioWorkletNode(popupAudioContext, 'audio-analyzer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'discrete'
    });

    console.log('[Popup] AudioWorkletNode created successfully');

    // 1. Источник направляем в воркет для спектрального анализа
    popupMediaStreamSource.connect(popupWorkletNode);

    // 2. ВАЖНО: Подключаем воркет (или источник) к колонкам/наушникам, 
    // чтобы не было глушения оригинального звука
    popupWorkletNode.connect(popupAudioContext.destination);

    popupWorkletNode.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'METRICS') {
        // Обновляем RMS и эквалайзер
        updateRMSDisplay(data.rms, data.peakRMS);
        
        // Stereo: combine L+R for overall bands, or use mono data
        var isStereoMode = data.bassRight !== undefined;
        var combinedBass = isStereoMode
          ? (data.bass + data.bassRight) / 2
          : data.bass;
        var combinedMid = isStereoMode
          ? (data.mid + data.midRight) / 2
          : data.mid;
        var combinedTreble = isStereoMode
          ? (data.treble + data.trebleRight) / 2
          : data.treble;
        
        // Update channel indicator
        if (channelIndicator) {
          const chColors = tc('channel');
          channelIndicator.textContent = isStereoMode ? 'STEREO' : 'MONO';
          channelIndicator.style.color = isStereoMode ? chColors.stereo : chColors.mono;
        }
        
        const maxVal = Math.max(combinedBass, combinedMid, combinedTreble, 1);
        updateFrequencyBands(combinedBass, combinedMid, combinedTreble, maxVal);
        updateOscilloscopeFromWaveform(data.waveform, data.waveformHold, data.waveformRight);

        // 🎯 ОБРАБОТКА ДЕТЕКТОРА ГЛИЧЕЙ
        currentMetrics = {
          rms: data.rms,
          bass: data.bass,
          mid: data.mid,
          treble: data.treble,
          highFreqAnomaly: data.highFreqAnomaly,
          rmsRight: data.rmsRight
        };
        updateGlitchDisplay(data.glitchState, data.glitchCount, data.entropy, data.entropyState, data.flatness);

        // Запись в timeline (throttle ~5 Hz)
        if (CAPTURE_START_TIME === 0) { CAPTURE_START_TIME = Date.now(); }
        if (data.timestamp - lastTimelineRecord > 200) {
          glitchHistory.push({
            time: data.timestamp - CAPTURE_START_TIME,
            rms: data.rms,
            state: data.glitchState
          });
          lastTimelineRecord = data.timestamp;
          if (glitchHistory.length > TIMELINE_MAX) {
            glitchHistory.shift();
          }
        }
        drawTimeline();
      }
    };

    updateUI(true);
  } catch (error) {
    console.error('[Popup] Error initializing audio:', error);
    alert('Audio init error: ' + error.message);
    stopAudioProcessing();
  }
}

function stopAudioProcessing() {
  glitchLog = [];
  lastGlitchState = 'STABLE';
  currentMetrics = { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 };

  if (popupMediaStreamSource) {
    popupMediaStreamSource.disconnect();
    popupMediaStreamSource = null;
  }
  if (popupWorkletNode) {
    popupWorkletNode.disconnect();
    popupWorkletNode = null;
  }
  if (popupAudioContext) {
    popupAudioContext.close().catch(console.error);
    popupAudioContext = null;
  }
  if (popupCaptureStream) {
    popupCaptureStream.getTracks().forEach(track => track.stop());
    popupCaptureStream = null;
  }
  updateUI(false);
}

function addGlitchLogEntry(glitchCount) {
  const entry = {
    timestamp: Date.now(),
    iso: new Date().toISOString(),
    glitchCount: glitchCount,
    rms: currentMetrics.rms,
    bass: currentMetrics.bass,
    mid: currentMetrics.mid,
    treble: currentMetrics.treble,
    highFreqAnomaly: currentMetrics.highFreqAnomaly
  };
  glitchLog.push(entry);
  if (glitchLog.length > GLITCH_LOG_MAX) {
    glitchLog.shift();
  }
  console.log('[Glitch Log] Entry added. Total entries:', glitchLog.length);
}

function exportGlitchLog() {
  if (glitchLog.length === 0) {
    alert('Лог глитчей пуст. Запустите захват аудио и дождитесь срабатывания детектора.');
    return;
  }
  const exportData = {
    exportDate: new Date().toISOString(),
    totalGlitches: glitchLog.length,
    maxEntries: GLITCH_LOG_MAX,
    entries: glitchLog
  };
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glitch-log-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('[Glitch Log] Exported', glitchLog.length, 'entries');
}

function exportCSV() {
  var leftSamples = getBufferedSamples(leftChannelHistory, leftHead);
  var rightSamples = getBufferedSamples(rightChannelHistory, rightHead);

  if (leftSamples.length === 0) {
    alert('Нет данных. Запустите захват аудио.');
    return;
  }

  var csv = 'timestamp_ms,left_channel,right_channel\n';
  var ts = Date.now();
  for (var i = 0; i < leftSamples.length; i++) {
    csv += ts + ',' + leftSamples[i].toFixed(6) + ',' + rightSamples[i].toFixed(6) + '\n';
  }

  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'oscilloscope-' + Date.now() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('[CSV Export] Exported', leftSamples.length, 'samples');
}

function sendSensitivityToWorklet(percentage) {
  if (!popupWorkletNode) return;
  const threshold = percentage / 100;
  popupWorkletNode.port.postMessage({
    type: 'SET_GITCH_CONFIG',
    highFreqThreshold: threshold
  });
  console.log('[Sensitivity] Updated highFreqThreshold:', threshold);
}

let captureActive = false;
let bgPort = null;

function connectToBackground() {
  if (bgPort) return;
  bgPort = chrome.runtime.connect({ name: 'popup-metrics' });
  console.log('[Popup] Connected to background');
  bgPort.onMessage.addListener((data) => {
    if (data && data.type === 'METRICS') {
      updateMetricsFromOffscreen(data);
    }
    if (data && data.type === '_OFFSCREEN_ENDED') {
      console.log('[Popup] Offscreen ended');
      stopAudioProcessing();
      updateUI(false);
      captureActive = false;
      startBtn.textContent = 'Start Capture';
      startBtn.disabled = false;
    }
  });
  bgPort.onDisconnect.addListener(() => {
    console.log('[Popup] Background connection lost');
    bgPort = null;
  });
}

connectToBackground();

function updateMetricsFromOffscreen(data) {
  currentMetrics = {
    rms: data.rms,
    bass: data.bass,
    mid: data.mid,
    treble: data.treble,
    highFreqAnomaly: data.highFreqAnomaly,
    rmsRight: data.rmsRight
  };
  updateRMSDisplay(data.rms, data.peakRMS);
  
  // Stereo: combine L+R for overall bands
  var isStereoMode = data.bassRight !== undefined;
  var combinedBass = isStereoMode
    ? (data.bass + data.bassRight) / 2
    : data.bass;
  var combinedMid = isStereoMode
    ? (data.mid + data.midRight) / 2
    : data.mid;
  var combinedTreble = isStereoMode
    ? (data.treble + data.trebleRight) / 2
    : data.treble;
  
  // Update channel indicator
  if (channelIndicator) {
    const chColors = tc('channel');
    channelIndicator.textContent = isStereoMode ? 'STEREO' : 'MONO';
    channelIndicator.style.color = isStereoMode ? chColors.stereo : chColors.mono;
  }
  
  const maxVal = Math.max(combinedBass, combinedMid, combinedTreble, 1);
  updateFrequencyBands(combinedBass, combinedMid, combinedTreble, maxVal);
  updateOscilloscopeFromWaveform(data.waveform, data.waveformHold, data.waveformRight);
  updateGlitchDisplay(data.glitchState, data.glitchCount, data.entropy, data.entropyState, data.flatness);

  // Запись в timeline (throttle ~5 Hz)
  if (CAPTURE_START_TIME === 0) { CAPTURE_START_TIME = Date.now(); }
  if (data.timestamp - lastTimelineRecord > 200) {
    glitchHistory.push({
      time: data.timestamp - CAPTURE_START_TIME,
      rms: data.rms,
      state: data.glitchState
    });
    lastTimelineRecord = data.timestamp;
    if (glitchHistory.length > TIMELINE_MAX) {
      glitchHistory.shift();
    }
  }
  drawTimeline();
}

startBtn.addEventListener('click', () => {
  if (captureActive) return;
  
  console.log('[Popup] Requesting capture via background...');
  captureActive = true;
  startBtn.textContent = 'Capturing...';
  startBtn.disabled = true;
  
  chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, response => {
    console.log('[Popup] Capture response:', response);
    if (response?.ok) {
      updateUI(true);
    } else {
      console.error('[Popup] Capture failed:', response?.error);
      alert('Ошибка: ' + (response?.error || 'Не удалось начать захват'));
      captureActive = false;
      startBtn.textContent = 'Start Capture';
      startBtn.disabled = false;
    }
  });
});

stopBtn.addEventListener('click', () => {
  console.log('[Popup] Stopping capture...');
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, response => {
    console.log('[Popup] Stop response:', response);
    stopAudioProcessing();
    updateUI(false);
    captureActive = false;
    startBtn.textContent = 'Start Capture';
    startBtn.disabled = false;
  });
});

chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    // В случае если background еще не готов или отдал ошибку
    updateUI(false);
    return;
  }

  if (response && response.isCapturing) {
    updateUI(true);
  } else {
    updateUI(false);
  }
});

// ============================================
// Slider & Sensitivity Controls
// ============================================

const SENSITIVITY_KEY = 'glitchSensitivity';
const SENSITIVITY_DEFAULT = 85;

// Load saved sensitivity on startup
chrome.storage.local.get([SENSITIVITY_KEY], (result) => {
  const saved = result[SENSITIVITY_KEY];
  if (typeof saved === 'number' && saved >= 60 && saved <= 90) {
    if (thresholdSlider) thresholdSlider.value = saved;
    if (thresholdValue) thresholdValue.textContent = saved + '%';
    console.log('[Sensitivity] Loaded from storage:', saved);
  } else if (thresholdSlider) {
    thresholdSlider.value = SENSITIVITY_DEFAULT;
    if (thresholdValue) thresholdValue.textContent = SENSITIVITY_DEFAULT + '%';
  }
});

// Обновление значения слайдера
if (thresholdSlider) {
  thresholdSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    if (thresholdValue) {
      thresholdValue.textContent = value + '%';
    }
    // Отправляем настройку в AudioWorklet в реальном времени
    sendSensitivityToWorklet(parseInt(value));
    // Сохраняем настройку
    chrome.storage.local.set({ [SENSITIVITY_KEY]: parseInt(value) }, () => {
      console.log('[Sensitivity] Saved:', value);
    });
  });
}

// Кнопка сброса чувствительности
if (resetSensitivityBtn) {
  resetSensitivityBtn.addEventListener('click', () => {
    if (thresholdSlider) thresholdSlider.value = SENSITIVITY_DEFAULT;
    if (thresholdValue) thresholdValue.textContent = SENSITIVITY_DEFAULT + '%';
    sendSensitivityToWorklet(SENSITIVITY_DEFAULT);
    chrome.storage.local.set({ [SENSITIVITY_KEY]: SENSITIVITY_DEFAULT }, () => {
      console.log('[Sensitivity] Reset and saved:', SENSITIVITY_DEFAULT);
    });
  });
}

// Кнопка экспорта лога глитчей
if (exportLogBtn) {
  exportLogBtn.addEventListener('click', exportGlitchLog);
}

// Кнопка экспорта CSV осциллографа
if (exportBtn) {
  exportBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    exportCSV();
  });
  exportBtn.addEventListener('mousedown', function(e) {
    e.stopPropagation();
  });
}

// ============================================
// Theme Management
// ============================================

const THEME_KEY = 'theme';
const THEME_DEFAULT = 'dark';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '\u263C' : '\u263E';
  }
  console.log('[Theme] Applied:', theme);
}

// Load saved theme on startup
chrome.storage.local.get([THEME_KEY], (result) => {
  const saved = result[THEME_KEY];
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    // Detect system preference
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  }
});

if (themeToggle) {
  themeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ [THEME_KEY]: next });
  });
}

// ============================================
// Prevent popup closing on internal control clicks
// ============================================

// Предотвращаем всплытие кликов ТОЛЬКО на элементах управления
// (полностью запретить закрытие popup через stopPropagation нельзя — это поведение Chrome)
if (thresholdSlider) {
  thresholdSlider.addEventListener('click', (e) => e.stopPropagation());
  thresholdSlider.addEventListener('mousedown', (e) => e.stopPropagation());
}
if (resetSensitivityBtn) {
  resetSensitivityBtn.addEventListener('click', (e) => e.stopPropagation());
}
if (exportLogBtn) {
  exportLogBtn.addEventListener('click', (e) => e.stopPropagation());
}
if (themeToggle) {
  themeToggle.addEventListener('click', (e) => e.stopPropagation());
  themeToggle.addEventListener('mousedown', (e) => e.stopPropagation());
}

// Cleanup when popup closes
window.addEventListener('beforeunload', () => {
  if (captureActive) {
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
  }
  if (bgPort) {
    bgPort.disconnect();
    bgPort = null;
  }
});
 