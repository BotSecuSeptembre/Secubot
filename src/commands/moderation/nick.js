const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription("Change (ou réinitialise) le surnom d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('surnom').setDescription('Nouveau surnom (vide = réinitialiser)').setMaxLength(32)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    const error = member.id === interaction.user.id ? null : checkHierarchy(interaction.member, member, 'renommer');
    if (error) return replyError(interaction, error);
    const nick = interaction.options.getString('surnom');
    await member.setNickname(nick, `Par ${interaction.user.tag}`);
    return replySuccess(interaction, nick ? `Surnom de ${member} changé en **${nick}**.` : `Surnom de ${member} réinitialisé.`);
  },
};
