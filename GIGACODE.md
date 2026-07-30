---
name: stream-sensation-analyzer
description: Project instructions for GigaCode — Stream Sensation Analyzer Chrome Extension
---

# Stream Sensation Analyzer — GigaCode Instructions

## Project Overview

Chrome Extension (Manifest V3) that analyzes audio streams in real-time using AudioWorklet DSP.
Detects glitches, noise, and audio quality issues with visual feedback via popup and overlay.

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
│   ├── popup.html             # Popup UI shell
│   ├── popup.js               # Popup state machine, canvas rendering
│   └── config.js              # Settings persistence
├── dsp-engine/
│   ├── audio-worklet.js       # FFT, DSP metrics, glitch detection (main)
│   ├── delay-processor.js     # Delay effect AudioWorkletProcessor
│   ├── rms.js                 # RMS calculation helper
│   └── tests/                 # DSP unit tests
├── tests/                     # General integration tests
├── TASKS.md                   # Task tracking
└── README.md                  # Project documentation
```

## Four-Worker Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Popup (popup.js)    Content Script (content.js)            │
│  - Settings UI       - Shadow DOM overlay                   │
│  - Canvas rendering  - Real-time metrics display            │
│  - Capture controls  - Drag/drop positioning                │
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

## Running Tests

```bash
npm test           # Run Jest tests
npm test -- --coverage  # With coverage report
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

1. **No NPM dependencies** for runtime (only Jest for testing)
2. **No ES modules** in extension files (use script tags)
3. **No window/document** in offscreen.js (offscreen document = no DOM)
4. **No chrome:// URLs** for content scripts (guarded in content.js)
5. **AudioWorklet modules** must be loaded via `chrome.runtime.getURL()`
6. **Service Worker** can sleep at any time — always persist state

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
