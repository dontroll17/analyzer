# Scheduler Report

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-08-02T16:30:19.834Z |
| **Duration** | 26929.0s |
| **Overall** | FAIL |

## Results Summary

| Check | Status | Duration |
|-------|--------|----------|
| ✅ Unit Tests | PASS | 9029.0s |
| ✅ Syntax Check | PASS | 66.0s |
| ✅ Production Log Lint | PASS | 451.0s |
| ✅ Full Validation Suite | PASS | 8606.0s |
| ❌ Coverage Report | FAIL | 8773.0s |

## Coverage

| Metric | Value |
|--------|-------|
| Statements | N/A% |
| Functions | N/A% |
| Lines | N/A% |
| Branches | N/A% |

## Details

### Coverage Report

```
 [32m✓[39m dsp-engine/tests/audio-worklet.test.js [2m([22m[2m99 tests[22m[2m)[22m[32m 163[2mms[22m[39m
 [32m✓[39m tests/unit/dsp/advanced-stress-tests.spec.js [2m([22m[2m15 tests[22m[2m)[22m[33m 336[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/limiter.test.js [2m([22m[2m23 tests[22m[2m)[22m[33m 347[2mms[22m[39m
 [32m✓[39m tests/unit/content/style-isolation.spec.js [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/utils/logger.spec.js [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/rms.test.js [2m([22m[2m33 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/background/ring-buffer.spec.js [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m dsp-engine/tests/sample-rate-sync.spec.js [2m([22m[2m16 tests[22m[2m)[22m[33m 4626[2mms[22m[39m
   [33m[2m✓[22m[39m Sample Rate Sync — DC Blocker Validation[2m &gt; [22mSample Rate Mismatch Scenarios[2m &gt; [22mshould maintain stable output for long signals [33m 4552[2mms[22m[39m

[2m Test Files [22m [1m[32m15 passed[39m[22m[90m (15)[39m
[2m      Tests [22m [1m[32m342 passed[39m[22m[90m (342)[39m
[2m   Start at [22m 19:30:12
[2m   Duration [22m 6.79s[2m (transform 421ms, setup 352ms, collect 844ms, tests 5.84s, environment 17.00s, prepare 3.38s)[22m

[34m % [39m[2mCoverage report from [22m[33mv8[39m
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |    75.6 |     95.4 |   91.42 |    75.6 |                   
 analyzer          |       0 |        0 |       0 |       0 |                   
  logger.js        |       0 |        0 |       0 |       0 | 1-162             
 ...zer/dsp-engine |   92.77 |    95.45 |   91.66 |   92.77 |                   
  limiter.js       |     100 |      100 |     100 |     100 |                   
  midi-export.js   |   85.64 |    88.88 |   83.33 |   85.64 | ...21-122,185-187 
  rms.js           |     100 |      100 |     100 |     100 |                   
 analyzer/popup    |     100 |      100 |     100 |     100 |                   
  ...p-testable.js |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------

```

