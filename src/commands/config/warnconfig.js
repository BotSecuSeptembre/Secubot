const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { replySuccess, replyError, reply, embed } = require('../../utils/embed');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnconfig')
    .setDescription('Sanctions automatiques selon le nombre d\'avertissements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Ajoute un palier')
        .addIntegerOption((o) => o.setName('avertissements').setDescription("Nombre d'avertissements").setRequired(true).setMinValue(1).setMaxValue(50))
        .addStringOption((o) =>
          o.setName('action').setDescription('Sanction').setRequired(true).addChoices({ name: 'Mute', value: 'timeout' }, { name: 'Expulsion', value: 'kick' }, { name: 'Bannissement', value: 'ban' }),
        )
        .addStringOption((o) => o.setName('duree').setDescription('Durée du mute (ex: 1h)')),
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retire un palier')
        .addIntegerOption((o) => o.setName('avertissements').setDescription("Nombre d'avertissements du palier").setRequired(true)),
    )
    .addSubcommand((s) => s.setName('voir').setDescription('Affiche les paliers')),
  async execute(interaction) {
    const cfg = db.config(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    if (sub === 'voir') {
      const list = [...cfg.warnThresholds].sort((a, b) => a.count - b.count);
      return reply(interaction, {
        embeds: [
          embed(interaction.guild.id)
            .setTitle('⚖️ Paliers d\'avertissements')
            .setDescription(list.map((t) => `**${t.count}** warns → ${t.action}${t.duration ? ` (${formatDuration(t.duration)})` : ''}`).join('\n') || 'Aucun palier.'),
        ],
      });
    }
    const count = interaction.options.getInteger('avertissements');
    if (sub === 'retirer') {
      cfg.warnThresholds = cfg.warnThresholds.filter((t) => t.count !== count);
      db.save();
      return replySuccess(interaction, `Palier de ${count} avertissements retiré.`);
    }
    const action = interaction.options.getString('action');
    const durationInput = interaction.options.getString('duree');
    const duration = durationInput ? parseDuration(durationInput) : action === 'timeout' ? 3_600_000 : null;
    if (durationInput && !duration) return replyError(interaction, 'Durée invalide.');
    cfg.warnThresholds = cfg.warnThresholds.filter((t) => t.count !== count);
    cfg.warnThresholds.push({ count, action, duration });
    db.save();
    return replySuccess(interaction, `À **${count}** avertissements → **${action}**${duration && action === 'timeout' ? ` (${formatDuration(duration)})` : ''}.`);
  },
};
