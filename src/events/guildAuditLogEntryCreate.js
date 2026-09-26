const { Events, AuditLogEvent, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const db = require('../database');
const { sendLog } = require('../utils/logger');
const { embed } = require('../utils/embed');
const { logCase } = require('../utils/moderation');
const { invalidateBans } = require('../utils/analysis');
const { colors } = require('../config');

/** Actions surveillées par l'antinuke et leur libellé */
const WATCHED = {
  [AuditLogEvent.ChannelCreate]: 'création de salon',
  [AuditLogEvent.ChannelDelete]: 'suppression de salon',
  [AuditLogEvent.MemberKick]: 'expulsion',
  [AuditLogEvent.MemberPrune]: 'purge de membres',
  [AuditLogEvent.MemberBanAdd]: 'bannissement',
  [AuditLogEvent.RoleCreate]: 'création de rôle',
  [AuditLogEvent.RoleDelete]: 'suppression de rôle',
  [AuditLogEvent.WebhookCreate]: 'création de webhook',
  [AuditLogEvent.WebhookDelete]: 'suppression de webhook',
  [AuditLogEvent.EmojiDelete]: "suppression d'emoji",
  [AuditLogEvent.StickerDelete]: 'suppression de sticker',
};

const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
];

/** guildId:executorId -> [timestamps] */
const counters = new Map();

function isTrusted(guild, userId) {
  const cfg = db.config(guild.id).antinuke;
  return userId === guild.ownerId || userId === guild.client.user.id || cfg.whitelist.includes(userId);
}

async function punish(guild, executorId, reason) {
  const cfg = db.config(guild.id).antinuke;
  const member = await guild.members.fetch(executorId).catch(() => null);
  const me = guild.members.me;
  let result = 'aucune action possible (rôle trop haut ?)';
  if (member) {
    try {
      if (cfg.punishment === 'ban' && member.bannable) {
        await member.ban({ reason: `Antinuke : ${reason}` });
        result = 'banni';
      } else if (cfg.punishment === 'kick' && member.kickable) {
        await member.kick(`Antinuke : ${reason}`);
        result = 'expulsé';
      } else if (member.manageable) {
        const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable && !r.managed);
        await member.roles.remove(removable, `Antinuke : ${reason}`);
        result = `${removable.size} rôle(s) retiré(s)`;
      }
      // Les rôles gérés (bots) ne peuvent pas être retirés : on expulse le bot
      if (member.user.bot && cfg.punishment === 'strip' && member.kickable) {
        await member.kick(`Antinuke : ${reason}`);
        result += ' + bot expulsé';
      }
    } catch (err) {
      result = `échec : ${err.message}`;
    }
    if (!result.startsWith('échec') && !result.startsWith('aucune')) {
      await logCase(guild, { type: 'antinuke', target: member.user, moderator: me.user, reason, extra: result });
    }
  }
  await sendLog(
    guild,
    'server',
    embed(guild.id)
      .setColor(colors.danger)
      .setTitle('☢️ ANTINUKE DÉCLENCHÉ')
      .setDescription(`**Auteur :** <@${executorId}> (\`${executorId}\`)\n**Raison :** ${reason}\n**Sanction :** ${result}`)
      .setTimestamp(),
  );
  const owner = await guild.fetchOwner().catch(() => null);
  await owner
    ?.send(`☢️ **Antinuke déclenché sur ${guild.name}** : <@${executorId}> (\`${executorId}\`) — ${reason}. Sanction : ${result}.`)
    .catch(() => null);
}

/** Journal des actions serveur (salons, rôles, bans manuels...) */
const SERVER_LOGS = {
  [AuditLogEvent.ChannelCreate]: ['📁 Salon créé', colors.success],
  [AuditLogEvent.ChannelDelete]: ['🗑️ Salon supprimé', colors.error],
  [AuditLogEvent.ChannelUpdate]: ['✏️ Salon modifié', colors.warning],
  [AuditLogEvent.RoleCreate]: ['🎭 Rôle créé', colors.success],
  [AuditLogEvent.RoleDelete]: ['🗑️ Rôle supprimé', colors.error],
  [AuditLogEvent.RoleUpdate]: ['✏️ Rôle modifié', colors.warning],
  [AuditLogEvent.WebhookCreate]: ['🪝 Webhook créé', colors.warning],
  [AuditLogEvent.WebhookDelete]: ['🪝 Webhook supprimé', colors.error],
  [AuditLogEvent.GuildUpdate]: ['⚙️ Serveur modifié', colors.warning],
  [AuditLogEvent.MemberBanAdd]: ['🔨 Bannissement', colors.error],
  [AuditLogEvent.MemberBanRemove]: ['🔓 Débannissement', colors.success],
  [AuditLogEvent.MemberKick]: ['👢 Expulsion', colors.error],
  [AuditLogEvent.BotAdd]: ['🤖 Bot ajouté', colors.warning],
  [AuditLogEvent.EmojiDelete]: ['🗑️ Emoji supprimé', colors.error],
};

async function logServerAction(entry, guild) {
  const meta = SERVER_LOGS[entry.action];
  if (!meta) return;
  const changes = entry.changes
    .filter((c) => !['permission_overwrites', 'id', 'type'].includes(c.key))
    .slice(0, 8)
    .map((c) => `\`${c.key}\` : ${JSON.stringify(c.old ?? null)?.slice(0, 80)} → ${JSON.stringify(c.new ?? null)?.slice(0, 80)}`);
  const target = entry.target?.name ?? entry.target?.tag ?? entry.targetId;
  await sendLog(
    guild,
    'server',
    embed(guild.id)
      .setColor(meta[1])
      .setTitle(meta[0])
      .setDescription(
        [
          `**Cible :** ${target ?? '—'}${entry.targetId ? ` (\`${entry.targetId}\`)` : ''}`,
          `**Par :** ${entry.executorId ? `<@${entry.executorId}> (\`${entry.executorId}\`)` : 'inconnu'}`,
          entry.reason ? `**Raison :** ${entry.reason}` : null,
          changes.length ? `\n${changes.join('\n')}` : null,
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 4000),
      )
      .setTimestamp(),
  );
}

module.exports = {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entry, guild) {
    if (entry.action === AuditLogEvent.MemberBanAdd || entry.action === AuditLogEvent.MemberBanRemove) invalidateBans(guild.id);
    // Les actions faites par le bot sont déjà journalisées en tant que cas
    if (entry.executorId !== guild.client.user.id) await logServerAction(entry, guild).catch(() => null);

    const cfg = db.config(guild.id).antinuke;
    if (!cfg.enabled || !entry.executorId || isTrusted(guild, entry.executorId)) return;

    // Protection immédiate : permissions dangereuses ajoutées à un rôle
    if (entry.action === AuditLogEvent.RoleUpdate) {
      const permChange = entry.changes.find((c) => c.key === 'permissions');
      if (permChange) {
        const before = new PermissionsBitField(BigInt(permChange.old ?? 0));
        const after = new PermissionsBitField(BigInt(permChange.new ?? 0));
        const added = DANGEROUS.filter((p) => after.has(p, false) && !before.has(p, false));
        if (added.length) {
          const role = guild.roles.cache.get(entry.targetId);
          if (role?.editable) await role.setPermissions(before, 'Antinuke : permissions dangereuses ajoutées').catch(() => null);
          const names = new PermissionsBitField(added).toArray().join(', ');
          await punish(guild, entry.executorId, `Ajout de permissions dangereuses (${names}) au rôle ${role ?? entry.targetId}`);
        }
      }
      return;
    }

    // Protection immédiate : attribution d'un rôle administrateur
    if (entry.action === AuditLogEvent.MemberRoleUpdate) {
      const addedRoles = entry.changes.find((c) => c.key === '$add')?.new ?? [];
      const dangerous = addedRoles
        .map((r) => guild.roles.cache.get(r.id))
        .filter((r) => r && r.permissions.has(PermissionFlagsBits.Administrator));
      if (dangerous.length) {
        const target = await guild.members.fetch(entry.targetId).catch(() => null);
        if (target) await target.roles.remove(dangerous.filter((r) => r.editable), 'Antinuke : rôle admin attribué').catch(() => null);
        await punish(guild, entry.executorId, `A donné un rôle administrateur (${dangerous.map((r) => r.name).join(', ')}) à <@${entry.targetId}>`);
      }
      return;
    }

    // Protection de l'URL personnalisée
    if (entry.action === AuditLogEvent.GuildUpdate && entry.changes.some((c) => c.key === 'vanity_url_code')) {
      await punish(guild, entry.executorId, "Modification de l'URL personnalisée du serveur");
      return;
    }

    const label = WATCHED[entry.action];
    if (!label) return;
    const key = `${guild.id}:${entry.executorId}`;
    const now = Date.now();
    const list = (counters.get(key) ?? []).filter((t) => now - t < cfg.seconds * 1000);
    list.push(now);
    counters.set(key, list);
    if (list.length >= cfg.threshold) {
      counters.delete(key);
      await punish(guild, entry.executorId, `${list.length}× ${label} en moins de ${cfg.seconds}s`);
    }
  },
};
