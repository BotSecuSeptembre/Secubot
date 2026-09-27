const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { replyError, replySuccess, reply, embed } = require('../../utils/embed');
const { parseDuration, ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rappel')
    .setDescription('Rappels personnels (envoyés en MP)')
    .addSubcommand((s) =>
      s
        .setName('creer')
        .setDescription('Crée un rappel')
        .addStringOption((o) => o.setName('dans').setDescription('Dans combien de temps ? (ex: 30m, 2h, 3j)').setRequired(true))
        .addStringOption((o) => o.setName('message').setDescription('De quoi te rappeler ?').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((s) => s.setName('liste').setDescription('Tes rappels en attente'))
    .addSubcommand((s) =>
      s.setName('supprimer').setDescription('Supprime un rappel').addIntegerOption((o) => o.setName('id').setDescription('ID du rappel').setRequired(true)),
    ),
  async execute(interaction) {
    const list = db.global.reminders;
    const sub = interaction.options.getSubcommand();
    const mine = list.filter((r) => r.userId === interaction.user.id);

    if (sub === 'liste') {
      return reply(interaction, {
        ephemeral: true,
        embeds: [embed(interaction.guildId).setTitle('⏰ Tes rappels').setDescription(mine.map((r) => `**#${r.id}** ${ts(r.at, 'R')} — ${r.text}`).join('\n').slice(0, 4000) || 'Aucun.')],
      });
    }
    if (sub === 'supprimer') {
      const id = interaction.options.getInteger('id');
      const index = list.findIndex((r) => r.id === id && r.userId === interaction.user.id);
      if (index < 0) return replyError(interaction, 'Rappel introuvable.');
      list.splice(index, 1);
      db.save();
      return replySuccess(interaction, `Rappel #${id} supprimé.`, true);
    }
    const delay = parseDuration(interaction.options.getString('dans'));
    if (!delay || delay > 365 * 86_400_000) return replyError(interaction, 'Durée invalide (max 1 an). Exemples : `30m`, `2h`, `3j`.');
    if (mine.length >= 25) return replyError(interaction, 'Tu as déjà 25 rappels en attente.');
    const reminder = {
      id: (list.reduce((max, r) => Math.max(max, r.id), 0) || 0) + 1,
      userId: interaction.user.id,
      at: Date.now() + delay,
      text: interaction.options.getString('message'),
      channelUrl: interaction.channel?.url ?? null,
    };
    list.push(reminder);
    db.save();
    return replySuccess(interaction, `Rappel **#${reminder.id}** ${ts(reminder.at, 'R')} (${ts(reminder.at, 'f')}), envoyé en MP.`, true);
  },
};
