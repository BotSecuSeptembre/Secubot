const util = require('node:util');

/**
 * Journaux affichés dans l'espace d'administration, conservés en mémoire uniquement :
 * - la console du bot (console.log / warn / error)
 * - une copie des logs envoyés dans les salons de logs Discord (utils/logger.js)
 */

const MAX = 500;
const consoleLines = [];
const discordLogs = [];
let seq = 0;

function push(list, entry) {
  entry.id = ++seq;
  list.push(entry);
  if (list.length > MAX) list.splice(0, list.length - MAX);
}

let installed = false;
function captureConsole() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      try {
        const text = util.format(...args).replace(/\u001b\[[0-9;]*m/g, '').slice(0, 4000);
        push(consoleLines, { at: Date.now(), level: level === 'info' ? 'log' : level, text });
      } catch {}
    };
  }
}

/** Résume un embed (ou un message) envoyé par sendLog. */
function mirrorDiscordLog(guild, type, payload) {
  try {
    const raw = payload?.toJSON ? payload.toJSON() : payload?.data ?? payload?.embeds?.[0]?.toJSON?.() ?? payload?.embeds?.[0] ?? payload;
    const e = raw?.data ?? raw ?? {};
    const fields = (e.fields ?? []).slice(0, 10).map((f) => ({ name: String(f.name).slice(0, 100), value: String(f.value).slice(0, 500) }));
    push(discordLogs, {
      at: Date.now(),
      guildId: guild?.id,
      type,
      title: String(e.title ?? e.author?.name ?? payload?.content ?? 'Log').slice(0, 200),
      description: e.description ? String(e.description).slice(0, 1500) : null,
      color: e.color ?? null,
      fields,
    });
  } catch {}
}

const since = (list, after) => list.filter((e) => e.id > after);

module.exports = {
  captureConsole,
  mirrorDiscordLog,
  getConsole: (after = 0) => since(consoleLines, after),
  getDiscordLogs: (guildId, after = 0) => since(discordLogs, after).filter((e) => !guildId || e.guildId === guildId),
};
