#!/usr/bin/env node
/**
 * Agent Analyzer — анализирует результаты тестирования и формирует рекомендации
 * Запускается: node scripts/scheduler/analyze-results.js [--report <path>]
 *
 * Функционал:
 * 1. Диагностика провалов тестов
 * 2. Анализ покрытия (coverage)
 * 3. Проверка регрессии
 * 4. Генерация приоритизированных рекомендаций
 *
 * Выход: scripts/scheduler/reports/agent-report.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { writeJSONSync } = require('../utils/fs-safe');

// ==================== CONFIG ====================
const DEFAULT_REPORT = path.join(__dirname, 'reports', 'last-run.json');
const AGENT_REPORT = path.join(__dirname, 'reports', 'agent-report.json');

function timestamp() {
  return new Date().toISOString();
}

// Thresholds
const COVERAGE_DEGRADATION_THRESHOLD = 2; // %

const CRITICAL_PATHS = [
  'fftReal1024',
  'calculateRMS',
  'calculateFrequencyBands',
  'checkGlitchState',
  'fft magnitude',
  'RMS calculation',
  'Band energy',
  'glitch detection',
];

const IMPORTANT_PATHS = [
  'calculateZCR',
  'calculateSpectralCentroid',
  'calculateSpectralRolloff',
  'detectSpectralFlatness',
  'calculateBandEntropy',
  'HNR',
  'spectral',
  'delay processor',
  'popup',
];

const TEST_BUMPS = {
  Critical: 3,
  High: 5,
  Medium: 8,
};

// ==================== CLI ====================
function parseArgs() {
  const args = process.argv.slice(2);
  let reportPath = DEFAULT_REPORT;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report' && args[i + 1]) {
      reportPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node analyze-results.js [--report <path>]');
      console.log('');
      console.log('Analyzes test results and generates recommendations.');
      console.log('');
      console.log('Options:');
      console.log('  --report <path>  Path to last-run.json (default: reports/last-run.json)');
      console.log('  --help, -h       Show this help');
      process.exit(0);
    }
  }
  
  return { reportPath };
}

// ==================== ANALYSIS ====================
function analyzeTestFailures(report) {
  const failures = [];
  const testsResult = report.results.find(r => r.checkName === 'Unit Tests');
  
  if (!testsResult) {
    return { status: 'N/A', failures: [], error: 'No test results found' };
  }
  
  if (testsResult.status !== 'FAIL') {
    return { status: 'PASS', failures: [], error: null };
  }
  
  const output = testsResult.output || '';
  
  // Parse test failures from Vitest output
  const failedTests = parseFailedTests(output);
  
  for (const failure of failedTests) {
    const priority = classifyPriority(failure.testName);
    const suggestion = generateSuggestion(failure);
    
    failures.push({
      id: `TEST-${failures.length + 1}`,
      testName: failure.testName,
      file: failure.file,
      line: failure.line,
      message: failure.message,
      priority,
      suggestion,
      bumpCounter: 0, // Will be updated if we track history
    });
  }
  
  return {
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    failures,
    error: null,
  };
}

function parseFailedTests(output) {
  const failures = [];
  const lines = output.split('\n');
  
  let currentTest = null;
  let currentFile = null;
  
  for (const line of lines) {
    // Match "FAIL <file>"
    const failMatch = line.match(/^FAIL\s+(.+)$/);
    if (failMatch) {
      currentFile = failMatch[1].trim();
      continue;
    }
    
    // Match "● <test name>"
    const testMatch = line.match(/●\s+(.+)$/);
    if (testMatch && currentFile) {
      currentTest = {
        testName: testMatch[1].trim(),
        file: currentFile,
        line: null,
        message: null,
      };
      continue;
    }
    
    // Match error message after "● <test name>"
    if (currentTest && /^    /.test(line)) {
      const trimmed = line.trim();
      if (currentTest.message) {
        currentTest.message += '\n' + trimmed;
      } else {
        currentTest.message = trimmed;
      }
      
      // Try to extract file:line
      const locationMatch = trimmed.match(/at (.+):(\d+):\d+/);
      if (locationMatch) {
        currentTest.line = parseInt(locationMatch[2], 10);
      }
      continue;
    }
    
    // End of test block
    if (/^ $/.test(line) && currentTest) {
      failures.push(currentTest);
      currentTest = null;
    }
  }
  
  // Push last test if no trailing newline
  if (currentTest) {
    failures.push(currentTest);
  }
  
  return failures;
}

function analyzeCoverage(report) {
  const coverage = report.coverage || {};
  const MIN_COVERAGE = 80; // %
  
  const issues = [];
  
  for (const [metric, value] of Object.entries(coverage)) {
    if (typeof value === 'number' && value < MIN_COVERAGE) {
      const priority = (metric === 'statements' || metric === 'overall') ? 'High' : 'Medium';
      issues.push({
        id: `COV-${metric.toUpperCase()}`,
        metric,
        value,
        threshold: MIN_COVERAGE,
        gap: (MIN_COVERAGE - value).toFixed(1),
        priority,
        suggestion: `Increase ${metric} coverage from ${value}% to ${MIN_COVERAGE}% (critical: ${CRITICAL_PATHS.join(', ')})`,
      });
    }
  }
  
  // Check for degradation
  if (report.comparison && report.comparison.comparisons) {
    for (const comp of report.comparison.comparisons) {
      if (comp.status === 'FAIL' || comp.status === 'WARN') {
        issues.push({
          id: `REG-${comp.metric.replace(/\s+/g, '-')}`,
          metric: comp.metric,
          previous: comp.previous,
          current: comp.current,
          diff: parseFloat(comp.diff),
          priority: comp.diff < -COVERAGE_DEGRADATION_THRESHOLD ? 'High' : 'Medium',
          suggestion: `Regression in ${comp.metric}: ${comp.previous} → ${comp.current} (${comp.diff}%)`,
        });
      }
    }
  }
  
  return {
    status: issues.length === 0 ? 'PASS' : (issues.some(i => i.priority === 'High') ? 'FAIL' : 'WARN'),
    issues,
    thresholds: {
      minCoverage: MIN_COVERAGE,
      degradationThreshold: COVERAGE_DEGRADATION_THRESHOLD,
    },
  };
}

function classifyPriority(testName) {
  const name = testName.toLowerCase();
  
  for (const path of CRITICAL_PATHS) {
    if (name.includes(path.toLowerCase())) {
      return 'Critical';
    }
  }
  
  for (const path of IMPORTANT_PATHS) {
    if (name.includes(path.toLowerCase())) {
      return 'High';
    }
  }
  
  return 'Medium';
}

function generateSuggestion(failure) {
  const message = failure.message || '';
  const testName = failure.testName || '';
  
  // Check for common failure patterns
  if (/timeout|timed?\s*out/i.test(message)) {
    return 'Test timed out — check for missing async/await or vitest.setTimeout()';
  }
  
  if (/mock|not?\s*mock/i.test(message)) {
    return 'Mock not configured correctly — check jest.mock() or jest.fn() setup';
  }
  
  if (/expect.*received/i.test(message)) {
    return 'Assertion failed — check expected vs actual values';
  }
  
  if (/reference? ?error|undefined/i.test(message)) {
    return 'ReferenceError or undefined — check variable scope and initialization';
  }
  
  if (/type ?error|not?\s*function/i.test(message)) {
    return 'TypeError — check function signatures and return types';
  }
  
  if (/cannot read property|cannot read/i.test(message)) {
    return 'Property access on undefined/null — add null checks';
  }
  
  // DSP-specific suggestions
  if (/fft|spectrum|bin/i.test(testName)) {
    return 'FFT test failed — verify input size (must be 1024) and tolerance for float comparison';
  }
  
  if (/rms|peak|energy/i.test(testName)) {
    return 'RMS/energy test failed — verify normalization and signal generation';
  }
  
  if (/glitch|state/i.test(testName)) {
    return 'Glitch detection test failed — check state machine transitions';
  }
  
  return 'Review test output and fix failing assertion';
}

// ==================== REPORTING ====================
function generateAgentReport(testAnalysis, coverageAnalysis) {
  const recommendations = [];
  const allIssues = [...testAnalysis.failures, ...coverageAnalysis.issues];
  
  // Priority ordering
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  allIssues.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));
  
  for (const issue of allIssues) {
    recommendations.push({
      id: issue.id,
      type: issue.message ? 'test-failure' : 'coverage',
      priority: issue.priority,
      title: issue.message ? `Test failure: ${issue.testName}` : `${issue.metric} below threshold`,
      description: issue.message || `Value ${issue.value}% is below ${issue.threshold || 'N/A'}%`,
      suggestion: issue.suggestion,
      area: issue.testName || issue.metric,
    });
  }
  
  // Overall health score
  const criticalCount = recommendations.filter(r => r.priority === 'Critical').length;
  const highCount = recommendations.filter(r => r.priority === 'High').length;
  const mediumCount = recommendations.filter(r => r.priority === 'Medium').length;
  
  let healthScore = 100;
  healthScore -= criticalCount * 30;
  healthScore -= highCount * 15;
  healthScore -= mediumCount * 5;
  healthScore = Math.max(0, healthScore);
  
  let healthStatus;
  if (healthScore >= 90) healthStatus = 'EXCELLENT';
  else if (healthScore >= 70) healthStatus = 'GOOD';
  else if (healthScore >= 50) healthStatus = 'DEGRADED';
  else healthStatus = 'CRITICAL';
  
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    health: {
      score: healthScore,
      status: healthStatus,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
    },
    tests: testAnalysis,
    coverage: coverageAnalysis,
    recommendations,
  };
}

function printAgentSummary(agentReport) {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '  AGENT ANALYSIS REPORT'.padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  
  const healthIcon = agentReport.health.status === 'EXCELLENT' ? '🟢' :
                     agentReport.health.status === 'GOOD' ? '🟡' :
                     agentReport.health.status === 'DEGRADED' ? '🟠' : '🔴';
  
  console.log(`║ ${healthIcon} Health Score: ${agentReport.health.score}/100 (${agentReport.health.status})  ${' '.repeat(30)}║`);
  console.log(`║ 📊 Critical: ${agentReport.health.critical.toString().padStart(2)}  High: ${agentReport.health.high.toString().padStart(2)}  Medium: ${agentReport.health.medium.toString().padStart(2)}  ${' '.repeat(16)}║`);
  console.log('║' + ' '.repeat(58) + '║');
  
  if (agentReport.recommendations.length > 0) {
    console.log('║' + '  TOP RECOMMENDATIONS'.padEnd(58) + '║');
    console.log('║' + '─'.repeat(58) + '║');
    
    const topRecs = agentReport.recommendations.slice(0, 5);
    for (const rec of topRecs) {
      const prioIcon = rec.priority === 'Critical' ? '🔴' :
                       rec.priority === 'High' ? '🟠' : '🟡';
      const line = `${prioIcon} [${rec.priority}] ${rec.title}`;
      console.log(`║ ${line.padEnd(58)}║`);
      console.log(`║ ${rec.suggestion.substring(0, 55).padEnd(58)}║`);
    }
  } else {
    console.log('║  ✅ No issues detected — everything looks good!'.padEnd(58) + '║');
  }
  
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
}

// ==================== MAIN ====================
function main() {
  const { reportPath } = parseArgs();
  
  // Load report
  if (!fs.existsSync(reportPath)) {
    console.error(`❌ Report not found: ${reportPath}`);
    console.error('   Run "npm run scheduler:run" first to generate a report.');
    process.exit(1);
  }
  
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error(`❌ Failed to parse report: ${error.message}`);
    process.exit(1);
  }
  
  console.log('🔍 Agent Analyzer');
  console.log(`📂 Report: ${reportPath}`);
  console.log(`⏰ Analyzed at: ${timestamp()}`);
  console.log('');
  
  // Run analysis
  const testAnalysis = analyzeTestFailures(report);
  const coverageAnalysis = analyzeCoverage(report);
  
  console.log(`🧪 Tests:    ${testAnalysis.status} (${testAnalysis.failures.length} failures)`);
  console.log(`📊 Coverage: ${coverageAnalysis.status} (${coverageAnalysis.issues.length} issues)`);
  
  // Generate agent report
  const agentReport = generateAgentReport(testAnalysis, coverageAnalysis);
  
  // Save agent report
  const saved = writeJSONSync(AGENT_REPORT, agentReport);
  if (!saved) {
    console.error('❌ Failed to save agent report');
    process.exit(1);
  }
  
  // Print summary
  printAgentSummary(agentReport);
  
  console.log(`\n📁 Agent report saved to: ${AGENT_REPORT}`);
  
  // Exit code based on health
  process.exit(agentReport.health.status === 'CRITICAL' ? 1 : 0);
}

main();
