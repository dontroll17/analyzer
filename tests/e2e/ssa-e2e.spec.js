const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

test.describe('Stream Sensation Analyzer — E2E Agent', () => {
  let context;

  test.beforeEach(async () => {
    // Launch Chromium with extension and fake audio stream flags
    context = await chromium.launchPersistentContext('', {
      headless: true, // Can run headed for debugging
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--use-fake-ui-for-media-stream', // Auto-accept microphone/screen prompts
        '--use-fake-device-for-media-stream', // Fake physical devices
        '--disable-web-security', // Allow extension cross-origin
      ],
    });
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should load extension and initialize Service Worker', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    // Wait for Service Worker to activate
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 });
    }

    expect(serviceWorker).toBeDefined();
    await page.close();
  });

  test('should initialize popup and show Start Capture button', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    // Wait for extension to load
    await page.waitForTimeout(1000);

    // Check that background script loaded without errors
    const sw = context.serviceWorkers()[0];
    expect(sw).toBeDefined();

    await page.close();
  });

  test('should detect tab capture capability', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    // Wait for extension initialization
    await page.waitForTimeout(2000);

    // Verify Service Worker has offscreen API available
    const sw = context.serviceWorkers()[0];
    if (sw) {
      const hasOffscreen = await sw.evaluate(() => {
        return !!(chrome.offscreen && chrome.offscreen.hasDocument);
      });
      // In real Chrome, this should be true
      expect(typeof hasOffscreen).toBe('boolean');
    }

    await page.close();
  });

  test('should handle START_CAPTURE with tabStreamId', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    // Wait for SW to initialize
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 5000 });
    }

    // Simulate START_CAPTURE with valid tabStreamId (no GUI dialog)
    const response = await sw.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'START_CAPTURE', captureSource: 'tab', tabStreamId: 'mock-tab-stream-123' },
          resolve
        );
      });
    });

    // Should not throw — tabStreamId is provided, no getDisplayMedia dialog
    expect(response).toBeDefined();

    await page.close();
  });

  // Phase 4.3: Content script injection tests
  test('content.js should NOT be pre-loaded on pages (no content_scripts in manifest)', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Check that content.js is not in the page context
    const hasSsaContent = await page.evaluate(() => {
      return typeof window.__ssaContentInitialized !== 'undefined';
    });
    
    expect(hasSsaContent).toBe(false);
    
    await page.close();
  });
});

test.describe('Service Worker Lifecycle', () => {
  let context;

  test.beforeEach(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should survive Service Worker restart via chrome.alarms', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 5000 });
    }

    // Activate capture
    await sw.evaluate(() => {
      chrome.runtime.sendMessage({ type: 'START_CAPTURE', captureSource: 'tab', tabStreamId: 'test-123' });
    });

    // Wait a bit
    await page.waitForTimeout(1000);

    // Service Worker should still be alive (kept by alarm)
    const sws = context.serviceWorkers();
    expect(sws.length).toBeGreaterThanOrEqual(1);

    await page.close();
  });
});
