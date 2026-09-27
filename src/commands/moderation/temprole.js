const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { replyError, replySuccess, reply, embed } = require('../../utils/embed');
const { parseDuration, formatDuration, ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Donne un rôle pour une durée limitée')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName('donner')
        .setDescription('Donne un rôle temporaire')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true))
        .addStringOption((o) => o.setName('duree').setDescription('Durée (ex: 1h, 7j)').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('liste').setDescription('Rôles temporaires en cours')),
  async execute(interaction) {
    const guild = interaction.guild;
    const g = db.guild(guild.id);
    if (interaction.options.getSubcommand() === 'liste') {
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle(`⏳ Rôles temporaires (${g.temproles.length})`)
            .setDescription(g.temproles.map((t) => `<@${t.userId}> • <@&${t.roleId}> • fin ${ts(t.until, 'R')}`).join('\n').slice(0, 4000) || 'Aucun.'),
        ],
      });
    }
    const member = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role');
    const duration = parseDuration(interaction.options.getString('duree'));
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    if (!duration || duration > 365 * 86_400_000) return replyError(interaction, 'Durée invalide (max 1 an). Exemples : `1h`, `7j`.');
    if (role.managed || !role.editable || role.id === guild.id) return replyError(interaction, 'Je ne peux pas gérer ce rôle.');
    if (interaction.user.id !== guild.ownerId && role.position >= interaction.member.roles.highest.position) return replyError(interaction, 'Ce rôle est supérieur ou égal au tien.');
    await member.roles.add(role, `Rôle temporaire (${formatDuration(duration)}) par ${interaction.user.tag}`);
    g.temproles = g.temproles.filter((t) => !(t.userId === member.id && t.roleId === role.id));
    g.temproles.push({ userId: member.id, roleId: role.id, until: Date.now() + duration });
    db.save();
    return replySuccess(interaction, `${role} donné à ${member} pour **${formatDuration(duration)}** (fin ${ts(Date.now() + duration, 'R')}).`);
  },
};
