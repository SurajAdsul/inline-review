/**
 * Formats annotations into markdown output for Claude Code.
 */

const INSTRUCTION_PREFIX = `The user has reviewed your changes and left the following feedback. Address each comment by making the requested changes. If a comment is a question, answer it and ask if a code change is needed.`;

const NO_COMMENTS_MESSAGE = `The user has reviewed your changes and has no feedback. The changes look good — proceed with the next step or ask the user if they'd like to commit.`;

/**
 * Format an array of annotations into markdown.
 *
 * Each annotation: { file, startLine, endLine, lineType, comment, context }
 * context is an array of diff lines (prefixed with +/-/space)
 */
export function formatAnnotations(annotations) {
  if (!annotations || annotations.length === 0) {
    return NO_COMMENTS_MESSAGE;
  }

  // Group by file, preserving first-seen order
  const fileOrder = [];
  const byFile = {};

  for (const ann of annotations) {
    if (!byFile[ann.file]) {
      byFile[ann.file] = [];
      fileOrder.push(ann.file);
    }
    byFile[ann.file].push(ann);
  }

  // Sort within each file by startLine
  for (const file of fileOrder) {
    byFile[file].sort((a, b) => a.startLine - b.startLine);
  }

  const sections = [];

  for (const file of fileOrder) {
    for (const ann of byFile[file]) {
      const lineRef =
        ann.startLine === ann.endLine
          ? `line ${ann.startLine}`
          : `lines ${ann.startLine}-${ann.endLine}`;

      const header = `### ${ann.file} (${lineRef})`;

      let contextBlock = '';
      if (ann.context && ann.context.length > 0) {
        contextBlock = '```diff\n' + ann.context.join('\n') + '\n```';
      }

      const comment = ann.comment
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

      sections.push(
        [header, contextBlock, comment].filter(Boolean).join('\n')
      );
    }
  }

  return (
    INSTRUCTION_PREFIX +
    '\n\n## Diff Review Feedback\n\n' +
    sections.join('\n\n')
  );
}
