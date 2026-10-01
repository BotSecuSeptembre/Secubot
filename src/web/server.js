const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

/**
 * Serveur HTTP du site, sans dépendance externe.
 * Il ne journalise aucune requête et ne dépose aucun cookie.
 *
 * source = {
 *   getSnapshot(): object | null   état courant (null tant que le bot n'est pas prêt)
 *   meta(): { name, updated }      informations pour les pages légales
 *   on('change', fn)               signal de mise à jour
 * }
 */

const PUBLIC = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;

const PAGES = {
  '/': 'index.html',
  '/confidentialite': 'confidentialite.html',
  '/cgu': 'cgu.html',
  '/cookies': 'cookies.html',
};

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const BASE_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const initial = (name) => (String(name ?? '').match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();

function loadStatic() {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const body = fs.readFileSync(full);
        files.set(path.relative(PUBLIC, full).split(path.sep).join('/'), {
          body,
          gz: zlib.gzipSync(body),
          type: TYPES[path.extname(full)] ?? 'application/octet-stream',
          etag: `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 16)}"`,
        });
      }
    }
  };
  walk(PUBLIC);
  return files;
}

function send(req, res, status, type, body, extra = {}) {
  const headers = { ...BASE_HEADERS, 'Content-Type': type, Vary: 'Accept-Encoding', ...extra };
  let payload = body;
  if (body.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    payload = extra.gz ?? zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  delete headers.gz;
  headers['Content-Length'] = payload.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function createSiteServer(source, { maxStreams = 1000 } = {}) {
  const files = loadStatic();
  const streams = new Set();

  let cache = null; // { version, body, gz, etag }
  let version = 1;
  let pending = null;

  const broadcast = () => {
    pending = null;
    const line = `event: update\ndata: ${version}\n\n`;
    for (const res of streams) res.write(line);
  };

  source.on('change', () => {
    version++;
    cache = null;
    // Regroupe les rafales d'événements (présences, arrivées en masse) : au plus un envoi toutes les 1,5 s
    pending ??= setTimeout(broadcast, 1500);
  });

  const heartbeat = setInterval(() => {
    for (const res of streams) res.write(': ping\n\n');
  }, 25_000);
  heartbeat.unref();

  const renderPage = (file) => {
    const meta = source.meta();
    return Buffer.from(
      files
        .get(file)
        .body.toString('utf8')
        .replaceAll('{{SERVER_NAME}}', escapeHtml(meta.name))
        .replaceAll('{{SERVER_INITIAL}}', escapeHtml(initial(meta.name)))
        .replaceAll('{{UPDATED}}', escapeHtml(meta.updated))
        .replaceAll('{{CONTACT}}', escapeHtml(meta.contact)),
    );
  };

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...BASE_HEADERS, Allow: 'GET, HEAD' });
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    } catch {
      res.writeHead(400, BASE_HEADERS);
      return res.end();
    }
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    if (PAGES[pathname]) {
      return send(req, res, 200, TYPES['.html'], renderPage(PAGES[pathname]), { 'Cache-Control': 'no-cache' });
    }

    if (pathname === '/api/snapshot') {
      const snapshot = source.getSnapshot();
      if (!snapshot) {
        return send(req, res, 503, 'application/json; charset=utf-8', Buffer.from('{"error":"starting"}'), {
          'Cache-Control': 'no-store',
          'Retry-After': '3',
        });
      }
      if (!cache || cache.version !== version) {
        const body = Buffer.from(JSON.stringify(snapshot));
        cache = { version, body, gz: zlib.gzipSync(body), etag: `"v${version}-${snapshot.updatedAt}"` };
      }
      if (req.headers['if-none-match'] === cache.etag) {
        res.writeHead(304, { ...BASE_HEADERS, ETag: cache.etag });
        return res.end();
      }
      return send(req, res, 200, 'application/json; charset=utf-8', cache.body, {
        gz: cache.gz,
        ETag: cache.etag,
        'Cache-Control': 'no-cache',
      });
    }

    if (pathname === '/api/events') {
      if (streams.size >= maxStreams) {
        res.writeHead(503, { ...BASE_HEADERS, 'Retry-After': '30' });
        return res.end();
      }
      res.writeHead(200, {
        ...BASE_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 5000\nevent: update\ndata: ${version}\n\n`);
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }

    if (pathname === '/healthz') return send(req, res, 200, TYPES['.txt'], Buffer.from('ok'), { 'Cache-Control': 'no-store' });

    if (pathname.startsWith('/assets/')) {
      const key = pathname.slice(1);
      const file = !key.includes('..') && files.get(key);
      if (file) {
        if (req.headers['if-none-match'] === file.etag) {
          res.writeHead(304, { ...BASE_HEADERS, ETag: file.etag });
          return res.end();
        }
        const cache = file.type === TYPES['.woff2'] ? 'public, max-age=31536000, immutable' : 'no-cache';
        return send(req, res, 200, file.type, file.body, { gz: file.gz, ETag: file.etag, 'Cache-Control': cache });
      }
    }

    return send(req, res, 404, TYPES['.html'], renderPage('404.html'), { 'Cache-Control': 'no-cache' });
  });

  server.keepAliveTimeout = 65_000;
  server.on('close', () => clearInterval(heartbeat));
  return server;
}

module.exports = { createSiteServer, escapeHtml };
