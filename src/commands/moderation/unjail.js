const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { replyError, replySuccess } = require('../../utils/embed');
const { canJail, release } = require('../../utils/jail');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('Sort un membre de prison avant la fin et lui rend ses rôles')
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
  async execute(interaction) {
    if (!canJail(interaction.member)) return replyError(interaction, "Tu n'as pas la permission d'utiliser /unjail.");
    const user = interaction.options.getUser('membre');
    if (!db.guild(interaction.guild.id).jails[user.id]) return replyError(interaction, "Ce membre n'est pas en prison.");
    await interaction.deferReply();
    await release(interaction.guild, user.id, interaction.user, `Libéré par ${interaction.user.tag}`);
    return replySuccess(interaction, `🔓 ${user} est sorti de prison, ses rôles lui ont été rendus.`);
  },
};
