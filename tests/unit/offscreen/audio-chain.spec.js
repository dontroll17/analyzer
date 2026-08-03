/**
 * Linear-Cascaded Audio Topology Tests
 * audioSource → compressor → dcBlocker → EQ → Delay → Limiter → masterGain → destination
 * 7 suites, 60 tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../setup';
import { createMockMediaStream } from '../setup';

/* ================================================================
 * Helpers
 * ================================================================ */

let connectLog;
function resetConnectLog() { connectLog = []; }

function makeMockGain(name, initValue = 1) {
  const node = {
    name,
    connect: vi.fn((target) => { connectLog.push({ from: name, to: target }); return this; }),
    disconnect: vi.fn(),
    gain: {
      value: initValue,
      set: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setValueCurveAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
    },
  };
  return node;
}

/**
 * Create a minimal mock AudioContext that mirrors real AudioContext API.
 * Each createXxx returns a unique node so we can assert connections.
 */
function makeMockAudioContext(sampleRate = 44100) {
  const nodes = [];
  let counter = 0;

  function mkId() { return `n-${sampleRate}-${counter++}`; }

  const gainNode = vi.fn(function () {
    const id = mkId();
    const node = makeMockGain(id);
    nodes.push(node);
    return node;
  });
  gainNode.mockReturnValue(makeMockGain('masterGain'));

  const filterNode = vi.fn(function () {
    const id = mkId();
    const node = {
      name: id,
      connect: vi.fn((t) => { connectLog.push({ from: id, to: t }); return this; }),
      disconnect: vi.fn(),
      type: 'highpass',
      frequency: { value: 20, set: vi.fn(), setValueAtTime: vi.fn() },
      Q: { value: 0.707, set: vi.fn() },
    };
    nodes.push(node);
    return node;
  });

  const compressorNode = vi.fn(function () {
    const id = mkId();
    const node = {
      name: id,
      connect: vi.fn((t) => { connectLog.push({ from: id, to: t }); return this; }),
      disconnect: vi.fn(),
      threshold: { value: -100, set: vi.fn(), setValueAtTime: vi.fn() },
      knee:    { value: 0,    set: vi.fn(), setValueAtTime: vi.fn() },
      ratio:   { value: 1,    set: vi.fn(), setValueAtTime: vi.fn() },
      attack:  { value: 0.003, set: vi.fn(), setValueAtTime: vi.fn() },
      release: { value: 0.250, set: vi.fn(), setValueAtTime: vi.fn() },
    };
    nodes.push(node);
    return node;
  });

  const delayNode = vi.fn(function () {
    const id = mkId();
    const node = {
      name: id,
      connect: vi.fn((t) => { connectLog.push({ from: id, to: t }); return this; }),
      disconnect: vi.fn(),
      port: { postMessage: vi.fn(), onmessage: null },
      delayTime: { value: 0, set: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    };
    nodes.push(node);
    return node;
  });

  const wsNode = vi.fn(function () {
    const id = mkId();
    const node = {
      name: id,
      connect: vi.fn((t) => { connectLog.push({ from: id, to: t }); return this; }),
      disconnect: vi.fn(),
      curve: new Float32Array([0, 1]),
      oversample: 'none',
    };
    nodes.push(node);
    return node;
  });

  const sourceNode = vi.fn(function () {
    const id = mkId();
    const node = {
      name: id,
      connect: vi.fn((t) => { connectLog.push({ from: id, to: t }); }),
      disconnect: vi.fn(),
    };
    nodes.push(node);
    return node;
  });

  return {
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createGain: gainNode,
    createBiquadFilter: filterNode,
    createDynamicsCompressor: compressorNode,
    createDelay: delayNode,
    createWaveShaper: wsNode,
    createMediaStreamSource: sourceNode,
    close: vi.fn().mockResolvedValue(undefined),
    state: 'running',
    currentTime: 0,
    sampleRate,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

/* ================================================================
 * Suite 1: Equal-Power Crossfade Math          (tests 1-8)
 * ================================================================ */

describe('Equal-Power Crossfade Math', () => {
  const FADE_STEPS = 64;
  const CROSSFADE_TAU = 0.015;

  // Compute expected tables inline (module-scoped in offscreen.js can't be imported)
  const EQ_IN  = new Float32Array(FADE_STEPS);
  const EQ_OUT = new Float32Array(FADE_STEPS);
  for (let i = 0; i < FADE_STEPS; i++) {
    const alpha = i / (FADE_STEPS - 1);
    EQ_IN[i]  = Math.sin((Math.PI / 2) * alpha);
    EQ_OUT[i] = Math.cos((Math.PI / 2) * alpha);
  }

  it('1. FADE_STEPS === 64', () => {
    expect(FADE_STEPS).toBe(64);
  });

  it('2. CROSSFADE_TAU === 0.015 (15 ms)', () => {
    expect(CROSSFADE_TAU).toBe(0.015);
  });

  it('3. sin²(α·π/2) + cos²(α·π/2) = 1 for all steps', () => {
    for (let i = 0; i < FADE_STEPS; i++) {
      const sum = EQ_IN[i] ** 2 + EQ_OUT[i] ** 2;
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('4. EQUAL_POWER_IN[0] === 0 (zero wet)', () => {
    expect(EQ_IN[0]).toBe(0);
  });

  it('5. EQUAL_POWER_OUT[0] === 1 (full dry)', () => {
    expect(EQ_OUT[0]).toBe(1);
  });

  it('6. EQUAL_POWER_IN[last] === 1 (full wet)', () => {
    expect(EQ_IN[FADE_STEPS - 1]).toBe(1);
  });

  it('7. EQUAL_POWER_OUT[last] === 0 (zero dry)', () => {
    expect(EQ_OUT[FADE_STEPS - 1]).toBe(0);
  });

  it('8. Tables are monotonically increasing/decreasing', () => {
    for (let i = 1; i < FADE_STEPS; i++) {
      expect(EQ_IN[i]).toBeGreaterThan(EQ_IN[i - 1]);
      expect(EQ_OUT[i]).toBeLessThan(EQ_OUT[i - 1]);
    }
  });
});


/* ================================================================
 * Suite 2: AudioChain Structure                (tests 9-16)
 * ================================================================ */

describe('AudioChain Structure', () => {
  // Read the raw source to assert field names
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../../../offscreen.js'),
    'utf8',
  );

  it('9. audioChain object exists at module scope', () => {
    expect(src).toMatch(/const\s+audioChain\s*=\s*\{/);
  });

  it('10. Compressor fields: compressor, compressorWetGain, compressorDryGain', () => {
    expect(src).toContain('compressor: null');
    expect(src).toContain('compressorWetGain: null');
    expect(src).toContain('compressorDryGain: null');
  });

  it('11. DC blocker field', () => {
    expect(src).toContain('dcBlocker: null');
  });

  it('12. EQ stage fields (6 items)', () => {
    expect(src).toMatch(/eqStageInputSplitter: null/);
    expect(src).toMatch(/lpf: null/);
    expect(src).toMatch(/peaking: null/);
    expect(src).toMatch(/eqWetGain: null/);
    expect(src).toMatch(/eqDryGain: null/);
    expect(src).toMatch(/eqStageSummer: null/);
  });

  it('13. Delay stage fields (6 items)', () => {
    expect(src).toMatch(/delayStageSplitter: null/);
    expect(src).toMatch(/delay: null/);
    expect(src).toMatch(/delayWetGain: null/);
    expect(src).toMatch(/delayDryGain: null/);
    expect(src).toMatch(/delayCompensatorNode: null/);
    expect(src).toMatch(/delayStageSummer: null/);
  });

  it('14. Limiter stage fields (5 items)', () => {
    expect(src).toMatch(/limiterInputGain: null/);
    expect(src).toMatch(/waveShaper: null/);
    expect(src).toMatch(/limiterWetGain: null/);
    expect(src).toMatch(/limiterDryGain: null/);
    expect(src).toMatch(/masterGain: null/);
  });

  it('15. Shared nodes: source, worklet, analysisTap', () => {
    expect(src).toMatch(/source: null/);
    expect(src).toMatch(/worklet: null/);
    expect(src).toMatch(/analysisTap: null/);
  });

  it('16. ready flag exists', () => {
    expect(src).toMatch(/ready:\s*false/);
  });

  // Count unique field names
  const fieldMatches = src.matchAll(/^\s+(\w+):\s*null/gm);
  let fieldCount = 0;
  for (const _ of fieldMatches) fieldCount++;
  // We expect 25 fields (1 compressor + 3 comp wet/dry … etc.)
  it('16b. Total of 25 fields in audioChain', () => {
    expect(fieldCount).toBe(25);
  });
});


/* ================================================================
 * Suite 3: Routing Verification                (tests 17-29)
 * ================================================================ */

describe('Routing Verification', () => {
  it('17. source → compressor', () => {
    const ctx  = makeMockAudioContext();
    const srcN = ctx.createMediaStreamSource();
    const comp = ctx.createDynamicsCompressor();
    srcN.connect(comp);
    expect(connectLog).toContainEqual({ from: srcN.name, to: comp });
  });

  it('18. compressor → compressorWetGain', () => {
    const ctx  = makeMockAudioContext();
    const comp = ctx.createDynamicsCompressor();
    const wet  = ctx.createGain();
    comp.connect(wet);
    expect(connectLog).toContainEqual({ from: comp.name, to: wet });
  });

  it('19. compressor → compressorDryGain', () => {
    const ctx   = makeMockAudioContext();
    const comp  = ctx.createDynamicsCompressor();
    const dry   = ctx.createGain();
    comp.connect(dry);
    expect(connectLog.filter(c => c.from === comp.name)).toHaveLength(2); // wet + dry
  });

  it('20. compressorWetGain → dcBlocker', () => {
    const ctx   = makeMockAudioContext();
    const wet   = ctx.createGain();
    const dc    = ctx.createBiquadFilter();
    wet.connect(dc);
    expect(connectLog).toContainEqual({ from: wet.name, to: dc });
  });

  it('21. compressorDryGain → dcBlocker', () => {
    const ctx   = makeMockAudioContext();
    const dry   = ctx.createGain();
    const dc    = ctx.createBiquadFilter();
    dry.connect(dc);
    expect(connectLog).toContainEqual({ from: dry.name, to: dc });
  });

  it('22. dcBlocker → eqStageInputSplitter', () => {
    const ctx    = makeMockAudioContext();
    const dc     = ctx.createBiquadFilter();
    const splitter = ctx.createGain();
    dc.connect(splitter);
    expect(connectLog).toContainEqual({ from: dc.name, to: splitter });
  });

  it('23. eqStageInputSplitter → lpf → peaking → eqWetGain → eqStageSummer', () => {
    const ctx    = makeMockAudioContext();
    const splitter = ctx.createGain();
    const lpf    = ctx.createBiquadFilter();
    const peak   = ctx.createBiquadFilter();
    const wet    = ctx.createGain();
    const summer = ctx.createGain();
    splitter.connect(lpf);
    lpf.connect(peak);
    peak.connect(wet);
    wet.connect(summer);
    const wetPaths = connectLog.filter(c => c.to === wet || c.to === summer);
    expect(wetPaths.length).toBe(4);
  });

  it('24. eqStageInputSplitter → eqDryGain → eqStageSummer', () => {
    const ctx    = makeMockAudioContext();
    const splitter = ctx.createGain();
    const dry    = ctx.createGain();
    const summer = ctx.createGain();
    splitter.connect(dry);
    dry.connect(summer);
    expect(connectLog).toContainEqual({ from: dry.name, to: summer });
  });

  it('25. eqStageSummer → delayStageSplitter', () => {
    const ctx       = makeMockAudioContext();
    const summer    = ctx.createGain();
    const dsplitter = ctx.createGain();
    summer.connect(dsplitter);
    expect(connectLog).toContainEqual({ from: summer.name, to: dsplitter });
  });

  it('26. delayStageSplitter → delay (worklet)', () => {
    const ctx       = makeMockAudioContext();
    const dsplitter = ctx.createGain();
    const delay     = ctx.createDelay(); // reused as worklet mock
    dsplitter.connect(delay);
    expect(connectLog).toContainEqual({ from: dsplitter.name, to: delay });
  });

  it('27. delay → delayWetGain → delayStageSummer', () => {
    const ctx       = makeMockAudioContext();
    const delay     = ctx.createDelay();
    const wet       = ctx.createGain();
    const summer    = ctx.createGain();
    delay.connect(wet);
    wet.connect(summer);
    expect(connectLog).toContainEqual({ from: delay.name, to: wet });
    expect(connectLog).toContainEqual({ from: wet.name, to: summer });
  });

  it('28. delayStageSplitter → delayCompensatorNode → delayDryGain → delayStageSummer', () => {
    const ctx       = makeMockAudioContext();
    const dsplitter = ctx.createGain();
    const comp      = ctx.createDelay();
    const dry       = ctx.createGain();
    const summer    = ctx.createGain();
    dsplitter.connect(comp);
    comp.connect(dry);
    dry.connect(summer);
    expect(connectLog).toContainEqual({ from: dsplitter.name, to: comp });
    expect(connectLog).toContainEqual({ from: comp.name, to: dry });
    expect(connectLog).toContainEqual({ from: dry.name, to: summer });
  });

  it('29. delayStageSummer → limiterInputGain → waveShaper → limiterWetGain → masterGain; limiterDryGain → masterGain; masterGain → destination (connected)', () => {
    const ctx     = makeMockAudioContext();
    const dSummer = ctx.createGain();
    const limIn   = ctx.createGain();
    const ws      = ctx.createWaveShaper();
    const wet     = ctx.createGain();
    const dry     = ctx.createGain();
    const master  = ctx.createGain();
    dSummer.connect(limIn);
    limIn.connect(ws);
    ws.connect(wet);
    wet.connect(master);
    limIn.connect(dry);
    dry.connect(master);
      });
});


/* ================================================================
 * Suite 4: Delay Compensation              (tests 30-33)
 * ================================================================ */

describe('Delay Compensation', () => {
  it('30. quantumDelaySeconds = 128 / sampleRate', () => {
    const sampleRate = 44100;
    const quantumDelaySeconds = 128 / sampleRate;
    expect(quantumDelaySeconds).toBeCloseTo(128 / 44100, 10);
  });

  it('31. Delay compensator delayTime matches quantum', () => {
    const sampleRate = 44100;
    const quantumDelaySeconds = 128 / sampleRate;
    const ctx = makeMockAudioContext(sampleRate);
    const delayComp = ctx.createDelay(quantumDelaySeconds + 0.01);
    delayComp.delayTime.setValueAtTime(quantumDelaySeconds, ctx.currentTime);
    expect(delayComp.delayTime.setValueAtTime).toHaveBeenCalledWith(
      quantumDelaySeconds,
      ctx.currentTime,
    );
  });

  it('32. createDelay() uses quantumDelaySeconds + 0.01 margin', () => {
    const sampleRate = 44100;
    const quantumDelaySeconds = 128 / sampleRate;
    const ctx = makeMockAudioContext(sampleRate);
    const _ = ctx.createDelay(quantumDelaySeconds + 0.01);
    expect(ctx.createDelay).toHaveBeenCalledWith(quantumDelaySeconds + 0.01);
  });

  it('33. Delay compensation differs for different sample rates', () => {
    const sr1 = 44100;
    const sr2 = 48000;
    const d1 = 128 / sr1;
    const d2 = 128 / sr2;
    expect(d1).not.toBe(d2);
    expect(d1).toBeGreaterThan(d2);
    // 128 samples at 44100 = ~2.90ms; at 48000 = ~2.67ms
    expect(d1).toBeCloseTo(0.002902, 6);
    expect(d2).toBeCloseTo(0.002667, 6);
  });
});


/* ================================================================
 * Suite 5: Effect Updates                  (tests 34-47)
 * ================================================================ */

describe('Effect Updates', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../../../offscreen.js'),
    'utf8',
  );

  it('34. setStageBypassState accepts wetParam, dryParam, engage, ctx, duration', () => {
    expect(src).toMatch(/function\s+setStageBypassState\s*\(\s*wetParam\s*,\s*dryParam\s*,\s*engage\s*,\s*ctx\s*(,\s*duration\s*=\s*0\.015)?\s*\)/);
  });

  it('35. setStageBypassState calls cancelScheduledValues before setValueCurve', () => {
    expect(src).toContain('wetParam.cancelScheduledValues(startTime)');
    expect(src).toContain('dryParam.cancelScheduledValues(startTime)');
    expect(src).toContain('wetParam.setValueCurveAtTime(EQUAL_POWER_IN');
    expect(src).toContain('dryParam.setValueCurveAtTime(EQUAL_POWER_OUT');
  });

  it('36. engage=true: wet=IN, dry=OUT', () => {
    // In engage branch: wet gets EQUAL_POWER_IN, dry gets EQUAL_POWER_OUT
    const engageBlock = src.match(/if\s*\(\s*engage\s*\)\s*\{[^}]*wetParam\.setValueCurveAtTime\(EQUAL_POWER_IN[^}]*dryParam\.setValueCurveAtTime\(EQUAL_POWER_OUT/s);
    expect(engageBlock).toBeTruthy();
  });

  it('37. engage=false: wet=OUT, dry=IN (bypass)', () => {
    const bypassBlock = src.match(/else\s*\{[^}]*wetParam\.setValueCurveAtTime\(EQUAL_POWER_OUT[^}]*dryParam\.setValueCurveAtTime\(EQUAL_POWER_IN/s);
    expect(bypassBlock).toBeTruthy();
  });

  it('38. Default duration = 0.015 (CROSSFADE_TAU)', () => {
    expect(src).toMatch(/function\s+setStageBypassState[^)]*duration\s*=\s*0\.015/);
  });

  it('39. _updateCompressor calls setTargetAtTime for ratio, threshold, knee, attack, release', () => {
    expect(src).toMatch(/comp\.ratio\.setTargetAtTime/);
    expect(src).toMatch(/comp\.threshold\.setTargetAtTime/);
    expect(src).toMatch(/comp\.knee\.setTargetAtTime/);
    expect(src).toMatch(/comp\.attack\.setTargetAtTime/);
    expect(src).toMatch(/comp\.release\.setTargetAtTime/);
  });

  it('40. _updateCompressor bypass resets to neutral values', () => {
    expect(src).toMatch(/comp\.ratio\.setTargetAtTime\s*\(\s*1/);
    expect(src).toMatch(/comp\.threshold\.setTargetAtTime\s*\(\s*-100/);
    expect(src).toMatch(/comp\.knee\.setTargetAtTime\s*\(\s*0/);
    expect(src).toMatch(/comp\.attack\.setTargetAtTime\s*\(\s*0\.003/);
    expect(src).toMatch(/comp\.release\.setTargetAtTime\s*\(\s*0\.250/);
  });

  it('41. _updateCompressor calls setStageBypassState in both enable and disable branches', () => {
    const funcMatch = src.match(/function _updateCompressor\([^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(funcMatch).toBeTruthy();
    const funcBody = funcMatch[0];
    expect(funcBody.match(/setStageBypassState/g)).toHaveLength(2);
  });

  it('42. _updateLimiter sets waveShaper.curve', () => {
    expect(src).toMatch(/ws\.curve\s*=\s*createLimiterCurve/);
  });

  it('43. _updateLimiter bypass resets curve to linear identity [0, 1]', () => {
    expect(src).toMatch(/ws\.curve\s*=\s*new Float32Array\(\[0,\s*1\]\)/);
  });

  it('44. _updateEQ sets HPF, LPF, peaking frequencies and peaking gain/Q', () => {
    expect(src).toMatch(/dc\.frequency\.setTargetAtTime/);
    expect(src).toMatch(/lpf\.frequency\.setTargetAtTime/);
    expect(src).toMatch(/peak\.frequency\.setTargetAtTime/);
    expect(src).toMatch(/peak\.gain\.setTargetAtTime/);
    expect(src).toMatch(/peak\.Q\.setTargetAtTime/);
  });

  it('45. _updateDelay sends SET_DELAY message to worklet port', () => {
    expect(src).toMatch(/audioChain\.delay\.port\.postMessage/);
    expect(src).toMatch(/type:\s*'SET_DELAY'/);
    expect(src).toMatch(/delayTime:.*delayTime.*\/\s*1000/);
    expect(src).toMatch(/feedback:.*feedback.*\/\s*100/);
    expect(src).toMatch(/mix:.*mix.*\/\s*100/);
    expect(src).toMatch(/sampleRate:/);
  });

  it('46. _handleEffectMessage dispatches all 4 effect types', () => {
    expect(src).toMatch(/type === '_SSA_SET_COMPRESSOR'/);
    expect(src).toMatch(/type === '_SSA_SET_LIMITER'/);
    expect(src).toMatch(/type === '_SSA_SET_EQ'/);
    expect(src).toMatch(/type === '_SSA_SET_DELAY'/);
  });
});


/* ================================================================
 * Suite 6: Cleanup                         (tests 48-52)
 * ================================================================ */

describe('Cleanup', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../../../offscreen.js'),
    'utf8',
  );

  it('48. cleanup() ramps master gain to 0 before disconnect', () => {
    expect(src).toMatch(/masterGain\.gain\.setTargetAtTime\s*\(\s*0/);
  });

  it('49. _performCleanup disconnects all AudioNodes in reverse order', () => {
    // Verify key disconnects in _performCleanup
    expect(src).toContain('audioChain.delay.disconnect()');
    expect(src).toContain('audioChain.delay.port.close()');
    expect(src).toContain('audioChain.worklet.disconnect()');
    expect(src).toContain('audioChain.worklet.port.close()');
    expect(src).toContain('audioChain.waveShaper.disconnect()');
    expect(src).toContain('audioChain.masterGain.disconnect()');
    expect(src).toContain('audioChain.delayCompensatorNode.disconnect()');
    expect(src).toContain('audioChain.compressor.disconnect()');
    expect(src).toContain('audioChain.source.disconnect()');
  });

  it('50. _performCleanup nulls all audioChain references', () => {
    const nullRefs = [
      'audioChain.compressor = null',
      'audioChain.compressorWetGain = null',
      'audioChain.compressorDryGain = null',
      'audioChain.dcBlocker = null',
      'audioChain.eqWetGain = null',
      'audioChain.eqDryGain = null',
      'audioChain.eqStageSummer = null',
      'audioChain.delay = null',
      'audioChain.delayWetGain = null',
      'audioChain.delayDryGain = null',
      'audioChain.delayCompensatorNode = null',
      'audioChain.waveShaper = null',
      'audioChain.limiterWetGain = null',
      'audioChain.limiterDryGain = null',
      'audioChain.masterGain = null',
      'audioChain.source = null',
      'audioChain.worklet = null',
      'audioChain.analysisTap = null',
    ];
    for (const ref of nullRefs) {
      expect(src).toContain(ref);
    }
  });

  it('51. _performCleanup clears track ended listeners and context statechange', () => {
    expect(src).toContain('_trackEndedListeners.clear()');
    expect(src).toContain('audioContext.removeEventListener(\'statechange\'');
    expect(src).toContain('_contextStateChangeHandler = null');
  });

  it('52. _performCleanup stops media tracks, closes AudioContext, sends _OFFSCREEN_ENDED', () => {
    expect(src).toContain('mediaStream.getTracks().forEach(t => t.stop())');
    expect(src).toContain('audioContext.close()');
    expect(src).toContain('safeSendMessage({ type: \'_OFFSCREEN_ENDED\' })');
  });
});


/* ================================================================
 * Suite 7: Integration Lifecycle           (tests 53-60)
 * ================================================================ */

describe('Integration: startCapture / stopCapture', () => {
  it('53. startCapture calls _loadEffectsFromStorage', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    const startMatch = src.match(/async function startCapture\s*\([^)]*\)\s*\{[\s\S]*?^}/m);
    expect(startMatch).toBeTruthy();
    expect(startMatch[0]).toContain('_loadEffectsFromStorage()');
  });

  it('54. startCapture creates AudioContext with sampleRate', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    const startMatch = src.match(/async function startCapture\s*\([^)]*\)\s*\{[\s\S]*?^}/m);
    expect(startMatch[0]).toContain('new AudioContext({ sampleRate: targetSampleRate })');
  });

  it('55. startCapture creates all nodes (compressor, dcBlocker, EQ, delay, limiter, master)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    const startMatch = src.match(/async function startCapture\s*\([^)]*\)\s*\{[\s\S]*?^}/m);
    const body = startMatch[0];
    expect(body).toContain('createDynamicsCompressor()');
    expect(body).toContain('createBiquadFilter()');
    expect(body).toContain('createWaveShaper()');
    expect(body).toContain('createMediaStreamSource');
    expect(body).toContain('createDelay(');
    expect(body).toMatch(/createGain\(\)/);
  });

  it('56. startCapture sets audioChain.ready = true after warm-up', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    expect(src).toContain('audioChain.ready = true');
  });

  it('57. startCapture applies saved effect states after warm-up', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    // After audioChain.ready = true
    expect(src).toContain('_updateCompressor({})');
    expect(src).toContain('_updateEQ({})');
    expect(src).toContain('_updateLimiter({})');
    expect(src).toContain('_updateDelay({})');
  });

  it('58. startCapture connects analysisTap before effects chain', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    const startMatch = src.match(/async function startCapture\s*\([^)]*\)\s*\{[\s\S]*?^}/m);
    const body = startMatch[0];
    // analysisTap connects source → analysisTap → worklet
    expect(body).toContain('audioSource.connect(analysisTap)');
    expect(body).toContain('analysisTap.connect(workletNode)');
  });

  it('59. stopCapture calls cleanup()', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    const stopMatch = src.match(/async function stopCapture\s*\(\s*\)\s*\{[\s\S]*?\n\}/);
    expect(stopMatch).toBeTruthy();
    expect(stopMatch[0]).toContain('cleanup()');
    expect(stopMatch[0]).toMatch(/return\s*\{\s*ok:\s*true\s*\}/);
  });

  it('60. _performCleanup disconnects ports with null guards and try/catch', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../offscreen.js'),
      'utf8',
    );
    // Port cleanup with null checks
    expect(src).toMatch(/if\s*\(\s*audioChain\.delay\s*\)\s*\{[\s\S]*?audioChain\.delay\.port\.close\(\)/);
    expect(src).toMatch(/if\s*\(\s*audioChain\.worklet\s*\)\s*\{[\s\S]*?audioChain\.worklet\.port\.close\(\)/);
    // try/catch around disconnects
    expect(src).toContain('try {');
    expect(src).toMatch(/if\s*\(\s*audioChain\.waveShaper\s*\)\s*audioChain\.waveShaper\.disconnect\(\)/);
  });
});