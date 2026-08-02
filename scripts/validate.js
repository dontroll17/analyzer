#!/usr/bin/env node
/**
 * Validation script для автоматической проверки Stream Sensation Analyzer
 * Запускается: npm run validate
 *
 * Checks:
 * 1. npm test — Vitest unit tests
 * 2. node --check — Syntax check all .js files
 * 3. Production logging audit — console.warn/log/debug in production code
 * 4. Manifest validation — MV3 compliance
 * 5. Chrome Extension API validation — no deprecated params
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXIT_CODE = { SUCCESS: 0, FAIL: 1 };
const PRODUCTION_LOG_PATTERNS = [
  /console\.warn\(/g,
  /console\.log\(/g,
  /console\.debug\(/g,
];
const SKIP_FILES = ['node_modules/', '.git/', 'tests/'];

// ============================================
// Deprecated Chrome API params
// ============================================
const DEPRECATED_API_PARAMS = {
  tabCapture: {
    getMediaStreamId: ['targetTab'], // targetTab is not valid in MV3
  },
  tabs: {
    update: ['highlight'], // use selected instead
  },
};

// ==================== CHECK 1: Jest Tests ====================
function checkTests() {
  console.log('\n🧪 Checking tests...');
  try {
    const output = execSync('npm test', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60000,
    });
    // Check for pass/fail in output
    if (output.includes('Tests:') || output.includes('Test Suites:')) {
      if (output.match(/Test Suites: \d+ failed/i)) {
        console.error('❌ Tests failed:');
        console.error(output);
        return false;
      }
    }
    console.log('✅ Tests passed');
    return true;
  } catch (error) {
    // Test runner exited with non-zero code
    console.error('❌ Tests failed:');
    if (error.stdout) {
      // Only show last 50 lines of output
      const lines = error.stdout.toString().split('\n');
      const lastLines = lines.slice(-50).join('\n');
      console.error(lastLines);
    }
    return false;
  }
}

// ==================== CHECK 2: Syntax Check ====================
function checkSyntax() {
  console.log('\n📝 Checking syntax...');

  const allJsFiles = globJSFilesRecursive('.');
  // Exclude node_modules, .git, tests
  const filteredFiles = allJsFiles.filter(
    (f) => !f.includes('node_modules') && !f.includes('.git')
  );
  
  if (filteredFiles.length === 0) {
    console.log('⚠️  No JS files found to check');
    return true;
  }

  let failed = [];
  for (const file of filteredFiles) {
    try {
      execSync(`node --check "${file.replace(/\\/g, '\\\\')}"`, { stdio: 'pipe', timeout: 10000 });
    } catch (e) {
      failed.push(file);
    }
  }

  if (failed.length === 0) {
    console.log(`✅ Syntax check passed (${filteredFiles.length} files)`);
    return true;
  } else {
    console.error(`❌ Syntax errors in ${failed.length} files:`);
    failed.forEach((f) => console.error('  - ' + f));
    return false;
  }
}

// ==================== CHECK 3: Production Logging Audit ====================
function checkProductionLogs() {
  console.log('\n📋 Checking production logs...');
  const mainFiles = getMainJSFiles();
  let violations = [];

  for (const file of mainFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Skip comment-only lines
        if (/^\s*\/\//.test(line)) continue;
        if (/^\s*\*/.test(line)) continue;

        // Skip logger definition lines: `warn: (m, ...) => console.warn(...)`
        if (/^\s*\w+:\s*\(/.test(line) && /=>\s*console\./.test(line)) continue;

        for (const pattern of PRODUCTION_LOG_PATTERNS) {
          pattern.lastIndex = 0; // Reset regex
          if (pattern.test(line)) {
            // Check if this line uses logger.js instead (log.info, log.warn, etc.)
            if (/log\.(info|debug|warn|error)\(/.test(line)) continue;

            violations.push({
              file: path.relative(process.cwd(), file),
              line: lineNum,
              content: line.trim().substring(0, 80),
            });
            break; // Only count once per line
          }
        }
      }
    } catch (e) {
      // Skip files we can't read
    }
  }

  if (violations.length === 0) {
    console.log('✅ No production logging violations');
    return true;
  } else {
    console.error(
      `❌ Found ${violations.length} production log violations:`
    );
    // Show max 10 violations
    violations.slice(0, 10).forEach((v) => {
      console.error(`  - ${v.file}:${v.line} ${v.content}`);
    });
    if (violations.length > 10) {
      console.error(`  ... and ${violations.length - 10} more`);
    }
    console.error(
      '\n💡 Fix: Use logger.js (log.info, log.warn, log.error) instead of console.*'
    );
    return false;
  }
}

// ==================== CHECK 5: Chrome API Validation ====================
function checkApiCalls() {
  console.log('\n🔍 Checking Chrome API calls...');
  const coreFiles = getMainJSFiles().filter(f => 
    f.includes('popup/popup.js') || 
    f.includes('background.js') || 
    f.includes('content.js') ||
    f.includes('offscreen.js')
  );
  
  let violations = [];
  
  for (const file of coreFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        
        // Check for deprecated targetTab parameter in tabCapture.getMediaStreamId
        if (/chrome\.tabCapture\.getMediaStreamId\s*\(\s*\{[^}]*targetTab/.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: lineNum,
            content: line.trim().substring(0, 100),
            message: 'targetTab is not valid in Chrome MV3 API for getMediaStreamId'
          });
        }
        
        // Check for chrome.tabCapture.get with targetTab
        if (/chrome\.tabCapture\.get\s*\(\s*\{[^}]*targetTab/.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: lineNum,
            content: line.trim().substring(0, 100),
            message: 'targetTab is deprecated in tabCapture.get()'
          });
        }
        
        // Check for old MV2 browser_action
        if (/browser_action\s*:/i.test(line) && !line.trim().startsWith('//')) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: lineNum,
            content: line.trim().substring(0, 100),
            message: 'browser_action is MV2, use action (MV3)'
          });
        }
      }
    } catch (e) {
      // Skip files we can't read
    }
  }
  
  if (violations.length === 0) {
    console.log('✅ No deprecated Chrome API calls found');
    return true;
  } else {
    console.error(`❌ Found ${violations.length} deprecated Chrome API calls:`);
    violations.forEach((v) => {
      console.error(`  - ${v.file}:${v.line} ${v.message}`);
      console.error(`    ${v.content}`);
    });
    console.error('\n💡 Fix: Remove deprecated parameters or update to MV3 API');
    return false;
  }
}

// ==================== CHECK 4: Manifest Validation ====================
function checkManifest() {
  console.log('\n🔧 Validating manifest.json...');
  let valid = true;
  let warnings = [];

  try {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

    // MV3 check
    if (manifest.manifest_version !== 3) {
      console.error(
        '❌ manifest_version should be 3 (MV3), found: ' +
          manifest.manifest_version
      );
      valid = false;
    }

    // Required fields
    const required = ['name', 'version', 'description'];
    for (const field of required) {
      if (!manifest[field]) {
        console.error(`❌ Missing required field: ${field}`);
        valid = false;
      }
    }

    // Background service worker (MV3)
    if (!manifest.background || !manifest.background.service_worker) {
      if (manifest.background && manifest.background.page) {
        console.error(
          '❌ background.page is MV2, use background.service_worker for MV3'
        );
        valid = false;
      } else {
        console.error(
          '❌ background.service_worker missing (MV3 requirement)'
        );
        valid = false;
      }
    }

    // Action vs browser_action (MV3)
    if (manifest.browser_action || manifest.page_action) {
      warnings.push(
        '⚠️  browser_action/page_action are MV2, use action (MV3)'
      );
    }

    // Dangerous permissions check
    const dangerousPermissions = ['tabs', 'webRequest', 'webRequestBlocking'];
    const perms = manifest.permissions || [];
    for (const perm of dangerousPermissions) {
      if (perms.includes(perm)) {
        console.error(`⚠️  Permission may need justification: ${perm}`);
      }
    }

    // <all_urls> warning
    const hostPerms = manifest.host_permissions || [];
    if (hostPerms.includes('<all_urls>')) {
      warnings.push(
        '⚠️  host_permissions includes <all_urls> — Chrome Web Store reviewers may flag this'
      );
    }

    // Web accessible resources
    if (manifest.web_accessible_resources) {
      const allResources = manifest.web_accessible_resources.flatMap(
        (r) => r.resources
      );

      // Check for HTML files in web_accessible_resources
      const htmlFiles = allResources.filter((r) => r.endsWith('.html'));
      if (htmlFiles.length > 0) {
        warnings.push(
          `⚠️  HTML files in web_accessible_resources: ${htmlFiles.join(', ')} — may not be necessary`
        );
      }

      // Check if all_resources have matches
      for (const res of manifest.web_accessible_resources) {
        if (!res.matches || res.matches.length === 0) {
          warnings.push(
            `⚠️  web_accessible_resources entry missing matches: ${res.resources.join(', ')}`
          );
        }
      }
    }

    if (valid && warnings.length === 0) {
      console.log('✅ Manifest validation passed (MV3 compliant)');
    } else if (valid && warnings.length > 0) {
      console.log('✅ Manifest validation passed (with warnings):');
      warnings.forEach((w) => console.log('  ' + w));
    } else {
      console.error('❌ Manifest validation failed');
    }
  } catch (e) {
    console.error('❌ Failed to parse manifest.json: ' + e.message);
    valid = false;
  }

  return valid;
}

// ==================== HELPERS ====================
function getJSFiles() {
  const allJsFiles = globJSFilesRecursive('.');
  return allJsFiles.filter(
    (f) => !f.includes('node_modules') && !f.includes('.git')
  );
}

function getMainJSFiles() {
  const allJsFiles = globJSFilesRecursive('.');
  return allJsFiles.filter(
    (f) => !f.includes('node_modules') && !f.includes('.git') && !f.includes('/tests/')
  );
}

function globJSFilesRecursive(dir) {
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        results.push(...globJSFiles(fullPath));
      } else if (stat.isFile() && item.endsWith('.js')) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Skip
  }
  return results;
}

// ==================== MAIN ====================
function main() {
  console.log('🚀 Running validation checks...\n');

  const results = [
    checkTests(),
    checkSyntax(),
    checkProductionLogs(),
    checkManifest(),
    checkApiCalls(),
  ];

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed}/${total} checks passed`);

  if (passed === total) {
    console.log('✅ All validation checks passed!');
    process.exit(EXIT_CODE.SUCCESS);
  } else {
    console.log('❌ Some checks failed. Fix before committing.');
    process.exit(EXIT_CODE.FAIL);
  }
}

main();
