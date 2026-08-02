#!/usr/bin/env node
/**
 * Scheduler Orchestrator — запускает все проверки проекта
 * Запускается: node scripts/scheduler/run-all.js
 *
 * Порядок проверок:
 * 1. npm test — Jest unit tests
 * 2. npm run check:syntax — Syntax check all .js files
 * 3. npm run lint:logs — Production logging audit
 * 4. node scripts/validate.js — Full validation suite
 * 5. npm run test:coverage — Coverage report
 *
 * Выход: JSON report + Markdown summary
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
const REPORTS_DIR = path.join(__dirname, 'reports');
const HISTORY_DIR = path.join(__dirname, 'history');
const LAST_RUN_FILE = path.join(REPORTS_DIR, 'last-run.json');
const LAST_RUN_MD_FILE = path.join(REPORTS_DIR, 'last-run.md');

// Thresholds
const COVERAGE_DEGRADATION_THRESHOLD = 2; // %
const REPORT_RETENTION_DAYS = 30;

// Status codes
const STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
};

// ==================== UTILITIES ====================
function timestamp() {
  return new Date().toISOString();
}

function escapeMarkdown(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function execCommand(cmd, options = {}) {
  const timeout = options.timeout || 120000;
  const name = options.name || cmd;
  const captureOutput = options.onOutput !== undefined;
  
  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: captureOutput ? 'pipe' : 'inherit',
      timeout,
    });
    
    if (options.onOutput) {
      options.onOutput(output);
    }
    
    return {
      status: STATUS.PASS,
      name,
      output,
      duration: options.elapsed ? options.elapsed() : 0,
      timestamp: timestamp(),
    };
  } catch (error) {
    return {
      status: STATUS.FAIL,
      name,
      output: error.stdout || error.stderr || String(error.message),
      duration: options.elapsed ? options.elapsed() : 0,
      timestamp: timestamp(),
    };
  }
}

// ==================== CHECKS ====================
let overallStart;

function runCheck(name, cmd, options = {}) {
  const checkStart = Date.now();
  options.elapsed = () => Date.now() - checkStart;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`CHECK: ${name}`);
  console.log(`CMD:   ${cmd}`);
  console.log(`${'='.repeat(60)}`);
  
  const result = execCommand(cmd, options);
  result.checkName = name;
  
  const icon = result.status === STATUS.PASS ? '✅' : 
               result.status === STATUS.FAIL ? '❌' : 
               result.status === STATUS.WARN ? '⚠️' : '⏭️';
  console.log(`${icon} ${name}: ${result.status} (${(result.duration / 1000).toFixed(1)}s)`);
  
  return result;
}

function checkTests() {
  return runCheck('Jest Unit Tests', 'npm test', {
    timeout: 60000,
  });
}

function checkSyntax() {
  const files = [
    'background.js',
    'content.js',
    'offscreen.js',
    'logger.js',
    'dsp-engine/audio-worklet.js',
    'dsp-engine/delay-processor.js',
    'dsp-engine/rms.js',
    'popup/popup.js',
    'popup/config.js',
  ].join(' ');
  
  return runCheck('Syntax Check', `node --check ${files.replace(/\\/g, '/')}`, {
    timeout: 15000,
  });
}

function checkLintLogs() {
  return runCheck('Production Log Lint', 'npm run lint:logs', {
    timeout: 30000,
  });
}

function checkFullValidation() {
  return runCheck('Full Validation Suite', 'node scripts/validate.js', {
    timeout: 90000,
  });
}

function checkCoverage() {
  return runCheck('Coverage Report', 'npm run test:coverage', {
    timeout: 60000,
    onOutput: (output) => {
      // Parse coverage from output (jest --coverage table format)
      const stmtsMatch = output.match(/All files\s+\|\s+(\d+\.?\d*)\s*\|/);
      const branchMatch = output.match(/All files[^|]*\|\s*(\d+\.?\d*)\s*\|/);
      const funcsMatch = output.match(/All files[^|]*\|[^|]*\|\s*(\d+\.?\d*)\s*\|/);
      const linesMatch2 = output.match(/All files[^|]*\|[^|]*\|[^|]*\|\s*(\d+\.?\d*)\s*\|/);
      
      if (stmtsMatch) {
        global.coverage = global.coverage || {};
        global.coverage.statements = parseFloat(stmtsMatch[1]);
      }
      if (branchMatch) {
        global.coverage = global.coverage || {};
        global.coverage.branches = parseFloat(branchMatch[1]);
      }
      if (funcsMatch) {
        global.coverage = global.coverage || {};
        global.coverage.functions = parseFloat(funcsMatch[1]);
      }
      if (linesMatch2) {
        global.coverage = global.coverage || {};
        global.coverage.lines = parseFloat(linesMatch2[1]);
      }
    },
  });
}

// ==================== REPORTING ====================
function generateMarkdownReport(report) {
  const totalChecks = report.results.length;
  const passedChecks = report.results.filter(r => r.status === STATUS.PASS).length;
  const failedChecks = report.results.filter(r => r.status === STATUS.FAIL).length;
  const warnedChecks = report.results.filter(r => r.status === STATUS.WARN).length;
  const overallStatus = failedChecks > 0 ? 'FAIL' : (warnedChecks > 0 ? 'WARN' : 'PASS');
  
  let md = `# Scheduler Report\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Timestamp** | ${escapeMarkdown(report.timestamp)} |\n`;
  md += `| **Duration** | ${report.duration.toFixed(1)}s |\n`;
  md += `| **Overall** | ${overallStatus} |\n\n`;
  
  md += `## Results Summary\n\n`;
  md += `| Check | Status | Duration |\n`;
  md += `|-------|--------|----------|\n`;
  
  for (const result of report.results) {
    const icon = result.status === STATUS.PASS ? '✅' : 
                 result.status === STATUS.FAIL ? '❌' : 
                 result.status === STATUS.WARN ? '⚠️' : '⏭️';
    md += `| ${icon} ${escapeMarkdown(result.checkName)} | ${result.status} | ${result.duration.toFixed(1)}s |\n`;
  }
  
  md += `\n## Coverage\n\n`;
  if (global.coverage) {
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Statements | ${global.coverage.statements || 'N/A'}% |\n`;
    md += `| Functions | ${global.coverage.functions || 'N/A'}% |\n`;
    md += `| Lines | ${global.coverage.lines || 'N/A'}% |\n`;
    md += `| Branches | ${global.coverage.branches || 'N/A'}% |\n`;
  } else {
    md += `Coverage data not available.\n`;
  }
  
  md += `\n## Details\n\n`;
  for (const result of report.results) {
    if (result.status !== STATUS.PASS) {
      md += `### ${result.checkName}\n\n`;
      md += '```\n';
      const outputLines = result.output.split('\n').slice(-30);
      md += outputLines.map(l => escapeMarkdown(l)).join('\n');
      md += '\n```\n\n';
    }
  }
  
  return md;
}

function saveHistory(report) {
  const now = new Date();
  const historyFile = path.join(HISTORY_DIR, `run-${now.toISOString().replace(/[:.]/g, '-')}.json`);
  
  // Save full report to history
  fs.writeFileSync(historyFile, JSON.stringify(report, null, 2), 'utf8');
  
  // Cleanup old reports
  cleanupOldReports();
}

function cleanupOldReports() {
  if (!fs.existsSync(HISTORY_DIR)) return;
  
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(HISTORY_DIR, f)).mtime,
    }));
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REPORT_RETENTION_DAYS);
  
  for (const file of files) {
    if (file.time < cutoff) {
      fs.unlinkSync(path.join(HISTORY_DIR, file.name));
    }
  }
}

function compareWithHistory(currentReport) {
  // Find most recent history entry
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith('run-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length < 1) {
    return { hasHistory: false };
  }
  
  const previousFile = path.join(HISTORY_DIR, files[0]);
  let previousReport;
  try {
    previousReport = JSON.parse(fs.readFileSync(previousFile, 'utf8'));
  } catch {
    return { hasHistory: false };
  }
  
  const comparisons = [];
  
  // Compare coverage
  if (global.coverage && previousReport.coverage) {
    for (const [metric, value] of Object.entries(global.coverage)) {
      if (typeof value === 'number' && previousReport.coverage[metric]) {
        const diff = value - previousReport.coverage[metric];
        const degeneration = diff < -COVERAGE_DEGRADATION_THRESHOLD;
        
        comparisons.push({
          metric,
          previous: previousReport.coverage[metric],
          current: value,
          diff: diff.toFixed(2),
          status: degeneration ? STATUS.FAIL : (diff < 0 ? STATUS.WARN : STATUS.PASS),
        });
      }
    }
  }
  
  // Compare test counts
  const prevTests = previousReport.results.find(r => r.checkName === 'Jest Unit Tests');
  const currTests = currentReport.results.find(r => r.checkName === 'Jest Unit Tests');
  
  if (prevTests && currTests && prevTests.output && currTests.output) {
    const prevPass = (prevTests.output.match(/Tests:\s+(\d+)\s+passed/g) || []).length;
    const currPass = (currTests.output.match(/Tests:\s+(\d+)\s+passed/g) || []).length;
    
    comparisons.push({
      metric: 'Passed tests',
      previous: prevPass,
      current: currPass,
      diff: (currPass - prevPass).toString(),
      status: currPass < prevPass ? STATUS.FAIL : STATUS.PASS,
    });
  }
  
  return {
    hasHistory: true,
    previousFile: files[0],
    comparisons,
  };
}

// ==================== MAIN ====================
function main() {
  overallStart = Date.now();
  global.coverage = {};
  
  console.log('🚀 Scheduler Orchestrator');
  console.log(`⏰ Started at: ${timestamp()}`);
  console.log('');
  
  // Run all checks
  const results = [
    checkTests(),
    checkSyntax(),
    checkLintLogs(),
    checkFullValidation(),
    checkCoverage(),
  ];
  
  const totalDuration = Date.now() - overallStart;
  
  // Build report
  const report = {
    version: '1.0.0',
    timestamp: timestamp(),
    duration: totalDuration,
    overall: results.every(r => r.status === STATUS.PASS) ? 'PASS' :
             results.some(r => r.status === STATUS.FAIL) ? 'FAIL' : 'WARN',
    coverage: { ...global.coverage },
    results,
  };
  
  // Save last run
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(report, null, 2), 'utf8');
  
  // Generate Markdown
  const md = generateMarkdownReport(report);
  fs.writeFileSync(LAST_RUN_MD_FILE, md, 'utf8');
  
  // Save to history
  saveHistory(report);
  
  // Compare with history
  const comparison = compareWithHistory(report);
  if (comparison.hasHistory) {
    report.comparison = comparison;
    fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(report, null, 2), 'utf8');
  }
  
  // Print summary
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '  SCHEDULER REPORT'.padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  
  const icon = report.overall === 'PASS' ? '✅' : 
               report.overall === 'FAIL' ? '❌' : '⚠️';
  console.log(`║ ${icon} Overall: ${report.overall}  ${' '.repeat(48 - report.overall.length)}║`);
  console.log(`║ ⏱  Duration: ${(totalDuration / 1000).toFixed(1)}s  ${' '.repeat(40)}║`);
  console.log(`║ 📊 Coverage: Statements=${global.coverage.statements || 'N/A'}%  ${' '.repeat(30)}║`);
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  
  console.log('\n📁 Reports saved to:');
  console.log(`   ${LAST_RUN_FILE}`);
  console.log(`   ${LAST_RUN_MD_FILE}`);
  
  if (comparison.hasHistory) {
    console.log(`\n📈 Comparison with previous run (${comparison.previousFile}):`);
    for (const comp of comparison.comparisons) {
      const icon = comp.status === STATUS.PASS ? '↑' : 
                   comp.status === STATUS.FAIL ? '↓' : '~';
      console.log(`   ${icon} ${comp.metric}: ${comp.previous} → ${comp.current} (${comp.diff})`);
    }
  }
  
  // Exit code
  process.exit(report.overall === 'PASS' ? 0 : 1);
}

main();
