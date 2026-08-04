# Stream Sensation Analyzer

> Расширение Chrome (Manifest V3) для анализа аудиопотока в реальном времени и обнаружения аномалий генеративных аудиосистем.

**🚀 MVP Release v1.6.0** (2026-08-04) — AI Detection MVP complete. 826 unit tests, 56 E2E tests, 10 Sprint releases.

## Возможности

### Audio Capture & Analysis
| Модуль | Описание | Статус |
|--------|----------|--------|
| **Захват аудио** | `getDisplayMedia` в offscreen-документе | ✅ |
| **RMS + Peak** | Энергия сигнала в реальном времени | ✅ |
| **Спектральный анализ** | FFT-1024, Hanning window, 3 диапазона (Bass/Mid/Treble) | ✅ |
| **Stereo L/R** | Отдельные буферы и метрики для каждого канала | ✅ |
| **Multiple sources** | Tab Audio / Mic Audio / Tab + Mic | ✅ |

### AI Detection (MVP 🆕)
| Модуль | Описание | Статус |
|--------|----------|--------|
| **MFCC extraction** | 13 коэффициентов + temporal stats | ✅ |
| **aiScore** | Logistic Regression (88% accuracy on test set) | ✅ |

### Glitch Detection
| Модуль | Описание | Статус |
|--------|----------|--------|
| **Детектор глитча** | ВЧ-аномалии, state machine (STABLE→DRIFT→GLITCH), debounce | ✅ |
| **Glitch Timeline** | График состояния во времени | ✅ |
| **Glitch Heatmap** | Частота глитчей по_band_ам (X=time, Y=bands) | ✅ |
| **Sensation State** | Цветной индикатор: 🟢 STABLE / 🟠 DRIFT / 🔴 GLITCH | ✅ |

### DSP Metrics
| Модуль | Описание | Статус |
|--------|----------|--------|
| **Entropy + Flatness** | Шеннон энтропия, spectral flatness (Wiener) | ✅ |
| **Extended** | HNR, ZCR, Centroid, Rolloff, Onset, Dynamic Range, Band Ratios, Glitch Rate | ✅ |

### UI & Visualization
| Модуль | Описание | Статус |
|--------|----------|--------|
| **Осциллограф** | 2 канала L/R, Freeze/Zoom/LogScale/Clear | ✅ |
| **Overlay widget** | Draggable Canvas поверх страницы | ✅ |
| **Side Panel UI** | Chrome 114+ (popup deprecated) | ✅ |
| **Темы** | Dark / Light / Neon, автодетект системной темы | ✅ |
| **Performance Monitor** | FPS, Draw time, Memory, Alerts | ✅ |

### Effects Chain
| Модуль | Описание | Статус |
|--------|----------|--------|
| **Compressor** | threshold/ratio/knee/attack/release | ✅ |
| **Parametric EQ** | HPF / LPF / Peaking | ✅ |
| **Limiter** | WaveShaper soft clipping | ✅ |
| **Delay** | time/feedback/mix (AudioWorkletProcessor) | ✅ |

### Export & Logging
| Модуль | Описание | Статус |
|--------|----------|--------|
| **CSV Export** | Осциллограмма (1024 сэмпла, 2 канала) | ✅ |
| **JSON Log** | Глитчи FIFO (max 500 записей) | ✅ |
| **Centralized logging** | logger.js с level filtering | ✅ |

---

## Установка

1. Откройте Chrome и перейдите на страницу `chrome://extensions`
2. Включите **Режим разработчика** (Developer mode) в правом верхнем углу
3. Нажмите **\"Загрузить распакованное расширение\"** (Load unpacked)
4. Выберите папку `c:\analyzer`

---

## Использование

### Запуск захвата

1. Откройте страницу с аудиопотоком (YouTube, Spotify и т.д.)
2. Активируйте вкладку с воспроизведением звука
3. Нажмите на значок расширения в панели инструментов
4. Нажмите **"Start Capture"** в side panel

> **Примечание:** используется `getDisplayMedia` с `video: true, audio: true` — достаточно поделиться текущей вкладкой в диалоге системы захвата экрана.

### Управление

| Действие | Описание |
|----------|----------|
| **Start Capture** | Запуск захвата и анализа аудио через offscreen-документ |
| **Stop Capture** | Остановка захвата, очистка буферов |

### Интерфейс Side Panel

> **Примечание:** Popup устарел (deprecated). Side panel используется с версии 1.3.0. UI идентичен, но side panel не закрывается при клике вне области.

В side panel отображаются:
- **RMS Value** — текущая энергия сигнала с цветовой индикацией (SILENCE → CRITICAL)
- **Peak RMS** — пиковое значение RMS
- **RMS Level** — классификация уровня + процент
- **Frequency Bands** — распределение энергии по диапазонам (Bass / Mid / Treble) со сглаживанием
- **Channel Indicator** — MONO / STEREO статус входа (зелёный = stereo, серый = mono)
- **Glitch Sensitivity** — слайдер настройки порога детектора (60–90%, persist в storage)
- **Glitch State** — индикатор состояния: STABLE (зелёный) / DRIFT (оранжевый) / GLITCH (красный) + счётчик
- **Entropy & Flatness** — спектральная энтропия и плоскостность с классификацией
- **Осциллограф** — визуализация волны в реальном времени (2 канала L/R, Canvas)
  - **Freeze** — блокировка обновления
  - **Zoom** — масштабирование 256 сэмплов
  - **Log Scale** — логарифмическая шкала
  - **Clear** — очистка буферов + сброс freeze
- **Glitch Timeline** — график RMS и состояния глитч-детектора во времени
- **Glitch Heatmap** — визуализация частоты глитчей по частотным полосам (X=time, Y=bands, color=intensity)
- **Capture Source** — выбор источника: Tab Audio / Mic Audio / Tab + Mic
- **Export CSV** — сохранение данных осциллограммы в CSV
- **Export Log** — сохранение лога глитчей в JSON (до 500 записей)
- **Theme Toggle** — переключение тёмной/светлой темы (dark/light/neon)
- **Performance Monitor** — FPS, Draw time, Latency, DSP time, Drops, Memory, Alerts
- **Audio Effects** — Compressor (threshold/ratio/knee/attack/release), Parametric EQ (HPF/LPF/Peaking), Limiter (threshold), Delay (time/feedback/mix) — toggle + 13 sliders
- **Extended Metrics** — HNR, ZCR, Spectral Centroid/Rolloff, Onset, Dynamic Range, Band Ratios, Glitch Rate
- **AI Score** — 0-100 индикатор AI-генерации (color-coded: cyan/yellow/red)
- **Logs Panel** — Filter (all/error/warn/info/debug), Clear, Export, Real-time streaming

---

## Проверка работы

1. Откройте страницу с аудиопотоком (YouTube, Spotify и т.д.)
2. Активируйте вкладку с воспроизведением звука
3. Нажмите на значок расширения → **Start Capture**
4. В диалоге захвата экрана отметьте **"Share tab audio"**

### Что проверить

| Метрика | Ожидание |
|---------|----------|
| **RMS Value** | Меняется в зависимости от громкости аудио (0.0 — 1.0) |
| **Frequency Bands** | Сумма Bass + Mid + Treble ≈ 100% |
| **Осциллограф** | Отображает форму волны в реальном времени (2 канала L/R) |
| **Entropy / Flatness** | Voice: entropy < 1.0, flatness низкий → STABLE |
| **Channel Indicator** | STEREO для многоканального ввода, MONO для одноканального |
| **Overlay widget** | Появляется поверх страницы при активном захвате |
| **Glitch Timeline** | Отображает RMS и состояние (STABLE/DRIFT/GLITCH) во времени |
| **AI Score** | 0-100: низкий = естественный звук, высокий = возможная AI-генерация |

---

## Структура проекта

```
.
├── manifest.json              # Конфигурация расширения (MV3)
├── background.js              # Service worker (обработка сообщений, relay popup ↔ offscreen)
├── offscreen.js               # Offscreen document (persistent audio capture)
├── content.js                 # Shadow DOM overlay widget (content script)
├── logger.js                  # Centralized logging system
├── README.md                  # Этот файл
│
├── popup/
│   ├── popup.html             # Side Panel UI (popup deprecated)
│   ├── popup.css              # Тема (dark/light/neon), стили элементов
│   ├── popup.js               # Логика side panel (захват, обработка, визуализация, theme, sensitivity)
│   ├── popup-testable.js      # Pure functions: themes, validation, message builders
│   └── config.js              # Settings persistence
│
├── dsp-engine/
│   ├── audio-worklet.js       # AudioWorklet processor (FFT, RMS, глитч-детектор, stereo)
│   ├── delay-processor.js     # Delay effect AudioWorkletProcessor
│   ├── rms.js                 # Класс RMS (статические методы: classifyLevel, rmsToPercentage)
│   ├── midi-export.js         # MIDI CC mapping (stub)
│   ├── defensive-processors.js # Safe DSP implementations
│   └── tests/                 # DSP unit tests (FFT, bands, metrics, RMS, MIDI)
│
├── tests/
│   ├── unit/                  # Unit tests (Vitest)
│   │   ├── popup/             # popup-api.spec.js (33 tests)
│   │   ├── background/        # api-fault-injection.spec.js, ring-buffer.spec.js
│   │   ├── content/           # context-invalidated.spec.js, style-isolation.spec.js
│   │   ├── dsp/               # advanced-stress-tests.spec.js, silence-detection.spec.js
│   │   └── utils/             # logger.spec.js
│   └── e2e/                   # E2E tests (Playwright)
│       ├── ssa-e2e.spec.js
│       ├── ssa-cdp.spec.js
│       └── metrics-validation.spec.js
│
├── scripts/
│   ├── validate.js            # Validation suite (5 checks)
│   ├── lint-logs.js           # Production logging linter
│   └── scheduler/             # Auto-analysis pipeline
│       ├── run-all.js
│       ├── analyze-results.js
│       ├── generate-tasks.js
│       ├── reports/
│       └── history/
│
├── GIGACODE.md                # Project instructions for GigaCode
├── TASKS.md                   # Task tracking (Sprint 1-8)
├── package.json               # NPM scripts (14 commands)
├── vitest.config.js           # Vitest + coverage config
├── playwright.config.js       # Playwright E2E config
└── .github/workflows/
    └── validate.yml           # CI pipeline (validate + scheduler)
```

---

## Архитектура

> **Note:** Popup deprecated (Sprint 9 migration). Side panel is the primary UI.

```
┌─────────────────────────────────────────────────────────┐
│               Веб-страница (YouTube, Spotify...)        │
│                                                         │
│  [Audio Element] ──► navigator.mediaDevices.getDisplayMedia() │
│                             │                           │
└─────────────────────────────┼───────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   MediaStream       │
                    │   (audio track)     │
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────┐
              │     offscreen.js              │
              │  persistent capture context   │
              │  ┌─────────────────────────┐  │
              │  │  AudioWorkletNode       │  │
              │  │  ┌───────────────────┐  │  │
              │  │  │ DSP Engine        │  │  │
              │  │  │ • RMS + Peak RMS  │  │  │
               │  │  │ • FFT 1024 pts → 512 bins │  │  │
              │  │  │ • Bands (B/M/T)   │  │  │
              │  │  │ • Stereo L/R      │  │  │
              │  │  │ • Glitch Detector │  │  │
              │  │  │ • Entropy + Flat  │  │  │
              │  │  │ • HNR, ZCR, Centroid│  │  │
              │  │  └───────────────────┘  │  │
              │  └─────────────────────────┘  │
              │         │                     │
              │         ▼ port.postMessage()  │
              └─────────┬─────────────────────┘
                        │ chrome.runtime.sendMessage
                        │ (_OFFSCREEN_METRICS)
              ┌─────────▼──────────┐
              │  background.js     │
              │  Service Worker    │
              │  relay popup ↔ offscreen │
              │  popupPort.onMessage   │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Side Panel        │
              │  (popup.js)        │
              │  • Metrics display │
              │  • Canvas rendering│
              │  • Effects controls│
              │  • Oscilloscope    │
              └────────────────────┘
```

---

## Технические детали

### DSP Engine (`dsp-engine/audio-worklet.js`)

| Метод | Описание |
|-------|----------|
| `calculateRMS(buffer)` | Средняя квадратичная энергия сигнала + пик |
| `calculateFFT(buffer)` | Radix-2 Cooley-Tukey FFT (1024 точки) → 512 магнитудных бинов (Nyquist), Hanning window |
| `calculateFrequencyBands(fftData)` | Разложение на Bass (0–220 Гц), Mid (220–4400 Гц), Treble (4.4–22 кГц) по реальным Hz-границам, усреднение по бинам |
| `detectHighFrequencyAnomaly(fftData)` | Отношение энергии ВЧ (>8 кГц) к общей энергии — Hz-based порог |
| `checkGlitchState(rms, highFreqRatio)` | State machine: STABLE → DRIFT → GLITCH (debounce, consecutive frames) |
| `calculateBandEntropy(fftData)` | Энтропия Шеннона по 4 спектральным полосам (Bass/Voice/Speech/Noise) |
| `detectSpectralFlatness(fftData)` | Spectral flatness (geometric/arithmetic mean ratio) |
| `processChannelFrame(ch)` | Обработка фрейма одного канала (L или R), сохраняет waveform и frame data |
| `process(inputs, outputs, parameters)` | Главный цикл AudioWorklet: буферизация по каналам, обработка, отправка метрик |
| `processFrame()` | Объединение L/R данных, отправка payload через port.postMessage |

### Параметры детектора глитча

| Параметр | Значение | Описание |
|----------|----------|----------|
| `highFreqThreshold` | 0.85 (настраивается 0.60–0.90) | Порог ВЧ-энергии |
| `minTotalEnergy` | 0.04 | Минимальная энергия (игнорировать тишину) |
| `debounceTimeout` | 800 мс | Задержка между срабатываниями |
| `driftThreshold` | 0.70 | Порог DRIFT |
| `requiredConsecutiveFrames` | 2 | Требуемые кадры аномалии подряд |

### Sensation State (State Machine)

| Состояние | Цвет | Описание |
|-----------|------|----------|
| **STABLE** | 🟢 зелёный | Нормальная работа, энергия ниже DRIFT-порога |
| **DRIFT** | 🟠 оранжевый | Повышенная ВЧ-энергия (между driftThreshold и highFreqThreshold) |
| **GLITCH** | 🔴 красный | Аномальная ВЧ-энергия (> highFreqThreshold, 2+ кадров подряд, debounce) |

### Entropy Classification

| Метрика | Значение | Интерпретация |
|---------|----------|---------------|
| **Entropy < 1.0, Flatness < 0.4** | STABLE | Тональный сигнал (речь/музыка) |
| **Entropy 1.0–1.5 или Flatness > 0.6** | DRIFT | Смешанный сигнал |
| **Entropy > 1.5, Flatness > 0.4** | GLITCH | Шумоподобный сигнал (AI-генерация) |

### RMS классификация

| Уровень | Диапазон | Цвет |
|---------|----------|------|
| SILENCE | < 0.01 | `#ff6b6b` (красный) |
| LOW | 0.01 – 0.1 | `#ffa94d` (оранжевый) |
| MEDIUM | 0.1 – 0.3 | `#95df6c` (зелёный) |
| HIGH | 0.3 – 0.7 | `#3ac7a3` (бирюзовый) |
| CRITICAL | > 0.7 | `#d9363e` (тёмно-красный) |

### Ограничения текущей версии

- ✅ Настройка чувствительности глитч-детектора через UI (слайдер 60–90%, persist)
- ✅ Экспорт лога глитчей в JSON (FIFO, max 500 записей)
- ✅ Экспорт осциллограммы в CSV (1024 сэмпла, 2 канала)
- ✅ Визуальный индикатор Sensation State (STABLE / DRIFT / GLITCH)
- ✅ Спектральная энтропия + spectral flatness
- ✅ AI Detection MVP (Logistic Regression, 88% accuracy)
- ✅ Overlay widget поверх страницы (draggable, position persistent)
- ✅ Side Panel UI (не закрывается при клике вне)
- ⚠️ При добавлении/изменении permissions в manifest.json нужно **полностью удалить** расширение (`chrome://extensions` → 🗑️) и загрузить заново. Простое "перезагрузить" не обновит permissions.
- ⚠️ Аудиопоток не воспроизводится (только анализ) — во избежание обратной связи
- ⚠️ beforeunload race condition: STOP_CAPTURE может не дойти при резком закрытии side panel (mitigated via setTimeout fallback)
- ⚠️ Service Worker termination: capture может прерваться после 30s–5min idle (mitigated via keepalive alarm)
- ⚠️ AI Score — rule-based + lightweight ML (не production-grade detector, нужен v2 с expanded training data)

### Troubleshooting: Overlay widget

| Проблема | Решение |
|----------|----------|
| Overlay не появляется | Убедитесь, что активная вкладка имеет воспроизводимый контент; проверьте консоль DevTools |
| Overlay не перетаскивается | Убедитесь, что не кликаете на кнопки collapse/close (только за body) |
| Overlay скрывается при scroll | Overlay использует `position: fixed` — не должен скрываться; если проблема — проверьте z-index конфликты |
| Overlay дублируется | Закройте все вкладки с расширением; откройте одну — overlay создаётся один раз |

---

## Решение проблем

| Проблема | Решение |
|----------|----------|
| `Tab capture error: Access denied` | Убедитесь, что расширение вызвано из side panel; вкладка активна; на ней воспроизводится звук |
| `Permission denied` | Перезагрузите расширение на `chrome://extensions` |
| Нет данных в консоли | Убедитесь, что нажата кнопка **"Start Capture"** в side panel |
| AudioWorklet не загружается | Проверьте консоль на ошибки загрузки модуля; убедитесь, что `dsp-engine/audio-worklet.js` существует |
| Метрики не отображаются | Откройте DevTools → Console, проверьте ошибки подключения side panel ↔ background ↔ offscreen |

---

## Changelog

### v1.6.0-MVP (2026-08-04) — 🚀 AI Detection MVP Release

**AI Detection Pipeline:**
- ✅ MFCC extraction (13 coefficients) в AudioWorklet с temporal stats (mean/stddev over 100-frame window)
- ✅ `aiScore` (0-100) — Logistic Regression с SGD (1000 epochs, ~88% test accuracy)
- ✅ 17-фича вектор: MFCC[0:4] + MFCC_std[0:4] + highFreqAnomaly + ZCR + entropy + flatness + HNR + onset
- ✅ UI: color-coded score bar (cyan/yellow/red) в popup, "AI:" метрика в overlay
- ✅ JS inference engine (`ai-detector.js`) — zero dependencies, bundle weights (`ai-model-weights.json`)
- ✅ Python training script (`scripts/ml/train_ai_detector.py`) — numpy-free
- ✅ 34 новых unit теста (15 MFCC + 19 AI detector)

**Infrastructure:**
- ✅ 826 unit tests (24 файла), 56 E2E Playwright тестов
- ✅ Coverage: ~93.7%
- ✅ Scheduler pipeline: Health Score 100/100 EXCELLENT
- ✅ Chrome Extension API validator (41 вызовов, 40% coverage)

**Sprint Releases Summary:**
- Sprint 1-6: Core DSP, FFT, overlay, effects, validation
- Sprint 7: Scheduler & Test Agent
- Sprint 8: Chrome Extension API Tests (58 тестов)
- Sprint 9: Vector Expansion (coverage + E2E hardening + docs)
- Sprint 10: AI Detection MVP

---

### v1.5.0 (2026-08-02) — Scheduler, API Tests, Side Panel Migration

**Scheduler Pipeline (Sprint 7):**
- ✅ `scripts/scheduler/run-all.js` — orchestrator (tests, syntax, lint, coverage)
- ✅ `scripts/scheduler/analyze-results.js` — agent analysis (health scoring 0-100)
- ✅ `scripts/scheduler/generate-tasks.js` — task generator (auto-updates TASKS.md)
- ✅ GitHub Actions CI: daily cron + PR validation (2-job pipeline)
- ✅ Health Score: 100/100 EXCELLENT

**Extension API Tests (Sprint 8):**
- ✅ `tests/unit/popup/popup-api.spec.js` (33 tests) — message builders, validation, themes
- ✅ `popup/popup-testable.js` — extracted pure functions (11 functions)
- ✅ `tests/unit/background/api-fault-injection.spec.js` (20 tests) — MV3 fault injection
- ✅ `tests/unit/dsp/advanced-stress-tests.spec.js` (15 tests) — DSP stress tests
- ✅ `tests/unit/content/context-invalidated.spec.js` (23 tests) — context invalidation
- ✅ `scripts/validate.js` — Chrome API call detector (no deprecated API calls)

**Side Panel Migration:**
- ✅ `manifest.json` — action removed, side_panel configured
- ✅ Side panel only (popup deprecated)
- ✅ Delay metrics freeze fix — analysis tap independent of wet/dry crossfade

**Tests:** 330 total (319 unit + 11 e2e), Coverage: 93.7%

### v1.4.0 (2026-07-29) — Validation, Logging, Effects Chain

**Новые фичи:**
- ✅ **Glitch Heatmap** — Canvas visualisation glitch frequency over time
  - X-axis: time (last ~10 seconds, 50 slots)
  - Y-axis: frequency bands (Bass, Mid, Treble)
  - Color: intensity (blue=low → yellow=mid → red=high)
  - Auto-boosts during GLITCH state
  - Auto-reset on stop capture

- ✅ **Multiple capture sources** — 3 modes via dropdown:
  - **Tab Audio** — захват звука активной вкладки (default)
  - **Mic Audio** — захват микрофона пользователя
  - **Tab + Mic** — комбинация: tab audio + microphone (смешиваются)

- ✅ **Centralized config manager** (popup/config.js)
  - All settings stored in chrome.storage.local
  - Default values with fallback
  - API: loadSettings(), saveSetting(), getSettings(), resetSettings()
  - Keys: theme, glitchSensitivity, oscOptions, captureSource, heatmapEnabled, perfMonitorVisible

**Улучшения:**
- ✅ Capture source persisted in storage
- ✅ Heatmap enabled by default
- ✅ offscreen.js supports getUserMedia + getDisplayMedia
- ✅ background.js forwards captureSource to offscreen

### v1.1.1 (2026-07-29) — Web MIDI Export (stub)

**Новые фичи:**
- ✅ midi-export.js: модуль для маппинга метрик на MIDI CC (как библиотека)
- ⚠️ Web MIDI API блокируется Chrome в popup-документе (popup → new tab workaround)

### v1.1.0 (2026-07-29) — Настоящий FFT

**Radix-2 Cooley-Tukey FFT (1024 точки):**
- ✅ Реальная FFT вместо наивного "chopped FFT" (энергетическое биннирование)
- ✅ O(N log N) ≈ 10 240 операций vs O(N²) ≈ 1 048 576 для DFT — **в ~100x быстрее**
- ✅ 512 частотных бинов (Nyquist = 22 050 Гц, 1 бин ≈ 43.07 Гц)
- ✅ Hanning window: `w[n] = 0.5 * (1 - cos(2πn/N))` — устранение spectral leakage
- ✅ Bit-reversal permutation (precomputed) — оптимизация
- ✅ True magnitude spectrum: `|X[k]| = sqrt(re² + im²)` с нормализацией
- ✅ DC bin корректная нормализация (×0.5, не ×2 как mirrored)

**Корректные частотные диапазоны (Hz-based bin mapping):**
- ✅ `bin[k] = k × sampleRate / FFT_SIZE` — точный Hz → бин
- ✅ Bass: 0–220 Гц → бины 0–5 (было: "бин 0" в naive ~344 Гц)
- ✅ Mid: 220–4400 Гц → бины 6–102 (было: "бины 1–12")
- ✅ Treble: 4400–22050 Гц → бины 103–511 (было: "бины 13–63")
- ✅ High-Frequency Anomaly: >8000 Гц вместо "top 25% бинов"

**Энтропия и flatness:**
- ✅ Band entropy: 4 полосы по реальным Hz (Bass 0–350, Voice 350–2000, Speech 2000–6000, Noise 6000–Nyquist)
- ✅ Spectral flatness: geometric/arithmetic mean на истинной power spectrum

**Визуализация:**
- ✅ Downsample 512→64 bins (avg pooling) для popup — без потери точности

**Баг-фиксы:**
- ✅ Spectral leakage eliminated (Hanning window)
- ✅ Frequency band mapping corrected (true FFT bins, not time-sequential chunks)

### v1.0.0 (2026-07-28)

**Новые фичи:**
- ✅ Полноценная стерео-обработка: раздельные L/R буферы, метрики, осциллограф
- ✅ Stereo-разделение каналов в AudioWorklet (dual buffer, per-channel FFT/RMS)
- ✅ Overlay widget: draggable Canvas поверх страницы с position persistence
- ✅ Осциллограф: Freeze, Zoom, Log Scale, Clear
- ✅ Performance Monitor: FPS, Draw time, Queue length
- ✅ Тёмная/светлая тема с auto-detect системной темы
- ✅ Waveform throttle (~10 Hz) для снижения нагрузки
- ✅ Spectral entropy + spectral flatness для классификации сигнала
- ✅ Glitch sensitivity slider (60–90%) с real-time обновлением
- ✅ Error handling: graceful degradation при отмене захвата, SW termination, connection loss
- ✅ Keepalive alarm для предотвращения sleep Service Worker

**Улучшения:**
- ✅ Optimized timeline rendering (batched color segments)
- ✅ Buffer pooling (combinedFFT pre-allocated)
- ✅ Float32Array вместо Array.from (zero GC pressure)
- ✅ rAF throttle для Canvas (30fps cap)
- ✅ Listener leak fix (named handler + removeListener)
- ✅ beforeunload race condition mitigation (setTimeout fallback)
- ✅ MONO/STEREO flickering fix (channel count detection)

**Удалено:**
- ✅ Debug console.log (production-ready)

---

## Roadmap

Полный список задач с деталями: [TASKS.md](TASKS.md)

> **Все спринты завершены:** 10 релизов, MVP v1.6.0 (AI Detection) complete

### Sprint 1-5
- Все задачи выполнены — см. [TASKS.md](TASKS.md)

### Sprint 6
- Все задачи выполнены — см. [TASKS.md](TASKS.md)

### Sprint 7 — Scheduler & Test Agent ✅
- Полный scheduler pipeline (orchestrator, agent analysis, task generation)
- GitHub Actions CI: daily cron + PR validation
- Health Score: 100/100 EXCELLENT

### Sprint 8 — Chrome Extension API Tests ✅
- 58 новых unit тестов (popup-api, fault-injection, stress-tests, context-invalidated)
- popup-testable.js extracted pure functions
- Chrome API call detector (validate.js)

### Sprint 9 — Vector Expansion ✅
- ✅ Coverage expansion: 4 → 8+ файлов
- ✅ E2E hardening: 11 → 56 тестов (Playwright UI)
- ✅ Documentation refresh (README, GIGACODE, TASKS)
- ✅ Coverage 93.7%, Health Score 100/100

### Sprint 10 — AI Detection MVP ✅ 🚀
- ✅ MFCC extraction + temporal stats
- ✅ Logistic Regression AI Detection (88% accuracy)
- ✅ JS inference engine (zero dependencies)
- ✅ 34 новых unit теста
- ✅ **MVP Release v1.6.0**

### Post-MVP Backlog
- ⏳ Web MIDI export (blocked — popup API limitation)
- ⏳ Session export (JSON/WAV)
- ⏳ History viewer (replay past sessions)
- ⏳ AI Detection v2: retraining pipeline, expanded training data
- ⏳ Offline mode (graceful degradation without Service Worker)

---

## Ссылки

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

**Версия:** 1.6.0-MVP  |  **Дата:** 2026-08-04  |  **Статус:** 🚀 AI Detection MVP Complete (826 unit tests, 56 E2E)
