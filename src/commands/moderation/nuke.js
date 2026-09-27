const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const { embed, replyError } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Recrée un salon à l\'identique pour effacer TOUS ses messages (après un raid/spam)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const cfg = db.config(interaction.guild.id);
    const protectedIds = [...Object.values(cfg.logs), cfg.modmail.channelId, cfg.verification.staffChannelId, cfg.verification.panelChannelId].filter(Boolean);
    if (protectedIds.includes(channel.id)) return replyError(interaction, 'Ce salon est utilisé par le bot (logs, modmail ou vérification) : impossible de le recréer.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm').setLabel('Oui, tout effacer').setEmoji('💣').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ ephemeral: true, components: [row], content: `⚠️ ${channel} va être supprimé puis recréé à l'identique : **tous les messages seront perdus**. Continuer ?` });
    const msg = await interaction.fetchReply();
    const click = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30_000 }).catch(() => null);
    if (!click || click.customId === 'cancel') return interaction.editReply({ content: 'Annulé.', components: [] });
    await click.update({ content: '💣 En cours...', components: [] });

    const clone = await channel.clone({ reason: `Nuke par ${interaction.user.tag}` });
    await clone.setPosition(channel.position).catch(() => null);
    await channel.delete(`Nuke par ${interaction.user.tag}`);
    await clone.send({ embeds: [embed(interaction.guild.id).setDescription(`💣 Salon réinitialisé par ${interaction.user}.`)] });
    await sendLog(interaction.guild, 'mod', embed(interaction.guild.id).setDescription(`💣 Salon **#${channel.name}** recréé (nuke) par ${interaction.user} → ${clone}`));
    if (channel.id !== interaction.channelId) await interaction.editReply({ content: `✅ ${clone} a été recréé.` }).catch(() => null);
  },
};
