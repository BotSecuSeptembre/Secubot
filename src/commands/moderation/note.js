const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { replySuccess, replyError } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Notes privées du staff sur un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Ajoute une note')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true))
        .addStringOption((o) => o.setName('texte').setDescription('Contenu').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s
        .setName('supprimer')
        .setDescription('Supprime une note')
        .addIntegerOption((o) => o.setName('id').setDescription('ID de la note').setRequired(true)),
    ),
  async execute(interaction) {
    const g = db.guild(interaction.guild.id);
    if (interaction.options.getSubcommand() === 'supprimer') {
      const id = interaction.options.getInteger('id');
      const index = g.notes.findIndex((n) => n.id === id);
      if (index < 0) return replyError(interaction, 'Note introuvable.');
      g.notes.splice(index, 1);
      db.save();
      return replySuccess(interaction, `Note #${id} supprimée.`, true);
    }
    const user = interaction.options.getUser('utilisateur');
    const note = {
      id: (g.notes.at(-1)?.id || 0) + 1,
      userId: user.id,
      moderatorId: interaction.user.id,
      text: interaction.options.getString('texte'),
      timestamp: Date.now(),
    };
    g.notes.push(note);
    db.save();
    return replySuccess(interaction, `Note #${note.id} ajoutée sur **${user.tag}** (visible avec \`/modlogs\`).`, true);
  },
};
