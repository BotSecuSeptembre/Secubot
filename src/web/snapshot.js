const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const config = require('../config');

/**
 * Construit l'état public du serveur affiché par le site.
 * Seules les informations déjà visibles par un membre du serveur sont exposées :
 * pas d'identifiants internes de modération, pas de salons privés.
 */

const STAFF_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
];

const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
const CHANNEL_KIND = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildAnnouncement]: 'news',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'forum',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildStageVoice]: 'stage',
};

const hex = (color) => (color ? `#${color.toString(16).padStart(6, '0')}` : null);
const avatar = (target) => target.displayAvatarURL({ size: 64, extension: 'webp' });

function hiddenSet(guildId) {
  return new Set(db.guild(guildId).site?.hidden ?? []);
}

/** Rôle qui représente « un membre ordinaire » : rôle vérifié si la vérification est active. */
function publicRole(guild) {
  const v = db.config(guild.id).verification;
  if (v.enabled && v.verifiedRoleId) {
    const role = guild.roles.cache.get(v.verifiedRoleId);
    if (role) return role;
  }
  return guild.roles.everyone;
}

function buildMembers(guild, hidden) {
  const members = [];
  for (const m of guild.members.cache.values()) {
    if (hidden.has(m.id)) continue;
    const hoist = m.roles.hoist;
    members.push({
      id: m.id,
      n: m.displayName,
      u: m.user.username,
      a: avatar(m),
      c: hex(m.displayColor),
      s: config.enablePresences ? (m.presence?.status ?? 'offline') : null,
      b: m.user.bot || undefined,
      j: m.joinedTimestamp ?? null,
      h: hoist && hoist.id !== guild.id ? hoist.id : null,
      r: m.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id),
      p: m.premiumSinceTimestamp ?? undefined,
    });
  }
  return members;
}

function buildChannels(guild, hidden) {
  const role = publicRole(guild);
  const visible = (c) => c.permissionsFor(role)?.has(PermissionFlagsBits.ViewChannel) ?? false;
  const sortKey = (c) => [VOICE_TYPES.has(c.type) ? 1 : 0, c.rawPosition, c.id];
  const compare = (a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : 1);
  };

  const toChannel = (c) => ({
    id: c.id,
    n: c.name,
    k: CHANNEL_KIND[c.type],
    t: c.topic ? c.topic.slice(0, 160) : undefined,
    v: VOICE_TYPES.has(c.type) ? c.members.filter((m) => !hidden.has(m.id)).map((m) => m.id) : undefined,
    l: VOICE_TYPES.has(c.type) && c.userLimit ? c.userLimit : undefined,
  });

  const all = [...guild.channels.cache.values()].filter((c) => CHANNEL_KIND[c.type] && visible(c));
  const groups = [];
  const loose = all.filter((c) => !c.parentId).sort(compare);
  if (loose.length) groups.push({ id: null, n: null, c: loose.map(toChannel) });

  const categories = [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition);
  for (const cat of categories) {
    const children = all.filter((c) => c.parentId === cat.id).sort(compare);
    if (children.length) groups.push({ id: cat.id, n: cat.name, c: children.map(toChannel) });
  }
  return groups;
}

function buildRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      n: r.name,
      c: hex(r.colors?.primaryColor ?? r.color),
      h: r.hoist || undefined,
      m: r.managed || undefined,
      i: r.iconURL({ size: 32 }) ?? undefined,
      e: r.unicodeEmoji ?? undefined,
      k: r.members.size,
      s: STAFF_PERMS.some((p) => r.permissions.has(p)) || undefined,
    }));
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {{ feed: object[], approxOnline: number|null }} extra
 */
function buildSnapshot(guild, extra) {
  const hidden = hiddenSet(guild.id);
  const members = buildMembers(guild, hidden);
  const humans = guild.members.cache.filter((m) => !m.user.bot).size;
  const inVoice = guild.voiceStates.cache.filter((s) => s.channelId).size;
  const online = config.enablePresences
    ? guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size
    : extra.approxOnline;

  const staff = guild.members.cache
    .filter((m) => !m.user.bot && !hidden.has(m.id) && (m.id === guild.ownerId || STAFF_PERMS.some((p) => m.permissions.has(p))))
    .sort((a, b) => b.roles.highest.position - a.roles.highest.position)
    .map((m) => ({ id: m.id, role: m.id === guild.ownerId ? 'Propriétaire' : m.roles.highest.name }));

  const owner = guild.members.cache.get(guild.ownerId);

  return {
    updatedAt: Date.now(),
    presences: config.enablePresences,
    guild: {
      id: guild.id,
      name: guild.name,
      description: guild.description ?? null,
      icon: guild.iconURL({ size: 128, extension: 'webp' }),
      banner: guild.bannerURL({ size: 1024, extension: 'webp' }),
      createdAt: guild.createdTimestamp,
      owner: owner && !hidden.has(owner.id) ? owner.displayName : null,
      boosts: guild.premiumSubscriptionCount ?? 0,
      tier: guild.premiumTier,
      verification: guild.verificationLevel,
      vanity: guild.vanityURLCode ?? null,
      invite: config.siteInviteUrl || (guild.vanityURLCode ? `https://discord.gg/${guild.vanityURLCode}` : null),
    },
    stats: {
      members: guild.memberCount,
      humans,
      bots: guild.members.cache.size - humans,
      online,
      inVoice,
      channels: guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory && !c.isThread()).size,
      roles: guild.roles.cache.size - 1,
      emojis: guild.emojis.cache.size,
    },
    members,
    roles: buildRoles(guild),
    channels: buildChannels(guild, hidden),
    staff,
    emojis: [...guild.emojis.cache.values()].slice(0, 80).map((e) => ({ n: e.name, u: e.imageURL({ size: 64 }) })),
    feed: extra.feed.filter((f) => !hidden.has(f.id)),
    history: extra.history ?? [],
  };
}

module.exports = { buildSnapshot };
