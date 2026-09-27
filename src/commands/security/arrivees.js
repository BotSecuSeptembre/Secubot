const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed } = require('../../utils/embed');
const { paginate, chunk } = require('../../utils/paginate');
const { ts, formatDuration } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('arrivees')
    .setDescription('Dernières arrivées sur le serveur (âge du compte, invitation, vérification)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de membres (défaut : 30)').setMinValue(1).setMaxValue(200)),
  async execute(interaction) {
    const guild = interaction.guild;
    const g = db.guild(guild.id);
    const verified = g.config.verification.verifiedRoleId;
    const members = [...guild.members.cache.values()]
      .filter((m) => !m.user.bot)
      .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
      .slice(0, interaction.options.getInteger('nombre') ?? 30);
    const lines = members.map((m) => {
      const data = g.members[m.id] ?? {};
      const age = Date.now() - m.user.createdTimestamp;
      return [
        `${verified ? (m.roles.cache.has(verified) ? '✅' : '⏳') : '•'} ${m} \`${m.user.tag}\` — arrivé ${ts(m.joinedTimestamp, 'R')}`,
        `└ compte : **${formatDuration(age)}**${age < 7 * 86_400_000 ? ' ⚠️' : ''}${data.inviteCode ? ` • invit. \`${data.inviteCode}\`${data.inviterId ? ` (<@${data.inviterId}>)` : ''}` : ''}${data.joinCount > 1 ? ` • ${data.joinCount}e arrivée` : ''}`,
      ].join('\n');
    });
    const pages = chunk(lines.length ? lines : ['Aucune arrivée.'], 10).map((l) =>
      embed(guild.id).setTitle('🚪 Dernières arrivées').setDescription(l.join('\n')).setFooter({ text: verified ? '✅ vérifié • ⏳ non vérifié' : 'Vérification non configurée' }),
    );
    return paginate(interaction, pages, { ephemeral: true });
  },
};
