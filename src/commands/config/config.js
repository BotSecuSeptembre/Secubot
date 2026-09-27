const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, reply } = require('../../utils/embed');

const on = (v) => (v ? '✅' : '❌');
const ch = (id) => (id ? `<#${id}>` : '—');
const role = (id) => (id ? `<@&${id}>` : '—');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Affiche toute la configuration du bot sur ce serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const c = db.config(interaction.guild.id);
    return reply(interaction, {
      ephemeral: true,
      embeds: [
        embed(interaction.guild.id)
          .setTitle(`⚙️ Configuration — ${interaction.guild.name}`)
          .addFields(
            { name: '🎨 Thème', value: c.theme != null ? `#${c.theme.toString(16).padStart(6, '0')}` : 'par défaut', inline: true },
            { name: '🤖 Automod', value: `${on(c.automod.enabled)} (${c.automod.action})`, inline: true },
            { name: '🛡️ Antiraid', value: `${on(c.antiraid.enabled)}${c.antiraid.raidMode ? ' 🚨 RAID' : ''}`, inline: true },
            { name: '☢️ Antinuke', value: `${on(c.antinuke.enabled)} (${c.antinuke.threshold}/${c.antinuke.seconds}s)`, inline: true },
            { name: '📬 Modmail', value: `${on(c.modmail.enabled)} ${ch(c.modmail.channelId)}`, inline: true },
            { name: '⚖️ Paliers warns', value: String(c.warnThresholds.length), inline: true },
            {
              name: '🪪 Vérification',
              value: `${on(c.verification.enabled)} Panneau ${ch(c.verification.panelChannelId)} • Staff ${ch(c.verification.staffChannelId)}\nRôle vérifié ${role(c.verification.verifiedRoleId)} • Rôle staff ${role(c.verification.staffRoleId)}\nAuto-kick : ${c.verification.autoKickHours ? `${c.verification.autoKickHours}h` : 'non'}`,
            },
            { name: '📜 Logs', value: `Modération ${ch(c.logs.mod)} • Messages ${ch(c.logs.messages)}\nMembres ${ch(c.logs.members)} • Serveur ${ch(c.logs.server)}\nSignalements ${ch(c.logs.reports)}` },
            { name: '🔒 Quarantaine', value: `Rôle ${role(c.quarantine.roleId)}`, inline: true },
            { name: '💾 Sauvegarde auto', value: on(c.autoBackup), inline: true },
          ),
      ],
    });
  },
};
