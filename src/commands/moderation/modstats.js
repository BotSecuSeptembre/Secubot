const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, reply } = require('../../utils/embed');
const { ACTION_LABELS } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription("Statistiques de modération de l'équipe")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('moderateur').setDescription('Un modérateur en particulier'))
    .addIntegerOption((o) => o.setName('jours').setDescription('Période en jours (défaut : 30)').setMinValue(1).setMaxValue(3650)),
  async execute(interaction) {
    const guild = interaction.guild;
    const days = interaction.options.getInteger('jours') ?? 30;
    const mod = interaction.options.getUser('moderateur');
    const since = Date.now() - days * 86_400_000;
    const cases = db.guild(guild.id).cases.filter((c) => c.timestamp >= since && (!mod || c.moderatorId === mod.id));

    const byType = {};
    for (const c of cases) byType[c.type] = (byType[c.type] ?? 0) + 1;
    const e = embed(guild.id)
      .setTitle(`📊 Modération — ${days} derniers jours${mod ? ` — ${mod.tag}` : ''}`)
      .addFields({
        name: `Actions (${cases.length})`,
        value: Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${ACTION_LABELS[t] ?? t} : **${n}**`).join('\n') || 'Aucune',
      });

    if (!mod) {
      const byMod = {};
      for (const c of cases) byMod[c.moderatorId] = (byMod[c.moderatorId] ?? 0) + 1;
      const top = Object.entries(byMod).sort((a, b) => b[1] - a[1]).slice(0, 15);
      e.addFields({
        name: 'Classement du staff',
        value: top.map(([id, n], i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} <@${id}> — **${n}**${id === guild.client.user.id ? ' (automatique)' : ''}`).join('\n') || 'Aucun',
      });
    }
    return reply(interaction, { embeds: [e] });
  },
};
