const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Affiche l'avatar (et la bannière) d'un utilisateur")
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur')),
  async execute(interaction, client) {
    const user = await client.users.fetch((interaction.options.getUser('utilisateur') ?? interaction.user).id, { force: true });
    const member = interaction.guild.members.cache.get(user.id);
    const embeds = [
      embed(interaction.guild.id)
        .setTitle(`Avatar de ${user.tag}`)
        .setURL(user.displayAvatarURL({ size: 4096 }))
        .setImage(user.displayAvatarURL({ size: 4096 })),
    ];
    if (member?.avatar) embeds.push(embed(interaction.guild.id).setTitle('Avatar de serveur').setImage(member.displayAvatarURL({ size: 4096 })));
    if (user.banner) embeds.push(embed(interaction.guild.id).setTitle('Bannière').setImage(user.bannerURL({ size: 4096 })));
    return interaction.reply({ embeds });
  },
};
