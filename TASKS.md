# Tasks — Stream Sensation Analyzer

Единый трекинг задач проекта. Подробнее в [README.md](README.md).

---

## Sprint 1 — Done ✅

| # | Задача | Статус |
|---|--------|--------|
| 0.1 | README + Tech debt cleanup (deduplication applyMetrics, listener leak fix, beforeunload race, var→const/let) | ✅ Done |
| 1.1 | Overlay widget (content script, draggable Canvas, position persistence) | ✅ Done |
| 2.1 | Performance (rAF throttle, Array.from → Float32Array, buffer pooling) | ✅ Done |
| 3.1 | Oscilloscope options (Freeze, Zoom, Log scale, Clear) | ✅ Done |
| 3.2 | Error handling, keepalive, documentation, stereo support | ✅ Done |

---

## Sprint 2 — Done ✅

| # | Задача | Статус |
|---|--------|--------|
| 2.2 | Radix-2 Cooley-Tukey FFT (1024 pts, Hanning window, true freq bins) | ✅ Done |
| 2.3 | Jest unit tests for RMS module (33/33 passed) | ✅ Done |
| 2.4 | Precomputed twiddle factors table (zero Math.cos/sin per frame) | ✅ Done |
| 2.5 | Split-screen oscilloscope (live vs reference comparison) | ✅ Done |
| 2.6 | Glitch Heatmap (time × bands visualization) | ✅ Done |
| 2.7 | Multiple capture sources (Tab / Mic / Combined) | ✅ Done |
| 2.8 | Centralized config manager | ✅ Done |

---

## Sprint 3 — Done ✅

### Optimisation: logs, profiling, task tracking

| # | Задача | Статус |
|---|--------|--------|
| 3.1 | logger.js: default level → 'warn' (quiet production) | ✅ Done |
| 3.2 | Remove info/debug logs from background.js, offscreen.js, popup.js, audio-worklet.js | ✅ Done |
| 3.3 | Fix MAX_SAFE_LOGS → MAX_SAFE_SEND_LOGS bug (offscreen.js:42) | ✅ Done |
| 3.4 | DSP time: threshold-based logging (>5ms warn, >10ms error) | ✅ Done |
| 3.5 | Expand Perf Monitor: memory (window.performance.memory), alerts counter | ✅ Done |
| 3.6 | Perf alerts: FPS < 15, Draw > 30ms, Memory > 100MB (rate-limited 5s) | ✅ Done |
| 3.7 | Create TASKS.md for unified task tracking | ✅ Done |
| 3.8 | Update README.md Roadmap | ✅ Done |

---

## Backlog — Pending ⏳

| # | Задача | Статус | Приоритет |
|---|--------|--------|-----------|
| B.1 | Web MIDI export (popup blocked → needs background worker or standalone page) | ⏳ Blocked | Medium |
| B.2 | Testing on AI generators (Suno, Udio, ElevenLabs) | Later | Medium |
| B.3 | Connection latency measurement (ping popup↔background) | ✅ Done | Low |
| B.4 | Session export: capture session as JSON/WAV | ⏳ Pending | Low |
| B.5 | History viewer: replay past sessions from chrome.storage | ⏳ Pending | Low |
| B.6 | Offline mode: work without SW (graceful degradation) | ⏳ Pending | Low |

---

## Bugs

| # | Описание | Статус |
|---|----------|--------|
| Bug-1 | MAX_SAFE_LOGS undefined → ReferenceError (offscreen.js:42) | ✅ Fixed |
| Bug-2 | AudioWorklet console.log not using logger | ✅ Fixed |
| Bug-3 | `isPinned` ReferenceError — TDZ in content.js (let declared after handler usage) | ✅ Fixed |
| Bug-4 | Duplicate `fill(0)` calls in popup.js `stopAudioProcessing()` | ✅ Fixed |
| Bug-5 | `METRICS_THROTTLE_MS = 0` — unthrottled metrics at ~43fps | ✅ Fixed |

---

## Notes

- **Rate-limiting pattern**: Use `_safeSendLastLogged` timestamp + `PERF_ALERT_RATE_LIMIT_MS` for all periodic alerts
- **Memory API**: `window.performance.memory` is Chrome-only (not available in Firefox, incognito, or with small pages)
- **AudioWorklet isolation**: No `chrome.storage` available in AudioWorkletGlobalScope — logs fall back to in-memory
- **Current metrics**: RMS, peak, bass/mid/treble, highFreqAnomaly, entropy (4-band Shannon), flatness (Wiener), glitchState (3-state machine), waveform, **ZCR**, **HNR**, **spectralCentroid**, **spectralRolloff**, **onsetDetected**, **dynamicRange** (peak−rms dB), **glitchRate** (sliding 1s window), **bassMidRatio**, **midTrebleRatio** (inter-band dB ratios)
- **Audio chain**: MediaStream → [Compressor] → [HPF] → [LPF] → [Peaking] → [Delay] → [WaveShaper/Limiter] → GainNode → AudioWorkletNode('audio-analyzer') → destination (effects bypassed by default)
- **Effects chain**: Compressor, HPF (20Hz), LPF (22050Hz), Peaking (1kHz/0dB/Q=1), Delay (0s), WaveShaper — all created but bypassed (enabled=false). Control via `_SSA_SET_COMPRESSOR`, `_SSA_SET_LIMITER`, `_SSA_SET_EQ`, `_SSA_SET_DELAY` messages
- **Effects UI**: popup.html has Effects section with Compressor (threshold/ratio/knee/attack/release), EQ (HPF/LPF/Peaking), Limiter (threshold), Delay (time/feedback/mix). Toggles + sliders. Settings persisted in `ssa_effectsSettings` storage key
- **Effects routing**: Bypass path (source → bypassGainNode → masterGainNode → worklet) vs Effects chain (compressor → hpf → lpf → peaking → delay → waveShaper → effectGainNode → masterGainNode → worklet). masterGainNode.gain=0.5 normalizes +6dB dual-path summation (Sprint 5 fix)
- **Overlay modes**: `expanded` (default), `compact`, `sidebar`, `mini` — stored in `chrome.storage.local` under `'overlayMode'`
- **Overlay**: Single file (content.js), styles in OVERLAY_CSS constant, position persisted in chrome.storage.local, mini badge auto-hides after 30s
- **Popup vs Offscreen**: Both create independent media capture chains; offscreen is primary metrics source, popup is pass-through to speakers
- **Zero GC per frame**: All temporary buffers pre-allocated in constructor (combinedFFT, _hnrAutocorr, _prevFFT, _fluxHistory)
- **DSP budget**: HNR computed every 2nd frame to stay within 5ms threshold; all other metrics per-frame

---

## Sprint 4 — Done ✅

### C.3.10 Fix Effects routing & unit conversion bugs (compressor ms→s, delay ms→s/%→0-1, Limiter bypass, offscreen syntax error)

| # | Task | Status | Priority |
|---|------|--------|----------|
| C.3.10.1 | Compressor attack/release: popup sends ms, convert to seconds (ms / 1000) | ✅ Fixed | High |
| C.3.10.2 | Delay/feedback/mix: popup sends ms/%, offscreen converts to seconds/0-1 range | ✅ Fixed | High |
| C.3.10.3 | Limiter: removed _setEffectsActive call (shouldn't toggle routing, just changes curve) | ✅ Fixed | Medium |
| C.3.10.4 | Unified routing: sequential chain without toggle, all effects bypassed via params | ✅ Fixed | High |
| C.3.10.5 | Offscreen handlers _SSA_SET_*: unpack message.active as enabled | ✅ Fixed | High |
| C.3.10.6 | Fix syntax error in offscreen.js:188 (remove leftover Peaking/_setEffectsActive blocks after refactor) | ✅ Fixed | High |

### C.1: Overlay widget (permanent, non-collapsible, 4 modes)

| # | Task | Status | Priority |
|---|------|--------|----------|
| C.1.1 | Rewrite overlay architecture: remove collapse button, add 3 modes (compact/expanded/mini) | ✅ Done | High |
| C.1.2 | Add expanded metrics to overlay: glitchCount, entropy, flatness, RTT, audioDrops | ✅ Done | High |
| C.1.3 | Add overlay controls: Compact/Expanded/Mini toggle (⊞), Pin (📌) | ✅ Done | Medium |
| C.1.4 | Implement Mini Badge mode: 20px colored indicator, auto-hide 30s, click to expand | ✅ Done | Medium |
| C.1.5 | Integrate overlay metrics via overlayPort.onMessage (migrate from drawMiniBar to drawOverlayCanvas) | ✅ Done | High |
| C.1.6 | Add Sidebar mode: full-height left panel, reorganized metrics | ✅ Fixed | High |
| C.1.7 | Fix Pin button: actually locks overlay position (prevents drag) | ✅ Fixed | High |
| C.1.8 | Fix background.js metrics forwarding: add `type: 'METRICS'` to overlay messages | ✅ Fixed | Critical |
| C.1.9 | Fix chrome.tabs.sendMessage: replace .catch() with callback pattern | ✅ Fixed | Critical |

### C.2: Additional glitch metrics in AudioWorklet

| # | Task | Status | Priority |
|---|------|--------|----------|
| C.2.1 | Implement Spectral Centroid (weighted average frequency of spectrum) | ✅ Done | Medium |
| C.2.2 | Implement Spectral Rolloff (85% energy threshold frequency) | ✅ Done | Medium |
| C.2.3 | Implement Zero Crossing Rate (ZCR) for noise detection | ✅ Done | Medium |
| C.2.4 | Implement Harmonic-to-Noise Ratio (HNR) via autocorrelation | ✅ Done | High |
| C.2.5 | Implement Onset Detection (spectral flux) for transient detection | ✅ Done | Medium |
| C.2.6 | Implement RMS temporal statistics (mean/stdDev over 1s window) | ⏳ Deferred | Low |
| C.2.7 | Implement simplified Chroma Features + Chroma Entropy (12-bin pitch distribution) | ⏳ Deferred | Low |
| C.2.8 | Implement Dynamic Range (Peak-to-RMS in dB) | ✅ Done | Low |
| C.2.9 | Implement Glitch Rate (glitches/second with sliding window) | ✅ Done | Low |
| C.2.10 | Implement Inter-band Energy Ratios (HF/Mid, Bass/Mid, Spectral Imbalance) | ✅ Done | Low |
| C.2.11 | Add all new metrics (hnr, zcr, centroid, rolloff, onset) to METRICS payload + popup/overlay display | ✅ Done | High |

### C.3: WebAudio Effects chain

| # | Task | Status | Priority |
|---|------|--------|----------|
| C.3.1 | Redesign WebAudio graph: source → [effects] → gainNode → workletNode (all bypassed by default) | ✅ Done | High |
| C.3.2 | Implement CompressorNode with default settings (threshold, knee, ratio, attack, release) | ✅ Done | High |
| C.3.3 | Implement Limiter via WaveShaper (soft clipping, 4x oversample) | ✅ Done | High |
| C.3.4 | Implement Parametric EQ: Highpass, Lowpass, Peaking filters via BiquadFilter | ✅ Done | Medium |
| C.3.5 | Implement Delay effect via AudioWorkletProcessor (delayTime, feedback, mix parameters) | ✅ Done | Medium |
| C.3.6 | Add Effects UI to popup: toggle on/off, per-effect controls, preset profiles | ✅ Done | High |
| C.3.7 | Persist effects settings in chrome.storage.local via config.js | ✅ Done | Medium |
| C.3.8 | Add effects chain to offscreen.js capture path | ✅ Done | High |
| C.3.9 | Add effects chain to popup.js audio pass-through path | ✅ Done | Medium |

### C.4: Lightweight ML models for audio analysis

| # | Task | Status | Priority |
|---|------|--------|----------|
| C.4.1 | Research lightweight audio ML models suitable for Chrome Extension | ⏳ Deferred | Low |
| C.4.2 | Evaluate SpeechBrain/Whisper-tiny feasibility for on-device audio classification | ⏳ Deferred | Low |
| C.4.3 | Plan WebAssembly module integration for audio feature extraction | ⏳ Deferred | Low |
| C.4.4 | Prototype AI-generated audio detection model | ⏳ Deferred | Low |

---

## Sprint 5 — Done ✅

### Bug fixes from audit reports (C.1.7, C.2, C.3, C.5, C.7, P.2, P.3)

| # | Task | Status | Priority |
|---|------|--------|----------|
| C.1.7 | Fix `isPinned` ReferenceError (move `let isPinned` before mousedown handler to avoid TDZ) | ✅ Fixed | 🔴 Critical |
| C.2 | Remove duplicate `.fill(0)` in `stopAudioProcessing()` | ✅ Fixed | 🟡 High |
| C.3 | METRICS_THROTTLE_MS already set to 66 (was fixed in prior iteration) | ✅ Already fixed | 🟡 High |
| C.5 | Reconnect race condition already handled (listener removal before recreation) | ✅ Already fixed | 🟡 Medium |
| C.7 | Optimize notifyTabs: changed `chrome.tabs.query({})` to `{ active: true, currentWindow: true }` | ✅ Fixed | 🟡 Medium |
| P.2 | Add `masterGainNode` (gain=0.5) to compensate dual-path +6dB audio summation | ✅ Fixed | 🔺 Medium |
| P.3 | Commented out `popupMediaStreamSource.connect(destination)` to fix audio echo | ✅ Fixed | 🔺 Medium |

### Validation automation (new)

| # | Task | Status | Priority |
|---|------|--------|----------|
| A.1 | Create `scripts/validate.js` — 4 checks: tests, syntax, production logs, manifest | ✅ Done | ⚡ Low |
| A.2 | Create `scripts/lint-logs.js` — production logging linter | ✅ Done | ⚡ Low |
| A.3 | Update `package.json` with `validate`, `lint:logs`, `test:coverage`, `check:syntax` scripts | ✅ Done | ⚡ Low |
| A.4 | Fix all production logging: replaced 8x `console.warn()` with `log.info/warn/debug()` | ✅ Done | ⚡ Low |

---

## Sprint 6 — Planned 🔄

| # | Task | Status | Priority |
|---|------|--------|----------|
| T.1 | Add tests for coverage gaps (calculateBandEntropy, detectSpectralFlatness, calculateZCR, etc.) | ⏳ Ready | 🟡 Medium |
| A.5 | Create `.github/workflows/validate.yml` (GitHub Actions CI) | ⏳ Ready | ⚡ Low |
| B.4 | Session export: capture session as JSON/WAV | ⏳ Backlog | Low |
| B.5 | History viewer: replay past sessions from chrome.storage | ⏳ Backlog | Low |
