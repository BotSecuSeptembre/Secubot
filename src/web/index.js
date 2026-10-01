const { EventEmitter } = require('node:events');
const { Events } = require('discord.js');
const config = require('../config');
const { buildSnapshot } = require('./snapshot');
const { createSiteServer } = require('./server');

/**
 * Site public du serveur : liste en temps réel des membres, salons et rôles.
 * Le serveur web tourne dans le même processus que le bot et réutilise son cache Discord.
 */

const FEED_SIZE = 20;
const HISTORY_SIZE = 288; // 24 h à raison d'un point toutes les 5 minutes
const HISTORY_EVERY = 5 * 60_000;
const UPDATED = '1er octobre 2026';

function startWebsite(client) {
  if (!config.siteEnabled) return null;

  const source = new EventEmitter();
  const feed = [];
  const history = [];
  let approxOnline = null;
  let snapshot = null;
  let dirty = true;

  const guild = () => {
    if (config.siteGuildId) return client.guilds.cache.get(config.siteGuildId) ?? null;
    // Sans SITE_GUILD_ID : le serveur le plus peuplé du bot
    return [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount)[0] ?? null;
  };
  const isTarget = (g) => g && g.id === guild()?.id;

  const change = () => {
    dirty = true;
    source.emit('change');
  };

  source.getSnapshot = () => {
    if (!client.isReady()) return null;
    const g = guild();
    if (!g) return null;
    if (dirty || !snapshot) {
      snapshot = buildSnapshot(g, { feed, approxOnline, history });
      dirty = false;
    }
    return snapshot;
  };
  source.meta = () => ({
    name: guild()?.name ?? 'Serveur Discord',
    updated: UPDATED,
    contact: config.siteContact || 'le modmail du serveur (message privé au bot)',
  });

  const pushFeed = (type, member) => {
    feed.unshift({ t: type, id: member.id, n: member.displayName ?? member.user?.username, a: member.displayAvatarURL({ size: 64, extension: 'webp' }), at: Date.now() });
    feed.length = Math.min(feed.length, FEED_SIZE);
  };

  // ---------- Événements qui modifient l'état affiché ----------
  const on = (event, pick) =>
    client.on(event, (...args) => {
      try {
        if (isTarget(pick(...args))) change();
      } catch {}
    });

  client.on(Events.GuildMemberAdd, (m) => {
    if (!isTarget(m.guild)) return;
    pushFeed('join', m);
    change();
  });
  client.on(Events.GuildMemberRemove, (m) => {
    if (!isTarget(m.guild)) return;
    if (m.user) pushFeed('leave', m);
    change();
  });
  client.on(Events.GuildMemberUpdate, (before, after) => {
    if (!isTarget(after.guild)) return;
    if (!before.premiumSinceTimestamp && after.premiumSinceTimestamp) pushFeed('boost', after);
    change();
  });
  on(Events.PresenceUpdate, (_, p) => p?.guild);
  on(Events.VoiceStateUpdate, (_, s) => s.guild);
  on(Events.GuildMembersChunk, (_, g) => g);
  on(Events.ChannelCreate, (c) => c.guild);
  on(Events.ChannelDelete, (c) => c.guild);
  on(Events.ChannelUpdate, (_, c) => c.guild);
  on(Events.GuildRoleCreate, (r) => r.guild);
  on(Events.GuildRoleDelete, (r) => r.guild);
  on(Events.GuildRoleUpdate, (_, r) => r.guild);
  on(Events.GuildEmojiCreate, (e) => e.guild);
  on(Events.GuildEmojiDelete, (e) => e.guild);
  on(Events.GuildEmojiUpdate, (_, e) => e.guild);
  on(Events.GuildUpdate, (_, g) => g);
  client.on(Events.UserUpdate, (_, user) => {
    if (guild()?.members.cache.has(user.id)) change();
  });
  // Masquage ou réaffichage d'un membre via /site
  client.on('siteUpdate', (guildId) => {
    if (guildId === guild()?.id) change();
  });

  // Sans l'intent Presence, Discord fournit un nombre approximatif de membres en ligne
  const refreshOnline = async () => {
    const g = guild();
    if (!g || config.enablePresences) return;
    const fresh = await client.guilds.fetch({ guild: g.id, withCounts: true, force: true }).catch(() => null);
    if (fresh?.approximatePresenceCount != null && fresh.approximatePresenceCount !== approxOnline) {
      approxOnline = fresh.approximatePresenceCount;
      change();
    }
  };
  // Historique en mémoire (membres et membres en ligne) pour les courbes de l'aperçu
  const sample = () => {
    const current = source.getSnapshot();
    if (!current) return;
    history.push({ t: Date.now(), m: current.stats.members, o: current.stats.online });
    if (history.length > HISTORY_SIZE) history.splice(0, history.length - HISTORY_SIZE);
    change();
  };

  client.once(Events.ClientReady, async () => {
    change();
    await refreshOnline();
    setInterval(refreshOnline, 120_000).unref();
    // Premier point une fois les membres chargés par ready.js
    setTimeout(sample, 30_000).unref();
    setInterval(sample, HISTORY_EVERY).unref();
  });

  const server = createSiteServer(source);
  server.on('error', (err) => console.error('[site]', err.message));
  server.listen(config.sitePort, () => console.log(`🌐 Site en ligne sur le port ${config.sitePort}`));
  return server;
}

module.exports = { startWebsite };
