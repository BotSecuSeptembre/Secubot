require('dotenv').config({ quiet: true });

const path = require('node:path');

const list = (value) =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

module.exports = {
  token: process.env.DISCORD_TOKEN,
  ownerIds: list(process.env.OWNER_IDS),
  devGuildId: process.env.DEV_GUILD_ID || null,
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  enablePresences: String(process.env.ENABLE_PRESENCES).toLowerCase() === 'true',
  // Site web public (src/web)
  siteEnabled: String(process.env.SITE_ENABLED ?? 'true').toLowerCase() !== 'false',
  sitePort: Number(process.env.PORT || process.env.SITE_PORT || 3000),
  siteGuildId: process.env.SITE_GUILD_ID || null,
  siteUrl: (process.env.SITE_URL || '').replace(/\/+$/, '') || null,
  siteInviteUrl: process.env.SITE_INVITE_URL || null,
  siteContact: process.env.SITE_CONTACT || null,
  defaultColor: 0x5865f2,
  colors: {
    success: 0x57f287,
    error: 0xed4245,
    warning: 0xfee75c,
    info: 0x5865f2,
    danger: 0xff0000,
  },
};
