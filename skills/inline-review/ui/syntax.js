/**
 * Syntax highlighting integration with Prism.js
 */

const EXTENSION_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'markup',
  '.htm': 'markup',
  '.xml': 'markup',
  '.svg': 'markup',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.dockerfile': 'docker',
  '.lua': 'lua',
  '.php': 'php',
  '.r': 'r',
  '.scala': 'scala',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.vim': 'vim',
  '.nginx': 'nginx',
  '.proto': 'protobuf',
};

// Special filenames
const FILENAME_MAP = {
  'Dockerfile': 'docker',
  'Makefile': 'makefile',
  'CMakeLists.txt': 'cmake',
  '.gitignore': 'gitignore',
  '.env': 'bash',
};

/**
 * Detect the Prism language for a file path.
 */
function detectLanguage(filePath) {
  const fileName = filePath.split('/').pop();

  // Check special filenames first
  if (FILENAME_MAP[fileName]) return FILENAME_MAP[fileName];

  // Check extension
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = fileName.slice(dotIdx).toLowerCase();
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  return 'plaintext';
}

/**
 * Highlight a line of code content using Prism.
 * Returns HTML string.
 */
function highlightLine(content, lang) {
  if (lang === 'plaintext' || !window.Prism) {
    return escapeHtml(content);
  }

  const grammar = Prism.languages[lang];
  if (!grammar) {
    // Grammar not loaded yet — return escaped HTML.
    // Prism autoloader will load it async for future use.
    return escapeHtml(content);
  }

  try {
    return Prism.highlight(content, grammar, lang);
  } catch {
    return escapeHtml(content);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Expose globally
window.SyntaxHighlight = { detectLanguage, highlightLine, escapeHtml };
