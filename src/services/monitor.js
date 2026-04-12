const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');

// In-memory action log for threshold checks
const actionLog = new Map();

// Deny permissions applied to every channel for the Suspended role
const SUSPEND_DENY = {
  SendMessages: false, SendMessagesInThreads: false, AddReactions: false,
  AttachFiles: false,  EmbedLinks: false,             CreatePublicThreads: false,
  CreatePrivateThreads: false, Speak: false,           Connect: false
};

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

// ── Apply Suspended role deny overwrites to all guild channels (parallel) ────
async function applySuspendedOverwrites(guild, suspendedRole) {
  await Promise.all(
    [...guild.channels.cache.values()]
      .filter(ch => ch.permissionOverwrites)
      .map(ch => ch.permissionOverwrites.edit(
        suspendedRole, SUSPEND_DENY,
        { reason: 'Daddy USSR: Suspended role lockout' }
      ).catch(() => {}))
  );
}

// ── Suspend a user ────────────────────────────────────────────────────────────
// force=false → guild owner + L1 are immune; L2 IS caught (instant-action)
// force=true  → bypass all trust (hierarchy discipline only)
async function suspendUser(member, reason, evidence = '', force = false) {
  const guild = member.guild;

  if (!force) {
    if (member.id === guild.ownerId) return; // Server owner always immune
    const trust = db.getTrust(guild.id, member.id);
    if (trust && trust.level === 1) return;  // L1: fully immune
  }

  // Save non-managed roles (managed roles can't be removed — safe for bots)
  const roles = member.roles.cache
    .filter(r => !r.managed && r.id !== guild.id && r.name !== 'Suspended')
    .map(r => r.id);
  db.saveRoles(guild.id, member.id, roles.join(','), 1);

  // Ensure Suspended role exists
  let suspendedRole = guild.roles.cache.find(r => r.name === 'Suspended');
  if (!suspendedRole) {
    suspendedRole = await guild.roles.create({
      name: 'Suspended', permissions: [], color: 0x000000,
      reason: 'Daddy USSR: Auto-created Suspended role'
    }).catch(() => null);
  }
  if (!suspendedRole) return;

  // Apply deny overwrites to ALL channels in parallel
  await applySuspendedOverwrites(guild, suspendedRole);

  // Remove non-managed roles, add Suspended (parallel — safe for bots)
  await Promise.all([
    roles.length ? member.roles.remove(roles, `Daddy USSR: ${reason}`).catch(() => {}) : Promise.resolve(),
    member.roles.add(suspendedRole, `Daddy USSR: ${reason}`).catch(() => {})
  ]);

  // For bots: zero out managed role permissions and save for restore on unsuspend
  if (member.user.bot) {
    const managedRoles = [...member.roles.cache.values()].filter(r => r.managed && r.permissions.bitfield !== 0n);
    await Promise.all(managedRoles.map(async r => {
      db.saveBotManagedPerm(guild.id, member.id, r.id, r.permissions.bitfield.toString());
      await r.setPermissions(0n, `Daddy USSR: Bot suspended — ${reason}`).catch(() => {});
    }));
  }

  // Log the suspension
  await sendLog(guild, new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🚨 SECURITY — User Suspended')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '👤 User',        value: `${member.user.tag} \`(${member.id})\``, inline: true },
      { name: '⚠️ Reason',      value: reason,                                   inline: true },
      { name: '🔍 Evidence',    value: evidence || 'N/A',                        inline: false },
      { name: '💾 Saved Roles', value: roles.length ? `${roles.length} roles` : 'None', inline: true },
      { name: '🔒 Channels',    value: 'All channels locked for Suspended role', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Daddy USSR Security Engine' }));
}

module.exports = { logAction, checkThreshold, suspendUser, sendLog, applySuspendedOverwrites, SUSPEND_DENY };
