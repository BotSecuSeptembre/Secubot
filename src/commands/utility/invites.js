const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, reply, replyError } = require('../../utils/embed');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Suivi des invitations (qui a invité qui)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('membre')
        .setDescription("Personnes invitées par un membre")
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('classement').setDescription('Classement des membres qui invitent le plus'))
    .addSubcommand((s) => s.setName('codes').setDescription('Liste des invitations actives du serveur')),
  async execute(interaction) {
    const guild = interaction.guild;
    const g = db.guild(guild.id);
    const sub = interaction.options.getSubcommand();

    if (sub === 'membre') {
      const user = interaction.options.getUser('membre');
      const invited = Object.entries(g.members).filter(([, m]) => m.inviterId === user.id);
      const still = invited.filter(([id]) => guild.members.cache.has(id));
      const sanctioned = invited.filter(([id]) => g.cases.some((c) => c.targetId === id && ['ban', 'kick', 'tempban', 'antiraid'].includes(c.type)));
      return reply(interaction, {
        embeds: [
          embed(guild.id)
            .setAuthor({ name: `Invitations de ${user.tag}`, iconURL: user.displayAvatarURL() })
            .setDescription(
              [
                `Invités : **${invited.length}** • encore présents : **${still.length}** • partis : **${invited.length - still.length}**`,
                `Invités sanctionnés (ban/kick) : **${sanctioned.length}**${sanctioned.length >= 3 ? ' ⚠️' : ''}`,
                '',
                invited.slice(-20).reverse().map(([id, m]) => `${guild.members.cache.has(id) ? '🟢' : '⚫'} <@${id}> ${m.lastJoin ? ts(m.lastJoin, 'R') : ''}`).join('\n') || 'Aucun.',
              ].join('\n').slice(0, 4000),
            ),
        ],
      });
    }

    if (sub === 'classement') {
      const counts = {};
      for (const [id, m] of Object.entries(g.members)) {
        if (!m.inviterId) continue;
        counts[m.inviterId] ??= { total: 0, still: 0 };
        counts[m.inviterId].total++;
        if (guild.members.cache.has(id)) counts[m.inviterId].still++;
      }
      const top = Object.entries(counts).sort((a, b) => b[1].still - a[1].still).slice(0, 20);
      return reply(interaction, {
        embeds: [
          embed(guild.id)
            .setTitle('🏆 Classement des invitations')
            .setDescription(top.map(([id, c], i) => `**${i + 1}.** <@${id}> — **${c.still}** présents (${c.total} au total)`).join('\n') || 'Aucune donnée pour le moment.')
            .setFooter({ text: 'Compté depuis l\'arrivée du bot sur le serveur' }),
        ],
      });
    }

    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return replyError(interaction, "Je n'ai pas la permission de voir les invitations (Gérer le serveur).");
    return reply(interaction, {
      ephemeral: true,
      embeds: [
        embed(guild.id)
          .setTitle(`🔗 Invitations actives (${invites.size})`)
          .setDescription(
            [...invites.values()]
              .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
              .slice(0, 30)
              .map((i) => `\`${i.code}\` • ${i.inviter ?? 'inconnu'} • **${i.uses ?? 0}** util.${i.maxUses ? `/${i.maxUses}` : ''} • ${i.channel ?? ''}${i.expiresTimestamp ? ` • expire ${ts(i.expiresTimestamp, 'R')}` : ''}`)
              .join('\n')
              .slice(0, 4000) || 'Aucune.',
          ),
      ],
    });
  },
};
