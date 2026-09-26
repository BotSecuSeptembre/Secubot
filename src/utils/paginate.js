const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

/**
 * Affiche une liste d'embeds avec des boutons ◀ ▶ (réservés à l'auteur de la commande).
 */
async function paginate(interaction, pages, { ephemeral = false, time = 180_000 } = {}) {
  if (!pages.length) return;
  let index = 0;
  const row = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('page:first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId('page:prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId('page:count').setLabel(`${index + 1}/${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('page:next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(index === pages.length - 1),
      new ButtonBuilder().setCustomId('page:last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(index === pages.length - 1),
    );

  const payload = () => ({ embeds: [pages[index]], components: pages.length > 1 ? [row()] : [] });
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload());
  else await interaction.reply({ ...payload(), ephemeral });
  const message = await interaction.fetchReply();
  if (pages.length <= 1) return;

  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time });
  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: "Ce n'est pas ton menu.", ephemeral: true });
    const action = i.customId.split(':')[1];
    if (action === 'first') index = 0;
    if (action === 'prev') index = Math.max(0, index - 1);
    if (action === 'next') index = Math.min(pages.length - 1, index + 1);
    if (action === 'last') index = pages.length - 1;
    await i.update(payload());
  });
  collector.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
}

/** Découpe un tableau en morceaux. */
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

module.exports = { paginate, chunk };
