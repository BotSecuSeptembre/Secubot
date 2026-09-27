const fs = require('node:fs');
const path = require('node:path');
const { ChannelType, OverwriteType } = require('discord.js');
const { dataDir } = require('../config');
const db = require('../database');

/**
 * Sauvegardes de la structure du serveur (rôles, salons, permissions).
 * Stockées dans DATA_DIR/backups/<guildId>/<id>.json (donc sur le volume Railway).
 * La restauration recrée uniquement ce qui MANQUE : rien n'est supprimé.
 */

const MAX_BACKUPS = 15;
const dirFor = (guildId) => path.join(dataDir, 'backups', guildId);

function list(guildId) {
  const dir = dirFor(guildId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return { id: data.id, name: data.name, createdAt: data.createdAt, auto: data.auto, roles: data.roles.length, channels: data.channels.length, emojis: data.emojis?.length ?? 0, bans: data.bans?.length ?? 0 };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function load(guildId, id) {
  const file = path.join(dirFor(guildId), `${String(id).replace(/[^a-z0-9]/gi, '')}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function remove(guildId, id) {
  const file = path.join(dirFor(guildId), `${String(id).replace(/[^a-z0-9]/gi, '')}.json`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

function serializeOverwrites(channel) {
  return channel.permissionOverwrites.cache
    .map((ow) => {
      const role = ow.type === OverwriteType.Role ? channel.guild.roles.cache.get(ow.id) : null;
      if (ow.type === OverwriteType.Role && !role) return null;
      return {
        type: ow.type,
        id: ow.id,
        roleName: role ? (role.id === channel.guild.id ? '@everyone' : role.name) : null,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      };
    })
    .filter(Boolean);
}

async function create(guild, name, auto = false) {
  const id = Date.now().toString(36);
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position }));
  const channels = guild.channels.cache
    .filter((c) => !c.isThread())
    .sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : 1) - (b.type === ChannelType.GuildCategory ? -1 : 1) || a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentName: c.parent?.name ?? null,
      position: c.rawPosition,
      topic: c.topic ?? null,
      nsfw: c.nsfw ?? false,
      rateLimitPerUser: c.rateLimitPerUser ?? 0,
      bitrate: c.bitrate ?? null,
      userLimit: c.userLimit ?? null,
      overwrites: serializeOverwrites(c),
    }));
  const emojis = guild.emojis.cache.map((e) => ({ name: e.name, url: e.imageURL({ extension: e.animated ? 'gif' : 'png' }), animated: e.animated }));
  const bans = await guild.bans
    .fetch({ limit: 1000 })
    .then((b) => b.map((x) => ({ id: x.user.id, tag: x.user.tag, reason: x.reason ?? null })))
    .catch(() => []);
  const data = {
    id,
    name: name || (auto ? 'Sauvegarde automatique' : 'Sauvegarde'),
    auto,
    createdAt: Date.now(),
    guild: {
      name: guild.name,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      everyonePermissions: guild.roles.everyone.permissions.bitfield.toString(),
      systemChannelName: guild.systemChannel?.name ?? null,
      afkChannelName: guild.afkChannel?.name ?? null,
      afkTimeout: guild.afkTimeout,
    },
    roles,
    channels,
    emojis,
    bans,
  };
  const dir = dirFor(guild.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data));

  // Rotation : on garde les MAX_BACKUPS plus récentes (les automatiques partent en premier)
  const all = list(guild.id);
  if (all.length > MAX_BACKUPS) {
    const autos = all.filter((b) => b.auto).reverse();
    const manual = all.filter((b) => !b.auto).reverse();
    for (const b of [...autos, ...manual].slice(0, all.length - MAX_BACKUPS)) remove(guild.id, b.id);
  }
  return data;
}

/**
 * Restaure une sauvegarde. Renvoie un résumé.
 * options.full     : remet aussi à l'identique les rôles et permissions de salons EXISTANTS
 * options.settings : réglages du serveur (niveau de vérification, filtre, notifications, perms @everyone)
 * options.emojis   : recrée les emojis manquants
 * options.bans     : re-bannit les utilisateurs bannis au moment de la sauvegarde
 */
async function restore(guild, data, reason, options = {}) {
  const summary = { roles: 0, rolesReset: 0, channels: 0, channelsReset: 0, emojis: 0, bans: 0, settings: false, errors: 0 };
  const roleMap = new Map([['@everyone', guild.roles.everyone.id]]); // ancien id / nom -> nouvel id

  for (const r of data.roles) {
    const existing = guild.roles.cache.get(r.id) ?? guild.roles.cache.find((x) => x.name === r.name && !x.managed);
    if (existing) {
      roleMap.set(r.id, existing.id);
      if (options.full && existing.editable) {
        const changed =
          existing.permissions.bitfield !== BigInt(r.permissions) || existing.color !== r.color || existing.hoist !== r.hoist || existing.mentionable !== r.mentionable;
        if (changed) {
          const ok = await existing
            .edit({ permissions: BigInt(r.permissions), color: r.color, hoist: r.hoist, mentionable: r.mentionable, reason })
            .then(() => true)
            .catch(() => false);
          if (ok) summary.rolesReset++;
          else summary.errors++;
        }
      }
      continue;
    }
    try {
      const created = await guild.roles.create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: BigInt(r.permissions),
        reason,
      });
      roleMap.set(r.id, created.id);
      summary.roles++;
    } catch {
      summary.errors++;
    }
  }

  const resolveOverwrites = (overwrites) =>
    overwrites
      .map((ow) => {
        let id = ow.id;
        if (ow.type === OverwriteType.Role) {
          id = ow.roleName === '@everyone' ? guild.id : roleMap.get(ow.id) ?? guild.roles.cache.find((x) => x.name === ow.roleName)?.id;
        }
        if (!id) return null;
        return { id, type: ow.type, allow: BigInt(ow.allow), deny: BigInt(ow.deny) };
      })
      .filter(Boolean);

  const exists = (c) =>
    guild.channels.cache.get(c.id) ?? guild.channels.cache.find((x) => x.name === c.name && x.type === c.type && (x.parent?.name ?? null) === c.parentName);

  for (const c of [...data.channels.filter((x) => x.type === ChannelType.GuildCategory), ...data.channels.filter((x) => x.type !== ChannelType.GuildCategory)]) {
    const current = exists(c);
    if (current) {
      if (options.full && current.permissionOverwrites) {
        const ok = await current.permissionOverwrites.set(resolveOverwrites(c.overwrites), reason).then(() => true).catch(() => false);
        if (ok) summary.channelsReset++;
        else summary.errors++;
      }
      continue;
    }
    const parent = c.parentName ? guild.channels.cache.find((x) => x.type === ChannelType.GuildCategory && x.name === c.parentName) : null;
    try {
      await guild.channels.create({
        name: c.name,
        type: c.type,
        parent: parent?.id,
        topic: c.topic ?? undefined,
        nsfw: c.nsfw,
        rateLimitPerUser: c.rateLimitPerUser || undefined,
        bitrate: c.bitrate ?? undefined,
        userLimit: c.userLimit ?? undefined,
        permissionOverwrites: resolveOverwrites(c.overwrites),
        reason,
      });
      summary.channels++;
    } catch {
      summary.errors++;
    }
  }

  if (options.settings && data.guild) {
    const s = data.guild;
    const find = (name, type) => (name ? guild.channels.cache.find((x) => x.name === name && x.type === type)?.id : undefined);
    const ok = await guild
      .edit({
        verificationLevel: s.verificationLevel,
        explicitContentFilter: s.explicitContentFilter,
        defaultMessageNotifications: s.defaultMessageNotifications,
        systemChannel: find(s.systemChannelName, ChannelType.GuildText),
        afkChannel: find(s.afkChannelName, ChannelType.GuildVoice),
        afkTimeout: s.afkTimeout ?? undefined,
        reason,
      })
      .then(() => true)
      .catch(() => false);
    const okPerms = await guild.roles.everyone.setPermissions(BigInt(s.everyonePermissions), reason).then(() => true).catch(() => false);
    summary.settings = ok && okPerms;
    if (!summary.settings) summary.errors++;
  }

  if (options.emojis) {
    for (const e of data.emojis ?? []) {
      if (guild.emojis.cache.some((x) => x.name === e.name)) continue;
      const ok = await guild.emojis.create({ attachment: e.url, name: e.name, reason }).then(() => true).catch(() => false);
      if (ok) summary.emojis++;
      else summary.errors++;
    }
  }

  if (options.bans) {
    const current = await guild.bans.fetch({ limit: 1000 }).catch(() => null);
    for (const b of data.bans ?? []) {
      if (current?.has(b.id)) continue;
      const ok = await guild.members.ban(b.id, { reason: `Restauration : ${b.reason ?? 'ban de la sauvegarde'}` }).then(() => true).catch(() => false);
      if (ok) summary.bans++;
      else summary.errors++;
    }
  }
  return summary;
}

/** Sauvegarde automatique quotidienne des serveurs qui l'ont activée. */
async function runAutoBackups(client) {
  for (const guild of client.guilds.cache.values()) {
    const g = db.guild(guild.id);
    if (!g.config.autoBackup || Date.now() - (g.lastAutoBackup || 0) < 86_400_000) continue;
    try {
      await create(guild, null, true);
      g.lastAutoBackup = Date.now();
      db.save();
    } catch (err) {
      console.error('[backup auto]', err);
    }
  }
}

module.exports = { create, list, load, remove, restore, runAutoBackups };
