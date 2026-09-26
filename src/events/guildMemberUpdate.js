const { Events } = require('discord.js');
const db = require('../database');
const { sendLog } = require('../utils/logger');
const { embed } = require('../utils/embed');
const { ts } = require('../utils/time');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const guild = newMember.guild;
    const lines = [];

    if (oldMember.nickname !== newMember.nickname) {
      lines.push(`**Surnom :** \`${oldMember.nickname ?? 'aucun'}\` → \`${newMember.nickname ?? 'aucun'}\``);
    }
    if (!oldMember.partial) {
      const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
      if (added.size) lines.push(`**Rôles ajoutés :** ${added.map((r) => r.toString()).join(' ')}`);
      if (removed.size) lines.push(`**Rôles retirés :** ${removed.map((r) => r.toString()).join(' ')}`);
    }
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp ?? 0;
    if (oldTimeout !== newTimeout) {
      // mémorisé pour ré-appliquer le mute si le membre quitte puis revient
      const g = db.guild(guild.id);
      g.members[newMember.id] = { ...(g.members[newMember.id] ?? {}), timeoutUntil: newTimeout > Date.now() ? newTimeout : null };
      db.save();
      lines.push(newTimeout > Date.now() ? `**Mute jusqu'à :** ${ts(newTimeout, 'f')}` : '**Mute levé**');
    }
    if (!oldMember.partial && oldMember.avatar !== newMember.avatar) lines.push('**Avatar de serveur modifié**');

    if (!lines.length) return;
    await sendLog(
      guild,
      'members',
      embed(guild.id)
        .setAuthor({ name: `Membre modifié • ${newMember.user.tag}`, iconURL: newMember.user.displayAvatarURL() })
        .setDescription(`${newMember} (\`${newMember.id}\`)\n\n${lines.join('\n')}`)
        .setTimestamp(),
    );
  },
};
