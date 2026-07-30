// delay-processor-testable.js — Pure logic extracted from DelayProcessor AudioWorkletProcessor
// Exports stateless processing functions for testing

/**
 * Process a single channel of audio through the delay effect.
 * This is the pure core logic extracted from DelayProcessor.process()
 * 
 * @param {Float32Array} input - Input audio samples
 * @param {number} delayTime - Delay time in seconds (0 to 1.0)
 * @param {number} feedback - Feedback coefficient (0 to 0.95)
 * @param {number} mix - Wet/dry mix (0 to 1)
 * @param {number} sampleRate - Sample rate (default 44100)
 * @param {Float32Array} buffer - Delay buffer (should be large enough for maxDelay * sampleRate)
 * @param {number} initialWriteIndex - Initial write index in buffer
 * @returns {{ output: Float32Array, finalWriteIndex: number }}
 */
function processDelayChannel(input, delayTime, feedback, mix, sampleRate, buffer, initialWriteIndex) {
  const delaySamples = Math.max(0, Math.floor(delayTime * sampleRate));
  const output = new Float32Array(input.length);
  let writeIndex = initialWriteIndex;
  const bufLength = buffer.length;

  for (let i = 0; i < input.length; i++) {
    const readIndex = (writeIndex - delaySamples + bufLength) % bufLength;
    const delayed = buffer[readIndex];

    // Wet/dry mix
    output[i] = input[i] * (1 - mix) + delayed * mix;

    // Write to buffer: dry + feedback
    buffer[writeIndex] = input[i] + delayed * feedback;

    writeIndex = (writeIndex + 1) % bufLength;
  }

  return { output, finalWriteIndex: writeIndex };
}

/**
 * Create a delay buffer of given size.
 */
function createDelayBuffer(maxDelay, sampleRate) {
  return new Float32Array(Math.ceil(maxDelay * sampleRate));
}

/**
 * Clamp a value to [min, max].
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the delay time in samples from seconds.
 */
function delayTimeToSamples(delayTime, sampleRate) {
  return Math.max(0, Math.floor(delayTime * sampleRate));
}

/**
 * Compute the wet/dry mix output for a single sample.
 */
function computeMix(drySample, wetSample, mix) {
  return drySample * (1 - mix) + wetSample * mix;
}

/**
 * Compute the buffer write value (dry + feedback of delayed sample).
 */
function computeBufferWrite(drySample, delayedSample, feedback) {
  return drySample + delayedSample * feedback;
}

/**
 * Get the read index from write index, delay samples, and buffer length.
 */
function getReadIndex(writeIndex, delaySamples, bufLength) {
  return (writeIndex - delaySamples + bufLength) % bufLength;
}

// Default constants from the processor
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_MAX_DELAY = 1.0;
const DEFAULT_FEEDBACK = 0;
const DEFAULT_MIX = 0;
const DEFAULT_DELAY_TIME = 0;
const MAX_FEEDBACK = 0.95;
const MAX_MIX = 1.0;
const MIN_DELAY = 0;
const MAX_DELAY = 1.0;

module.exports = {
  processDelayChannel,
  createDelayBuffer,
  clamp,
  delayTimeToSamples,
  computeMix,
  computeBufferWrite,
  getReadIndex,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_MAX_DELAY,
  DEFAULT_FEEDBACK,
  DEFAULT_MIX,
  DEFAULT_DELAY_TIME,
  MAX_FEEDBACK,
  MAX_MIX,
  MIN_DELAY,
  MAX_DELAY,
};
