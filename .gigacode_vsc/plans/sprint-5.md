# Sprint 5 — Bug Fixes & Validation Automation

## Goal
Исправить критические и важные баги из аудитов (C.1.7, C.2, C.3, C.5, C.7, P.2, P.3) + создать CI-валидацию через `scripts/validate.js` для предотвращения регрессий.

## Duration
Start: 2026-07-30 | End: 2026-07-30 (1 day)

## Context
После Sprint 4 реализован основной функционал. Осталось 8+ багов из аудитов, один из которых критический (C.1.7 `isPinned` ReferenceError ломает overlay). Также отсутствует автоматическая валидация — нет скрипта для проверки перед коммитом.

---

## Tasks

| # | ID | Задача | Файл | Agent | Приоритет | Оценка |
|---|----|--------|------|-------|-----------|--------|
| 1 | C.1.7 | Fix `isPinned` ReferenceError | content.js | chrome-extension-dev | 🔴 Critical | 5m |
| 2 | C.2 | Remove duplicate `.fill(0)` | popup.js | chrome-extension-dev | 🟡 High | 5m |
| 3 | C.3 | Fix METRICS_THROTTLE_MS | popup.js | chrome-extension-dev | 🟡 High | 10m |
| 4 | P.3 | Remove popup audio leak | popup.js | chrome-extension-dev | 🔺 Medium | 5m |
| 5 | C.5 | Fix reconnect race condition | popup.js | chrome-extension-dev | 🟡 Medium | 20m |
| 6 | C.7 | Optimize notifyTabs → active tab only | background.js | chrome-extension-dev | 🟡 Medium | 15m |
| 7 | P.2 | Add masterGainNode for audio doubling | offscreen.js | dsp-audio-analyst | 🔺 Medium | 20m |
| 8 | A.1 | Create scripts/validate.js | scripts/validate.js | chrome-extension-dev | ⚡ Low | 30m |
| 9 | A.2 | Update package.json with validate scripts | package.json | chrome-extension-dev | ⚡ Low | 10m |
| 10 | T.1 | Add tests for new coverage gaps | tests/ | extension-tester | 🟡 Medium | 45m |

**Total estimated time:** ~165 min (~2.7 hours)

---

## Implementation Steps

### Task 1: Fix `isPinned` ReferenceError (C.1.7)
**Files:** content.js
**Problem:** `isPinned` объявлен через `let` на строке ~730, но используется на строке ~680 в mousedown handler. `let` не hoisted → ReferenceError при первом клике на overlay.

**Steps:**
1. Найти объявление `let isPinned = false;` в `injectOverlay()`
2. Переместить объявление в начало функции `injectOverlay()`, до создания обработчиков событий
3. Убедиться, что mousedown handler и pinBtn handler оба видят `isPinned`

**Validation:**
- [ ] `node --check content.js` passes
- [ ] Manual: overlay draggable и pin button работают без ошибок в консоли
- [ ] Нет ReferenceError в devtools

### Task 2: Remove duplicate `.fill(0)` (C.2)
**Files:** popup.js
**Problem:** `leftChannelHistory.fill(0)` и `rightChannelHistory.fill(0)` вызываются дважды подряд в `stopAudioProcessing()`.

**Steps:**
1. Найти дублирующиеся `.fill(0)` вызовы в popup.js
2. Удалить дубликат (оставить один набор)
3. Удалить comment "CRITICAL: Clear all buffers to prevent memory leaks" если он относится к дубликату

**Validation:**
- [ ] `node --check popup.js` passes
- [ ] `npm test` passes
- [ ] Manual: stop/start audio processing работает корректно

### Task 3: Fix METRICS_THROTTLE_MS (C.3)
**Files:** popup.js
**Problem:** `METRICS_THROTTLE_MS = 0` → throttle disabled, metrics processed every frame (43fps). Should be ~15fps.

**Steps:**
1. Найти `METRICS_THROTTLE_MS = 0` в popup.js
2. Изменить на `METRICS_THROTTLE_MS = 66` (~15fps)
3. Обновить comment

**Validation:**
- [ ] `node --check popup.js` passes
- [ ] Metrics updates visible at ~15fps, not every frame
- [ ] No performance regression

### Task 4: Remove popup audio leak (P.3)
**Files:** popup.js
**Problem:** `popupMediaStreamSource.connect(popupAudioContext.destination)` causes user to hear audio twice (original content + popup AudioContext).

**Steps:**
1. Найти строку `popupMediaStreamSource.connect(popupAudioContext.destination)` в popup.js
2. Закомментировать с объяснением: звук уже воспроизводится браузером через оригинальный контент

**Validation:**
- [ ] `node --check popup.js` passes
- [ ] Manual: no echo when popup is open
- [ ] Audio analysis still works in popup

### Task 5: Fix reconnect race condition (C.5)
**Files:** popup.js
**Problem:** При быстром disconnect/connect старый `bgPort` listener может остаться. `bgMetricsHandler` создаётся заново, но старый listener не удалён.

**Steps:**
1. Найти `ensureBackgroundPort()` в popup.js
2. Перед созданием нового `bgMetricsHandler` явно удалить старый listener:
   ```js
   if (bgPort && bgMetricsHandler) {
     bgPort.onMessage.removeListener(bgMetricsHandler);
   }
   ```
3. Также удалить listener на `bgPortDisconnectHandler` перед recreation

**Validation:**
- [ ] `node --check popup.js` passes
- [ ] Manual: rapid disconnect/connect doesn't cause memory leak
- [ ] No duplicate message handlers

### Task 6: Optimize notifyTabs (C.7)
**Files:** background.js
**Problem:** `START_CAPTURE` отправляет `_SSA_SHOW_OVERLAY` ВСЕМ вкладкам (10-50+ сообщений). `STOP_CAPTURE` — только active tab.

**Steps:**
1. Найти код `chrome.tabs.query({}, (tabs) => { ... chrome.tabs.sendMessage(...) })` в background.js
2. Заменить на query только active tab или с URL filter:
   ```js
   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
     if (tabs[0]) {
       chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_SHOW_OVERLAY' }, () => {});
     }
   });
   ```

**Validation:**
- [ ] `node --check background.js` passes
- [ ] Manual: overlay shows only on active tab during capture
- [ ] No excessive messages in background console

### Task 7: Add masterGainNode for audio doubling (P.2)
**Files:** offscreen.js
**Problem:** Dual-path routing (bypassGain + effectsGain) sums identical signals → +6dB gain → potential clipping.

**Steps:**
1. В `startCapture()` создать `masterGainNode` с `gain.value = 0.5`
2. Подключить: bypassGain → masterGain, effectGain → masterGain, masterGain → workletNode
3. Добавить cleanup для masterGain в `cleanup()`

**Validation:**
- [ ] `node --check offscreen.js` passes
- [ ] Manual: audio quality preserved, no clipping at high levels
- [ ] Audio level normalized compared to before

### Task 8: Create scripts/validate.js (A.1)
**Files:** scripts/validate.js
**Already created.** Steps:
1. Test `node scripts/validate.js` manually
2. Verify all 4 checks work: tests, syntax, logs, manifest
3. Fix any issues found during testing

**Validation:**
- [ ] `node scripts/validate.js` runs without errors
- [ ] All checks execute properly
- [ ] Exit code 0 when all pass, 1 when any fail

### Task 9: Update package.json (A.2)
**Files:** package.json
**Already updated.** Steps:
1. Verify npm scripts added correctly
2. Test `npm run validate`
3. Test `npm run test:coverage`

**Validation:**
- [ ] `npm run validate` works
- [ ] `npm run test:coverage` works
- [ ] `npm run lint:logs` works

### Task 10: Add tests for coverage gaps (T.1)
**Files:** tests/dsp-engine/tests/audio-worklet.test.js (or new test files)
**Uncovered functions (из C.15 audit):**
- `calculateBandEntropy`
- `detectSpectralFlatness`
- `calculateZCR`
- `calculateSpectralCentroid`
- `calculateSpectralRolloff`
- `checkGlitchState`

**Steps:**
1. Read dsp-engine/tests/audio-worklet.test.js to understand existing patterns
2. Add tests for each uncovered function
3. Target: 80% line coverage for dsp-engine/

**Validation:**
- [ ] `npm test` passes
- [ ] `npm run test:coverage` shows improved coverage
- [ ] All new tests use same patterns as existing tests

---

## Dependencies
- Task 1 (C.1.7) can run independently
- Tasks 2, 3, 4, 5 all modify popup.js — should be done sequentially
- Task 6 modifies background.js — independent
- Task 7 modifies offscreen.js — independent
- Tasks 8, 9 (automation) can run in parallel with bug fixes
- Task 10 (tests) should run after all bug fixes

---

## Risks
1. **Audio chain changes (P.2)** may affect audio quality
   - Mitigation: Manual testing with various audio sources before commit
2. **METRICS_THROTTLE_MS change** may affect overlay smoothness
   - Mitigation: Test at 66ms, 50ms, 33ms — pick best
3. **notifyTabs optimization** may hide overlay on wrong tab
   - Mitigation: Verify behavior with multiple tabs open
4. **Reconnect fix** may break existing port behavior
   - Mitigation: Test rapid tab switch scenarios

---

## Rollback Plan
1. Если что-то пошло не так после задачи: `git diff HEAD` для review, затем `git checkout -- <file>`
2. После серии неудач: `git revert HEAD` — откат последнего коммита
3. Audio changes: если качество ухудшилось, вернуть старый audio chain (без masterGainNode)

---

## Review Checklist
- [ ] All tests pass (`npm test`)
- [ ] No production logging violations (`npm run validate`)
- [ ] TASKS.md updated
- [ ] Commit message descriptive
- [ ] Manual testing performed (audio analysis, overlay, popup)
- [ ] Plan status updated
