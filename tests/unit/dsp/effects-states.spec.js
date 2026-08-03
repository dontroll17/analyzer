// effects-states.spec.js — Comprehensive tests for effect switching variations
// Tests combinations, toggling, switching, persistence, and edge cases

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


describe('1. Single Effect Toggling (Multiple Times)', () => {
  describe('Compressor toggling', () => {
    test('toggle ON -> OFF -> ON', () => {
      let state = createEffectsState();
      
      // ON
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
      
      // OFF
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      expect(state.compressor.enabled).toBe(false);
      
      // ON again
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
    });

    test('toggle ON -> OFF -> ON with different params each time', () => {
      let state = createEffectsState();
      
      // ON with threshold -20
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -20 }
      }).newState;
      expect(state.compressor.threshold).toBe(-20);
      expect(state.compressor.enabled).toBe(true);
      
      // OFF
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      expect(state.compressor.enabled).toBe(false);
      
      // ON with different params
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -30, ratio: 8 }
      }).newState;
      expect(state.compressor.threshold).toBe(-30);
      expect(state.compressor.ratio).toBe(8);
      expect(state.compressor.enabled).toBe(true);
    });

    test('multiple rapid toggles', () => {
      let state = createEffectsState();
      for (let i = 0; i < 10; i++) {
        state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
        state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      }
      expect(state.compressor.enabled).toBe(false);
    });

    test('toggling preserves other params when re-enabling', () => {
      let state = createEffectsState();
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -24, knee: 20, ratio: 10, attack: 2, release: 200 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      expect(state.compressor.enabled).toBe(false);
      // Params should be preserved even when disabled
      expect(state.compressor.threshold).toBe(-24);
      expect(state.compressor.knee).toBe(20);
      expect(state.compressor.ratio).toBe(10);
      expect(state.compressor.attack).toBe(2);
      expect(state.compressor.release).toBe(200);
    });
  });

  describe('Limiter toggling', () => {
    test('toggle ON -> OFF -> ON', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      expect(state.limiter.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      expect(state.limiter.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      expect(state.limiter.enabled).toBe(true);
    });

    test('toggle with different threshold values', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER', active: true,
        params: { threshold: -5 }
      }).newState;
      expect(state.limiter.threshold).toBe(-5);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      expect(state.limiter.enabled).toBe(false);
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER', active: true,
        params: { threshold: -3 }
      }).newState;
      expect(state.limiter.threshold).toBe(-3);
    });

    test('multiple rapid toggles', () => {
      let state = createEffectsState();
      for (let i = 0; i < 10; i++) {
        state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
        state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      }
      expect(state.limiter.enabled).toBe(false);
    });
  });

  describe('EQ toggling', () => {
    test('toggle ON -> OFF -> ON', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      expect(state.eq.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      expect(state.eq.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      expect(state.eq.enabled).toBe(true);
    });

    test('toggle with all EQ params', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 50, lpfFreq: 18000, peakFreq: 2000, peakGain: 6, peakQ: 2 }
      }).newState;
      expect(state.eq.hpfFreq).toBe(50);
      expect(state.eq.lpfFreq).toBe(18000);
      expect(state.eq.peakFreq).toBe(2000);
      expect(state.eq.peakGain).toBe(6);
      expect(state.eq.peakQ).toBe(2);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      expect(state.eq.enabled).toBe(false);
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 80, lpfFreq: 20000, peakFreq: 1500, peakGain: 3, peakQ: 1.5 }
      }).newState;
      expect(state.eq.hpfFreq).toBe(80);
      expect(state.eq.lpfFreq).toBe(20000);
      expect(state.eq.peakFreq).toBe(1500);
      expect(state.eq.peakGain).toBe(3);
      expect(state.eq.peakQ).toBe(1.5);
    });

    test('multiple rapid toggles', () => {
      let state = createEffectsState();
      for (let i = 0; i < 10; i++) {
        state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
        state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      }
      expect(state.eq.enabled).toBe(false);
    });
  });

  describe('Delay toggling', () => {
    test('toggle ON -> OFF -> ON', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      expect(state.delay.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      expect(state.delay.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      expect(state.delay.enabled).toBe(true);
    });

    test('toggle with all delay params', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_DELAY', active: true,
        params: { delayTime: 500, feedback: 50, mix: 30 }
      }).newState;
      expect(state.delay.delayTime).toBe(500);
      expect(state.delay.feedback).toBe(50);
      expect(state.delay.mix).toBe(30);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      expect(state.delay.enabled).toBe(false);
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_DELAY', active: true,
        params: { delayTime: 250, feedback: 70, mix: 50 }
      }).newState;
      expect(state.delay.delayTime).toBe(250);
      expect(state.delay.feedback).toBe(70);
      expect(state.delay.mix).toBe(50);
    });

    test('multiple rapid toggles', () => {
      let state = createEffectsState();
      for (let i = 0; i < 10; i++) {
        state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
        state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      }
      expect(state.delay.enabled).toBe(false);
    });

    test('toggle with truthy/falsy active values', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: 1 }).newState;
      expect(state.delay.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: 0 }).newState;
      expect(state.delay.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: 'on' }).newState;
      expect(state.delay.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: '' }).newState;
      expect(state.delay.enabled).toBe(false);
    });
  });
});


describe('2. Sequential Effect Switching (One at a Time)', () => {
  test('enable compressor, then disable it, then enable limiter', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(false);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true);
  });

  test('enable compressor then enable limiter, disable compressor, only limiter should be on', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true); // limiter should remain enabled
  });

  test('enable compressor then limiter then EQ then delay (sequential order)', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    expect(state.compressor.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
    expect(state.eq.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
    expect(state.delay.enabled).toBe(true);
  });

  test('reverse order: delay -> eq -> limiter -> compressor', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });

  test('enable compressor then disable all in different sequence', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
    
    // Disable in reverse order
    state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
    
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
  });

  test('interleaved enable/disable: c+e on, l on, c off, e off, l off', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
    expect(state.compressor.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    expect(state.limiter.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
    expect(state.compressor.enabled).toBe(false);
    expect(state.eq.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
    expect(state.limiter.enabled).toBe(true); // last one should remain
    
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
    expect(isEffectsDefaults(state)).toBe(true);
  });

  test('alternate enable/disable between two effects', () => {
    let state = createEffectsState();
    
    for (let i = 0; i < 5; i++) {
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
    }
    
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
  });

  test('chain switch: compressor -> limiter -> eq -> delay (one active at each step)', () => {
    let state = createEffectsState();
    
    // compressor only
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
    
    // switch to limiter
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
    
    // switch to eq
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
    expect(state.eq.enabled).toBe(true);
    
    // switch to delay
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
    expect(state.delay.enabled).toBe(true);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
  });
});


describe('3. Simultaneous Effects (All 16 Combinations)', () => {
  // Effect keys for iteration
  const effects = ['compressor', 'limiter', 'eq', 'delay'];
  const messageTypes = {
    compressor: '_SSA_SET_COMPRESSOR',
    limiter: '_SSA_SET_LIMITER',
    eq: '_SSA_SET_EQ',
    delay: '_SSA_SET_DELAY'
  };

  function applyCombinations(onEffects) {
    let state = createEffectsState();
    for (const key of effects) {
      const msg = {
        type: messageTypes[key],
        active: onEffects.includes(key)
      };
      const result = handleEffectMessage(state, msg);
      state = result.newState;
    }
    return state;
  }

  test('only compressor ON', () => {
    const state = applyCombinations(['compressor']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
  });

  test('only limiter ON', () => {
    const state = applyCombinations(['limiter']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
  });

  test('only EQ ON', () => {
    const state = applyCombinations(['eq']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(false);
  });

  test('only delay ON', () => {
    const state = applyCombinations(['delay']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(true);
  });

  test('compressor + limiter ON', () => {
    const state = applyCombinations(['compressor', 'limiter']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
  });

  test('compressor + EQ ON', () => {
    const state = applyCombinations(['compressor', 'eq']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(false);
  });

  test('compressor + delay ON', () => {
    const state = applyCombinations(['compressor', 'delay']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(true);
  });

  test('limiter + EQ ON', () => {
    const state = applyCombinations(['limiter', 'eq']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(false);
  });

  test('limiter + delay ON', () => {
    const state = applyCombinations(['limiter', 'delay']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(true);
  });

  test('EQ + delay ON', () => {
    const state = applyCombinations(['eq', 'delay']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });

  test('compressor + limiter + EQ ON', () => {
    const state = applyCombinations(['compressor', 'limiter', 'eq']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(false);
  });

  test('compressor + limiter + delay ON', () => {
    const state = applyCombinations(['compressor', 'limiter', 'delay']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(true);
  });

  test('compressor + EQ + delay ON', () => {
    const state = applyCombinations(['compressor', 'eq', 'delay']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });

  test('limiter + EQ + delay ON', () => {
    const state = applyCombinations(['limiter', 'eq', 'delay']);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });

  test('all 4 effects ON', () => {
    const state = applyCombinations(['compressor', 'limiter', 'eq', 'delay']);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });

  test('all 4 effects OFF', () => {
    const state = applyCombinations([]);
    expect(state.compressor.enabled).toBe(false);
    expect(state.limiter.enabled).toBe(false);
    expect(state.eq.enabled).toBe(false);
    expect(state.delay.enabled).toBe(false);
    expect(isEffectsDefaults(state)).toBe(true);
  });

  test('verify all 16 combinations using bitmask iteration', () => {
    for (let mask = 0; mask < 16; mask++) {
      const onEffects = [];
      for (let i = 0; i < 4; i++) {
        if (mask & (1 << i)) {
          onEffects.push(effects[i]);
        }
      }
      const state = applyCombinations(onEffects);
      
      for (let i = 0; i < 4; i++) {
        const key = effects[i];
        const expected = onEffects.includes(key);
        expect(state[key].enabled).toBe(expected);
      }
    }
  });

  test('different orders produce same final state for all-ON', () => {
    const order1 = [
      { type: '_SSA_SET_COMPRESSOR', active: true },
      { type: '_SSA_SET_LIMITER', active: true },
      { type: '_SSA_SET_EQ', active: true },
      { type: '_SSA_SET_DELAY', active: true }
    ];
    const order2 = [
      { type: '_SSA_SET_DELAY', active: true },
      { type: '_SSA_SET_EQ', active: true },
      { type: '_SSA_SET_LIMITER', active: true },
      { type: '_SSA_SET_COMPRESSOR', active: true }
    ];
    const order3 = [
      { type: '_SSA_SET_EQ', active: true },
      { type: '_SSA_SET_COMPRESSOR', active: true },
      { type: '_SSA_SET_DELAY', active: true },
      { type: '_SSA_SET_LIMITER', active: true }
    ];

    let state1 = createEffectsState();
    for (const msg of order1) {
      state1 = handleEffectMessage(state1, msg).newState;
    }

    let state2 = createEffectsState();
    for (const msg of order2) {
      state2 = handleEffectMessage(state2, msg).newState;
    }

    let state3 = createEffectsState();
    for (const msg of order3) {
      state3 = handleEffectMessage(state3, msg).newState;
    }

    expect(state1).toEqual(state2);
    expect(state2).toEqual(state3);
  });
});


describe('4. Parameter Updates During State Changes', () => {
  test('enable compressor with params then enable limiter with params', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20, ratio: 10, attack: 5 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_LIMITER', active: true,
      params: { threshold: -5 }
    }).newState;
    
    expect(state.compressor.enabled).toBe(true);
    expect(state.compressor.threshold).toBe(-20);
    expect(state.compressor.ratio).toBe(10);
    expect(state.compressor.attack).toBe(5);
    
    expect(state.limiter.enabled).toBe(true);
    expect(state.limiter.threshold).toBe(-5);
  });

  test('change compressor threshold after enabling limiter', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
    state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { threshold: -30 }
    }).newState;
    
    expect(state.compressor.threshold).toBe(-30);
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.limiter.threshold).toBe(-1); // limiter defaults unchanged
  });

  test('enable EQ with params, change peakGain, disable EQ, re-enable with same params', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ', active: true,
      params: { hpfFreq: 50, peakGain: 6 }
    }).newState;
    expect(state.eq.enabled).toBe(true);
    expect(state.eq.peakGain).toBe(6);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
    expect(state.eq.enabled).toBe(false);
    
    state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
    expect(state.eq.enabled).toBe(true);
    // Params should be preserved from before disable
    expect(state.eq.hpfFreq).toBe(50);
    expect(state.eq.peakGain).toBe(6);
  });

  test('rapid sequential updates: compressor ON -> delay ON -> compressor params -> delay params', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -24 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_DELAY', active: true,
      params: { delayTime: 500 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { threshold: -20, ratio: 8 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_DELAY',
      params: { delayTime: 300, feedback: 40 }
    }).newState;
    
    expect(state.compressor.enabled).toBe(true);
    expect(state.compressor.threshold).toBe(-20);
    expect(state.compressor.ratio).toBe(8);
    
    expect(state.delay.enabled).toBe(true);
    expect(state.delay.delayTime).toBe(300);
    expect(state.delay.feedback).toBe(40);
  });

  test('sequential param-only updates on same effect', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -24 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { knee: 25 }
    }).newState;
    expect(state.compressor.knee).toBe(25);
    expect(state.compressor.threshold).toBe(-24); // preserved
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { ratio: 15, attack: 3 }
    }).newState;
    expect(state.compressor.ratio).toBe(15);
    expect(state.compressor.attack).toBe(3);
    expect(state.compressor.threshold).toBe(-24); // preserved
    expect(state.compressor.knee).toBe(25); // preserved
  });

  test('nested updates with multiple effects and params interleave', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -18 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ', active: true,
      params: { hpfFreq: 60 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { ratio: 6 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ',
      params: { peakGain: 4 }
    }).newState;
    
    expect(state.compressor.threshold).toBe(-18);
    expect(state.compressor.ratio).toBe(6);
    expect(state.eq.hpfFreq).toBe(60);
    expect(state.eq.peakGain).toBe(4);
  });

  test('update effect params without changing enabled state', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -24, knee: 30, ratio: 12 }
    }).newState;
    
    // Change only knee without active flag
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { knee: 20 }
    }).newState;
    
    expect(state.compressor.enabled).toBe(true); // unchanged
    expect(state.compressor.threshold).toBe(-24); // unchanged
    expect(state.compressor.knee).toBe(20); // updated
    expect(state.compressor.ratio).toBe(12); // unchanged
  });
});


describe('5. Cross-Effect Interference Tests', () => {
  test('update all effect params independently - no cross-contamination', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20, knee: 25, ratio: 10, attack: 4, release: 200 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_LIMITER', active: true,
      params: { threshold: -8 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ', active: true,
      params: { hpfFreq: 50, lpfFreq: 19000, peakFreq: 1500, peakGain: 5, peakQ: 1.5 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_DELAY', active: true,
      params: { delayTime: 600, feedback: 60, mix: 40 }
    }).newState;
    
    // Verify compressor has only compressor params
    expect(state.compressor.enabled).toBe(true);
    expect(state.compressor.threshold).toBe(-20);
    expect(state.compressor.knee).toBe(25);
    expect(state.compressor.ratio).toBe(10);
    expect(state.compressor.attack).toBe(4);
    expect(state.compressor.release).toBe(200);
    
    // Verify limiter has only limiter params
    expect(state.limiter.enabled).toBe(true);
    expect(state.limiter.threshold).toBe(-8);
    
    // Verify EQ has only EQ params
    expect(state.eq.enabled).toBe(true);
    expect(state.eq.hpfFreq).toBe(50);
    expect(state.eq.lpfFreq).toBe(19000);
    expect(state.eq.peakFreq).toBe(1500);
    expect(state.eq.peakGain).toBe(5);
    expect(state.eq.peakQ).toBe(1.5);
    
    // Verify delay has only delay params
    expect(state.delay.enabled).toBe(true);
    expect(state.delay.delayTime).toBe(600);
    expect(state.delay.feedback).toBe(60);
    expect(state.delay.mix).toBe(40);
  });

  test('enable compressor with threshold=-20 and limiter with threshold=-5, verify independent', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_LIMITER', active: true,
      params: { threshold: -5 }
    }).newState;
    
    expect(state.compressor.threshold).toBe(-20);
    expect(state.limiter.threshold).toBe(-5);
  });

  test('compressor params dont leak into limiter state', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -10, knee: 20, ratio: 8, attack: 1, release: 100 }
    }).newState;
    
    // Limiter should not have compressor properties
    expect(state.limiter).not.toHaveProperty('knee');
    expect(state.limiter).not.toHaveProperty('ratio');
    expect(state.limiter).not.toHaveProperty('attack');
    expect(state.limiter).not.toHaveProperty('release');
    expect(state.limiter.threshold).toBe(-1); // default
    expect(state.limiter.enabled).toBe(false);
  });

  test('EQ params dont leak into delay state', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ', active: true,
      params: { hpfFreq: 100, lpfFreq: 20000, peakFreq: 500, peakGain: 10, peakQ: 0.5 }
    }).newState;
    
    // Delay should not have EQ properties
    expect(state.delay).not.toHaveProperty('hpfFreq');
    expect(state.delay).not.toHaveProperty('peakGain');
    expect(state.delay.delayTime).toBe(0); // default
    expect(state.delay.feedback).toBe(0); // default
    expect(state.delay.mix).toBe(0); // default
    expect(state.delay.enabled).toBe(false);
  });

  test('delay params dont leak into compressor state', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_DELAY', active: true,
      params: { delayTime: 1000, feedback: 80, mix: 60 }
    }).newState;
    
    // Compressor should not have delay properties
    expect(state.compressor).not.toHaveProperty('delayTime');
    expect(state.compressor).not.toHaveProperty('feedback');
    expect(state.compressor).not.toHaveProperty('mix');
    expect(state.compressor.threshold).toBe(-24); // default
    expect(state.compressor.knee).toBe(30); // default
    expect(state.compressor.ratio).toBe(12); // default
  });

  test('all effects enabled with unique params - verify total isolation', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -50, knee: 10, ratio: 20, attack: 0, release: 500 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_LIMITER', active: true,
      params: { threshold: -50 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_EQ', active: true,
      params: { hpfFreq: 10, lpfFreq: 24000, peakFreq: 200, peakGain: 20, peakQ: 10 }
    }).newState;
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_DELAY', active: true,
      params: { delayTime: 2000, feedback: 100, mix: 100 }
    }).newState;
    
    // All should have threshold = -50 but only their own
    expect(state.compressor.threshold).toBe(-50);
    expect(state.limiter.threshold).toBe(-50);
    
    // But delay should NOT have threshold at all (it's a different field name)
    expect(state.delay).not.toHaveProperty('threshold');
    
    // Compressor should NOT have delay params
    expect(state.compressor.delayTime).toBeUndefined();
    expect(state.compressor.feedback).toBeUndefined();
    expect(state.compressor.mix).toBeUndefined();
    
    // Limiter should NOT have eq params
    expect(state.limiter.hpfFreq).toBeUndefined();
    expect(state.limiter.peakGain).toBeUndefined();
    
    // All enabled
    expect(state.compressor.enabled).toBe(true);
    expect(state.limiter.enabled).toBe(true);
    expect(state.eq.enabled).toBe(true);
    expect(state.delay.enabled).toBe(true);
  });

  test('sequential updates dont cause parameter drift', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -25 }
    }).newState;
    
    const originalCompressor = JSON.parse(JSON.stringify(state.compressor));
    
    // Do 10 unrelated limiter updates
    for (let i = 0; i < 10; i++) {
      state = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER', active: true,
        params: { threshold: i - 10 }
      }).newState;
    }
    
    // Compressor params should be unchanged
    expect(state.compressor.threshold).toBe(originalCompressor.threshold);
    expect(state.compressor.knee).toBe(originalCompressor.knee);
    expect(state.compressor.ratio).toBe(originalCompressor.ratio);
  });

  test('parallel updates to independent effects produce same result regardless of order', () => {
    // compressor -> limiter
    let state1 = createEffectsState();
    state1 = handleEffectMessage(state1, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20 }
    }).newState;
    state1 = handleEffectMessage(state1, {
      type: '_SSA_SET_LIMITER', active: true,
      params: { threshold: -5 }
    }).newState;
    
    // limiter -> compressor (reversed order)
    let state2 = createEffectsState();
    state2 = handleEffectMessage(state2, {
      type: '_SSA_SET_LIMITER', active: true,
      params: { threshold: -5 }
    }).newState;
    state2 = handleEffectMessage(state2, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20 }
    }).newState;
    
    expect(state1).toEqual(state2);
  });
});


describe('6. Edge Cases for Switching', () => {
  describe('Toggle effect that is already enabled', () => {
    test('enable compressor when already enabled -> stays enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
    });

    test('enable limiter when already enabled -> stays enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      expect(state.limiter.enabled).toBe(true);
    });

    test('enable EQ when already enabled -> stays enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      expect(state.eq.enabled).toBe(true);
    });

    test('enable delay when already enabled -> stays enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      expect(state.delay.enabled).toBe(true);
    });
  });

  describe('Disable effect that is already disabled', () => {
    test('disable compressor when already disabled -> stays disabled', () => {
      const state = createEffectsState();
      
      const result = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false });
      expect(result.newState.compressor.enabled).toBe(false);
      expect(result.handled).toBe(true); // Still handled even when already off
    });

    test('disable limiter when already disabled -> stays disabled', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false });
      expect(newState.limiter.enabled).toBe(false);
    });

    test('disable EQ when already disabled -> stays disabled', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false });
      expect(newState.eq.enabled).toBe(false);
    });

    test('disable delay when already disabled -> stays disabled', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false });
      expect(newState.delay.enabled).toBe(false);
    });
  });

  describe('Multiple identical messages in a row', () => {
    test('three identical compressor enable messages', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      
      expect(state.compressor.enabled).toBe(true);
      expect(state.compressor.threshold).toBe(-24); // default, not changed
    });

    test('three identical limiter messages with different params each', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true, params: { threshold: -3 } }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true, params: { threshold: -6 } }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true, params: { threshold: -9 } }).newState;
      
      expect(state.limiter.enabled).toBe(true);
      expect(state.limiter.threshold).toBe(-9); // last value wins
    });

    test('many toggle cycles on same effect', () => {
      let state = createEffectsState();
      
      for (let i = 0; i < 100; i++) {
        state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
        state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      }
      
      expect(state.compressor.enabled).toBe(false);
      expect(isEffectsDefaults(state)).toBe(true);
    });
  });

  describe('Empty params object', () => {
    test('compressor with empty params object', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR',
        active: true,
        params: {}
      });
      expect(newState.compressor.enabled).toBe(true);
      expect(newState.compressor.threshold).toBe(-24); // defaults preserved
    });

    test('limiter with empty params object', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER',
        active: true,
        params: {}
      });
      expect(newState.limiter.enabled).toBe(true);
      expect(newState.limiter.threshold).toBe(-1); // defaults preserved
    });

    test('eq with empty params object', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_EQ',
        active: true,
        params: {}
      });
      expect(newState.eq.enabled).toBe(true);
      expect(newState.eq.hpfFreq).toBe(20);
      expect(newState.eq.lpfFreq).toBe(22050);
      expect(newState.eq.peakFreq).toBe(1000);
      expect(newState.eq.peakGain).toBe(0);
      expect(newState.eq.peakQ).toBe(1);
    });

    test('delay with empty params object', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_DELAY',
        active: true,
        params: {}
      });
      expect(newState.delay.enabled).toBe(true);
      expect(newState.delay.delayTime).toBe(0);
      expect(newState.delay.feedback).toBe(0);
      expect(newState.delay.mix).toBe(0);
    });
  });

  describe('Message with only active field, no params', () => {
    test('compressor with only active: true', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR',
        active: true
      });
      expect(newState.compressor.enabled).toBe(true);
      expect(newState.compressor.threshold).toBe(-24);
    });

    test('limiter with only active: true', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER',
        active: true
      });
      expect(newState.limiter.enabled).toBe(true);
    });

    test('eq with only active: false', () => {
      let state = createEffectsState();
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true, params: { peakGain: 6 } }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      expect(state.eq.enabled).toBe(false);
      expect(state.eq.peakGain).toBe(6); // params preserved
    });

    test('delay with only active: true', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_DELAY',
        active: true
      });
      expect(newState.delay.enabled).toBe(true);
      expect(newState.delay.delayTime).toBe(0);
    });
  });

  describe('Message with only params field, no active field', () => {
    test('compressor with params only, no active -> enabled unchanged', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', params: { threshold: -30 } }).newState;
      
      expect(state.compressor.enabled).toBe(true);
      expect(state.compressor.threshold).toBe(-30);
    });

    test('limiter with params only, no active -> enabled unchanged', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', params: { threshold: -10 } }).newState;
      
      expect(state.limiter.enabled).toBe(false);
      expect(state.limiter.threshold).toBe(-10);
    });

    test('eq with params only, no active -> enabled unchanged', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', params: { hpfFreq: 100, peakGain: 3 } }).newState;
      
      expect(state.eq.enabled).toBe(false);
      expect(state.eq.hpfFreq).toBe(100);
      expect(state.eq.peakGain).toBe(3);
    });

    test('delay with params only, no active -> enabled unchanged', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', params: { delayTime: 400, feedback: 30 } }).newState;
      
      expect(state.delay.enabled).toBe(true);
      expect(state.delay.delayTime).toBe(400);
      expect(state.delay.feedback).toBe(30);
    });
  });

  describe('undefined/missing fields in params', () => {
  test('compressor params with undefined values - null passes !== undefined check', () => {
    let state = createEffectsState();
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20, knee: undefined, ratio: null }
    }).newState;
    
    expect(state.compressor.threshold).toBe(-20);
    expect(state.compressor.knee).toBe(30); // default (undefined not set)
    // null !== undefined is true, so null IS set through
    expect(state.compressor.ratio).toBe(null);
  });

  test('compressor params with undefined and missing values - only defined values set', () => {
    let state = createEffectsState();
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: true,
      params: { threshold: -20 }
    }).newState;
    
    expect(state.compressor.threshold).toBe(-20);
    expect(state.compressor.knee).toBe(30); // default
    expect(state.compressor.ratio).toBe(12); // default
    expect(state.compressor.attack).toBe(3); // default
    expect(state.compressor.release).toBe(250); // default
  });

    test('limiter threshold with undefined', () => {
      const state = createEffectsState();
      const { newState } = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER',
        params: { threshold: undefined }
      });
      // Undefined threshold should not change it
      expect(newState.limiter.threshold).toBe(-1);
    });
  });
});


describe('7. State Persistence Across Toggles', () => {
  describe('Compressor persistence', () => {
    test('enable with specific params -> disable -> enable with different params -> latest params win', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -20, knee: 25, ratio: 10 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      expect(state.compressor.enabled).toBe(false);
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -30, ratio: 8, attack: 2 }
      }).newState;
      
      expect(state.compressor.enabled).toBe(true);
      expect(state.compressor.threshold).toBe(-30); // latest
      expect(state.compressor.knee).toBe(25); // persisted from before
      expect(state.compressor.ratio).toBe(8); // latest overwrote
      expect(state.compressor.attack).toBe(2); // from latest
    });

    test('disabled state persists params between toggles', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -24, knee: 30, ratio: 12, attack: 3, release: 250 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      
      // Re-enable without params - should get back all the old params
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      
      expect(state.compressor.threshold).toBe(-24);
      expect(state.compressor.knee).toBe(30);
      expect(state.compressor.ratio).toBe(12);
      expect(state.compressor.attack).toBe(3);
      expect(state.compressor.release).toBe(250);
    });
  });

  describe('EQ persistence', () => {
    test('enable EQ with hpfFreq=50 -> disable -> enable again -> hpfFreq still 50', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 50, lpfFreq: 18000, peakFreq: 1000, peakGain: 0, peakQ: 1 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      
      expect(state.eq.enabled).toBe(true);
      expect(state.eq.hpfFreq).toBe(50);
      expect(state.eq.lpfFreq).toBe(18000);
      expect(state.eq.peakFreq).toBe(1000);
      expect(state.eq.peakGain).toBe(0);
      expect(state.eq.peakQ).toBe(1);
    });

    test('partial param persistence across disable/enable cycles', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 50, lpfFreq: 18000 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { peakFreq: 2000 }
      }).newState;
      
      expect(state.eq.hpfFreq).toBe(50); // persisted
      expect(state.eq.lpfFreq).toBe(18000); // persisted
      expect(state.eq.peakFreq).toBe(2000); // new
      expect(state.eq.peakGain).toBe(0); // default (never changed)
      expect(state.eq.peakQ).toBe(1); // default (never changed)
    });
  });

  describe('Limiter persistence', () => {
    test('enable limiter with threshold -> disable -> enable -> threshold persists', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER', active: true,
        params: { threshold: -10 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      
      expect(state.limiter.enabled).toBe(true);
      expect(state.limiter.threshold).toBe(-10);
    });
  });

  describe('Delay persistence', () => {
    test('enable delay with params -> disable -> enable -> params persist', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_DELAY', active: true,
        params: { delayTime: 500, feedback: 50, mix: 30 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      
      expect(state.delay.enabled).toBe(true);
      expect(state.delay.delayTime).toBe(500);
      expect(state.delay.feedback).toBe(50);
      expect(state.delay.mix).toBe(30);
    });
  });

  describe('Multiple disable/enable cycles', () => {
    test('compressor survives multiple on/off/on cycles with param changes', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -20 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -25 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -30 }
      }).newState;
      
      expect(state.compressor.threshold).toBe(-30);
    });

    test('eq params change across cycles', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 50 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 100, peakGain: 3 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { peakGain: 6 }
      }).newState;
      
      expect(state.eq.hpfFreq).toBe(100); // from second cycle
      expect(state.eq.peakGain).toBe(6); // from third cycle
    });
  });

  describe('Fresh state always starts from defaults', () => {
    test('new state always starts with defaults regardless of previous toggles', () => {
      // First state - heavy modification
      let state1 = createEffectsState();
      state1 = handleEffectMessage(state1, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -50 }
      }).newState;
      state1 = handleEffectMessage(state1, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 5 }
      }).newState;
      
      // New state - should be clean
      const state2 = createEffectsState();
      expect(state2.compressor.enabled).toBe(false);
      expect(state2.compressor.threshold).toBe(-24);
      expect(state2.eq.hpfFreq).toBe(20);
      expect(isEffectsDefaults(state2)).toBe(true);
    });
  });
});


describe('8. Bulk Operations', () => {
  describe('Enable all effects', () => {
    test('enable all effects one by one, verify all enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(false);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      expect(state.eq.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      expect(state.delay.enabled).toBe(true);
    });

    test('enable all effects then disable all effects -> all disabled', () => {
      let state = createEffectsState();
      
      const enableMsgs = [
        { type: '_SSA_SET_COMPRESSOR', active: true },
        { type: '_SSA_SET_LIMITER', active: true },
        { type: '_SSA_SET_EQ', active: true },
        { type: '_SSA_SET_DELAY', active: true }
      ];
      
      for (const msg of enableMsgs) {
        state = handleEffectMessage(state, msg).newState;
      }
      
      const disableMsgs = [
        { type: '_SSA_SET_COMPRESSOR', active: false },
        { type: '_SSA_SET_LIMITER', active: false },
        { type: '_SSA_SET_EQ', active: false },
        { type: '_SSA_SET_DELAY', active: false }
      ];
      
      for (const msg of disableMsgs) {
        state = handleEffectMessage(state, msg).newState;
      }
      
      expect(state.compressor.enabled).toBe(false);
      expect(state.limiter.enabled).toBe(false);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(false);
      expect(isEffectsDefaults(state)).toBe(true);
    });

    test('enable all with params, disable all -> verify defaults restored', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, {
        type: '_SSA_SET_COMPRESSOR', active: true,
        params: { threshold: -50 }
      }).newState;
      state = handleEffectMessage(state, {
        type: '_SSA_SET_LIMITER', active: true,
        params: { threshold: -50 }
      }).newState;
      state = handleEffectMessage(state, {
        type: '_SSA_SET_EQ', active: true,
        params: { hpfFreq: 5, lpfFreq: 24000 }
      }).newState;
      state = handleEffectMessage(state, {
        type: '_SSA_SET_DELAY', active: true,
        params: { delayTime: 2000, feedback: 100, mix: 100 }
      }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      
      // All disabled but params preserved
      expect(state.compressor.enabled).toBe(false);
      expect(state.compressor.threshold).toBe(-50);
      expect(state.limiter.enabled).toBe(false);
      expect(state.limiter.threshold).toBe(-50);
      expect(state.eq.enabled).toBe(false);
      expect(state.eq.hpfFreq).toBe(5);
      expect(state.delay.enabled).toBe(false);
      expect(state.delay.delayTime).toBe(2000);
    });
  });

  describe('Enable half, then other half', () => {
    test('enable compressor + limiter, then enable EQ + delay', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(false);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(true);
      expect(state.delay.enabled).toBe(true);
    });

    test('enable compressor + eq, then enable limiter + delay', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(true);
      expect(state.delay.enabled).toBe(true);
    });
  });

  describe('Disable some, keep others enabled', () => {
    test('all 4 enabled, disable 2 -> 2 remain enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      
      expect(state.compressor.enabled).toBe(false);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(true);
      expect(state.delay.enabled).toBe(false);
    });

    test('disable only 1 out of 4 -> 3 remain enabled', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(true);
    });

    test('disable all 4 one at a time starting from mixed state', () => {
      let state = createEffectsState();
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      
      // Only compressor and delay are on
      expect(state.compressor.enabled).toBe(true);
      expect(state.limiter.enabled).toBe(false);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(true);
      
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      expect(state.delay.enabled).toBe(true); // delay still on
      
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      expect(state.compressor.enabled).toBe(false);
      expect(state.delay.enabled).toBe(false);
      expect(isEffectsDefaults(state)).toBe(true);
    });
  });

  describe('Enable/disable via chained handleEffectMessage', () => {
    test('16 sequential calls: toggle each effect twice', () => {
      let state = createEffectsState();
      
      for (let i = 0; i < 2; i++) {
        for (const [name, type] of Object.entries({
          compressor: '_SSA_SET_COMPRESSOR',
          limiter: '_SSA_SET_LIMITER',
          eq: '_SSA_SET_EQ',
          delay: '_SSA_SET_DELAY'
        })) {
          state = handleEffectMessage(state, { type, active: i === 0 }).newState;
        }
      }
      
      // After two cycles: all should be disabled (same as initial)
      expect(state.compressor.enabled).toBe(false);
      expect(state.limiter.enabled).toBe(false);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(false);
      expect(isEffectsDefaults(state)).toBe(true);
    });

    test('random enable/disable sequence', () => {
      let state = createEffectsState();
      
      // compressor ON
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: true }).newState;
      // limiter OFF (already off)
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: false }).newState;
      // EQ ON
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: true }).newState;
      // delay OFF (already off)
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: false }).newState;
      // compressor OFF
      state = handleEffectMessage(state, { type: '_SSA_SET_COMPRESSOR', active: false }).newState;
      // limiter ON
      state = handleEffectMessage(state, { type: '_SSA_SET_LIMITER', active: true }).newState;
      // EQ OFF
      state = handleEffectMessage(state, { type: '_SSA_SET_EQ', active: false }).newState;
      // delay ON
      state = handleEffectMessage(state, { type: '_SSA_SET_DELAY', active: true }).newState;
      
      // Only limiter and delay should be on
      expect(state.compressor.enabled).toBe(false);
      expect(state.limiter.enabled).toBe(true);
      expect(state.eq.enabled).toBe(false);
      expect(state.delay.enabled).toBe(true);
    });
  });
});


describe('9. isEffectsDefaults with Combinations', () => {
  test('all defaults -> true', () => {
    const state = createEffectsState();
    expect(isEffectsDefaults(state)).toBe(true);
  });

  test('one effect enabled (others default) -> false', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('one effect with changed param (others default) -> false', () => {
    const state = createEffectsState();
    state.compressor.threshold = -30;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('multiple effects enabled, all with default values -> false', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    state.limiter.enabled = true;
    // All params still at defaults
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('all disabled, all params at default -> true', () => {
    const state = createEffectsState();
    state.compressor.enabled = false;
    state.limiter.enabled = false;
    state.eq.enabled = false;
    state.delay.enabled = false;
    expect(isEffectsDefaults(state)).toBe(true);
  });

  test('two effects enabled with defaults -> false', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    state.eq.enabled = true;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('three effects enabled with defaults -> false', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    state.limiter.enabled = true;
    state.eq.enabled = true;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('all effects enabled but all with defaults -> false', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    state.limiter.enabled = true;
    state.eq.enabled = true;
    state.delay.enabled = true;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('only limiter threshold changed -> false', () => {
    const state = createEffectsState();
    state.limiter.threshold = -10;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('only delay mix changed -> false', () => {
    const state = createEffectsState();
    state.delay.mix = 50;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('only eq peakQ changed -> false', () => {
    const state = createEffectsState();
    state.eq.peakQ = 2;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('only compressor ratio changed -> false', () => {
    const state = createEffectsState();
    state.compressor.ratio = 8;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('all compressor params changed, all other effects at default -> false', () => {
    const state = createEffectsState();
    state.compressor.threshold = -30;
    state.compressor.knee = 20;
    state.compressor.ratio = 8;
    state.compressor.attack = 2;
    state.compressor.release = 200;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('all EQ params changed, all other effects at default -> false', () => {
    const state = createEffectsState();
    state.eq.hpfFreq = 100;
    state.eq.lpfFreq = 20000;
    state.eq.peakFreq = 500;
    state.eq.peakGain = 10;
    state.eq.peakQ = 0.5;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('all params of all effects changed -> false', () => {
    const state = createEffectsState();
    state.compressor.threshold = -30;
    state.limiter.threshold = -10;
    state.eq.hpfFreq = 100;
    state.delay.delayTime = 500;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('compressor enabled + limiter threshold changed -> false', () => {
    const state = createEffectsState();
    state.compressor.enabled = true;
    state.limiter.threshold = -10;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('eq with peakGain=0 (default) but enabled=true -> false', () => {
    const state = createEffectsState();
    state.eq.enabled = true;
    // peakGain is 0 by default, so only enabled flag should make it non-default
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('delay with delayTime=0 (default) but enabled=true -> false', () => {
    const state = createEffectsState();
    state.delay.enabled = true;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('use handleEffectMessage to set defaults and verify isEffectsDefaults', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_COMPRESSOR',
      active: false,
      params: { threshold: -24, knee: 30, ratio: 12, attack: 3, release: 250 }
    };
    const { newState } = handleEffectMessage(state, msg);
    expect(isEffectsDefaults(newState)).toBe(true);
  });

  test('use handleEffectMessage to enable and verify isEffectsDefaults returns false', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_COMPRESSOR',
      active: true,
      params: { threshold: -24, knee: 30, ratio: 12, attack: 3, release: 250 }
    };
    const { newState } = handleEffectMessage(state, msg);
    expect(isEffectsDefaults(newState)).toBe(false);
  });

  test('use handleEffectMessage with default params and disable -> still true', () => {
    const state = createEffectsState();
    const msg = {
      type: '_SSA_SET_LIMITER',
      active: false,
      params: { threshold: -1 }
    };
    const { newState } = handleEffectMessage(state, msg);
    expect(isEffectsDefaults(newState)).toBe(true);
  });

  test('chained handleEffectMessage to change one param -> false', () => {
    let state = createEffectsState();
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', active: false
    }).newState;
    expect(isEffectsDefaults(state)).toBe(true);
    
    state = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR', params: { threshold: -20 }
    }).newState;
    expect(isEffectsDefaults(state)).toBe(false);
  });

  test('all 16 bitmask states: only all-off is defaults', () => {
    const effects = ['compressor', 'limiter', 'eq', 'delay'];
    const messageTypes = {
      compressor: '_SSA_SET_COMPRESSOR',
      limiter: '_SSA_SET_LIMITER',
      eq: '_SSA_SET_EQ',
      delay: '_SSA_SET_DELAY'
    };

    for (let mask = 0; mask < 16; mask++) {
      let state = createEffectsState();
      for (let i = 0; i < 4; i++) {
        const enabled = !!(mask & (1 << i));
        const msg = {
          type: messageTypes[effects[i]],
          active: enabled
        };
        state = handleEffectMessage(state, msg).newState;
      }
      
      const expected = (mask === 0); // Only when all are disabled
      expect(isEffectsDefaults(state)).toBe(expected);
    }
  });

  test('changing default values back to defaults -> true', () => {
    const state = createEffectsState();
    
    // Change everything
    state.compressor.threshold = -100;
    state.limiter.threshold = -100;
    state.eq.hpfFreq = 999;
    state.eq.peakGain = -50;
    state.delay.delayTime = 999;
    
    expect(isEffectsDefaults(state)).toBe(false);
    
    // Change back to defaults
    state.compressor.threshold = -24;
    state.limiter.threshold = -1;
    state.eq.hpfFreq = 20;
    state.eq.peakGain = 0;
    state.delay.delayTime = 0;
    
    expect(isEffectsDefaults(state)).toBe(true);
  });

  test('enable all, disable all, verify defaults again', () => {
    const state = createEffectsState();
    
    state.compressor.enabled = true;
    state.limiter.enabled = true;
    state.eq.enabled = true;
    state.delay.enabled = true;
    
    expect(isEffectsDefaults(state)).toBe(false);
    
    state.compressor.enabled = false;
    state.limiter.enabled = false;
    state.eq.enabled = false;
    state.delay.enabled = false;
    
    expect(isEffectsDefaults(state)).toBe(true);
  });
});


describe('10. Interaction Between handleEffectMessage and Direct State Updates', () => {
  test('handleEffectMessage result is independent from input state', () => {
    const originalState = createEffectsState();
    
    const result1 = handleEffectMessage(originalState, {
      type: '_SSA_SET_COMPRESSOR', active: true
    });
    
    const result2 = handleEffectMessage(originalState, {
      type: '_SSA_SET_COMPRESSOR', active: true
    });
    
    // Both results should be equal but not the same object
    expect(result1.newState).toEqual(result2.newState);
    expect(result1.newState).not.toBe(result2.newState);
    expect(result1.newState).not.toBe(originalState);
    expect(originalState.compressor.enabled).toBe(false); // original unchanged
  });

  test('multiple handleEffectMessage calls on same base state produce independent states', () => {
    const baseState = createEffectsState();
    
    const result1 = handleEffectMessage(baseState, {
      type: '_SSA_SET_COMPRESSOR', active: true
    });
    
    const result2 = handleEffectMessage(baseState, {
      type: '_SSA_SET_LIMITER', active: true
    });
    
    expect(result1.newState.compressor.enabled).toBe(true);
    expect(result1.newState.limiter.enabled).toBe(false);
    
    expect(result2.newState.compressor.enabled).toBe(false);
    expect(result2.newState.limiter.enabled).toBe(true);
    
    // Base state unaffected
    expect(baseState.compressor.enabled).toBe(false);
    expect(baseState.limiter.enabled).toBe(false);
  });

  test('handleEffectMessage handles messages with both active and params correctly', () => {
    const state = createEffectsState();
    
    // active: false should still apply params
    const { newState } = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      active: false,
      params: { threshold: -10, ratio: 5 }
    });
    
    expect(newState.compressor.enabled).toBe(false);
    expect(newState.compressor.threshold).toBe(-10);
    expect(newState.compressor.ratio).toBe(5);
  });

  test('handleEffectMessage with undefined active field', () => {
    const state = createEffectsState();
    
    const { newState } = handleEffectMessage(state, {
      type: '_SSA_SET_COMPRESSOR',
      params: { threshold: -15 }
    });
    
    // active undefined -> enabled should remain at default (false)
    expect(newState.compressor.enabled).toBe(false);
    expect(newState.compressor.threshold).toBe(-15);
  });
});

