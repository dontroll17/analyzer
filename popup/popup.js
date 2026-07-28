import { RMS } from '../dsp-engine/rms.js';

// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const rmsSection = document.getElementById('rmsSection');
const rmsValue = document.getElementById('rmsValue');
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

  if (countEl) countEl.textContent = count;
  if (!statusEl) return;

  statusEl.textContent = state;

  switch (state) {
    case 'GLITCH':
      statusEl.style.color = '#f44336';
      if (dotEl) dotEl.style.background = '#f44336';
      if (lastGlitchState !== 'GLITCH') {
        addGlitchLogEntry(count);
      }
      break;
    case 'DRIFT':
      statusEl.style.color = '#FF9800';
      if (dotEl) dotEl.style.background = '#FF9800';
      break;
    case 'STABLE':
    default:
      statusEl.style.color = '#4CAF50';
      if (dotEl) dotEl.style.background = '#4CAF50';
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

    // Сброс всех сглаженных переменных и счетчиков
    smoothedBass = 0;
    smoothedMid = 0;
    smoothedTreble = 0;
    glitchLog = [];

    if (rmsValue) rmsValue.textContent = '0.0000';
    if (rmsLevel) rmsLevel.textContent = 'Level: --';
    if (rmsBar) rmsBar.style.width = '0%';
    
    if (bassBar) bassBar.style.width = '0%';
    if (midBar) midBar.style.width = '0%';
    if (trebleBar) trebleBar.style.width = '0%';
    
    if (glitchStatus) {
      glitchStatus.textContent = 'STABLE';
      glitchStatus.style.color = '#4CAF50';
    }
    if (glitchStateDot) {
      glitchStateDot.style.background = '#4CAF50';
    }
    if (thresholdSlider) thresholdSlider.value = 85;
    if (thresholdValue) thresholdValue.textContent = '85%';
  }
}

function getLevelColor(level) {
  switch (level) {
    case 'SILENCE': return '#ff6b6b';
    case 'LOW': return '#ffa94d';
    case 'MEDIUM': return '#95df6c';
    case 'HIGH': return '#3ac7a3';
    case 'CRITICAL': return '#d9363e';
    default: return '#333';
  }
}

function updateRMSDisplay(rmsValueNum) {
  const rmsFormatted = rmsValueNum.toFixed(4);
  const level = RMS.classifyLevel(rmsValueNum);
  const percentage = RMS.rmsToPercentage(rmsValueNum);
  
  if (rmsValue) {
    rmsValue.textContent = rmsFormatted;
    rmsValue.style.color = getLevelColor(level);
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
  
  oscilloscopeCtx.fillStyle = '#1a1a1a';
  oscilloscopeCtx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  oscilloscopeCtx.strokeStyle = '#333';
  oscilloscopeCtx.lineWidth = 1;
  oscilloscopeCtx.beginPath();
  oscilloscopeCtx.moveTo(0, centerY);
  oscilloscopeCtx.lineTo(canvasWidth, centerY);
  oscilloscopeCtx.stroke();
  
  if (leftSamples.length > 0) {
    oscilloscopeCtx.strokeStyle = '#2196F3';
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
    oscilloscopeCtx.strokeStyle = '#f44336';
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

function updateOscilloscopeFromMetrics(metrics) {
  leftChannelHistory[leftHead] = metrics.rms * (Math.random() > 0.5 ? 1 : -1);
  leftHead = (leftHead + 1) % HISTORY_SIZE;
  
  rightChannelHistory[rightHead] = metrics.rms * (Math.random() > 0.5 ? 1 : -1);
  rightHead = (rightHead + 1) % HISTORY_SIZE;
  
  const leftSamples = getBufferedSamples(leftChannelHistory, leftHead);
  const rightSamples = getBufferedSamples(rightChannelHistory, rightHead);
  
  updateOscilloscope(leftSamples, rightSamples);
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
      channelCount: 1,
      channelCountMode: 'explicit',
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
        updateRMSDisplay(data.rms);
        const maxVal = Math.max(data.bass, data.mid, data.treble, 1);
        updateFrequencyBands(data.bass, data.mid, data.treble, maxVal);
        updateOscilloscopeFromMetrics(data);

        // 🎯 ОБРАБОТКА ДЕТЕКТОРА ГЛИЧЕЙ
        currentMetrics = {
          rms: data.rms,
          bass: data.bass,
          mid: data.mid,
          treble: data.treble,
          highFreqAnomaly: data.highFreqAnomaly
        };
        updateGlitchStatus(data.glitchState, data.glitchCount);
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
  // Очищаем лог глитчей при остановке захвата
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

// Добавление записи в лог глитчей (FIFO, max 500)
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
  
  // FIFO: удаляем старые записи, если превышен лимит
  if (glitchLog.length > GLITCH_LOG_MAX) {
    glitchLog.shift();
  }
  
  console.log('[Glitch Log] Entry added. Total entries:', glitchLog.length);
}

// Экспорт лога глитчей в JSON
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

// Отправка настроек чувствительности в AudioWorklet
function sendSensitivityToWorklet(percentage) {
  if (!popupWorkletNode) return;
  
  const threshold = percentage / 100;
  popupWorkletNode.port.postMessage({
    type: 'SET_GITCH_CONFIG',
    highFreqThreshold: threshold
  });
  
  console.log('[Sensitivity] Updated highFreqThreshold:', threshold);
}

// ============================================
// Захват звука через offscreen document
// ============================================

let captureActive = false;
let bgPort = null;

// Establish persistent connection to background for metrics relay
function connectToBackground() {
  if (bgPort) return; // Already connected
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

// Connect on load
connectToBackground();

// Keep popup alive during capture (prevent auto-close)
if (captureActive) {
  document.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('mousedown', (e) => e.stopPropagation());
}

function updateMetricsFromOffscreen(data) {
  currentMetrics = {
    rms: data.rms,
    bass: data.bass,
    mid: data.mid,
    treble: data.treble,
    highFreqAnomaly: data.highFreqAnomaly
  };
  updateRMSDisplay(data.rms);
  const maxVal = Math.max(data.bass, data.mid, data.treble, 1);
  updateFrequencyBands(data.bass, data.mid, data.treble, maxVal);
  updateOscilloscopeFromMetrics(data);
  updateGlitchStatus(data.glitchState, data.glitchCount);
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

// Обновление значения слайдера
if (thresholdSlider) {
  thresholdSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    if (thresholdValue) {
      thresholdValue.textContent = value + '%';
    }
    // Отправляем настройку в AudioWorklet в реальном времени
    sendSensitivityToWorklet(parseInt(value));
  });
}

// Кнопка сброса чувствительности
if (resetSensitivityBtn) {
  resetSensitivityBtn.addEventListener('click', () => {
    if (thresholdSlider) thresholdSlider.value = 85;
    if (thresholdValue) thresholdValue.textContent = '85%';
    sendSensitivityToWorklet(85);
    console.log('[Sensitivity] Reset to default: 85%');
  });
}

// Кнопка экспорта лога глитчей
if (exportLogBtn) {
  exportLogBtn.addEventListener('click', exportGlitchLog);
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