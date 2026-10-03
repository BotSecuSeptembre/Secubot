const { Events } = require('discord.js');
const db = require('../database');
const { findUsedInvite } = require('../utils/invites');
const { trackUser } = require('../utils/analysis');
const { checkJoin } = require('../utils/antiraid');
const { onMemberJoin } = require('../utils/jail');
const { sendLog } = require('../utils/logger');
const { embed } = require('../utils/embed');
const { ts, formatDuration } = require('../utils/time');
const { colors } = require('../config');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const guild = member.guild;
    const g = db.guild(guild.id);

    const invite = await findUsedInvite(guild);
    const previous = g.members[member.id] ?? {};
    g.members[member.id] = {
      ...previous,
      tag: member.user.tag,
      createdAt: member.user.createdTimestamp,
      joinCount: (previous.joinCount ?? 0) + 1,
      lastJoin: Date.now(),
      inviteCode: invite.code,
      inviterId: invite.inviterId,
      vanity: Boolean(invite.vanity),
    };
    db.save();
    trackUser(member.user, guild.id);

    if (await checkJoin(member)) return;

    const cfg = g.config;
    if (cfg.verification.enabled && cfg.verification.unverifiedRoleId) {
      await member.roles.add(cfg.verification.unverifiedRoleId, 'Vérification : membre non vérifié').catch(() => null);
    }

    // Prison persistante : quitter/revenir ne permet pas d'en sortir
    await onMemberJoin(member).catch((err) => console.error('[jail]', err));

    // Quarantaine persistante : quitter/revenir ne permet pas d'en sortir
    if (g.quarantine[member.id] && cfg.quarantine.roleId) {
      await member.roles.add(cfg.quarantine.roleId, 'Quarantaine (a quitté puis rejoint)').catch(() => null);
    }

    // Rôles persistants anti-contournement : un membre muté qui quitte/revient reste muté
    if (previous.timeoutUntil && previous.timeoutUntil > Date.now() && member.moderatable) {
      await member.timeout(previous.timeoutUntil - Date.now(), 'Contournement de mute (a quitté puis rejoint)').catch(() => null);
    }

    const age = Date.now() - member.user.createdTimestamp;
    const e = embed(guild.id)
      .setColor(age < 7 * 86_400_000 ? colors.warning : colors.success)
      .setAuthor({ name: `${member.user.tag} a rejoint`, iconURL: member.user.displayAvatarURL() })
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(
        [
          `${member.user} (\`${member.id}\`)`,
          `Compte créé ${ts(member.user.createdTimestamp, 'R')} (**${formatDuration(age)}**)${age < 7 * 86_400_000 ? ' ⚠️ **récent**' : ''}`,
          `Invitation : ${invite.vanity ? `URL perso \`${invite.code}\`` : invite.code ? `\`${invite.code}\`${invite.inviterId ? ` de <@${invite.inviterId}>` : ''}` : 'inconnue'}`,
          `Arrivées sur le serveur : **${g.members[member.id].joinCount}**`,
          `Membres : **${guild.memberCount}**`,
        ].join('\n'),
      )
      .setTimestamp();
    await sendLog(guild, 'members', e);
  },
};
