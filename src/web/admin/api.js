const { ChannelType, PermissionFlagsBits, ActivityType, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const pkg = require('../../../package.json');
const { logCase, addWarn, notifyUser } = require('../../utils/moderation');
const { sendLog } = require('../../utils/logger');
const { enableRaidMode, disableRaidMode } = require('../../utils/antiraid');
const { invalidateBans } = require('../../utils/analysis');
const { parseDuration, formatDuration } = require('../../utils/time');
const { embed } = require('../../utils/embed');
const logs = require('./logs');

/**
 * API de l'espace d'administration. Toutes les routes exigent une session valide
 * (contrôlée par server.js avant l'appel). Chaque action est tracée dans la console
 * et dans le salon de logs de modération du serveur.
 */

const MODULES = ['automod', 'antiraid', 'antinuke', 'verification', 'modmail'];
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const LOCK_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum];
const PRESENCE_TYPES = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  streaming: ActivityType.Streaming,
  custom: ActivityType.Custom,
};
const SNOWFLAKE = /^\d{15,21}$/;

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const hex = (color) => (color ? `#${color.toString(16).padStart(6, '0')}` : null);
const str = (value, max, name, required = false) => {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new ApiError(`${name} manquant.`);
  if (s.length > max) throw new ApiError(`${name} : ${max} caractères maximum.`);
  return s;
};

function reasonOf(body) {
  return `[Site] ${str(body.reason, 400, 'Raison') || 'Aucune raison fournie'}`;
}

// ---------- Lecture ----------

function memberSummary(guild, m, g) {
  return {
    id: m.id,
    tag: m.user.tag,
    username: m.user.username,
    display: m.displayName,
    avatar: m.displayAvatarURL({ size: 64, extension: 'webp' }),
    color: hex(m.displayColor),
    bot: m.user.bot,
    createdAt: m.user.createdTimestamp,
    joinedAt: m.joinedTimestamp,
    topRole: m.roles.highest.id === guild.id ? null : m.roles.highest.name,
    roles: m.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id),
    status: m.presence?.status ?? (config.enablePresences ? 'offline' : null),
    timeoutUntil: m.communicationDisabledUntilTimestamp > Date.now() ? m.communicationDisabledUntilTimestamp : null,
    boostSince: m.premiumSinceTimestamp,
    pending: m.pending,
    warns: g.warns.filter((w) => w.userId === m.id).length,
    cases: g.cases.filter((c) => c.targetId === m.id).length,
    quarantined: Boolean(g.quarantine?.[m.id]),
    hidden: (g.site?.hidden ?? []).includes(m.id),
    voice: m.voice?.channel?.name ?? null,
  };
}

function overview(client, guild) {
  const cfg = db.config(guild.id);
  const g = db.guild(guild.id);
  const me = guild.members.me;
  const p = db.global.presence;
  return {
    bot: {
      tag: client.user.tag,
      id: client.user.id,
      avatar: client.user.displayAvatarURL({ size: 128, extension: 'webp' }),
      ping: client.ws.ping,
      uptime: client.uptime,
      memory: process.memoryUsage().rss,
      node: process.version,
      version: pkg.version,
      guilds: client.guilds.cache.size,
      commands: client.commands?.size ?? 0,
      presences: config.enablePresences,
      presence: { status: p?.status ?? 'online', type: Object.keys(PRESENCE_TYPES).find((k) => PRESENCE_TYPES[k] === p?.activity?.type) ?? null, text: p?.activity?.name ?? '', url: p?.activity?.url ?? '' },
      topRole: me?.roles.highest.name,
      admin: me?.permissions.has(PermissionFlagsBits.Administrator) ?? false,
    },
    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 128, extension: 'webp' }),
      members: guild.memberCount,
      owner: guild.members.cache.get(guild.ownerId)?.user.tag ?? guild.ownerId,
      verificationLevel: guild.verificationLevel,
    },
    modules: Object.fromEntries(MODULES.map((k) => [k, Boolean(cfg[k]?.enabled)])),
    autoBackup: Boolean(cfg.autoBackup),
    raidMode: Boolean(cfg.antiraid.raidMode),
    raidModeSince: cfg.antiraid.raidModeSince,
    lockdown: cfg.lockedChannels.length,
    logChannels: Object.fromEntries(Object.entries(cfg.logs).map(([k, id]) => [k, id ? guild.channels.cache.get(id)?.name ?? null : null])),
    counts: { cases: g.cases.length, warns: g.warns.length, notes: g.notes.length, quarantine: Object.keys(g.quarantine ?? {}).length, tempbans: g.tempbans.length },
    channels: guild.channels.cache
      .filter((c) => TEXT_TYPES.includes(c.type) || c.type === ChannelType.GuildForum)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => ({
        id: c.id,
        name: c.name,
        parent: c.parent?.name ?? null,
        slowmode: c.rateLimitPerUser ?? 0,
        locked: !c.permissionsFor(guild.roles.everyone).has(PermissionFlagsBits.SendMessages),
        sendable: c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false,
        forum: c.type === ChannelType.GuildForum,
      })),
    roles: guild.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: hex(r.colors?.primaryColor ?? r.color), members: r.members.size, editable: r.editable && !r.managed })),
  };
}

async function memberDetail(guild, id) {
  if (!SNOWFLAKE.test(id)) throw new ApiError('Identifiant invalide.');
  const g = db.guild(guild.id);
  const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
  const user = member?.user ?? (await guild.client.users.fetch(id, { force: true }).catch(() => null));
  if (!user) throw new ApiError('Utilisateur introuvable.', 404);
  if (!member) await user.fetch(true).catch(() => null);
  else await member.user.fetch(true).catch(() => null);

  const u = db.data.users[id] ?? {};
  const local = g.members[id] ?? {};
  const ban = member ? null : await guild.bans.fetch(id).catch(() => null);
  const presence = member?.presence;

  return {
    id,
    inServer: Boolean(member),
    tag: user.tag,
    username: user.username,
    globalName: user.globalName,
    display: member?.displayName ?? user.globalName ?? user.username,
    nickname: member?.nickname ?? null,
    avatar: (member ?? user).displayAvatarURL({ size: 256, extension: 'webp' }),
    banner: user.bannerURL?.({ size: 600, extension: 'webp' }) ?? null,
    accentColor: hex(user.accentColor),
    bot: user.bot,
    flags: user.flags?.toArray() ?? [],
    createdAt: user.createdTimestamp,
    joinedAt: member?.joinedTimestamp ?? null,
    boostSince: member?.premiumSinceTimestamp ?? null,
    pending: member?.pending ?? false,
    timeoutUntil: member?.communicationDisabledUntilTimestamp > Date.now() ? member.communicationDisabledUntilTimestamp : null,
    roles: member ? member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: hex(r.colors?.primaryColor ?? r.color) })) : [],
    permissions: member ? member.permissions.toArray() : [],
    voice: member?.voice?.channel ? { channel: member.voice.channel.name, mute: member.voice.mute, deaf: member.voice.deaf, streaming: member.voice.streaming } : null,
    presence: presence
      ? {
          status: presence.status,
          devices: Object.keys(presence.clientStatus ?? {}),
          activities: presence.activities.map((a) => ({ type: a.type, name: a.name, details: a.details, state: a.state })),
        }
      : null,
    manageable: member ? { kick: member.kickable, ban: member.bannable, timeout: member.moderatable, nick: member.manageable } : null,
    banned: ban ? { reason: ban.reason } : null,
    local: {
      joinCount: local.joinCount ?? null,
      lastJoin: local.lastJoin ?? null,
      inviteCode: local.inviteCode ?? null,
      inviter: local.inviterId ? guild.client.users.cache.get(local.inviterId)?.tag ?? local.inviterId : null,
      vanity: local.vanity ?? false,
    },
    history: {
      names: (u.names ?? []).slice(-15),
      avatarsSeen: (u.avatars ?? []).length,
      otherServerSanctions: (u.sanctions ?? []).filter((s) => s.guildId !== guild.id).length,
      joins: (u.joins ?? []).filter((j) => j.guildId === guild.id).length,
    },
    quarantine: g.quarantine?.[id] ?? null,
    hidden: (g.site?.hidden ?? []).includes(id),
    warns: g.warns.filter((w) => w.userId === id).slice(-50),
    cases: g.cases.filter((c) => c.targetId === id).slice(-50),
    notes: g.notes.filter((n) => n.userId === id).slice(-50),
    verification: g.verifications?.[id] ?? null,
  };
}

function casesList(guild) {
  const g = db.guild(guild.id);
  return {
    cases: g.cases.slice(-300).reverse(),
    warns: g.warns.slice(-300).reverse(),
    notes: g.notes.slice(-100).reverse(),
    tempbans: g.tempbans,
    quarantine: Object.entries(g.quarantine ?? {}).map(([id, q]) => ({ id, ...q, tag: guild.client.users.cache.get(id)?.tag ?? id })),
  };
}

async function bansList(guild) {
  const bans = await guild.bans.fetch({ limit: 1000 }).catch(() => null);
  if (!bans) throw new ApiError('Impossible de lire les bannissements (permission manquante).', 403);
  return bans.map((b) => ({ id: b.user.id, tag: b.user.tag, avatar: b.user.displayAvatarURL({ size: 64, extension: 'webp' }), reason: b.reason }));
}

// ---------- Actions ----------

async function getMember(guild, id) {
  if (!SNOWFLAKE.test(String(id))) throw new ApiError('Membre invalide.');
  const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
  if (!member) throw new ApiError("Ce membre n'est pas sur le serveur.", 404);
  return member;
}

function assertTarget(guild, member) {
  if (member.id === guild.ownerId) throw new ApiError('Impossible d\'agir sur le propriétaire du serveur.');
  if (member.id === guild.client.user.id) throw new ApiError('Impossible d\'agir sur le bot lui même.');
  if (member.roles.highest.position >= guild.members.me.roles.highest.position) throw new ApiError('Le rôle de ce membre est au dessus de celui du bot.');
}

function getChannel(guild, id, types = TEXT_TYPES) {
  const channel = guild.channels.cache.get(String(id));
  if (!channel || !types.includes(channel.type)) throw new ApiError('Salon invalide.');
  return channel;
}

function getRole(guild, id) {
  const role = guild.roles.cache.get(String(id));
  if (!role || role.id === guild.id) throw new ApiError('Rôle invalide.');
  if (role.managed || !role.editable) throw new ApiError('Le bot ne peut pas gérer ce rôle (rôle géré ou placé au dessus du sien).');
  return role;
}

async function lockdown(guild, lock, reason) {
  const cfg = db.config(guild.id);
  const everyone = guild.roles.everyone;
  let count = 0;
  if (lock) {
    if (cfg.lockedChannels.length) throw new ApiError('Le serveur est déjà en lockdown.');
    const channels = guild.channels.cache.filter((c) => LOCK_TYPES.includes(c.type) && c.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages));
    for (const channel of channels.values()) {
      const ok = await channel.permissionOverwrites
        .edit(everyone, { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, AddReactions: false }, { reason: `Lockdown : ${reason}` })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        cfg.lockedChannels.push(channel.id);
        count++;
      }
    }
  } else {
    for (const id of cfg.lockedChannels) {
      const channel = guild.channels.cache.get(id);
      if (!channel) continue;
      const ok = await channel.permissionOverwrites
        .edit(everyone, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, AddReactions: null }, { reason: `Fin du lockdown : ${reason}` })
        .then(() => true)
        .catch(() => false);
      if (ok) count++;
    }
    cfg.lockedChannels = [];
  }
  db.save();
  return count;
}

/** Exécute une action et renvoie un message de confirmation. */
async function runAction(client, guild, body) {
  const me = client.user;
  const g = db.guild(guild.id);
  const cfg = g.config;
  const reason = reasonOf(body);

  switch (body.type) {
    // ----- Membres -----
    case 'warn': {
      const member = await getMember(guild, body.userId);
      assertTarget(guild, member);
      const { count, applied } = await addWarn(guild, member, me, reason);
      return `Avertissement ajouté (${count} au total)${applied ? `, sanction automatique : ${applied}` : ''}.`;
    }
    case 'timeout': {
      const member = await getMember(guild, body.userId);
      assertTarget(guild, member);
      const ms = parseDuration(str(body.duration, 20, 'Durée', true));
      if (!ms || ms > 28 * 86_400_000) throw new ApiError('Durée invalide (exemples : 10m, 2h, 7j ; 28 jours maximum).');
      if (!member.moderatable) throw new ApiError('Le bot ne peut pas rendre ce membre muet.');
      await member.timeout(ms, reason);
      await notifyUser(member.user, guild, 'timeout', reason, ms);
      await logCase(guild, { type: 'timeout', target: member, moderator: me, reason, duration: ms });
      return `${member.user.tag} est muet pendant ${formatDuration(ms)}.`;
    }
    case 'untimeout': {
      const member = await getMember(guild, body.userId);
      await member.timeout(null, reason);
      await logCase(guild, { type: 'untimeout', target: member, moderator: me, reason });
      return `${member.user.tag} peut de nouveau parler.`;
    }
    case 'kick': {
      const member = await getMember(guild, body.userId);
      assertTarget(guild, member);
      if (!member.kickable) throw new ApiError('Le bot ne peut pas expulser ce membre.');
      await notifyUser(member.user, guild, 'kick', reason);
      await member.kick(reason);
      await logCase(guild, { type: 'kick', target: member, moderator: me, reason });
      return `${member.user.tag} a été expulsé.`;
    }
    case 'ban': {
      const id = String(body.userId ?? '');
      if (!SNOWFLAKE.test(id)) throw new ApiError('Identifiant invalide.');
      const member = guild.members.cache.get(id);
      if (member) {
        assertTarget(guild, member);
        if (!member.bannable) throw new ApiError('Le bot ne peut pas bannir ce membre.');
      }
      const user = member?.user ?? (await client.users.fetch(id).catch(() => null));
      if (!user) throw new ApiError('Utilisateur introuvable.', 404);
      const ms = body.duration ? parseDuration(str(body.duration, 20, 'Durée')) : null;
      if (body.duration && !ms) throw new ApiError('Durée invalide (exemples : 1h, 7j, 2w).');
      const days = Math.min(7, Math.max(0, Number(body.deleteDays) || 0));
      if (member) await notifyUser(user, guild, ms ? 'tempban' : 'ban', reason, ms);
      await guild.members.ban(id, { reason, deleteMessageSeconds: days * 86_400 });
      if (ms) {
        g.tempbans.push({ userId: id, until: Date.now() + ms });
        db.save();
      }
      invalidateBans?.(guild.id);
      await logCase(guild, { type: ms ? 'tempban' : 'ban', target: user, moderator: me, reason, duration: ms });
      return `${user.tag} a été banni${ms ? ` pour ${formatDuration(ms)}` : ''}.`;
    }
    case 'unban': {
      const id = String(body.userId ?? '');
      if (!SNOWFLAKE.test(id)) throw new ApiError('Identifiant invalide.');
      const user = await client.users.fetch(id).catch(() => null);
      await guild.members.unban(id, reason);
      g.tempbans = g.tempbans.filter((t) => t.userId !== id);
      db.save();
      invalidateBans?.(guild.id);
      if (user) await logCase(guild, { type: 'unban', target: user, moderator: me, reason });
      return `${user?.tag ?? id} a été débanni.`;
    }
    case 'nick': {
      const member = await getMember(guild, body.userId);
      if (!member.manageable) throw new ApiError('Le bot ne peut pas renommer ce membre.');
      const nick = str(body.nick, 32, 'Pseudo');
      await member.setNickname(nick || null, reason);
      return nick ? `Pseudo changé en « ${nick} ».` : 'Pseudo réinitialisé.';
    }
    case 'roleAdd':
    case 'roleRemove': {
      const member = await getMember(guild, body.userId);
      const role = getRole(guild, body.roleId);
      if (body.type === 'roleAdd') await member.roles.add(role, reason);
      else await member.roles.remove(role, reason);
      return `Rôle « ${role.name} » ${body.type === 'roleAdd' ? 'ajouté' : 'retiré'}.`;
    }
    case 'note': {
      const id = String(body.userId ?? '');
      if (!SNOWFLAKE.test(id)) throw new ApiError('Identifiant invalide.');
      const note = { id: (g.notes.at(-1)?.id || 0) + 1, userId: id, moderatorId: me.id, text: `[Site] ${str(body.text, 1000, 'Note', true)}`, timestamp: Date.now() };
      g.notes.push(note);
      db.save();
      return `Note #${note.id} ajoutée.`;
    }
    case 'dm': {
      const id = String(body.userId ?? '');
      if (!SNOWFLAKE.test(id)) throw new ApiError('Identifiant invalide.');
      const user = await client.users.fetch(id).catch(() => null);
      if (!user) throw new ApiError('Utilisateur introuvable.', 404);
      const text = str(body.text, 2000, 'Message', true);
      const ok = await user
        .send({ embeds: [embed(guild.id).setAuthor({ name: `Message de l'équipe de ${guild.name}`, iconURL: guild.iconURL() ?? undefined }).setDescription(text).setTimestamp()] })
        .then(() => true)
        .catch(() => false);
      if (!ok) throw new ApiError('Message non distribué : ce membre bloque les messages privés.');
      return `Message privé envoyé à ${user.tag}.`;
    }
    case 'voiceDisconnect': {
      const member = await getMember(guild, body.userId);
      if (!member.voice?.channel) throw new ApiError("Ce membre n'est pas en vocal.");
      await member.voice.disconnect(reason);
      return `${member.user.tag} a été déconnecté du vocal.`;
    }
    case 'siteHide':
    case 'siteShow': {
      const id = String(body.userId ?? '');
      if (!SNOWFLAKE.test(id)) throw new ApiError('Identifiant invalide.');
      const hidden = new Set(g.site.hidden);
      if (body.type === 'siteHide') hidden.add(id);
      else hidden.delete(id);
      g.site.hidden = [...hidden];
      db.save();
      client.emit('siteUpdate', guild.id);
      return body.type === 'siteHide' ? 'Membre masqué sur le site public.' : 'Membre de nouveau visible sur le site public.';
    }

    // ----- Salons -----
    case 'send': {
      const channel = getChannel(guild, body.channelId);
      const content = str(body.content, 2000, 'Message');
      const title = str(body.embedTitle, 256, 'Titre');
      const description = str(body.embedDescription, 4000, 'Description');
      if (!content && !title && !description) throw new ApiError('Le message est vide.');
      const payload = { allowedMentions: body.mentions ? { parse: ['users', 'roles', 'everyone'] } : { parse: [] } };
      if (content) payload.content = content;
      if (title || description) {
        const e = new EmbedBuilder().setColor(/^#[0-9a-f]{6}$/i.test(body.embedColor ?? '') ? parseInt(body.embedColor.slice(1), 16) : (cfg.theme ?? config.defaultColor));
        if (title) e.setTitle(title);
        if (description) e.setDescription(description);
        payload.embeds = [e];
      }
      await channel.send(payload);
      return `Message envoyé dans #${channel.name}.`;
    }
    case 'purge': {
      const channel = getChannel(guild, body.channelId);
      const count = Math.min(100, Math.max(1, Number(body.count) || 0));
      const deleted = await channel.bulkDelete(count, true);
      return `${deleted.size} message(s) supprimé(s) dans #${channel.name} (les messages de plus de 14 jours ne peuvent pas être supprimés en masse).`;
    }
    case 'slowmode': {
      const channel = getChannel(guild, body.channelId, LOCK_TYPES);
      const seconds = Math.min(21_600, Math.max(0, Number(body.seconds) || 0));
      await channel.setRateLimitPerUser(seconds, reason);
      return seconds ? `Mode lent de ${seconds} s dans #${channel.name}.` : `Mode lent désactivé dans #${channel.name}.`;
    }
    case 'lock':
    case 'unlock': {
      const channel = getChannel(guild, body.channelId, LOCK_TYPES);
      const lock = body.type === 'lock';
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: lock ? false : null, SendMessagesInThreads: lock ? false : null }, { reason });
      return `#${channel.name} ${lock ? 'verrouillé' : 'déverrouillé'}.`;
    }

    // ----- Serveur -----
    case 'lockdown': {
      const lock = Boolean(body.enabled);
      const count = await lockdown(guild, lock, reason);
      await sendLog(guild, 'server', embed(guild.id).setColor(lock ? config.colors.danger : config.colors.success).setTitle(lock ? '🔒 LOCKDOWN DU SERVEUR' : '🔓 Fin du lockdown').setDescription(`Depuis le site d'administration · ${reason}\n${count} salon(s).`));
      return `${lock ? 'Lockdown activé' : 'Lockdown levé'} : ${count} salon(s).`;
    }
    case 'raidmode': {
      if (body.enabled) await enableRaidMode(guild, `Activé depuis le site d'administration`, false);
      else await disableRaidMode(guild);
      return body.enabled ? 'Mode raid activé.' : 'Mode raid désactivé.';
    }
    case 'module': {
      if (body.module === 'autoBackup') cfg.autoBackup = Boolean(body.enabled);
      else if (MODULES.includes(body.module)) cfg[body.module].enabled = Boolean(body.enabled);
      else throw new ApiError('Module inconnu.');
      db.save();
      return `Module ${body.module} ${body.enabled ? 'activé' : 'désactivé'}.`;
    }

    // ----- Bot -----
    case 'presence': {
      const status = ['online', 'idle', 'dnd', 'invisible'].includes(body.status) ? body.status : 'online';
      const text = str(body.text, 128, 'Activité');
      const type = PRESENCE_TYPES[body.activity];
      const url = str(body.url, 200, 'Lien');
      if (type === ActivityType.Streaming && !/^https:\/\/(www\.)?(twitch\.tv|youtube\.com)\//.test(url)) throw new ApiError('Le stream doit pointer vers Twitch ou YouTube.');
      db.global.presence = { status, activity: text && type != null ? { type, name: text, url: type === ActivityType.Streaming ? url : null } : null };
      db.save();
      require('../../events/ready').applyPresence(client);
      return 'Statut du bot mis à jour.';
    }
    default:
      throw new ApiError('Action inconnue.');
  }
}

const ACTION_NAMES = {
  warn: 'Avertissement', timeout: 'Mute', untimeout: 'Fin de mute', kick: 'Expulsion', ban: 'Bannissement', unban: 'Débannissement',
  nick: 'Pseudo', roleAdd: 'Ajout de rôle', roleRemove: 'Retrait de rôle', note: 'Note', dm: 'Message privé', voiceDisconnect: 'Déconnexion vocale',
  siteHide: 'Masquage site', siteShow: 'Affichage site', send: 'Message envoyé', purge: 'Purge', slowmode: 'Mode lent', lock: 'Salon verrouillé',
  unlock: 'Salon déverrouillé', lockdown: 'Lockdown', raidmode: 'Mode raid', module: 'Module', presence: 'Statut du bot',
};

async function audit(guild, body, result, ip) {
  const target = body.userId ? ` · cible ${body.userId}` : body.channelId ? ` · salon ${body.channelId}` : '';
  console.log(`[admin] ${ACTION_NAMES[body.type] ?? body.type}${target} · ${result}`);
  // Les sanctions ont déjà leur propre log (cas numéroté) : on ne double pas
  if (['warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban'].includes(body.type)) return;
  await sendLog(
    guild,
    'mod',
    embed(guild.id)
      .setTitle(`🌐 Action depuis le site · ${ACTION_NAMES[body.type] ?? body.type}`)
      .setDescription(result.slice(0, 1000))
      .setFooter({ text: `Session d'administration · ${ip.replace(/\.\d+$/, '.x')}` })
      .setTimestamp(),
  );
}

/**
 * Route une requête API authentifiée.
 * @returns {Promise<{ status: number, data: object }>}
 */
async function handle({ client, guild, method, route, query, body, ip }) {
  try {
    if (!client.isReady() || !guild) throw new ApiError('Le bot démarre, réessaie dans quelques secondes.', 503);
    if (method === 'GET') {
      if (route === 'overview') return { status: 200, data: overview(client, guild) };
      if (route === 'members') {
        const g = db.guild(guild.id);
        return { status: 200, data: { members: guild.members.cache.map((m) => memberSummary(guild, m, g)) } };
      }
      if (route === 'member') return { status: 200, data: await memberDetail(guild, query.get('id') ?? '') };
      if (route === 'cases') return { status: 200, data: casesList(guild) };
      if (route === 'bans') return { status: 200, data: { bans: await bansList(guild) } };
      if (route === 'logs') {
        return {
          status: 200,
          data: { console: logs.getConsole(Number(query.get('after')) || 0), discord: logs.getDiscordLogs(guild.id, Number(query.get('dafter')) || 0) },
        };
      }
    }
    if (method === 'POST' && route === 'action') {
      const result = await runAction(client, guild, body ?? {});
      await audit(guild, body, result, ip).catch(() => null);
      return { status: 200, data: { ok: true, message: result } };
    }
    throw new ApiError('Route inconnue.', 404);
  } catch (err) {
    if (err instanceof ApiError) return { status: err.status, data: { error: err.message } };
    console.error('[admin]', err);
    const message = err?.code === 50013 ? 'Permission Discord manquante pour le bot.' : err?.rawError?.message || err?.message || 'Erreur inconnue.';
    return { status: 500, data: { error: message } };
  }
}

module.exports = { handle };
