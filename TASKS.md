# Tasks — Stream Sensation Analyzer

Единый трекинг задач проекта. Подробнее в [README.md](README.md).

> **🚀 MVP Release v1.6.0** (2026-08-04): AI Detection MVP complete. 826 unit tests, 56 E2E tests. Full project status below.

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
| 2.3 | Vitest unit tests for RMS module (33/33 passed) | ✅ Done |
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

### P0 — High Priority
| # | Задача | Статус | Приоритет |
|---|--------|--------|-----------|
| B.1 | Web MIDI export (side panel → needs background worker or standalone page) | ⏳ Blocked | Medium |

### P1 — Medium Priority
| # | Задача | Статус | Приоритет |
|---|--------|--------|-----------|
| B.2 | Testing on AI generators (Suno, Udio, ElevenLabs) | ⏳ Deferred | Medium |

### P2 — Low Priority
| # | Задача | Статус | Приоритет |
|---|--------|--------|-----------|
| B.3 | Post-MVP: AI Detection v2 (ML classifier retraining pipeline) | ⏳ Pending | Low |
| B.4 | Session export: capture session as JSON/WAV | ⏳ Pending | Low |
| B.5 | History viewer: replay past sessions from chrome.storage | ⏳ Pending | Low |
| B.6 | Offline mode: work without SW (graceful degradation) | ⏳ Pending | Low |

---

## Bugs — Fixed ✅

| # | Описание | Статус |
|---|----------|--------|
| Bug-1 | MAX_SAFE_LOGS undefined → ReferenceError (offscreen.js:42) | ✅ Fixed |
| Bug-2 | AudioWorklet console.log not using logger | ✅ Fixed |
| Bug-3 | `isPinned` ReferenceError — TDZ in content.js | ✅ Fixed |
| Bug-4 | Duplicate `fill(0)` calls in `stopAudioProcessing()` | ✅ Fixed |
| Bug-5 | `METRICS_THROTTLE_MS = 0` — unthrottled metrics | ✅ Fixed |
| Bug-6 | `targetTab` invalid in MV3 `getMediaStreamId()` | ✅ Fixed |
| Bug-NEW | `chrome.tabCapture.getMediaId()` — method doesn't exist | ✅ Fixed |

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

## Sprint 6 — Done ✅

| # | Task | Status | Priority |
|---|------|--------|----------|
| T.1 | Add tests for coverage gaps (calculateBandEntropy, detectSpectralFlatness, calculateZCR, etc.) | ✅ Done | 🟡 Medium |
| A.5 | Create `.github/workflows/validate.yml` (GitHub Actions CI) | ✅ Done | ⚡ Low |
| B.4 | Session export: capture session as JSON/WAV | ⏳ Backlog | Low |
| B.5 | History viewer: replay past sessions from chrome.storage | ⏳ Backlog | Low |

---

## Sprint 7 — Scheduler & Test Agent 🆕

| # | Task | Status | Priority |
|---|------|--------|----------|
| S.1 | Create `scripts/scheduler/` directory structure | ✅ Done | ⚡ High |
| S.2 | Implement `run-all.js` orchestrator ( Jest, syntax, linting, coverage) | ✅ Done | ⚡ High |
| S.3 | Implement `analyze-results.js` agent (test failure diagnosis, coverage analysis, regression detection) | ✅ Done | ⚡ High |
| S.4 | Implement `generate-tasks.js` task generator (auto-update TASKS.md) | ✅ Done | ⚡ High |
| S.5 | Create GitHub Actions CI workflow `.github/workflows/validate.yml` | ✅ Done | ⚡ High |
| S.6 | Create Windows scheduler scripts (`launch-scheduler.bat`, `schedule-creator.bat`) | ✅ Done | 🟡 Medium |
| S.7 | Update `package.json` with scheduler scripts | ✅ Done | ⚡ High |
| S.8 | Configure health score thresholds and priority rules | ✅ Done | 🟡 Medium |

---

## Scheduler — Commands Reference

### Full pipeline
```bash
npm run scheduler:all          # Run all checks + agent analysis
```

### Step-by-step
```bash
npm run scheduler:run          # Run orchestrator only
npm run scheduler:analyze      # Analyze last report
npm run scheduler:generate     # Generate tasks from recommendations
```

### Quick checks
```bash
npm run scheduler:quick        # Syntax + tests only (fast)
```

### Reports location
```
scripts/scheduler/reports/last-run.json      # Full run report
scripts/scheduler/reports/agent-report.json  # Agent analysis
scripts/scheduler/reports/last-run.md        # Markdown summary
```

---

## Sprint 8 — Chrome Extension API Tests 🆕

| # | Task | Status | Priority |
|---|------|--------|----------|
| A.0 | Fix Bug-NEW: remove invalid `chrome.tabCapture.getMediaId()` call (popup.js → only `captureSource`, no `tabStreamId`) | ✅ Fixed | 🔴 Critical |
| A.1 | Create `tests/unit/popup/popup-api.spec.js` (pure function tests for messages, validation, themes) | ✅ Done | 🔴 Critical |
| A.2 | Create `popup/popup-testable.js` (extracted pure functions: themes, validation, message builders) | ✅ Done | 🟠 High |
| A.3 | Add `tests/popup/**/*.spec.js` to `vitest.config.js` include patterns | ✅ Done | 🟡 Medium |
| A.4 | Update `scripts/validate.js` — `checkApiCalls()` already detects `targetTab` (no violations) | ✅ Verified | 🟡 Medium |
| A.5 | CI pipeline `.github/workflows/validate.yml` runs `checkApiCalls()` on every PR | ✅ Verified | 🟡 Medium |
| A.6 | Test background.js API calls (optional) | ⏳ Backlog | ⚡ Low |

### Coverage Gap Analysis (Updated)

| Файл | Chrome API вызовов | Покрыто тестами | Статус |
|------|-------------------|-----------------|--------|
| popup.js | 28 | 🔶 Частично (чистые функции через popup-testable.js) | 🟡 Средне |
| config.js | 8 | ✅ `loadSettings/saveSetting` тестированы косвенно | 🟢 Хорошo |
| background.js | 15 | ⏳ Нет прямых тестов | ⚠️ Средне |
| content.js | 6 | ✅ `style-isolation.spec.js` (3 теста) | 🟢 Хорошо |
| **Всего** | **41** | **~30% (чистые функции покрыты)** | **🟡 В процессе** |

### Исправленные баги Chrome API

- **Bug-NEW `getMediaId()`** (2 августа 2026): `chrome.tabCapture.getMediaId()` — метод не существует в Chrome API. Удалён из `popup.js:1862`, `tabStreamId` больше не передаётся в `START_CAPTURE` → `background.js` → `offscreen.js`. Захват работает через `getDisplayMedia` (offscreen.js).
- **Bug-6 `targetTab`** (31 июля 2026): `chrome.tabCapture.getMediaStreamId({ targetTab: null, ... })` — параметр невалиден в MV3. `validate.js` содержит regex-детектор (строка 189). В коде больше не встречается.

### Извлечённые чистые функции (popup-testable.js)

- `THEME_COLORS` — палитры тем (dark/light/neon)
- `getThemeColors(themeName)` — получить палитру по имени
- `getThemeColor(theme, category, key)` — получить конкретный цвет
- `isValidCaptureSource(value)` — валидация источника захвата
- `isValidOverlayMode(value)` — валидация режима оверлея
- `buildStartCaptureMessage(captureSource)` — построить payload для START_CAPTURE
- `buildStopCaptureMessage()` — построить payload для STOP_CAPTURE
- `buildRequestStatusMessage()` — построить payload для REQUEST_STATUS
- `buildRequestMetricsMessage()` — построить payload для REQUEST_METRICS
- `buildOverlayMessage(action)` — построить payload для SHOW/HIDE оверлея
- `STORAGE_KEYS` — константы ключей хранилища

### Advanced Defect Detection — D Series (2 августа 2026)

#### D1+D2: DSP Stress Tests (`tests/unit/dsp/advanced-stress-tests.spec.js`, 15 тестов)

- **D1 — Undefined/Missing Samples**: Тестирование обработки `undefined` значений в `Float32Array`, пустых channel buffers, missing channels (1 channel вместо 2), rapid alternation undefined/clean frames
- **D2 — Channel Switching**: Переключение mono↔stereo mid-session, rapid alternation (40 фреймов), recovery после channel drop, simultaneous channel drop + NaN corruption
- **D3 — Mixed Corruption** (бонус): Комбинация NaN + Infinity + undefined в одном буфере, multi-channel partial corruption, 100 consecutive frames mixed corruption, edge case stress scenario (10 сценариев × 5 репитаций)

Все метрики проходят строгую валидацию: `expect(Number.isFinite(metrics.rms)).toBe(true)`, `process()` всегда возвращает `true`.

#### D4: MV3 Fault Injection (`tests/unit/background/api-fault-injection.spec.js`, 20 тестов)

- **API error propagation**: `chrome.runtime.lastError` (Permission denied, Tabs not available, Scripting not allowed), offscreen document creation failure
- **Port disconnect**: popupPort disconnect, overlayPort disconnect, disconnect event during active metrics, sequential disconnections, postMessage on disconnected port
- **Tab capture failure**: `getMediaStreamId` rejection, empty string return, null return, `get()` rejection, graceful degradation
- **Sequential errors & recovery**: Error storms (50 operations), chained failures (tabCapture → sendMessage → port post), lastError in onAlarm callback

#### D5: Extension Context Invalidation (`tests/unit/content/context-invalidated.spec.js`, 23 теста)

- **Error event detection**: Listener registration, "Extension context invalidated" message matching, `chrome.runtime.id` falsy checks, false positive prevention
- **Overlay cleanup**: Hide overlay, remove style element, null element handling, miniBadgeEl cleanup
- **Chrome runtime id scenarios**: undefined, empty string, `chrome.runtime` missing entirely
- **Multiple invalidation events**: Rapid-fire (10 событий), mixed error types (5 invalidation + 5 regular)
- **Edge cases**: Element without remove() method, `getElementById` throwing, `overlayEl.remove` throwing, all DOM elements null
- **Extension update scenarios**: DOM operations after update, context invalidation detection, dual detection paths validation

#### Обновлённый статус покрытия (Updated)

| Файл | Chrome API вызовов | Покрыто тестами | Статус |
|------|-------------------|-----------------|--------|
| popup.js | 28 | 🔶 Частично (чистые функции) | 🟡 Средне |
| config.js | 8 | ✅ Косвенно | 🟢 Хорошо |
| background.js | 15 | ✅ MV3 fault injection (20 тестов) | 🟢 Хорошо |
| content.js | 6 | ✅ Style isolation + context invalidation (26 тестов) | 🟢 Хорошо |
| **Всего** | **41** | **~40% (чистые функции + fault injection)** | **🟢 Хорошо** |

**Всего новых тестов в Sprint 8: 58** (popup-api: 33, advanced-stress-tests: 15, api-fault-injection: 20, context-invalidated: 23)

---

## Sprint 9 — Vector Expansion 🆕

### V1: Coverage Expansion

| # | Task | Status | Priority |
|---|------|--------|----------|
| V1.1 | Remove logger.js from coverage exclude (tests already exist, 12 tests) | ✅ Done | 🔴 Critical |
| V1.2 | Extract + test `createLimiterCurve()` from offscreen.js | ✅ Done | 🟠 High |
| V1.3 | Extend popup-testable.js tests (33 → 94 tests ✅) | ✅ Done | 🟠 High |
| V1.4 | Extract `openSessionDB()` logic → unit tests | ✅ Done | 🟡 Medium |

### V2: E2E Hardening (Playwright UI Tests) ✅

| # | Task | Status | Priority |
|---|------|--------|----------|
| V2.1 | `tests/e2e/ui-interactions.spec.js` (14 → 16 P0 tests: theme, capture, canvas, effects) | ✅ Done | 🔴 Critical |
| V2.2 | `tests/e2e/features.spec.js` (15 → 22 P1 tests: sources, glitch state, export, logs) | ✅ Done | 🟠 High |
| V2.3 | `tests/e2e/edge-cases.spec.js` (7 P2 tests: metrics display, rapid clicks) | ✅ Done | 🟡 Medium |
| **Total E2E** | **11 → 56 tests** | | |

### V3: Documentation Refresh

| # | Task | Status | Priority |
|---|------|--------|----------|
| V3.1 | GIGACODE.md: Jest → Vitest (3 locations) | ✅ Done | 🔴 Critical |
| V3.2 | GIGACODE.md: Updated directory structure, architecture diagram | ✅ Done | 🟠 High |
| V3.3 | GIGACODE.md: Test directory conventions updated | ✅ Done | 🟠 High |
| V3.4 | GIGACODE.md: Running Tests section updated | ✅ Done | 🟠 High |
| V3.5 | GIGACODE.md: Constraints updated (no popup, Vitest only) | ✅ Done | 🟠 High |
| V3.6 | README.md: Sprint 3 → Sprint 8 references | ✅ Done | 🔴 Critical |
| V3.7 | README.md: Architecture diagram updated (side panel) | ✅ Done | 🟠 High |
| V3.8 | README.md: Project structure complete (all files) | ✅ Done | 🟠 High |
| V3.9 | README.md: Changelog v1.4.0, v1.5.0 added | ✅ Done | 🟠 High |
| V3.10 | README.md: Roadmap updated, limitations fixed | ✅ Done | 🟡 Medium |
| V3.11 | TASKS.md: Sprint 6 → Done, Sprint 9 added | ✅ Done | 🟠 High |

### Sprint 9 Summary

| Category | Completed | Tests Added |
|----------|-----------|-------------|
| V1: Coverage Expansion | 4/4 ✅ | 94 popup-api + 22 session-db + 12 logger = **128 unit tests** |
| V2: E2E Hardening | 3/3 ✅ | **56 E2E tests** (11 → 56) |
| V3: Documentation | 11/11 ✅ | N/A |
| **Total Sprint 9** | **18/18** | **184 new tests + docs** |

### Sprint 10 — AI Detection MVP 🆕 ✅

> **MVP Release v1.6.0** — 2026-08-04

| # | Task | Status | Tests | Priority |
|---|------|--------|-------|----------|
| V4.1 | MFCC extraction (13 coefficients) in audio-worklet.js | ✅ Done | — | 🔴 High |
| V4.2 | Temporal stats (mean/stddev over 100-frame window) | ✅ Done | — | 🟠 High |
| V4.3 | Rule-based aiScore computation (0-100) | ✅ Done | — | 🟡 Medium |
| V4.4 | UI display: overlay + popup + aiScore bar | ✅ Done | — | 🟡 Medium |
| V4.5 | Python ML model training (Logistic Regression, SGD) | ✅ Done | — | 🔴 High |
| V4.6 | Bundle model weights + JS inference engine + tests | ✅ Done | +19 | 🟡 Medium |

**Summary:**
- **New files**: `ai-detector.js` (JS inference), `ai-model-weights.json` (model weights), `train_ai_detector.py` (training)
- **Tests**: +34 unit tests (15 MFCC + 19 AI detector)
- **Features**: 17-dimensional feature vector (MFCC[0:4] + MFCC_std[0:4] + highFreqAnomaly + ZCR + entropy + flatness + HNR + onset)
- **Pipeline**: FFT → Mel filter bank → Log → DCT → MFCC → temporal stats → aiScore
- **Model**: Logistic Regression with SGD (1000 epochs, ~88% test accuracy)
- **UI**: Color-coded score bar (cyan/yellow/red) in popup, "AI:" metric in overlay

---

## Sprint Summary

| Sprint | Focus | Tasks | Tests Added |
|--------|-------|-------|-------------|
| 1 | Overlay widget, Performance, Oscilloscope options | 6 | — |
| 2 | FFT, RMS tests, Heatmap, Capture sources | 7 | 33 |
| 3 | Logging, Profiling, Task tracking | 8 | — |
| 4 | Effects routing, Extended DSP metrics, Overlay modes | 30+ | — |
| 5 | Bug fixes, Validation automation | 7 | — |
| 6 | Coverage gaps, CI pipeline | 2 | — |
| 7 | Scheduler & Test Agent | 8 | — |
| 8 | Chrome Extension API Tests | 7 | 58 |
| 9 | Vector Expansion (coverage, E2E, docs) | 18 | 184 |
| 10 | AI Detection MVP | 6 | 34 |
| **Total** | | **8 sprint releases** | **314+ tests** |

---

## Final Project Stats

| Metric | Value |
|--------|-------|
| **Unit Tests** | 826 total (across 24 test files) |
| **E2E Tests** | 56 Playwright tests |
| **Coverage** | ~93.7% (current target) |
| **Files Tested** | popup.js, config.js, background.js, content.js, audio-worklet.js, offscreen.js, + 15 more |
| **Chrome APIs** | 41 calls tracked, ~40% covered (pure functions + fault injection) |
| **DSP Metrics** | RMS, Peak, Bands (B/M/T), HF Anomaly, Entropy, Flatness, Glitch State, Waveform, ZCR, HNR, Centroid, Rolloff, Onset, Dynamic Range, Glitch Rate, Band Ratios, MFCC(13), aiScore |
| **Audio Effects** | Compressor, Limiter, HPF, LPF, Peaking EQ, Delay (all bypassed by default) |

---

## Backlog — Pending ⏳
