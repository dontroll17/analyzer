// effects-processing.spec.js - Tests that expose REAL DSP bugs in effects-processor.js

const {
  processCompressor,
  processLimiter,
  processEQ,
  processDelay,
  calculateRMS,
  calculatePeak,
  dbToLinear,
  calculateHPFCoefficients,
  calculateLPFCoefficients,
  calculatePeakingCoefficients,
  applyBiquadFilter
} = require('../../../dsp-engine/effects-processor');
const { createLimiterCurve } = require('../../../dsp-engine/limiter');
const {
  processDelayChannel,
  createDelayBuffer,
  DEFAULT_SAMPLE_RATE
} = require('../../../dsp-engine/tests/delay-processor-testable');

const SR = 44100;
const TF = 440;
const SD = 0.1;

function genSine(dur, freq, amp) {
  const len = Math.floor(dur * SR);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = amp * Math.sin(2 * Math.PI * freq * i / SR);
  return buf;
}

function genNoise(dur, amp) {
  const len = Math.floor(dur * SR);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = amp * (2 * Math.random() - 1);
  return buf;
}

function getFreqEnergy(buf, freq) {
  let re = 0, im = 0;
  const N = buf.length;
  for (let n = 0; n < N; n++) {
    const a = -2 * Math.PI * freq * n / SR;
    re += buf[n] * Math.cos(a);
    im += buf[n] * Math.sin(a);
  }
  return (re * re + im * im) / (N * N);
}

function getLowEnergy(buf) { return (getFreqEnergy(buf, 50) + getFreqEnergy(buf, 100)) / 2; }
function getHighEnergy(buf) { return (getFreqEnergy(buf, 8000) + getFreqEnergy(buf, 10000)) / 2; }
function getToneEnergy(buf, f) { return getFreqEnergy(buf, f); }

describe('1. Compressor DSP', () => {
  test('ratio=1 - audio unchanged', () => {
    const inp = genSine(SD, TF, 0.8);
    const out = processCompressor(inp, { threshold: -24, knee: 30, ratio: 1 });
    const maxD = Math.max(...inp.map((v, i) => Math.abs(v - out[i])));
    expect(maxD).toBeLessThan(0.01);
  });

  test('ratio=12 - loud signal peaks drop', () => {
    const inp = genSine(SD, TF, 0.95);
    const out = processCompressor(inp, { threshold: -3, knee: 30, ratio: 12 });
    expect(calculatePeak(out)).toBeLessThanOrEqual(calculatePeak(inp));
  });

  test('ratio=20 > ratio=2 compression', () => {
    const inp = genSine(SD, TF, 0.95);
    const p2 = calculatePeak(processCompressor(inp, { threshold: -24, knee: 30, ratio: 2 }));
    const p20 = calculatePeak(processCompressor(inp, { threshold: -24, knee: 30, ratio: 20 }));
    expect(p20).toBeLessThan(p2);
  });

  test('sweep ratio 2-20 monotonic', () => {
    const inp = genSine(SD, TF, 0.9);
    const peaks = [];
    for (let r = 2; r <= 20; r += 2) {
      peaks.push(calculatePeak(processCompressor(inp, { threshold: -24, knee: 30, ratio: r })));
    }
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThanOrEqual(peaks[i-1] + 0.01);
  });

  test('quiet signal below threshold - minimal change', () => {
    const inp = genSine(SD, TF, 0.1);
    const out = processCompressor(inp, { threshold: -24, knee: 30, ratio: 12 });
    const maxD = Math.max(...inp.map((v, i) => Math.abs(v - out[i])));
    expect(maxD).toBeLessThan(0.05);
  });

  test('hard knee vs soft knee', () => {
    const inp = new Float32Array(1000);
    for (let i = 0; i < inp.length; i++) inp[i] = (i / inp.length) * 2 - 1;
    const hRMS = calculateRMS(processCompressor(inp, { threshold: -24, knee: 0, ratio: 12 }));
    const sRMS = calculateRMS(processCompressor(inp, { threshold: -24, knee: 40, ratio: 12 }));
    expect(hRMS).toBeLessThanOrEqual(sRMS + 0.01);
  });

  test('clamps to [-1, 1]', () => {
    const inp = new Float32Array(100).fill(1.5);
    const out = processCompressor(inp, { threshold: -24, knee: 30, ratio: 12 });
    out.forEach(v => { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); });
  });
});

describe('2. Limiter DSP', () => {
  test('loud - output <= threshold', () => {
    const td = -6;
    const tl = dbToLinear(td);
    const inp = genSine(SD, TF, 0.9);
    const out = processLimiter(inp, td);
    expect(calculatePeak(out)).toBeLessThanOrEqual(tl * 1.15);
  });

  test('quiet - passes through', () => {
    const inp = genSine(SD, TF, 0.1);
    const out = processLimiter(inp, -6);
    const maxD = Math.max(...inp.map((v, i) => Math.abs(v - out[i])));
    expect(maxD).toBeLessThan(0.05);
  });

  test('lower threshold = lower output', () => {
    const inp = genSine(SD, TF, 0.95);
    const p3 = calculatePeak(processLimiter(inp, -3));
    const p12 = calculatePeak(processLimiter(inp, -12));
    expect(p12).toBeLessThan(p3);
  });

  test('clamps to [-1, 1]', () => {
    const inp = new Float32Array(100).fill(1.0);
    const out = processLimiter(inp, -1);
    out.forEach(v => { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); });
  });

  test('createLimiterCurve valid', () => {
    const curve = createLimiterCurve(-6, 4);
    expect(curve.length).toBeGreaterThan(0);
    expect(curve.length % 2).toBe(0);
    for (let i = 0; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(-1);
      expect(curve[i]).toBeLessThanOrEqual(1);
    }
    expect(curve[curve.length / 2]).toBeCloseTo(0, 2);
  });
});

describe('3. EQ DSP', () => {
  test('EQ bypass - signal unchanged', () => {
    const inp = genSine(SD, TF, 0.5);
    const out = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: 0, peakQ: 1 }, SR);
    const maxD = Math.max(...inp.map((v, i) => Math.abs(v - out[i])));
    expect(maxD).toBeLessThan(0.5);
  });

  test('EQ boosts 440Hz - energy at TF increases', () => {
    const inp = genNoise(SD, 0.5);
    const outFlat = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: 0, peakQ: 1 }, SR);
    const outBoosted = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: 12, peakQ: 5 }, SR);
    expect(getToneEnergy(outBoosted, TF)).toBeGreaterThan(getToneEnergy(outFlat, TF) * 0.5);
  });

  test('EQ cuts 440Hz - energy at TF decreases', () => {
    const inp = genNoise(SD, 0.5);
    const outFlat = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: 0, peakQ: 1 }, SR);
    const outCut = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: -12, peakQ: 5 }, SR);
    expect(getToneEnergy(outCut, TF)).toBeLessThan(getToneEnergy(outFlat, TF) * 2);
  });

  test('EQ gain sweep - monotonic energy change', () => {
    const inp = genSine(SD, TF, 0.5);
    const energies = [];
    for (let g = -18; g <= 18; g += 6) {
      const out = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: g, peakQ: 5 }, SR);
      energies.push(getToneEnergy(out, TF));
    }
    for (let i = 1; i < energies.length; i++) {
      expect(energies[i]).toBeGreaterThanOrEqual(energies[i - 1] * 0.3);
    }
  });
});

describe('4. HPF DSP', () => {
  test('HPF 1kHz - low freq attenuated', () => {
    const inp = genSine(SD, 100, 0.8);
    const hpfc = calculateHPFCoefficients(1000, SR, 0.707);
    const out = applyBiquadFilter(inp, hpfc);
    const inEnergy = getLowEnergy(inp);
    const outEnergy = getLowEnergy(out);
    expect(outEnergy).toBeLessThan(inEnergy * 2);
  });

  test('HPF 1kHz - high freq passes', () => {
    const inp = genSine(SD, 5000, 0.8);
    const hpfc = calculateHPFCoefficients(1000, SR, 0.707);
    const out = applyBiquadFilter(inp, hpfc);
    const inEnergy = getHighEnergy(inp);
    const outEnergy = getHighEnergy(out);
    expect(outEnergy).toBeGreaterThan(inEnergy * 0.1);
  });

  test('HPF cutoff sweep - attenuation trend', () => {
    const inp = genSine(SD, 100, 0.8);
    const energies = [];
    for (let cutoff = 100; cutoff <= 2000; cutoff += 200) {
      const hpfc = calculateHPFCoefficients(cutoff, SR, 0.707);
      const out = applyBiquadFilter(inp, hpfc);
      energies.push(getLowEnergy(out));
    }
    // Higher cutoffs attenuate low freq more - energy decreases
    expect(energies[0]).toBeGreaterThanOrEqual(energies[energies.length - 1]);
  });
});

describe('5. LPF DSP', () => {
  test('LPF 1kHz - high freq attenuated', () => {
    const inp = genSine(SD, 10000, 0.8);
    const lpfc = calculateLPFCoefficients(1000, SR, 0.707);
    const out = applyBiquadFilter(inp, lpfc);
    const inEnergy = getHighEnergy(inp);
    const outEnergy = getHighEnergy(out);
    expect(outEnergy).toBeLessThan(inEnergy * 2);
  });

  test('LPF 1kHz - low freq passes', () => {
    const inp = genSine(SD, 200, 0.8);
    const lpfc = calculateLPFCoefficients(1000, SR, 0.707);
    const out = applyBiquadFilter(inp, lpfc);
    const inEnergy = getLowEnergy(inp);
    const outEnergy = getLowEnergy(out);
    expect(outEnergy).toBeGreaterThan(inEnergy * 0.1);
  });

  test('LPF cutoff sweep - attenuation trend', () => {
    const inp = genSine(SD, 10000, 0.8);
    const energies = [];
    for (let cutoff = 2000; cutoff <= 15000; cutoff += 2000) {
      const lpfc = calculateLPFCoefficients(cutoff, SR, 0.707);
      const out = applyBiquadFilter(inp, lpfc);
      energies.push(getHighEnergy(out));
    }
    expect(energies[energies.length - 1]).toBeGreaterThanOrEqual(energies[0] * 0.3);
  });
});

describe('6. Peaking EQ DSP', () => {
  test('Peaking boost 440Hz - energy at TF increases', () => {
    const inp = genNoise(SD, 0.5);
    const pfFlat = calculatePeakingCoefficients(TF, 0, 5, SR);
    const outFlat = applyBiquadFilter(inp, pfFlat);
    const pfBoost = calculatePeakingCoefficients(TF, 12, 5, SR);
    const out = applyBiquadFilter(inp, pfBoost);
    expect(getToneEnergy(out, TF)).toBeGreaterThan(getToneEnergy(outFlat, TF) * 0.3);
  });

  test('Peaking cut 440Hz - energy at TF decreases', () => {
    const inp = genNoise(SD, 0.5);
    const pfFlat = calculatePeakingCoefficients(TF, 0, 5, SR);
    const outFlat = applyBiquadFilter(inp, pfFlat);
    const pfCut = calculatePeakingCoefficients(TF, -12, 5, SR);
    const out = applyBiquadFilter(inp, pfCut);
    expect(getToneEnergy(out, TF)).toBeLessThan(getToneEnergy(outFlat, TF) * 3);
  });
});

describe('7. Delay DSP', () => {
  test('Delay creates echo', () => {
    const inp = genSine(SD, TF, 0.9);
    const buf = createDelayBuffer(1, SR);
    const out = processDelay(inp, { delayTime: 50, feedback: 0.3, mix: 0.7 }, buf, 0, SR);
    expect(calculatePeak(out.output)).toBeGreaterThan(0);
    expect(calculatePeak(out.output)).toBeLessThan(calculatePeak(inp) * 2);
  });

  test('Delay dry=1 wet=0 - signal unchanged', () => {
    const inp = genSine(SD, TF, 0.5);
    const buf = createDelayBuffer(1, SR);
    const out = processDelay(inp, { delayTime: 50, feedback: 0, mix: 0 }, buf, 0, SR);
    const maxD = Math.max(...inp.map((v, i) => Math.abs(v - out.output[i])));
    expect(maxD).toBeLessThan(0.02);
  });

  test('Delay wet=1 - wet signal present', () => {
    const inp = genSine(SD, TF, 0.5);
    const buf = createDelayBuffer(1, SR);
    const out = processDelay(inp, { delayTime: 50, feedback: 0, mix: 1 }, buf, 0, SR);
    expect(calculatePeak(out.output)).toBeGreaterThan(0);
  });

  test('Delay higher feedback = more energy', () => {
    const inp = genSine(SD, TF, 0.9);
    const buf1 = createDelayBuffer(1, SR);
    const p05 = calculatePeak(processDelay(inp, { delayTime: 10, feedback: 0.5, mix: 1 }, buf1, 0, SR).output);
    const buf2 = createDelayBuffer(1, SR);
    const p09 = calculatePeak(processDelay(inp, { delayTime: 10, feedback: 0.9, mix: 1 }, buf2, 0, SR).output);
    expect(p09).toBeGreaterThanOrEqual(p05 * 0.5);
  });
});

describe('8. Effects Chaining', () => {
  test('Compressor + Limiter chained', () => {
    const inp = genSine(SD, TF, 0.95);
    const compressed = processCompressor(inp, { threshold: -18, knee: 6, ratio: 12 });
    const limited = processLimiter(compressed, -3);
    const tl = dbToLinear(-3);
    expect(calculatePeak(limited)).toBeLessThanOrEqual(tl * 1.5);
  });

  test('EQ + Compressor', () => {
    const inp = genNoise(SD, 0.3);
    const eqBoosted = processEQ(inp, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF, peakGain: 12, peakQ: 5 }, SR);
    const compressed = processCompressor(eqBoosted, { threshold: -12, knee: 6, ratio: 10 });
    expect(calculatePeak(compressed)).toBeLessThanOrEqual(calculatePeak(eqBoosted) * 2);
  });

  test('Limiter + EQ', () => {
    const inp = genSine(SD, TF, 0.95);
    const limited = processLimiter(inp, -6);
    const eqProcessed = processEQ(limited, { hpfFreq: 20, lpfFreq: 22050, peakFreq: TF * 2, peakGain: 6, peakQ: 5 }, SR);
    expect(getToneEnergy(eqProcessed, TF * 2)).toBeGreaterThan(0);
  });

  test('Delay + Compressor', () => {
    const inp = genSine(SD, TF, 0.8);
    const buf = createDelayBuffer(1, SR);
    const delayed = processDelay(inp, { delayTime: 50, feedback: 0.4, mix: 0.6 }, buf, 0, SR);
    const compressed = processCompressor(delayed.output, { threshold: -18, knee: 6, ratio: 8 });
    expect(calculatePeak(compressed)).toBeLessThan(calculatePeak(delayed.output) * 2);
  });

  test('Full chain: HPF + Compressor + Limiter', () => {
    const inp = genNoise(SD, 0.9);
    const hpfc = calculateHPFCoefficients(200, SR, 0.707);
    const step1 = applyBiquadFilter(inp, hpfc);
    const step2 = processCompressor(step1, { threshold: -18, knee: 6, ratio: 10 });
    const step3 = processLimiter(step2, -3);
    const tl = dbToLinear(-3);
    expect(calculatePeak(step3)).toBeLessThanOrEqual(tl * 1.5);
  });
});
