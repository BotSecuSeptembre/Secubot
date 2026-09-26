const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { embed, replyError, replySuccess, reply, truncate } = require('../../utils/embed');
const { openTicket, closeTicket, sendStaffReply, findTicketByThread } = require('../../utils/modmail');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modmail')
    .setDescription('Système de Modmail (les membres écrivent au bot en MP)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Définit le salon où arrivent les tickets')
        .addChannelOption((o) =>
          o.setName('salon').setDescription('Salon texte ou forum (privé pour le staff)').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum),
        )
        .addRoleOption((o) => o.setName('role_staff').setDescription('Rôle pingé à chaque nouveau ticket'))
        .addBooleanOption((o) => o.setName('anonyme').setDescription('Masquer le nom du staff dans les réponses (par défaut non)')),
    )
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription('Active / désactive le modmail')
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('reply')
        .setDescription("Répond à l'utilisateur du ticket (à utiliser dans le fil)")
        .addStringOption((o) => o.setName('message').setDescription('Réponse').setRequired(true).setMaxLength(4000))
        .addBooleanOption((o) => o.setName('anonyme').setDescription('Répondre anonymement')),
    )
    .addSubcommand((s) =>
      s
        .setName('close')
        .setDescription('Ferme le ticket (à utiliser dans le fil)')
        .addStringOption((o) => o.setName('raison').setDescription('Raison envoyée à l\'utilisateur').setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName('contact')
        .setDescription('Ouvre un ticket avec un membre (le bot lui écrit en MP)')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addStringOption((o) => o.setName('message').setDescription('Premier message').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand((s) =>
      s
        .setName('block')
        .setDescription('Bloque / débloque un utilisateur du modmail')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const cfg = db.config(guild.id).modmail;
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('salon');
      const role = interaction.options.getRole('role_staff');
      const anonymous = interaction.options.getBoolean('anonyme');
      Object.assign(cfg, { enabled: true, channelId: channel.id, staffRoleId: role?.id ?? null });
      if (anonymous !== null) cfg.anonymous = anonymous;
      db.save();
      return reply(interaction, {
        embeds: [
          embed(guild.id)
            .setTitle('📬 Modmail configuré')
            .setDescription(
              [
                `Les MP envoyés au bot arriveront dans ${channel}, un fil par utilisateur.`,
                role ? `Le rôle ${role} sera pingé à chaque nouveau ticket.` : null,
                `Réponses anonymes : **${cfg.anonymous ? 'oui' : 'non'}**`,
                '',
                "• Écris dans le fil pour répondre (préfixe `!` ou `//` = note interne).",
                '• `/modmail reply` pour une réponse (option anonyme).',
                '• `/modmail close` ou le bouton 🔒 pour fermer.',
              ]
                .filter((l) => l !== null)
                .join('\n'),
            ),
        ],
      });
    }

    if (sub === 'toggle') {
      cfg.enabled = interaction.options.getBoolean('actif');
      db.save();
      return replySuccess(interaction, `Modmail **${cfg.enabled ? 'activé' : 'désactivé'}**.`);
    }

    if (sub === 'block') {
      const user = interaction.options.getUser('utilisateur');
      const index = cfg.blocked.indexOf(user.id);
      if (index >= 0) cfg.blocked.splice(index, 1);
      else cfg.blocked.push(user.id);
      db.save();
      return replySuccess(interaction, `**${user.tag}** est maintenant ${index >= 0 ? 'débloqué' : 'bloqué'} du modmail.`);
    }

    if (sub === 'contact') {
      if (!cfg.enabled || !cfg.channelId) return replyError(interaction, "Le modmail n'est pas configuré.");
      const user = interaction.options.getUser('membre');
      const text = interaction.options.getString('message');
      const g = db.guild(guild.id);
      await interaction.deferReply({ ephemeral: true });
      if (!g.modmail[user.id]?.open) {
        await openTicket(guild, user, null);
      }
      try {
        await sendStaffReply(guild, user.id, interaction.member, text, [], cfg.anonymous);
      } catch {
        return interaction.editReply("❌ Impossible d'envoyer un MP à ce membre (MP fermés).");
      }
      const thread = await guild.channels.fetch(g.modmail[user.id].threadId).catch(() => null);
      await thread?.send({ embeds: [embed(guild.id).setAuthor({ name: `${interaction.user.tag} (staff)`, iconURL: interaction.user.displayAvatarURL() }).setDescription(truncate(text, 4000))] });
      return interaction.editReply(`✅ Message envoyé à ${user}. Ticket : ${thread ?? 'introuvable'}`);
    }

    // reply / close : dans un fil de ticket
    const found = interaction.channel.isThread() ? findTicketByThread(guild.id, interaction.channel.id) : null;
    if (!found) return replyError(interaction, "Cette commande s'utilise dans le fil d'un ticket modmail ouvert.");

    if (sub === 'reply') {
      const text = interaction.options.getString('message');
      const anonymous = interaction.options.getBoolean('anonyme') ?? cfg.anonymous;
      try {
        const e = await sendStaffReply(guild, found.userId, interaction.member, text, [], anonymous);
        return reply(interaction, { content: `📨 Envoyé${anonymous ? ' (anonyme)' : ''} par ${interaction.user}`, embeds: [e] });
      } catch {
        return replyError(interaction, "Impossible d'envoyer le MP (MP fermés ou utilisateur introuvable).");
      }
    }

    if (sub === 'close') {
      await replySuccess(interaction, 'Fermeture du ticket...');
      await closeTicket(guild, found.userId, interaction.user, interaction.options.getString('raison'));
    }
  },
};
