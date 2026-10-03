const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { embed } = require('./embed');
const { logCase } = require('./moderation');
const { formatDuration, ts } = require('./time');
const { colors } = require('../config');

/**
 * Prison (/jail) : le membre perd tous ses rôles et reçoit le rôle « Prison »,
 * qui lui interdit de voir tous les salons sauf le salon prison.
 * Ses rôles sont rendus automatiquement à la fin du délai.
 */

const MAX_TIMEOUT = 2 ** 31 - 1; // limite de setTimeout (~24,8 jours)
const timers = new Map(); // `${guildId}:${userId}` -> Timeout

const HIDE = { ViewChannel: false, SendMessages: false, Connect: false, AddReactions: false, CreatePublicThreads: false, SendMessagesInThreads: false };
const PRISON = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, Connect: true, Speak: true };

/** Peut utiliser /jail : propriétaire, administrateurs et utilisateurs autorisés. */
function canJail(member) {
  const cfg = db.config(member.guild.id).jail;
  return (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    cfg.allowedUsers.includes(member.id)
  );
}

/** Applique l'interdiction du rôle prison sur un salon (sauf le salon prison). */
async function applyChannelOverwrite(channel, role, prisonId) {
  if (!channel.permissionOverwrites || channel.isThread()) return;
  const current = channel.permissionOverwrites.cache.get(role.id);
  if (channel.id === prisonId) {
    if (!current?.allow.has(PermissionFlagsBits.ViewChannel)) {
      await channel.permissionOverwrites.edit(role, PRISON, { reason: 'Salon prison' }).catch(() => null);
    }
    return;
  }
  if (!current?.deny.has(PermissionFlagsBits.ViewChannel)) {
    await channel.permissionOverwrites.edit(role, HIDE, { reason: 'Rôle prison : salon caché' }).catch(() => null);
  }
}

/** Récupère ou crée le rôle prison et vérifie qu'il est appliqué sur tous les salons. */
async function ensureJailRole(guild) {
  const cfg = db.config(guild.id).jail;
  let role = cfg.roleId ? guild.roles.cache.get(cfg.roleId) : null;
  if (!role) {
    role = await guild.roles.create({ name: '⛓️ Prison', color: 0x4f545c, permissions: [], reason: 'Rôle de la prison (/jail)' });
    cfg.roleId = role.id;
    db.save();
  }
  for (const channel of guild.channels.cache.values()) await applyChannelOverwrite(channel, role, cfg.channelId);
  return role;
}

/** Programme la libération (le planificateur sert de filet de sécurité après un redémarrage). */
function scheduleRelease(client, guildId, userId, until) {
  const key = `${guildId}:${userId}`;
  clearTimeout(timers.get(key));
  const delay = Math.max(0, until - Date.now());
  if (delay > MAX_TIMEOUT) return;
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const guild = client.guilds.cache.get(guildId);
      if (guild) release(guild, userId, client.user, 'Fin de la peine').catch((err) => console.error('[jail]', err));
    }, delay),
  );
}

/**
 * Met un membre en prison (ou change la durée s'il y est déjà).
 * @returns {{ extended: boolean, until: number, removed: number }}
 */
async function jail(guild, member, moderator, duration, reason) {
  const g = db.guild(guild.id);
  const cfg = g.config.jail;
  const until = Date.now() + duration;
  const existing = g.jails[member.id];

  // Déjà en prison : on remplace simplement la durée (sans écraser les rôles sauvegardés)
  if (existing) {
    existing.until = until;
    existing.reason = reason;
    db.save();
    scheduleRelease(guild.client, guild.id, member.id, until);
    await logCase(guild, { type: 'jail', target: member.user, moderator, reason: `Durée modifiée : ${reason}`, duration });
    return { extended: true, until, removed: 0 };
  }

  const role = await ensureJailRole(guild);
  const saved = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.id !== role.id);
  g.jails[member.id] = { roles: saved.map((r) => r.id), at: Date.now(), until, by: moderator.id, reason };
  db.save();

  await member.roles.set([...member.roles.cache.filter((r) => r.managed).keys(), role.id], `Prison (${formatDuration(duration)}) : ${reason}`);
  if (member.voice?.channel) await member.voice.disconnect('Prison').catch(() => null);
  scheduleRelease(guild.client, guild.id, member.id, until);

  await logCase(guild, { type: 'jail', target: member.user, moderator, reason, duration, extra: `${saved.size} rôle(s) mis de côté` });
  await member
    .send({
      embeds: [
        embed(guild.id)
          .setColor(colors.warning)
          .setTitle(`⛓️ Tu es en prison sur ${guild.name}`)
          .setDescription(`**Durée :** ${formatDuration(duration)} (fin ${ts(until, 'R')})\n**Raison :** ${reason}\n\nTu ne vois plus que le salon prison. Tes rôles te seront rendus automatiquement à la fin.`),
      ],
    })
    .catch(() => null);

  const prison = guild.channels.cache.get(cfg.channelId);
  await prison
    ?.send({
      content: `${member}`,
      embeds: [
        embed(guild.id)
          .setColor(colors.warning)
          .setDescription(`⛓️ ${member} est en prison pour **${formatDuration(duration)}** (sortie ${ts(until, 'R')}).\n**Raison :** ${reason}`),
      ],
    })
    .catch(() => null);
  return { extended: false, until, removed: saved.size };
}

/**
 * Sort un membre de prison et lui rend ses rôles.
 * S'il a quitté le serveur, ses rôles lui seront rendus à son retour.
 */
async function release(guild, userId, moderator, reason = 'Fin de la peine') {
  const g = db.guild(guild.id);
  const entry = g.jails[userId];
  if (!entry || entry.released) return false;
  clearTimeout(timers.get(`${guild.id}:${userId}`));
  timers.delete(`${guild.id}:${userId}`);

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    entry.released = true; // rôles rendus au retour (voir guildMemberAdd)
    db.save();
    return true;
  }
  await restoreRoles(guild, member, entry);
  delete g.jails[userId];
  db.save();

  await logCase(guild, { type: 'unjail', target: member.user, moderator, reason });
  await member
    .send({ embeds: [embed(guild.id).setColor(colors.success).setTitle(`🔓 Tu es sorti de prison sur ${guild.name}`).setDescription('Tes rôles t\'ont été rendus.')] })
    .catch(() => null);
  return true;
}

async function restoreRoles(guild, member, entry) {
  const jailRoleId = db.config(guild.id).jail.roleId;
  const roles = entry.roles.filter((id) => {
    const r = guild.roles.cache.get(id);
    return r && r.editable && !r.managed;
  });
  const keep = member.roles.cache.filter((r) => r.managed || (!r.editable && r.id !== guild.id)).map((r) => r.id);
  await member.roles.set([...new Set([...keep, ...roles])].filter((id) => id !== jailRoleId), 'Sortie de prison');
}

/** Au retour d'un membre : re-prison s'il n'a pas fini sa peine, sinon on lui rend ses rôles. */
async function onMemberJoin(member) {
  const g = db.guild(member.guild.id);
  const entry = g.jails[member.id];
  if (!entry) return;
  if (!entry.released && entry.until > Date.now()) {
    const role = await ensureJailRole(member.guild);
    await member.roles.add(role, 'Prison (a quitté puis rejoint)').catch(() => null);
    scheduleRelease(member.client, member.guild.id, member.id, entry.until);
    return;
  }
  await restoreRoles(member.guild, member, entry).catch(() => null);
  delete g.jails[member.id];
  db.save();
}

/** Relance les minuteurs au démarrage du bot. */
function restoreTimers(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const [userId, entry] of Object.entries(db.guild(guild.id).jails)) {
      if (!entry.released) scheduleRelease(client, guild.id, userId, entry.until);
    }
  }
}

/** Filet de sécurité appelé chaque minute par le planificateur. */
async function checkExpired(guild) {
  for (const [userId, entry] of Object.entries(db.guild(guild.id).jails)) {
    if (!entry.released && entry.until <= Date.now()) await release(guild, userId, guild.client.user).catch(() => null);
  }
}

/** Nouveau salon : le cacher aussi aux prisonniers. */
async function onChannelCreate(channel) {
  if (!channel.guild) return;
  const cfg = db.config(channel.guild.id).jail;
  const role = cfg.roleId ? channel.guild.roles.cache.get(cfg.roleId) : null;
  if (role) await applyChannelOverwrite(channel, role, cfg.channelId);
}

module.exports = { canJail, jail, release, ensureJailRole, onMemberJoin, restoreTimers, checkExpired, onChannelCreate };
