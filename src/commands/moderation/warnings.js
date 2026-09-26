const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, replyError, replySuccess, reply, truncate } = require('../../utils/embed');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Gère les avertissements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription("Liste les avertissements d'un membre")
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Supprime un avertissement')
        .addIntegerOption((o) => o.setName('id').setDescription("ID de l'avertissement").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('clear')
        .setDescription("Supprime tous les avertissements d'un membre")
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    ),
  async execute(interaction) {
    const g = db.guild(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const user = interaction.options.getUser('membre');
      const warns = g.warns.filter((w) => w.userId === user.id);
      return reply(interaction, {
        embeds: [
          embed(interaction.guild.id)
            .setAuthor({ name: `Avertissements de ${user.tag}`, iconURL: user.displayAvatarURL() })
            .setDescription(
              truncate(
                warns.length
                  ? warns
                      .slice(-20)
                      .map((w) => `**#${w.id}** • ${ts(w.timestamp, 'R')} par <@${w.moderatorId}>\n└ ${w.reason}`)
                      .join('\n')
                  : 'Aucun avertissement.',
                4000,
              ),
            )
            .setFooter({ text: `${warns.length} avertissement(s)` }),
        ],
      });
    }
    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      const index = g.warns.findIndex((w) => w.id === id);
      if (index < 0) return replyError(interaction, 'Avertissement introuvable.');
      g.warns.splice(index, 1);
      db.save();
      return replySuccess(interaction, `Avertissement **#${id}** supprimé.`);
    }
    const user = interaction.options.getUser('membre');
    const before = g.warns.length;
    g.warns = g.warns.filter((w) => w.userId !== user.id);
    db.save();
    return replySuccess(interaction, `**${before - g.warns.length}** avertissement(s) de **${user.tag}** supprimé(s).`);
  },
};
