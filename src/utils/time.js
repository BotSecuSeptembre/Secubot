const UNITS = {
  s: 1000,
  sec: 1000,
  m: 60_000,
  min: 60_000,
  h: 3_600_000,
  j: 86_400_000,
  d: 86_400_000,
  w: 604_800_000,
  sem: 604_800_000,
};

/**
 * Convertit "10m", "1h30m", "2j", "1w" en millisecondes.
 * Renvoie null si le format est invalide.
 */
function parseDuration(input) {
  if (!input) return null;
  const regex = /(\d+)\s*(sem|sec|min|s|m|h|j|d|w)/gi;
  let total = 0;
  let matched = '';
  let match;
  while ((match = regex.exec(input)) !== null) {
    total += Number(match[1]) * UNITS[match[2].toLowerCase()];
    matched += match[0];
  }
  if (!total || matched.replace(/\s/g, '').length !== input.replace(/\s/g, '').length) return null;
  return total;
}

/** Durée lisible en français : 3j 4h 12min */
function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return 'inconnue';
  const abs = Math.abs(ms);
  const parts = [];
  const years = Math.floor(abs / (365 * 86_400_000));
  const days = Math.floor((abs % (365 * 86_400_000)) / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  if (years) parts.push(`${years} an${years > 1 ? 's' : ''}`);
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && !years) parts.push(`${minutes}min`);
  if (seconds && !years && !days) parts.push(`${seconds}s`);
  return parts.slice(0, 3).join(' ') || '0s';
}

/** Timestamp Discord (<t:...:R>) */
const ts = (date, style = 'f') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

module.exports = { parseDuration, formatDuration, ts };
