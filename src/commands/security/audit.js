const { SlashCommandBuilder, PermissionFlagsBits, GuildVerificationLevel, GuildExplicitContentFilter, GuildMFALevel } = require('discord.js');
const db = require('../../database');
const { embed, truncate } = require('../../utils/embed');

const DANGEROUS = {
  Administrator: 'Administrateur',
  ManageGuild: 'Gérer le serveur',
  ManageRoles: 'Gérer les rôles',
  ManageChannels: 'Gérer les salons',
  BanMembers: 'Bannir',
  KickMembers: 'Expulser',
  ManageWebhooks: 'Gérer les webhooks',
  MentionEveryone: 'Mentionner @everyone',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Audit de sécurité du serveur : note /100, permissions dangereuses, points à corriger')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const guild = interaction.guild;
    await interaction.deferReply({ ephemeral: true });
    const cfg = db.config(guild.id);
    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const everyone = guild.roles.everyone;
    const issues = []; // [points perdus, texte]
    const good = [];
    const check = (ok, points, bad, fine) => (ok ? good.push(fine) : issues.push([points, bad]));

    // ---- Réglages Discord
    check(guild.verificationLevel >= GuildVerificationLevel.Medium, 8, 'Niveau de vérification Discord faible (conseillé : Moyen ou plus)', 'Niveau de vérification Discord correct');
    check(guild.explicitContentFilter === GuildExplicitContentFilter.AllMembers, 4, 'Filtre de contenu explicite pas activé pour tous les membres', 'Filtre de contenu explicite actif');
    check(guild.mfaLevel === GuildMFALevel.Elevated, 8, "La 2FA n'est pas obligatoire pour les actions de modération", '2FA obligatoire pour la modération');

    // ---- @everyone
    const evDanger = Object.keys(DANGEROUS).filter((p) => everyone.permissions.has(PermissionFlagsBits[p], false));
    check(!evDanger.length, 20, `@everyone a des permissions dangereuses : ${evDanger.map((p) => DANGEROUS[p]).join(', ')}`, '@everyone sans permission dangereuse');

    // ---- Rôles dangereux
    const dangerRoles = guild.roles.cache
      .filter((r) => r.id !== everyone.id && Object.keys(DANGEROUS).some((p) => r.permissions.has(PermissionFlagsBits[p], false)))
      .sort((a, b) => b.position - a.position);
    const adminRoles = dangerRoles.filter((r) => r.permissions.has(PermissionFlagsBits.Administrator));
    const admins = members.filter((m) => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator) && m.id !== guild.ownerId);
    const adminBots = members.filter((m) => m.user.bot && m.id !== guild.client.user.id && m.permissions.has(PermissionFlagsBits.Administrator));
    check(admins.size <= 3, 6, `${admins.size} humains ont la permission Administrateur (le moins possible)`, `${admins.size} administrateur(s) humain(s)`);
    check(!adminBots.size, 10, `${adminBots.size} autre(s) bot(s) ont Administrateur : ${adminBots.map((m) => m.user.tag).join(', ').slice(0, 200)}`, 'Aucun autre bot administrateur');

    // ---- Position du bot
    const me = guild.members.me;
    const above = guild.roles.cache.filter((r) => r.position > me.roles.highest.position && !r.managed);
    check(!above.size, 8, `${above.size} rôle(s) au-dessus du bot : il ne pourra pas sanctionner ces membres (${above.map((r) => r.name).join(', ').slice(0, 200)})`, 'Rôle du bot en haut de la liste');
    check(me.permissions.has(PermissionFlagsBits.ViewAuditLog), 5, "Le bot n'a pas « Voir les logs d'audit » (antinuke inactif)", 'Accès aux logs d\'audit');

    // ---- Protections du bot
    check(cfg.antinuke.enabled, 10, 'Antinuke désactivé (`/antinuke toggle`)', 'Antinuke actif');
    check(cfg.antiraid.enabled, 8, 'Antiraid désactivé (`/antiraid toggle`)', 'Antiraid actif');
    check(cfg.automod.enabled, 5, 'Automod désactivé (`/automod toggle`)', 'Automod actif');
    check(cfg.verification.enabled, 8, 'Vérification désactivée (`/setup verification`)', 'Vérification active');
    check(Boolean(cfg.logs.mod || cfg.logs.server), 5, 'Aucun salon de logs (`/logs auto`)', 'Logs configurés');
    check(cfg.autoBackup, 3, 'Sauvegarde automatique désactivée (`/backup auto`)', 'Sauvegarde automatique active');

    // ---- Webhooks
    const webhooks = await guild.fetchWebhooks().catch(() => null);
    if (webhooks) check(webhooks.size <= 10, 2, `${webhooks.size} webhooks sur le serveur (vérifie qu'ils sont tous utiles)`, `${webhooks.size} webhook(s)`);

    const lost = issues.reduce((acc, [p]) => acc + p, 0);
    const score = Math.max(0, 100 - lost);
    const grade = score >= 90 ? '🟢 Excellent' : score >= 70 ? '🟡 Correct' : score >= 50 ? '🟠 Moyen' : '🔴 Dangereux';

    const summary = embed(guild.id)
      .setTitle(`🔍 Audit de sécurité — ${score}/100 ${grade}`)
      .addFields(
        { name: `❌ À corriger (${issues.length})`, value: truncate(issues.sort((a, b) => b[0] - a[0]).map(([p, t]) => `\`-${p}\` ${t}`).join('\n') || 'Rien, bravo !') },
        { name: `✅ OK (${good.length})`, value: truncate(good.join('\n') || '—') },
      );
    const perms = embed(guild.id)
      .setTitle('🔑 Qui a des permissions dangereuses ?')
      .addFields(
        { name: `Rôles administrateurs (${adminRoles.size})`, value: truncate(adminRoles.map((r) => `${r} — ${r.members.size} membre(s)`).join('\n') || 'aucun') },
        {
          name: `Autres rôles sensibles (${dangerRoles.size - adminRoles.size})`,
          value: truncate(
            dangerRoles
              .filter((r) => !r.permissions.has(PermissionFlagsBits.Administrator))
              .map((r) => `${r} — ${Object.keys(DANGEROUS).filter((p) => r.permissions.has(PermissionFlagsBits[p], false)).map((p) => DANGEROUS[p]).join(', ')}`)
              .join('\n') || 'aucun',
          ),
        },
        { name: `Administrateurs humains (${admins.size})`, value: truncate(admins.map((m) => `${m}`).join(' ') || 'aucun (hors propriétaire)') },
      );
    return interaction.editReply({ embeds: [summary, perms] });
  },
};
