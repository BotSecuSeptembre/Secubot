const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replySuccess } = require('../../utils/embed');

/** Renomme les membres dont le pseudo commence par des symboles pour « remonter » dans la liste. */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('dehoist')
    .setDescription('Renomme les membres dont le pseudo commence par des caractères spéciaux (!, ., etc.)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  async execute(interaction) {
    await interaction.deferReply();
    const members = await interaction.guild.members.fetch();
    let count = 0;
    for (const member of members.values()) {
      if (member.user.bot || !member.manageable) continue;
      if (/^[^a-zA-Z0-9À-ÿ]/.test(member.displayName)) {
        const cleaned = member.displayName.replace(/^[^a-zA-Z0-9À-ÿ]+/, '').slice(0, 32) || 'Pseudo modéré';
        const ok = await member.setNickname(cleaned, `Dehoist par ${interaction.user.tag}`).then(() => true).catch(() => false);
        if (ok) count++;
      }
    }
    return replySuccess(interaction, `**${count}** membre(s) renommé(s).`);
  },
};
