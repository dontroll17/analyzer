#!/usr/bin/env node
/**
 * Lint script для проверки production logging в JS файлах
 * Запускается: npm run lint:logs
 *
 * Ищет console.warn/log/debug в production-коде (кроме tests/ и node_modules/)
 * Рекомендует использовать logger.js (log.info/warn/error)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PATTERN = /console\.(warn|log|debug)\(/g;

function main() {
  console.log('🔍 Linting production logs...\n');

  const files = getJSFiles();
  let totalViolations = 0;
  const violationsByFile = {};

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      let fileViolations = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Skip comments
        if (/^\s*\/\//.test(line)) continue;
        if (/^\s*\*/.test(line)) continue;

        // Skip logger definition lines: `warn: (m, ...) => console.warn(...)`
        if (/^\s*\w+:\s*\(/.test(line) && /=>\s*console\./.test(line)) continue;

        PATTERN.lastIndex = 0;
        if (PATTERN.test(line)) {
          // Skip if using logger.js
          if (/log\.(info|debug|warn|error)\(/.test(line)) continue;

          const match = line.match(/console\.(warn|log|debug)\(/);
          const type = match ? match[1] : 'unknown';
          const relPath = path.relative(process.cwd(), file);

          if (!violationsByFile[relPath]) {
            violationsByFile[relPath] = [];
          }
          violationsByFile[relPath].push({
            line: lineNum,
            type,
            content: line.trim().substring(0, 100),
          });
          fileViolations++;
          totalViolations++;
        }
      }
    } catch (e) {
      // Skip unreadable files
    }
  }

  if (totalViolations === 0) {
    console.log(`✅ Clean: ${files.length} files checked, no violations\n`);
    console.log('Production logging is properly handled.');
    process.exit(0);
  }

  console.log(`❌ Found ${totalViolations} violations in ${Object.keys(violationsByFile).length} files:\n`);

  for (const [file, violations] of Object.entries(violationsByFile)) {
    console.log(`📄 ${file}`);
    for (const v of violations) {
      console.log(`   L${v.line} [${v.type}] ${v.content}`);
    }
    console.log('');
  }

  console.log(`${'='.repeat(50)}`);
  console.log(
    '💡 Fix: Replace console.* with logger.js:'
  );
  console.log('   console.log(...) → log.info(...)');
  console.log('   console.warn(...) → log.warn(...)');
  console.log('   console.debug(...) → log.debug(...)');
  console.log('');
  console.log('   Import: import { log } from "../logger.js" or use existing log reference');
  process.exit(1);
}

function getJSFiles() {
  const allJsFiles = globFilesRecursive('.');
  return allJsFiles.filter(
    (f) => !f.includes('node_modules') && !f.includes('.git') && !f.includes('/tests/')
  );
}

function globFilesRecursive(dir) {
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        results.push(...globFiles(fullPath));
      } else if (stat.isFile() && item.endsWith('.js')) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Skip
  }
  return results;
}

main();
