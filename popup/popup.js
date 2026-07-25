// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

// Update UI state
function updateUI(connected) {
  if (connected) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDiv.textContent = 'Connected - Capturing Audio';
    statusDiv.className = 'connected';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = 'Not Connected';
    statusDiv.className = 'disconnected';
  }
}

// Event Listeners
startBtn.addEventListener('click', () => {
  console.log('Starting capture from popup...');
  chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError.message);
      alert('Error: ' + chrome.runtime.lastError.message);
    } else {
      updateUI(response.connected);
    }
  });
});

stopBtn.addEventListener('click', () => {
  console.log('Stopping capture from popup...');
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError.message);
    } else {
      updateUI(response.connected);
    }
  });
});

// Initialize UI state on load
updateUI(false);
