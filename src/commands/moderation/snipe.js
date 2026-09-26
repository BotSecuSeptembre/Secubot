const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed, replyError, reply, truncate } = require('../../utils/embed');
const { snipes } = require('../../events/messageDelete');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Affiche le dernier message supprimé du salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const snipe = snipes.get(interaction.channelId);
    if (!snipe) return replyError(interaction, 'Aucun message supprimé récemment ici.');
    const e = embed(interaction.guild.id)
      .setAuthor({ name: snipe.author.tag, iconURL: snipe.author.displayAvatarURL() })
      .setDescription(truncate(snipe.content || '*aucun texte*', 4000))
      .setFooter({ text: `ID : ${snipe.author.id}` });
    if (snipe.attachments.length) e.addFields({ name: 'Pièces jointes', value: truncate(snipe.attachments.join('\n')) });
    e.addFields({ name: 'Supprimé', value: ts(snipe.at, 'R') });
    return reply(interaction, { embeds: [e], ephemeral: true });
  },
};
