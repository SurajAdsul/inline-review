import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiffMeta, parseDiffFile } from '../skills/inline-review/scripts/diff-parser.js';

const MODIFIED_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index abc1234..def5678 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -10,6 +10,8 @@ import { config } from \'./config\';',
  ' const app = express();',
  ' ',
  ' app.use(cors());',
  '+app.use(helmet());',
  '+app.use(compression());',
  ' app.use(express.json());',
  ' ',
  ' export default app;',
].join('\n') + '\n';

const ADDED_DIFF = [
  'diff --git a/src/utils/logger.ts b/src/utils/logger.ts',
  'new file mode 100644',
  'index 0000000..abc1234',
  '--- /dev/null',
  '+++ b/src/utils/logger.ts',
  '@@ -0,0 +1,5 @@',
  '+import winston from \'winston\';',
  '+',
  '+export const logger = winston.createLogger({',
  '+  level: \'info\',',
  '+});',
].join('\n') + '\n';

const DELETED_DIFF = [
  'diff --git a/src/old-module.ts b/src/old-module.ts',
  'deleted file mode 100644',
  'index abc1234..0000000',
  '--- a/src/old-module.ts',
  '+++ /dev/null',
  '@@ -1,3 +0,0 @@',
  '-export function oldFunction() {',
  '-  return \'deprecated\';',
  '-}',
].join('\n') + '\n';

const RENAMED_DIFF = [
  'diff --git a/src/helpers.ts b/src/utils/helpers.ts',
  'similarity index 95%',
  'rename from src/helpers.ts',
  'rename to src/utils/helpers.ts',
  'index abc1234..def5678 100644',
  '--- a/src/helpers.ts',
  '+++ b/src/utils/helpers.ts',
  '@@ -1,4 +1,4 @@',
  '-export function helper() {',
  '+export function helperV2() {',
  '   return true;',
  ' }',
].join('\n') + '\n';

const BINARY_DIFF = [
  'diff --git a/assets/logo.png b/assets/logo.png',
  'new file mode 100644',
  'index 0000000..abc1234',
  'Binary files /dev/null and b/assets/logo.png differ',
].join('\n') + '\n';

const MULTI_HUNK_DIFF = [
  'diff --git a/src/server.ts b/src/server.ts',
  'index abc1234..def5678 100644',
  '--- a/src/server.ts',
  '+++ b/src/server.ts',
  '@@ -5,6 +5,7 @@ import express from \'express\';',
  ' const app = express();',
  ' ',
  ' app.use(cors());',
  '+app.use(helmet());',
  ' ',
  ' app.get(\'/\', (req, res) => {',
  '   res.send(\'hello\');',
  '@@ -20,7 +21,7 @@ app.get(\'/health\', (req, res) => {',
  '   res.json({ status: \'ok\' });',
  ' });',
  ' ',
  '-app.listen(3000);',
  '+app.listen(process.env.PORT || 3000);',
  ' ',
  ' export default app;',
].join('\n') + '\n';

const NO_NEWLINE_DIFF = [
  'diff --git a/README.md b/README.md',
  'index abc1234..def5678 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,3 +1,3 @@',
  ' # Project',
  ' ',
  '-Old description',
  '\\ No newline at end of file',
  '+New description',
  '\\ No newline at end of file',
].join('\n') + '\n';

const MULTI_FILE_DIFF = MODIFIED_DIFF + ADDED_DIFF + DELETED_DIFF;

// --- parseDiffMeta tests ---

describe('parseDiffMeta', () => {
  it('returns empty files for empty diff', () => {
    assert.deepEqual(parseDiffMeta(''), { files: [] });
    assert.deepEqual(parseDiffMeta('  \n  '), { files: [] });
    assert.deepEqual(parseDiffMeta(null), { files: [] });
  });

  it('parses a modified file', () => {
    const result = parseDiffMeta(MODIFIED_DIFF);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'src/app.ts');
    assert.equal(result.files[0].status, 'modified');
    assert.equal(result.files[0].additions, 2);
    assert.equal(result.files[0].deletions, 0);
  });

  it('parses an added file', () => {
    const result = parseDiffMeta(ADDED_DIFF);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'src/utils/logger.ts');
    assert.equal(result.files[0].status, 'added');
    assert.equal(result.files[0].additions, 5);
    assert.equal(result.files[0].deletions, 0);
  });

  it('parses a deleted file', () => {
    const result = parseDiffMeta(DELETED_DIFF);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'src/old-module.ts');
    assert.equal(result.files[0].status, 'deleted');
    assert.equal(result.files[0].additions, 0);
    assert.equal(result.files[0].deletions, 3);
  });

  it('parses a renamed file', () => {
    const result = parseDiffMeta(RENAMED_DIFF);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'src/utils/helpers.ts');
    assert.equal(result.files[0].oldPath, 'src/helpers.ts');
    assert.equal(result.files[0].status, 'renamed');
  });

  it('parses a binary file', () => {
    const result = parseDiffMeta(BINARY_DIFF);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'assets/logo.png');
    assert.equal(result.files[0].binary, true);
  });

  it('parses multiple files', () => {
    const result = parseDiffMeta(MULTI_FILE_DIFF);
    assert.equal(result.files.length, 3);
    assert.equal(result.files[0].path, 'src/app.ts');
    assert.equal(result.files[1].path, 'src/utils/logger.ts');
    assert.equal(result.files[2].path, 'src/old-module.ts');
  });
});

// --- parseDiffFile tests ---

describe('parseDiffFile', () => {
  it('returns null for empty diff', () => {
    assert.equal(parseDiffFile('', 'foo.ts'), null);
    assert.equal(parseDiffFile(null, 'foo.ts'), null);
  });

  it('returns null for non-existent file', () => {
    assert.equal(parseDiffFile(MODIFIED_DIFF, 'nonexistent.ts'), null);
  });

  it('parses a modified file with correct line numbers', () => {
    const result = parseDiffFile(MODIFIED_DIFF, 'src/app.ts');
    assert.equal(result.path, 'src/app.ts');
    assert.equal(result.status, 'modified');
    assert.equal(result.hunks.length, 1);

    const hunk = result.hunks[0];
    assert.equal(hunk.startLineOld, 10);
    assert.equal(hunk.startLineNew, 10);

    // Find the addition lines
    const additions = hunk.lines.filter((l) => l.type === 'addition');
    assert.equal(additions.length, 2);
    assert.equal(additions[0].content, 'app.use(helmet());');
    assert.equal(additions[0].lineNew, 13);
    assert.equal(additions[0].lineOld, null);
    assert.equal(additions[1].content, 'app.use(compression());');
    assert.equal(additions[1].lineNew, 14);
  });

  it('parses an added file', () => {
    const result = parseDiffFile(ADDED_DIFF, 'src/utils/logger.ts');
    assert.equal(result.status, 'added');
    assert.equal(result.hunks.length, 1);

    const lines = result.hunks[0].lines;
    assert.ok(lines.every((l) => l.type === 'addition'));
    assert.equal(lines.length, 5);
    assert.equal(lines[0].lineNew, 1);
  });

  it('parses a deleted file', () => {
    const result = parseDiffFile(DELETED_DIFF, 'src/old-module.ts');
    assert.equal(result.status, 'deleted');
    assert.equal(result.hunks.length, 1);

    const lines = result.hunks[0].lines;
    assert.ok(lines.every((l) => l.type === 'deletion'));
    assert.equal(lines.length, 3);
    assert.equal(lines[0].lineOld, 1);
  });

  it('parses a renamed file by new path', () => {
    const result = parseDiffFile(RENAMED_DIFF, 'src/utils/helpers.ts');
    assert.equal(result.status, 'renamed');
    assert.equal(result.hunks.length, 1);

    const deletion = result.hunks[0].lines.find((l) => l.type === 'deletion');
    const addition = result.hunks[0].lines.find((l) => l.type === 'addition');
    assert.equal(deletion.content, 'export function helper() {');
    assert.equal(addition.content, 'export function helperV2() {');
  });

  it('parses a renamed file by old path', () => {
    const result = parseDiffFile(RENAMED_DIFF, 'src/helpers.ts');
    assert.ok(result);
    assert.equal(result.path, 'src/utils/helpers.ts');
  });

  it('handles binary files', () => {
    const result = parseDiffFile(BINARY_DIFF, 'assets/logo.png');
    assert.equal(result.binary, true);
    assert.deepEqual(result.hunks, []);
  });

  it('parses multi-hunk diffs', () => {
    const result = parseDiffFile(MULTI_HUNK_DIFF, 'src/server.ts');
    assert.equal(result.hunks.length, 2);

    assert.equal(result.hunks[0].startLineOld, 5);
    assert.equal(result.hunks[1].startLineOld, 20);

    const hunk1Additions = result.hunks[0].lines.filter(
      (l) => l.type === 'addition'
    );
    assert.equal(hunk1Additions[0].content, 'app.use(helmet());');

    const hunk2Additions = result.hunks[1].lines.filter(
      (l) => l.type === 'addition'
    );
    assert.equal(
      hunk2Additions[0].content,
      "app.listen(process.env.PORT || 3000);"
    );
  });

  it('handles no newline at end of file', () => {
    const result = parseDiffFile(NO_NEWLINE_DIFF, 'README.md');
    assert.equal(result.hunks.length, 1);

    const lines = result.hunks[0].lines;
    // Should not contain the "No newline" marker as a line
    assert.ok(lines.every((l) => !l.content.includes('No newline')));
  });

  it('finds file in multi-file diff', () => {
    const result = parseDiffFile(MULTI_FILE_DIFF, 'src/utils/logger.ts');
    assert.equal(result.path, 'src/utils/logger.ts');
    assert.equal(result.status, 'added');
  });
});
