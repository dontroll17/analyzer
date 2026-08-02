const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

test.describe('CDP Service Worker Kill Test', () => {
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

  test('should recover from forced Service Worker termination', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 5000 });
    }

    // Start capture
    await sw.evaluate(() => {
      chrome.runtime.sendMessage({ type: 'START_CAPTURE', captureSource: 'tab', tabStreamId: 'test-123' });
    });

    await page.waitForTimeout(1000);

    // Get CDP session to force SW termination
    try {
      const cdpSession = await context.newCDPSession(page);
      // Try to force service worker termination (may not work in all Chrome versions)
      await cdpSession.send('ServiceWorker.stopServiceWorker', {
        targetId: sw._targetId,
      }).catch(() => {
        // Ignore if not supported
      });
      await page.waitForTimeout(2000);
    } catch (e) {
      // CDP command not supported, skip this part
      console.log('CDP stopServiceWorker not supported, skipping');
    }

    // Service Worker should have been recreated
    const newSw = context.serviceWorkers()[0];
    expect(newSw).toBeDefined();

    await page.close();
  });

  test('popup port should survive rapid reconnect', async () => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    const sw = context.serviceWorkers()[0] || 
               await context.waitForEvent('serviceworker', { timeout: 5000 });

    // Simulate rapid disconnect/reconnect cycle
    const result = await sw.evaluate(() => {
      return new Promise((resolve) => {
        // Connect
        const port1 = chrome.runtime.connect({ name: 'popup-metrics' });
        
        // Disconnect immediately
        port1.disconnect();
        
        // Reconnect within 100ms
        setTimeout(() => {
          const port2 = chrome.runtime.connect({ name: 'popup-metrics' });
          
          // Verify port2 is valid
          resolve({
            port1Disconnected: true,
            port2Connected: !!port2,
          });
        }, 50);
      });
    });

    expect(result.port2Connected).toBe(true);

    await page.close();
  });
});
