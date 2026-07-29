/**
 * Web MIDI Export Module
 * Sends real-time audio analysis metrics to MIDI devices via Web MIDI API.
 *
 * Metric-to-MIDI mapping:
 *  - RMS Energy       → CC1  (Modulation Wheel)
 *  - Bass Band        → CC7  (Balance)
 *  - Mid Band         → CC10 (Pan)
 *  - Treble Band      → CC11 (Expression)
 *  - Glitch Count     → CC19 (Capture Hold)
 *  - Entropy          → CC12 (Input Gain)
 *  - Flatness         → CC91 (Reverb Depth)
 *  - Glitch State     → CC123 (All Notes Off: 0=STABLE, 64=DRIFT, 127=GLITCH)
 *
 * Usage:
 *   const midi = new MIDIExporter();
 *   await midi.requestAccess();
 *   midi.sendMetrics({ rms: 0.5, bass: 30, mid: 40, treble: 30, ... });
 */

const MIDI_CC = {
  MODULATION:    1,
  BALANCE:       7,
  PAN:          10,
  EXPRESSION:   11,
  CAPTURE_HOLD: 19,
  INPUT_GAIN:   12,
  REVERB_DEPTH: 91,
  ALL_NOTES_OFF:123
};

const MIDI_CHANNEL = 0; // Channel 1 (0-indexed)

class MIDIExporter {
  constructor() {
    this.midi = null;
    this.output = null;
    this.isConnected = false;
    this.metricsListener = null;
    this._notifyOnConnect();
  }

  /**
   * Check if Web MIDI API is available
   */
  isAvailable() {
    return typeof navigator !== 'undefined' &&
           typeof navigator.requestMIDIAccess === 'function';
  }

  /**
   * Request MIDI access and list available outputs
   */
  async requestAccess() {
    if (!this.isAvailable()) {
      console.warn('[MIDI] Web MIDI API not available');
      return false;
    }

    try {
      this.midi = await navigator.requestMIDIAccess({ sysex: false });
      
      this.midi.onstatechange = (e) => {
        this._updateOutputs();
      };

      this._updateOutputs();
      return this.isConnected;
    } catch (err) {
      console.error('[MIDI] Access denied:', err.message);
      return false;
    }
  }

  /**
   * Update available MIDI outputs
   */
  _updateOutputs() {
    const outputs = Array.from(this.midi.outputs.values());
    
    // Prefer output with "MIDI" in name, or take first
    this.output = outputs.find(o => o.name.toLowerCase().includes('midi')) || outputs[0] || null;
    this.isConnected = !!this.output;
    
    this._notifyOnConnect();
  }

  /**
   * Notify via custom event when MIDI is connected
   */
  _notifyOnConnect() {
    window.dispatchEvent(new CustomEvent('midiStatusChange', {
      detail: {
        available: this.isAvailable(),
        connected: this.isConnected,
        outputName: this.output?.name || null
      }
    }));
  }

  /**
   * Map value from range [min, max] to MIDI CC [0, 127]
   */
  _toMIDI(value, min = 0, max = 100) {
    const clamped = Math.max(min, Math.min(max, value));
    return Math.round(((clamped - min) / (max - min)) * 127);
  }

  /**
   * Send a single MIDI Control Change message
   * @param {number} cc - Control Change number (1-127)
   * @param {number} value - Value 0-127
   */
  sendCC(cc, value) {
    if (!this.output || !this.isConnected) return;
    
    try {
      this.output.send([0xB0 | MIDI_CHANNEL, cc, Math.max(0, Math.min(127, value))]);
    } catch (err) {
      console.warn('[MIDI] sendCC failed:', err.message);
    }
  }

  /**
   * Send all audio analysis metrics as MIDI CC messages
   * @param {Object} metrics - Audio analysis metrics
   * @param {number} metrics.rms - RMS energy (0-1)
   * @param {number} metrics.bass - Bass band percentage (0-100)
   * @param {number} metrics.mid - Mid band percentage (0-100)
   * @param {number} metrics.treble - Treble band percentage (0-100)
   * @param {number} [metrics.entropy] - Shannon entropy
   * @param {number} [metrics.flatness] - Spectral flatness
   * @param {string} [metrics.glitchState] - STABLE / DRIFT / GLITCH
   * @param {number} [metrics.glitchCount] - Cumulative glitch counter
   */
  sendMetrics(metrics) {
    if (!this.isConnected) return;

    const {
      rms = 0,
      bass = 0,
      mid = 0,
      treble = 0,
      entropy = 0,
      flatness = 0,
      glitchState = 'STABLE',
      glitchCount = 0
    } = metrics;

    // RMS → CC1 (Modulation Wheel), scale 0-1 → 0-127
    this.sendCC(MIDI_CC.MODULATION, this._toMIDI(rms, 0, 1));

    // Frequency bands → CC7, CC10, CC11
    this.sendCC(MIDI_CC.BALANCE, this._toMIDI(bass));
    this.sendCC(MIDI_CC.PAN, this._toMIDI(mid));
    this.sendCC(MIDI_CC.EXPRESSION, this._toMIDI(treble));

    // Glitch state → CC123 (All Notes Off): 0=STABLE, 64=DRIFT, 127=GLITCH
    let glitchCC = 0;
    if (glitchState === 'DRIFT') glitchCC = 64;
    else if (glitchState === 'GLITCH') glitchCC = 127;
    this.sendCC(MIDI_CC.ALL_NOTES_OFF, glitchCC);

    // Entropy → CC12 (Input Gain), scale 0-2.0 → 0-127
    this.sendCC(MIDI_CC.INPUT_GAIN, this._toMIDI(entropy, 0, 2));

    // Flatness → CC91 (Reverb Depth), scale 0-1 → 0-127
    this.sendCC(MIDI_CC.REVERB_DEPTH, this._toMIDI(flatness, 0, 1));

    // Glitch count → CC19 (Capture Hold), modulo 127
    this.sendCC(MIDI_CC.CAPTURE_HOLD, glitchCount % 128);
  }

  /**
   * Register a callback to receive metrics
   * @param {Function} callback - (metrics) => void
   */
  onMetrics(callback) {
    this.metricsListener = callback;
    
    // Listen for metrics events from popup/background
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'METRICS' && this.metricsListener) {
          this.metricsListener(msg);
        }
      });
    }
  }

  /**
   * Get list of available MIDI outputs for UI selection
   * @returns {Array<{id: string, name: string}>}
   */
  getOutputs() {
    if (!this.midi) return [];
    return Array.from(this.midi.outputs.values()).map(o => ({
      id: o.id,
      name: o.name
    }));
  }

  /**
   * Set specific MIDI output by ID
   */
  setOutput(outputId) {
    if (!this.midi) return;
    this.output = this.midi.outputs.get(outputId) || null;
    this.isConnected = !!this.output;
    this._notifyOnConnect();
  }

  /**
   * Close MIDI connection
   */
  close() {
    if (this.midi) {
      this.midi.close();
      this.midi = null;
    }
    this.output = null;
    this.isConnected = false;
    this.metricsListener = null;
  }
}

export const midiExporter = new MIDIExporter();
