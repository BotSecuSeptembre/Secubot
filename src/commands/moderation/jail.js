const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, replyError } = require('../../utils/embed');
const { canJail, jail } = require('../../utils/jail');
const { parseDuration, formatDuration, ts } = require('../../utils/time');

const MAX = 30 * 86_400_000;

module.exports = {
  // Pas de permission Discord par défaut : l'accès est vérifié par le bot (admins + utilisateurs autorisés)
  data: new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Envoie un membre en prison : il ne voit plus que le salon prison (5 min par défaut)')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à mettre en prison').setRequired(true))
    .addStringOption((o) => o.setName('temps').setDescription('Durée (ex: 10m, 1h, 2j). Défaut : 5m'))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
  async execute(interaction) {
    const guild = interaction.guild;
    const cfg = db.config(guild.id).jail;
    if (!canJail(interaction.member)) return replyError(interaction, "Tu n'as pas la permission d'utiliser /jail.");

    const member = interaction.options.getMember('membre');
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    const input = interaction.options.getString('temps');
    const duration = input ? parseDuration(input) : cfg.defaultMinutes * 60_000;
    if (!duration || duration > MAX) return replyError(interaction, 'Durée invalide (max 30 jours). Exemples : `10m`, `1h`, `2j`.');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';

    // Sécurité
    if (member.id === interaction.user.id) return replyError(interaction, 'Tu ne peux pas te mettre toi-même en prison.');
    if (member.id === guild.ownerId) return replyError(interaction, 'Impossible de mettre le propriétaire du serveur en prison.');
    if (member.user.bot) return replyError(interaction, 'Impossible de mettre un bot en prison.');
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.user.id === guild.ownerId;
    if (member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== guild.ownerId) {
      return replyError(interaction, 'Impossible de mettre un administrateur en prison.');
    }
    if (isAdmin && interaction.user.id !== guild.ownerId && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return replyError(interaction, 'Ce membre a un rôle supérieur ou égal au tien.');
    }
    if (member.roles.highest.position >= guild.members.me.roles.highest.position) {
      return replyError(interaction, 'Ce membre a un rôle supérieur ou égal au mien : place mon rôle plus haut.');
    }
    if (!guild.channels.cache.has(cfg.channelId)) {
      return replyError(interaction, `Le salon prison (\`${cfg.channelId}\`) est introuvable. Configure-le avec \`/jailconfig salon\`.`);
    }

    await interaction.deferReply();
    const res = await jail(guild, member, interaction.user, duration, reason);
    return interaction.editReply({
      embeds: [
        embed(guild.id).setDescription(
          res.extended
            ? `⛓️ ${member} était déjà en prison : nouvelle durée **${formatDuration(duration)}** (sortie ${ts(res.until, 'R')}).`
            : `⛓️ ${member} est en prison pour **${formatDuration(duration)}** (sortie ${ts(res.until, 'R')}).\n${res.removed} rôle(s) retiré(s), ils seront rendus automatiquement.\n**Raison :** ${reason}`,
        ),
      ],
    });
  },
};
