const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { replyError, replySuccess, reply, embed } = require('../../utils/embed');
const { checkHierarchy, logCase, notifyUser } = require('../../utils/moderation');
const { ts } = require('../../utils/time');

/** Crée (si besoin) le rôle de quarantaine qui ne voit aucun salon. */
async function ensureRole(guild) {
  const cfg = db.config(guild.id).quarantine;
  let role = cfg.roleId ? guild.roles.cache.get(cfg.roleId) : null;
  if (role) return role;
  role = await guild.roles.create({ name: '🔒 Quarantaine', color: 0x2b2d31, permissions: [], reason: 'Rôle de quarantaine' });
  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread() || (channel.parentId && channel.permissionsLocked)) continue;
    await channel.permissionOverwrites
      .edit(role, { ViewChannel: false, SendMessages: false, Connect: false, AddReactions: false }, { reason: 'Rôle de quarantaine' })
      .catch(() => null);
  }
  cfg.roleId = role.id;
  db.save();
  return role;
}

module.exports = {
  ensureRole,
  data: new SlashCommandBuilder()
    .setName('quarantaine')
    .setDescription('Isole un membre suspect (retire tous ses rôles, restaurables ensuite)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Met un membre en quarantaine')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Sort un membre de quarantaine et lui rend ses rôles')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('liste').setDescription('Membres en quarantaine')),
  async execute(interaction) {
    const guild = interaction.guild;
    const g = db.guild(guild.id);
    const sub = interaction.options.getSubcommand();

    if (sub === 'liste') {
      const entries = Object.entries(g.quarantine);
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle(`🔒 Quarantaine (${entries.length})`)
            .setDescription(entries.map(([id, q]) => `<@${id}> • ${ts(q.at, 'R')} par <@${q.by}> • ${q.reason}`).join('\n').slice(0, 4000) || 'Personne.'),
        ],
      });
    }

    const member = interaction.options.getMember('membre');
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");

    if (sub === 'ajouter') {
      if (g.quarantine[member.id]) return replyError(interaction, 'Ce membre est déjà en quarantaine.');
      const error = checkHierarchy(interaction.member, member, 'mettre en quarantaine');
      if (error) return replyError(interaction, error);
      const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
      await interaction.deferReply();
      const role = await ensureRole(guild);
      const saved = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.id !== role.id);
      g.quarantine[member.id] = { roles: saved.map((r) => r.id), at: Date.now(), by: interaction.user.id, reason };
      db.save();
      await member.roles.set([...member.roles.cache.filter((r) => r.managed).keys(), role.id], `Quarantaine : ${reason}`);
      if (member.voice?.channel) await member.voice.disconnect('Quarantaine').catch(() => null);
      await notifyUser(member.user, guild, 'quarantine', reason);
      await logCase(guild, { type: 'quarantine', target: member.user, moderator: interaction.user, reason, extra: `${saved.size} rôle(s) retiré(s)` });
      return interaction.editReply({ embeds: [embed(guild.id).setDescription(`🔒 ${member} est en quarantaine (${saved.size} rôle(s) mis de côté).\nRaison : ${reason}`)] });
    }

    const entry = g.quarantine[member.id];
    if (!entry) return replyError(interaction, "Ce membre n'est pas en quarantaine.");
    const roles = entry.roles.filter((id) => guild.roles.cache.get(id)?.editable);
    await member.roles.set([...member.roles.cache.filter((r) => r.managed).keys(), ...roles], `Fin de quarantaine par ${interaction.user.tag}`);
    delete g.quarantine[member.id];
    db.save();
    await logCase(guild, { type: 'unquarantine', target: member.user, moderator: interaction.user, reason: 'Fin de quarantaine' });
    return replySuccess(interaction, `${member} est sorti de quarantaine (${roles.length} rôle(s) rendu(s)).`);
  },
};
