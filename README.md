# Stream Sensation Analyzer

> Расширение Chrome (Manifest V3) для анализа аудиопотока в реальном времени и обнаружения аномалий генеративных аудиосистем.

## Возможности

| Модуль | Описание | Статус |
|--------|----------|--------|
| **Захват аудио** | Перехват звука активной вкладки через `getDisplayMedia` в offscreen-документе | ✅ Реализовано |
| **RMS анализ** | Расчёт энергии сигнала в реальном времени через AudioWorklet | ✅ Реализовано |
| **Пиковый RMS** | Отслеживание пикового значения RMS | ✅ Реализовано |
| **Спектральный анализ** | FFT с разбиением на 3 частотных диапазона (Bass / Mid / Treble) | ✅ Реализовано |
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
- **Channel Indicator** — MONO / STERO статус входа
- **Glitch Sensitivity** — слайдер настройки порога детектора (60–90%, persist в storage)
- **Glitch State** — индикатор состояния: STABLE (зелёный) / DRIFT (оранжевый) / GLITCH (красный) + счётчик
- **Entropy & Flatness** — спектральная энтропия и плоскостность с классификацией
- **Осциллограф** — визуализация волны в реальном времени (2 канала L/R, Canvas)
- **Glitch Timeline** — график RMS и состояния глитч-детектора во времени
- **Export CSV** — сохранение данных осциллограммы в CSV
- **Export Log** — сохранение лога глитчей в JSON (до 500 записей)
- **Theme Toggle** — переключение тёмной/светлой темы

---

## Проверка работы

1. Откройте **DevTools** (F12 → Console) на странице с аудио
2. Запустите захват из popup
3. Ожидаемые логи:

```
[AudioWorklet] Sensitivity updated: 0.85
```

### Что проверить

| Метрика | Ожидание |
|---------|----------|
| **RMS Value** | Меняется в зависимости от громкости аудио (0.0 — 1.0) |
| **Frequency Bands** | Сумма Bass + Mid + Treble ≈ 100% |
| **Осциллограф** | Отображает форму волны в реальном времени (2 канала) |
| **Entropy / Flatness** | Voice: entropy < 1.0, flatness низкий → STABLE |
| **Channel Indicator** | STEREO для многоканального ввода, MONO для одноканального |

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
              │  │  │ • FFT (64 bins)   │  │  │
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
| `calculateFFT(buffer, numBins)` | Энергетический спектр с заданным количеством бинов (64) |
| `calculateFrequencyBands(fftData)` | Разложение на Bass (0–220 Гц), Mid (220–4400 Гц), Treble (4.4–22 кГц) с усреднением по бинам |
| `detectHighFrequencyAnomaly(fftData)` | Отношение энергии ВЧ (верхняя четверть спектра) к общей энергии |
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
- ❌ Нет overlay-виджета поверх страницы (контент-скрипт)
- ⚠️ Аудиопоток не воспроизводится (только анализ) — во избежание обратной связи
- ⚠️ Popup закрывается при клике вне его области (ограничение Chrome)
- ⚠️ beforeunload race condition: STOP_CAPTURE может не дойти при резком закрытии popup

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

## Roadmap

### Sprint 1 (Настоящий план)
- [x] Этап 0: README + Tech debt cleanup (deduplication applyMetrics, listener leak fix, beforeunload race, var→const/let)
- [x] Этап 1: Overlay widget (content script, draggable Canvas, position persistence)
- [x] Этап 2: Performance (rAF throttle, Array.from → Float32Array, buffer pooling)
- [ ] Этап 3: Oscilloscope options (Freeze, Zoom, Log scale)

### Sprint 2 (Будущее)
- [ ] Тестирование на AI-генераторах (Suno, Udio, ElevenLabs)
- [ ] WebAssembly-оптимизация FFT
- [ ] Сравнение захватов (Split screen oscilloscope)
- [ ] Web MIDI / API экспорт

---

## Ссылки

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

**Версия:** 1.0.0  |  **Дата:** 2026-07-28  |  **Статус:** Этап 0 (Tech debt cleanup)
