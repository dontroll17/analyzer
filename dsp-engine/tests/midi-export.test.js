/**
 * Vitest tests for MIDI Export module
 * Tests MIDIExporter class functionality: availability check, value mapping, CC sending, metrics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MIDIExporter, MIDI_CC } from '../midi-export.js';

// Simple mock for MIDI output device
let sentMessages = [];

class MockMIDIOutput {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.state = 'connected';
    this.portType = 'output';
  }
  send(data) { sentMessages.push([...data]); }
  close() {}
  sysex() {}
}

// Simple mock for MIDI access
class MockMIDIAccess {
  constructor(outputs, inputs = new Map()) {
    this._outputs = outputs;
    this._inputs = inputs;
    this.onstatechange = null;
  }
  get outputs() { return this._outputs; }
  get inputs() { return this._inputs; }
  close() {}
}

describe('MIDI Export Module', () => {
  beforeEach(() => {
    sentMessages = [];
  });

  describe('MIDIExporter class', () => {
    it('creates instance with correct initial state', () => {
      const exporter = new MIDIExporter();

      expect(exporter.isConnected).toBe(false);
      expect(exporter.output).toBeNull();
      expect(exporter.midi).toBeNull();
      expect(exporter.metricsListener).toBeNull();
    });

    it('exports MIDIExporter class', () => {
      expect(typeof MIDIExporter).toBe('function');
    });

    it('exports MIDI_CC constants', () => {
      expect(MIDI_CC.MODULATION).toBe(1);
      expect(MIDI_CC.BALANCE).toBe(7);
      expect(MIDI_CC.PAN).toBe(10);
      expect(MIDI_CC.EXPRESSION).toBe(11);
      expect(MIDI_CC.CAPTURE_HOLD).toBe(19);
      expect(MIDI_CC.INPUT_GAIN).toBe(12);
      expect(MIDI_CC.REVERB_DEPTH).toBe(91);
      expect(MIDI_CC.ALL_NOTES_OFF).toBe(123);
    });
  });

  describe('_toMIDI()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();
    });

    it('maps 0 to MIDI value 0', () => {
      expect(exporter._toMIDI(0, 0, 100)).toBe(0);
    });

    it('maps 100 to MIDI value 127', () => {
      expect(exporter._toMIDI(100, 0, 100)).toBe(127);
    });

    it('clamps values above max to 127', () => {
      expect(exporter._toMIDI(150, 0, 100)).toBe(127);
    });

    it('clamps values below min to 0', () => {
      expect(exporter._toMIDI(-10, 0, 100)).toBe(0);
    });

    it('correctly maps 50 to MIDI value ~64', () => {
      expect(exporter._toMIDI(50, 0, 100)).toBe(64);
    });

    it('uses custom range min/max', () => {
      // rms = 0.5, range [0, 1] -> should map to ~64
      expect(exporter._toMIDI(0.5, 0, 1)).toBe(64);
    });

    it('handles negative min', () => {
      // value 0 in range [-1, 1] should map to 64
      expect(exporter._toMIDI(0, -1, 1)).toBe(64);
    });
  });

  describe('sendCC()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();

      // Mock MIDI output
      exporter.output = new MockMIDIOutput('test', 'Test MIDI');
      exporter.isConnected = true;
      exporter.midi = { outputs: new Map(), close: () => {} };

      sentMessages = [];
    });

    it('sends a CC message when connected', () => {
      exporter.sendCC(1, 64);

      expect(sentMessages.length).toBe(1);
      // MIDI CC on channel 1: 0xB0 | 0 = 0xB0
      expect(sentMessages[0]).toEqual([0xB0, 1, 64]);
    });

    it('clamps CC value to 0-127', () => {
      exporter.sendCC(1, 200);
      expect(sentMessages[0]).toEqual([0xB0, 1, 127]);

      sentMessages = [];
      exporter.sendCC(1, -10);
      expect(sentMessages[0]).toEqual([0xB0, 1, 0]);
    });

    it('does nothing when not connected', () => {
      exporter.isConnected = false;
      exporter.output = null;

      exporter.sendCC(1, 64);

      expect(sentMessages.length).toBe(0);
    });
  });

  describe('sendMetrics()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();

      exporter.output = new MockMIDIOutput('test', 'Test MIDI');
      exporter.isConnected = true;
      exporter.midi = { outputs: new Map(), close: () => {} };

      sentMessages = [];
    });

    it('sends all metrics as CC messages', () => {
      exporter.sendMetrics({
        rms: 0.5,
        bass: 30,
        mid: 40,
        treble: 30,
        entropy: 0.8,
        flatness: 0.2,
        glitchState: 'STABLE',
        glitchCount: 5
      });

      // Should send 7 CC messages (RMS, Bass, Mid, Treble, Glitch State, Entropy, Flatness, Count)
      // Note: 8 messages total
      expect(sentMessages.length).toBe(8);
    });

    it('maps RMS to CC1 (Modulation)', () => {
      exporter.sendMetrics({ rms: 1.0, bass: 0, mid: 0, treble: 0 });

      // RMS 1.0 -> CC1 -> value 127
      expect(sentMessages[0]).toEqual([0xB0, 1, 127]);
    });

    it('maps frequency bands correctly', () => {
      exporter.sendMetrics({ rms: 0, bass: 100, mid: 85, treble: 50 });

      // CC7 (Balance) = bass 100 -> 127
      expect(sentMessages[1]).toEqual([0xB0, 7, 127]);
      // CC10 (Pan) = mid 85 -> ~108
      expect(sentMessages[2]).toEqual([0xB0, 10, 108]);
      // CC11 (Expression) = treble 50 -> 64
      expect(sentMessages[3]).toEqual([0xB0, 11, 64]);
    });

    it('maps glitch state to CC123', () => {
      sentMessages = [];
      exporter.sendMetrics({ glitchState: 'STABLE' });
      const stableMsg = sentMessages.find(m => m[1] === 123);
      expect(stableMsg).toEqual([0xB0, 123, 0]);

      sentMessages = [];
      exporter.sendMetrics({ glitchState: 'DRIFT' });
      const driftMsg = sentMessages.find(m => m[1] === 123);
      expect(driftMsg).toEqual([0xB0, 123, 64]);

      sentMessages = [];
      exporter.sendMetrics({ glitchState: 'GLITCH' });
      const glitchMsg = sentMessages.find(m => m[1] === 123);
      expect(glitchMsg).toEqual([0xB0, 123, 127]);
    });

    it('maps entropy to CC12 (Input Gain)', () => {
      // entropy = 1.0, range [0, 2] -> 64
      exporter.sendMetrics({ entropy: 1.0 });

      const entropyMsg = sentMessages.find(m => m[1] === 12);
      expect(entropyMsg).toEqual([0xB0, 12, 64]);
    });

    it('maps flatness to CC91 (Reverb Depth)', () => {
      // flatness = 0.5, range [0, 1] -> 64
      exporter.sendMetrics({ flatness: 0.5 });

      const flatnessMsg = sentMessages.find(m => m[1] === 91);
      expect(flatnessMsg).toEqual([0xB0, 91, 64]);
    });

    it('maps glitch count to CC19 (Capture Hold)', () => {
      exporter.sendMetrics({ glitchCount: 10 });

      const countMsg = sentMessages.find(m => m[1] === 19);
      expect(countMsg).toEqual([0xB0, 19, 10]);

      sentMessages = [];
      exporter.sendMetrics({ glitchCount: 200 });
      // 200 % 128 = 72
      const countMsg2 = sentMessages.find(m => m[1] === 19);
      expect(countMsg2).toEqual([0xB0, 19, 72]);
    });

    it('handles minimal metrics (silence)', () => {
      exporter.sendMetrics({
        rms: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        entropy: 0,
        flatness: 0,
        glitchState: 'STABLE',
        glitchCount: 0
      });

      expect(sentMessages.length).toBe(8);
      sentMessages.forEach(msg => {
        expect(msg[2]).toBeGreaterThanOrEqual(0);
        expect(msg[2]).toBeLessThanOrEqual(127);
      });
    });

    it('does nothing when not connected', () => {
      exporter.isConnected = false;
      exporter.output = null;

      exporter.sendMetrics({
        rms: 0.5,
        bass: 30,
        mid: 40,
        treble: 30
      });

      expect(sentMessages.length).toBe(0);
    });
  });

  describe('getOutputs()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();
    });

    it('returns empty array when not initialized', () => {
      const outputs = exporter.getOutputs();
      expect(outputs).toEqual([]);
    });

    it('returns list of available outputs when initialized', () => {
      const outputs = new Map();
      outputs.set('out-1', new MockMIDIOutput('out-1', 'USB MIDI'));
      outputs.set('out-2', new MockMIDIOutput('out-2', 'MIDI Controller'));
      exporter.midi = { outputs, close: () => {} };

      const result = exporter.getOutputs();

      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
    });
  });

  describe('setOutput()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();

      const outputs = new Map();
      outputs.set('out-1', new MockMIDIOutput('out-1', 'USB MIDI'));
      outputs.set('out-2', new MockMIDIOutput('out-2', 'MIDI Controller'));
      exporter.midi = { outputs, close: () => {} };
    });

    it('sets specific MIDI output by ID', () => {
      exporter.setOutput('out-2');

      expect(exporter.output.id).toBe('out-2');
      expect(exporter.output.name).toBe('MIDI Controller');
      expect(exporter.isConnected).toBe(true);
    });

    it('sets isConnected to false for non-existent ID', () => {
      exporter.setOutput('non-existent');

      expect(exporter.output).toBeNull();
      expect(exporter.isConnected).toBe(false);
    });
  });

  describe('close()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();

      const mockClose = vi.fn();
      const outputs = new Map();
      outputs.set('out-1', new MockMIDIOutput('out-1', 'Test'));
      exporter.midi = { outputs, close: mockClose };
      exporter.output = new MockMIDIOutput('out-1', 'Test');
      exporter.isConnected = true;
      exporter.metricsListener = () => {};
    });

    it('disconnects and resets state', () => {
      exporter.close();

      expect(exporter.isConnected).toBe(false);
      expect(exporter.output).toBeNull();
      expect(exporter.midi).toBeNull();
      expect(exporter.metricsListener).toBeNull();
    });
  });

  describe('onMetrics()', () => {
    let exporter;
    beforeEach(() => {
      exporter = new MIDIExporter();
    });

    it('registers a callback', () => {
      const callback = vi.fn();
      exporter.onMetrics(callback);

      expect(exporter.metricsListener).toBe(callback);
    });
  });
});
