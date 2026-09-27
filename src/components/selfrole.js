const { replyError, replySuccess } = require('../utils/embed');
const { DANGEROUS } = require('../commands/utility/rolepanel');

module.exports = {
  prefix: 'selfrole',
  async execute(interaction) {
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return replyError(interaction, "Ce rôle n'existe plus.");
    // re-vérification : un admin a pu ajouter des permissions au rôle depuis la création du panneau
    if (role.permissions.any(DANGEROUS) || !role.editable) return replyError(interaction, "Ce rôle n'est plus disponible en libre-service.");
    const member = interaction.member;
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Panneau de rôles');
      return replySuccess(interaction, `Rôle ${role} retiré.`, true);
    }
    await member.roles.add(role, 'Panneau de rôles');
    return replySuccess(interaction, `Rôle ${role} ajouté.`, true);
  },
};
