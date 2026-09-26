const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed } = require('../../utils/embed');
const { ACTION_LABELS } = require('../../utils/moderation');
const { paginate, chunk } = require('../../utils/paginate');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription("Historique complet des sanctions et notes d'un utilisateur")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur');
    const g = db.guild(interaction.guild.id);
    const cases = g.cases.filter((c) => c.targetId === user.id).reverse();
    const notes = g.notes.filter((n) => n.userId === user.id);
    const global = db.user(user.id).sanctions.filter((s) => s.guildId !== interaction.guild.id);
    const header = `Cas : **${cases.length}** • Notes : **${notes.length}** • Sanctions sur d'autres serveurs : **${global.length}**`;
    const lines = cases.map((c) => `**#${c.id}** ${ACTION_LABELS[c.type] ?? c.type} • ${ts(c.timestamp, 'd')} par <@${c.moderatorId}>\n└ ${c.reason.slice(0, 150)}`);
    const pages = chunk(lines.length ? lines : ['Aucune sanction.'], 8).map((list) =>
      embed(interaction.guild.id)
        .setAuthor({ name: `Historique de ${user.tag}`, iconURL: user.displayAvatarURL() })
        .setDescription(`${header}\n\n${list.join('\n')}`)
        .setFooter({ text: `ID : ${user.id}` }),
    );
    if (notes.length) {
      pages.push(
        embed(interaction.guild.id)
          .setAuthor({ name: `Notes sur ${user.tag}`, iconURL: user.displayAvatarURL() })
          .setDescription(notes.slice(-15).map((n) => `**#${n.id}** ${ts(n.timestamp, 'd')} par <@${n.moderatorId}>\n└ ${n.text.slice(0, 200)}`).join('\n')),
      );
    }
    return paginate(interaction, pages, { ephemeral: true });
  },
};
