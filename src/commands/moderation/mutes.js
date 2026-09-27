const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../utils/embed');
const { ts } = require('../../utils/time');
const { paginate, chunk } = require('../../utils/paginate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mutes')
    .setDescription('Liste des membres actuellement muets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const muted = interaction.guild.members.cache
      .filter((m) => m.isCommunicationDisabled())
      .sort((a, b) => a.communicationDisabledUntilTimestamp - b.communicationDisabledUntilTimestamp)
      .map((m) => `${m} \`${m.user.tag}\` — fin ${ts(m.communicationDisabledUntilTimestamp, 'R')}`);
    const pages = chunk(muted.length ? muted : ['Personne n\'est muet.'], 15).map((l) =>
      embed(interaction.guild.id).setTitle(`🔇 Membres muets (${muted.length})`).setDescription(l.join('\n')),
    );
    return paginate(interaction, pages, { ephemeral: true });
  },
};
