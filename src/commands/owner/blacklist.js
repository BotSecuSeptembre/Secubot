const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { replySuccess, embed, reply } = require('../../utils/embed');

module.exports = {
  ownerOnly: true,
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('👑 Liste noire globale du bot')
    .addSubcommand((s) =>
      s
        .setName('user')
        .setDescription("Ajoute/retire un utilisateur (il ne peut plus utiliser le bot)")
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('server')
        .setDescription('Ajoute/retire un serveur (le bot le quitte automatiquement)')
        .addStringOption((o) => o.setName('id').setDescription('ID du serveur').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('Affiche la liste noire')),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const g = db.global;
    if (sub === 'list') {
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(interaction.guildId)
            .setTitle('⛔ Liste noire')
            .addFields(
              { name: 'Utilisateurs', value: g.blacklist.map((id) => `<@${id}> \`${id}\``).join('\n').slice(0, 1024) || 'aucun' },
              { name: 'Serveurs', value: g.blacklistedGuilds.map((id) => `\`${id}\``).join('\n').slice(0, 1024) || 'aucun' },
            ),
        ],
      });
    }
    const id = sub === 'user' ? interaction.options.getUser('utilisateur').id : interaction.options.getString('id');
    const list = sub === 'user' ? g.blacklist : g.blacklistedGuilds;
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else list.push(id);
    db.save();
    if (index < 0 && sub === 'server') await client.guilds.cache.get(id)?.leave().catch(() => null);
    return replySuccess(interaction, `\`${id}\` ${index >= 0 ? 'retiré de' : 'ajouté à'} la liste noire.`, true);
  },
};
