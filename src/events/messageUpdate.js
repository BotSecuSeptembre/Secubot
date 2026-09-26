const { Events } = require('discord.js');
const { sendLog } = require('../utils/logger');
const { embed, truncate } = require('../utils/embed');
const { runAutomod } = require('../utils/automod');
const { colors } = require('../config');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => null);
    if (!newMessage) return;

    // l'automod s'applique aussi aux messages modifiés (contournement)
    if (await runAutomod(newMessage)) return;

    await sendLog(
      newMessage.guild,
      'messages',
      embed(newMessage.guild.id)
        .setColor(colors.warning)
        .setAuthor({ name: `Message modifié • ${newMessage.author.tag}`, iconURL: newMessage.author.displayAvatarURL() })
        .setDescription(`[Aller au message](${newMessage.url}) dans ${newMessage.channel}`)
        .addFields(
          { name: 'Avant', value: truncate(oldMessage.content || '*inconnu (non mis en cache)*') },
          { name: 'Après', value: truncate(newMessage.content || '*vide*') },
        )
        .setFooter({ text: `ID auteur : ${newMessage.author.id}` })
        .setTimestamp(),
    );
  },
};
