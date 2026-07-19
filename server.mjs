// Production container server — Node stdlib only.
// 1. Serves the built SPA from ./dist (SPA fallback to index.html).
// 2. Proxies POST /api/genai/<suffix> to the Gemini REST API, injecting the API key
//    server-side so it is NEVER shipped to the browser bundle.
// Listens on process.env.PORT (Cloud Run contract) or 3000, on 0.0.0.0.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('./dist', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const UPSTREAM = 'https://generativelanguage.googleapis.com';
const GENAI_PREFIX = '/api/genai/';
const ARXIV_UPSTREAM = 'https://export.arxiv.org';
const ARXIV_PATH = '/api/arxiv';

// Key is read at request time from the environment — never baked into the bundle, never logged.
const apiKey = () => process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const contentType = (p) => CONTENT_TYPES[extname(p).toLowerCase()] || 'application/octet-stream';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Forward a POST to the Gemini REST API, swapping in the real key for the x-goog-api-key header.
async function proxyGenai(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'POST' });
    res.end('Method Not Allowed');
    return;
  }
  const suffix = req.url.slice(GENAI_PREFIX.length); // keeps path + query string
  const target = `${UPSTREAM}/${suffix}`;
  const body = await readBody(req);

  // Rebuild headers: drop hop-by-hop/host, force our server-side key.
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (['host', 'connection', 'content-length', 'x-goog-api-key'].includes(key)) continue;
    if (typeof v === 'string') headers[k] = v;
  }
  headers['x-goog-api-key'] = apiKey();

  try {
    const upstream = await fetch(target, { method: 'POST', headers, body });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Upstream request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Same-origin arXiv rail — forwards q & max to export.arxiv.org and returns the Atom XML,
// sidestepping browser CORS. 502 plain text if the upstream is unreachable or errors.
async function proxyArxiv(req, res) {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const q = u.searchParams.get('q') || '';
  const max = u.searchParams.get('max') || '5';
  const target = `${ARXIV_UPSTREAM}/api/query?search_query=all:${encodeURIComponent(q)}&max_results=${encodeURIComponent(max)}&sortBy=relevance`;
  try {
    const upstream = await fetch(target);
    if (!upstream.ok) throw new Error(`arXiv HTTP ${upstream.status}`);
    const xml = await upstream.text();
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(xml);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`arXiv upstream failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Serve a static file from ./dist, with SPA fallback to index.html.
async function serveStatic(req, res) {
  // Resolve requested path under ROOT, blocking traversal.
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  let filePath = join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) filePath = join(ROOT, 'index.html');

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath) });
    res.end(data);
  } catch {
    // SPA fallback — unknown route serves the app shell.
    try {
      const data = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  }
}

const server = createServer((req, res) => {
  const url = req.url || '';
  if (url.startsWith(GENAI_PREFIX)) {
    proxyGenai(req, res).catch(() => {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    });
    return;
  }
  if (url === ARXIV_PATH || url.startsWith(`${ARXIV_PATH}?`)) {
    proxyArxiv(req, res).catch(() => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('arXiv upstream failed');
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Blueprint server listening on http://${HOST}:${PORT} — serving ./dist, genai proxy ${apiKey() ? 'ready' : 'MISSING KEY'}`);
});
