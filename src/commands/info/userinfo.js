const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { embed, truncate } = require('../../utils/embed');
const { ts, formatDuration } = require('../../utils/time');
const { BADGES } = require('../../utils/analysis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription("Informations sur un utilisateur")
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur')),
  async execute(interaction, client) {
    const user = await client.users.fetch((interaction.options.getUser('utilisateur') ?? interaction.user).id, { force: true });
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const g = db.guild(interaction.guild.id);
    const data = g.members[user.id] ?? {};
    const badges = (user.flags?.toArray() ?? []).map((f) => BADGES[f]).filter(Boolean);
    const e = embed(interaction.guild.id)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: `\`${user.id}\``, inline: true },
        { name: 'Nom affiché', value: user.globalName ?? '—', inline: true },
        { name: 'Bot', value: user.bot ? 'Oui' : 'Non', inline: true },
        { name: 'Compte créé', value: `${ts(user.createdTimestamp, 'D')} (${formatDuration(Date.now() - user.createdTimestamp)})` },
      );
    if (member) {
      const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position);
      e.addFields(
        { name: 'Arrivé', value: `${ts(member.joinedTimestamp, 'D')} (${ts(member.joinedTimestamp, 'R')})`, inline: true },
        { name: 'Surnom', value: member.nickname ?? '—', inline: true },
        { name: 'Boost', value: member.premiumSince ? ts(member.premiumSince, 'R') : 'Non', inline: true },
        { name: `Rôles (${roles.size})`, value: truncate(roles.map((r) => r.toString()).join(' ') || 'aucun') },
      );
      if (member.isCommunicationDisabled()) e.addFields({ name: '🔇 Muet', value: `jusqu'à ${ts(member.communicationDisabledUntilTimestamp, 'f')}` });
    } else {
      e.addFields({ name: 'Membre', value: "N'est pas sur le serveur" });
    }
    if (badges.length) e.addFields({ name: 'Badges', value: badges.join('\n') });
    if (data.inviteCode) e.addFields({ name: 'Invitation', value: `\`${data.inviteCode}\`${data.inviterId ? ` par <@${data.inviterId}>` : ''}`, inline: true });
    if (data.joinCount > 1) e.addFields({ name: 'Arrivées', value: String(data.joinCount), inline: true });
    const sanctions = g.cases.filter((c) => c.targetId === user.id).length;
    const warns = g.warns.filter((w) => w.userId === user.id).length;
    if (sanctions || warns) e.addFields({ name: 'Modération', value: `${sanctions} cas • ${warns} avertissement(s)`, inline: true });
    if (user.banner) e.setImage(user.bannerURL({ size: 1024 }));
    return interaction.reply({ embeds: [e] });
  },
};
