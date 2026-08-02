---
name: stream-sensation-analyzer
description: Project instructions for GigaCode — Stream Sensation Analyzer Chrome Extension
---

# Stream Sensation Analyzer — GigaCode Instructions

## Project Overview

Chrome Extension (Manifest V3) that analyzes audio streams in real-time using AudioWorklet DSP.
Detects glitches, noise, and audio quality issues with visual feedback via side panel (popup deprecated) and overlay.

**Core tech stack:** Vanilla JS, AudioWorklet, Web Audio API, Shadow DOM, Chrome Extension API

## Directory Structure

```
analyzer/
├── manifest.json              # Extension config (MV3)
├── background.js              # Service Worker (message relay, offscreen mgmt)
├── offscreen.html             # Offscreen document shell
├── offscreen.js               # Audio capture, effects chain, FFT processing
├── content.js                 # Shadow DOM overlay widget (content script)
├── logger.js                  # Centralized logging system
├── popup/
│   ├── popup.html             # Side Panel UI (popup deprecated)
│   ├── popup.css              # Theme (dark/light/neon), element styles
│   ├── popup.js               # Side panel state machine, canvas rendering
│   ├── popup-testable.js      # Pure functions: themes, validation, messages
│   └── config.js              # Settings persistence
├── dsp-engine/
│   ├── audio-worklet.js       # FFT, DSP metrics, glitch detection (main)
│   ├── delay-processor.js     # Delay effect AudioWorkletProcessor
│   ├── rms.js                 # RMS calculation helper
│   ├── midi-export.js         # MIDI CC mapping (stub)
│   ├── defensive-processors.js # Safe FFT/RMS implementations
│   └── tests/                 # DSP unit tests
├── tests/
│   ├── unit/                  # Unit tests (popup, background, content, logger, dsp)
│   │   ├── popup/             # popup-api.spec.js (33 tests)
│   │   ├── background/        # api-fault-injection.spec.js, ring-buffer.spec.js
│   │   ├── content/           # context-invalidated.spec.js, style-isolation.spec.js
│   │   ├── dsp/               # advanced-stress-tests.spec.js, silence-detection.spec.js
│   │   └── utils/             # logger.spec.js
│   └── e2e/                   # E2E tests (Playwright)
│       ├── ssa-e2e.spec.js    # SW lifecycle, port reconnect
│       ├── ssa-cdp.spec.js    # CDP kill/recovery
│       └── metrics-validation.spec.js # Metrics structure validation
├── scripts/
│   ├── validate.js            # 5 checks: tests, syntax, logs, manifest, API
│   ├── lint-logs.js           # Production logging linter
│   └── scheduler/             # Auto-analysis pipeline
│       ├── run-all.js         # Orchestrator
│       ├── analyze-results.js # Agent analysis (health scoring)
│       ├── generate-tasks.js  # Task generator (auto-updates TASKS.md)
│       ├── reports/           # last-run.json, agent-report.json
│       └── history/           # 30-day run history
├── GIGACODE.md                # Project instructions for GigaCode
├── TASKS.md                   # Task tracking (Sprint 1-8)
├── README.md                  # Project documentation
├── playwright.config.js       # Playwright E2E config
├── vitest.config.js           # Vitest unit test + coverage config
├── package.json               # NPM scripts (14 commands)
└── .github/workflows/
    └── validate.yml           # CI pipeline (2-job: validate + scheduler)
```

## Architecture (Side Panel + Four-Worker)

> **Note:** Popup deprecated (Sprint 9 migration). Side panel is now the primary UI.

```
┌─────────────────────────────────────────────────────────────┐
│  Side Panel (popup.js)  Content Script (content.js)         │
│  - Settings UI        - Shadow DOM overlay                  │
│  - Canvas rendering   - Real-time metrics display           │
│  - Capture controls   - Drag/drop positioning               │
│       │                        │                            │
│       └─────────┬──────────────┘                            │
│                 ▼                                             │
│  Background SW (background.js)                               │
│  - Message relay              - Offscreen lifecycle           │
│  - Storage persistence        - Keepalive alarms            │
│                 │                                             │
│                 ▼                                             │
│  Offscreen Document (offscreen.js)                           │
│  - MediaStream capture        - Effects chain                │
│  - AudioWorkletNode           - FFT + metrics               │
│                 │                                             │
│                 ▼                                             │
│  AudioWorklet Thread (audio-worklet.js)                      │
│  - Zero-GC DSP                - Glitch detection             │
│  - 1024-pt FFT                - 512 Hz processing           │
└─────────────────────────────────────────────────────────────┘
```

## Side Panel Configuration

Side panel is configured in `manifest.json`:
```json
"side_panel": {
  "default_path": "popup/popup.html"
},
"permissions": ["sidePanel"]
```

Activation: Click extension icon → side panel opens (doesn't close on outside click, unlike popup).

Popup functionality fully migrated to side panel (Sprint 9). All 376 lines of popup.html work identically in both contexts.

## Key Conventions

### Message Passing
- Use `chrome.runtime.connect()` for persistent connections (ports)
- Use `chrome.runtime.sendMessage()` for one-shot requests
- Always validate message structure on receive
- Always check `chrome.runtime.lastError` on send

### Service Worker Persistence
- Store all critical state in `chrome.storage.local`
- Key: `ssa_capturing` — capture state across SW restarts
- Key: `ssa_metrics_queue` — metrics queue persistence
- Key: `ssa_audio_drop_count` — drop count persistence
- Keepalive alarm: `ssa_keepalive` every 15s

### Zero-GC DSP
- Pre-allocate ALL buffers in constructor
- Use `Float32Array` for audio data
- Never allocate in `process()` method
- Precompute twiddle factors, Hanning window, bit-reversal tables

### Effects Chain (order matters)
```
Source → Compressor → HPF → LPF → Peaking → Delay → WaveShaper → Worklet
```
Bypass patterns: ratio=1 (compressor), 20/22050Hz (filters), gain=0dB, mix=0 (delay)

### Overlay
- Shadow DOM for CSS isolation
- Global CSS in document.head (for :hover, :dragging)
- Internal CSS in shadow root
- Cache all DOM references on init
- Canvas redraw throttled to ~15fps (metrics at 43fps)

### Error Handling
- Try-catch around AudioContext operations
- Check `chrome.offscreen` API availability before use
- Port reconnect with exponential backoff
- Logger system: `logger.js` with levels debug/info/warn/error

## Test Directory Conventions — IMPORTANT

**USE ONLY these directories for tests:**
- `tests/unit/` — Unit tests (popup, content, background, logger, dsp, utils)
- `tests/e2e/` — E2E tests (Playwright: SW lifecycle, port reconnect, metrics)
- `dsp-engine/tests/` — DSP unit tests (FFT, bands, metrics, RMS, MIDI, defensive)

**NEVER use `__tests__/` directory.** Vitest is NOT configured to run tests from there.
Any tests placed in `__tests__/` will:
1. NOT run during CI
2. NOT count toward coverage
3. Create false sense of test coverage
4. Create maintenance burden (stale/temp files)

If you need to add a test for `audio-worklet.js` → use `dsp-engine/tests/`.
If you need to test popup, content, background, logger → use `tests/unit/`.
If you need to test full extension flow → use `tests/e2e/`.

## Running Tests

```bash
npm test                      # Run Vitest unit tests (319 tests)
npm test -- --coverage        # With coverage report
npm run test:e2e              # Run Playwright E2E tests (11 tests)
npm run test:all              # Unit + E2E
npm run scheduler:all         # Full validation pipeline + agent analysis
```

## Scheduler Pipeline

```bash
npm run scheduler:run         # Run orchestrator (tests, syntax, lint, coverage)
npm run scheduler:analyze     # Agent analysis (health scoring, recommendations)
npm run scheduler:generate    # Generate tasks from recommendations (auto-updates TASKS.md)
npm run scheduler:quick       # Fast check: syntax + unit tests
```

## GigaCode Agents

Use these agents for specialized tasks:

- **chrome-extension-dev** — General MV3 development, extension architecture
- **dsp-audio-analyst** — DSP optimization, AudioWorklet performance
- **extension-tester** — Testing strategy, test coverage, E2E tests

## GigaCode Commands

- `/extension-validate` — Run lint, test, build checks
- `/dsp-optimize` — Analyze DSP performance, suggest optimizations
- `/security-audit` — Security analysis of extension code
- `/test-coverage` — Analyze test coverage, suggest missing tests
- `/debug-extension` — Troubleshoot extension issues

## GigaCode Skills

- **chrome-manifest-v3** — MV3 development guide, architecture patterns
- **audio-worklet-dsp** — DSP engine, FFT, glitch detection, effects chain
- **chrome-extension-testing** — Unit, integration, and E2E testing
- **realtime-audio-overlay** — Shadow DOM overlay, canvas rendering, drag/drop

## Important Constraints

1. **No NPM dependencies** for runtime (only Vitest for testing)
2. **No ES modules** in extension files (use script tags)
3. **No window/document** in offscreen.js (offscreen document = no DOM)
4. **No chrome:// URLs** for content scripts (guarded in content.js)
5. **AudioWorklet modules** must be loaded via `chrome.runtime.getURL()`
6. **Service Worker** can sleep at any time — always persist state
7. **No popup** — use side panel only (`popup/popup.html` works in both contexts)

## Common Patterns

### Adding a New Metric
1. Calculate in `audio-worklet.js` processFrame()
2. Add to `payload` object (line ~792)
3. Handle in `content.js` updateOverlay()
4. Display in `popup.js` canvas rendering

### Adding a New Effect
1. Create BiquadFilter or GainNode in offscreen.js
2. Insert into chain between source and worklet
3. Add bypass parameters (ratio=1, gain=0dB, etc.)
4. Expose via popup settings and config.js

### Adding a New Message Type
1. Define in sender (popup/offscreen/content)
2. Handle in receiver's `chrome.runtime.onMessage` or port listener
3. Validate message structure
4. Return response via sendResponse() or promise
