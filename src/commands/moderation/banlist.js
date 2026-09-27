const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed, replyError } = require('../../utils/embed');
const { paginate, chunk } = require('../../utils/paginate');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Liste des bannis avec leur raison')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('recherche').setDescription('Filtrer par pseudo, ID ou raison')),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const search = interaction.options.getString('recherche')?.toLowerCase();
    const bans = await interaction.guild.bans.fetch({ limit: 1000 }).catch(() => null);
    if (!bans) return replyError(interaction, "Je n'ai pas la permission de voir les bannis.");
    const list = [...bans.values()].filter(
      (b) => !search || b.user.tag.toLowerCase().includes(search) || b.user.id.includes(search) || (b.reason ?? '').toLowerCase().includes(search),
    );
    const lines = list.map((b) => `**${b.user.tag}** (\`${b.user.id}\`)\n└ ${(b.reason ?? 'Aucune raison').slice(0, 150)}`);
    const pages = chunk(lines.length ? lines : ['Aucun banni.'], 10).map((l) =>
      embed(interaction.guild.id).setTitle(`🔨 Bannis (${list.length})`).setDescription(l.join('\n')),
    );
    return paginate(interaction, pages);
  },
};
