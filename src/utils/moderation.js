const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { embed, truncate } = require('./embed');
const { sendLog } = require('./logger');
const { formatDuration, ts } = require('./time');
const { ownerIds } = require('../config');

const ACTION_LABELS = {
  warn: '⚠️ Avertissement',
  timeout: '🔇 Mute (timeout)',
  untimeout: '🔊 Unmute',
  kick: '👢 Expulsion',
  ban: '🔨 Bannissement',
  tempban: '⏳ Bannissement temporaire',
  softban: '🧹 Softban',
  unban: '🔓 Débannissement',
  note: '📝 Note',
  automod: '🤖 Automod',
  antiraid: '🛡️ Antiraid',
  antinuke: '☢️ Antinuke',
  verification: '🪪 Vérification',
  quarantine: '🔒 Quarantaine',
  unquarantine: '🔓 Fin de quarantaine',
};

const isOwner = (userId) => ownerIds.includes(userId);

/**
 * Vérifie qu'un modérateur peut agir sur une cible (hiérarchie des rôles).
 * Renvoie un message d'erreur ou null.
 */
function checkHierarchy(moderator, target, action = 'sanctionner') {
  const guild = moderator.guild;
  if (!target) return null;
  if (target.id === moderator.id) return `Tu ne peux pas te ${action} toi-même.`;
  if (target.id === guild.ownerId) return `Impossible de ${action} le propriétaire du serveur.`;
  if (target.id === guild.client.user.id) return `Je ne peux pas me ${action} moi-même.`;
  if (moderator.id !== guild.ownerId && target.roles.highest.position >= moderator.roles.highest.position) {
    return `Tu ne peux pas ${action} ce membre : son rôle est supérieur ou égal au tien.`;
  }
  const me = guild.members.me;
  if (target.roles.highest.position >= me.roles.highest.position) {
    return `Je ne peux pas ${action} ce membre : son rôle est supérieur ou égal au mien.`;
  }
  return null;
}

/** Envoie un MP à l'utilisateur sanctionné (ignore les MP fermés). */
async function notifyUser(user, guild, type, reason, duration) {
  const e = embed(guild.id)
    .setTitle(`${ACTION_LABELS[type] || type} — ${guild.name}`)
    .setThumbnail(guild.iconURL())
    .addFields({ name: 'Raison', value: truncate(reason || 'Aucune raison fournie') })
    .setTimestamp();
  if (duration) e.addFields({ name: 'Durée', value: formatDuration(duration) });
  return user.send({ embeds: [e] }).then(() => true).catch(() => false);
}

/**
 * Enregistre un cas, envoie le log et renvoie le cas.
 */
async function logCase(guild, { type, target, moderator, reason, duration, extra }) {
  const record = db.addCase(guild.id, {
    type,
    targetId: target.id,
    targetTag: target.tag ?? target.user?.tag,
    moderatorId: moderator.id,
    moderatorTag: moderator.tag ?? moderator.user?.tag,
    reason: reason || 'Aucune raison fournie',
    duration: duration || null,
  });

  const user = target.user ?? target;
  const e = embed(guild.id)
    .setAuthor({ name: `Cas #${record.id} • ${ACTION_LABELS[type] || type}`, iconURL: user.displayAvatarURL?.() })
    .addFields(
      { name: 'Membre', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
      { name: 'Raison', value: truncate(record.reason) },
    )
    .setTimestamp();
  if (duration) e.addFields({ name: 'Durée', value: `${formatDuration(duration)} (fin ${ts(Date.now() + duration, 'R')})`, inline: true });
  if (extra) e.addFields({ name: 'Détails', value: truncate(extra) });
  await sendLog(guild, 'mod', e);
  return record;
}

/** Ajoute un warn et applique les paliers automatiques configurés. */
async function addWarn(guild, member, moderator, reason) {
  const g = db.guild(guild.id);
  const warn = {
    id: (g.warns.at(-1)?.id || 0) + 1,
    userId: member.id,
    moderatorId: moderator.id,
    reason: reason || 'Aucune raison fournie',
    timestamp: Date.now(),
  };
  g.warns.push(warn);
  db.save();
  await logCase(guild, { type: 'warn', target: member, moderator, reason });
  await notifyUser(member.user ?? member, guild, 'warn', reason);

  const count = g.warns.filter((w) => w.userId === member.id).length;
  const threshold = [...g.config.warnThresholds].sort((a, b) => b.count - a.count).find((t) => t.count === count);
  let applied = null;
  if (threshold && member.manageable !== undefined) {
    const autoReason = `Palier automatique : ${count} avertissements`;
    const me = guild.members.me;
    try {
      if (threshold.action === 'timeout' && member.moderatable) {
        await member.timeout(threshold.duration || 3_600_000, autoReason);
        await logCase(guild, { type: 'timeout', target: member, moderator: me.user, reason: autoReason, duration: threshold.duration });
        applied = `mute ${formatDuration(threshold.duration || 3_600_000)}`;
      } else if (threshold.action === 'kick' && member.kickable) {
        await member.kick(autoReason);
        await logCase(guild, { type: 'kick', target: member, moderator: me.user, reason: autoReason });
        applied = 'expulsion';
      } else if (threshold.action === 'ban' && member.bannable) {
        await member.ban({ reason: autoReason });
        await logCase(guild, { type: 'ban', target: member, moderator: me.user, reason: autoReason });
        applied = 'bannissement';
      }
    } catch (err) {
      console.error('[warn threshold]', err);
    }
  }
  return { warn, count, applied };
}

const hasPerm = (member, perm) => member?.permissions?.has(perm) ?? false;
const isStaff = (member) =>
  hasPerm(member, PermissionFlagsBits.ManageMessages) ||
  hasPerm(member, PermissionFlagsBits.ModerateMembers) ||
  hasPerm(member, PermissionFlagsBits.Administrator);

module.exports = { ACTION_LABELS, isOwner, checkHierarchy, notifyUser, logCase, addWarn, hasPerm, isStaff };
