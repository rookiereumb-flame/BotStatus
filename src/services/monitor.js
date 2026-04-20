const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');

// In-memory action log for threshold checks
const actionLog = new Map();

// Deny permissions applied to every channel for the Suspended role
const SUSPEND_DENY = {
  SendMessages: false, SendMessagesInThreads: false, AddReactions: false,
  AttachFiles: false,  EmbedLinks: false,             CreatePublicThreads: false,
  CreatePrivateThreads: false, Speak: false,           Connect: false,
  UseVAD: false,       Stream: false
};

// Permissions for the jail channel — can see + send, can't read history or do anything else
const JAIL_OVERWRITE = {
  ViewChannel: true, SendMessages: true,
  ReadMessageHistory: false,
  SendMessagesInThreads: false, AddReactions: false,
  AttachFiles: false, EmbedLinks: false, CreatePublicThreads: false,
  CreatePrivateThreads: false, Speak: false, Connect: false,
  UseVAD: false, Stream: false
};

// ── Security embed builder (matches screenshot style) ────────────────────────
// lines: [['Label', 'value'], ...]
// details: [['Label', 'value'], ...] — shown under "More Details:" separator
function securityEmbed(color, title, lines, details = []) {
  let desc = lines.map(([lbl, val]) => `▶ **${lbl}:** ${val}`).join('\n');
  if (details.length) {
    desc += '\n\n**More Details:**\n' +
      details.map(([lbl, val]) => `▶ **${lbl}:** ${val}`).join('\n');
  }
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp()
    .setFooter({ text: 'beni Security Engine' });
}

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
// If jailChannelId is set, that channel gets JAIL_OVERWRITE instead of SUSPEND_DENY
async function applySuspendedOverwrites(guild, suspendedRole, jailChannelId = null) {
  await Promise.all(
    [...guild.channels.cache.values()]
      .filter(ch => ch.permissionOverwrites)
      .map(ch => {
        const overwrite = (jailChannelId && ch.id === jailChannelId) ? JAIL_OVERWRITE : SUSPEND_DENY;
        return ch.permissionOverwrites.edit(suspendedRole, overwrite, { reason: 'beni: Suspended role lockout' }).catch(() => {});
      })
  );
}

// ── Suspend a user ────────────────────────────────────────────────────────────
// force=false → guild owner + L1 are immune; L2 IS caught (instant-action)
// force=true  → bypass all trust (hierarchy discipline only)
async function suspendUser(member, reason, evidence = '', force = false) {
  const guild = member.guild;

  if (!force) {
    if (member.id === guild.ownerId) return;
    const trust = db.getTrust(guild.id, member.id);
    if (trust && trust.level === 1) return;
  }

  // Load guild suspend config (custom role + jail channel)
  const suspendCfg = db.getSuspendConfig(guild.id);
  const jailChannelId = suspendCfg.jail_channel_id || null;

  // Save non-managed roles (managed roles can't be removed — safe for bots)
  const roles = member.roles.cache
    .filter(r => !r.managed && r.id !== guild.id && r.name !== 'Suspended')
    .map(r => r.id);
  db.saveRoles(guild.id, member.id, roles.join(','), 1);

  // Resolve Suspended role: use configured role first, then find/create "Suspended"
  let suspendedRole = suspendCfg.suspend_role_id
    ? (guild.roles.cache.get(suspendCfg.suspend_role_id) || guild.roles.cache.find(r => r.name === 'Suspended'))
    : guild.roles.cache.find(r => r.name === 'Suspended');
  if (!suspendedRole) {
    suspendedRole = await guild.roles.create({
      name: 'Suspended', permissions: [], color: 0x808080,
      reason: 'beni: Auto-created Suspended role'
    }).catch(() => null);
  }
  if (!suspendedRole) return;

  // Apply overwrites: SUSPEND_DENY to all channels, JAIL_OVERWRITE to jail channel
  await applySuspendedOverwrites(guild, suspendedRole, jailChannelId);

  // Remove non-managed roles, add Suspended (parallel — safe for bots)
  await Promise.all([
    roles.length ? member.roles.remove(roles, `beni: ${reason}`).catch(() => {}) : Promise.resolve(),
    member.roles.add(suspendedRole, `beni: ${reason}`).catch(() => {})
  ]);

  // For bots: zero out managed role permissions and save for restore on unsuspend
  if (member.user.bot) {
    const managedRoles = [...member.roles.cache.values()].filter(r => r.managed && r.permissions.bitfield !== 0n);
    await Promise.all(managedRoles.map(async r => {
      db.saveBotManagedPerm(guild.id, member.id, r.id, r.permissions.bitfield.toString());
      await r.setPermissions(0n, `beni: Bot suspended — ${reason}`).catch(() => {});
    }));
  }

  // Log with screenshot-style embed
  await sendLog(guild, securityEmbed(0xff0000,
    `${member.user.bot ? '🤖' : '👤'} ${member.user.username} has been suspended!`,
    [
      ['Reason',   reason],
      ['Member',   `<@${member.id}> [${member.user.tag}]`],
      ['Evidence', evidence || 'N/A'],
    ],
    [
      ['Action Applied', '✅'],
      ['Role Cleansing',  roles.length ? `✅ (${roles.length} roles removed)` : 'N/A'],
      ['Channels Locked', '✅ (all channels)'],
      ...(member.user.bot ? [['Managed Perms Zeroed', '✅']] : [])
    ]
  ));
}

module.exports = { logAction, checkThreshold, suspendUser, sendLog, applySuspendedOverwrites, SUSPEND_DENY, JAIL_OVERWRITE, securityEmbed };
