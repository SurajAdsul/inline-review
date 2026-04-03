import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiffMeta, parseDiffFile } from './diff-parser.js';
import { formatAnnotations } from './formatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, '..', 'ui');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function loadStaticFiles() {
  const cache = {};
  const files = ['index.html', 'app.js', 'syntax.js', 'styles.css'];
  for (const file of files) {
    const filePath = path.join(UI_DIR, file);
    if (fs.existsSync(filePath)) {
      cache['/' + file] = {
        content: fs.readFileSync(filePath),
        mime: MIME_TYPES[path.extname(file)] || 'application/octet-stream',
      };
    }
  }
  if (cache['/index.html']) {
    cache['/'] = cache['/index.html'];
  }
  return cache;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export async function createServer(rawDiff, options = {}) {
  const { port = 0, cwd = process.cwd(), diffType = 'head' } = options;
  const staticFiles = loadStaticFiles();
  const diffMeta = parseDiffMeta(rawDiff);

  const metaResponse = {
    meta: { cwd, diffType, timestamp: new Date().toISOString() },
    files: diffMeta.files,
  };

  let lastHeartbeat = Date.now();
  let heartbeatChecker = null;
  let settled = false;
  let resolveResult, rejectResult;

  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function cleanup() {
    if (heartbeatChecker) {
      clearInterval(heartbeatChecker);
      heartbeatChecker = null;
    }
    server.close();
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost`);
    const pathname = url.pathname;

    try {
      if (req.method === 'GET' && pathname === '/api/diff') {
        const file = url.searchParams.get('file');
        if (file) {
          const fileData = parseDiffFile(rawDiff, file);
          if (!fileData) {
            sendJson(res, 404, { error: `File not found in diff: ${file}` });
            return;
          }
          sendJson(res, 200, fileData);
        } else {
          sendJson(res, 200, metaResponse);
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/api/submit') {
        const body = await readBody(req);
        let annotations;
        try {
          annotations = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }

        const formatted = formatAnnotations(annotations);
        sendJson(res, 200, { ok: true });

        if (!settled) {
          settled = true;
          cleanup();
          resolveResult(formatted);
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/api/heartbeat') {
        lastHeartbeat = Date.now();
        sendJson(res, 200, { ok: true });
        return;
      }

      const staticFile = staticFiles[pathname];
      if (staticFile) {
        res.writeHead(200, {
          'Content-Type': staticFile.mime,
          'Content-Length': staticFile.content.length,
        });
        res.end(staticFile.content);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      console.error('Server error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  heartbeatChecker = setInterval(() => {
    if (Date.now() - lastHeartbeat > 10000) {
      if (!settled) {
        settled = true;
        cleanup();
        rejectResult(new Error('Browser disconnected'));
      }
    }
  }, 5000);

  const actualPort = await new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });

  return {
    port: actualPort,
    result,
    close() {
      if (!settled) {
        settled = true;
        cleanup();
        rejectResult(new Error('Server closed'));
      }
    },
  };
}
