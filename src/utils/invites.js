const { PermissionFlagsBits } = require('discord.js');

/** Cache des invitations : guildId -> Map(code -> { uses, inviterId }) */
const cache = new Map();

async function cacheGuildInvites(guild) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return;
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const inv of invites.values()) map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id ?? null });
    if (guild.vanityURLCode) {
      const vanity = await guild.fetchVanityData().catch(() => null);
      if (vanity) map.set(`vanity:${vanity.code}`, { uses: vanity.uses, inviterId: null });
    }
    cache.set(guild.id, map);
  } catch {
    // pas d'accès aux invitations : on ignore
  }
}

function onInviteCreate(invite) {
  if (!invite.guild) return;
  const map = cache.get(invite.guild.id) ?? new Map();
  map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null });
  cache.set(invite.guild.id, map);
}

function onInviteDelete(invite) {
  cache.get(invite.guild?.id)?.delete(invite.code);
}

/**
 * Détermine l'invitation utilisée par un nouveau membre en comparant les compteurs.
 * @returns {Promise<{code: string|null, inviterId: string|null, vanity?: boolean}>}
 */
async function findUsedInvite(guild) {
  const before = cache.get(guild.id);
  if (!before) {
    await cacheGuildInvites(guild);
    return { code: null, inviterId: null };
  }
  let used = null;
  try {
    const invites = await guild.invites.fetch();
    for (const inv of invites.values()) {
      const old = before.get(inv.code);
      if ((inv.uses ?? 0) > (old?.uses ?? 0)) {
        used = { code: inv.code, inviterId: inv.inviter?.id ?? null };
      }
    }
    // Invitations à usage unique qui ont disparu = probablement celle utilisée
    if (!used) {
      for (const [code, data] of before) {
        if (!code.startsWith('vanity:') && !invites.has(code)) used = { code, inviterId: data.inviterId };
      }
    }
    if (!used && guild.vanityURLCode) {
      const vanity = await guild.fetchVanityData().catch(() => null);
      const old = before.get(`vanity:${vanity?.code}`);
      if (vanity && vanity.uses > (old?.uses ?? 0)) used = { code: vanity.code, inviterId: null, vanity: true };
    }
  } catch {
    // ignore
  }
  await cacheGuildInvites(guild);
  return used ?? { code: null, inviterId: null };
}

module.exports = { cacheGuildInvites, onInviteCreate, onInviteDelete, findUsedInvite };
