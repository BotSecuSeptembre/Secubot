const { GuildVerificationLevel, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { sendLog } = require('./logger');
const { embed } = require('./embed');
const { colors } = require('../config');
const { logCase } = require('./moderation');

/** guildId -> timestamps des arrivées récentes */
const joinWindows = new Map();

/**
 * Active le mode raid : niveau de vérification au max, salons verrouillés (option),
 * nouvelles arrivées sanctionnées automatiquement.
 */
async function enableRaidMode(guild, reason, auto = true) {
  const cfg = db.config(guild.id);
  const ar = cfg.antiraid;
  const wasActive = ar.raidMode;
  ar.raidMode = true;
  ar.raidModeSince = Date.now();
  ar.raidModeAuto = auto;
  db.save();
  if (wasActive) return;

  if (ar.autoLockdown) {
    if (guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) {
      ar.previousVerificationLevel = guild.verificationLevel;
      db.save();
      await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Antiraid : mode raid').catch(() => null);
    }
  }

  await sendLog(
    guild,
    'server',
    embed(guild.id)
      .setColor(colors.danger)
      .setTitle('🚨 MODE RAID ACTIVÉ')
      .setDescription(
        [
          `**Raison :** ${reason}`,
          '',
          `• Nouvelles arrivées : **${ar.action === 'none' ? 'signalées' : ar.action === 'ban' ? 'bannies' : 'expulsées'}**`,
          ar.autoLockdown ? '• Niveau de vérification du serveur passé au maximum' : null,
          auto ? '• Désactivation automatique après 30 min de calme' : '• Désactivation manuelle : `/antiraid raidmode etat:off`',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .setTimestamp(),
  );
}

async function disableRaidMode(guild) {
  const ar = db.config(guild.id).antiraid;
  ar.raidMode = false;
  ar.raidModeSince = null;
  ar.raidModeAuto = false;
  if (ar.previousVerificationLevel != null) {
    await guild.setVerificationLevel(ar.previousVerificationLevel, 'Antiraid : fin du mode raid').catch(() => null);
    ar.previousVerificationLevel = null;
  }
  db.save();
}

/**
 * Contrôle antiraid à l'arrivée d'un membre.
 * @returns {Promise<boolean>} true si le membre a été sanctionné (arrêter le traitement)
 */
async function checkJoin(member) {
  const guild = member.guild;
  const ar = db.config(guild.id).antiraid;
  if (!ar.enabled) return false;
  const me = guild.members.me;

  // Bots ajoutés sans autorisation
  if (member.user.bot) {
    if (!ar.blockBots) return false;
    const cfg = db.config(guild.id);
    await new Promise((r) => setTimeout(r, 1500)); // laisser le temps au log d'audit d'apparaître
    const logs = await guild.fetchAuditLogs({ type: 28, limit: 3 }).catch(() => null); // BotAdd
    const entry = logs?.entries.find((e) => e.target?.id === member.id);
    const adder = entry?.executor;
    const trusted = adder && (adder.id === guild.ownerId || cfg.antinuke.whitelist.includes(adder.id));
    if (!trusted && member.kickable) {
      await member.kick('Antiraid : bot ajouté par un utilisateur non autorisé').catch(() => null);
      await sendLog(guild, 'server', embed(guild.id).setColor(colors.danger).setTitle('🤖 Bot bloqué').setDescription(`Le bot ${member.user} (\`${member.id}\`) a été expulsé.\nAjouté par : ${adder ? `${adder} (\`${adder.id}\`)` : 'inconnu'}\n\nAjoute l'auteur à la whitelist antinuke pour autoriser ses ajouts de bots.`));
      return true;
    }
    return false;
  }

  const punish = async (action, reason) => {
    if (action === 'none' || action === 'flag') return false;
    await member.send(`🛡️ Tu as été ${action === 'ban' ? 'banni' : 'expulsé'} de **${guild.name}** par la protection antiraid.\nRaison : ${reason}`).catch(() => null);
    const ok =
      action === 'ban'
        ? await member.ban({ reason: `Antiraid : ${reason}`, deleteMessageSeconds: 86400 }).then(() => true).catch(() => false)
        : await member.kick(`Antiraid : ${reason}`).then(() => true).catch(() => false);
    if (ok) await logCase(guild, { type: action, target: member.user, moderator: me.user, reason: `Antiraid : ${reason}` });
    return ok;
  };

  // Détection de vague d'arrivées
  const now = Date.now();
  const window = (joinWindows.get(guild.id) ?? []).filter((t) => now - t < ar.joinSeconds * 1000);
  window.push(now);
  joinWindows.set(guild.id, window);
  if (window.length >= ar.joinThreshold) {
    await enableRaidMode(guild, `${window.length} arrivées en moins de ${ar.joinSeconds}s`);
  }
  if (ar.raidMode) {
    if (await punish(ar.action, 'Arrivée pendant le mode raid')) return true;
  }

  // Âge minimum du compte
  const ageDays = (now - member.user.createdTimestamp) / 86_400_000;
  if (ar.minAccountAgeDays > 0 && ageDays < ar.minAccountAgeDays) {
    const reason = `Compte trop récent (${ageDays.toFixed(1)}j < ${ar.minAccountAgeDays}j)`;
    if (ar.minAgeAction === 'flag') {
      await sendLog(guild, 'members', embed(guild.id).setColor(colors.warning).setDescription(`⚠️ ${member.user} (\`${member.id}\`) : ${reason}`));
    } else if (await punish(ar.minAgeAction, reason)) return true;
  }

  // Pas d'avatar
  if (!member.user.avatar && ar.noAvatarAction !== 'none') {
    const reason = "Compte sans photo de profil";
    if (ar.noAvatarAction === 'flag') {
      await sendLog(guild, 'members', embed(guild.id).setColor(colors.warning).setDescription(`⚠️ ${member.user} (\`${member.id}\`) : ${reason}`));
    } else if (await punish(ar.noAvatarAction, reason)) return true;
  }

  return false;
}

module.exports = { checkJoin, enableRaidMode, disableRaidMode };
