const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/embed');
const { paginate, chunk } = require('../../utils/paginate');
const { ts } = require('../../utils/time');

module.exports = {
  ownerOnly: true,
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('serverlist')
    .setDescription('👑 Affiche la liste des serveurs où se trouve le bot')
    .addStringOption((o) =>
      o
        .setName('tri')
        .setDescription('Ordre de tri')
        .addChoices({ name: 'Membres', value: 'members' }, { name: "Date d'ajout", value: 'joined' }, { name: 'Nom', value: 'name' }),
    ),
  async execute(interaction, client) {
    const sort = interaction.options.getString('tri') ?? 'members';
    const guilds = [...client.guilds.cache.values()].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'joined' ? a.joinedTimestamp - b.joinedTimestamp : b.memberCount - a.memberCount,
    );
    const total = guilds.reduce((acc, g) => acc + g.memberCount, 0);
    const pages = chunk(guilds, 10).map((list, i) =>
      embed(interaction.guildId)
        .setTitle(`🌐 Serveurs du bot (${guilds.length})`)
        .setDescription(
          list
            .map(
              (g, j) =>
                `**${i * 10 + j + 1}. ${g.name}**\n└ \`${g.id}\` • 👥 ${g.memberCount} • 👑 <@${g.ownerId}> • ajouté ${ts(g.joinedTimestamp, 'R')}`,
            )
            .join('\n'),
        )
        .setFooter({ text: `${total} membres au total` }),
    );
    return paginate(interaction, pages, { ephemeral: true });
  },
};
