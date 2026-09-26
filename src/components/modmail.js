const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { openTicket, closeTicket, pendingChoice } = require('../utils/modmail');
const { replyError } = require('../utils/embed');

module.exports = {
  prefix: 'modmail',
  async execute(interaction, client) {
    const [, action, userId] = interaction.customId.split(':');

    // Choix du serveur depuis les MP
    if (action === 'guild') {
      const guild = client.guilds.cache.get(interaction.values[0]);
      const message = pendingChoice.get(interaction.user.id);
      if (!guild || !message) return interaction.update({ content: '❌ Demande expirée, renvoie ton message.', components: [] });
      pendingChoice.delete(interaction.user.id);
      await interaction.update({ content: `📨 Ouverture d'un ticket sur **${guild.name}**...`, components: [] });
      try {
        await openTicket(guild, interaction.user, message);
        await message.react('✅').catch(() => null);
      } catch (err) {
        console.error('[modmail]', err);
        await interaction.followUp("❌ Impossible d'ouvrir le ticket sur ce serveur.");
      }
      return;
    }

    if (action === 'close') {
      const cfg = db.config(interaction.guild.id).modmail;
      const member = interaction.member;
      const allowed =
        member.permissions.has(PermissionFlagsBits.ManageMessages) || (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId));
      if (!allowed) return replyError(interaction, "Tu n'as pas la permission de fermer ce ticket.");
      await interaction.deferUpdate();
      const closed = await closeTicket(interaction.guild, userId, interaction.user);
      await interaction.message.edit({ components: [] }).catch(() => null);
      if (!closed) await interaction.followUp({ content: 'Ce ticket est déjà fermé.', ephemeral: true });
    }
  },
};
