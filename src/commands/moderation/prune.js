const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { replyError, embed } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prune')
    .setDescription('Expulse les membres inactifs SANS aucun rôle (fonction officielle Discord)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addIntegerOption((o) => o.setName('jours').setDescription("Inactifs depuis X jours").setRequired(true).setMinValue(1).setMaxValue(30)),
  async execute(interaction) {
    const days = interaction.options.getInteger('jours');
    const count = await interaction.guild.members.prune({ days, dry: true }).catch(() => null);
    if (count === null) return replyError(interaction, "Je n'ai pas la permission d'expulser des membres.");
    if (!count) return replyError(interaction, `Aucun membre sans rôle inactif depuis ${days} jours.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm').setLabel(`Expulser ${count} membre(s)`).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ ephemeral: true, components: [row], content: `⚠️ **${count}** membre(s) sans rôle et inactifs depuis ${days} jours vont être expulsés. Continuer ?` });
    const msg = await interaction.fetchReply();
    const click = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30_000 }).catch(() => null);
    if (!click || click.customId === 'cancel') return interaction.editReply({ content: 'Annulé.', components: [] });
    const pruned = await interaction.guild.members.prune({ days, reason: `Prune par ${interaction.user.tag}` });
    await sendLog(interaction.guild, 'mod', embed(interaction.guild.id).setDescription(`🧹 Prune : **${pruned}** membre(s) inactifs depuis ${days}j expulsés par ${interaction.user}.`));
    return click.update({ content: `✅ **${pruned}** membre(s) expulsé(s).`, components: [] });
  },
};
