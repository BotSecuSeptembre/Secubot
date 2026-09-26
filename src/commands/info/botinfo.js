const { SlashCommandBuilder, version: djsVersion } = require('discord.js');
const { embed } = require('../../utils/embed');
const { formatDuration, ts } = require('../../utils/time');
const pkg = require('../../../package.json');

module.exports = {
  guildOnly: false,
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Informations sur le bot'),
  async execute(interaction, client) {
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    return interaction.reply({
      embeds: [
        embed(interaction.guildId)
          .setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL() })
          .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'Version', value: `v${pkg.version}`, inline: true },
            { name: 'Serveurs', value: String(client.guilds.cache.size), inline: true },
            { name: 'Utilisateurs', value: String(users), inline: true },
            { name: 'Commandes', value: String(client.commands.size), inline: true },
            { name: 'Uptime', value: formatDuration(client.uptime), inline: true },
            { name: 'Latence', value: `${client.ws.ping}ms`, inline: true },
            { name: 'Mémoire', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} Mo`, inline: true },
            { name: 'Node.js', value: process.version, inline: true },
            { name: 'discord.js', value: `v${djsVersion}`, inline: true },
            { name: 'Créé', value: ts(client.user.createdTimestamp, 'D'), inline: true },
          ),
      ],
    });
  },
};
