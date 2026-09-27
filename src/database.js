const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('./config');

/**
 * Base de données JSON minimaliste : un seul fichier, écritures atomiques
 * (fichier temporaire + rename) et sauvegarde différée pour limiter les I/O.
 * Aucune dépendance native : fonctionne tel quel sur Railway.
 */

const FILE = path.join(dataDir, 'database.json');

const defaultGuildConfig = () => ({
  theme: null,
  logs: {
    mod: null, // sanctions
    messages: null, // suppression / édition
    members: null, // arrivées / départs / pseudos / rôles
    server: null, // salons, rôles, antinuke, antiraid
    reports: null, // signalements des membres
  },
  quarantine: {
    roleId: null,
  },
  autoBackup: false,
  modmail: {
    enabled: false,
    channelId: null,
    staffRoleId: null,
    anonymous: false,
    blocked: [],
  },
  verification: {
    enabled: false,
    panelChannelId: null,
    panelMessageId: null,
    staffChannelId: null,
    verifiedRoleId: null,
    unverifiedRoleId: null,
    staffRoleId: null,
    dmOnDecision: true,
    autoKickHours: 0,
  },
  automod: {
    enabled: false,
    action: 'delete', // delete | warn | timeout
    timeoutMinutes: 10,
    antiSpam: { enabled: true, messages: 6, seconds: 5 },
    antiDuplicate: { enabled: true, count: 4 },
    antiInvite: true,
    antiLink: false,
    allowedDomains: ['tenor.com', 'giphy.com', 'youtube.com', 'youtu.be'],
    antiMassMention: { enabled: true, limit: 5 },
    antiEveryone: true,
    antiCaps: { enabled: false, percent: 70, minLength: 12 },
    antiEmoji: { enabled: false, limit: 10 },
    antiZalgo: true,
    antiNewlines: { enabled: false, limit: 15 },
    badWords: [],
    ignoredChannels: [],
    ignoredRoles: [],
  },
  antiraid: {
    enabled: false,
    joinThreshold: 8,
    joinSeconds: 10,
    action: 'kick', // kick | ban | none (juste alerter)
    autoLockdown: true,
    minAccountAgeDays: 0,
    minAgeAction: 'kick', // kick | ban | flag
    noAvatarAction: 'none', // kick | flag | none
    blockBots: true,
    raidMode: false,
    raidModeSince: null,
  },
  antinuke: {
    enabled: false,
    threshold: 3,
    seconds: 10,
    punishment: 'strip', // strip | kick | ban
    whitelist: [],
  },
  warnThresholds: [
    // { count: 3, action: 'timeout', duration: 3600000 }
  ],
  lockedChannels: [],
});

const defaultData = () => ({
  global: {
    presence: null,
    blacklist: [],
    blacklistedGuilds: [],
  },
  guilds: {},
  users: {},
});

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], value);
    } else if (target[key] === undefined) {
      target[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return target;
}

class Database {
  constructor() {
    this.data = defaultData();
    this.saveTimer = null;
    this.load();
  }

  load() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(FILE)) return this.saveNow();
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      this.data = deepMerge(raw, defaultData());
    } catch (err) {
      const backup = `${FILE}.corrupted-${Date.now()}`;
      fs.copyFileSync(FILE, backup);
      console.error(`[DB] Fichier illisible, sauvegardé dans ${backup}. Nouvelle base créée.`, err);
      this.data = defaultData();
      this.saveNow();
    }
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, FILE);
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      try {
        this.saveNow();
      } catch (err) {
        console.error('[DB] Erreur de sauvegarde', err);
      }
    }, 1000);
  }

  /** Données brutes d'un serveur (config + historique). */
  guild(guildId) {
    if (!this.data.guilds[guildId]) {
      this.data.guilds[guildId] = { config: defaultGuildConfig(), cases: [], warns: [], notes: [], modmail: {}, verifications: {}, members: {}, tempbans: [], quarantine: {}, lastAutoBackup: 0 };
      this.save();
    }
    const g = this.data.guilds[guildId];
    deepMerge(g, { config: defaultGuildConfig(), cases: [], warns: [], notes: [], modmail: {}, verifications: {}, members: {}, tempbans: [], quarantine: {}, lastAutoBackup: 0 });
    return g;
  }

  config(guildId) {
    return this.guild(guildId).config;
  }

  /** Données globales d'un utilisateur (historique multi-serveurs pour la détection de doubles comptes). */
  user(userId) {
    if (!this.data.users[userId]) this.data.users[userId] = {};
    return deepMerge(this.data.users[userId], { joins: [], names: [], avatars: [], sanctions: [] });
  }

  get global() {
    return this.data.global;
  }

  /** Ajoute un cas de modération et renvoie son numéro. */
  addCase(guildId, entry) {
    const g = this.guild(guildId);
    const id = (g.cases.at(-1)?.id || 0) + 1;
    const record = { id, timestamp: Date.now(), ...entry };
    g.cases.push(record);
    if (g.cases.length > 5000) g.cases.splice(0, g.cases.length - 5000);
    if (entry.targetId) {
      const u = this.user(entry.targetId);
      u.sanctions.push({ guildId, type: entry.type, reason: entry.reason, timestamp: record.timestamp });
      if (u.sanctions.length > 100) u.sanctions.splice(0, u.sanctions.length - 100);
    }
    this.save();
    return record;
  }
}

const db = new Database();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    try {
      db.saveNow();
    } catch {}
    process.exit(0);
  });
}

module.exports = db;
module.exports.defaultGuildConfig = defaultGuildConfig;
