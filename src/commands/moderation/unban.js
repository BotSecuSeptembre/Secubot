const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { replyError, replySuccess } = require('../../utils/embed');
const { logCase } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('id').setDescription("ID de l'utilisateur").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const bans = await interaction.guild.bans.fetch({ limit: 1000 }).catch(() => null);
    if (!bans) return interaction.respond([]);
    return interaction.respond(
      bans
        .filter((b) => b.user.tag.toLowerCase().includes(focused) || b.user.id.includes(focused))
        .first(25)
        .map((b) => ({ name: `${b.user.tag} (${b.user.id})`.slice(0, 100), value: b.user.id })),
    );
  },
  async execute(interaction) {
    const id = interaction.options.getString('id');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    const ban = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!ban) return replyError(interaction, "Cet utilisateur n'est pas banni.");
    await interaction.guild.members.unban(id, `${reason} (par ${interaction.user.tag})`);
    const g = db.guild(interaction.guild.id);
    g.tempbans = g.tempbans.filter((t) => t.userId !== id);
    db.save();
    const record = await logCase(interaction.guild, { type: 'unban', target: ban.user, moderator: interaction.user, reason });
    return replySuccess(interaction, `**${ban.user.tag}** a été débanni. (Cas #${record.id})`);
  },
};
