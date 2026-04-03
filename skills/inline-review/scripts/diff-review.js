#!/usr/bin/env node

import { execSync, exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from './server.js';

const args = process.argv.slice(2);
let diffMode = 'head';
let port = 0;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--staged':
      diffMode = 'staged';
      break;
    case '--unstaged':
      diffMode = 'unstaged';
      break;
    case '--port':
      port = parseInt(args[++i], 10);
      if (isNaN(port)) {
        console.error('Error: --port requires a numeric value');
        process.exit(1);
      }
      break;
    case '--help':
    case '-h':
      console.log(`Usage: diff-review [options]

Options:
  --staged      Show staged changes only (git diff --cached)
  --unstaged    Show unstaged changes only (git diff)
  --port <n>    Use a specific port (default: random)
  --help, -h    Show this help message

Default: shows all uncommitted changes (git diff HEAD)`);
      process.exit(0);
      break;
    default:
      console.error(`Unknown option: ${args[i]}`);
      process.exit(1);
  }
}

const diffCommands = {
  head: 'git diff HEAD',
  staged: 'git diff --cached',
  unstaged: 'git diff',
};

let rawDiff;
try {
  rawDiff = execSync(diffCommands[diffMode], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (err) {
  if (err.status !== null && err.stderr) {
    console.error(`Error running git diff: ${err.stderr.trim()}`);
  } else {
    console.error('Error: not a git repository or git is not installed');
  }
  process.exit(1);
}

// Include untracked files in default (head) mode
if (diffMode === 'head') {
  try {
    const untracked = execSync('git ls-files --others --exclude-standard', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();

    if (untracked) {
      for (const filePath of untracked.split('\n')) {
        try {
          const buf = readFileSync(filePath);
          // Skip binary files (check for null bytes in first 8KB)
          const sample = buf.subarray(0, 8192);
          if (sample.includes(0)) continue;

          const content = buf.toString('utf8');
          const lines = content.split('\n');
          // Remove trailing empty line from final newline
          if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

          const lineCount = lines.length;
          const diffLines = lines.map(l => '+' + l).join('\n');

          rawDiff += `\ndiff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lineCount} @@\n${diffLines}\n`;
        } catch {
          // Skip files that can't be read
        }
      }
    }
  } catch {
    // Best-effort — silently ignore if git ls-files fails
  }
}

if (!rawDiff.trim()) {
  console.log('No changes to review.');
  process.exit(0);
}

const cwd = process.cwd();

try {
  const server = await createServer(rawDiff, { port, cwd, diffType: diffMode });
  const url = `http://localhost:${server.port}`;

  console.error(`diff-review running at ${url}`);

  const openCmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

  exec(`${openCmd} ${url}`, (err) => {
    if (err) {
      console.error(`Could not open browser. Please visit: ${url}`);
    }
  });

  const shutdown = () => {
    server.close();
    process.exit(1);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const formatted = await server.result;
  process.stdout.write(formatted);
  process.exit(0);
} catch (err) {
  if (err.message === 'Browser disconnected') {
    process.exit(1);
  }
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
