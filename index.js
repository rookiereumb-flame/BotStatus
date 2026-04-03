require('dotenv').config();
const {
  Client, GatewayIntentBits, AuditLogEvent, ChannelType,
  PermissionFlagsBits, EmbedBuilder, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const db = require('./src/database/db');
const { logAction, checkThreshold, suspendUser, sendLog } = require('./src/services/monitor');

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMessageReactions
  ]
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
      reason: 'Daddy USSR: Auto-revert'
    });
    // Restore permission overwrites
    for (const ow of (saved.permissionOverwrites || [])) {
      await restored.permissionOverwrites.edit(ow.id, {}, {
        allow: BigInt(ow.allow), deny: BigInt(ow.deny), type: ow.type
      }).catch(() => {});
    }
    await sendLog(guild, new EmbedBuilder().setColor(0x00ff88)
      .setTitle('🔄 Auto-Revert: Channel Restored')
      .addFields({ name: 'Channel', value: `#${saved.name} → ${restored}`, inline: true })
      .setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' }));
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
      reason: 'Daddy USSR: Auto-revert'
    });
    await sendLog(guild, new EmbedBuilder().setColor(0x00ff88)
      .setTitle('🔄 Auto-Revert: Role Restored')
      .addFields({ name: 'Role', value: `"${saved.name}" → ${restored}`, inline: true })
      .setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' }));
  } catch(e) { console.error('auto-revert role:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════
//  AUDIT LOG HELPER — prevents false-positive logs (race condition)
// ═══════════════════════════════════════════════════════════════════
async function fetchAuditEntry(guild, type, targetId = null, maxAge = 5000) {
  const logs = await guild.fetchAuditLogs({ type, limit: 3 }).catch(() => null);
  if (!logs) return null;
  for (const entry of logs.entries.values()) {
    if (Date.now() - entry.createdTimestamp > maxAge) break;
    if (targetId && entry.targetId !== targetId) continue;
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

  const trust = db.getTrust(guild.id, executorId);
  if (trust && trust.level <= 2) return; // L1 and L2 are nuke-immune

  logAction(guild.id, executorId, type);

  await sendLog(guild, new EmbedBuilder().setColor(0xff6600)
    .setTitle(`⚠️ Monitor: ${type.replace(/_/g,' ').toUpperCase()}`)
    .addFields(
      { name: '👤 Executor', value: `<@${executorId}> \`(${executorId})\``, inline: true },
      { name: '📋 Evidence', value: evidence }
    ).setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' }));

  if (checkThreshold(guild.id, executorId, type)) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) await suspendUser(member, reason, evidence);
    if (revertTarget) {
      if (type === 'channel_delete') await autoRevertChannel(guild, revertTarget);
      if (type === 'role_delete')    await autoRevertRole(guild, revertTarget);
    }
  }
}

// ── Monitors ─────────────────────────────────────────────────────────────────

// Channel Delete — auto-revert
client.on('channelDelete', async c => {
  const e = await fetchAuditEntry(c.guild, AuditLogEvent.ChannelDelete, c.id);
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_delete', 'Channel Deletion Spam', `Deleted: #${c.name} (${c.id})`, c);
});

// Channel Create
client.on('channelCreate', async c => {
  const e = await fetchAuditEntry(c.guild, AuditLogEvent.ChannelCreate, c.id);
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_create', 'Channel Creation Spam', `Created: #${c.name}`);
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

  // Block dangerous perm grants
  const addedPerms = newRole.permissions.bitfield & ~oldRole.permissions.bitfield;
  const gotDangerous = DANGEROUS_PERMS.some(p => (addedPerms & p) === p);
  if (gotDangerous) {
    // Immediately revert
    await newRole.setPermissions(oldRole.permissions, 'Daddy USSR: Dangerous perm grant blocked').catch(() => {});
    const member = await newRole.guild.members.fetch(e.executorId).catch(() => null);
    if (member) await suspendUser(member, 'Dangerous Permission Grant', `Role "${newRole.name}" given: ${DANGEROUS_PERMS.filter(p=>(addedPerms&p)===p).map(p=>Object.entries(PermissionFlagsBits).find(([,v])=>v===p)?.[0]).filter(Boolean).join(', ')}`);
    return;
  }

  // Protect Suspended role and bot role from edits by non-immune users
  const botTop = newRole.guild.members.me?.roles.highest;
  if (newRole.name === 'Suspended' || newRole.id === botTop?.id) {
    await newRole.setPermissions(oldRole.permissions, 'Daddy USSR: Hierarchy protection').catch(() => {});
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
  const data = db.getRoles(m.guild.id, m.id);
  if (data?.is_suspended) return; // Don't overwrite suspension save
  const roles = m.roles.cache.filter(r => r.id !== m.guild.id).map(r => r.id);
  if (roles.length) db.saveRoles(m.guild.id, m.id, roles.join(','), 0);
});

// Webhook — delete immediately, threshold for repeated attempts
client.on('webhookUpdate', async channel => {
  const e = await fetchAuditEntry(channel.guild, AuditLogEvent.WebhookCreate);
  if (!e || e.executorId === client.user.id) return;
  const cfg = db.getGuildConfig(channel.guild.id);
  if (cfg.antinuke_enabled === 0) return;
  const trust = db.getTrust(channel.guild.id, e.executorId);
  if (trust && trust.level <= 2) return;

  // Delete the webhook
  const webhooks = await channel.fetchWebhooks().catch(() => null);
  const target   = webhooks?.find(w => w.id === e.targetId);
  if (target) await target.delete('Daddy USSR: Unauthorized webhook removed').catch(() => {});

  logAction(channel.guild.id, e.executorId, 'webhook_create');
  await sendLog(channel.guild, new EmbedBuilder().setColor(0xff6600)
    .setTitle('⚠️ Monitor: WEBHOOK CREATE — Deleted')
    .addFields(
      { name: '👤 Executor', value: `<@${e.executorId}> \`(${e.executorId})\``, inline: true },
      { name: '📋 Action',   value: `Webhook created in #${channel.name} — auto-deleted` }
    ).setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' }));

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
  if (cfg.antinuke_enabled === 0) return;
  const trust = db.getTrust(newGuild.id, e.executorId);
  if (trust && trust.level <= 2) return;

  // Revert vanity immediately
  if (oldGuild.vanityURLCode) {
    await newGuild.setVanityCode(oldGuild.vanityURLCode, 'Daddy USSR: Vanity URL reverted').catch(() => {});
  }
  const member = await newGuild.members.fetch(e.executorId).catch(() => null);
  if (member) await suspendUser(member, 'Vanity URL Changed', `${oldGuild.vanityURLCode || 'none'} → ${newGuild.vanityURLCode || 'none'}`);

  await sendLog(newGuild, new EmbedBuilder().setColor(0xff0000)
    .setTitle('🚨 INSTANT ACTION: Vanity URL Change')
    .addFields(
      { name: '👤 Executor', value: `<@${e.executorId}>`, inline: true },
      { name: '🔗 Change',   value: `\`${oldGuild.vanityURLCode||'none'}\` → \`${newGuild.vanityURLCode||'none'}\``, inline: true },
      { name: '⚡ Action',   value: 'Reverted + User suspended instantly', inline: false }
    ).setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' }));
});

// ── Role Memory Restore on Rejoin ─────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  const data = db.getRoles(member.guild.id, member.id);
  if (!data) return;
  if (data.is_suspended) {
    const sr = member.guild.roles.cache.find(r => r.name === 'Suspended');
    if (sr) await member.roles.add(sr).catch(() => {});
  } else {
    const valid = data.roles.split(',').filter(id => id && member.guild.roles.cache.has(id));
    if (valid.length) await member.roles.add(valid).catch(() => {});
  }
});

// ── @everyone protection + Counting ──────────────────────────────────────────
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  // @everyone / @here — instant suspend unless trusted
  if (message.mentions.everyone) {
    const trust = db.getTrust(message.guild.id, message.author.id);
    if (!trust || trust.level > 2) {
      await message.delete().catch(() => {});
      const mb = await message.guild.members.fetch(message.author.id).catch(() => null);
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
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction.message.guild) return;
  const sb = db.getStarboard(reaction.message.guild.id);
  if (!sb?.enabled || !sb.channel_id) return;

  const emoji = sb.emoji || '⭐';
  if (reaction.emoji.name !== emoji && reaction.emoji.toString() !== emoji) return;
  if (reaction.count < sb.threshold) return;
  if (db.getStarboardPost(reaction.message.guild.id, reaction.message.id)) return;

  const sbCh = reaction.message.guild.channels.cache.get(sb.channel_id);
  if (!sbCh) return;

  const msg    = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!msg) return;

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
    await member.roles.set(valid).catch(() => {});
  }
  db.clearRoles(guildId, userId);
  db.deleteSuspensionTimer(guildId, userId);
  await sendLog(guild, new EmbedBuilder().setColor(0x2ecc71)
    .setTitle('✅ Auto-Unsuspend')
    .setDescription(`<@${userId}> — suspension expired, roles restored.`)
    .setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' }));
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
    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 1/4: Moderation')
      .addFields(
        { name: '/ban @user [reason]',        value: 'Ban a member from the server' },
        { name: '/unban <user_id> [reason]',   value: 'Unban by user ID' },
        { name: '/kick @user [reason]',        value: 'Kick a member' },
        { name: '/mute @user [duration] [reason]', value: 'Timeout — e.g. `10m` `1h` `28d`' },
        { name: '/unmute @user',               value: 'Remove timeout' },
        { name: '/suspend @user [dur] [reason]', value: 'Strip all roles (optional auto-expire)' },
        { name: '/unsuspend @user',            value: "Restore suspended user's roles" },
        { name: '/lockdown [reason]',          value: 'Lock all text channels (saves exact overwrites)' },
        { name: '/unlockdown',                 value: 'Restore channels to exact pre-lockdown state' }
      ).setFooter({ text: 'Page 1/4 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 2/4: Anti-Nuke')
      .addFields(
        { name: '/config [type] [limit] [time]', value: 'Set anti-nuke thresholds — e.g. `3 / 10s`' },
        { name: '/setup [#channel]',             value: 'Set security log channel' },
        { name: '/antinuke enable|disable|status', value: 'Toggle or view all monitors + thresholds' },
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
        '• **Auto-revert** — deleted channels/roles rebuilt from snapshot on nuke'
      }).setFooter({ text: 'Page 2/4 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 3/4: Snapshots & Revert')
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
      }).setFooter({ text: 'Page 3/4 • Use buttons to navigate' }),

    new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 4/4: Fun & Features')
      .addFields(
        { name: '/ask [question]',               value: '🎱 Magic 8-Ball' },
        { name: '/say [message]',                value: 'Send a message as the bot (DMs & User App supported)' },
        { name: '/counting-toggle [#ch] [type]', value: 'Enable/disable counting — types: normal, even, odd, fibonacci, prime' },
        { name: '/starboard-enable [#ch] [n] [emoji]', value: 'Enable starboard (default: 3 ⭐, handles images/video/embeds)' },
        { name: '/starboard-disable',            value: 'Disable starboard' }
      )
      .addFields({ name: '⏱️ Duration Format', value: '`10s` · `5m` · `2h` · `1d` · `1w` — used in /mute /suspend /config' })
      .setFooter({ text: 'Page 4/4 • Daddy USSR Security Engine' })
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
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Cannot ban this user (insufficient hierarchy).', ephemeral: true });
      await target.ban({ reason });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🔨 Banned')
        .addFields({ name: 'User', value: `${user.tag}`, inline: true }, { name: 'Reason', value: reason, inline: true })
        .setTimestamp()] });
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
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
      await target.kick(reason);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle('👢 Kicked')
        .addFields({ name: 'User', value: `${user.tag}`, inline: true }, { name: 'Reason', value: reason, inline: true })
        .setTimestamp()] });
    }

    // ── /mute ─────────────────────────────────────────────────────────
    if (cn === 'mute') {
      if (!hasBotPerm(m, PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user = o.getUser('user'), durRaw = o.getString('duration') || '10m', reason = o.getString('reason') || 'No reason.';
      const durMs = parseDuration(durRaw);
      if (!durMs) return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `1d`.', ephemeral: true });
      if (durMs > 2419200000) return interaction.reply({ content: '❌ Max mute is 28 days.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await target.timeout(durMs, reason);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf39c12).setTitle('🔇 Muted')
        .addFields({ name: 'User', value: `${user.tag}`, inline: true },
                   { name: 'Duration', value: formatDuration(durMs), inline: true },
                   { name: 'Reason', value: reason, inline: true }).setTimestamp()] });
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
          'Daddy USSR: Lockdown lifted — exact restore'
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
        const enabled    = cfg.antinuke_enabled !== 0;
        const lines = MONITOR_TYPES.map(mt => {
          const t = thresholds.find(x => x.event_type === mt.value) || { limit_count: 3, time_window: 10000 };
          const special = ['vanity_update'].includes(mt.value) ? ' ⚡instant' :
                          ['webhook_create'].includes(mt.value) ? ' (delete+suspend)' : '';
          return `\`${mt.value.padEnd(16)}\` ${t.limit_count} / ${formatDuration(t.time_window)}${special}`;
        }).join('\n');
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(enabled ? 0x2ecc71 : 0xe74c3c)
          .setTitle(`🛡️ Anti-Nuke — ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`)
          .addFields({ name: '⚙️ Monitor Thresholds', value: lines })
          .addFields({ name: '⚡ Instant-Action (no threshold)', value: '• Vanity URL change → revert + suspend\n• Webhook create → deleted + threshold\n• Dangerous permission grant → revert + suspend\n• @everyone abuse → suspend' })
          .setFooter({ text: 'Change thresholds: /config | Toggle: /antinuke enable/disable' })
          .setTimestamp()] });
      }
    }

    // ── /config ───────────────────────────────────────────────────────
    if (cn === 'config') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const type = o.getString('type'), limit = o.getInteger('limit'), timeInput = o.getString('time');
      const windowMs = parseDuration(timeInput);
      if (!windowMs || windowMs < 1000)
        return interaction.reply({ content: '❌ Invalid time. Use: `10s`, `5m`, `2h`, `1d`, `1w`', ephemeral: true });
      db.setThreshold(g.id, type, limit, windowMs);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Threshold Updated')
        .addFields(
          { name: '📌 Event',  value: `\`${type}\``,                    inline: true },
          { name: '🔢 Limit',  value: `${limit} actions`,               inline: true },
          { name: '⏱️ Window', value: `\`${formatDuration(windowMs)}\``, inline: true }
        ).setFooter({ text: 'Formats: 10s • 5m • 2h • 1d • 1w' }).setTimestamp()] });
    }

    // ── /setup ────────────────────────────────────────────────────────
    if (cn === 'setup') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const ch = o.getChannel('channel');
      db.setLogChannel(g.id, ch.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📋 Log Channel Set')
        .setDescription(`Security logs → ${ch}`).setTimestamp()] });
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
      if (!hasBotPerm(m, PermissionFlagsBits.ManageRoles))
        return interaction.reply({ content: '❌ You need Manage Roles permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'Manual lockdown', durRaw = o.getString('duration');
      const durMs = durRaw ? parseDuration(durRaw) : null;
      if (durRaw && !durMs) return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `1d`.', ephemeral: true });

      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

      // Save CURRENT roles (fresh save — ignores any old save)
      const roles = target.roles.cache.filter(r => r.id !== g.id && r.name !== 'Suspended').map(r => r.id);
      db.saveRoles(g.id, user.id, roles.join(','), 1);

      let sr = g.roles.cache.find(r => r.name === 'Suspended');
      if (!sr) sr = await g.roles.create({ name: 'Suspended', permissions: [], color: 0x000000, reason: 'Daddy USSR: Suspended role' }).catch(() => null);
      if (!sr) return interaction.reply({ content: '❌ Could not create Suspended role. Check bot permissions.', ephemeral: true });
      await target.roles.set([sr.id], `Daddy USSR: ${reason}`).catch(e => console.error('Suspend err:', e.message));

      let expireText = 'Permanent';
      if (durMs) {
        const expiresAt = Date.now() + durMs;
        db.setSuspensionTimer(g.id, user.id, expiresAt);
        expireText = `<t:${Math.floor(expiresAt / 1000)}:R>`;
        scheduleUnsuspend(g.id, user.id, durMs);
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('⛔ User Suspended')
        .addFields(
          { name: '👤 User',         value: `${user.tag} \`(${user.id})\``,   inline: true },
          { name: user.bot ? '🤖' : '⚠️', value: user.bot ? 'Bot' : 'User', inline: true },
          { name: '⚠️ Reason',        value: reason,                           inline: false },
          { name: '⏱️ Duration',      value: expireText,                       inline: true },
          { name: '💾 Roles Saved',   value: `${roles.length} role(s) — fresh save`, inline: true }
        ).setTimestamp().setFooter({ text: 'Use /unsuspend to restore manually' })] });
    }

    // ── /unsuspend ────────────────────────────────────────────────────
    if (cn === 'unsuspend') {
      if (!hasBotPerm(m, PermissionFlagsBits.ManageRoles))
        return interaction.reply({ content: '❌ You need Manage Roles permission.', ephemeral: true });
      const user = o.getUser('user'), data = db.getRoles(g.id, user.id);
      if (!data) return interaction.reply({ content: '❌ No saved roles found for this user.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const valid = data.roles.split(',').filter(id => id && g.roles.cache.has(id));
      await target.roles.set(valid).catch(() => {});
      db.clearRoles(g.id, user.id);          // Clear so next suspend starts fresh
      db.deleteSuspensionTimer(g.id, user.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Unsuspended')
        .addFields({ name: '👤 User', value: `${user.tag}`, inline: true },
                   { name: '🔄 Roles Restored', value: `${valid.length} roles`, inline: true })
        .setTimestamp()] });
    }

    // ── /scan ─────────────────────────────────────────────────────────
    if (cn === 'scan') {
      await interaction.deferReply();
      const members = await g.members.fetch();
      const bots    = members.filter(mb => mb.user.bot);
      const lines   = bots.map(b => {
        const danger = b.permissions.has(PermissionFlagsBits.Administrator) ? '🚨 **ADMIN**' :
          (b.permissions.has(PermissionFlagsBits.ManageGuild) || b.permissions.has(PermissionFlagsBits.ManageRoles)) ? '⚠️ Elevated' : '✅ Safe';
        return `**${b.user.tag}** — ${danger}`;
      }).join('\n') || 'No bots.';
      const autoMod = (await g.autoModerationRules.fetch().catch(() => null))?.size > 0;
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🔍 Security Scan')
        .addFields({ name: '🤖 Bot Audit', value: lines.slice(0, 1024) },
                   { name: '🛡️ Native AutoMod', value: autoMod ? '✅ Enabled' : '❌ Disabled', inline: true },
                   { name: '💡 Tip', value: 'Use `/antinuke status` to view all monitor thresholds.', inline: true })
        .setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' })] });
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
              reason: 'Daddy USSR: Manual revert'
            }).catch(() => null);
            if (created && saved.permissionOverwrites?.length) {
              await created.permissionOverwrites.set(
                saved.permissionOverwrites.map(ow => ({ id: ow.id, type: ow.type, allow: BigInt(ow.allow), deny: BigInt(ow.deny) })),
                'Daddy USSR: Restore overwrites'
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
              reason: 'Daddy USSR: Manual revert'
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
  console.log(`🚀 Daddy USSR Online: ${client.user.tag}`);
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
  { name:'ban',    description:'Ban a member',    options:[{name:'user',type:6,required:true,description:'User'},{name:'reason',type:3,description:'Reason'}] },
  { name:'unban',  description:'Unban a user',    options:[{name:'user_id',type:3,required:true,description:'User ID'},{name:'reason',type:3,description:'Reason'}] },
  { name:'kick',   description:'Kick a member',   options:[{name:'user',type:6,required:true,description:'User'},{name:'reason',type:3,description:'Reason'}] },
  { name:'mute',   description:'Timeout a member', options:[{name:'user',type:6,required:true,description:'User'},{name:'duration',type:3,description:'e.g. 10m 1h 28d'},{name:'reason',type:3,description:'Reason'}] },
  { name:'unmute', description:'Remove a timeout', options:[{name:'user',type:6,required:true,description:'User'}] },

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
  { name:'config', description:'Set anti-nuke thresholds (Admin)', options:[
    {name:'type',type:3,required:true,description:'Event type',choices:MONITOR_TYPES},
    {name:'limit',type:4,required:true,description:'Action limit',min_value:1},
    {name:'time',type:3,required:true,description:'Window — e.g. 10s 5m 1h'}
  ]},
  { name:'setup', description:'Set log channel (Admin)', options:[{name:'channel',type:7,required:true,description:'Log channel',channel_types:[0]}] },
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
    {name:'duration',type:3,description:'Auto-unsuspend after — e.g. 10m 1h 7d'}
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
  { name:'help', description:'Show all commands with navigation', options:[{name:'page',type:4,description:'Page 1–4',min_value:1,max_value:4}] }
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
