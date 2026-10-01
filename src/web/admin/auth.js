const crypto = require('node:crypto');

/**
 * Authentification de l'espace d'administration.
 *
 * Seule l'empreinte scrypt du mot de passe est stockée (jamais le mot de passe).
 * La variable ADMIN_PASSWORD_HASH, si elle est définie, remplace l'empreinte ci-dessous :
 * générer une nouvelle empreinte avec `npm run admin-hash`.
 */
const DEFAULT_HASH = 'scrypt$65536$8$1$MC8RCEAmFBz9f0d-z58D6Q$o8cdKtLIBq4Lf5kCCYCfqbWOaENI1Jy0SWMAegzjeB0';

const SESSION_TTL = 8 * 3_600_000; // durée maximale d'une session
const SESSION_IDLE = 60 * 60_000; // déconnexion après 1 h d'inactivité
const WINDOW = 15 * 60_000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30; // protège contre les attaques réparties sur plusieurs IP

const sessions = new Map(); // token -> { created, seen }
const failures = new Map(); // ip -> [timestamps]
let globalFailures = [];

function parseHash(stored) {
  const [algo, N, r, p, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) throw new Error('Empreinte ADMIN_PASSWORD_HASH invalide');
  return { N: Number(N), r: Number(r), p: Number(p), salt: Buffer.from(salt, 'base64url'), hash: Buffer.from(hash, 'base64url') };
}

const stored = parseHash(process.env.ADMIN_PASSWORD_HASH || DEFAULT_HASH);

function hashPassword(password, salt = crypto.randomBytes(16), N = 65536, r = 8, p = 1) {
  const hash = crypto.scryptSync(password, salt, 32, { N, r, p, maxmem: 160 * 1024 * 1024 });
  return ['scrypt', N, r, p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

function verifyPassword(password) {
  return new Promise((resolve) => {
    if (typeof password !== 'string' || !password || password.length > 200) return resolve(false);
    crypto.scrypt(password, stored.salt, stored.hash.length, { N: stored.N, r: stored.r, p: stored.p, maxmem: 160 * 1024 * 1024 }, (err, derived) => {
      if (err) return resolve(false);
      resolve(crypto.timingSafeEqual(derived, stored.hash));
    });
  });
}

const recent = (list, now) => list.filter((t) => now - t < WINDOW);

/** Renvoie le nombre de secondes d'attente si la connexion est bloquée, sinon 0. */
function lockedFor(ip) {
  const now = Date.now();
  globalFailures = recent(globalFailures, now);
  const mine = recent(failures.get(ip) ?? [], now);
  failures.set(ip, mine);
  const list = mine.length >= MAX_FAILS_PER_IP ? mine : globalFailures.length >= MAX_FAILS_GLOBAL ? globalFailures : null;
  return list ? Math.ceil((WINDOW - (now - list[0])) / 1000) : 0;
}

function recordFailure(ip) {
  const now = Date.now();
  failures.set(ip, [...recent(failures.get(ip) ?? [], now), now]);
  globalFailures.push(now);
}

function createSession(ip) {
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { created: Date.now(), seen: Date.now() });
  return token;
}

function checkSession(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  const now = Date.now();
  if (now - s.created > SESSION_TTL || now - s.seen > SESSION_IDLE) {
    sessions.delete(token);
    return false;
  }
  s.seen = now;
  return true;
}

const destroySession = (token) => sessions.delete(token);

// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) if (now - s.created > SESSION_TTL || now - s.seen > SESSION_IDLE) sessions.delete(token);
  for (const [ip, list] of failures) if (!recent(list, now).length) failures.delete(ip);
}, 10 * 60_000).unref();

module.exports = { verifyPassword, hashPassword, lockedFor, recordFailure, createSession, checkSession, destroySession, SESSION_TTL };
