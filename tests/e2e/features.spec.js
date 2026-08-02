/**
 * E2E Feature Tests (P1)
 * 
 * Tests feature completeness: capture sources, glitch state,
 * sensitivity, oscilloscope controls, export, logs, performance monitor.
 * 
 * Tests open the extension popup directly (popup.html IS the side panel page).
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

// Use the popup page directly (it's used for both popup and side panel)
function getPopupURL() {
  return `file://${path.join(EXTENSION_PATH, 'popup', 'popup.html')}`;
}

test.describe('E2E Features', () => {
  let context;

  test.beforeEach(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-web-security',
      ],
    });
  });

  test.afterEach(async () => {
    await context.close();
  });

  // === Glitch Detection UI Tests ===

  test('should have glitch settings section with sensitivity slider', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const glitchUI = await page.evaluate(() => {
      return {
        section: !!document.getElementById('glitchSettings'),
        slider: !!document.getElementById('thresholdSlider'),
        resetBtn: !!document.getElementById('resetSensitivityBtn'),
        valueLabel: !!document.getElementById('thresholdValue'),
        sliderMin: parseInt(document.getElementById('thresholdSlider')?.min),
        sliderMax: parseInt(document.getElementById('thresholdSlider')?.max),
        sliderValue: parseInt(document.getElementById('thresholdSlider')?.value),
      };
    });

    expect(glitchUI.section).toBe(true);
    expect(glitchUI.slider).toBe(true);
    expect(glitchUI.resetBtn).toBe(true);
    expect(glitchUI.sliderMin).toBe(60);
    expect(glitchUI.sliderMax).toBe(90);
    expect(glitchUI.sliderValue).toBe(85);
  });

  test('should have glitch state display elements', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const glitchUI = await page.evaluate(() => {
      const section = document.getElementById('glitchSection');
      return {
        sectionExists: !!section,
        status: !!document.getElementById('glitchStatus'),
        dot: !!document.getElementById('glitchStateDot'),
        count: !!document.getElementById('glitchCount'),
      };
    });

    expect(glitchUI.sectionExists).toBe(true);
    expect(glitchUI.status).toBe(true);
    expect(glitchUI.dot).toBe(true);
    expect(glitchUI.count).toBe(true);
  });

  test('should have oscilloscope control buttons', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const buttons = await page.evaluate(() => {
      return {
        freeze: !!document.getElementById('freezeBtn'),
        split: !!document.getElementById('splitBtn'),
        setRef: !!document.getElementById('setRefBtn'),
        clear: !!document.getElementById('clearOscBtn'),
        zoom: !!document.getElementById('zoomBtn'),
        logScale: !!document.getElementById('logScaleBtn'),
        exportBtn: !!document.getElementById('exportBtn'),
        exportLogBtn: !!document.getElementById('exportLogBtn'),
      };
    });

    expect(buttons.freeze).toBe(true);
    expect(buttons.split).toBe(true);
    expect(buttons.setRef).toBe(true);
    expect(buttons.clear).toBe(true);
    expect(buttons.zoom).toBe(true);
    expect(buttons.logScale).toBe(true);
    expect(buttons.exportBtn).toBe(true);
    expect(buttons.exportLogBtn).toBe(true);
  });

  // === Extended Metrics Tests ===

  test('should have extended metrics section with all display elements', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate(() => {
      return {
        section: !!document.getElementById('extendedMetricsSection'),
        dr: !!document.getElementById('drValue'),
        bassMidRatio: !!document.getElementById('bassMidRatioValue'),
        midTrebleRatio: !!document.getElementById('midTrebleRatioValue'),
        glitchRate: !!document.getElementById('glitchRateValue'),
      };
    });

    expect(metrics.section).toBe(true);
    expect(metrics.dr).toBe(true);
    expect(metrics.bassMidRatio).toBe(true);
    expect(metrics.midTrebleRatio).toBe(true);
    expect(metrics.glitchRate).toBe(true);
  });

  test('should have new DSP metrics section (HNR, ZCR, Centroid, etc.)', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate(() => {
      return {
        section: !!document.getElementById('newMetricsSection'),
        hnr: !!document.getElementById('hnrValue'),
        zcr: !!document.getElementById('zcrValue'),
        centroid: !!document.getElementById('centroidValue'),
        rolloff: !!document.getElementById('rolloffValue'),
        onset: !!document.getElementById('onsetValue'),
        rtt: !!document.getElementById('rttValue'),
      };
    });

    expect(metrics.section).toBe(true);
    expect(metrics.hnr).toBe(true);
    expect(metrics.zcr).toBe(true);
    expect(metrics.centroid).toBe(true);
    expect(metrics.rolloff).toBe(true);
    expect(metrics.onset).toBe(true);
    expect(metrics.rtt).toBe(true);
  });

  // === Logs Panel Tests ===

  test('should have logs toggle button', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const logsUI = await page.evaluate(() => {
      return {
        toggleBtn: !!document.getElementById('logsToggleBtn'),
        section: !!document.getElementById('logsSection'),
        clearBtn: !!document.getElementById('logsClearBtn'),
        exportBtn: !!document.getElementById('logsExportBtn'),
        closeBtn: !!document.getElementById('logsCloseBtn'),
        filterRow: !!document.getElementById('logsFilterRow'),
        count: !!document.getElementById('logsCount'),
      };
    });

    expect(logsUI.toggleBtn).toBe(true);
    expect(logsUI.clearBtn).toBe(true);
    expect(logsUI.exportBtn).toBe(true);
    expect(logsUI.closeBtn).toBe(true);
    expect(logsUI.filterRow).toBe(true);
    expect(logsUI.count).toBe(true);
  });

  test('should have log filter buttons for all levels', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const levels = await page.evaluate(() => {
      const buttons = document.querySelectorAll('#logsFilterRow .logs-filter');
      return {
        count: buttons.length,
        levels: Array.from(buttons).map(b => b.dataset.level),
      };
    });

    expect(levels.count).toBe(5);
    expect(levels.levels).toContain('all');
    expect(levels.levels).toContain('error');
    expect(levels.levels).toContain('warn');
    expect(levels.levels).toContain('info');
    expect(levels.levels).toContain('debug');
  });

  // === Performance Monitor Tests ===

  test('should have performance monitor with all metrics display', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const perf = await page.evaluate(() => {
      return {
        header: !!document.getElementById('perfMonitorHeader'),
        panel: !!document.getElementById('perfMonitor'),
        toggleBtn: !!document.getElementById('togglePerfBtn'),
        fps: !!document.getElementById('perfFps'),
        drawTime: !!document.getElementById('perfDrawTime'),
        latency: !!document.getElementById('perfLatency'),
        dsp: !!document.getElementById('perfDsp'),
        drops: !!document.getElementById('perfDrops'),
        connection: !!document.getElementById('perfConnection'),
        connLatency: !!document.getElementById('perfConnLatency'),
        memory: !!document.getElementById('perfMemory'),
        alerts: !!document.getElementById('perfAlerts'),
      };
    });

    expect(perf.header).toBe(true);
    expect(perf.panel).toBe(true);
    expect(perf.toggleBtn).toBe(true);
    expect(perf.fps).toBe(true);
    expect(perf.drawTime).toBe(true);
    expect(perf.latency).toBe(true);
    expect(perf.dsp).toBe(true);
    expect(perf.drops).toBe(true);
    expect(perf.connection).toBe(true);
    expect(perf.connLatency).toBe(true);
    expect(perf.memory).toBe(true);
    expect(perf.alerts).toBe(true);
  });

  // === Channel Indicator Test ===

  test('should have channel indicator element', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const channel = await page.evaluate(() => {
      return {
        exists: !!document.getElementById('channelIndicator'),
        text: document.getElementById('channelIndicator')?.textContent?.trim(),
      };
    });

    expect(channel.exists).toBe(true);
    expect(channel.text).toBeTruthy();
  });

  // === Frequency Bands Test ===

  test('should have frequency bands with all three displays', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const bands = await page.evaluate(() => {
      return {
        section: !!document.getElementById('freqBandsSection'),
        bassBar: !!document.getElementById('bassBar'),
        bassValue: !!document.getElementById('bassValue'),
        midBar: !!document.getElementById('midBar'),
        midValue: !!document.getElementById('midValue'),
        trebleBar: !!document.getElementById('trebleBar'),
        trebleValue: !!document.getElementById('trebleValue'),
      };
    });

    expect(bands.section).toBe(true);
    expect(bands.bassBar).toBe(true);
    expect(bands.bassValue).toBe(true);
    expect(bands.midBar).toBe(true);
    expect(bands.midValue).toBe(true);
    expect(bands.trebleBar).toBe(true);
    expect(bands.trebleValue).toBe(true);
  });

  // === Entropy/Flatness Section Test ===

  test('should have entropy and flatness display section', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const entropyUI = await page.evaluate(() => {
      return {
        section: !!document.getElementById('entropySection'),
        entropyValue: !!document.getElementById('entropyValue'),
        flatnessValue: !!document.getElementById('flatnessValue'),
        entropyState: !!document.getElementById('entropyState'),
        hint: !!document.getElementById('entropyHint'),
      };
    });

    expect(entropyUI.section).toBe(true);
    expect(entropyUI.entropyValue).toBe(true);
    expect(entropyUI.flatnessValue).toBe(true);
    expect(entropyUI.entropyState).toBe(true);
    expect(entropyUI.hint).toBe(true);
  });

  // === RMS Section Test ===

  test('should have RMS display section with value, peak, and bar', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const rmsUI = await page.evaluate(() => {
      return {
        section: !!document.getElementById('rmsSection'),
        value: !!document.getElementById('rmsValue'),
        peak: !!document.getElementById('peakValue'),
        level: !!document.getElementById('rmsLevel'),
        bar: !!document.getElementById('rmsBar'),
      };
    });

    expect(rmsUI.section).toBe(true);
    expect(rmsUI.value).toBe(true);
    expect(rmsUI.peak).toBe(true);
    expect(rmsUI.level).toBe(true);
    expect(rmsUI.bar).toBe(true);
  });

  // === Audio Drops Test ===

  test('should have audio drops container element', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const drops = await page.evaluate(() => {
      const container = document.getElementById('audioDropsContainer');
      return {
        exists: !!container,
        hasCount: !!document.getElementById('dropCount'),
        isHidden: container?.style.display === 'none',
      };
    });

    expect(drops.exists).toBe(true);
    expect(drops.hasCount).toBe(true);
    expect(drops.isHidden).toBe(true); // Should be hidden when not capturing
  });

  // === Entropy State Display Test ===

  test('should have entropy state indicator element', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const entropyState = await page.evaluate(() => {
      const el = document.getElementById('entropyState');
      return {
        exists: !!el,
        text: el?.textContent?.trim(),
        classList: el?.className || '',
      };
    });

    expect(entropyState.exists).toBe(true);
    expect(typeof entropyState.text).toBe('string');
  });

  // === Glitch State Color Tests ===

  test('should have glitch state dot with expected classes', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const glitchDot = await page.evaluate(() => {
      const dot = document.getElementById('glitchStateDot');
      return {
        exists: !!dot,
        classList: dot?.className || '',
        styleDisplay: dot?.style?.display,
      };
    });

    expect(glitchDot.exists).toBe(true);
    expect(typeof glitchDot.classList).toBe('string');
  });

  // === Split Screen Controls Test ===

  test('should have split screen toggle and set reference button', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const splitControls = await page.evaluate(() => {
      return {
        splitBtn: !!document.getElementById('splitBtn'),
        setRefBtn: !!document.getElementById('setRefBtn'),
        splitActive: document.getElementById('splitBtn')?.classList?.contains('active'),
      };
    });

    expect(splitControls.splitBtn).toBe(true);
    expect(splitControls.setRefBtn).toBe(true);
    expect(typeof splitControls.splitActive).toBe('boolean');
  });

  // === Capture Source State Test ===

  test('should track active capture source selection', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const sourceState = await page.evaluate(() => {
      const select = document.getElementById('captureSourceSelect');
      return {
        selected: select?.value,
        hasOptions: select?.options?.length > 0,
      };
    });

    expect(sourceState.selected).toMatch(/^(tab|mic|combined)$/);
    expect(sourceState.hasOptions).toBe(true);
  });

  // === Threshold Slider Range Test ===

  test('should have threshold slider with correct min/max values', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const sliderInfo = await page.evaluate(() => {
      const slider = document.getElementById('thresholdSlider');
      return {
        min: slider?.min,
        max: slider?.max,
        step: slider?.step,
        defaultValue: slider?.value,
      };
    });

    expect(sliderInfo.min).toBe('60');
    expect(sliderInfo.max).toBe('90');
    expect(sliderInfo.step).toBe('1');
    expect(sliderInfo.defaultValue).toBe('85');
  });

  // === Limiter Settings UI Test ===

  test('should have limiter section with threshold slider', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const limiterUI = await page.evaluate(() => {
      const limiterSection = document.getElementById('limiterSection');
      return {
        exists: !!limiterSection,
        threshold: !!document.getElementById('limThresh'),
        attack: !!document.getElementById('limAttack'),
        release: !!document.getElementById('limRelease'),
      };
    });

    expect(limiterUI.exists).toBe(true);
    expect(limiterUI.threshold).toBe(true);
    expect(limiterUI.attack).toBe(true);
    expect(limiterUI.release).toBe(true);
  });

  // === Log Count Display Test ===

  test('should have log count display element', async () => {
    const page = await context.newPage();
    await page.goto(getPopupURL());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const countInfo = await page.evaluate(() => {
      const countEl = document.getElementById('logsCount');
      return {
        exists: !!countEl,
        text: countEl?.textContent?.trim(),
      };
    });

    expect(countInfo.exists).toBe(true);
    expect(countInfo.text).toMatch(/^\d+$/);
  });
});
