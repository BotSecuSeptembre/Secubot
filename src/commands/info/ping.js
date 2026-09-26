const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/embed');

module.exports = {
  guildOnly: false,
  data: new SlashCommandBuilder().setName('ping').setDescription('Latence du bot'),
  async execute(interaction, client) {
    const start = Date.now();
    await interaction.deferReply();
    return interaction.editReply({
      embeds: [embed(interaction.guildId).setDescription(`🏓 **Pong !**\nWebSocket : **${client.ws.ping}ms**\nAller-retour : **${Date.now() - start}ms**`)],
    });
  },
};
