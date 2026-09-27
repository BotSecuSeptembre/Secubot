const { Events } = require('discord.js');
const { replyError } = require('../utils/embed');
const { isOwner } = require('../utils/moderation');
const db = require('../database');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (db.global.blacklist.includes(interaction.user.id) && !isOwner(interaction.user.id)) {
      if (interaction.isRepliable()) return replyError(interaction, 'Tu es sur la liste noire du bot.');
      return;
    }

    try {
      if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        if (command.ownerOnly && !isOwner(interaction.user.id)) {
          return replyError(interaction, 'Cette commande est réservée aux propriétaires du bot.');
        }
        if (command.guildOnly !== false && !interaction.inGuild()) {
          return replyError(interaction, 'Cette commande ne fonctionne que sur un serveur.');
        }
        return await command.execute(interaction, client);
      }

      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        return await command?.autocomplete?.(interaction, client);
      }

      if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
        const prefix = interaction.customId.split(':')[0];
        const handler = client.components.find((c) => c.prefix === prefix);
        if (handler) return await handler.execute(interaction, client);
      }
    } catch (err) {
      console.error(`[interaction ${interaction.commandName ?? interaction.customId}]`, err);
      if (interaction.isRepliable()) {
        await replyError(interaction, `Une erreur est survenue : \`${String(err.message).slice(0, 200)}\``).catch(() => null);
      }
    }
  },
};
