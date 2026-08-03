#!/usr/bin/env node
/**
 * write.js — Reliable file writer for agents
 * 
 * Standalone CLI tool that writes files when built-in Write/Edit tools fail.
 * Zero dependencies — pure Node.js built-in modules.
 * 
 * Usage:
 *   # Inline content
 *   node scripts/write.js --path tests/test.js --content "console.log('hello')"
 * 
 *   # Stdin pipe
 *   echo "world" | node scripts/write.js --path tests/test.js --stdin
 * 
 *   # Auto-detect (if stdin present, reads from stdin)
 *   cat source.txt | node scripts/write.js --path target.txt
 * 
 *   # Create parent directories
 *   node scripts/write.js --path deep/nested/file.js --content "..." --create-dirs
 * 
 * Run: npm run write -- --path <file> --content "..."
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// Constants
// ============================================================================

const USAGE = `
write.js — Reliable file writer for agents

Usage:
  node scripts/write.js --path <file> [--content "<text>"] [--stdin] [--create-dirs]

Options:
  --path <file>        Target file path (relative to project root) [required]
  --content "<text>"   File content as inline string
  --stdin              Read content from stdin pipe
  --create-dirs        Create parent directories if they don't exist
  --help               Show this help message

Examples:
  node scripts/write.js --path tests/test.js --content "console.log('hi')"
  echo "world" | node scripts/write.js --path tests/test.js --stdin
  cat template.js | node scripts/write.js --path src/output.js --create-dirs
`;

const BACKUP_SUFFIX = '.write.bak';
const TMP_SUFFIX = '.write.tmp';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(argv) {
  const args = {
    path: null,
    content: null,
    stdin: false,
    createDirs: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--path' && i + 1 < argv.length) {
      args.path = argv[++i];
    } else if (arg === '--content' && i + 1 < argv.length) {
      // Handle quoted content — join remaining args if needed
      let content = '';
      // Check if content starts with unescaped quote
      if (argv[i].startsWith('"') && !argv[i].endsWith('"')) {
        // Gather until closing quote
        const parts = [argv[i]];
        while (i + 1 < argv.length && !parts[parts.length - 1].endsWith('"')) {
          i++;
          parts.push(argv[i]);
        }
        content = parts.join(' ').replace(/^"|"$/g, '');
      } else {
        content = argv[++i];
      }
      args.content = content;
    } else if (arg === '--stdin') {
      args.stdin = true;
    } else if (arg === '--create-dirs') {
      args.createDirs = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

// ============================================================================
// Path Validation
// ============================================================================

function validatePath(filePath) {
  // Reject absolute paths
  if (path.isAbsolute(filePath)) {
    console.error(`Error: absolute paths are not allowed: ${filePath}`);
    console.error('Use relative paths from project root.');
    process.exit(1);
  }

  // Reject path traversal
  const normalized = path.normalize(filePath);
  if (normalized.startsWith('..') || normalized.startsWith('/')) {
    console.error(`Error: path traversal detected: ${filePath}`);
    console.error('Only relative paths within the project are allowed.');
    process.exit(1);
  }

  // Reject empty path
  if (!filePath || filePath.trim() === '') {
    console.error('Error: --path is required.');
    console.error(USAGE);
    process.exit(1);
  }

  // Resolve to absolute path within project
  const projectRoot = process.cwd();
  const absolutePath = path.resolve(projectRoot, filePath);

  // Double-check the resolved path is within project root
  if (!absolutePath.startsWith(projectRoot + path.sep) && absolutePath !== projectRoot) {
    console.error(`Error: path escapes project root: ${filePath}`);
    process.exit(1);
  }

  return absolutePath;
}

// ============================================================================
// Content Reading
// ============================================================================

function readContent(args) {
  // If stdin mode, read from stdin
  if (args.stdin || !args.content) {
    // Check if stdin is available (not a TTY)
    if (process.stdin.isTTY) {
      console.error('Error: no content provided and stdin is empty.');
      console.error('Use --content "<text>" or pipe content via stdin.');
      console.error(USAGE);
      process.exit(1);
    }

    // Read all stdin
    let data = '';
    return new Promise((resolve, reject) => {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', (err) => reject(err));
    });
  }

  // Inline content provided
  return Promise.resolve(args.content);
}

// ============================================================================
// File Operations
// ============================================================================

function createBackup(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    return false; // No backup needed
  }

  const backupPath = absolutePath + BACKUP_SUFFIX;
  try {
    fs.copyFileSync(absolutePath, backupPath);
    console.log(`  Backup: ${backupPath}`);
    return true;
  } catch (err) {
    console.warn(`  Warning: failed to create backup: ${err.message}`);
    return false;
  }
}

function writeFile(absolutePath, content) {
  const tmpPath = absolutePath + TMP_SUFFIX;

  try {
    // Write to temp file first (atomic write pattern)
    fs.writeFileSync(tmpPath, content, 'utf8');
    
    // Atomic rename
    fs.renameSync(tmpPath, absolutePath);
    
    return true;
  } catch (err) {
    // Clean up temp file on failure
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {
      // Ignore cleanup errors
    }
    throw err;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);

  // Help
  if (args.help) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  // Validate path
  const absolutePath = validatePath(args.path);
  const relativePath = path.relative(process.cwd(), absolutePath);

  console.log('write.js — Reliable file writer');
  console.log(`  Target: ${relativePath}`);

  // Read content
  let content;
  try {
    content = await readContent(args);
  } catch (err) {
    console.error(`Error reading content: ${err.message}`);
    process.exit(1);
  }

  if (!content && content !== '') {
    console.error('Error: file content is empty.');
    process.exit(1);
  }

  // Create directories if requested
  if (args.createDirs) {
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  Created: ${dir}`);
      } catch (err) {
        console.error(`Error creating directory: ${err.message}`);
        process.exit(1);
      }
    }
  }

  // Create backup if file exists
  const hadBackup = createBackup(absolutePath);

  // Write file
  try {
    writeFile(absolutePath, content);
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      console.error(`Error: permission denied — cannot write to ${relativePath}`);
    } else if (err.code === 'ENOENT') {
      console.error(`Error: directory does not exist — use --create-dirs flag`);
    } else {
      console.error(`Error writing file: ${err.message}`);
    }
    // Restore backup on failure
    if (hadBackup) {
      const backupPath = absolutePath + BACKUP_SUFFIX;
      try {
        fs.copyFileSync(backupPath, absolutePath);
        console.log(`  Restored from backup`);
      } catch (_) {
        console.warn(`  Warning: failed to restore backup`);
      }
    }
    process.exit(1);
  }

  // Summary
  const sizeBytes = Buffer.byteLength(content, 'utf8');
  const sizeKB = (sizeBytes / 1024).toFixed(1);
  console.log(`  Size: ${sizeKB} KB (${sizeBytes} bytes)`);
  console.log(`  Status: ✅ Written`);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
