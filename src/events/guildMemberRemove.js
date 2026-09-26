const { Events } = require('discord.js');
const db = require('../database');
const { sendLog } = require('../utils/logger');
const { embed } = require('../utils/embed');
const { ts, formatDuration } = require('../utils/time');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const guild = member.guild;
    const g = db.guild(guild.id);
    const data = g.members[member.id] ?? (g.members[member.id] = {});
    data.lastLeave = Date.now();
    data.roles = member.roles?.cache?.filter((r) => r.id !== guild.id).map((r) => r.id) ?? [];
    if (member.communicationDisabledUntilTimestamp > Date.now()) data.timeoutUntil = member.communicationDisabledUntilTimestamp;

    // Une demande de vérification en attente devient caduque
    const pending = g.verifications[member.id];
    if (pending?.status === 'pending') {
      pending.status = 'left';
      const channel = guild.channels.cache.get(pending.channelId);
      const msg = await channel?.messages.fetch(pending.messageId).catch(() => null);
      if (msg) {
        await msg
          .edit({ content: `🚪 **${member.user.tag} a quitté le serveur avant d'être vérifié.**`, components: [] })
          .catch(() => null);
      }
    }
    db.save();

    const roles = member.roles?.cache?.filter((r) => r.id !== guild.id).map((r) => r.toString()) ?? [];
    await sendLog(
      guild,
      'members',
      embed(guild.id)
        .setAuthor({ name: `${member.user?.tag ?? member.id} est parti`, iconURL: member.user?.displayAvatarURL() })
        .setDescription(
          [
            `<@${member.id}> (\`${member.id}\`)`,
            member.joinedTimestamp ? `Était là depuis ${ts(member.joinedTimestamp, 'R')} (${formatDuration(Date.now() - member.joinedTimestamp)})` : null,
            roles.length ? `Rôles : ${roles.slice(0, 20).join(' ')}` : null,
            `Membres : **${guild.memberCount}**`,
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .setTimestamp(),
    );
  },
};
