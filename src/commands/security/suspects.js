const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { analyzeMember } = require('../../utils/analysis');
const { embed } = require('../../utils/embed');
const { paginate, chunk } = require('../../utils/paginate');
const { formatDuration } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspects')
    .setDescription('Détecte les comptes suspects et les doubles comptes du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('recents')
        .setDescription('Analyse de risque des membres arrivés récemment (50 max)')
        .addIntegerOption((o) => o.setName('jours').setDescription('Arrivés depuis X jours (défaut : 7)').setMinValue(1).setMaxValue(90))
        .addIntegerOption((o) => o.setName('score_min').setDescription('Score de risque minimum (défaut : 20)').setMinValue(0).setMaxValue(100)),
    )
    .addSubcommand((s) => s.setName('avatars').setDescription('Groupes de membres ayant exactement le même avatar (doubles comptes)'))
    .addSubcommand((s) =>
      s
        .setName('nouveaux_comptes')
        .setDescription('Membres dont le compte Discord est très récent')
        .addIntegerOption((o) => o.setName('jours').setDescription('Compte créé il y a moins de X jours (défaut : 30)').setMinValue(1).setMaxValue(365)),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    const members = await guild.members.fetch().catch(() => guild.members.cache);

    if (sub === 'avatars') {
      const groups = new Map();
      for (const m of members.values()) {
        if (m.user.bot || !m.user.avatar) continue;
        groups.set(m.user.avatar, [...(groups.get(m.user.avatar) ?? []), m]);
      }
      const dup = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
      const lines = dup.map((g, i) => `**Groupe ${i + 1}** (${g.length})\n${g.map((m) => `└ ${m} \`${m.user.tag}\` (\`${m.id}\`)`).join('\n')}`);
      const pages = chunk(lines.length ? lines : ['✅ Aucun avatar identique trouvé.'], 5).map((l) =>
        embed(guild.id).setTitle('🕵️ Avatars identiques').setDescription(l.join('\n\n').slice(0, 4000)),
      );
      return paginate(interaction, pages);
    }

    if (sub === 'nouveaux_comptes') {
      const days = interaction.options.getInteger('jours') ?? 30;
      const list = members
        .filter((m) => !m.user.bot && Date.now() - m.user.createdTimestamp < days * 86_400_000)
        .sort((a, b) => b.user.createdTimestamp - a.user.createdTimestamp)
        .map((m) => `${m} \`${m.user.tag}\` • compte de **${formatDuration(Date.now() - m.user.createdTimestamp)}**`);
      const pages = chunk(list.length ? list : ['✅ Aucun.'], 15).map((l) =>
        embed(guild.id).setTitle(`🆕 Comptes de moins de ${days} jours (${list.length})`).setDescription(l.join('\n')),
      );
      return paginate(interaction, pages);
    }

    const days = interaction.options.getInteger('jours') ?? 7;
    const min = interaction.options.getInteger('score_min') ?? 20;
    const recent = members
      .filter((m) => !m.user.bot && Date.now() - (m.joinedTimestamp ?? 0) < days * 86_400_000)
      .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
      .first(50);
    const results = [];
    for (const m of recent) {
      const a = await analyzeMember(m).catch(() => null);
      if (a && a.risk.score >= min) results.push(a);
    }
    results.sort((a, b) => b.risk.score - a.risk.score);
    const lines = results.map(
      (a) => `${a.risk.level.emoji} **${a.risk.score}** ${a.member} \`${a.user.tag}\`\n└ ${a.risk.reasons.slice(0, 2).map((r) => r.reason).join(' • ').slice(0, 180)}`,
    );
    const pages = chunk(lines.length ? lines : [`✅ Aucun membre arrivé ces ${days} jours avec un score ≥ ${min}.`], 8).map((l) =>
      embed(guild.id)
        .setTitle(`🕵️ Suspects — arrivés depuis ${days}j (${results.length}/${recent.length})`)
        .setDescription(l.join('\n'))
        .setFooter({ text: 'Fiche complète : /verification scan' }),
    );
    return paginate(interaction, pages);
  },
};
