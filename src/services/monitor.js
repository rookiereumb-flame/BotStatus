const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');

// In-memory action log for threshold checks
const actionLog = new Map();

// ── Log action timestamp ──────────────────────────────────────────────────────
function logAction(guildId, userId, type) {
  const key = `${guildId}:${userId}:${type}`;
  if (!actionLog.has(key)) actionLog.set(key, []);
  actionLog.get(key).push(Date.now());
}

// ── Check if threshold is exceeded ───────────────────────────────────────────
function checkThreshold(guildId, userId, type) {
  const key = `${guildId}:${userId}:${type}`;
  if (!actionLog.has(key)) return false;

  const { limit_count, time_window } = db.getThreshold(guildId, type);
  const now = Date.now();
  const recent = actionLog.get(key).filter(t => t > now - time_window);
  actionLog.set(key, recent);
  return recent.length >= limit_count;
}

// ── Send a security log embed ─────────────────────────────────────────────────
async function sendLog(guild, embed) {
  const config = db.getGuildConfig(guild.id);
  if (!config.log_channel_id) return;
  const ch = await guild.channels.fetch(config.log_channel_id).catch(() => null);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

// ── Suspend a user ────────────────────────────────────────────────────────────
async function suspendUser(member, reason, evidence = '') {
  const guild = member.guild;

  // Immunity check
  const trust = db.getTrust(guild.id, member.id);
  if (trust && trust.level <= 2) return;

  // Save roles before stripping
  const roles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
  db.saveRoles(guild.id, member.id, roles.join(','), 1);

  // Ensure Suspended role exists
  let suspendedRole = guild.roles.cache.find(r => r.name === 'Suspended');
  if (!suspendedRole) {
    suspendedRole = await guild.roles.create({
      name: 'Suspended',
      permissions: [],
      color: 0x000000,
      reason: 'Daddy USSR: Auto-created Suspended role'
    }).catch(() => null);
  }

  if (!suspendedRole) return;

  await member.roles.set([suspendedRole.id], `Daddy USSR: ${reason}`).catch(() => {});

  // Log it
  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🚨 SECURITY — User Suspended')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '👤 User', value: `${member.user.tag} \`(${member.id})\``, inline: true },
      { name: '⚠️ Reason', value: reason, inline: true },
      { name: '🔍 Evidence', value: evidence || 'N/A', inline: false },
      { name: '💾 Saved Roles', value: roles.length ? `${roles.length} roles saved` : 'None', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Daddy USSR Security Engine' });

  await sendLog(guild, embed);
}

module.exports = { logAction, checkThreshold, suspendUser, sendLog };
