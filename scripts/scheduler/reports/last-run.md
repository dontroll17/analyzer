# Scheduler Report

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-08-03T00:04:43.955Z |
| **Duration** | 33727.0s |
| **Overall** | FAIL |

## Results Summary

| Check | Status | Duration |
|-------|--------|----------|
| ❌ Unit Tests | FAIL | 11066.0s |
| ✅ Syntax Check | PASS | 74.0s |
| ✅ Production Log Lint | PASS | 502.0s |
| ❌ Full Validation Suite | FAIL | 10707.0s |
| ❌ Coverage Report | FAIL | 11372.0s |

## Coverage

| Metric | Value |
|--------|-------|
| Statements | N/A% |
| Functions | N/A% |
| Lines | N/A% |
| Branches | N/A% |

## Details

### Unit Tests

```
Command failed: npm test
```

### Full Validation Suite

```
Command failed: node scripts/validate.js
```

### Coverage Report

```

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90mC:/analyzer[39m
      [2mCoverage enabled with [22m[33mv8[39m

 [32m✓[39m tests/unit/dsp/silence-detection.spec.js [2m([22m[2m14 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/frequency-bands.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/dsp/effects-engine.spec.js [2m([22m[2m32 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/popup/popup-api.spec.js [2m([22m[2m95 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/defensive-processors.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 220[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/audio-worklet.test.js [2m([22m[2m114 tests[22m[2m)[22m[33m 302[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/limiter.test.js [2m([22m[2m23 tests[22m[2m)[22m[33m 460[2mms[22m[39m
 [32m✓[39m tests/unit/dsp/advanced-stress-tests.spec.js [2m([22m[2m15 tests[22m[2m)[22m[33m 480[2mms[22m[39m
 [32m✓[39m tests/unit/background/api-fault-injection.spec.js [2m([22m[2m18 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/midi-export.test.js [2m([22m[2m28 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/utils/logger.spec.js [2m([22m[2m12 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/content/style-isolation.spec.js [2m([22m[2m3 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/dsp/ai-detector.spec.js [2m([22m[2m19 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/dsp/session-db.spec.js [2m([22m[2m28 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/rms.test.js [2m([22m[2m33 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/content/context-invalidated.spec.js [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/background/ring-buffer.spec.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/sample-rate-sync.spec.js [2m([22m[2m16 tests[22m[2m)[22m[33m 6609[2mms[22m[39m
   [33m[2m✓[22m[39m Sample Rate Sync — DC Blocker Validation[2m &gt; [22mSample Rate Mismatch Scenarios[2m &gt; [22mshould maintain stable output for long signals [33m 6543[2mms[22m[39m

[2m Test Files [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m18 passed[39m[22m[90m (20)[39m
[2m      Tests [22m [1m[32m487 passed[39m[22m[90m (487)[39m
[2m   Start at [22m 03:04:34
[2m   Duration [22m 9.03s[2m (transform 435ms, setup 673ms, collect 1.16s, tests 8.41s, environment 29.94s, prepare 5.92s)[22m


```

