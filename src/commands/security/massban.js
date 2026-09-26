const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { replyError, embed } = require('../../utils/embed');
const { logCase } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription("Bannit en masse (liste d'IDs ou toutes les arrivées récentes lors d'un raid)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('ids').setDescription('IDs séparés par des espaces ou virgules'))
    .addIntegerOption((o) => o.setName('arrives_depuis_minutes').setDescription('Bannir tous les membres arrivés depuis X minutes').setMinValue(1).setMaxValue(1440))
    .addBooleanOption((o) => o.setName('non_verifies_seulement').setDescription('Uniquement les membres sans le rôle vérifié (défaut : oui)'))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(300)),
  async execute(interaction) {
    const guild = interaction.guild;
    const reason = interaction.options.getString('raison') || 'Massban (raid)';
    const minutes = interaction.options.getInteger('arrives_depuis_minutes');
    const onlyUnverified = interaction.options.getBoolean('non_verifies_seulement') ?? true;
    const verifiedRole = db.config(guild.id).verification.verifiedRoleId;
    const ids = new Set((interaction.options.getString('ids') ?? '').split(/[\s,]+/).filter((id) => /^\d{17,20}$/.test(id)));

    if (minutes) {
      const since = Date.now() - minutes * 60_000;
      for (const m of guild.members.cache.values()) {
        if ((m.joinedTimestamp ?? 0) < since || m.user.bot) continue;
        if (onlyUnverified && verifiedRole && m.roles.cache.has(verifiedRole)) continue;
        ids.add(m.id);
      }
    }
    if (!ids.size) return replyError(interaction, 'Aucune cible. Donne des IDs ou une durée.');
    if (ids.size > 200) return replyError(interaction, `Trop de cibles (${ids.size}). Maximum 200 par commande.`);

    await interaction.deferReply();
    let banned = 0;
    const failed = [];
    for (const id of ids) {
      const member = guild.members.cache.get(id);
      if (id === interaction.user.id || id === guild.ownerId || (member && !member.bannable) || member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        failed.push(id);
        continue;
      }
      const ok = await guild.members.ban(id, { reason: `${reason} (massban par ${interaction.user.tag})`, deleteMessageSeconds: 86400 }).then(() => true).catch(() => false);
      if (ok) {
        banned++;
        const user = member?.user ?? (await interaction.client.users.fetch(id).catch(() => ({ id, tag: id, toString: () => `<@${id}>` })));
        await logCase(guild, { type: 'ban', target: user, moderator: interaction.user, reason: `Massban : ${reason}` });
      } else failed.push(id);
    }
    return interaction.editReply({
      embeds: [
        embed(guild.id)
          .setTitle('🔨 Massban terminé')
          .setDescription(`✅ **${banned}** banni(s)\n❌ **${failed.length}** échec(s)${failed.length ? ` : ${failed.slice(0, 30).map((id) => `\`${id}\``).join(', ')}` : ''}`),
      ],
    });
  },
};
