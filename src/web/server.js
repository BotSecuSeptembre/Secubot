const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const auth = require('./admin/auth');

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
  '/admin': 'admin.html',
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

// ---------- Espace d'administration ----------

const MAX_BODY = 64 * 1024;

function clientIp(req) {
  // Derrière le proxy Railway, la dernière adresse de X-Forwarded-For est celle ajoutée par le proxy
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return forwarded.at(-1) || req.socket.remoteAddress || 'inconnue';
}

const isHttps = (req) => String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
const cookieName = (req) => (isHttps(req) ? '__Host-admin' : 'admin');

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function sessionCookie(req, token, maxAge) {
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

/** Refuse les requêtes envoyées depuis un autre site (protection CSRF). */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data, extra = {}) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length, ...extra });
  res.end(body);
}

async function handleAdmin(req, res, pathname, url, source) {
  const route = pathname.slice('/admin/api/'.length);
  const ip = clientIp(req);
  const token = readCookie(req, cookieName(req));

  if (req.method === 'POST') {
    if (!sameOrigin(req) || !/^application\/json\b/.test(req.headers['content-type'] ?? '')) return sendJson(res, 403, { error: 'Requête refusée.' });
  }

  if (route === 'session' && req.method === 'GET') return sendJson(res, 200, { authenticated: auth.checkSession(token) });

  if (route === 'login' && req.method === 'POST') {
    const wait = auth.lockedFor(ip);
    if (wait) return sendJson(res, 429, { error: `Trop de tentatives. Réessaie dans ${Math.ceil(wait / 60)} min.` }, { 'Retry-After': String(wait) });
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: 'Requête invalide.' });
    }
    if (!(await auth.verifyPassword(body.password))) {
      auth.recordFailure(ip);
      console.warn(`[admin] Échec de connexion depuis ${ip}`);
      return sendJson(res, 401, { error: 'Mot de passe incorrect.' });
    }
    const session = auth.createSession(ip);
    console.log(`[admin] Connexion réussie depuis ${ip}`);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, session, Math.floor(auth.SESSION_TTL / 1000)) });
  }

  if (!auth.checkSession(token)) return sendJson(res, 401, { error: 'Session expirée. Reconnecte toi.' });

  if (route === 'logout' && req.method === 'POST') {
    auth.destroySession(token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  let body = null;
  if (req.method === 'POST') {
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: 'Requête invalide.' });
    }
  }
  const result = await source.admin({ method: req.method, route, query: url.searchParams, body, ip });
  return sendJson(res, result.status, result.data);
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
    let pathname;
    let url;
    try {
      url = new URL(req.url, 'http://local');
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, BASE_HEADERS);
      return res.end();
    }

    if (pathname.startsWith('/admin/api/') && source.admin && (req.method === 'GET' || req.method === 'POST')) {
      return handleAdmin(req, res, pathname, url, source).catch((err) => {
        console.error('[admin]', err);
        if (!res.headersSent) sendJson(res, 500, { error: 'Erreur interne.' });
      });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...BASE_HEADERS, Allow: 'GET, HEAD' });
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
