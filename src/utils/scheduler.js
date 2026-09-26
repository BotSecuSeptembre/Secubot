const db = require('../database');
const { logCase } = require('./moderation');
const { sendLog } = require('./logger');
const { embed } = require('./embed');

/**
 * Tâches périodiques :
 *  - fin des bannissements temporaires
 *  - expulsion des membres non vérifiés après X heures (si configuré)
 *  - désactivation automatique du mode raid après 30 min sans nouveau raid
 */
function startScheduler(client) {
  const tick = async () => {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const g = db.guild(guild.id);

      // Tempbans
      const expired = g.tempbans.filter((t) => t.until <= now);
      if (expired.length) {
        g.tempbans = g.tempbans.filter((t) => t.until > now);
        db.save();
        for (const t of expired) {
          const user = await client.users.fetch(t.userId).catch(() => null);
          const ok = await guild.members.unban(t.userId, 'Fin du bannissement temporaire').then(() => true).catch(() => false);
          if (ok && user) await logCase(guild, { type: 'unban', target: user, moderator: client.user, reason: 'Fin du bannissement temporaire' });
        }
      }

      // Auto-kick des non vérifiés
      const v = g.config.verification;
      if (v.enabled && v.autoKickHours > 0 && v.verifiedRoleId) {
        const limit = v.autoKickHours * 3_600_000;
        for (const member of guild.members.cache.values()) {
          if (member.user.bot || member.roles.cache.has(v.verifiedRoleId)) continue;
          if (member.permissions.has('ManageMessages')) continue;
          if (g.verifications[member.id]?.status === 'pending') continue;
          if (now - (member.joinedTimestamp ?? now) < limit) continue;
          if (!member.kickable) continue;
          await member
            .send(`⏳ Tu as été expulsé de **${guild.name}** car tu ne t'es pas fait vérifier dans les ${v.autoKickHours}h. Tu peux revenir et cliquer sur le bouton de vérification.`)
            .catch(() => null);
          await member.kick(`Non vérifié après ${v.autoKickHours}h`).catch(() => null);
          await sendLog(guild, 'members', embed(guild.id).setDescription(`👢 ${member.user} (\`${member.id}\`) expulsé automatiquement : non vérifié après ${v.autoKickHours}h.`));
        }
      }

      // Fin automatique du mode raid
      const ar = g.config.antiraid;
      if (ar.raidMode && ar.raidModeAuto && ar.raidModeSince && now - ar.raidModeSince > 30 * 60_000) {
        ar.raidMode = false;
        ar.raidModeSince = null;
        ar.raidModeAuto = false;
        db.save();
        await sendLog(guild, 'server', embed(guild.id).setTitle('🛡️ Mode raid désactivé').setDescription('Aucun nouveau raid détecté depuis 30 minutes : le mode raid a été désactivé automatiquement.'));
      }
    }
  };
  setInterval(() => tick().catch((err) => console.error('[scheduler]', err)), 60_000);
  tick().catch((err) => console.error('[scheduler]', err));
}

module.exports = { startScheduler };
