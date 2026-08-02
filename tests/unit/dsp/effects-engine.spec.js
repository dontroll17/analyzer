// effects-engine.spec.js — Tests for pure effect state management logic
const {
  createEffectsState,
  EFFECTS_DEFAULTS,
  handleEffectMessage,
  updateCompressorState,
  updateLimiterState,
  updateEQState,
  updateDelayState,
  isEffectsDefaults
} = require('../../../dsp-engine/effects-engine');

describe('createEffectsState', () => {
  test('returns fresh deep clone of defaults', () => {
    const state1 = createEffectsState();
    const state2 = createEffectsState();
    
    // Must be independent objects
    expect(state1).not.toBe(state2);
    expect(state1.compressor).not.toBe(state2.compressor);
    expect(state1.eq).not.toBe(state2.eq);
  });

  test('matches EFFECTS_DEFAULTS structure', () => {
    const state = createEffectsState();
    
    expect(state).toHaveProperty('compressor');
    expect(state).toHaveProperty('limiter');
    expect(state).toHaveProperty('eq');
    expect(state).toHaveProperty('delay');
    
    expect(state.compressor).toEqual(EFFECTS_DEFAULTS.compressor);
    expect(state.limiter).toEqual(EFFECTS_DEFAULTS.limiter);
    expect(state.eq).toEqual(EFFECTS_DEFAULTS.eq);
    expect(state.delay).toEqual(EFFECTS_DEFAULTS.delay);
  });

  test('all effects start disabled', () => {
    const state = createEffectsState();
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
  });
});

describe('handleEffectMessage — compressor', () => {
  test('enables compressor via _SSA_SET_COMPRESSOR', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_COMPRESSOR',
      active: true,
      params: { threshold: -20, ratio: 10 }
    };
    
    const { newState, handled } = handleEffectMessage(state, msg);
    
    expect(handled).toBe(true);
    expect(newState.compressor.enabled).toBe(true);
    expect(newState.compressor.threshold).toBe(-20);
    expect(newState.compressor.ratio).toBe(10);
    // Unchanged fields preserved
    expect(newState.compressor.knee).toBe(30);
  });

  test('disables compressor', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_COMPRESSOR', active: false };
    
    const { newState } = handleEffectMessage(state, msg);
    
    expect(newState.compressor.enabled).toBe(false);
  });

  test('ignores invalid message types', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_INVALID_TYPE' };
    
    const result = handleEffectMessage(state, msg);
    
    expect(result.handled).toBe(false);
    expect(result.state).toBe(state); // Same object reference
  });

  test('ignores null/undefined messages', () => {
    const state = createEffectsState();
    
    expect(handleEffectMessage(state, null).handled).toBe(false);
    expect(handleEffectMessage(state, undefined).handled).toBe(false);
  });
});

describe('handleEffectMessage — limiter', () => {
  test('enables limiter via _SSA_SET_LIMITER', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_LIMITER', active: true, params: { threshold: -3 } };
    
    const { newState, handled } = handleEffectMessage(state, msg);
    
    expect(handled).toBe(true);
    expect(newState.limiter.enabled).toBe(true);
    expect(newState.limiter.threshold).toBe(-3);
  });

  test('updates threshold only', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_LIMITER', params: { threshold: -5 } };
    
    const { newState } = handleEffectMessage(state, msg);
    
    expect(newState.limiter.threshold).toBe(-5);
    expect(newState.limiter.enabled).toBe(false); // unchanged
  });
});

describe('handleEffectMessage — EQ', () => {
  test('enables EQ and sets frequencies', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_EQ',
      active: true,
      params: { hpfFreq: 50, lpfFreq: 18000, peakFreq: 2000, peakGain: 6, peakQ: 2 }
    };
    
    const { newState, handled } = handleEffectMessage(state, msg);
    
    expect(handled).toBe(true);
    expect(newState.eq.enabled).toBe(true);
    expect(newState.eq.hpfFreq).toBe(50);
    expect(newState.eq.lpfFreq).toBe(18000);
    expect(newState.eq.peakFreq).toBe(2000);
    expect(newState.eq.peakGain).toBe(6);
    expect(newState.eq.peakQ).toBe(2);
  });

  test('disables EQ', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_EQ', active: false };
    
    const { newState } = handleEffectMessage(state, msg);
    
    expect(newState.eq.enabled).toBe(false);
    expect(newState.eq.hpfFreq).toBe(20); // unchanged
  });

  test('updates peak gain without changing enabled state', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_EQ', params: { peakGain: 12 } };
    
    const { newState } = handleEffectMessage(state, msg);
    
    expect(newState.eq.peakGain).toBe(12);
    expect(newState.eq.enabled).toBe(false); // unchanged
  });
});

describe('handleEffectMessage — delay', () => {
  test('enables delay with parameters', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_DELAY',
      active: true,
      params: { delayTime: 500, feedback: 50, mix: 30 }
    };
    
    const { newState, handled } = handleEffectMessage(state, msg);
    
    expect(handled).toBe(true);
    expect(newState.delay.enabled).toBe(true);
    expect(newState.delay.delayTime).toBe(500);
    expect(newState.delay.feedback).toBe(50);
    expect(newState.delay.mix).toBe(30);
  });

  test('disables delay', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_DELAY', active: false };
    
    const { newState } = handleEffectMessage(state, msg);
    
    expect(newState.delay.enabled).toBe(false);
  });

  test('normalizes enabled to boolean', () => {
    const state = createEffectsState();
    const msg = { type: '_SSA_SET_DELAY', active: 'yes' }; // truthy string
    
    const { newState } = handleEffectMessage(state, msg);
    
    expect(newState.delay.enabled).toBe(true); // !!'yes' = true
  });
});

describe('State independence — no mutation of input', () => {
  test('updateCompressorState returns new object', () => {
    const state = createEffectsState();
    const newState = updateCompressorState(state, { enabled: true });
    
    expect(newState).not.toBe(state);
    expect(newState.compressor).not.toBe(state.compressor);
    expect(newState.eq).toBe(state.eq); // Nested objects untouched share reference
  });

  test('updateEQState returns new object', () => {
    const state = createEffectsState();
    const newState = updateEQState(state, { enabled: true });
    
    expect(newState).not.toBe(state);
    expect(newState.eq).not.toBe(state.eq);
    expect(newState.compressor).toBe(state.compressor);
  });

  test('updateDelayState returns new object', () => {
    const state = createEffectsState();
    const newState = updateDelayState(state, { enabled: true });
    
    expect(newState).not.toBe(state);
    expect(newState.delay).not.toBe(state.delay);
    expect(newState.limiter).toBe(state.limiter);
  });

  test('updateLimiterState returns new object', () => {
    const state = createEffectsState();
    const newState = updateLimiterState(state, { enabled: true });
    
    expect(newState).not.toBe(state);
    expect(newState.limiter).not.toBe(state.limiter);
    expect(newState.compressor).toBe(state.compressor);
  });

  test('multiple sequential updates all produce new objects', () => {
    let state = createEffectsState();
    state = updateCompressorState(state, { enabled: true });
    state = updateLimiterState(state, { enabled: true });
    state = updateEQState(state, { enabled: true });
    state = updateDelayState(state, { enabled: true });
    
    // All states should have all effects enabled
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });
});

describe('handleEffectMessage — chained operations', () => {
  test('simulates full user flow: enable compressor → change threshold → enable EQ', () => {
    let state = createEffectsState();
    
    // User enables compressor
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -24, ratio: 12 }
    }).newState;
    expect(state.compressor.enabled).toBe(true);
    
    // User changes threshold
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', params: { threshold: -30 }
    }).newState;
    expect(state.compressor.threshold).toBe(-30);
    expect(state.compressor.enabled).toBe(true); // still enabled
    
    // User enables EQ
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ', active: true,
      params: { hpfFreq: 80, peakGain: 0 }
    }).newState;
    expect(state.eq.enabled).toBe(true);
    expect(state.compressor.enabled).toBe(true); // compressor still on
    
    // Verify all persisted correctly
    expect(state.compressor.threshold).toBe(-30);
    expect(state.compressor.ratio).toBe(12);
    expect(state.eq.hpfFreq).toBe(80);
    expect(state.eq.peakGain).toBe(0);
  });

  test('enables all effects sequentially', () => {
    let state = createEffectsState();
    
    const messages = [
      { type: '_SSA_SET_COMPRESSOR', active: true },
      { type: '_SSA_SET_LIMITER', active: true },
      { type: '_SSA_SET_EQ', active: true },
      { type: '_SSA_SET_DELAY', active: true }
    ];
    
    for (const msg of messages) {
      const { newState } = handleEffectMessage(state, msg);
      state = newState;
    }
    
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });
});

describe('isEffectsDefaults', () => {
  test('returns true for fresh state', () => {
    expect(isEffectsDefaults(createEffectsState())).toBe(true);
  });

  test('returns false when compressor is enabled', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('returns false when any parameter changed', () => {
    const state = createEffectsState();
    state.eq.hpfFreq = 50;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('returns false when limiter threshold changed', () => {
    const state = createEffectsState();
    state.limiter.threshold = -10;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('returns true for deep clone of defaults', () => {
    const defaults = JSON.parse(JSON.stringify(EFFECTS_DEFAULTS));
    // Convert to effects state format
    const state = {
      compressor: defaults.compressor,
      limiter: defaults.limiter,
      eq: defaults.eq,
      delay: defaults.delay
    };
    expect(isEffectsDefaults(state)).toBe(true);
  });
});

describe('Edge cases', () => {
  test('handles extreme parameter values', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -100, knee: 0, ratio: 100, attack: 0, release: 2000 }
    };
    
    const { newState } = handleEffectMessage(state, msg);
    expect(newState.compressor.threshold).toBe(-100);
    expect(newState.compressor.knee).toBe(0);
    expect(newState.compressor.ratio).toBe(100);
    expect(newState.compressor.attack).toBe(0);
    expect(newState.compressor.release).toBe(2000);
  });

  test('handles partial updates (only some params)', () => {
    const baseState = createEffectsState();
    const state = {
      ...baseState,
      compressor: { ...baseState.compressor, enabled: true, threshold: -30, attack: 5, release: 300 }
    };
    
    // Update only threshold
    const result = updateCompressorState(state, { threshold: -20 });
    
    expect(result.compressor.threshold).toBe(-20);
    expect(result.compressor.enabled).toBe(true); // preserved
    expect(result.compressor.knee).toBe(30); // preserved from original
    expect(result.compressor.attack).toBe(5); // preserved
  });

  test('handles null params gracefully', () => {
    const state = createEffectsState();
    const result = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      active: true,
      params: null
    });
    
    expect(result.newState.compressor.enabled).toBe(true);
    expect(result.newState.compressor.threshold).toBe(-24); // defaults
    expect(result.handled).toBe(true);
  });

  test('missing type in message', () => {
    const state = createEffectsState();
    const { handled } = handleEffectMessage(state, { active: true });
    
    expect(handled).toBe(false);
  });

  test('returns { state, handled } for unknown messages', () => {
    const state = createEffectsState();
    const result = handleEffectMessage(state, { type: '_UNKNOWN' });
    
    expect(result.state).toBe(state);
    expect(result.handled).toBe(false);
    expect(result.newState).toBeUndefined();
  });
});
