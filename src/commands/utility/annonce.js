const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('annonce')
    .setDescription('Publie une annonce en embed (formulaire multi-lignes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) => o.setName('salon').setDescription('Salon de publication').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) =>
      o.setName('mention').setDescription('Mention à ajouter').addChoices({ name: '@everyone', value: 'everyone' }, { name: '@here', value: 'here' }, { name: 'Aucune', value: 'none' }),
    )
    .addRoleOption((o) => o.setName('role').setDescription('Rôle à mentionner')),
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon');
    const mention = interaction.options.getString('mention') ?? 'none';
    const role = interaction.options.getRole('role');
    const modal = new ModalBuilder()
      .setCustomId(`announce:${channel.id}:${mention}:${role?.id ?? '0'}`)
      .setTitle('Nouvelle annonce')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Titre').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('body').setLabel('Message').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true)),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('image').setLabel("Lien d'une image (optionnel)").setStyle(TextInputStyle.Short).setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('color').setLabel('Couleur hex (optionnel, ex: #ff0000)').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(false),
        ),
      );
    return interaction.showModal(modal);
  },
};
