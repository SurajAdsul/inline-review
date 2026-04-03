import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAnnotations } from '../skills/inline-review/scripts/formatter.js';

describe('formatAnnotations', () => {
  it('returns no-comments message for empty array', () => {
    const result = formatAnnotations([]);
    assert.ok(result.includes('no feedback'));
    assert.ok(result.includes('look good'));
  });

  it('returns no-comments message for null/undefined', () => {
    assert.ok(formatAnnotations(null).includes('no feedback'));
    assert.ok(formatAnnotations(undefined).includes('no feedback'));
  });

  it('formats a single annotation', () => {
    const result = formatAnnotations([
      {
        file: 'src/app.ts',
        startLine: 42,
        endLine: 42,
        lineType: 'new',
        comment: 'Rename this variable',
        context: ['+  const foo = bar;'],
      },
    ]);

    assert.ok(result.includes('## Diff Review Feedback'));
    assert.ok(result.includes('### src/app.ts (line 42)'));
    assert.ok(result.includes('```diff'));
    assert.ok(result.includes('+  const foo = bar;'));
    assert.ok(result.includes('> Rename this variable'));
    assert.ok(result.includes('Address each comment'));
  });

  it('formats a range annotation', () => {
    const result = formatAnnotations([
      {
        file: 'src/app.ts',
        startLine: 10,
        endLine: 15,
        lineType: 'new',
        comment: 'This whole block needs refactoring',
        context: ['+  line1', '+  line2'],
      },
    ]);

    assert.ok(result.includes('### src/app.ts (lines 10-15)'));
  });

  it('formats multiple annotations in the same file sorted by line', () => {
    const result = formatAnnotations([
      {
        file: 'src/app.ts',
        startLine: 50,
        endLine: 50,
        lineType: 'new',
        comment: 'Second comment',
        context: ['+  line50'],
      },
      {
        file: 'src/app.ts',
        startLine: 10,
        endLine: 10,
        lineType: 'new',
        comment: 'First comment',
        context: ['+  line10'],
      },
    ]);

    const firstIdx = result.indexOf('First comment');
    const secondIdx = result.indexOf('Second comment');
    assert.ok(firstIdx < secondIdx, 'Comments should be sorted by line number');
  });

  it('formats annotations across multiple files', () => {
    const result = formatAnnotations([
      {
        file: 'src/app.ts',
        startLine: 10,
        endLine: 10,
        lineType: 'new',
        comment: 'App comment',
        context: ['+  appLine'],
      },
      {
        file: 'src/utils.ts',
        startLine: 5,
        endLine: 5,
        lineType: 'new',
        comment: 'Utils comment',
        context: ['+  utilsLine'],
      },
    ]);

    assert.ok(result.includes('### src/app.ts (line 10)'));
    assert.ok(result.includes('### src/utils.ts (line 5)'));
    assert.ok(result.includes('> App comment'));
    assert.ok(result.includes('> Utils comment'));
  });

  it('handles multi-line comments', () => {
    const result = formatAnnotations([
      {
        file: 'src/app.ts',
        startLine: 10,
        endLine: 10,
        lineType: 'new',
        comment: 'Line one\nLine two\nLine three',
        context: ['+  code'],
      },
    ]);

    assert.ok(result.includes('> Line one'));
    assert.ok(result.includes('> Line two'));
    assert.ok(result.includes('> Line three'));
  });

  it('handles annotation without context', () => {
    const result = formatAnnotations([
      {
        file: 'src/app.ts',
        startLine: 10,
        endLine: 10,
        lineType: 'new',
        comment: 'General comment',
        context: [],
      },
    ]);

    assert.ok(result.includes('### src/app.ts (line 10)'));
    assert.ok(result.includes('> General comment'));
    assert.ok(!result.includes('```diff'));
  });
});
