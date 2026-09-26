const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Ajoute ou retire un rôle à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Ajouter', value: 'add' }, { name: 'Retirer', value: 'remove' }))
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role');
    const add = interaction.options.getString('action') === 'add';
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    if (role.managed || role.id === interaction.guild.id) return replyError(interaction, 'Ce rôle ne peut pas être attribué manuellement.');
    if (interaction.user.id !== interaction.guild.ownerId && role.position >= interaction.member.roles.highest.position) {
      return replyError(interaction, 'Ce rôle est supérieur ou égal à ton rôle le plus haut.');
    }
    if (!role.editable) return replyError(interaction, 'Ce rôle est au-dessus du mien.');
    if (add) await member.roles.add(role, `Par ${interaction.user.tag}`);
    else await member.roles.remove(role, `Par ${interaction.user.tag}`);
    return replySuccess(interaction, `${role} ${add ? 'ajouté à' : 'retiré de'} ${member}.`);
  },
};
