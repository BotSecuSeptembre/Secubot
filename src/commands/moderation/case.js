const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, replyError, replySuccess, reply, truncate } = require('../../utils/embed');
const { ACTION_LABELS } = require('../../utils/moderation');
const { ts, formatDuration } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Consulte ou modifie un cas de modération')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s.setName('voir').setDescription('Affiche un cas').addIntegerOption((o) => o.setName('id').setDescription('Numéro du cas').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('raison')
        .setDescription("Modifie la raison d'un cas")
        .addIntegerOption((o) => o.setName('id').setDescription('Numéro du cas').setRequired(true))
        .addStringOption((o) => o.setName('raison').setDescription('Nouvelle raison').setRequired(true).setMaxLength(500)),
    ),
  async execute(interaction) {
    const g = db.guild(interaction.guild.id);
    const id = interaction.options.getInteger('id');
    const c = g.cases.find((x) => x.id === id);
    if (!c) return replyError(interaction, 'Cas introuvable.');
    if (interaction.options.getSubcommand() === 'raison') {
      c.reason = interaction.options.getString('raison');
      db.save();
      return replySuccess(interaction, `Raison du cas **#${id}** mise à jour.`);
    }
    const e = embed(interaction.guild.id)
      .setTitle(`Cas #${c.id} • ${ACTION_LABELS[c.type] ?? c.type}`)
      .addFields(
        { name: 'Membre', value: `<@${c.targetId}> \`${c.targetTag ?? ''}\` (\`${c.targetId}\`)`, inline: true },
        { name: 'Modérateur', value: `<@${c.moderatorId}>`, inline: true },
        { name: 'Date', value: ts(c.timestamp, 'f'), inline: true },
        { name: 'Raison', value: truncate(c.reason) },
      );
    if (c.duration) e.addFields({ name: 'Durée', value: formatDuration(c.duration), inline: true });
    return reply(interaction, { embeds: [e] });
  },
};
