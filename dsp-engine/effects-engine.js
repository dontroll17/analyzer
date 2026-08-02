// effects-engine.js — Pure logic for effect state management
// Zero dependencies: no AudioContext, no chrome.runtime
// Can be tested in any environment (Vitest, Node.js, browser)

const EFFECTS_DEFAULTS = {
  compressor: { enabled: false, threshold: -24, knee: 30, ratio: 12, attack: 3, release: 250 },
  limiter: { enabled: false, threshold: -1 },
  eq: { enabled: false, hpfFreq: 20, lpfFreq: 22050, peakFreq: 1000, peakGain: 0, peakQ: 1 },
  delay: { enabled: false, delayTime: 0, feedback: 0, mix: 0 }
};

/**
 * Create a fresh effects state object (deep clone of defaults)
 */
function createEffectsState() {
  return {
    compressor: { ...EFFECTS_DEFAULTS.compressor },
    limiter: { ...EFFECTS_DEFAULTS.limiter },
    eq: { ...EFFECTS_DEFAULTS.eq },
    delay: { ...EFFECTS_DEFAULTS.delay }
  };
}

/**
 * Process a compressor effect message and return updated state.
 * Pure function — no side effects, no AudioContext.
 */
function updateCompressorState(state, params) {
  const newState = {
    ...state,
    compressor: { ...state.compressor }
  };
  
  if (params.enabled !== undefined) {
    newState.compressor.enabled = params.enabled;
  }
  if (params.threshold !== undefined) newState.compressor.threshold = params.threshold;
  if (params.knee !== undefined) newState.compressor.knee = params.knee;
  if (params.ratio !== undefined) newState.compressor.ratio = params.ratio;
  if (params.attack !== undefined) newState.compressor.attack = params.attack;
  if (params.release !== undefined) newState.compressor.release = params.release;
  
  return newState;
}

/**
 * Process a limiter effect message and return updated state.
 */
function updateLimiterState(state, params) {
  const newState = {
    ...state,
    limiter: { ...state.limiter }
  };
  
  const threshold = params.threshold !== undefined ? params.threshold : newState.limiter.threshold;
  
  if (params.enabled !== undefined) newState.limiter.enabled = params.enabled;
  if (params.threshold !== undefined) newState.limiter.threshold = threshold;
  
  return newState;
}

/**
 * Process an EQ effect message and return updated state.
 */
function updateEQState(state, params) {
  const newState = {
    ...state,
    eq: { ...state.eq }
  };
  
  if (params.enabled !== undefined) newState.eq.enabled = params.enabled;
  if (params.hpfFreq !== undefined) newState.eq.hpfFreq = params.hpfFreq;
  if (params.lpfFreq !== undefined) newState.eq.lpfFreq = params.lpfFreq;
  if (params.peakFreq !== undefined) newState.eq.peakFreq = params.peakFreq;
  if (params.peakGain !== undefined) newState.eq.peakGain = params.peakGain;
  if (params.peakQ !== undefined) newState.eq.peakQ = params.peakQ;
  
  return newState;
}

/**
 * Process a delay effect message and return updated state.
 */
function updateDelayState(state, params) {
  const newState = {
    ...state,
    delay: { ...state.delay }
  };
  
  if (params.enabled !== undefined) {
    newState.delay.enabled = !!params.enabled;
  }
  if (params.delayTime !== undefined) newState.delay.delayTime = params.delayTime;
  if (params.feedback !== undefined) newState.delay.feedback = params.feedback;
  if (params.mix !== undefined) newState.delay.mix = params.mix;
  
  return newState;
}

/**
 * Handle an effect message and return updated state.
 * Central dispatcher — handles all _SSA_SET_* message types.
 * Returns { newState, handled } where handled = true if message was processed.
 */
function handleEffectMessage(state, message) {
  if (!message || !message.type) return { state, handled: false };
  
  let newState = state;
  
  switch (message.type) {
    case '_SSA_SET_COMPRESSOR': {
      const { active, params } = message;
      newState = updateCompressorState(newState, {
        enabled: active,
        ...params
      });
      break;
    }
    case '_SSA_SET_LIMITER': {
      const { active, params } = message;
      newState = updateLimiterState(newState, {
        enabled: active,
        ...params
      });
      break;
    }
    case '_SSA_SET_EQ': {
      const { active, params } = message;
      newState = updateEQState(newState, {
        enabled: active,
        ...params
      });
      break;
    }
    case '_SSA_SET_DELAY': {
      const { active, params } = message;
      newState = updateDelayState(newState, {
        enabled: active,
        ...params
      });
      break;
    }
    default:
      return { state, handled: false };
  }
  
  return { newState, handled: true };
}

/**
 * Check if effects state matches defaults (useful for "reset" logic)
 */
function isEffectsDefaults(state) {
  return (
    state.compressor.enabled === EFFECTS_DEFAULTS.compressor.enabled &&
    state.compressor.threshold === EFFECTS_DEFAULTS.compressor.threshold &&
    state.compressor.knee === EFFECTS_DEFAULTS.compressor.knee &&
    state.compressor.ratio === EFFECTS_DEFAULTS.compressor.ratio &&
    state.limiter.enabled === EFFECTS_DEFAULTS.limiter.enabled &&
    state.limiter.threshold === EFFECTS_DEFAULTS.limiter.threshold &&
    state.eq.enabled === EFFECTS_DEFAULTS.eq.enabled &&
    state.eq.hpfFreq === EFFECTS_DEFAULTS.eq.hpfFreq &&
    state.eq.lpfFreq === EFFECTS_DEFAULTS.eq.lpfFreq &&
    state.eq.peakFreq === EFFECTS_DEFAULTS.eq.peakFreq &&
    state.eq.peakGain === EFFECTS_DEFAULTS.eq.peakGain &&
    state.eq.peakQ === EFFECTS_DEFAULTS.eq.peakQ &&
    state.delay.enabled === EFFECTS_DEFAULTS.delay.enabled &&
    state.delay.delayTime === EFFECTS_DEFAULTS.delay.delayTime &&
    state.delay.feedback === EFFECTS_DEFAULTS.delay.feedback &&
    state.delay.mix === EFFECTS_DEFAULTS.delay.mix
  );
}

module.exports = {
  EFFECTS_DEFAULTS,
  createEffectsState,
  updateCompressorState,
  updateLimiterState,
  updateEQState,
  updateDelayState,
  handleEffectMessage,
  isEffectsDefaults
};
