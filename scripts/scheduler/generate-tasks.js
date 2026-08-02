#!/usr/bin/env node
/**
 * Task Generator — формирует задания в TASKS.md на основе анализа
 * Запускается: node scripts/scheduler/generate-tasks.js [--report <path>] [--apply] [--dry-run]
 *
 * Функционал:
 * 1. Чтение agent-report.json
 * 2. Парсинг существующего TASKS.md
 * 3. Генерация новых задач в Backlog секцию
 * 4. Автоматическое обновление (с флагом --apply)
 *
 * Выход: обновлённый TASKS.md + report.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
const DEFAULT_REPORT = path.join(__dirname, 'reports', 'agent-report.json');
const TASKS_FILE = path.join(__dirname, '..', '..', 'TASKS.md');

const PRIORITY_ICONS = {
  Critical: '🔴 Critical',
  High: '🟠 High',
  Medium: '🟡 Medium',
  Low: '🟢 Low',
};

// ==================== CLI ====================
function parseArgs() {
  const args = process.argv.slice(2);
  let reportPath = DEFAULT_REPORT;
  let apply = false;
  let dryRun = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report' && args[i + 1]) {
      reportPath = args[i + 1];
      i++;
    } else if (args[i] === '--apply') {
      apply = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node generate-tasks.js [--report <path>] [--apply] [--dry-run]');
      console.log('');
      console.log('Generates tasks from agent recommendations.');
      console.log('');
      console.log('Options:');
      console.log('  --report <path>  Path to agent-report.json');
      console.log('  --apply          Apply changes to TASKS.md');
      console.log('  --dry-run        Preview changes without writing');
      console.log('  --help, -h       Show this help');
      process.exit(0);
    }
  }
  
  return { reportPath, apply, dryRun };
}

// ==================== TASKS.md PARSER ====================
function parseTasksFile(content) {
  const lines = content.split('\n');
  const sections = {
    backlog: { start: null, end: null, lines: [] },
    planned: { start: null, end: null, lines: [] },
  };
  
  let currentSection = null;
  let backlogTableEnd = null;
  let plannedTableEnd = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect Backlog section
    if (/^##\s+Backlog/.test(line)) {
      currentSection = 'backlog';
      sections.backlog.start = i;
      continue;
    }
    
    // Detect Planned section (Sprint N — Planned)
    if (/^##\s+Sprint\s+\d+\s+—\s+Planned/.test(line)) {
      currentSection = 'planned';
      sections.planned.start = i;
      continue;
    }
    
    // Detect next section (ends current)
    if (/^##\s+/.test(line) && currentSection) {
      sections[currentSection].end = i;
      currentSection = null;
      continue;
    }
    
    // Collect lines
    if (currentSection === 'backlog') {
      sections.backlog.lines.push(i);
    } else if (currentSection === 'planned') {
      sections.planned.lines.push(i);
    }
  }
  
  // Close sections at EOF
  if (sections.backlog.start !== null) {
    sections.backlog.end = lines.length;
  }
  if (sections.planned.start !== null) {
    sections.planned.end = lines.length;
  }
  
  return {
    lines,
    sections,
    raw: content,
  };
}

function findBacklogTableEnd(taskFile) {
  const { lines, sections } = taskFile;
  if (!sections.backlog.start && !sections.backlog.end) {
    return -1;
  }
  
  // Find the table end marker (---) after backlog header
  for (let i = sections.backlog.start; i < sections.backlog.end; i++) {
    if (/^---/.test(lines[i])) {
      return i;
    }
  }
  
  return sections.backlog.start;
}

// ==================== TASK GENERATOR ====================
function generateTaskEntry(recommendation, taskNumber) {
  const priorityIcon = PRIORITY_ICONS[recommendation.priority] || PRIORITY_ICONS.Medium;
  const status = '⏳ Pending';
  
  // Extract area for numbering
  let areaPrefix = 'SCHED';
  if (recommendation.area) {
    const area = recommendation.area.toLowerCase();
    if (area.includes('fft') || area.includes('spectral')) areaPrefix = 'DSP';
    else if (area.includes('rms') || area.includes('energy')) areaPrefix = 'DSP';
    else if (area.includes('glitch')) areaPrefix = 'GLITCH';
    else if (area.includes('popup') || area.includes('overlay')) areaPrefix = 'UI';
    else if (area.includes('coverage') || area.includes('test')) areaPrefix = 'TEST';
  }
  
  const taskId = `${areaPrefix}.${taskNumber}`;
  const title = truncate(recommendation.title, 80);
  const description = truncate(recommendation.suggestion, 100);
  
  return {
    taskId,
    title,
    description,
    priority: priorityIcon,
    status,
    recommendation,
  };
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}

function insertTasksIntoMarkdown(taskFile, newTasks) {
  const { lines, sections } = taskFile;
  
  if (!sections.backlog.start) {
    // No backlog section found — append
    lines.push('');
    lines.push('## Backlog — Pending ⏳');
    lines.push('');
    lines.push('| # | Задача | Статус |');
    lines.push('|---|--------|--------|');
    
    for (const task of newTasks) {
      lines.push(`| ${task.taskId} | ${task.title} | ${task.status} |`);
    }
    
    return lines.join('\n');
  }
  
  // Find the table in backlog section
  const tableStart = findBacklogTableEnd(taskFile);
  
  // Insert after table header
  const insertLines = [];
  for (const task of newTasks) {
    insertLines.push(`| ${task.taskId} | ${task.title} | ${task.status} |`);
  }
  
  // Insert right after the table header row
  const headerIndex = tableStart + 1; // After --- line
  lines.splice(headerIndex, 0, ...insertLines);
  
  return lines.join('\n');
}

// ==================== REPORTING ====================
function printTaskSummary(newTasks) {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '  TASK GENERATION REPORT'.padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  
  const criticalTasks = newTasks.filter(t => t.priority.includes('Critical'));
  const highTasks = newTasks.filter(t => t.priority.includes('High'));
  const mediumTasks = newTasks.filter(t => t.priority.includes('Medium'));
  
  console.log(`║ 📝 Total tasks: ${newTasks.length.toString().padStart(2)}  ${' '.repeat(44)}║`);
  console.log(`║ 🔴 Critical: ${criticalTasks.length.toString().padStart(2)}  🟠 High: ${highTasks.length.toString().padStart(2)}  🟡 Medium: ${mediumTasks.length.toString().padStart(2)}  ${' '.repeat(26)}║`);
  console.log('║' + ' '.repeat(58) + '║');
  
  if (newTasks.length > 0) {
    console.log('║' + '  NEW TASKS'.padEnd(58) + '║');
    console.log('║' + '─'.repeat(58) + '║');
    
    const topTasks = newTasks.slice(0, 5);
    for (const task of topTasks) {
      const line = `${task.taskId}: ${task.title}`;
      console.log(`║ ${line.substring(0, 55).padEnd(58)}║`);
    }
    
    if (newTasks.length > 5) {
      console.log(`║ ... and ${newTasks.length - 5} more tasks  ${' '.repeat(30)}║`);
    }
  } else {
    console.log('║  ✅ No new tasks to generate'.padEnd(58) + '║');
  }
  
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
}

// ==================== MAIN ====================
function main() {
  const { reportPath, apply, dryRun } = parseArgs();
  
  // Load agent report
  if (!fs.existsSync(reportPath)) {
    console.error(`❌ Report not found: ${reportPath}`);
    console.error('   Run "npm run scheduler:all" first to generate a report.');
    process.exit(1);
  }
  
  let agentReport;
  try {
    agentReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error(`❌ Failed to parse report: ${error.message}`);
    process.exit(1);
  }
  
  // Load TASKS.md
  if (!fs.existsSync(TASKS_FILE)) {
    console.error(`❌ TASKS.md not found at: ${TASKS_FILE}`);
    process.exit(1);
  }
  
  let tasksContent;
  try {
    tasksContent = fs.readFileSync(TASKS_FILE, 'utf8');
  } catch (error) {
    console.error(`❌ Failed to read TASKS.md: ${error.message}`);
    process.exit(1);
  }
  
  console.log('📝 Task Generator');
  console.log(`📂 Agent report: ${reportPath}`);
  console.log(`📂 Tasks file:   ${TASKS_FILE}`);
  console.log(`⚡ Mode:         ${dryRun ? 'DRY RUN (no changes)' : apply ? 'APPLY' : 'DRY RUN (no changes)'}`);
  console.log('');
  
  // Parse existing tasks
  const taskFile = parseTasksFile(tasksContent);
  
  // Generate new tasks from recommendations
  const newTasks = [];
  let taskNumber = 1;
  
  for (const rec of agentReport.recommendations) {
    // Skip if already tracked (check for duplicate IDs)
    const existingId = rec.id.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (tasksContent.includes(existingId)) {
      continue;
    }
    
    const task = generateTaskEntry(rec, taskNumber);
    newTasks.push(task);
    taskNumber++;
  }
  
  if (newTasks.length === 0) {
    console.log('✅ No new tasks to generate (all recommendations already tracked).');
    return;
  }
  
  // Print summary
  printTaskSummary(newTasks);
  
  // Generate updated content
  const newContent = insertTasksIntoMarkdown(taskFile, newTasks);
  
  // Write or preview
  if (dryRun || !apply) {
    console.log('\n📄 Changes preview (NOT applied):');
    console.log('─'.repeat(60));
    console.log(newContent);
    console.log('─'.repeat(60));
    console.log('\n💡 To apply: run with --apply flag');
  } else {
    fs.writeFileSync(TASKS_FILE, newContent, 'utf8');
    console.log('\n✅ TASKS.md updated with new tasks.');
  }
  
  // Save task generation report
  const taskReport = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    totalRecommendations: agentReport.recommendations.length,
    newTasks: newTasks.length,
    tasks: newTasks.map(t => ({
      id: t.taskId,
      title: t.title,
      priority: t.priority,
      suggestion: t.recommendation.suggestion,
    })),
  };
  
  const taskReportPath = path.join(__dirname, 'reports', `tasks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(taskReportPath, JSON.stringify(taskReport, null, 2), 'utf8');
  console.log(`📁 Task report saved to: ${taskReportPath}`);
}

main();
