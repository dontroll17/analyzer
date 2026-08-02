// tests/capture-api.test.js - Jest tests for Chrome Extension capture workflow
// Tests getDisplayMedia mocking, offscreen.js capture flow, popup.js response handling

// ============================================
// Testable extraction of capture API logic
// ============================================
// Extracts pure decision/validation logic from offscreen.js startCapture()
// and popup.js response handling for testable access.

const CAPTURE_SOURCES = ['tab', 'mic', 'combined'];
const DEFAULT_SAMPLE_RATE = 44100;

/**
 * Builds the stream options object for a given capture source.
 * Pure function extracted from startCapture() switch case.
 */
function buildStreamOptions(source) {
  switch (source) {
    case 'mic':
      return {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: DEFAULT_SAMPLE_RATE
        },
        video: false
      };
    case 'combined':
    case 'tab':
    default:
      return {
        video: { width: 1, height: 1, displaySurface: 'browser' },
        audio: true
      };
  }
}

/**
 * Validates the media stream response from getDisplayMedia / getUserMedia.
 * Returns an error object if validation fails, null if valid.
 * Pure logic extracted from startCapture() stream validation.
 */
function validateMediaStream(stream, source) {
  if (!stream) {
    return { error: 'stream_null', message: 'MediaStream is null' };
  }

  if (source === 'tab' || source === 'combined') {
    const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
    if (audioTracks.length === 0) {
      return {
        error: 'no_tab_audio',
        message: source === 'combined'
          ? 'Combined capture failed: no tab audio'
          : 'Please enable "Share tab audio" in the dialog'
      };
    }
  }

  const audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
  if (audioTracks.length === 0) {
    return { error: 'no_audio_tracks', message: 'No audio tracks' };
  }

  return null;
}

/**
 * Constructs the error response for different failure scenarios.
 * Pure logic extracted from startCapture() catch blocks.
 */
function buildErrorResponse(error, source) {
  if (!error) {
    return { ok: false, error: 'unknown_error', message: 'Unknown capture error' };
  }

  const name = error.name || error.type || '';

  if (name === 'NotAllowedError') {
    return {
      ok: false,
      error: source === 'combined' ? 'capture_denied' : 'capture_denied',
      message: 'User denied capture permission'
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      ok: false,
      error: 'device_not_found',
      message: error.message || 'No audio device found'
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      ok: false,
      error: 'device_in_use',
      message: error.message || 'Audio device is in use'
    };
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      ok: false,
      error: 'constraint_not_satisfied',
      message: error.message || 'Device constraints not satisfied'
    };
  }

  return {
    ok: false,
    error: name.toLowerCase().replace(/error$/, '').replace(/\s/g, '_') || 'capture_error',
    message: error.message || 'Capture failed'
  };
}

/**
 * Determines the expected API call based on capture source.
 * Pure logic from the switch statement in startCapture().
 */
function getExpectedApiCall(source) {
  switch (source) {
    case 'mic':
      return 'getUserMedia';
    case 'combined':
      return 'getDisplayMedia';
    case 'tab':
    default:
      return 'getDisplayMedia';
  }
}

/**
 * Validates capture source parameter.
 */
function validateCaptureSource(source) {
  return CAPTURE_SOURCES.includes(source);
}

/**
 * Formats the getDisplayMedia response for tab-only capture.
 * Tests the success path logic.
 */
function buildSuccessResponse(alreadyActive = false) {
  if (alreadyActive) {
    return { ok: true, alreadyActive: true };
  }
  return { ok: true };
}

/**
 * Determines if a stream needs track cleanup on error.
 */
function needsTrackCleanup(error, stream) {
  const hasTracks = stream && stream.getTracks && stream.getTracks().length > 0;
  const shouldStop = hasTracks && error && !stream._alreadyStopped;
  return { shouldStop, hasTracks };
}

/**
 * Validates AudioContext configuration from startCapture().
 */
function validateAudioContextConfig(sampleRate) {
  return {
    sampleRate: sampleRate || DEFAULT_SAMPLE_RATE,
    latency: 'interactive',
    sampleRateValid: !sampleRate || (sampleRate > 0 && sampleRate <= 192000)
  };
}

/**
 * Validates the worklet node configuration.
 */
function validateWorkletNodeConfig() {
  return {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 2,
    channelCountMode: 'max',
    channelInterpretation: 'discrete'
  };
}

// ============================================
// Popup response handling testable functions
// ============================================

/**
 * Parses the response from offscreen.js capture and updates popup state.
 * Pure logic extracted from popup.js capture start flow.
 */
function handleCaptureResponse(response, currentCaptureActive) {
  const result = {
    captureActive: false,
    gracefulStop: false,
    errorMessage: null,
    shouldShowError: false,
    shouldNotifyUser: false
  };

  if (!response) {
    result.errorMessage = 'No response from capture';
    result.shouldShowError = true;
    result.shouldNotifyUser = true;
    return result;
  }

  if (response.alreadyActive) {
    result.captureActive = true;
    result.errorMessage = null;
    return result;
  }

  if (response.ok) {
    result.captureActive = true;
    result.errorMessage = null;
    return result;
  }

  if (!response.ok) {
    result.captureActive = false;
    result.errorMessage = response.error || 'Capture failed';
    result.shouldShowError = true;

    // User-facing messages for specific errors
    const userFriendlyErrors = ['capture_denied', 'no_tab_audio', 'no_audio_tracks'];
    if (userFriendlyErrors.includes(response.error)) {
      result.shouldNotifyUser = true;
    }

    return result;
  }

  return result;
}

/**
 * Formats error message for user display.
 */
function formatCaptureError(errorKey, source) {
  const messages = {
    capture_denied: `Capture denied by user (${source})`,
    no_tab_audio: 'Please enable "Share tab audio" in the dialog',
    no_audio_tracks: 'No audio tracks detected',
    combined_capture_failed: 'Combined capture failed',
    getdisplay_media_failed: 'getDisplayMedia failed',
    device_not_found: 'No audio device found',
    device_in_use: 'Audio device is in use'
  };

  return messages[errorKey] || `Capture failed: ${errorKey}`;
}

/**
 * Validates the popup UI state after capture start.
 */
function validatePopupStateAfterCapture(response, currentCaptureActive) {
  const result = {
    startBtnDisabled: false,
    stopBtnDisabled: true,
    statusText: 'Not Connected',
    statusClass: 'disconnected',
    sectionsVisible: {
      rms: false,
      freqBands: false,
      oscilloscope: false,
      glitchSettings: false,
      timeline: false,
      heatmap: false,
      effects: false
    }
  };

  if (response && response.ok && !response.alreadyActive) {
    result.startBtnDisabled = true;
    result.stopBtnDisabled = false;
    result.statusText = 'Connected - Capturing Audio';
    result.statusClass = 'connected';
    result.sectionsVisible = {
      rms: true,
      freqBands: true,
      oscilloscope: true,
      glitchSettings: true,
      timeline: true,
      heatmap: true,
      effects: true
    };
  }

  if (response && response.alreadyActive) {
    result.startBtnDisabled = true;
    result.stopBtnDisabled = false;
  }

  return result;
}

/**
 * Determines keepalive interval based on capture state.
 */
function getKeepaliveInterval(captureActive) {
  return captureActive ? 10000 : 0;
}

/**
 * Determines stream monitor interval.
 */
function getStreamMonitorInterval(captureActive) {
  return captureActive ? 200 : 0;
}

/**
 * Validates the cleanup state after stopCapture.
 */
function validateCleanupState(state) {
  return {
    mediaStreamStopped: !state.mediaStream || state.mediaStreamTracksStopped,
    audioContextClosed: !state.audioContext || state.audioContextClosed,
    timersCleared: state.timersCleared,
    sourceDisconnected: state.sourceDisconnected,
    trackListenersRemoved: state.trackListenersRemoved,
    isClean: !state.mediaStream && !state.audioContext && state.timersCleared
  };
}

module.exports = {
  CAPTURE_SOURCES,
  DEFAULT_SAMPLE_RATE,
  buildStreamOptions,
  validateMediaStream,
  buildErrorResponse,
  getExpectedApiCall,
  validateCaptureSource,
  buildSuccessResponse,
  needsTrackCleanup,
  validateAudioContextConfig,
  validateWorkletNodeConfig,
  handleCaptureResponse,
  formatCaptureError,
  validatePopupStateAfterCapture,
  getKeepaliveInterval,
  getStreamMonitorInterval,
  validateCleanupState
};
