/**
 * Parses unified diff output into structured JSON.
 */

/**
 * Split raw diff into per-file blocks.
 * Each block starts with "diff --git".
 */
function splitDiffBlocks(rawDiff) {
  const blocks = [];
  const lines = rawDiff.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) blocks.push(current);
      current = { header: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Extract file path and status from a diff block's header lines.
 */
function parseFileHeader(block) {
  const lines = block.lines;
  let oldPath = null;
  let newPath = null;
  let status = 'modified';
  let binary = false;
  let renameFrom = null;
  let renameTo = null;

  // Extract path from "diff --git a/path b/path" header as fallback
  const gitHeaderMatch = block.header.match(/^diff --git a\/(.+) b\/(.+)$/);
  const headerPathA = gitHeaderMatch ? gitHeaderMatch[1] : null;
  const headerPathB = gitHeaderMatch ? gitHeaderMatch[2] : null;

  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      oldPath = line.slice(6);
    } else if (line.startsWith('--- /dev/null')) {
      oldPath = '/dev/null';
    } else if (line.startsWith('+++ b/')) {
      newPath = line.slice(6);
    } else if (line.startsWith('+++ /dev/null')) {
      newPath = '/dev/null';
    } else if (line.startsWith('rename from ')) {
      renameFrom = line.slice(12);
    } else if (line.startsWith('rename to ')) {
      renameTo = line.slice(10);
    } else if (line.startsWith('Binary files')) {
      binary = true;
    } else if (line.startsWith('@@')) {
      break; // stop at first hunk
    }
  }

  // Use header paths as fallback when --- / +++ are missing (e.g. binary files)
  if (!oldPath && headerPathA) oldPath = headerPathA;
  if (!newPath && headerPathB) newPath = headerPathB;

  if (renameFrom && renameTo) {
    status = 'renamed';
    return { path: renameTo, oldPath: renameFrom, status, binary };
  }

  if (oldPath === '/dev/null') {
    status = 'added';
    return { path: newPath, status, binary };
  }

  if (newPath === '/dev/null') {
    status = 'deleted';
    return { path: oldPath, status, binary };
  }

  return { path: newPath || oldPath, status, binary };
}

/**
 * Count additions and deletions in a diff block.
 */
function countChanges(block) {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;

  for (const line of block.lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Parse hunk header: @@ -startOld,countOld +startNew,countNew @@
 */
function parseHunkHeader(line) {
  const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return null;
  return {
    header: line,
    startLineOld: parseInt(match[1], 10),
    startLineNew: parseInt(match[2], 10),
  };
}

/**
 * Parse all hunks from a diff block into structured line data.
 */
function parseHunks(block) {
  const hunks = [];
  let currentHunk = null;
  let lineOld = 0;
  let lineNew = 0;

  for (const line of block.lines) {
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line);
      if (!parsed) continue;
      currentHunk = {
        header: parsed.header,
        startLineOld: parsed.startLineOld,
        startLineNew: parsed.startLineNew,
        lines: [],
      };
      lineOld = parsed.startLineOld;
      lineNew = parsed.startLineNew;
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        type: 'addition',
        lineOld: null,
        lineNew: lineNew,
        content: line.slice(1),
      });
      lineNew++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        type: 'deletion',
        lineOld: lineOld,
        lineNew: null,
        content: line.slice(1),
      });
      lineOld++;
    } else if (line.startsWith('\\')) {
      // "No newline at end of file" — skip
      continue;
    } else if (line.startsWith(' ')) {
      // Context line (starts with space)
      currentHunk.lines.push({
        type: 'context',
        lineOld: lineOld,
        lineNew: lineNew,
        content: line.slice(1),
      });
      lineOld++;
      lineNew++;
    }
    // Ignore empty lines (trailing newlines from string splitting)
  }

  return hunks;
}

/**
 * Returns file tree metadata (no line content).
 * { files: [{ path, status, additions, deletions }] }
 */
export function parseDiffMeta(rawDiff) {
  if (!rawDiff || !rawDiff.trim()) {
    return { files: [] };
  }

  const blocks = splitDiffBlocks(rawDiff);
  const files = blocks.map((block) => {
    const header = parseFileHeader(block);
    const { additions, deletions } = countChanges(block);
    const result = {
      path: header.path,
      status: header.status,
      additions,
      deletions,
    };
    if (header.status === 'renamed' && header.oldPath) {
      result.oldPath = header.oldPath;
    }
    if (header.binary) {
      result.binary = true;
    }
    return result;
  });

  return { files };
}

/**
 * Returns full hunk/line data for a single file.
 * { path, status, hunks: [...] }
 */
export function parseDiffFile(rawDiff, filePath) {
  if (!rawDiff || !rawDiff.trim()) {
    return null;
  }

  const blocks = splitDiffBlocks(rawDiff);

  for (const block of blocks) {
    const header = parseFileHeader(block);
    if (header.path === filePath || header.oldPath === filePath) {
      if (header.binary) {
        return {
          path: header.path,
          status: header.status,
          binary: true,
          hunks: [],
        };
      }
      return {
        path: header.path,
        status: header.status,
        hunks: parseHunks(block),
      };
    }
  }

  return null;
}
