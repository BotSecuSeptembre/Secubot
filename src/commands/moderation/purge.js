const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');
const { embed } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Supprime des messages en masse (moins de 14 jours)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de messages à analyser (1-500)').setRequired(true).setMinValue(1).setMaxValue(500))
    .addUserOption((o) => o.setName('membre').setDescription('Uniquement les messages de ce membre'))
    .addStringOption((o) =>
      o
        .setName('filtre')
        .setDescription('Type de messages')
        .addChoices(
          { name: 'Bots', value: 'bots' },
          { name: 'Humains', value: 'humans' },
          { name: 'Liens', value: 'links' },
          { name: 'Invitations', value: 'invites' },
          { name: 'Pièces jointes', value: 'attachments' },
          { name: 'Embeds', value: 'embeds' },
        ),
    )
    .addStringOption((o) => o.setName('contient').setDescription('Uniquement les messages contenant ce texte')),
  async execute(interaction) {
    const amount = interaction.options.getInteger('nombre');
    const user = interaction.options.getUser('membre');
    const filter = interaction.options.getString('filtre');
    const contains = interaction.options.getString('contient')?.toLowerCase();
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    let remaining = amount;
    let before;
    let deleted = 0;
    const cutoff = Date.now() - 14 * 86_400_000 + 60_000;
    while (remaining > 0) {
      const fetched = await channel.messages.fetch({ limit: Math.min(100, remaining), before });
      if (!fetched.size) break;
      before = fetched.last().id;
      remaining -= fetched.size;
      const toDelete = fetched.filter((m) => {
        if (m.createdTimestamp < cutoff || m.pinned) return false;
        if (user && m.author.id !== user.id) return false;
        if (filter === 'bots' && !m.author.bot) return false;
        if (filter === 'humans' && m.author.bot) return false;
        if (filter === 'links' && !/https?:\/\//i.test(m.content)) return false;
        if (filter === 'invites' && !/(discord\.gg|discord(app)?\.com\/invite)\//i.test(m.content)) return false;
        if (filter === 'attachments' && !m.attachments.size) return false;
        if (filter === 'embeds' && !m.embeds.length) return false;
        if (contains && !m.content.toLowerCase().includes(contains)) return false;
        return true;
      });
      if (toDelete.size) {
        const res = await channel.bulkDelete(toDelete, true).catch(() => null);
        deleted += res?.size ?? 0;
      }
      if (fetched.last().createdTimestamp < cutoff) break;
    }
    if (!deleted) return replyError(interaction, 'Aucun message correspondant (les messages de plus de 14 jours ne peuvent pas être supprimés en masse).');
    await sendLog(
      interaction.guild,
      'mod',
      embed(interaction.guild.id).setDescription(`🧹 **${deleted}** messages supprimés dans ${channel} par ${interaction.user}${user ? ` (filtre : ${user})` : ''}${filter ? ` [${filter}]` : ''}`),
    );
    return interaction.editReply({ embeds: [embed(interaction.guild.id).setDescription(`🧹 **${deleted}** message(s) supprimé(s).`)] });
  },
};
