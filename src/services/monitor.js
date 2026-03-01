const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');

const actionLog = new Map();

function logAction(guildId, userId, type) {
  const key = `${guildId}-${userId}-${type}`;
  if (!actionLog.has(key)) actionLog.set(key, []);
  actionLog.get(key).push(Date.now());
}

function checkThreshold(guildId, userId, type) {
  const key = `${guildId}-${userId}-${type}`;
  if (!actionLog.has(key)) return false;

  const now = Date.now();
  const { limit_count, time_window } = db.getThreshold(guildId, type);

  const filtered = actionLog.get(key).filter(t => t > now - time_window);
  actionLog.set(key, filtered);

  return filtered.length >= limit_count;
}

async function suspendUser(member, reason, bot) {
  const guild = member.guild;
  const trust = db.getTrust(guild.id, member.id);
  if (trust && trust.level <= 2) return; // Immune

  const roles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
  db.saveRoles(guild.id, member.id, roles.join(','), 1);

  let suspendedRole = guild.roles.cache.find(r => r.name === 'Suspended');
  if (!suspendedRole) {
    suspendedRole = await guild.roles.create({
      name: 'Suspended',
      color: '#000000',
      reason: 'Security Bot Initialization'
    });
  }

  try {
    await member.roles.set([suspendedRole.id], `Security: ${reason}`);
  } catch (e) {
    console.error('Failed to suspend:', e.message);
  }

  // Send Log
  const config = db.getGuildConfig(guild.id);
  if (config.log_channel_id) {
    const channel = await guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Security Violation: Suspension')
        .setColor('#ff0000')
        .addFields(
          { name: 'User', value: `${member.user.tag} (${member.id})`, inline: true },
          { name: 'Reason', value: reason, inline: true }
        )
        .setTimestamp();
      channel.send({ embeds: [embed] });
    }
  }
}

module.exports = { logAction, checkThreshold, suspendUser };
