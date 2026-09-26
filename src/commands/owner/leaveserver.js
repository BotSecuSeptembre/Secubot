const { SlashCommandBuilder } = require('discord.js');
const { replySuccess, replyError } = require('../../utils/embed');

module.exports = {
  ownerOnly: true,
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('leaveserver')
    .setDescription('👑 Fait quitter un serveur au bot')
    .addStringOption((o) => o.setName('id').setDescription('ID du serveur').setRequired(true)),
  async execute(interaction, client) {
    const guild = client.guilds.cache.get(interaction.options.getString('id'));
    if (!guild) return replyError(interaction, 'Serveur introuvable.');
    const name = guild.name;
    await replySuccess(interaction, `J'ai quitté **${name}**.`, true);
    await guild.leave();
  },
};
