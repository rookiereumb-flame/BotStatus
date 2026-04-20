require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, AuditLogEvent, ChannelType,
  PermissionFlagsBits, EmbedBuilder, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const db    = require('./src/database/db');
const botDb = require('./src/database');
const { buildResultEmbed, buildCaseEmbed, sendModlog } = require('./src/utils/modlog');
const { logAction, checkThreshold, suspendUser, sendLog, applySuspendedOverwrites, SUSPEND_DENY, JAIL_OVERWRITE, securityEmbed } = require('./src/services/monitor');

const TOKEN     = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

// ─── Duration helpers ────────────────────────────────────────────────────────
function parseDuration(input) {
  if (!input) return null;
  const m = input.trim().toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|day|days?|w|wk|wks|weeks?)$/);
  if (!m) return null;
  return Math.floor(parseFloat(m[1]) * { s:1000, m:60000, h:3600000, d:86400000, w:604800000 }[m[2][0]]);
}
function formatDuration(ms) {
  if (ms < 60000)     return `${Math.round(ms/1000)}s`;
  if (ms < 3600000)   return `${Math.round(ms/60000)}m`;
  if (ms < 86400000)  return `${Math.round(ms/3600000)}h`;
  if (ms < 604800000) return `${Math.round(ms/86400000)}d`;
  return `${Math.round(ms/604800000)}w`;
}

// ─── Dangerous permissions (role_update instant revert) ───────────────────────
const DANGEROUS_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
];

// ─── Counting sequence helpers ────────────────────────────────────────────────
function nextExpected(type, current) {
  if (type === 'even')  return current === 0 ? 2 : current + 2;
  if (type === 'odd')   return current === 0 ? 1 : current + 2;
  if (type === 'fibonacci') {
    let [a, b] = [0, 1];
    while (b <= current) [a, b] = [b, a + b];
    return b;
  }
  if (type === 'prime') {
    const ip = n => { if (n < 2) return false; for (let i=2; i*i<=n; i++) if (!(n%i)) return false; return true; };
    let n = Math.max(2, current + 1);
    while (!ip(n)) n++;
    return n;
  }
  return current + 1; // normal
}
const TYPE_LABELS = { normal:'Normal (1,2,3…)', even:'Even (2,4,6…)', odd:'Odd (1,3,5…)', fibonacci:'Fibonacci (1,2,3,5,8…)', prime:'Prime (2,3,5,7,11…)' };

// ─── Trust check helper ───────────────────────────────────────────────────────
// Returns the effective trust level of a member for this bot.
// -1 = below bot (no special treatment)
//  0 = above bot's role OR server owner (bot-owner tier)
//  1 = DB level 1 (fully immune, can do everything)
//  2 = DB level 2 (nuke-immune)
//  3 = DB level 3 (permit: bypasses Discord perm checks for mod commands)
function effectiveTrust(member) {
  if (!member) return -1;
  const dbTrust = db.getTrust(member.guild.id, member.id);
  if (dbTrust) return dbTrust.level;
  if (member.guild.ownerId === member.id) return 0;
  const botTop = member.guild.members.me?.roles.highest;
  if (botTop && member.roles.highest.comparePositionTo(botTop) > 0
      && member.permissions.has(PermissionFlagsBits.Administrator)) return 0;
  return -1;
}
// Returns true if the member can use admin-level mod commands (bypass Discord perms)
function hasBotPerm(member, discordPerm) {
  const t = effectiveTrust(member);
  if (t !== -1) return true; // any trust level bypasses Discord permission checks for mod commands
  return member.permissions.has(discordPerm);
}

// Build a DM embed sent to the target user on mod actions
const DM_ACTION_LABELS = {
  warn: 'Warned', ban: 'Banned', kick: 'Kicked',
  mute: 'Timed Out', suspend: 'Suspended', shadowban: 'Shadow-Banned'
};
const DM_ACTION_COLORS = {
  warn: 0xFFC107, ban: 0xED4245, kick: 0xFFA500,
  mute: 0xF39C12, suspend: 0xE67E22, shadowban: 0x9B59B6
};
function buildDmEmbed(action, guildName, reason, proofUrl = null, duration = null) {
  const key   = action.toLowerCase();
  const label = DM_ACTION_LABELS[key] || action;
  const color = DM_ACTION_COLORS[key] || 0x5865f2;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`You have been ${label}`)
    .addFields({ name: '📋 Server', value: guildName, inline: false })
    .addFields({ name: '📋 Reason', value: reason, inline: false });
  if (duration) embed.addFields({ name: '⏱️ Duration', value: duration, inline: false });
  if (proofUrl) embed.setImage(proofUrl);
  embed.setTimestamp();
  return embed;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ═══════════════════════════════════════════════════════════════════
//  AUTO-REVERT — Restore channels/roles from snapshot after nuke
// ═══════════════════════════════════════════════════════════════════

async function autoRevertChannel(guild, deletedCh) {
  const snap = db.getSnapshot(guild.id);
  if (!snap) return;
  const data   = JSON.parse(snap.data);
  // Match by ID first, then by name+type as fallback
  const saved  = data.channels?.find(c => c.id === deletedCh.id)
              || data.channels?.find(c => c.name === deletedCh.name && c.type === deletedCh.type);
  if (!saved) return;
  // Don't recreate if already exists (by name)
  if (guild.channels.cache.find(c => c.name === saved.name && c.type === saved.type)) return;
  try {
    const restored = await guild.channels.create({
      name: saved.name, type: saved.type,
      parent: saved.parentId || null,
      reason: 'beni: Auto-revert'
    });
    // Restore permission overwrites correctly
    if (saved.permissionOverwrites?.length) {
      await restored.permissionOverwrites.set(
        saved.permissionOverwrites.map(ow => ({
          id: ow.id, type: ow.type,
          allow: BigInt(ow.allow), deny: BigInt(ow.deny)
        })),
        'beni: Auto-revert'
      ).catch(e => console.error('overwrite restore:', e.message));
    }
    await sendLog(guild, securityEmbed(0x00ff88, '🔄 Channel Auto-Reverted',
      [
        ['Channel', `#${saved.name} → ${restored}`],
        ['Overwrites', `${saved.permissionOverwrites?.length || 0} restored`]
      ]
    ));
  } catch(e) { console.error('auto-revert channel:', e.message); }
}

async function autoRevertRole(guild, deletedRole) {
  const snap = db.getSnapshot(guild.id);
  if (!snap) return;
  const data   = JSON.parse(snap.data);
  const saved  = data.roles?.find(r => r.id === deletedRole.id)
              || data.roles?.find(r => r.name === deletedRole.name);
  if (!saved || saved.name === '@everyone') return;
  if (guild.roles.cache.find(r => r.name === saved.name)) return;
  try {
    const restored = await guild.roles.create({
      name: saved.name, permissions: BigInt(saved.permissions || '0'),
      color: saved.color || 0, hoist: saved.hoist || false, mentionable: saved.mentionable || false,
      reason: 'beni: Auto-revert'
    });
    await sendLog(guild, securityEmbed(0x00ff88, '🔄 Role Auto-Reverted',
      [
        ['Role', `"${saved.name}" → ${restored}`],
        ['Permissions', `\`${saved.permissions || '0'}\``]
      ]
    ));
  } catch(e) { console.error('auto-revert role:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════
//  AUDIT LOG HELPER — prevents false-positive + duplicate processing
// ═══════════════════════════════════════════════════════════════════
const _seenEntries = new Set();
async function fetchAuditEntry(guild, type, targetId = null, maxAge = 5000) {
  const logs = await guild.fetchAuditLogs({ type, limit: 3 }).catch(() => null);
  if (!logs) return null;
  for (const entry of logs.entries.values()) {
    if (Date.now() - entry.createdTimestamp > maxAge) break;
    if (targetId && entry.targetId !== targetId) continue;
    if (_seenEntries.has(entry.id)) return null; // already handled this entry
    _seenEntries.add(entry.id);
    setTimeout(() => _seenEntries.delete(entry.id), 60_000);
    return entry;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  SECURITY ENGINE
// ═══════════════════════════════════════════════════════════════════

async function handleNukeEvent(guild, executorId, type, reason, evidence, revertTarget = null) {
  if (!executorId || executorId === client.user.id) return;
  const cfg = db.getGuildConfig(guild.id);
  if (cfg.antinuke_enabled === 0) return;
  if (!db.isMonitorEnabled(guild.id, type)) return;

  const trust = db.getTrust(guild.id, executorId);
  if (trust && trust.level <= 2) return; // L1 + L2 immune to threshold monitors

  logAction(guild.id, executorId, type);

  if (checkThreshold(guild.id, executorId, type)) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) await suspendUser(member, reason, evidence); // suspendUser sends its own log
    if (revertTarget) {
      const featCfg = botDb.getGuildConfig(guild.id) || {};
      if (featCfg.feat_auto_revert !== 0) {
        if (type === 'channel_delete') await autoRevertChannel(guild, revertTarget);
        if (type === 'role_delete')    await autoRevertRole(guild, revertTarget);
      }
    }
  }
}

// ── Monitors ─────────────────────────────────────────────────────────────────

// Channel Delete — auto-revert
client.on('channelDelete', async c => {
  const e = await fetchAuditEntry(c.guild, AuditLogEvent.ChannelDelete, c.id);
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_delete', 'Channel Deletion Spam', `Deleted: #${c.name} (${c.id})`, c);
});

// ── Suspended role channel lockout helper ────────────────────────────────────
async function applySuspendedRoleOverwrites(guild) {
  const sr = guild.roles.cache.find(r => r.name === 'Suspended');
  if (!sr) return;
  await applySuspendedOverwrites(guild, sr); // parallel via monitor.js
}

// Channel Create
client.on('channelCreate', async c => {
  const e = await fetchAuditEntry(c.guild, AuditLogEvent.ChannelCreate, c.id);
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_create', 'Channel Creation Spam', `Created: #${c.name}`);
  // Apply Suspended role deny to new channels immediately
  const sr = c.guild.roles.cache.find(r => r.name === 'Suspended');
  if (sr && c.permissionOverwrites) {
    await c.permissionOverwrites.edit(sr, SUSPEND_DENY, { reason: 'beni: Suspended role lockout' }).catch(() => {});
  }
});

// Channel Update
client.on('channelUpdate', async (o, n) => {
  const e = await fetchAuditEntry(n.guild, AuditLogEvent.ChannelUpdate, n.id);
  if (e) await handleNukeEvent(n.guild, e.executorId, 'channel_update', 'Channel Update Spam', `Updated: #${n.name}`);
});

// Role Delete — auto-revert
client.on('roleDelete', async r => {
  const e = await fetchAuditEntry(r.guild, AuditLogEvent.RoleDelete, r.id);
  if (e) await handleNukeEvent(r.guild, e.executorId, 'role_delete', 'Role Deletion Spam', `Deleted: "${r.name}"`, r);
});

// Role Create
client.on('roleCreate', async r => {
  const e = await fetchAuditEntry(r.guild, AuditLogEvent.RoleCreate, r.id);
  if (e) await handleNukeEvent(r.guild, e.executorId, 'role_create', 'Role Creation Spam', `Created: "${r.name}"`);
});

// Role Update — dangerous permission check instead of threshold
client.on('roleUpdate', async (oldRole, newRole) => {
  const e = await fetchAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (!e) return;
  if (e.executorId === client.user.id) return;
  const cfg = db.getGuildConfig(newRole.guild.id);
  if (cfg.antinuke_enabled === 0 || !db.isMonitorEnabled(newRole.guild.id, 'role_update')) return;

  // Block dangerous perm grants
  const addedPerms = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
  const gotDangerous = DANGEROUS_PERMS.some(p => (addedPerms & p) === p);
  const roleFeatCfg = botDb.getGuildConfig(newRole.guild.id) || {};
  if (gotDangerous && roleFeatCfg.feat_role_perm_guard === 0) return; // feature disabled
  if (gotDangerous) {
    // Immediately revert
    await newRole.setPermissions(oldRole.permissions, 'beni: Dangerous perm grant blocked').catch(() => {});
    const member = await newRole.guild.members.fetch(e.executorId).catch(() => null);
    if (member) await suspendUser(member, 'Dangerous Permission Grant', `Role "${newRole.name}" given: ${DANGEROUS_PERMS.filter(p=>(addedPerms&p)===p).map(p=>Object.entries(PermissionFlagsBits).find(([,v])=>v===p)?.[0]).filter(Boolean).join(', ')}`);
    return;
  }

  // Protect Suspended role and bot role from edits by non-immune users
  const botTop = newRole.guild.members.me?.roles.highest;
  if (newRole.name === 'Suspended' || newRole.id === botTop?.id) {
    await newRole.setPermissions(oldRole.permissions, 'beni: Hierarchy protection').catch(() => {});
    const member = await newRole.guild.members.fetch(e.executorId).catch(() => null);
    if (member) await suspendUser(member, 'Unauthorized Hierarchy Edit', `Edited protected role "${newRole.name}"`);
  }
  // Safe updates (name, color, hoist, mentionable) are allowed — no action
});

// Member Ban
client.on('guildBanAdd', async b => {
  const e = await fetchAuditEntry(b.guild, AuditLogEvent.MemberBanAdd, b.user.id);
  if (e) await handleNukeEvent(b.guild, e.executorId, 'member_ban', 'Ban Spam', `Banned: ${b.user.tag}`);
});

// Member Kick
client.on('guildMemberRemove', async m => {
  // Check for kick
  const kickLog = await fetchAuditEntry(m.guild, AuditLogEvent.MemberKick, m.id);
  if (kickLog) await handleNukeEvent(m.guild, kickLog.executorId, 'member_kick', 'Kick Spam', `Kicked: ${m.user.tag}`);

  // Role memory — only save if NOT currently suspended
  const rmFeatCfg = botDb.getGuildConfig(m.guild.id) || {};
  if (rmFeatCfg.feat_role_memory !== 0) {
    const data = db.getRoles(m.guild.id, m.id);
    if (!data?.is_suspended) {
      const roles = m.roles.cache.filter(r => r.id !== m.guild.id).map(r => r.id);
      if (roles.length) db.saveRoles(m.guild.id, m.id, roles.join(','), 0);
    }
  }
});

// Webhook — delete immediately, threshold for repeated attempts
client.on('webhookUpdate', async channel => {
  const e = await fetchAuditEntry(channel.guild, AuditLogEvent.WebhookCreate);
  if (!e || e.executorId === client.user.id) return;
  const cfg = db.getGuildConfig(channel.guild.id);
  if (cfg.antinuke_enabled === 0 || !db.isMonitorEnabled(channel.guild.id, 'webhook_create')) return;
  const webhookFeatCfg = botDb.getGuildConfig(channel.guild.id) || {};
  if (webhookFeatCfg.feat_webhook_block === 0) return;
  const trust = db.getTrust(channel.guild.id, e.executorId);
  if (trust && trust.level <= 1) return; // Only L1 immune to instant-action

  // Delete the webhook
  const webhooks = await channel.fetchWebhooks().catch(() => null);
  const target   = webhooks?.find(w => w.id === e.targetId);
  if (target) await target.delete('beni: Unauthorized webhook removed').catch(() => {});

  logAction(channel.guild.id, e.executorId, 'webhook_create');
  await sendLog(channel.guild, securityEmbed(0xff6600,
    `⚠️ Webhook deleted in #${channel.name}`,
    [
      ['Executor', `<@${e.executorId}> [${(await channel.guild.members.fetch(e.executorId).catch(()=>({user:{tag:e.executorId}})))?.user?.tag}]`],
      ['Channel',  `#${channel.name}`],
      ['Action',   'Webhook auto-deleted instantly']
    ]
  ));

  if (checkThreshold(channel.guild.id, e.executorId, 'webhook_create')) {
    const member = await channel.guild.members.fetch(e.executorId).catch(() => null);
    if (member) await suspendUser(member, 'Webhook Spam', `Repeated webhook creation in #${channel.name}`);
  }
});

// Emoji Create
client.on('emojiCreate', async emoji => {
  const e = await fetchAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
  if (e) await handleNukeEvent(emoji.guild, e.executorId, 'emoji_create', 'Emoji Spam', `:${emoji.name}: created`);
});
// Emoji Delete
client.on('emojiDelete', async emoji => {
  const e = await fetchAuditEntry(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
  if (e) await handleNukeEvent(emoji.guild, e.executorId, 'emoji_delete', 'Emoji Deletion Spam', `:${emoji.name}: deleted`);
});

// Sticker Create
client.on('stickerCreate', async s => {
  const e = await fetchAuditEntry(s.guild, AuditLogEvent.StickerCreate, s.id);
  if (e) await handleNukeEvent(s.guild, e.executorId, 'sticker_create', 'Sticker Spam', `Sticker "${s.name}" created`);
});
// Sticker Delete
client.on('stickerDelete', async s => {
  const e = await fetchAuditEntry(s.guild, AuditLogEvent.StickerDelete, s.id);
  if (e) await handleNukeEvent(s.guild, e.executorId, 'sticker_delete', 'Sticker Deletion Spam', `Sticker "${s.name}" deleted`);
});

// Vanity URL — instant action, attempt revert, NO threshold
client.on('guildUpdate', async (oldGuild, newGuild) => {
  if (oldGuild.vanityURLCode === newGuild.vanityURLCode) return;
  const e = await fetchAuditEntry(newGuild, AuditLogEvent.GuildUpdate);
  if (!e || e.executorId === client.user.id) return;
  const cfg   = db.getGuildConfig(newGuild.id);
  if (cfg.antinuke_enabled === 0 || !db.isMonitorEnabled(newGuild.id, 'vanity_update')) return;
  const vanityFeatCfg = botDb.getGuildConfig(newGuild.id) || {};
  if (vanityFeatCfg.feat_vanity_guard === 0) return;
  const trust = db.getTrust(newGuild.id, e.executorId);
  if (trust && trust.level <= 1) return; // Only L1 immune to instant-action

  // Revert vanity immediately
  if (oldGuild.vanityURLCode) {
    await newGuild.setVanityCode(oldGuild.vanityURLCode, 'beni: Vanity URL reverted').catch(() => {});
  }
  const member = await newGuild.members.fetch(e.executorId).catch(() => null);
  if (member) await suspendUser(member, 'Vanity URL Changed', `${oldGuild.vanityURLCode || 'none'} → ${newGuild.vanityURLCode || 'none'}`);

  await sendLog(newGuild, securityEmbed(0xff0000,
    `🚨 ${member?.user?.username || e.executorId} changed the vanity URL!`,
    [
      ['Executor', `<@${e.executorId}> [${member?.user?.tag || e.executorId}]`],
      ['Change',   `\`${oldGuild.vanityURLCode || 'none'}\` → \`${newGuild.vanityURLCode || 'none'}\``],
    ],
    [
      ['Reverted',       '✅'],
      ['Action Applied', '✅ Suspended instantly']
    ]
  ));
});

// ── In-memory join tracker for raid detection ─────────────────────────────────
const _recentJoins = new Map(); // guildId → [timestamp, ...]

// ── Role Memory Restore on Rejoin + Raid Detection ───────────────────────────
client.on('guildMemberAdd', async member => {
  const gid = member.guild.id;

  // ── Raid Detection ─────────────────────────────────────────────────────────
  const raidCfg = db.getRaidConfig(gid);
  if (raidCfg.enabled) {
    if (!_recentJoins.has(gid)) _recentJoins.set(gid, []);
    const joins = _recentJoins.get(gid);
    joins.push(Date.now());
    // Prune old entries outside the window
    const cutoff = Date.now() - raidCfg.join_window;
    const fresh  = joins.filter(t => t > cutoff);
    _recentJoins.set(gid, fresh);

    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86400000;
    const isNewAccount   = accountAgeDays < raidCfg.min_age_days;
    const isJoinSpike    = fresh.length >= raidCfg.join_limit;

    if (isJoinSpike || (isNewAccount && fresh.length >= Math.ceil(raidCfg.join_limit / 2))) {
      const action = raidCfg.action;
      await sendLog(member.guild, securityEmbed(0xff4400,
        `🛡️ Raid Detected in ${member.guild.name}!`,
        [
          ['Trigger',      isJoinSpike ? `${fresh.length} joins in ${raidCfg.join_window / 1000}s` : `New account spike (${Math.floor(accountAgeDays)}d old)`],
          ['Latest Join',  `<@${member.id}> [${member.user.tag}]`],
          ['Account Age',  `${Math.floor(accountAgeDays)}d`],
          ['Action',       action === 'lockdown' ? 'Auto-lockdown triggered' : action === 'kick' ? 'Member kicked' : 'Alert only']
        ]
      ));

      if (action === 'kick') {
        await member.kick('beni: Raid detection').catch(() => {});
      } else if (action === 'lockdown') {
        // Lock all text channels for @everyone if not already locked
        const everyone = member.guild.roles.everyone;
        for (const [, ch] of member.guild.channels.cache) {
          if (!ch.permissionOverwrites) continue;
          await ch.permissionOverwrites.edit(everyone, { SendMessages: false, AddReactions: false },
            { reason: 'beni: Raid auto-lockdown' }).catch(() => {});
        }
      }
    }
  }

  // ── Role Memory Restore ────────────────────────────────────────────────────
  const rmRestoreCfg = botDb.getGuildConfig(gid) || {};
  if (rmRestoreCfg.feat_role_memory !== 0) {
    const data = db.getRoles(gid, member.id);
    if (data) {
      if (data.is_suspended) {
        const sr = member.guild.roles.cache.find(r => r.name === 'Suspended');
        if (sr) await member.roles.add(sr).catch(() => {});
      } else {
        const valid = data.roles.split(',').filter(id => id && member.guild.roles.cache.has(id));
        if (valid.length) await member.roles.add(valid).catch(() => {});
      }
    }
  }
});

// ── In-memory message rate tracker for dynamic slowmode ──────────────────────
const _msgRates = new Map(); // `${gid}:${cid}` → [timestamp, ...]
const SLOWMODE_SPIKE_LIMIT  = 12; // messages per 10s before slowmode activates
const SLOWMODE_SPIKE_WINDOW = 10000;
const SLOWMODE_DELAY_MAX    = 21600; // Discord max slowmode (6h in seconds)

// ── Evidence Locker — capture deleted messages ────────────────────────────────
client.on('messageDelete', async message => {
  if (!message.guild || !message.author || message.author.bot) return;
  if (!message.content && !message.attachments.size) return;
  const attachments = [...message.attachments.values()].map(a => ({ name: a.name, url: a.url }));
  db.addEvidence(
    message.guild.id, message.author.id, message.channel.id,
    message.id, message.content || '', attachments
  );
});

// ── @everyone protection + Shadow Ban + Watchlist + Slowmode + Counting ───────
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  // ── Shadow Ban — silently delete messages ──────────────────────────────────
  if (db.isShadowBanned(message.guild.id, message.author.id)) {
    await message.delete().catch(() => {});
    return; // no further processing
  }

  // ── Silent Watchlist Alert ─────────────────────────────────────────────────
  const watch = db.getWatchlist(message.guild.id, message.author.id);
  if (watch) {
    await sendLog(message.guild, securityEmbed(0xffa500,
      `👁️ Watched user active: ${message.author.username}`,
      [
        ['Member',  `<@${message.author.id}> [${message.author.tag}]`],
        ['Channel', `<#${message.channel.id}> [${message.channel.name}]`],
        ['Message', message.content?.slice(0, 200) || '*(attachment/embed)*'],
        ['Reason',  watch.reason || 'No reason']
      ],
      [['Watchlist', 'Silent alert — no action taken']]
    ));
  }

  // ── Dynamic Slowmode ───────────────────────────────────────────────────────
  const msgFeatCfg = botDb.getGuildConfig(message.guild.id) || {};
  const rateKey = `${message.guild.id}:${message.channel.id}`;
  if (!_msgRates.has(rateKey)) _msgRates.set(rateKey, []);
  const rates = _msgRates.get(rateKey);
  rates.push(Date.now());
  const freshRates = rates.filter(t => t > Date.now() - SLOWMODE_SPIKE_WINDOW);
  _msgRates.set(rateKey, freshRates);

  if (msgFeatCfg.feat_slowmode !== 0 && message.channel.rateLimitPerUser !== undefined) {
    const currentSlowmode = message.channel.rateLimitPerUser;
    if (freshRates.length >= SLOWMODE_SPIKE_LIMIT && currentSlowmode < 5) {
      await message.channel.setRateLimitPerUser(5, 'beni: Activity spike').catch(() => {});
    } else if (freshRates.length < 4 && currentSlowmode > 0) {
      await message.channel.setRateLimitPerUser(0, 'beni: Activity normalized').catch(() => {});
    }
  }

  // @everyone / @here — instant suspend (only L1 + owner-tier immune)
  if (message.mentions.everyone && msgFeatCfg.feat_everyone_protect !== 0) {
    const mb = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    const t  = mb ? effectiveTrust(mb) : -1;
    if (t !== 0 && t !== 1) {
      await message.delete().catch(() => {});
      if (mb) await suspendUser(mb, '@everyone / @here Abuse', `In #${message.channel.name}`);
      return;
    }
  }

  // Counting game
  const counting = db.getCounting(message.guild.id);
  if (!counting?.enabled || counting.channel_id !== message.channel.id) return;

  const num      = parseInt(message.content.trim());
  const type     = counting.count_type || 'normal';
  const expected = nextExpected(type, counting.current_count || 0);

  if (isNaN(num) || num !== expected) {
    await message.react('❌').catch(() => {});
    const prev = counting.current_count || 0;
    db.resetCount(message.guild.id);
    return message.channel.send(
      `❌ **${message.author.username}** ruined it at **${prev}**! Next expected: **${expected}**\n` +
      `Back to **0** — restart with **${nextExpected(type, 0)}** | 🏆 High score: **${counting.high_score || 0}**`
    );
  }
  if (counting.last_user_id === message.author.id) {
    await message.react('❌').catch(() => {});
    const prev = counting.current_count || 0;
    db.resetCount(message.guild.id);
    return message.channel.send(
      `❌ No counting twice in a row! Ruined at **${prev}**\nBack to **0** — restart with **${nextExpected(type, 0)}** | 🏆 High score: **${counting.high_score || 0}**`
    );
  }

  db.updateCount(message.guild.id, num, message.author.id);
  const newHigh = num > (counting.high_score || 0);

  // Milestone reactions/messages
  if (num % 100 === 0) {
    await message.react('💯').catch(() => {});
    await message.channel.send(`💯 **${message.author.username}** hit **${num}**! Incredible!`).catch(() => {});
  } else if (newHigh) {
    await message.react('🏆').catch(() => {});
    await message.channel.send(`🏆 **New high score: ${num}** by **${message.author.username}**!`).catch(() => {});
  } else {
    await message.react('✅').catch(() => {});
  }
});

// ── Starboard ─────────────────────────────────────────────────────────────────
// In-memory guard to prevent race-condition duplicate starboard posts
const starboardProcessing = new Set();

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) reaction = await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch { return; }

  if (!reaction.message.guild) return;
  const sb = db.getStarboard(reaction.message.guild.id);
  if (!sb?.enabled || !sb.channel_id) return;

  const emoji = sb.emoji || '⭐';
  if (reaction.emoji.name !== emoji && reaction.emoji.toString() !== emoji) return;
  if (reaction.count < sb.threshold) return;

  const sbKey = `${reaction.message.guild.id}_${reaction.message.id}`;
  if (starboardProcessing.has(sbKey)) return;
  if (db.getStarboardPost(reaction.message.guild.id, reaction.message.id)) return;
  starboardProcessing.add(sbKey);

  const sbCh = reaction.message.guild.channels.cache.get(sb.channel_id);
  if (!sbCh) return;

  const msg = reaction.message;
  if (!msg.author) return; // still partial somehow

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: msg.author?.tag || 'Unknown', iconURL: msg.author?.displayAvatarURL() })
    .setTimestamp(msg.createdAt)
    .addFields({ name: '📎 Source', value: `[Jump to message](${msg.url})` });

  // Text content
  if (msg.content) embed.setDescription(msg.content.slice(0, 2048));

  // Image attachment
  const imgAttach = msg.attachments.find(a => a.contentType?.startsWith('image/'));
  if (imgAttach) embed.setImage(imgAttach.url);

  // Video / other attachments
  const videoAttach = msg.attachments.find(a => a.contentType?.startsWith('video/'));
  const otherAttach = msg.attachments.filter(a => !a.contentType?.startsWith('image/') && !a.contentType?.startsWith('video/'));
  const files = [];
  let extraText = '';
  if (videoAttach) extraText += `🎬 [Video](${videoAttach.url})\n`;
  if (otherAttach.size) extraText += otherAttach.map(a => `📁 [${a.name}](${a.url})`).join('\n');

  // If original message had embeds (e.g. link preview), grab its image
  if (!imgAttach && msg.embeds.length > 0) {
    const firstEmbed = msg.embeds[0];
    if (firstEmbed.image) embed.setImage(firstEmbed.image.url);
    else if (firstEmbed.thumbnail) embed.setThumbnail(firstEmbed.thumbnail.url);
    if (!msg.content && firstEmbed.description) embed.setDescription(firstEmbed.description.slice(0, 2048));
  }

  if (extraText) embed.addFields({ name: '📂 Attachments', value: extraText.slice(0, 1024) });

  const sent = await sbCh.send({
    content: `${emoji} **${reaction.count}** in <#${msg.channelId}>`,
    embeds: [embed]
  }).catch(() => null);
  if (sent) db.saveStarboardPost(reaction.message.guild.id, msg.id, sent.id);
  starboardProcessing.delete(sbKey);
});

// ── Snapshot (every 6h) ───────────────────────────────────────────────────────
async function takeSnapshots() {
  for (const guild of client.guilds.cache.values()) {
    const data = {
      timestamp: Date.now(),
      channels: guild.channels.cache.map(c => ({
        id: c.id, name: c.name, type: c.type, parentId: c.parentId || null,
        permissionOverwrites: c.permissionOverwrites?.cache.map(o => ({
          id: o.id, type: o.type,
          allow: o.allow.bitfield.toString(),
          deny:  o.deny.bitfield.toString()
        })) || []
      })),
      roles: guild.roles.cache.map(r => ({
        id: r.id, name: r.name, color: r.color, hoist: r.hoist,
        permissions: r.permissions.bitfield.toString(),
        position: r.position, mentionable: r.mentionable
      }))
    };
    db.saveSnapshot(guild.id, data);
    // Keep Suspended role channel overwrites in sync
    await applySuspendedRoleOverwrites(guild);
  }
}
setInterval(takeSnapshots, 6 * 60 * 60 * 1000);

// ── Auto-Unsuspend timer ──────────────────────────────────────────────────────
async function doUnsuspend(guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const data = db.getRoles(guildId, userId);
  if (!data) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const valid = data.roles.split(',').filter(id => id && guild.roles.cache.has(id));
    const sr = guild.roles.cache.find(r => r.name === 'Suspended');
    if (sr) await member.roles.remove(sr).catch(() => {});
    if (valid.length) await member.roles.add(valid).catch(() => {});

    // For bots: restore managed role permissions that were zeroed on suspend
    if (member.user.bot) {
      const saved = db.getBotManagedPerms(guildId, userId);
      await Promise.all(saved.map(async row => {
        const role = guild.roles.cache.get(row.role_id);
        if (role) await role.setPermissions(BigInt(row.permissions), 'beni: Bot unsuspended — restoring perms').catch(() => {});
      }));
      db.clearBotManagedPerms(guildId, userId);
    }
  }
  db.clearRoles(guildId, userId);
  db.deleteSuspensionTimer(guildId, userId);
  await sendLog(guild, securityEmbed(0x2ecc71,
    `✅ ${member?.user?.username || userId} has been auto-unsuspended!`,
    [
      ['Member',  `<@${userId}>`],
      ['Reason',  'Suspension timer expired'],
    ],
    [
      ['Roles Restored', member ? `✅ (${(data.roles.split(',').filter(Boolean)).length} roles)` : '❌ (user left)'],
      ['Action',         'Automatic']
    ]
  ));
}
function scheduleUnsuspend(guildId, userId, ms) {
  const MAX = 2_000_000_000;
  if (ms > MAX) setTimeout(() => scheduleUnsuspend(guildId, userId, ms - MAX), MAX);
  else          setTimeout(() => doUnsuspend(guildId, userId), ms);
}

// ═══════════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════

const MAGIC8 = [
  'It is certain.','Without a doubt.','Yes, definitely.','Most likely.',
  'Outlook good.','Signs point to yes.','Reply hazy, try again.',
  "Don't count on it.",'My sources say no.','Very doubtful.',
  'Cannot predict now.','Ask again later.'
];

// ─── Help pages ───────────────────────────────────────────────────────────────
function buildHelpPages() {
  return [
    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ beni — Page 1/5: Moderation')
      .addFields(
        { name: '/warn @user [reason]',           value: 'Issue a warning (creates case + modlog)' },
        { name: '/ban @user [reason]',             value: 'Ban a member from the server' },
        { name: '/unban <user_id> [reason]',       value: 'Unban by user ID' },
        { name: '/kick @user [reason]',            value: 'Kick a member' },
        { name: '/mute @user [duration] [reason]', value: 'Timeout — e.g. `10m` `1h` `28d`' },
        { name: '/unmute @user',                   value: 'Remove timeout' },
        { name: '/suspend @user [dur] [reason]',   value: 'Strip all roles (optional auto-expire)' },
        { name: '/unsuspend @user',                value: "Restore suspended user's roles" },
        { name: '/lockdown [reason]',              value: 'Lock all text channels (saves exact overwrites)' },
        { name: '/unlockdown',                     value: 'Restore channels to exact pre-lockdown state' },
        { name: '/purge <amount> [@user]',         value: 'Bulk-delete up to 100 messages (<14 days old)' },
        { name: '/shadow-ban @user [reason]',      value: 'Silently delete all messages from a user' },
        { name: '/shadow-unban @user',             value: 'Remove shadow ban' },
        { name: '/cases view [id|@user]',          value: 'View a case or list all cases for a user' },
        { name: '/cases modify <id> <field> <val>',value: 'Edit a case reason or duration (Admin)' },
        { name: '/notes add|remove|view|modify|delall', value: 'Manage staff notes on users (modify = edit content, Admin)' },
        { name: '/setlogs #channel [type]',        value: 'Unified log setup — `both` (default), `cases` only, or `security` only (Admin)' }
      ).setFooter({ text: 'Page 1/5 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ beni — Page 2/5: Anti-Nuke & Security')
      .addFields(
        { name: '/config [type] [limit] [time]', value: 'Set anti-nuke thresholds — e.g. `3 / 10s`' },
        { name: '/setlogs #channel [type]',      value: 'Set log channel — cases / security / both (Admin)' },
        { name: '/setup-suspend',                value: 'Create Suspended role + deny overwrites on all channels' },
        { name: '/antinuke enable|disable|status', value: 'Toggle or view all monitors + thresholds' },
        { name: '/autofeatures enable|disable|status', value: 'Toggle individual auto-features: webhook-block, perm-guard, vanity, @everyone, role-memory, auto-revert, slowmode (Admin)' },
        { name: '/trust add|remove|list',        value: 'L1=Fully Immune  L2=Nuke-Immune  L3=Permit' },
        { name: '/suspend @user [dur]',          value: 'Manually suspend (works on users AND bots)' },
        { name: '/scan',                         value: 'Audit bots + check native AutoMod status' }
      )
      .addFields({ name: '⚡ Auto-Features', value:
        '• **Webhook block** — deleted instantly, suspend on spam\n' +
        '• **Role perm guard** — dangerous grants reverted + instant suspend\n' +
        '• **Vanity URL guard** — instant revert + suspend\n' +
        '• **@everyone protection** — instant suspend\n' +
        '• **Role memory** — save/restore on leave/rejoin\n' +
        '• **Auto-revert** — deleted channels/roles rebuilt from snapshot on nuke\n' +
        '• **Dynamic slowmode** — auto-adjusts on message spikes\n' +
        '• **Raid detection** — join spike → lockdown/kick/alert'
      }).setFooter({ text: 'Page 2/5 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ beni — Page 3/4: Snapshots & Revert')
      .addFields(
        { name: '/snapshot',         value: 'View last saved server state (channels, roles, count)' },
        { name: '/revert channels',  value: 'Restore missing channels + permission overwrites' },
        { name: '/revert roles',     value: 'Restore missing roles + permissions' },
        { name: '/revert all',       value: 'Restore both channels and roles at once' }
      )
      .addFields({ name: '🕒 Snapshot Schedule', value: 'Saved on startup + every 6 hours automatically' })
      .addFields({ name: '🤝 Trust Levels', value:
        '**L1 (Owner)** — Fully immune, bypasses everything\n' +
        '**L2 (Trustee)** — Immune to anti-nuke suspension\n' +
        '**L3 (Permit)** — Bypasses Discord permission checks for mod commands (ban/kick/mute/suspend)\n' +
        '**Bot-Owner tier** — Administrator + role above bot = owner access\n' +
        '*All trusted users are immune to @everyone suspend*'
      }).setFooter({ text: 'Page 3/5 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ beni — Page 4/5: Intelligence Systems')
      .addFields(
        { name: '/watchlist add|remove|list',     value: 'Silent watchlist — alerts staff when watched user sends a message' },
        { name: '/evidence view|clear [@user]',   value: 'View deleted messages stored in the evidence locker' },
        { name: '/shadow-ban [@user] [reason]',   value: 'Shadow-ban — messages silently deleted, user unaware' },
        { name: '/shadow-unban [@user]',          value: 'Lift a shadow-ban' },
        { name: '/staff-log [mod]',               value: 'View recent mod actions — filter by specific moderator' },
        { name: '/raid-config set|disable|status', value: 'Configure join-spike raid detection (limit, window, action)' }
      )
      .addFields({ name: '🤖 Auto Intelligence', value:
        '• **Evidence Locker** — every deleted message is captured automatically\n' +
        '• **Watchlist alerts** — silent log-channel pings when a watched user is active\n' +
        '• **Shadow ban** — user continues posting, nobody else sees it\n' +
        '• **Raid detection** — join spikes or fresh-account waves trigger lockdown/kick/alert\n' +
        '• **Dynamic slowmode** — spikes (12 msg/10s) auto-set 5s delay; clears when quiet'
      }).setFooter({ text: 'Page 4/5 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ beni — Page 5/5: Fun & Features')
      .addFields(
        { name: '/ask [question]',               value: '🎱 Magic 8-Ball' },
        { name: '/say [message]',                value: 'Send a message as the bot (DMs & User App supported)' },
        { name: '/counting-toggle [#ch] [type]', value: 'Enable/disable counting — types: normal, even, odd, fibonacci, prime' },
        { name: '/starboard-enable [#ch] [n] [emoji]', value: 'Enable starboard (default: 3 ⭐, handles images/video/embeds)' },
        { name: '/starboard-disable',            value: 'Disable starboard' }
      )
      .addFields({ name: '⏱️ Duration Format', value: '`10s` · `5m` · `2h` · `1d` · `1w` — used in /mute /suspend /config' })
      .setFooter({ text: 'Page 5/5 • beni Security Engine' })
  ];
}

function buildHelpRow(currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help_prev').setLabel('◀ Back').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
    new ButtonBuilder().setCustomId('help_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(currentPage === totalPages - 1)
  );
}

client.on('interactionCreate', async interaction => {
  // ── Button: Help navigation ───────────────────────────────────────
  if (interaction.isButton() && (interaction.customId === 'help_prev' || interaction.customId === 'help_next')) {
    const pages   = buildHelpPages();
    const embed   = interaction.message.embeds[0];
    const match   = embed?.footer?.text?.match(/Page (\d+)\//);
    let page      = match ? parseInt(match[1]) - 1 : 0;
    if (interaction.customId === 'help_prev') page = Math.max(0, page - 1);
    else page = Math.min(pages.length - 1, page + 1);
    return interaction.update({ embeds: [pages[page]], components: [buildHelpRow(page, pages.length)] });
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName: cn, options: o } = interaction;

  // ── /say ───────────────────────────────────────────────────────────
  if (cn === 'say') {
    const text = o.getString('message');
    if (interaction.guildId) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You need **Manage Server** permission.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await interaction.channel?.send(text).catch(() => {});
      await interaction.deleteReply().catch(() => {});
    } else {
      // In DM / User App — reply directly (no ephemeral, no channel.send)
      await interaction.reply({ content: text });
    }
    return;
  }

  // ── /ask ───────────────────────────────────────────────────────────
  if (cn === 'ask') {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('🎱 Magic 8-Ball')
      .addFields({ name: '❓ Question', value: o.getString('question') },
                 { name: '🔮 Answer',   value: `**${MAGIC8[Math.floor(Math.random() * MAGIC8.length)]}**` })] });
  }

  if (!interaction.guild) return interaction.reply({ content: '❌ Server only.', ephemeral: true });
  const { guild: g, member: m } = interaction;

  try {

    // ── /ban ──────────────────────────────────────────────────────────
    if (cn === 'ban') {
      if (!hasBotPerm(m, PermissionFlagsBits.BanMembers))
        return interaction.reply({ content: '❌ You need Ban Members permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'No reason.';
      const dmUser   = o.getBoolean('dm');
      const proofAtt = o.getAttachment('proof');
      const proofUrl = proofAtt?.url || null;
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Cannot ban this user (insufficient hierarchy).', ephemeral: true });
      if (dmUser) await user.send({ embeds: [buildDmEmbed('ban', g.name, reason, proofUrl)] }).catch(() => {});
      await target.ban({ reason });
      db.logStaffAction(g.id, m.id, 'ban', user.id, reason);
      const banCaseId   = botDb.createCaseWithEvidence(g.id, user.id, m.id, 'ban', reason, null, proofUrl);
      const banCaseData = botDb.getCase(g.id, banCaseId);
      sendModlog(g, buildCaseEmbed(banCaseData, user, m.user), botDb);
      return interaction.reply({ embeds: [buildResultEmbed('ban', reason, m.user, user)] });
    }

    // ── /unban ────────────────────────────────────────────────────────
    if (cn === 'unban') {
      if (!hasBotPerm(m, PermissionFlagsBits.BanMembers))
        return interaction.reply({ content: '❌ You need Ban Members permission.', ephemeral: true });
      const uid = o.getString('user_id'), reason = o.getString('reason') || 'No reason.';
      await g.members.unban(uid, reason).catch(() => null);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Unbanned')
        .setDescription(`User \`${uid}\` unbanned.\n**Reason:** ${reason}`).setTimestamp()] });
    }

    // ── /kick ─────────────────────────────────────────────────────────
    if (cn === 'kick') {
      if (!hasBotPerm(m, PermissionFlagsBits.KickMembers))
        return interaction.reply({ content: '❌ You need Kick Members permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'No reason.';
      const dmUser   = o.getBoolean('dm');
      const proofAtt = o.getAttachment('proof');
      const proofUrl = proofAtt?.url || null;
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
      if (dmUser) await user.send({ embeds: [buildDmEmbed('kick', g.name, reason, proofUrl)] }).catch(() => {});
      await target.kick(reason);
      db.logStaffAction(g.id, m.id, 'kick', user.id, reason);
      const kickCaseId   = botDb.createCaseWithEvidence(g.id, user.id, m.id, 'kick', reason, null, proofUrl);
      const kickCaseData = botDb.getCase(g.id, kickCaseId);
      sendModlog(g, buildCaseEmbed(kickCaseData, user, m.user), botDb);
      return interaction.reply({ embeds: [buildResultEmbed('kick', reason, m.user, user)] });
    }

    // ── /mute ─────────────────────────────────────────────────────────
    if (cn === 'mute') {
      if (!hasBotPerm(m, PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user = o.getUser('user'), durRaw = o.getString('duration') || '10m', reason = o.getString('reason') || 'No reason.';
      const dmUser   = o.getBoolean('dm');
      const proofAtt = o.getAttachment('proof');
      const proofUrl = proofAtt?.url || null;
      const durMs = parseDuration(durRaw);
      if (!durMs) return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `1d`.', ephemeral: true });
      if (durMs > 2419200000) return interaction.reply({ content: '❌ Max mute is 28 days.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const durFmt = formatDuration(durMs);
      if (dmUser) await user.send({ embeds: [buildDmEmbed('mute', g.name, reason, proofUrl, durFmt)] }).catch(() => {});
      await target.timeout(durMs, reason);
      db.logStaffAction(g.id, m.id, 'mute', user.id, `${durFmt} — ${reason}`);
      const muteCaseId   = botDb.createCaseWithEvidence(g.id, user.id, m.id, 'mute', reason, durFmt, proofUrl);
      const muteCaseData = botDb.getCase(g.id, muteCaseId);
      sendModlog(g, buildCaseEmbed(muteCaseData, user, m.user), botDb);
      return interaction.reply({ embeds: [buildResultEmbed('mute', reason, m.user, user, { duration: durFmt })] });
    }

    // ── /unmute ───────────────────────────────────────────────────────
    if (cn === 'unmute') {
      if (!hasBotPerm(m, PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user = o.getUser('user');
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await target.timeout(null);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🔊 Unmuted')
        .setDescription(`**${user.tag}** has been unmuted.`).setTimestamp()] });
    }

    // ── /counting-toggle ──────────────────────────────────────────────
    if (cn === 'counting-toggle') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ content: '❌ You need Manage Channels.', ephemeral: true });
      const ch      = o.getChannel('channel');
      const type    = o.getString('type') || 'normal';
      const existing = db.getCounting(g.id);
      const newState = !(existing?.enabled);
      db.setCounting(g.id, ch.id, newState, type);
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(newState ? 0x2ecc71 : 0xe74c3c)
        .setTitle(`🔢 Counting ${newState ? 'Enabled' : 'Disabled'}`)
        .addFields(
          { name: '📌 Channel',    value: `${ch}`, inline: true },
          { name: '🔢 Type',       value: TYPE_LABELS[type] || type, inline: true },
          { name: '🏆 High Score', value: `${existing?.high_score || 0}`, inline: true },
          { name: '📋 How it works', value: newState
            ? `Count **${TYPE_LABELS[type]}**. React ✅ for correct, ❌ for wrong.\n` +
              `• 💯 on multiples of 100\n• 🏆 when new high score\n• Can't count twice in a row!`
            : 'Counting disabled.' }
        ).setTimestamp()] });
    }

    // ── /starboard-enable ─────────────────────────────────────────────
    if (cn === 'starboard-enable') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You need Manage Server.', ephemeral: true });
      const ch = o.getChannel('channel'), threshold = o.getInteger('threshold') || 3, emoji = o.getString('emoji') || '⭐';
      db.setStarboard(g.id, ch.id, true, threshold, emoji);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle(`${emoji} Starboard Enabled`)
        .addFields({ name: 'Channel', value: `${ch}`, inline: true },
                   { name: 'Threshold', value: `${threshold} ${emoji}`, inline: true },
                   { name: 'Supports', value: 'Images · Videos (link) · Embeds · Text', inline: false })
        .setTimestamp()] });
    }

    // ── /starboard-disable ────────────────────────────────────────────
    if (cn === 'starboard-disable') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You need Manage Server.', ephemeral: true });
      db.disableStarboard(g.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('⭐ Starboard Disabled')
        .setDescription('Starboard turned off.').setTimestamp()] });
    }

    // ── /lockdown ─────────────────────────────────────────────────────
    if (cn === 'lockdown') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ content: '❌ You need Manage Channels.', ephemeral: true });
      await interaction.deferReply();
      const reason   = o.getString('reason') || 'Security lockdown';
      const everyone = g.roles.everyone;
      let locked = 0;
      for (const [, ch] of g.channels.cache) {
        if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) continue;
        // Save ALL current overwrites for this channel (exact restore)
        const allOverwrites = ch.permissionOverwrites.cache.map(ow => ({
          id: ow.id, type: ow.type,
          allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString()
        }));
        db.saveLockdownBackup(g.id, ch.id, JSON.stringify(allOverwrites));
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false, AddReactions: false }, { reason }).catch(() => {});
        locked++;
      }
      await sendLog(g, new EmbedBuilder().setColor(0xff0000).setTitle('🔒 Server Lockdown Active')
        .addFields({ name: 'Reason', value: reason }, { name: 'Channels Locked', value: `${locked}` })
        .setTimestamp().setFooter({ text: `By ${m.user.tag}` }));
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('🔒 Server Locked Down')
        .setDescription(`**${locked}** channels locked.\n**Reason:** ${reason}\n\nUse \`/unlockdown\` to restore all permissions exactly.`)
        .setTimestamp()] });
    }

    // ── /unlockdown ───────────────────────────────────────────────────
    if (cn === 'unlockdown') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ content: '❌ You need Manage Channels.', ephemeral: true });
      await interaction.deferReply();
      const backups = db.getLockdownBackups(g.id);
      if (!backups.length) return interaction.editReply({ content: '❌ No lockdown backup found. Was /lockdown run?' });
      let restored = 0;
      for (const row of backups) {
        const ch = g.channels.cache.get(row.channel_id);
        if (!ch) continue;
        const savedOverwrites = JSON.parse(row.perms_json);
        // Fully restore ALL overwrites to exact pre-lockdown state
        await ch.permissionOverwrites.set(
          savedOverwrites.map(ow => ({ id: ow.id, type: ow.type, allow: BigInt(ow.allow), deny: BigInt(ow.deny) })),
          'beni: Lockdown lifted — exact restore'
        ).catch(e => console.error(`Restore ${ch.name}:`, e.message));
        restored++;
      }
      db.clearLockdownBackup(g.id);
      await sendLog(g, new EmbedBuilder().setColor(0x2ecc71).setTitle('🔓 Lockdown Lifted')
        .addFields({ name: 'Channels Restored', value: `${restored}` })
        .setTimestamp().setFooter({ text: `By ${m.user.tag}` }));
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🔓 Lockdown Lifted')
        .setDescription(`**${restored}** channels fully restored to their exact pre-lockdown state.`).setTimestamp()] });
    }

    // ── /antinuke ─────────────────────────────────────────────────────
    if (cn === 'antinuke') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const sub = o.getSubcommand();
      if (sub === 'enable') {
        db.setAntinuke(g.id, 1);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71)
          .setTitle('✅ Anti-Nuke Enabled').setDescription('All monitors are now active.').setTimestamp()] });
      }
      if (sub === 'disable') {
        db.setAntinuke(g.id, 0);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c)
          .setTitle('⛔ Anti-Nuke Disabled')
          .setDescription('⚠️ All monitors are now off. Re-enable with `/antinuke enable`.').setTimestamp()] });
      }
      if (sub === 'status') {
        const cfg        = db.getGuildConfig(g.id);
        const thresholds = db.getAllThresholds(g.id);
        const masterOn   = cfg.antinuke_enabled !== 0;
        // System is effectively enabled only if master flag on AND at least one monitor active
        const anyOn      = thresholds.length === 0
          ? masterOn  // no rows = all default to on, so effective state = masterOn
          : thresholds.some(t => t.enabled !== 0);
        const enabled    = masterOn && anyOn;
        const lines = MONITOR_TYPES.map(mt => {
          const t       = thresholds.find(x => x.event_type === mt.value) || { limit_count: 3, time_window: 10000, enabled: 1 };
          // Show as off if master is disabled, regardless of individual setting
          const on      = masterOn && t.enabled !== 0;
          const special = mt.value === 'webhook_create' ? ' ⚡delete+suspend' : '';
          return `${on ? '🟢' : '🔴'} \`${mt.value.padEnd(16)}\` ${on ? `${t.limit_count} / ${formatDuration(t.time_window)}${special}` : 'disabled'}`;
        }).join('\n');
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(enabled ? 0x2ecc71 : 0xe74c3c)
          .setTitle(`🛡️ Anti-Nuke — ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`)
          .setDescription(!masterOn ? '⚠️ Master switch is **OFF** — all monitors are inactive. Use `/antinuke enable` to activate.' : null)
          .addFields({ name: '⚙️ Monitor Thresholds', value: lines })
          .addFields({ name: '⚡ Instant-Action (no threshold)', value: '• Vanity URL change → revert + suspend\n• Webhook create → deleted + suspend\n• Dangerous permission grant → revert + suspend\n• @everyone abuse → suspend' })
          .setFooter({ text: 'Change thresholds: /config | Toggle monitors: /config <type> enabled:on/off' })
          .setTimestamp()] });
      }
    }

    // ── /config ───────────────────────────────────────────────────────
    if (cn === 'config') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const type      = o.getString('type');
      const limit     = o.getInteger('limit');
      const timeInput = o.getString('time');
      const enableOpt = o.getString('enabled'); // 'on' | 'off' | null

      // Toggle only — no threshold change
      if (enableOpt && !limit && !timeInput) {
        const val = enableOpt === 'on' ? 1 : 0;
        db.setMonitorEnabled(g.id, type, val);
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(val ? 0x2ecc71 : 0xe74c3c)
          .setTitle(`${val ? '✅ Monitor Enabled' : '⛔ Monitor Disabled'}`)
          .addFields({ name: '📌 Monitor', value: `\`${type}\``, inline: true },
                     { name: '📋 Status',  value: val ? 'Active' : 'Inactive', inline: true })
          .setFooter({ text: 'Threshold unchanged • Use /antinuke status to view all' })
          .setTimestamp()] });
      }

      // Threshold update (optionally with enable toggle)
      if (!limit || !timeInput)
        return interaction.reply({ content: '❌ Provide both `limit` and `time` to update the threshold, or just `enabled` to toggle.', ephemeral: true });
      const windowMs = parseDuration(timeInput);
      if (!windowMs || windowMs < 1000)
        return interaction.reply({ content: '❌ Invalid time. Use: `10s`, `5m`, `2h`, `1d`, `1w`', ephemeral: true });
      db.setThreshold(g.id, type, limit, windowMs);
      if (enableOpt) db.setMonitorEnabled(g.id, type, enableOpt === 'on' ? 1 : 0);
      const nowEnabled = db.isMonitorEnabled(g.id, type);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Monitor Configured')
        .addFields(
          { name: '📌 Event',    value: `\`${type}\``,                    inline: true },
          { name: '🔢 Limit',    value: `${limit} actions`,               inline: true },
          { name: '⏱️ Window',   value: `\`${formatDuration(windowMs)}\``, inline: true },
          { name: '💡 Status',   value: nowEnabled ? '✅ Active' : '⛔ Disabled', inline: true }
        ).setFooter({ text: 'Formats: 10s • 5m • 2h • 1d • 1w' }).setTimestamp()] });
    }

    // ── /setlogs ──────────────────────────────────────────────────────
    if (cn === 'setlogs') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const ch   = o.getChannel('channel');
      const type = o.getString('type') || 'both';

      if (type === 'cases' || type === 'both') {
        botDb.setModlogChannel(g.id, ch.id);
      }
      if (type === 'security' || type === 'both') {
        db.setLogChannel(g.id, ch.id);
        botDb.setLogChannel(g.id, ch.id);
      }

      const DESC = {
        cases:    `📋 **Case logs** (warn/ban/kick/mute/suspend/shadow-ban) → ${ch}`,
        security: `🛡️ **Security logs** (anti-nuke, joins/leaves, role changes, alerts) → ${ch}`,
        both:     `📋 **Case logs** + 🛡️ **Security logs** → ${ch}`,
      };
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2)
        .setTitle('✅ Log Channel Configured')
        .setDescription(DESC[type])
        .addFields({ name: 'Channel', value: `${ch}`, inline: true }, { name: 'Type', value: type, inline: true })
        .setFooter({ text: 'Use /setlogs again with a different type to split channels' })
        .setTimestamp()] });
    }

    // ── /setup (legacy alias for /setlogs security) ───────────────────
    if (cn === 'setup') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const ch = o.getChannel('channel');
      db.setLogChannel(g.id, ch.id);
      botDb.setLogChannel(g.id, ch.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📋 Security Log Channel Set')
        .setDescription(`Security & bot logs → ${ch}\n\n💡 Use \`/setlogs\` for full dual-channel control.`).setTimestamp()] });
    }

    // ── /setup-suspend ────────────────────────────────────────────────
    if (cn === 'setup-suspend') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });

      await interaction.deferReply();

      const customRole    = o.getRole('role');
      const jailChannel   = o.getChannel('channel');

      // 1. Resolve suspend role — use custom if provided, otherwise find/create "Suspended"
      let sr;
      let roleStatus;
      if (customRole) {
        sr = customRole;
        roleStatus = `Using provided role ${customRole} \`[${customRole.id}]\``;
      } else {
        sr = g.roles.cache.find(r => r.name === 'Suspended');
        const roleCreated = !sr;
        if (!sr) {
          sr = await g.roles.create({
            name: 'Suspended', permissions: [], color: 0x808080,
            reason: 'beni: Suspended role setup'
          }).catch(() => null);
        }
        if (!sr) return interaction.editReply({ content: '❌ Failed to create the Suspended role. Make sure the bot has **Manage Roles**.' });
        roleStatus = roleCreated ? `Created new \`Suspended\` role (${sr})` : `Using existing \`Suspended\` role (${sr})`;
      }

      // 2. Save config to DB so /suspend and auto-suspend use the right role + jail
      db.setSuspendConfig(g.id, {
        roleId:    sr.id,
        channelId: jailChannel ? jailChannel.id : null
      });

      // 3. Apply channel overwrites: SUSPEND_DENY everywhere, JAIL_OVERWRITE on jail
      const channels = [...g.channels.cache.values()].filter(c => c.permissionOverwrites);
      const results  = await Promise.allSettled(
        channels.map(c => {
          const overwrite = (jailChannel && c.id === jailChannel.id) ? JAIL_OVERWRITE : SUSPEND_DENY;
          return c.permissionOverwrites.edit(sr, overwrite, { reason: 'beni: setup-suspend' });
        })
      );
      const ok     = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔒 Suspend System Configured')
        .addFields(
          { name: '🎭 Suspend Role',     value: roleStatus, inline: false },
          { name: '🔒 Jail Channel',     value: jailChannel
              ? `${jailChannel} — suspended users can **see + send** here, history disabled`
              : 'None — suspended users silenced in all channels', inline: false },
          { name: '✅ Channels Updated', value: `${ok} channel${ok !== 1 ? 's' : ''} configured`, inline: true },
          { name: failed ? '⚠️ Skipped' : '📋 Skipped', value: failed ? `${failed} (no overwrite perm)` : 'None', inline: true },
          { name: '📌 What This Does', value:
            `• **All channels** — Suspended role: no Send, no Reactions, no Attach, no Speak/Connect\n` +
            (jailChannel ? `• **${jailChannel.name}** — Suspended role: ✅ View + Send, ❌ Read History + everything else\n` : '') +
            '• Config saved — every future `/suspend` uses this setup automatically', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'beni Security Engine' });

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /trust ────────────────────────────────────────────────────────
    if (cn === 'trust') {
      if (g.ownerId !== m.id)
        return interaction.reply({ content: '❌ Server Owner only.', ephemeral: true });
      const sub = o.getSubcommand();
      const LEVEL_DESC = {
        1: '**L1 — Owner/Fully Immune**\nBypasses ALL checks (anti-nuke, @everyone, mod commands). Can do anything the bot can stop.',
        2: '**L2 — Trustee/Nuke-Immune**\nImmune to anti-nuke suspension & @everyone suspend. Not flagged by monitors.',
        3: '**L3 — Permit/Mod**\nBypasses Discord permission checks for mod commands (ban, kick, mute, suspend/unsuspend). Still monitored by anti-nuke.'
      };
      if (sub === 'add') {
        const user = o.getUser('user'), level = o.getInteger('level');
        db.addTrust(g.id, user.id, level);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🤝 Trust Granted')
          .setThumbnail(user.displayAvatarURL())
          .setDescription(`**${user.tag}** — ${LEVEL_DESC[level]}`)
          .setTimestamp()] });
      }
      if (sub === 'remove') {
        const user = o.getUser('user');
        db.removeTrust(g.id, user.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🚫 Trust Removed')
          .setDescription(`Removed trust from **${user.tag}**`).setTimestamp()] });
      }
      if (sub === 'list') {
        const list = db.listTrust(g.id);
        const labels = { 1: 'L1 Owner/Immune', 2: 'L2 Trustee/Nuke-Immune', 3: 'L3 Permit/Mod' };
        const desc = list.length ? list.map(t => `<@${t.user_id}> — **${labels[t.level] || `L${t.level}`}**`).join('\n') : 'No trusted users set.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🤝 Trusted Users')
          .setDescription(desc)
          .addFields({ name: '📋 Level Summary', value:
            'L1 = Bypass everything\nL2 = Skip anti-nuke\nL3 = Mod without Discord perms\n**Also:** Users with roles above the bot + Administrator = bot-owner access' })
          .setTimestamp()] });
      }
    }

    // ── /suspend ──────────────────────────────────────────────────────
    if (cn === 'suspend') {
      // ── Permission gate (ManageRoles OR Admin; sync — before any defer) ───────
      const offenderTrust = effectiveTrust(m);
      const hasSuspendPerm = offenderTrust !== -1
        || m.permissions.has(PermissionFlagsBits.ManageRoles)
        || m.permissions.has(PermissionFlagsBits.Administrator);
      if (!hasSuspendPerm)
        return interaction.reply({ content: '❌ You need **Manage Roles** or **Administrator** to use this.', ephemeral: true });

      const user     = o.getUser('user');
      const reason   = o.getString('reason') || 'Manual suspension';
      const durRaw   = o.getString('duration');
      const durMs    = durRaw ? parseDuration(durRaw) : null;
      const dmUser   = o.getBoolean('dm');
      const proofAtt = o.getAttachment('proof');
      const proofUrl = proofAtt?.url || null;
      if (durRaw && !durMs)
        return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `1d`.', ephemeral: true });

      // Defer NOW — all remaining checks are async and editReply will be used
      await interaction.deferReply();

      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.editReply({ content: '❌ User not found.' });

      if (target.id === g.ownerId)
        return interaction.editReply({ content: '❌ Cannot suspend the server owner.' });

      const targetTrust = effectiveTrust(target);
      if (targetTrust === 0 || targetTrust === 1)
        return interaction.editReply({ content: '❌ Cannot suspend this user — they are fully protected.' });

      // ── Hierarchy check: targeting equal/higher role → double suspend ────────
      if (offenderTrust === -1 && target.roles.highest.position >= m.roles.highest.position) {
        // suspendUser handles channel overwrites for both
        await Promise.all([
          suspendUser(target, `Hierarchy violation by ${m.user.tag}`, `${m.user.tag} tried to suspend them`),
          suspendUser(m, 'Abused /suspend against equal/higher rank', `Targeted: ${target.user.tag}`, true)
        ]);
        return interaction.editReply({ content: `⚠️ **Hierarchy violation.** You cannot suspend someone equal or higher rank. **Both you and ${user.tag} have been suspended.**` });
      }

      // ── Normal suspension path ────────────────────────────────────────────────
      // Resolve suspend role from DB config, then fall back to find/create
      const suspCfg     = db.getSuspendConfig(g.id);
      const jailChanId  = suspCfg.jail_channel_id || null;
      let sr = suspCfg.suspend_role_id
        ? (g.roles.cache.get(suspCfg.suspend_role_id) || g.roles.cache.find(r => r.name === 'Suspended'))
        : g.roles.cache.find(r => r.name === 'Suspended');
      if (!sr) {
        sr = await g.roles.create({ name: 'Suspended', permissions: [], color: 0x000000, reason: 'beni: Suspended role' }).catch(() => null);
      }
      if (!sr) return interaction.editReply({ content: '❌ Could not create Suspended role. Check bot permissions.' });

      // Apply overwrites: deny all channels, jail channel gets limited allow
      await applySuspendedOverwrites(g, sr, jailChanId);

      // Save non-managed roles (fresh save)
      const roles = target.roles.cache
        .filter(r => !r.managed && r.id !== g.id && r.name !== 'Suspended')
        .map(r => r.id);
      db.saveRoles(g.id, user.id, roles.join(','), 1);

      // Strip non-managed roles and add Suspended (parallel, safe for bots)
      await Promise.all([
        roles.length ? target.roles.remove(roles, `beni: ${reason}`).catch(() => {}) : Promise.resolve(),
        target.roles.add(sr, `beni: ${reason}`).catch(() => {})
      ]);

      // For bots: zero out managed role permissions and save for restore on unsuspend
      if (target.user.bot) {
        const managedRoles = [...target.roles.cache.values()].filter(r => r.managed && r.permissions.bitfield !== 0n);
        await Promise.all(managedRoles.map(async r => {
          db.saveBotManagedPerm(g.id, user.id, r.id, r.permissions.bitfield.toString());
          await r.setPermissions(0n, `beni: Bot suspended — ${reason}`).catch(() => {});
        }));
      }

      let expireText = 'Permanent';
      if (durMs) {
        const expiresAt = Date.now() + durMs;
        db.setSuspensionTimer(g.id, user.id, expiresAt);
        expireText = `<t:${Math.floor(expiresAt / 1000)}:R>`;
        scheduleUnsuspend(g.id, user.id, durMs);
      }

      if (dmUser) await user.send({ embeds: [buildDmEmbed('suspend', g.name, reason, proofUrl, durMs ? expireText : null)] }).catch(() => {});
      db.logStaffAction(g.id, m.id, 'suspend', user.id, reason);
      const suspCaseId   = botDb.createCaseWithEvidence(g.id, user.id, m.id, 'suspend', reason, durMs ? expireText : null, proofUrl);
      const suspCaseData = botDb.getCase(g.id, suspCaseId);
      sendModlog(g, buildCaseEmbed(suspCaseData, user, m.user), botDb);
      await sendLog(g, securityEmbed(0xff0000,
        `⛔ ${target.user.username} has been suspended!`,
        [
          ['Reason',   reason],
          ['Member',   `<@${user.id}> [${user.tag}]`],
          ['Duration', expireText],
        ],
        [
          ['Moderator',      `${m.user.tag}`],
          ['Action Applied', '✅'],
          ['Role Cleansing',  `✅ (${roles.length} roles removed)`],
          ['Channels Locked', '✅'],
          ...(target.user.bot ? [['Managed Perms Zeroed', '✅']] : [])
        ]
      ));

      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('⛔ User Suspended')
        .addFields(
          { name: '👤 User',      value: `${user.tag} \`(${user.id})\``, inline: true },
          { name: '⚠️ Reason',    value: reason,                          inline: false },
          { name: '⏱️ Duration',  value: expireText,                      inline: true },
          { name: '💾 Roles',     value: `${roles.length} saved`,         inline: true },
          { name: '🔒 Channels',  value: 'All channels locked for Suspended role', inline: false }
        ).setTimestamp().setFooter({ text: 'Use /unsuspend to restore' })] });
    }

    // ── /unsuspend ────────────────────────────────────────────────────
    if (cn === 'unsuspend') {
      if (!hasBotPerm(m, PermissionFlagsBits.ManageRoles))
        return interaction.reply({ content: '❌ You need Manage Roles permission.', ephemeral: true });
      const user = o.getUser('user'), data = db.getRoles(g.id, user.id);
      if (!data) return interaction.reply({ content: '❌ No saved roles found for this user.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

      await interaction.deferReply();

      const valid = data.roles.split(',').filter(id => id && g.roles.cache.has(id));
      const sr = g.roles.cache.find(r => r.name === 'Suspended');
      if (sr) await target.roles.remove(sr).catch(() => {});
      if (valid.length) await target.roles.add(valid).catch(() => {});

      // For bots: restore managed role permissions that were zeroed on suspend
      let restoredPerms = 0;
      if (target.user.bot) {
        const saved = db.getBotManagedPerms(g.id, user.id);
        await Promise.all(saved.map(async row => {
          const role = g.roles.cache.get(row.role_id);
          if (role) await role.setPermissions(BigInt(row.permissions), 'beni: Bot unsuspended — restoring perms').catch(() => {});
        }));
        restoredPerms = saved.length;
        db.clearBotManagedPerms(g.id, user.id);
      }

      db.clearRoles(g.id, user.id);
      db.deleteSuspensionTimer(g.id, user.id);

      const extraField = target.user.bot && restoredPerms > 0
        ? [{ name: '🤖 Managed Roles', value: `${restoredPerms} role perm(s) restored`, inline: true }]
        : [];

      db.logStaffAction(g.id, m.id, 'unsuspend', user.id, 'Manual unsuspend');
      await sendLog(g, securityEmbed(0x2ecc71,
        `✅ ${target.user.username} has been unsuspended!`,
        [
          ['Member', `<@${user.id}> [${user.tag}]`],
        ],
        [
          ['Moderator',      m.user.tag],
          ['Roles Restored', `✅ (${valid.length} roles)`],
          ...extraField.map(f => [f.name.replace(/[^a-zA-Z ]/g, '').trim(), f.value])
        ]
      ));

      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Unsuspended')
        .addFields(
          { name: '👤 User',           value: `${user.tag}`,           inline: true },
          { name: '🔄 Roles Restored', value: `${valid.length} roles`, inline: true },
          ...extraField
        ).setTimestamp()] });
    }

    // ── /scan ─────────────────────────────────────────────────────────
    if (cn === 'scan') {
      await interaction.deferReply();

      const [members, webhooks, autoModRules] = await Promise.all([
        g.members.fetch(),
        g.fetchWebhooks().catch(() => null),
        g.autoModerationRules.fetch().catch(() => null)
      ]);

      const DPERM = [
        [PermissionFlagsBits.Administrator,  'Admin'],
        [PermissionFlagsBits.ManageGuild,    'ManageSvr'],
        [PermissionFlagsBits.ManageRoles,    'ManageRoles'],
        [PermissionFlagsBits.ManageChannels, 'ManageCh'],
        [PermissionFlagsBits.BanMembers,     'Ban'],
        [PermissionFlagsBits.KickMembers,    'Kick'],
        [PermissionFlagsBits.ManageWebhooks, 'Webhooks'],
        [PermissionFlagsBits.MentionEveryone,'Mention@everyone'],
      ];
      const botMe   = g.members.me;
      const myId    = client.user.id;

      // ── Bots (exclude self) ────────────────────────────────────────
      const otherBots = members.filter(mb => mb.user.bot && mb.id !== myId);
      const adminBots = otherBots.filter(mb => mb.permissions.has(PermissionFlagsBits.Administrator));
      const elevBots  = otherBots.filter(mb => !mb.permissions.has(PermissionFlagsBits.Administrator)
                          && DPERM.slice(1).some(([p]) => mb.permissions.has(p)));
      const safeBots  = otherBots.size - adminBots.size - elevBots.size;

      const botParts = [];
      if (adminBots.size) botParts.push(`🚨 **Admin:** ${adminBots.map(b => b.user.username).join(', ')}`);
      if (elevBots.size)  botParts.push(...elevBots.map(b => {
        const p = DPERM.slice(1).filter(([pf]) => b.permissions.has(pf)).map(([,n]) => n).join('+');
        return `⚠️ **${b.user.username}** — ${p}`;
      }));
      if (safeBots > 0)   botParts.push(`✅ ${safeBots} safe bot(s)`);
      const botValue = botParts.join('\n') || '✅ No other bots.';

      // ── Dangerous Roles (compact) ──────────────────────────────────
      const dangerRoles = [...g.roles.cache.values()].filter(r =>
        r.id !== g.id && DPERM.some(([p]) => r.permissions.has(p))
      ).sort((a, b) => {
        const aAdmin = a.permissions.has(PermissionFlagsBits.Administrator);
        const bAdmin = b.permissions.has(PermissionFlagsBits.Administrator);
        return (bAdmin - aAdmin) || (b.members.size - a.members.size);
      });

      const MAX_ROLES = 12;
      const roleLines = dangerRoles.slice(0, MAX_ROLES).map(r => {
        const perms = DPERM.filter(([p]) => r.permissions.has(p)).map(([,n]) => n).join('+');
        const flag  = r.comparePositionTo(botMe.roles.highest) > 0 ? ' 🔺' : '';
        return `• **${r.name}** (${r.members.size})${flag} — ${perms}`;
      });
      if (dangerRoles.length > MAX_ROLES) roleLines.push(`_…+${dangerRoles.length - MAX_ROLES} more_`);
      const roleValue = roleLines.join('\n') || '✅ No dangerous roles.';

      // ── Non-owner human admins ─────────────────────────────────────
      const humanAdmins = members.filter(mb =>
        !mb.user.bot && mb.permissions.has(PermissionFlagsBits.Administrator) && mb.id !== g.ownerId
      );
      const adminValue = humanAdmins.size
        ? humanAdmins.map(mb => `<@${mb.id}>`).join(' ').slice(0, 900)
        : '✅ None (only server owner has Admin)';

      // ── Risky @everyone channel overwrites ─────────────────────────
      const riskyChannels = [];
      for (const [, ch] of g.channels.cache) {
        if (!ch.permissionOverwrites) continue;
        const ow = ch.permissionOverwrites.cache.get(g.id);
        if (!ow) continue;
        const dangerAllow = DPERM.filter(([p]) => ow.allow.has(p)).map(([,n]) => n);
        if (dangerAllow.length) riskyChannels.push(`#${ch.name}: ${dangerAllow.join('+')}`);
      }
      const chValue = riskyChannels.length
        ? riskyChannels.slice(0, 15).join('\n')
        : '✅ No dangerous @everyone overrides.';

      // ── Server settings ────────────────────────────────────────────
      const mfa      = g.mfaLevel === 1 ? '✅ On' : '⚠️ Off';
      const verify   = ['❌ None','⚠️ Low','✅ Med','✅ High','✅ Highest'][g.verificationLevel] || '?';
      const autoMod  = (autoModRules?.size || 0) > 0;
      const wbCount  = webhooks?.size || 0;
      const trustCnt = db.listTrust(g.id).length;

      // ── Risk score ─────────────────────────────────────────────────
      let risk = 0, flags = [];
      if (adminBots.size)           { risk += adminBots.size * 3; flags.push(`${adminBots.size} admin bot(s)`); }
      if (elevBots.size)            { risk += elevBots.size;      flags.push(`${elevBots.size} elevated bot(s)`); }
      if (humanAdmins.size > 3)     { risk += humanAdmins.size;  flags.push(`${humanAdmins.size} non-owner admins`); }
      if (g.mfaLevel !== 1)         { risk += 2;                 flags.push('2FA off'); }
      if (wbCount > 10)             { risk += 2;                 flags.push(`${wbCount} webhooks`); }
      if (riskyChannels.length > 0) { risk += riskyChannels.length; flags.push(`${riskyChannels.length} risky ch`); }
      if (!autoMod)                 { risk += 1;                 flags.push('AutoMod off'); }

      const riskColor = risk === 0 ? 0x2ecc71 : risk <= 4 ? 0xf39c12 : 0xe74c3c;
      const riskLabel = risk === 0 ? '🟢 Low' : risk <= 4 ? '🟡 Medium' : risk <= 8 ? '🟠 High' : '🔴 Critical';
      const flagStr   = flags.length ? `\n**Flags:** ${flags.join(' • ')}` : '';

      const embed1 = new EmbedBuilder().setColor(riskColor)
        .setTitle('🔍 Security Scan')
        .setDescription(`**Risk:** ${riskLabel}${flagStr}\n*Server settings (2FA/verify) are owner choices — not personal flags.*`)
        .addFields(
          { name: `🤖 Other Bots — ${otherBots.size} total (${adminBots.size + elevBots.size} flagged)`, value: botValue.slice(0, 1024) },
          { name: `🔰 Dangerous Roles — ${dangerRoles.length} found`, value: roleValue.slice(0, 1024) }
        ).setTimestamp().setFooter({ text: 'beni Security Scan' });

      const embed2 = new EmbedBuilder().setColor(0x3498db)
        .addFields(
          { name: `👑 Non-Owner Admins — ${humanAdmins.size}`, value: adminValue.slice(0, 1024) },
          { name: `⚠️ @everyone Channel Overrides — ${riskyChannels.length}`, value: chValue.slice(0, 1024) },
          { name: '🔒 2FA for Mods',      value: mfa,                                    inline: true },
          { name: '✅ Verification',      value: verify,                                  inline: true },
          { name: '🛡️ AutoMod',          value: autoMod ? '✅ On' : '❌ Off',            inline: true },
          { name: '🔗 Webhooks',          value: `${wbCount}`,                            inline: true },
          { name: '🤝 Trusted Users',     value: `${trustCnt}`,                           inline: true },
          { name: '💡 Tips',              value: '`/antinuke status` — monitors\n`/trust list` — trusted users', inline: true }
        );

      return interaction.editReply({ embeds: [embed1, embed2] });
    }

    // ── /snapshot ─────────────────────────────────────────────────────
    if (cn === 'snapshot') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const snap = db.getSnapshot(g.id);
      if (!snap) return interaction.reply({ content: '❌ No snapshot yet. Wait up to 6 hours or restart the bot.', ephemeral: true });
      const data = JSON.parse(snap.data);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📸 Last Snapshot')
        .addFields(
          { name: '🕒 Taken',          value: `<t:${Math.floor(snap.timestamp/1000)}:R>`, inline: true },
          { name: '📁 Channels',        value: `${data.channels.length} saved (with overwrites)`, inline: true },
          { name: '🔰 Roles',           value: `${data.roles.length} saved`, inline: true }
        ).setFooter({ text: 'Use /revert channels|roles|all to restore missing items' }).setTimestamp()] });
    }

    // ── /revert ───────────────────────────────────────────────────────
    if (cn === 'revert') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const snap = db.getSnapshot(g.id);
      if (!snap) return interaction.reply({ content: '❌ No snapshot found.', ephemeral: true });
      const sub  = o.getSubcommand();
      const data = JSON.parse(snap.data);
      const ts   = `<t:${Math.floor(snap.timestamp/1000)}:R>`;
      await interaction.deferReply();

      let chRestored = 0, roleRestored = 0;

      if (sub === 'channels' || sub === 'all') {
        for (const saved of data.channels) {
          // Match by ID, then by name+type
          const exists = g.channels.cache.has(saved.id)
                      || g.channels.cache.find(c => c.name === saved.name && c.type === saved.type);
          if (!exists) {
            const created = await g.channels.create({
              name: saved.name, type: saved.type,
              parent: saved.parentId || null,
              reason: 'beni: Manual revert'
            }).catch(() => null);
            if (created && saved.permissionOverwrites?.length) {
              await created.permissionOverwrites.set(
                saved.permissionOverwrites.map(ow => ({ id: ow.id, type: ow.type, allow: BigInt(ow.allow), deny: BigInt(ow.deny) })),
                'beni: Restore overwrites'
              ).catch(() => {});
            }
            if (created) chRestored++;
          }
        }
      }
      if (sub === 'roles' || sub === 'all') {
        for (const saved of data.roles) {
          if (saved.name === '@everyone') continue;
          const exists = g.roles.cache.has(saved.id)
                      || g.roles.cache.find(r => r.name === saved.name);
          if (!exists) {
            await g.roles.create({
              name: saved.name, color: saved.color || 0,
              permissions: BigInt(saved.permissions || '0'),
              hoist: saved.hoist || false, mentionable: saved.mentionable || false,
              reason: 'beni: Manual revert'
            }).catch(() => null);
            roleRestored++;
          }
        }
      }

      const lines = [];
      if (chRestored   || sub === 'channels' || sub === 'all') lines.push(`📁 Channels restored: **${chRestored}**`);
      if (roleRestored || sub === 'roles'    || sub === 'all') lines.push(`🔰 Roles restored: **${roleRestored}**`);

      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('🔄 Revert Complete')
        .setDescription(lines.join('\n'))
        .addFields({ name: '🕒 Snapshot Age', value: ts })
        .setTimestamp()] });
    }

    // ── /watchlist ────────────────────────────────────────────────────
    if (cn === 'watchlist') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ Manage Server required.', ephemeral: true });
      const sub = o.getSubcommand();
      if (sub === 'add') {
        const user   = o.getUser('user');
        const reason = o.getString('reason') || 'No reason';
        db.addWatchlist(g.id, user.id, reason, m.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle('👁️ Added to Watchlist')
          .setDescription(`▶ **Member:** <@${user.id}> [${user.tag}]\n▶ **Reason:** ${reason}\n▶ **Added by:** ${m.user.tag}`)
          .setTimestamp()], ephemeral: true });
      }
      if (sub === 'remove') {
        const user = o.getUser('user');
        db.removeWatchlist(g.id, user.id);
        return interaction.reply({ content: `✅ Removed <@${user.id}> from watchlist.`, ephemeral: true });
      }
      if (sub === 'list') {
        const list = db.listWatchlist(g.id);
        if (!list.length) return interaction.reply({ content: 'Watchlist is empty.', ephemeral: true });
        const desc = list.map(r => `▶ <@${r.user_id}> — *${r.reason}* (added <t:${Math.floor(r.added_at/1000)}:R>)`).join('\n');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle(`👁️ Watchlist (${list.length})`)
          .setDescription(desc).setTimestamp()], ephemeral: true });
      }
    }

    // ── /evidence ─────────────────────────────────────────────────────
    if (cn === 'evidence') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ Manage Server required.', ephemeral: true });
      const sub  = o.getSubcommand();
      const user = o.getUser('user');
      if (sub === 'view') {
        const rows = db.getEvidence(g.id, user.id, 8);
        if (!rows.length) return interaction.reply({ content: `No deleted messages on record for ${user.tag}.`, ephemeral: true });
        const desc = rows.map(r => {
          const atts = JSON.parse(r.attachments || '[]');
          const ts   = `<t:${Math.floor(r.timestamp/1000)}:R>`;
          return `▶ ${ts} in <#${r.channel_id}>\n  \`${(r.content||'').slice(0,120) || '*(no text)*'}${r.content?.length>120?'…':''}${atts.length?` [+${atts.length} file]`:''}`;
        }).join('\n\n');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle(`🗃️ Evidence Locker — ${user.tag}`)
          .setDescription(desc).setTimestamp().setFooter({ text: `${rows.length} most recent deleted messages` })], ephemeral: true });
      }
      if (sub === 'clear') {
        if (!m.permissions.has(PermissionFlagsBits.Administrator))
          return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
        db.clearEvidence(g.id, user.id);
        return interaction.reply({ content: `✅ Evidence cleared for ${user.tag}.`, ephemeral: true });
      }
    }

    // ── /shadow-ban ───────────────────────────────────────────────────
    if (cn === 'shadow-ban') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ Manage Server required.', ephemeral: true });
      const user     = o.getUser('user');
      const reason   = o.getString('reason') || 'No reason';
      const dmUser   = o.getBoolean('dm');
      const proofAtt = o.getAttachment('proof');
      const proofUrl = proofAtt?.url || null;
      if (user.id === m.id) return interaction.reply({ content: '❌ Cannot shadow-ban yourself.', ephemeral: true });
      if (dmUser) await user.send({ embeds: [buildDmEmbed('shadowban', g.name, reason, proofUrl)] }).catch(() => {});
      db.addShadowBan(g.id, user.id, m.id, reason);
      db.logStaffAction(g.id, m.id, 'shadow-ban', user.id, reason);
      const sbCaseId   = botDb.createCaseWithEvidence(g.id, user.id, m.id, 'shadowban', reason, null, proofUrl);
      const sbCaseData = botDb.getCase(g.id, sbCaseId);
      sendModlog(g, buildCaseEmbed(sbCaseData, user, m.user), botDb);
      return interaction.reply({ embeds: [buildResultEmbed('shadowban', reason, m.user, user)], ephemeral: true });
    }

    // ── /shadow-unban ─────────────────────────────────────────────────
    if (cn === 'shadow-unban') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ Manage Server required.', ephemeral: true });
      const user = o.getUser('user');
      db.removeShadowBan(g.id, user.id);
      db.logStaffAction(g.id, m.id, 'shadow-unban', user.id, 'Shadow-ban removed');
      return interaction.reply({ content: `✅ Shadow-ban lifted for **${user.tag}**.`, ephemeral: true });
    }

    // ── /staff-log ────────────────────────────────────────────────────
    if (cn === 'staff-log') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ Manage Server required.', ephemeral: true });
      const filterUser = o.getUser('mod');
      const rows = db.getStaffActions(g.id, filterUser?.id || null, 15);
      if (!rows.length) return interaction.reply({ content: 'No staff actions recorded yet.', ephemeral: true });
      const ACTION_ICON = { ban:'🔨', kick:'👢', mute:'🔇', suspend:'⛔', unsuspend:'✅', 'shadow-ban':'🌑', 'shadow-unban':'☀️' };
      const desc = rows.map(r =>
        `▶ ${ACTION_ICON[r.action] || '🔹'} **${r.action.toUpperCase()}** — <@${r.target_id}>\n` +
        `  by <@${r.mod_id}> • ${r.reason} • <t:${Math.floor(r.timestamp/1000)}:R>`
      ).join('\n\n');
      const filterName = filterUser ? (filterUser.globalName || filterUser.username || filterUser.id) : null;
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2)
        .setTitle(`📋 Staff Log${filterName ? ` — ${filterName}` : ''}`)
        .setDescription(desc).setTimestamp().setFooter({ text: `Last ${rows.length} actions` })], ephemeral: true });
    }

    // ── /raid-config ──────────────────────────────────────────────────
    if (cn === 'raid-config') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const sub = o.getSubcommand();
      if (sub === 'set') {
        const limit   = o.getInteger('limit')   || 10;
        const window  = (o.getInteger('window') || 30) * 1000;
        const minage  = o.getInteger('min-age') || 7;
        const action  = o.getString('action')   || 'lockdown';
        db.setRaidConfig(g.id, { enabled: 1, join_limit: limit, join_window: window, min_age_days: minage, action });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff4400).setTitle('🛡️ Raid Detection Configured')
          .setDescription(
            `▶ **Join Limit:** ${limit} per ${window/1000}s\n` +
            `▶ **Min Account Age:** ${minage}d\n` +
            `▶ **Action:** ${action}\n` +
            `▶ **Status:** ✅ Enabled`
          ).setTimestamp()] });
      }
      if (sub === 'disable') {
        const cfg = db.getRaidConfig(g.id);
        db.setRaidConfig(g.id, { ...cfg, enabled: 0 });
        return interaction.reply({ content: '✅ Raid detection disabled.', ephemeral: true });
      }
      if (sub === 'status') {
        const cfg = db.getRaidConfig(g.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(cfg.enabled ? 0xff4400 : 0x888888)
          .setTitle('🛡️ Raid Detection Status')
          .setDescription(
            `▶ **Status:** ${cfg.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
            `▶ **Join Limit:** ${cfg.join_limit} per ${cfg.join_window/1000}s\n` +
            `▶ **Min Account Age:** ${cfg.min_age_days}d\n` +
            `▶ **Action:** ${cfg.action}`
          ).setTimestamp()], ephemeral: true });
      }
    }

    // ── /warn ─────────────────────────────────────────────────────────
    if (cn === 'warn') {
      if (!hasBotPerm(m, PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'No reason.';
      const dmUser   = o.getBoolean('dm');
      const proofAtt = o.getAttachment('proof');
      const proofUrl = proofAtt?.url || null;
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (dmUser) await user.send({ embeds: [buildDmEmbed('warn', g.name, reason, proofUrl)] }).catch(() => {});
      botDb.addWarning(g.id, user.id, m.id, reason, 1);
      db.logStaffAction(g.id, m.id, 'warn', user.id, reason);
      const warnCaseId   = botDb.createCaseWithEvidence(g.id, user.id, m.id, 'warn', reason, null, proofUrl);
      const warnCaseData = botDb.getCase(g.id, warnCaseId);
      sendModlog(g, buildCaseEmbed(warnCaseData, user, m.user), botDb);
      return interaction.reply({ embeds: [buildResultEmbed('warn', reason, m.user, user)] });
    }

    // ── /setmodlog ────────────────────────────────────────────────────
    if (cn === 'setmodlog') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const ch = o.getChannel('channel');
      botDb.setModlogChannel(g.id, ch.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📋 Case Log Channel Set')
        .setDescription(`Case logs will be sent to ${ch}`)
        .addFields({ name: 'What logs here?', value: 'Every moderation case (warn, ban, kick, mute, suspend, shadow-ban)', inline: false })
        .setFooter({ text: '💡 Use /setlogs for unified dual-channel control' })
        .setTimestamp()] });
    }

    // ── /autofeatures ─────────────────────────────────────────────────
    if (cn === 'autofeatures') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });

      const FEAT_LABELS = {
        webhook_block:    '🪝 Webhook Block',
        role_perm_guard:  '🛡️ Role Perm Guard',
        vanity_guard:     '🔗 Vanity URL Guard',
        everyone_protect: '📢 @everyone Protection',
        role_memory:      '🧠 Role Memory',
        auto_revert:      '♻️ Auto-Revert',
        slowmode:         '🐢 Dynamic Slowmode',
      };

      const sub  = o.getSubcommand();
      const feat = o.getString('feature');

      if (sub === 'enable' || sub === 'disable') {
        const val = sub === 'enable' ? 1 : 0;
        botDb.setAutoFeature(g.id, feat, val);
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(val ? 0x2ecc71 : 0xe74c3c)
          .setTitle(`${val ? '✅ Enabled' : '❌ Disabled'}: ${FEAT_LABELS[feat] || feat}`)
          .setTimestamp()] });
      }

      if (sub === 'status') {
        const cfg = botDb.getGuildConfig(g.id) || {};
        const lines = Object.entries(FEAT_LABELS).map(([key, label]) => {
          const on = cfg[`feat_${key}`] !== 0;
          return `${on ? '🟢' : '🔴'} **${label}** — ${on ? 'Enabled' : 'Disabled'}`;
        });
        lines.push('');
        lines.push('🟡 **Raid Detection** — use `/raid-config` to manage');
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('⚡ Auto-Features Status')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Use /autofeatures enable|disable <feature> to toggle' })
          .setTimestamp()] });
      }
    }

    // ── /setbotlogs ───────────────────────────────────────────────────
    if (cn === 'setbotlogs') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const ch = o.getChannel('channel');
      db.setLogChannel(g.id, ch.id);
      botDb.setLogChannel(g.id, ch.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Security Log Channel Set')
        .setDescription(`Security & bot action logs will be sent to ${ch}`)
        .addFields({ name: 'What logs here?', value: 'Anti-nuke alerts, joins/leaves, role changes, audit events — NOT case embeds (use `/setlogs type:cases` for cases)', inline: false })
        .setFooter({ text: '💡 Use /setlogs for unified dual-channel control' })
        .setTimestamp()] });
    }

    // ── /cases ────────────────────────────────────────────────────────
    if (cn === 'cases') {
      if (!hasBotPerm(m, PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const sub = o.getSubcommand();

      if (sub === 'view') {
        const caseId = o.getInteger('case_id');
        const user   = o.getUser('user');
        const mod    = o.getUser('mod');
        const type   = o.getString('type');

        // Single-case lookup
        if (caseId) {
          const c = botDb.getCase(g.id, caseId);
          if (!c) return interaction.reply({ content: `❌ Case #${caseId} not found.`, ephemeral: true });
          const targetUser = await client.users.fetch(c.user_id).catch(() => null);
          const modUser    = await client.users.fetch(c.moderator_id).catch(() => null);
          const embed = buildCaseEmbed(c, targetUser || { tag: c.user_id, id: c.user_id }, modUser || { username: c.moderator_id })
            .setTitle(`Case #${c.case_id}`);
          if (c.evidence) embed.addFields({ name: '🔗 Evidence', value: c.evidence, inline: false });
          return interaction.reply({ embeds: [embed] });
        }

        // Filtered list (user / mod / type — any combination)
        const ACTION_LABELS = { warn:'WARN', ban:'BAN', kick:'KICK', mute:'TIMEOUT', suspend:'SUSPEND', shadowban:'SHADOW-BAN' };
        if (user || mod || type) {
          const cases = botDb.getCases(g.id, user?.id || null, { modId: mod?.id || null, action: type || null, limit: 25 });
          if (!cases.length) {
            const filters = [user && `user: ${user.username}`, mod && `mod: ${mod.username}`, type && `type: ${type}`].filter(Boolean).join(', ');
            return interaction.reply({ content: `No cases found${filters ? ` for (${filters})` : ''}.`, ephemeral: true });
          }

          // Build filter description for embed title
          const titleParts = [];
          if (user) titleParts.push(`User: ${user.username}`);
          if (mod)  titleParts.push(`Mod: ${mod.username}`);
          if (type) titleParts.push(`Type: ${ACTION_LABELS[type] || type.toUpperCase()}`);

          const lines = cases.map(c => {
            const label = ACTION_LABELS[c.action] || c.action.toUpperCase();
            return `✅ **#${c.case_id}** \`[${label}]\` — <@${c.user_id}> • <t:${Math.floor(c.timestamp/1000)}:R>`;
          });

          return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2)
            .setTitle(`📋 Cases — ${titleParts.join(' • ')} (${cases.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `Showing up to 25 most recent • Use case_id for full detail` })
            .setTimestamp()] });
        }

        return interaction.reply({ content: '❌ Provide at least one filter: `case_id`, `user`, `mod`, or `type`.', ephemeral: true });
      }

      if (sub === 'modify') {
        if (!m.permissions.has(PermissionFlagsBits.Administrator))
          return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
        const caseId = o.getInteger('case_id');
        const field  = o.getString('field');
        const value  = o.getString('value');
        const c = botDb.getCase(g.id, caseId);
        if (!c) return interaction.reply({ content: `❌ Case #${caseId} not found.`, ephemeral: true });

        const allowed = { reason: true, duration: true };
        if (!allowed[field])
          return interaction.reply({ content: '❌ Editable fields: `reason`, `duration`', ephemeral: true });

        botDb.updateCase(g.id, caseId, { [field]: value });
        sendModlog(g, new EmbedBuilder().setColor(0x3498DB)
          .addFields(
            { name: 'Case Modified:', value: `${caseId} ✅`, inline: false },
            { name: 'Field:',         value: field,           inline: false },
            { name: 'New Value:',     value: value,           inline: false },
            { name: 'Modified by:',   value: `${m.user.username} 👑`, inline: false }
          ).setTimestamp(), botDb);

        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB)
          .setTitle(`✅ Case #${caseId} Updated`)
          .addFields(
            { name: 'Field',     value: field, inline: true },
            { name: 'New Value', value: value, inline: true }
          ).setTimestamp()], ephemeral: true });
      }
    }

    // ── /notes ────────────────────────────────────────────────────────
    if (cn === 'notes') {
      if (!hasBotPerm(m, PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const sub = o.getSubcommand();

      if (sub === 'add') {
        const user    = o.getUser('user');
        const content = o.getString('text');
        const noteId  = botDb.addNote(g.id, user.id, m.id, content);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB)
          .setTitle('📝 Note Added')
          .addFields(
            { name: 'User',    value: `${user.tag} \`[${user.id}]\``, inline: false },
            { name: 'Note ID', value: `${noteId}`,                     inline: true  },
            { name: 'Content', value: content,                         inline: false }
          ).setTimestamp()], ephemeral: true });
      }

      if (sub === 'remove') {
        const user   = o.getUser('user');
        const noteId = o.getInteger('note_id');
        const ok     = botDb.removeNote(g.id, user.id, noteId);
        return interaction.reply({ content: ok ? `✅ Note #${noteId} removed.` : `❌ Note #${noteId} not found for that user.`, ephemeral: true });
      }

      if (sub === 'view') {
        const user  = o.getUser('user');
        const notes = botDb.getNotes(g.id, user.id);
        if (!notes.length) return interaction.reply({ content: `No notes found for ${user.tag}.`, ephemeral: true });
        const lines = notes.map(n => `**#${n.id}** — <t:${Math.floor(n.timestamp/1000)}:R> by <@${n.author_id}>\n> ${n.content}`);
        const chunks = [];
        let cur = '';
        for (const line of lines) {
          if ((cur + '\n\n' + line).length > 4000) { chunks.push(cur); cur = line; }
          else cur = cur ? cur + '\n\n' + line : line;
        }
        if (cur) chunks.push(cur);
        const embeds = chunks.map((chunk, i) => new EmbedBuilder().setColor(0x3498DB)
          .setTitle(i === 0 ? `📝 Notes — ${user.tag} (${notes.length})` : null)
          .setDescription(chunk)
          .setTimestamp());
        return interaction.reply({ embeds: embeds.slice(0, 10), ephemeral: true });
      }

      if (sub === 'delall') {
        if (!m.permissions.has(PermissionFlagsBits.Administrator))
          return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
        const user    = o.getUser('user');
        const deleted = botDb.deleteAllNotes(g.id, user.id);
        return interaction.reply({ content: `✅ Deleted **${deleted}** note(s) for ${user.tag}.`, ephemeral: true });
      }

      if (sub === 'modify') {
        if (!m.permissions.has(PermissionFlagsBits.Administrator))
          return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
        const user   = o.getUser('user');
        const noteId = o.getInteger('note_id');
        const text   = o.getString('text');
        const ok     = botDb.updateNote(g.id, user.id, noteId, text);
        return interaction.reply({ embeds: [ok
          ? new EmbedBuilder().setColor(0x3498DB).setTitle('✏️ Note Updated')
              .addFields(
                { name: 'User',    value: `${user.tag}`, inline: true },
                { name: 'Note ID', value: `${noteId}`,   inline: true },
                { name: 'New Content', value: text,       inline: false }
              ).setTimestamp()
          : new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Note Not Found')
              .setDescription(`Note #${noteId} was not found for ${user.tag}.`)
        ], ephemeral: true });
      }
    }

    // ── /purge ────────────────────────────────────────────────────────
    if (cn === 'purge') {
      if (!m.permissions.has(PermissionFlagsBits.ManageMessages))
        return interaction.reply({ content: '❌ You need Manage Messages permission.', ephemeral: true });

      const amount  = Math.min(o.getInteger('amount'), 100);
      const target  = o.getUser('user');

      if (amount < 1) return interaction.reply({ content: '❌ Amount must be at least 1.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (!messages) return interaction.editReply({ content: '❌ Could not fetch messages.' });

      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      let filtered = [...messages.values()].filter(msg => msg.createdTimestamp > fourteenDaysAgo);

      if (target) filtered = filtered.filter(msg => msg.author.id === target.id);

      const toDelete = filtered.slice(0, amount);
      if (!toDelete.length) return interaction.editReply({ content: '❌ No eligible messages found (must be under 14 days old).' });

      const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
      const count   = deleted?.size ?? 0;

      return interaction.editReply({ content: `✅ Deleted **${count}** message${count !== 1 ? 's' : ''}${target ? ` from ${target.tag}` : ''}.` });
    }

    // ── /help ─────────────────────────────────────────────────────────
    if (cn === 'help') {
      const pages = buildHelpPages();
      const page  = Math.max(0, Math.min((o.getInteger('page') || 1) - 1, pages.length - 1));
      return interaction.reply({ embeds: [pages[page]], components: [buildHelpRow(page, pages.length)] });
    }

  } catch (err) {
    console.error(`[CMD ERROR] ${cn}:`, err);
    const msg = { content: '❌ An error occurred.', ephemeral: true };
    if (interaction.deferred || interaction.replied) interaction.editReply(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════
//  READY
// ═══════════════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`🚀 beni Online: ${client.user.tag}`);
  await takeSnapshots();
  console.log(`📸 Snapshot saved for ${client.guilds.cache.size} guild(s).`);
  const pending = db.getAllSuspensionTimers();
  let resumed   = 0;
  for (const row of pending) {
    const rem = row.expires_at - Date.now();
    if (rem <= 0) await doUnsuspend(row.guild_id, row.user_id);
    else { scheduleUnsuspend(row.guild_id, row.user_id, rem); resumed++; }
  }
  if (resumed) console.log(`⏱️ Resumed ${resumed} suspension timer(s).`);
});

client.login(TOKEN);

// ═══════════════════════════════════════════════════════════════════
//  COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════
const MONITOR_TYPES = [
  { name: 'Channel Delete', value: 'channel_delete' }, { name: 'Channel Create', value: 'channel_create' },
  { name: 'Channel Update', value: 'channel_update' }, { name: 'Role Delete',    value: 'role_delete'    },
  { name: 'Role Create',    value: 'role_create'    }, { name: 'Member Ban',     value: 'member_ban'     },
  { name: 'Member Kick',    value: 'member_kick'    }, { name: 'Webhook Create', value: 'webhook_create' },
  { name: 'Emoji Create',   value: 'emoji_create'   }, { name: 'Emoji Delete',   value: 'emoji_delete'   },
  { name: 'Sticker Create', value: 'sticker_create' }, { name: 'Sticker Delete', value: 'sticker_delete' },
];

const COUNTING_TYPES = [
  { name: 'Normal (1,2,3…)',      value: 'normal'    },
  { name: 'Even (2,4,6…)',        value: 'even'      },
  { name: 'Odd (1,3,5…)',         value: 'odd'       },
  { name: 'Fibonacci (1,2,3,5…)', value: 'fibonacci' },
  { name: 'Prime (2,3,5,7…)',     value: 'prime'     },
];

const commands = [
  // Global
  { name: 'say',  description: 'Send a message as the bot', integration_types:[0,1], contexts:[0,1,2], options:[{ name:'message', type:3, required:true, description:'Message to send' }] },
  { name: 'ask',  description: 'Ask the Magic 8-Ball',      integration_types:[0,1], contexts:[0,1,2], options:[{ name:'question', type:3, required:true, description:'Your question' }] },

  // Moderation
  { name:'warn',   description:'Warn a member', options:[
    {name:'user',type:6,required:true,description:'User'},
    {name:'reason',type:3,description:'Reason'},
    {name:'proof',type:11,description:'Attach an image or file as proof'},
    {name:'dm',type:5,description:'DM the user about this action? (true/false)'}
  ]},
  { name:'ban',    description:'Ban a member', options:[
    {name:'user',type:6,required:true,description:'User'},
    {name:'reason',type:3,description:'Reason'},
    {name:'proof',type:11,description:'Attach an image or file as proof'},
    {name:'dm',type:5,description:'DM the user about this action? (true/false)'}
  ]},
  { name:'unban',  description:'Unban a user',    options:[{name:'user_id',type:3,required:true,description:'User ID'},{name:'reason',type:3,description:'Reason'}] },
  { name:'kick',   description:'Kick a member', options:[
    {name:'user',type:6,required:true,description:'User'},
    {name:'reason',type:3,description:'Reason'},
    {name:'proof',type:11,description:'Attach an image or file as proof'},
    {name:'dm',type:5,description:'DM the user about this action? (true/false)'}
  ]},
  { name:'mute',   description:'Timeout a member', options:[
    {name:'user',type:6,required:true,description:'User'},
    {name:'duration',type:3,description:'e.g. 10m 1h 28d'},
    {name:'reason',type:3,description:'Reason'},
    {name:'proof',type:11,description:'Attach an image or file as proof'},
    {name:'dm',type:5,description:'DM the user about this action? (true/false)'}
  ]},
  { name:'unmute', description:'Remove a timeout', options:[{name:'user',type:6,required:true,description:'User'}] },
  { name:'purge',  description:'Delete messages (max 100)', options:[
    {name:'amount',type:4,required:true,description:'Number of messages to delete',min_value:1,max_value:100},
    {name:'user',  type:6,description:'Delete messages from a specific user only'}
  ]},
  { name:'cases', description:'View or modify moderation cases', options:[
    {name:'view', type:1, description:'View a case or all cases, with optional filters', options:[
      {name:'case_id', type:4, description:'Look up a specific case by ID'},
      {name:'user',    type:6, description:'Filter cases by target user'},
      {name:'mod',     type:6, description:'Filter cases by moderator'},
      {name:'type',    type:3, description:'Filter by action type', choices:[
        {name:'Ban',       value:'ban'},
        {name:'Kick',      value:'kick'},
        {name:'Timeout',   value:'mute'},
        {name:'Suspend',   value:'suspend'},
        {name:'Warn',      value:'warn'},
        {name:'Shadow-Ban',value:'shadowban'}
      ]}
    ]},
    {name:'modify', type:1, description:'Modify a case field (Admin)', options:[
      {name:'case_id',type:4,required:true,description:'Case ID'},
      {name:'field',  type:3,required:true,description:'Field to edit',choices:[{name:'reason',value:'reason'},{name:'duration',value:'duration'}]},
      {name:'value',  type:3,required:true,description:'New value'}
    ]}
  ]},
  { name:'notes', description:'Manage user notes', options:[
    {name:'add',    type:1, description:'Add a note to a user',              options:[{name:'user',type:6,required:true,description:'User'},{name:'text',type:3,required:true,description:'Note content'}]},
    {name:'remove', type:1, description:'Remove a specific note',            options:[{name:'user',type:6,required:true,description:'User'},{name:'note_id',type:4,required:true,description:'Note ID'}]},
    {name:'view',   type:1, description:'View all notes for a user',         options:[{name:'user',type:6,required:true,description:'User'}]},
    {name:'modify', type:1, description:'Edit a note\'s content (Admin)',    options:[{name:'user',type:6,required:true,description:'User'},{name:'note_id',type:4,required:true,description:'Note ID'},{name:'text',type:3,required:true,description:'New note content'}]},
    {name:'delall', type:1, description:'Delete all notes for a user (Admin)', options:[{name:'user',type:6,required:true,description:'User'}]}
  ]},
  { name:'setlogs',   description:'Configure log channels — cases, security, or both (Admin)', options:[
    {name:'channel', type:7, required:true,  description:'Channel to log to',   channel_types:[0]},
    {name:'type',    type:3, required:false, description:'What to log here',    choices:[
      {name:'Both (cases + security)',   value:'both'},
      {name:'Case logs only (mod actions)', value:'cases'},
      {name:'Security logs only (anti-nuke, events)', value:'security'}
    ]}
  ]},
  { name:'setmodlog', description:'Set the case/modlog channel (Admin) — legacy, use /setlogs', options:[{name:'channel',type:7,required:true,description:'Channel for case logs',channel_types:[0]}] },

  // Fun / Features
  { name:'counting-toggle',  description:'Enable/disable counting game', options:[
    {name:'channel',type:7,required:true,description:'Channel',channel_types:[0]},
    {name:'type',type:3,description:'Counting type',choices:COUNTING_TYPES}
  ]},
  { name:'starboard-enable', description:'Enable starboard', options:[
    {name:'channel',type:7,required:true,description:'Starboard channel',channel_types:[0]},
    {name:'threshold',type:4,description:'Stars needed (default 3)',min_value:1},
    {name:'emoji',type:3,description:'Reaction emoji to track (default ⭐)'}
  ]},
  { name:'starboard-disable', description:'Disable starboard' },

  // Security management
  { name:'config', description:'Set threshold or enable/disable individual monitors (Admin)', options:[
    {name:'type',    type:3,required:true, description:'Monitor to configure',choices:MONITOR_TYPES},
    {name:'enabled', type:3,              description:'Enable or disable this monitor', choices:[{name:'Enable',value:'on'},{name:'Disable',value:'off'}]},
    {name:'limit',   type:4,              description:'Action limit (required when setting threshold)',min_value:1},
    {name:'time',    type:3,              description:'Time window — e.g. 10s 5m 1h (required when setting threshold)'}
  ]},
  { name:'setup', description:'Set log channel (Admin)', options:[{name:'channel',type:7,required:true,description:'Log channel',channel_types:[0]}] },
  { name:'setup-suspend', description:'Configure the suspend system — role, jail channel, and channel overwrites (Admin)', options:[
    {name:'role',    type:8, description:'Use an existing role as the Suspended role (leave blank to auto-create "Suspended")'},
    {name:'channel', type:7, description:'Jail channel where suspended users can see+send but not read history', channel_types:[0]}
  ]},
  { name:'watchlist', description:'Manage the silent watchlist (ManageServer)', options:[
    {name:'add',    type:1, description:'Add user to watchlist',    options:[{name:'user',type:6,required:true,description:'User'},{name:'reason',type:3,description:'Reason'}]},
    {name:'remove', type:1, description:'Remove from watchlist',    options:[{name:'user',type:6,required:true,description:'User'}]},
    {name:'list',   type:1, description:'List all watched users'}
  ]},
  { name:'evidence', description:'View/clear deleted-message evidence locker (ManageServer)', options:[
    {name:'view',  type:1, description:'View evidence for a user', options:[{name:'user',type:6,required:true,description:'User'}]},
    {name:'clear', type:1, description:'Clear evidence for a user (Admin)', options:[{name:'user',type:6,required:true,description:'User'}]}
  ]},
  { name:'shadow-ban',   description:'Silently delete all messages from a user (ManageServer)', options:[
    {name:'user',type:6,required:true,description:'User'},
    {name:'reason',type:3,description:'Reason'},
    {name:'proof',type:11,description:'Attach an image or file as proof'},
    {name:'dm',type:5,description:'DM the user about this action? (true/false)'}
  ]},
  { name:'shadow-unban', description:'Remove shadow-ban from a user (ManageServer)', options:[{name:'user',type:6,required:true,description:'User'}] },
  { name:'staff-log', description:'View recent staff actions (ManageServer)', options:[{name:'mod',type:6,description:'Filter by specific moderator'}] },
  { name:'raid-config', description:'Configure predictive raid detection (Admin)', options:[
    {name:'set', type:1, description:'Set raid detection parameters', options:[
      {name:'limit',   type:4,description:'Joins to trigger alert (default 10)', min_value:2},
      {name:'window',  type:4,description:'Time window in seconds (default 30)', min_value:5},
      {name:'min-age', type:4,description:'Min account age in days to flag (default 7)', min_value:0},
      {name:'action',  type:3,description:'Action on detection', choices:[
        {name:'lockdown — lock all channels', value:'lockdown'},
        {name:'kick — kick the joiner', value:'kick'},
        {name:'alert — log only', value:'alert'}
      ]}
    ]},
    {name:'disable', type:1, description:'Disable raid detection'},
    {name:'status',  type:1, description:'View current raid detection config'}
  ]},
  { name:'trust', description:'Manage trusted users (Owner)', options:[
    {name:'add',    type:1,description:'Add trust',    options:[{name:'user',type:6,required:true,description:'User'},{name:'level',type:4,required:true,description:'Level',choices:[{name:'1 — Owner/Fully Immune',value:1},{name:'2 — Trustee/Nuke-Immune',value:2},{name:'3 — Permit/Mod',value:3}]}]},
    {name:'remove', type:1,description:'Remove trust', options:[{name:'user',type:6,required:true,description:'User'}]},
    {name:'list',   type:1,description:'List all trusted users'}
  ]},
  { name:'antinuke', description:'Toggle/view the anti-nuke system (Admin)', options:[
    {name:'enable',  type:1, description:'Enable all monitors'},
    {name:'disable', type:1, description:'Disable all monitors'},
    {name:'status',  type:1, description:'View all thresholds and instant-action events'}
  ]},
  { name:'suspend',   description:'Suspend a user or bot', options:[
    {name:'user',type:6,required:true,description:'User or bot'},
    {name:'reason',type:3,description:'Reason'},
    {name:'duration',type:3,description:'Auto-unsuspend after — e.g. 10m 1h 7d'},
    {name:'proof',type:11,description:'Attach an image or file as proof'},
    {name:'dm',type:5,description:'DM the user about this action? (true/false)'}
  ]},
  { name:'setbotlogs', description:'Set channel for all bot & mod action logs (Admin)', options:[{name:'channel',type:7,required:true,description:'Channel for bot/mod logs',channel_types:[0]}] },
  { name:'autofeatures', description:'Enable, disable, or view status of bot auto-features (Admin)', options:[
    {name:'enable',  type:1, description:'Enable an auto-feature', options:[
      {name:'feature', type:3, required:true, description:'Feature to enable', choices:[
        {name:'Webhook Block',          value:'webhook_block'},
        {name:'Role Perm Guard',        value:'role_perm_guard'},
        {name:'Vanity URL Guard',       value:'vanity_guard'},
        {name:'@everyone Protection',   value:'everyone_protect'},
        {name:'Role Memory',            value:'role_memory'},
        {name:'Auto-Revert',            value:'auto_revert'},
        {name:'Dynamic Slowmode',       value:'slowmode'}
      ]}
    ]},
    {name:'disable', type:1, description:'Disable an auto-feature', options:[
      {name:'feature', type:3, required:true, description:'Feature to disable', choices:[
        {name:'Webhook Block',          value:'webhook_block'},
        {name:'Role Perm Guard',        value:'role_perm_guard'},
        {name:'Vanity URL Guard',       value:'vanity_guard'},
        {name:'@everyone Protection',   value:'everyone_protect'},
        {name:'Role Memory',            value:'role_memory'},
        {name:'Auto-Revert',            value:'auto_revert'},
        {name:'Dynamic Slowmode',       value:'slowmode'}
      ]}
    ]},
    {name:'status',  type:1, description:'View status of all auto-features'}
  ]},
  { name:'unsuspend', description:'Restore a suspended user/bot', options:[{name:'user',type:6,required:true,description:'User'}] },
  { name:'lockdown',  description:'Lock all text channels (saves exact permissions)', options:[{name:'reason',type:3,description:'Reason'}] },
  { name:'unlockdown', description:'Restore channels to exact pre-lockdown state' },
  { name:'scan',      description:'Audit bots + check server security status' },
  { name:'snapshot',  description:'View last server state snapshot (Admin)' },
  { name:'revert',    description:'Restore from last snapshot with full overwrites (Admin)', options:[
    {name:'channels', type:1, description:'Restore missing channels + permission overwrites'},
    {name:'roles',    type:1, description:'Restore missing roles + permissions'},
    {name:'all',      type:1, description:'Restore both channels and roles at once'}
  ]},
  { name:'help', description:'Show all commands with navigation', options:[{name:'page',type:4,description:'Page 1–5',min_value:1,max_value:5}] }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`✅ ${commands.length} commands registered.`);
  } catch (e) {
    console.error('❌ Command registration failed:', e.message);
  }
})();
