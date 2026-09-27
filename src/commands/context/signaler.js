const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

/** Clic droit sur un message > Applications > Signaler le message */
module.exports = {
  data: new ContextMenuCommandBuilder().setName('Signaler le message').setType(ApplicationCommandType.Message),
  async execute(interaction) {
    const message = interaction.targetMessage;
    const modal = new ModalBuilder()
      .setCustomId(`report:submit:${message.channelId}:${message.id}`)
      .setTitle('Signaler ce message au staff')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Pourquoi signales-tu ce message ?').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  },
};
