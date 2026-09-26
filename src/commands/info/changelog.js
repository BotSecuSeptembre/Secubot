const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/embed');
const { paginate } = require('../../utils/paginate');
const changelog = require('../../changelog');

module.exports = {
  guildOnly: false,
  data: new SlashCommandBuilder().setName('changelog').setDescription("Affiche l'historique des mises à jour du bot"),
  async execute(interaction, client) {
    const pages = changelog.map((entry, i) =>
      embed(interaction.guildId)
        .setAuthor({ name: `${client.user.username} — Changelog`, iconURL: client.user.displayAvatarURL() })
        .setTitle(`v${entry.version} — ${entry.title}`)
        .setDescription(entry.changes.map((c) => `• ${c}`).join('\n'))
        .setFooter({ text: `${entry.date} • ${i === 0 ? 'Dernière version' : `Version ${changelog.length - i}/${changelog.length}`}` }),
    );
    return paginate(interaction, pages);
  },
};
