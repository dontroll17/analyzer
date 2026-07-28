# Stream Sensation Analyzer

> Расширение Chrome (Manifest V3) для анализа аудиопотока в реальном времени и обнаружения аномалий генеративных аудиосистем.

## Возможности

| Модуль | Описание | Статус |
|--------|----------|--------|
| **Захват аудио** | Перехват звука активной вкладки через `getDisplayMedia` в offscreen-документе | ✅ Реализовано |
| **RMS анализ** | Расчёт энергии сигнала в реальном времени через AudioWorklet | ✅ Реализовано |
| **Пиковый RMS** | Отслеживание пикового значения RMS | ✅ Реализовано |
| **Спектральный анализ** | Radix-2 Cooley-Tukey FFT (1024 точки, 512 бинов Nyquist, Hanning window) → 3 частотных диапазона | ✅ Реализовано |
| **Детектор глитча** | Обнаружение ВЧ-аномалий с state machine, debounce и счётчиком | ✅ Реализовано |
| **Осциллограф** | Визуализация волны в реальном времени (2 канала L/R, Canvas) | ✅ Реализовано |
| **Glitch Timeline** | Canvas-график состояния глитч-детектора во времени | ✅ Реализовано |
| **Экспорт данных** | Сохранение осциллограммы в CSV (1024 сэмпла, 2 канала) | ✅ Реализовано |
| **Чувствительность** | Настройка порогов детектора глитча через UI (слайдер 60–90%, persist в storage) | ✅ Реализовано |
| **Экспорт лога** | Сохранение лога глитчей в JSON (FIFO, max 500 записей) | ✅ Реализовано |
| **Sensation State** | Визуальный индикатор (STABLE / DRIFT / GLITCH) с цветным кружком | ✅ Реализовано |
| **Спектральная энтропия** | Анализ равномерности распределения энергии по 4 спектральным полосам | ✅ Реализовано |
| **Спектральная плоскостность** | Detection spectral flatness —区分 тонального и шумоподобного сигнала | ✅ Реализовано |
| **Stereo разделение** | Отдельные L/R буферы, метрики и осциллограф для каждого канала | ✅ Реализовано |
| **Тёмная/светлая тема** | CSS custom properties, persist в storage, автодетект системной темы | ✅ Реализовано |
| **Waveform throttle** | Передача waveform с частотой ~10 Hz для снижения нагрузки | ✅ Реализовано |
| **Осциллограф: Freeze** | Блокировка обновления осциллографа (toggle) | ✅ Реализовано |
| **Осциллограф: Zoom** | Масштабирование 256 сэмплов (toggle) | ✅ Реализовано |
| **Осциллограф: Log Scale** | Логарифмическая шкала Y-axis (toggle) | ✅ Реализовано |
| **Осциллограф: Clear** | Очистка буферов + сброс freeze | ✅ Реализовано |
| **Overlay widget** | Draggable Canvas поверх страницы (content.js), position persistence | ✅ Реализовано |
| **Performance Monitor** | FPS, Draw time, Queue length (toggle) | ✅ Реализовано |

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
4. Нажмите **\"Start Capture\"** в popup-окне

> **Примечание:** используется `getDisplayMedia` с `video: true, audio: true` — достаточно поделиться текущей вкладкой в диалоге системы захвата экрана.

### Управление

| Действие | Описание |
|----------|----------|
| **Start Capture** | Запуск захвата и анализа аудио через offscreen-документ |
| **Stop Capture** | Остановка захвата, очистка буферов |

### Интерфейс popup

В popup отображаются:
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
- **Export CSV** — сохранение данных осциллограммы в CSV
- **Export Log** — сохранение лога глитчей в JSON (до 500 записей)
- **Theme Toggle** — переключение тёмной/светлой темы
- **Performance Monitor** — FPS, Draw time, Queue length

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

---

## Структура проекта

```
.
├── manifest.json              # Конфигурация расширения (MV3)
├── background.js              # Service worker (обработка сообщений, relay popup ↔ offscreen)
├── offscreen.js               # Offscreen document (persistent audio capture)
├── README.md                  # Этот файл
│
├── dsp-engine/
│   ├── audio-worklet.js       # AudioWorklet processor (FFT, RMS, глитч-детектор, stereo)
│   └── rms.js                 # Класс RMS (статические методы: classifyLevel, rmsToPercentage)
│
└── popup/
    ├── popup.html             # UI popup-окна (RMS, частотные полосы, осциллограф, timeline)
    ├── popup.css              # Тема (dark/light), стили элементов
    └── popup.js               # Логика popup (захват, обработка, визуализация, theme, sensitivity)
```

---

## Архитектура

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
              │  popup.js          │
              │  Dual-path metrics │
              │  • Direct (popup AudioContext)
              │  • Offscreen (bg relay)
              │  UI: RMS, Bands, Oscilloscope,
              │  Timeline, Entropy, Theme
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
- ✅ Overlay widget поверх страницы (draggable, collapsible, position persistent)
- ⚠️ Аудиопоток не воспроизводится (только анализ) — во избежание обратной связи
- ⚠️ Popup закрывается при клике вне его области (ограничение Chrome)
- ⚠️ beforeunload race condition: STOP_CAPTURE может не дойти при резком закрытии popup (mitigated via setTimeout fallback)
- ⚠️ Service Worker termination: capture может прерваться после 30s–5min idle (mitigated via keepalive alarm)

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
| `Tab capture error: Access denied` | Убедитесь, что расширение вызвано из popup; вкладка активна; на ней воспроизводится звук |
| `Permission denied` | Перезагрузите расширение на `chrome://extensions` |
| Нет данных в консоли | Убедитесь, что нажата кнопка \"Start Capture\" |
| AudioWorklet не загружается | Проверьте консель на ошибки загрузки модуля; убедитесь, что `dsp-engine/audio-worklet.js` существует |
| Метрики не отображаются | Откройте DevTools → Console, проверьте ошибки подключения popup ↔ background ↔ offscreen |

---

---

## Changelog

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

### Sprint 1 (Настоящий план)
- [x] Этап 0: README + Tech debt cleanup (deduplication applyMetrics, listener leak fix, beforeunload race, var→const/let)
- [x] Этап 1: Overlay widget (content script, draggable Canvas, position persistence)
- [x] Этап 2: Performance (rAF throttle, Array.from → Float32Array, buffer pooling)
- [x] Этап 3: Oscilloscope options (Freeze, Zoom, Log scale, Clear)
- [x] Версия 1.0: Error handling, keepalive, documentation, stereo support

### Sprint 2 (Будущее)
- [x] Radix-2 Cooley-Tukey FFT (1024 pts, Hanning window, true freq bins)
- [ ] Тестирование на AI-генераторах (Suno, Udio, ElevenLabs)
- [ ] Сравнение захватов (Split screen oscilloscope)
- [ ] Web MIDI / API экспорт

---

## Ссылки

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

**Версия:** 1.1.0  |  **Дата:** 2026-07-29  |  **Статус:** Radix-2 FFT (Sprint 2)
