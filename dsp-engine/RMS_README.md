# RMS Calculator (Root Mean Square)

## Overview

RMS (Root Mean Square) - это математическая метрика для расчета средней энергии/громкости аудиосигнала. Реализована как отдельный модуль в `dsp-engine/rms.js`.

## Формула

```
RMS = sqrt(Σ(x_i²) / n)
```

Где:
- `x_i` - отсчеты аудиосигнала
- `n` - количество отсчетов

## Файлы

| Файл | Описание |
|------|----------|
| `rms.js` | Основной модуль класса RMS |
| `rms-test.js` | Тесты и примеры использования |
| `audio-worklet.js` | Использование RMS в AudioWorklet |

## API

### Класс RMS

#### `calculate(buffer)`

Рассчитывает RMS значение из аудио буфера.

```javascript
const rms = new RMS();
const value = rms.calculate(buffer); // 0.0 - 1.0
```

**Параметры:**
- `buffer` (Float32Array|number[]) - аудио отсчеты

**Возвращает:**number - RMS значение (0.0-1.0 для нормализованного аудио)

#### `calculateSliding(buffer, windowSize)`

Расчет RMS с скользящим окном для скользящего среднего.

```javascript
const rms = new RMS();
const value = rms.calculateSliding(buffer, 1024);
```

**Параметры:**
- `buffer` (Float32Array|number[]) - аудио отсчеты
- `windowSize` (number) - размер окна в отсчетах (по умолчанию 1024)

**Возвращает:**number - RMS значение

#### `calculateDBFS(buffer)`

Расчет RMS в децибелах относительно полной шкалы (dBFS).

```javascript
const rms = new RMS();
const dbfs = rms.calculateDBFS(buffer); // отрицательные значения
```

**Параметры:**
- `buffer` (Float32Array|number[]) - аудио отсчеты

**Возвращает:**number - RMS значение в dBFS (от -100 до 0)

#### `reset()`

Сброс статистики.

```javascript
rms.reset();
```

#### `getCumulativeRMS()`

Получить кумулятивное RMS значение.

```javascript
const cumulative = rms.getCumulativeRMS();
```

### Статические методы

#### `RMS.calculateStatic(buffer)`

Утилита для одноразового расчета RMS.

```javascript
const rmsValue = RMS.calculateStatic(buffer);
```

#### `RMS.rmsToPercentage(rmsValue)`

Конвертация RMS в проценты (0-100).

```javascript
const percentage = RMS.rmsToPercentage(0.5); // 50%
```

#### `RMS.classifyLevel(rmsValue)`

Классификация уровня RMS.

```javascript
const level = RMS.classifyLevel(0.707); // 'HIGH'
```

**Возвращает:** string - один из:
- `'SILENCE'` - тишина (RMS < 0.01)
- `'LOW'` - низкая энергия (0.01-0.1)
- `'MEDIUM'` - средняя энергия (0.1-0.3)
- `'HIGH'` - высокая энергия (0.3-0.7)
- `'CRITICAL'` - критическая энергия (RMS > 0.7)

## Использование в AudioWorklet

В `audio-worklet.js` используется инлайн-версия функции RMS (AudioWorklet не поддерживает ES6 импорты):

```javascript
class AudioAnalyzer extends AudioWorkletProcessor {
  calculateRMS(buffer) {
    let sum = 0;
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      const sample = buffer[i];
      sum += sample * sample;
    }
    return Math.sqrt(sum / length);
  }
  
  processFrame() {
    const rms = this.calculateRMS(this.inputBuffer);
    this.port.postMessage({ type: 'METRICS', rms: rms });
  }
}
```

## Примеры тестирования

Запустить тесты можно в браузере или Node.js:

```bash
# В браузере
# Открыть rms-test.js в консоли DevTools

# В Node.js
node rms-test.js
```

### Примеры вывода тестов

```
Test 1: Silence (all zeros)
  Expected: 0, Got: 0.000000
  Classification: SILENCE
  dBFS: -100.00 dB

Test 4: Sine wave (theoretical RMS ≈ 0.707)
  Expected: ~0.707, Got: 0.707107
  Classification: HIGH
```

## Интеграция с проектом

### 1. В background.js (основной скрипт)

```javascript
import RMS from './dsp-engine/rms.js';

// Использование для анализа аудио
const rms = new RMS();
const rmsValue = rms.calculate(audioBuffer);
console.log('RMS:', rmsValue);
console.log('Level:', RMS.classifyLevel(rmsValue));
```

### 2. В Popup UI

```javascript
// Настройка порогов чувствительности
const sensitivityThresholds = {
  low: 0.01,   // тишина
  medium: 0.1, // низкая энергия
  high: 0.5    // высокая энергия
};

// Классификация входящего RMS
function classifyAudioState(rmsValue) {
  if (rmsValue < sensitivityThresholds.low) {
    return 'SILENCE';
  } else if (rmsValue < sensitivityThresholds.medium) {
    return 'LOW';
  } else if (rmsValue < sensitivityThresholds.high) {
    return 'MEDIUM';
  } else {
    return 'HIGH';
  }
}
```

## Производительность

- Расчет RMS: O(n) по количеству отсчетов
- Память: O(1) - не требует дополнительной памяти
- Подходит для обработки в реальном времени (AudioWorklet)

## Связанные метрики

RMS используется совместно с другими DSP метриками:

1. **FFT Analysis** - спектральный анализ (частотные диапазоны)
2. **Spectral Entropy** - энтропия спектра
3. **High Frequency Anomaly** - детектор ВЧ глитчей

## Литература

- [Root Mean Square - Wikipedia](https://en.wikipedia.org/wiki/Root_mean_square)
- [dBFS - Wikipedia](https://en.wikipedia.org/wiki/DBFS)
- Web Audio API Specification
