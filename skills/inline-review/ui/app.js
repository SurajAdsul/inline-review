/**
 * diff-review client app
 */

// --- State ---
const state = {
  files: [],
  meta: {},
  fileCache: {},
  activeFile: null,
  activeFileIndex: -1,
  annotations: [],
  hoveredRow: null,
  selectionStart: null,
  isSelecting: false,
  viewMode: localStorage.getItem('diff-review-viewMode') || 'split',
};

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initShortcutsOverlay();
  startHeartbeat();

  try {
    const res = await fetch('/api/diff');
    const data = await res.json();
    state.files = data.files;
    state.meta = data.meta;

    document.getElementById('diff-type-badge').textContent =
      state.meta.diffType === 'staged' ? 'staged' :
      state.meta.diffType === 'unstaged' ? 'unstaged' : 'HEAD';

    renderFileTree();
    renderSummary();

    if (state.files.length > 0) {
      loadFile(state.files[0].path, 0);
    } else {
      document.getElementById('diff-empty').textContent = 'No changes found.';
    }
  } catch (err) {
    document.getElementById('diff-empty').textContent = 'Error loading diff.';
    console.error(err);
  }

  initViewModeToggle();
  initAnnotationEvents();
  initKeyboardShortcuts();
  initSubmit();
});

// --- Heartbeat ---
function startHeartbeat() {
  setInterval(() => fetch('/api/heartbeat').catch(() => {}), 3000);
}

// --- File Tree ---
function renderFileTree() {
  const container = document.getElementById('file-tree');
  container.innerHTML = '';

  // Group files by directory
  const tree = {};
  for (const file of state.files) {
    const parts = file.path.split('/');
    const fileName = parts.pop();
    const dir = parts.join('/') || '.';
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push({ ...file, fileName });
  }

  const dirs = Object.keys(tree).sort();

  for (const dir of dirs) {
    const details = document.createElement('details');
    details.className = 'dir-toggle';
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = dir === '.' ? '(root)' : dir;
    details.appendChild(summary);

    const fileList = document.createElement('div');
    fileList.className = 'pl-3';

    for (const file of tree[dir]) {
      const idx = state.files.findIndex(f => f.path === file.path);
      const item = document.createElement('div');
      item.className = 'file-tree-item';
      item.dataset.path = file.path;
      item.dataset.index = idx;

      const statusIcon = document.createElement('span');
      statusIcon.className = `status-${file.status}`;
      statusIcon.textContent =
        file.status === 'modified' ? 'M' :
        file.status === 'added' ? 'A' :
        file.status === 'deleted' ? 'D' :
        file.status === 'renamed' ? 'R' : '?';
      statusIcon.style.fontWeight = '600';
      statusIcon.style.fontSize = '0.7rem';
      statusIcon.style.width = '1rem';
      statusIcon.style.textAlign = 'center';

      const name = document.createElement('span');
      name.className = 'truncate';
      name.textContent = file.fileName;

      const changes = document.createElement('span');
      changes.className = 'file-changes';
      const parts = [];
      if (file.additions > 0) parts.push(`<span class="add-count">+${file.additions}</span>`);
      if (file.deletions > 0) parts.push(`<span class="del-count">-${file.deletions}</span>`);
      changes.innerHTML = parts.join(' ');

      item.appendChild(statusIcon);
      item.appendChild(name);
      item.appendChild(changes);

      item.addEventListener('click', () => loadFile(file.path, idx));
      fileList.appendChild(item);
    }

    details.appendChild(fileList);
    container.appendChild(details);
  }
}

function renderSummary() {
  const el = document.getElementById('file-summary');
  const totalFiles = state.files.length;
  const totalAdd = state.files.reduce((s, f) => s + f.additions, 0);
  const totalDel = state.files.reduce((s, f) => s + f.deletions, 0);
  el.innerHTML = `${totalFiles} file${totalFiles !== 1 ? 's' : ''} &nbsp; <span class="add-count">+${totalAdd}</span> <span class="del-count">-${totalDel}</span>`;
}

// --- File Loading ---
async function loadFile(filePath, index) {
  state.activeFile = filePath;
  state.activeFileIndex = index >= 0 ? index : state.files.findIndex(f => f.path === filePath);

  // Highlight in tree
  document.querySelectorAll('.file-tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === filePath);
  });

  const diffContent = document.getElementById('diff-content');
  const diffEmpty = document.getElementById('diff-empty');

  // Check cache
  if (!state.fileCache[filePath]) {
    diffEmpty.textContent = 'Loading...';
    diffEmpty.classList.remove('hidden');
    diffContent.classList.add('hidden');

    try {
      const res = await fetch(`/api/diff?file=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error('Failed to load file');
      state.fileCache[filePath] = await res.json();
    } catch (err) {
      diffEmpty.textContent = `Error loading ${filePath}`;
      console.error(err);
      return;
    }
  }

  diffEmpty.classList.add('hidden');
  diffContent.classList.remove('hidden');
  renderDiff(state.fileCache[filePath]);
}

// --- Diff Rendering ---
function renderDiff(fileData) {
  if (state.viewMode === 'split') {
    renderDiffSplit(fileData);
  } else {
    renderDiffUnified(fileData);
  }
}

function renderFileHeader(fileData) {
  const file = state.files.find(f => f.path === fileData.path);
  const isUnified = state.viewMode === 'unified';

  let html = `<div class="file-header px-4 py-2 flex items-center gap-2">
    <span class="status-${fileData.status} font-semibold text-xs">${fileData.status.toUpperCase()}</span>
    <span class="text-sm font-medium">${SyntaxHighlight.escapeHtml(fileData.path)}</span>`;
  if (file) {
    html += `<span class="text-xs text-gray-400">`;
    if (file.additions > 0) html += `<span class="add-count">+${file.additions}</span> `;
    if (file.deletions > 0) html += `<span class="del-count">-${file.deletions}</span>`;
    html += `</span>`;
  }
  html += `<div class="ml-auto flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
    <button class="view-mode-btn text-xs px-2 py-0.5 ${!isUnified ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}" data-mode="split">Split</button>
    <button class="view-mode-btn text-xs px-2 py-0.5 ${isUnified ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}" data-mode="unified">Unified</button>
  </div>`;
  html += `</div>`;
  return html;
}

function initViewModeToggle() {
  document.getElementById('diff-content').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === state.viewMode) return;
    state.viewMode = mode;
    localStorage.setItem('diff-review-viewMode', mode);
    refreshCurrentDiff();
  });
}

function renderDiffUnified(fileData) {
  const container = document.getElementById('diff-content');
  const lang = SyntaxHighlight.detectLanguage(fileData.path);

  let html = renderFileHeader(fileData);

  if (fileData.binary) {
    html += `<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-600">Binary file</div>`;
    container.innerHTML = html;
    return;
  }

  if (fileData.hunks.length === 0) {
    html += `<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-600">No content changes</div>`;
    container.innerHTML = html;
    return;
  }

  // 3 columns: [linenum-old][linenum-new][code with inline prefix]
  html += `<table class="w-full border-collapse diff-table-unified">
    <colgroup>
      <col class="uni-col-num">
      <col class="uni-col-num">
      <col>
    </colgroup>`;

  for (let hi = 0; hi < fileData.hunks.length; hi++) {
    const hunk = fileData.hunks[hi];

    html += `<tr class="hunk-header" data-hunk-index="${hi}">
      <td colspan="3" class="px-2 py-1 text-xs">${SyntaxHighlight.escapeHtml(hunk.header)}</td>
    </tr>`;

    for (let li = 0; li < hunk.lines.length; li++) {
      const line = hunk.lines[li];
      const rowClass =
        line.type === 'addition' ? 'uni-add' :
        line.type === 'deletion' ? 'uni-del' : '';

      const lineNumOld = line.lineOld !== null ? line.lineOld : '';
      const lineNumNew = line.lineNew !== null ? line.lineNew : '';
      const prefix =
        line.type === 'addition' ? '+' :
        line.type === 'deletion' ? '-' : '\u00a0';

      const highlighted = SyntaxHighlight.highlightLine(line.content, lang);
      const primaryLine = line.lineNew !== null ? line.lineNew : line.lineOld;
      const lineType = line.type === 'addition' ? 'new' :
                       line.type === 'deletion' ? 'old' : 'context';

      html += `<tr class="diff-line ${rowClass}"
        data-file="${SyntaxHighlight.escapeHtml(fileData.path)}"
        data-line-old="${lineNumOld}"
        data-line-new="${lineNumNew}"
        data-line-type="${lineType}"
        data-hunk-index="${hi}"
        data-line-index="${li}">
        <td class="uni-num">${lineNumOld}</td>
        <td class="uni-num">${lineNumNew}</td>
        <td class="uni-code"><span class="uni-prefix">${prefix}</span><code class="language-${lang}">${highlighted}</code></td>
      </tr>`;

      // Insert annotation card rows after this line
      html += buildAnnotationRowsHTML(fileData.path, primaryLine, lineType, undefined, 3);
    }
  }

  html += `</table>`;
  container.innerHTML = html;
  document.getElementById('diff-view').scrollTop = 0;
}

/**
 * Pair up deletions and additions within a hunk for side-by-side display.
 * Context lines appear on both sides. Consecutive deletions pair with
 * consecutive additions that follow them.
 */
function pairHunkLines(hunk) {
  const pairs = [];
  let i = 0;
  const lines = hunk.lines;

  while (i < lines.length) {
    if (lines[i].type === 'context') {
      pairs.push({ left: lines[i], right: lines[i] });
      i++;
    } else if (lines[i].type === 'deletion') {
      // Collect consecutive deletions
      const deletions = [];
      while (i < lines.length && lines[i].type === 'deletion') {
        deletions.push(lines[i]);
        i++;
      }
      // Collect consecutive additions that follow
      const additions = [];
      while (i < lines.length && lines[i].type === 'addition') {
        additions.push(lines[i]);
        i++;
      }
      // Pair them up
      const maxLen = Math.max(deletions.length, additions.length);
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          left: j < deletions.length ? deletions[j] : null,
          right: j < additions.length ? additions[j] : null,
        });
      }
    } else if (lines[i].type === 'addition') {
      // Additions without preceding deletions
      pairs.push({ left: null, right: lines[i] });
      i++;
    } else {
      i++;
    }
  }
  return pairs;
}

function renderDiffSplit(fileData) {
  const container = document.getElementById('diff-content');
  const lang = SyntaxHighlight.detectLanguage(fileData.path);

  let html = renderFileHeader(fileData);

  if (fileData.binary) {
    html += `<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-600">Binary file</div>`;
    container.innerHTML = html;
    return;
  }

  if (fileData.hunks.length === 0) {
    html += `<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-600">No content changes</div>`;
    container.innerHTML = html;
    return;
  }

  // 4 columns: [linenum-old][content-old][linenum-new][content-new]
  // The border between the two halves is a right-border on content-old
  html += `<table class="w-full border-collapse diff-table-split">
    <colgroup>
      <col class="split-col-num">
      <col class="split-col-content">
      <col class="split-col-num">
      <col class="split-col-content">
    </colgroup>`;

  for (let hi = 0; hi < fileData.hunks.length; hi++) {
    const hunk = fileData.hunks[hi];

    html += `<tr class="hunk-header" data-hunk-index="${hi}">
      <td colspan="4" class="px-4 py-1 text-xs">${SyntaxHighlight.escapeHtml(hunk.header)}</td>
    </tr>`;

    const pairs = pairHunkLines(hunk);

    for (let pi = 0; pi < pairs.length; pi++) {
      const { left, right } = pairs[pi];

      const leftNum = left && left.lineOld !== null ? left.lineOld : '';
      const leftContent = left ? SyntaxHighlight.highlightLine(left.content, lang) : '';
      const leftCellClass = left
        ? (left.type === 'deletion' ? 'split-del' : '')
        : 'split-empty';

      const rightNum = right && right.lineNew !== null ? right.lineNew : '';
      const rightContent = right ? SyntaxHighlight.highlightLine(right.content, lang) : '';
      const rightCellClass = right
        ? (right.type === 'addition' ? 'split-add' : '')
        : 'split-empty';

      // Determine line types for each side
      const leftLineType = left ? (left.type === 'deletion' ? 'old' : 'context') : '';
      const rightLineType = right ? (right.type === 'addition' ? 'new' : 'context') : '';

      // Primary for row-level data attrs (used by unified-style fallbacks)
      const primaryLineType = rightLineType || leftLineType || 'context';

      html += `<tr class="diff-line split-row"
        data-file="${SyntaxHighlight.escapeHtml(fileData.path)}"
        data-line-old="${leftNum}"
        data-line-new="${rightNum}"
        data-line-type="${primaryLineType}"
        data-hunk-index="${hi}"
        data-line-index="${pi}">
        <td class="split-num ${leftCellClass}" data-side="left">${leftNum}</td>
        <td class="split-code split-left ${leftCellClass}" data-side="left"><code class="language-${lang}">${leftContent}</code></td>
        <td class="split-num ${rightCellClass}" data-side="right">${rightNum}</td>
        <td class="split-code split-right ${rightCellClass}" data-side="right"><code class="language-${lang}">${rightContent}</code></td>
      </tr>`;

      // Insert annotation card rows for left and right sides
      if (leftNum !== '') {
        html += buildAnnotationRowsHTML(fileData.path, leftNum, leftLineType, 'left', 4);
      }
      if (rightNum !== '') {
        html += buildAnnotationRowsHTML(fileData.path, rightNum, rightLineType, 'right', 4);
      }
    }
  }

  html += `</table>`;
  container.innerHTML = html;
  document.getElementById('diff-view').scrollTop = 0;
}

/**
 * Find all annotations whose endLine matches this line (so the card renders below it).
 */
function getAnnotationsEndingAtLine(file, line, lineType, side) {
  return state.annotations.filter(
    a => a.file === file && a.endLine === line && a.lineType === lineType
      && (!side || !a.side || a.side === side)
  );
}

/**
 * Render a GitHub PR-style comment card for an annotation.
 */
function renderCommentCard(ann) {
  const lineRef = ann.startLine === ann.endLine ? `line ${ann.startLine}` : `lines ${ann.startLine}-${ann.endLine}`;
  const escapedComment = SyntaxHighlight.escapeHtml(ann.comment).replace(/\n/g, '<br>');

  return `<div class="gh-comment-card" data-annotation-id="${ann.id}">
    <div class="gh-comment-header">
      <svg class="gh-comment-icon" viewBox="0 0 16 16" width="16" height="16">
        <path fill="currentColor" d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
      </svg>
      <span class="gh-comment-ref">${SyntaxHighlight.escapeHtml(ann.file)}:${lineRef}</span>
      <div class="gh-comment-actions">
        <button class="gh-comment-action-btn gh-comment-edit" data-annotation-id="${ann.id}" title="Edit comment">
          <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"></path></svg>
        </button>
        <button class="gh-comment-action-btn gh-comment-delete" data-annotation-id="${ann.id}" title="Delete comment">
          <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"></path></svg>
        </button>
      </div>
    </div>
    <div class="gh-comment-body">${escapedComment}</div>
  </div>`;
}

/**
 * Build annotation card row(s) HTML for lines that have annotations ending on them.
 * Returns HTML string of <tr> elements to insert after a diff line.
 */
function buildAnnotationRowsHTML(file, line, lineType, side, colspan) {
  const anns = getAnnotationsEndingAtLine(file, line, lineType, side);
  if (anns.length === 0) return '';

  let html = '';
  for (const ann of anns) {
    const cardHtml = renderCommentCard(ann);
    html += `<tr class="annotation-card-row">`;
    if (state.viewMode === 'split' && side) {
      if (side === 'left') {
        html += `<td colspan="2" class="annotation-card-cell">${cardHtml}</td>`;
        html += `<td colspan="2" class="annotation-card-cell-empty"></td>`;
      } else {
        html += `<td colspan="2" class="annotation-card-cell-empty"></td>`;
        html += `<td colspan="2" class="annotation-card-cell">${cardHtml}</td>`;
      }
    } else {
      html += `<td colspan="${colspan}" class="annotation-card-cell">${cardHtml}</td>`;
    }
    html += `</tr>`;
  }
  return html;
}

// --- Annotation System ---
function initAnnotationEvents() {
  const diffView = document.getElementById('diff-content');

  // Track hovered row
  diffView.addEventListener('mouseover', (e) => {
    const row = e.target.closest('tr.diff-line');
    if (row) state.hoveredRow = row;
  });

  // Click on a line to open comment
  diffView.addEventListener('click', (e) => {
    // Click on edit button in comment card → edit
    const editBtn = e.target.closest('.gh-comment-edit');
    if (editBtn) {
      const annId = editBtn.dataset.annotationId;
      const ann = state.annotations.find(a => a.id === annId);
      if (ann) openCommentBox(ann.file, ann.startLine, ann.endLine, ann.lineType, ann, ann.side);
      return;
    }

    // Click on delete button in comment card → delete
    const deleteBtn = e.target.closest('.gh-comment-delete');
    if (deleteBtn) {
      const annId = deleteBtn.dataset.annotationId;
      deleteAnnotation(annId);
      return;
    }

    // Click anywhere on comment card → ignore (don't open new comment)
    if (e.target.closest('.gh-comment-card')) return;

    const row = e.target.closest('tr.diff-line');
    if (!row) return;
    if (e.target.closest('.comment-row')) return;

    const file = row.dataset.file;
    const clickedTd = e.target.closest('td');
    const side = clickedTd ? clickedTd.dataset.side : undefined;

    let primaryLine, lineType;

    if (side === 'left') {
      // Split view: clicked left (old) side
      primaryLine = row.dataset.lineOld ? parseInt(row.dataset.lineOld) : null;
      if (primaryLine === null || isNaN(primaryLine)) return; // empty cell
      const leftType = row.querySelector('td[data-side="left"].split-code');
      lineType = leftType && leftType.classList.contains('split-del') ? 'old' : 'context';
    } else if (side === 'right') {
      // Split view: clicked right (new) side
      primaryLine = row.dataset.lineNew ? parseInt(row.dataset.lineNew) : null;
      if (primaryLine === null || isNaN(primaryLine)) return; // empty cell
      const rightType = row.querySelector('td[data-side="right"].split-code');
      lineType = rightType && rightType.classList.contains('split-add') ? 'new' : 'context';
    } else {
      // Unified view
      const lineNew = row.dataset.lineNew ? parseInt(row.dataset.lineNew) : null;
      const lineOld = row.dataset.lineOld ? parseInt(row.dataset.lineOld) : null;
      primaryLine = lineNew !== null ? lineNew : lineOld;
      lineType = row.dataset.lineType;
    }

    if (primaryLine !== null && !isNaN(primaryLine)) {
      openCommentBox(file, primaryLine, primaryLine, lineType, undefined, side);
    }
  });

  // Mouse drag for range selection
  diffView.addEventListener('mousedown', (e) => {
    const row = e.target.closest('tr.diff-line');
    if (!row || e.target.closest('.gh-comment-card') || e.target.closest('.comment-row') || e.target.closest('.annotation-card-row')) return;

    const clickedTd = e.target.closest('td');
    state.selectionStart = row;
    state.selectionSide = clickedTd ? clickedTd.dataset.side : undefined;
    state.isSelecting = false;
  });

  diffView.addEventListener('mousemove', (e) => {
    if (!state.selectionStart) return;

    const row = e.target.closest('tr.diff-line');
    if (!row || row === state.selectionStart) return;

    state.isSelecting = true;

    // Clear previous selection
    diffView.querySelectorAll('.selected-range').forEach(el => el.classList.remove('selected-range'));

    // Highlight range
    const rows = Array.from(diffView.querySelectorAll('tr.diff-line'));
    const startIdx = rows.indexOf(state.selectionStart);
    const endIdx = rows.indexOf(row);
    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

    for (let i = lo; i <= hi; i++) {
      rows[i].classList.add('selected-range');
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!state.selectionStart) return;

    if (state.isSelecting) {
      const diffView = document.getElementById('diff-content');
      const selectedRows = diffView.querySelectorAll('tr.diff-line.selected-range');

      if (selectedRows.length > 0) {
        const first = selectedRows[0];
        const last = selectedRows[selectedRows.length - 1];
        const file = first.dataset.file;

        const side = state.selectionSide;
        let startLine, endLine, lineType;

        if (side === 'left') {
          startLine = parseInt(first.dataset.lineOld);
          endLine = parseInt(last.dataset.lineOld);
          lineType = 'old';
        } else if (side === 'right') {
          startLine = parseInt(first.dataset.lineNew);
          endLine = parseInt(last.dataset.lineNew);
          lineType = 'new';
        } else {
          startLine = parseInt(first.dataset.lineNew || first.dataset.lineOld);
          endLine = parseInt(last.dataset.lineNew || last.dataset.lineOld);
          lineType = first.dataset.lineType;
        }

        if (!isNaN(startLine) && !isNaN(endLine)) {
          openCommentBox(file, Math.min(startLine, endLine), Math.max(startLine, endLine), lineType, undefined, side);
        }
      }
    }

    state.selectionStart = null;
    state.selectionSide = undefined;
    state.isSelecting = false;
  });
}

function openCommentBox(file, startLine, endLine, lineType, existingAnnotation, side) {
  closeCommentBox();

  const rows = document.querySelectorAll(`tr.diff-line[data-file="${CSS.escape(file)}"]`);
  let targetRow = null;

  for (const row of rows) {
    const ln = side === 'left'
      ? parseInt(row.dataset.lineOld)
      : side === 'right'
        ? parseInt(row.dataset.lineNew)
        : parseInt(row.dataset.lineNew || row.dataset.lineOld);
    if (ln === endLine) {
      targetRow = row;
      break;
    }
  }

  if (!targetRow) {
    for (const row of rows) {
      const ln = parseInt(row.dataset.lineNew || row.dataset.lineOld);
      if (ln >= endLine) {
        targetRow = row;
        break;
      }
    }
  }

  if (!targetRow) return;

  // Hide the existing annotation card row when editing (so we don't show both)
  if (existingAnnotation) {
    const cardRow = targetRow.nextElementSibling;
    if (cardRow && cardRow.classList.contains('annotation-card-row')) {
      const card = cardRow.querySelector(`[data-annotation-id="${existingAnnotation.id}"]`);
      if (card) cardRow.style.display = 'none';
    }
  }

  const lineRef = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
  const formHtml = `
    <div class="comment-input-card">
      <div class="comment-input-header">
        <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>
        <span>${existingAnnotation ? 'Edit comment' : 'Add comment'} on ${SyntaxHighlight.escapeHtml(file)}:${lineRef}</span>
      </div>
      <div class="comment-input-body">
        <textarea class="comment-textarea" placeholder="Leave a comment" autofocus>${existingAnnotation ? SyntaxHighlight.escapeHtml(existingAnnotation.comment) : ''}</textarea>
      </div>
      <div class="comment-input-footer">
        ${existingAnnotation ? '<button class="comment-delete gh-btn-danger">Delete</button>' : ''}
        <button class="comment-cancel gh-btn-secondary">Cancel</button>
        <button class="comment-save gh-btn-primary">${existingAnnotation ? 'Update comment' : 'Add comment'}</button>
      </div>
    </div>
  `;

  const tr = document.createElement('tr');
  tr.className = 'comment-row';

  if (state.viewMode === 'split' && (side === 'left' || side === 'right')) {
    if (side === 'left') {
      tr.innerHTML = `
        <td colspan="2" class="comment-cell-active px-3 py-3">${formHtml}</td>
        <td colspan="2" class="comment-cell-empty"></td>
      `;
    } else {
      tr.innerHTML = `
        <td colspan="2" class="comment-cell-empty"></td>
        <td colspan="2" class="comment-cell-active px-3 py-3">${formHtml}</td>
      `;
    }
  } else {
    // Unified view or no side specified
    const colspan = state.viewMode === 'split' ? 4 : 3;
    tr.innerHTML = `<td colspan="${colspan}" class="comment-cell-active px-3 py-3">${formHtml}</td>`;
  }

  targetRow.after(tr);

  const textarea = tr.querySelector('.comment-textarea');
  textarea.focus();

  // Handle Ctrl+Enter inside textarea
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      saveComment(file, startLine, endLine, lineType, textarea.value, existingAnnotation, side);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommentBox();
    }
  });

  tr.querySelector('.comment-cancel').addEventListener('click', closeCommentBox);
  tr.querySelector('.comment-save').addEventListener('click', () => {
    saveComment(file, startLine, endLine, lineType, textarea.value, existingAnnotation, side);
  });

  if (existingAnnotation) {
    tr.querySelector('.comment-delete').addEventListener('click', () => {
      deleteAnnotation(existingAnnotation.id);
    });
  }
}

function closeCommentBox() {
  const existing = document.querySelector('.comment-row');
  if (existing) existing.remove();

  // Restore any hidden annotation card rows
  document.querySelectorAll('.annotation-card-row[style*="display: none"]').forEach(el => {
    el.style.display = '';
  });

  // Clear selection highlights
  document.querySelectorAll('.selected-range').forEach(el => el.classList.remove('selected-range'));
}

function saveComment(file, startLine, endLine, lineType, comment, existingAnnotation, side) {
  if (!comment.trim()) {
    closeCommentBox();
    return;
  }

  const context = buildContext(file, startLine, endLine, lineType);

  if (existingAnnotation) {
    existingAnnotation.comment = comment.trim();
    existingAnnotation.context = context;
  } else {
    state.annotations.push({
      id: crypto.randomUUID(),
      file,
      startLine,
      endLine,
      lineType,
      comment: comment.trim(),
      context,
      side,
    });
  }

  closeCommentBox();
  refreshCurrentDiff();
  updateCommentCount();
}

function deleteAnnotation(id) {
  state.annotations = state.annotations.filter(a => a.id !== id);
  closeCommentBox();
  refreshCurrentDiff();
  updateCommentCount();
}

function buildContext(file, startLine, endLine, lineType) {
  const fileData = state.fileCache[file];
  if (!fileData) return [];

  const context = [];
  for (const hunk of fileData.hunks) {
    for (const line of hunk.lines) {
      const primaryLine = line.lineNew !== null ? line.lineNew : line.lineOld;
      const lt = line.type === 'addition' ? 'new' :
                 line.type === 'deletion' ? 'old' : 'context';

      // Include lines in range plus up to 3 context lines around
      if (primaryLine >= startLine - 3 && primaryLine <= endLine + 3) {
        const prefix =
          line.type === 'addition' ? '+' :
          line.type === 'deletion' ? '-' : ' ';
        context.push(prefix + line.content);
      }
    }
  }
  return context;
}

function refreshCurrentDiff() {
  if (state.activeFile && state.fileCache[state.activeFile]) {
    renderDiff(state.fileCache[state.activeFile]);
  }
}

function updateCommentCount() {
  const el = document.getElementById('comment-count');
  const count = state.annotations.length;
  el.textContent = count === 0 ? 'No comments yet' :
    count === 1 ? '1 comment' : `${count} comments`;
}

// --- Submit ---
function initSubmit() {
  document.getElementById('submit-btn').addEventListener('click', submitFeedback);
}

async function submitFeedback() {
  if (state.annotations.length === 0) {
    if (!confirm('Submit with no comments? This will tell Claude the changes look good.')) {
      return;
    }
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.annotations),
    });

    if (!res.ok) throw new Error('Submit failed');

    btn.textContent = 'Submitted!';
    btn.classList.add('opacity-75');

    // Show success message
    const diffView = document.getElementById('diff-content');
    diffView.innerHTML = `
      <div class="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
        <div class="text-center">
          <p class="text-lg mb-2">Feedback submitted!</p>
          <p class="text-sm">You can close this tab.</p>
        </div>
      </div>
    `;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Submit Feedback';
    alert('Failed to submit feedback. Please try again.');
    console.error(err);
  }
}

// --- Keyboard Shortcuts ---
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in textarea
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
      // But still handle Ctrl+Shift+Enter for submit
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        submitFeedback();
      }
      return;
    }

    // Escape — close overlays or comment box
    if (e.key === 'Escape') {
      const overlay = document.getElementById('shortcuts-overlay');
      if (!overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
        return;
      }
      closeCommentBox();
      return;
    }

    // ? — toggle shortcuts
    if (e.key === '?') {
      toggleShortcutsOverlay();
      return;
    }

    // j/k — next/prev file
    if (e.key === 'j') {
      navigateFile(1);
      return;
    }
    if (e.key === 'k') {
      navigateFile(-1);
      return;
    }

    // n/p — next/prev hunk
    if (e.key === 'n') {
      navigateHunk(1);
      return;
    }
    if (e.key === 'p') {
      navigateHunk(-1);
      return;
    }

    // c — comment on hovered line
    if (e.key === 'c') {
      if (state.hoveredRow) {
        const file = state.hoveredRow.dataset.file;
        const line = parseInt(state.hoveredRow.dataset.lineNew || state.hoveredRow.dataset.lineOld);
        const lineType = state.hoveredRow.dataset.lineType;
        if (file && !isNaN(line)) {
          openCommentBox(file, line, line, lineType);
        }
      }
      return;
    }

    // Ctrl+Shift+Enter — submit
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      submitFeedback();
      return;
    }
  });
}

function navigateFile(direction) {
  const newIndex = state.activeFileIndex + direction;
  if (newIndex >= 0 && newIndex < state.files.length) {
    loadFile(state.files[newIndex].path, newIndex);
  }
}

function navigateHunk(direction) {
  const headers = document.querySelectorAll('.hunk-header');
  if (headers.length === 0) return;

  const diffView = document.getElementById('diff-view');
  const scrollTop = diffView.scrollTop;

  let targetIdx = -1;

  if (direction > 0) {
    // Find next hunk header below current scroll
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].offsetTop > scrollTop + 10) {
        targetIdx = i;
        break;
      }
    }
  } else {
    // Find prev hunk header above current scroll
    for (let i = headers.length - 1; i >= 0; i--) {
      if (headers[i].offsetTop < scrollTop - 10) {
        targetIdx = i;
        break;
      }
    }
  }

  if (targetIdx >= 0) {
    headers[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// --- Shortcuts Overlay ---
function initShortcutsOverlay() {
  document.getElementById('shortcuts-btn').addEventListener('click', toggleShortcutsOverlay);
  document.getElementById('shortcuts-close').addEventListener('click', () => {
    document.getElementById('shortcuts-overlay').classList.add('hidden');
  });
  document.getElementById('shortcuts-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });
}

function toggleShortcutsOverlay() {
  const overlay = document.getElementById('shortcuts-overlay');
  overlay.classList.toggle('hidden');
}

// --- Theme ---
function initTheme() {
  const saved = localStorage.getItem('diff-review-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    setPrismTheme('dark');
  } else {
    setPrismTheme('light');
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('diff-review-theme', isDark ? 'dark' : 'light');
    setPrismTheme(isDark ? 'dark' : 'light');
  });
}

function setPrismTheme(mode) {
  const light = document.getElementById('prism-theme-light');
  const dark = document.getElementById('prism-theme-dark');
  if (mode === 'dark') {
    light.disabled = true;
    dark.disabled = false;
  } else {
    light.disabled = false;
    dark.disabled = true;
  }
}
