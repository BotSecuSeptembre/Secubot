const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, embed } = require('../../utils/embed');

const DANGEROUS = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageChannels];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleall')
    .setDescription('Ajoute ou retire un rôle à tous les membres')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Ajouter', value: 'add' }, { name: 'Retirer', value: 'remove' }))
    .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true))
    .addStringOption((o) =>
      o.setName('cible').setDescription('Qui ? (défaut : humains)').addChoices({ name: 'Humains', value: 'humans' }, { name: 'Bots', value: 'bots' }, { name: 'Tout le monde', value: 'all' }),
    )
    .addRoleOption((o) => o.setName('seulement_avec').setDescription('Uniquement les membres qui ont ce rôle')),
  async execute(interaction) {
    const guild = interaction.guild;
    const role = interaction.options.getRole('role');
    const add = interaction.options.getString('action') === 'add';
    const target = interaction.options.getString('cible') ?? 'humans';
    const filterRole = interaction.options.getRole('seulement_avec');
    if (role.managed || role.id === guild.id || !role.editable) return replyError(interaction, 'Je ne peux pas gérer ce rôle (rôle géré ou au-dessus du mien).');
    if (add && role.permissions.any(DANGEROUS)) return replyError(interaction, 'Par sécurité, impossible de donner en masse un rôle avec des permissions de modération/administration.');
    if (interaction.user.id !== guild.ownerId && role.position >= interaction.member.roles.highest.position) {
      return replyError(interaction, 'Ce rôle est supérieur ou égal à ton rôle le plus haut.');
    }

    await interaction.deferReply();
    const members = (await guild.members.fetch()).filter((m) => {
      if (target === 'humans' && m.user.bot) return false;
      if (target === 'bots' && !m.user.bot) return false;
      if (filterRole && !m.roles.cache.has(filterRole.id)) return false;
      return add ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id);
    });
    await interaction.editReply({ embeds: [embed(guild.id).setDescription(`⏳ ${add ? 'Ajout' : 'Retrait'} de ${role} pour **${members.size}** membre(s)... (environ ${Math.ceil(members.size / 60)} min)`)] });
    let done = 0;
    for (const m of members.values()) {
      const ok = await (add ? m.roles.add(role, `Roleall par ${interaction.user.tag}`) : m.roles.remove(role, `Roleall par ${interaction.user.tag}`)).then(() => true).catch(() => false);
      if (ok) done++;
    }
    const e = embed(guild.id).setDescription(`✅ ${role} ${add ? 'ajouté à' : 'retiré de'} **${done}**/${members.size} membre(s).`);
    return interaction.editReply({ embeds: [e] }).catch(() => interaction.channel.send({ embeds: [e] }));
  },
};
