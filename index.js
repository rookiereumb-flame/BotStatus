require('dotenv').config();
const {
  Client, GatewayIntentBits, AuditLogEvent,
  PermissionFlagsBits, EmbedBuilder, REST, Routes
} = require('discord.js');

const db = require('./src/database/db');
const { logAction, checkThreshold, suspendUser, sendLog } = require('./src/services/monitor');

const TOKEN     = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

// ── Duration parser: "10s" "5m" "2h" "1d" "1w" → milliseconds ──────────────
function parseDuration(input) {
  if (!input) return null;
  const str = input.trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|day|days?|w|wk|wks|weeks?)$/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = match[2][0]; // first char: s, m, h, d, w
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return Math.floor(val * map[unit]);
}

function formatDuration(ms) {
  if (ms < 60000)        return `${ms / 1000}s`;
  if (ms < 3600000)      return `${ms / 60000}m`;
  if (ms < 86400000)     return `${ms / 3600000}h`;
  if (ms < 604800000)    return `${ms / 86400000}d`;
  return `${ms / 604800000}w`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// ═══════════════════════════════════════════════════════════════════
//  SECURITY ENGINE — ANTI-NUKE MONITORS (12+)
// ═══════════════════════════════════════════════════════════════════

async function handleNukeEvent(guild, executorId, type, reason, evidence) {
  if (!executorId || executorId === client.user.id) return;
  const trust = db.getTrust(guild.id, executorId);
  if (trust && trust.level <= 2) return; // Immune

  logAction(guild.id, executorId, type);

  // Send informational log even before threshold
  const config = db.getGuildConfig(guild.id);
  if (config.log_channel_id) {
    const ch = await guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (ch) {
      ch.send({
        embeds: [new EmbedBuilder()
          .setColor(0xff6600)
          .setTitle(`⚠️ Security Monitor: ${type.replace(/_/g, ' ').toUpperCase()}`)
          .addFields(
            { name: '👤 Executor', value: `<@${executorId}> \`(${executorId})\``, inline: true },
            { name: '📋 Evidence', value: evidence, inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Daddy USSR Security Engine' })]
      }).catch(() => {});
    }
  }

  if (checkThreshold(guild.id, executorId, type)) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) await suspendUser(member, reason, evidence);
  }
}

// 1. Channel Delete
client.on('channelDelete', async c => {
  const e = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_delete', 'Channel Deletion Spam', `Deleted: #${c.name} (ID: ${c.id})`);
});

// 2. Channel Create
client.on('channelCreate', async c => {
  const e = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_create', 'Channel Creation Spam', `Created: #${c.name} (ID: ${c.id})`);
});

// 3. Channel Update
client.on('channelUpdate', async (o, n) => {
  const e = (await n.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(n.guild, e.executorId, 'channel_update', 'Channel Update Spam', `Updated: #${n.name} (ID: ${n.id})`);
});

// 4. Role Delete
client.on('roleDelete', async r => {
  const e = (await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(r.guild, e.executorId, 'role_delete', 'Role Deletion Spam', `Deleted Role: "${r.name}" (ID: ${r.id})`);
});

// 5. Role Create
client.on('roleCreate', async r => {
  const e = (await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(r.guild, e.executorId, 'role_create', 'Role Creation Spam', `Created Role: "${r.name}" (ID: ${r.id})`);
});

// 6. Role Update — with Hierarchy Protection
client.on('roleUpdate', async (o, n) => {
  const e = (await n.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 })).entries.first();
  if (!e) return;

  const botTop = n.guild.members.me?.roles.highest.id;
  if (n.name === 'Suspended' || n.id === botTop) {
    // Hierarchy attack — revert and suspend immediately
    await n.edit({ permissions: o.permissions.bitfield }).catch(() => {});
    const m = await n.guild.members.fetch(e.executorId).catch(() => null);
    if (m) await suspendUser(m, 'Unauthorized Hierarchy Edit', `Edited role: "${n.name}" (ID: ${n.id})`);
    return;
  }
  await handleNukeEvent(n.guild, e.executorId, 'role_update', 'Role Update Spam', `Updated Role: "${n.name}" (ID: ${n.id})`);
});

// 7. Member Ban
client.on('guildBanAdd', async b => {
  const e = (await b.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(b.guild, e.executorId, 'member_ban', 'Ban Spam', `Banned: ${b.user.tag} (ID: ${b.user.id})`);
});

// 8. Member Kick
client.on('guildMemberRemove', async m => {
  // Kick detection
  const kickLog = (await m.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 })).entries.first();
  if (kickLog && kickLog.targetId === m.id && Date.now() - kickLog.createdTimestamp < 5000) {
    await handleNukeEvent(m.guild, kickLog.executorId, 'member_kick', 'Kick Spam', `Kicked: ${m.user.tag} (ID: ${m.id})`);
  }

  // Role memory — save on leave
  const roles = m.roles.cache.filter(r => r.id !== m.guild.id).map(r => r.id);
  if (roles.length) db.saveRoles(m.guild.id, m.id, roles.join(','), 0);
});

// 9. Webhook Create
client.on('webhookUpdate', async c => {
  const e = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(c.guild, e.executorId, 'webhook_create', 'Webhook Creation Spam', `Channel: #${c.name} (ID: ${c.id})`);
});

// 10. Emoji Create
client.on('emojiCreate', async e => {
  const entry = (await e.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiCreate, limit: 1 })).entries.first();
  if (entry) await handleNukeEvent(e.guild, entry.executorId, 'emoji_create', 'Emoji Spam', `Created Emoji: :${e.name}: (ID: ${e.id})`);
});

// 11. Sticker Create
client.on('stickerCreate', async s => {
  const e = (await s.guild.fetchAuditLogs({ type: AuditLogEvent.StickerCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(s.guild, e.executorId, 'sticker_create', 'Sticker Spam', `Created Sticker: "${s.name}" (ID: ${s.id})`);
});

// 12. Guild Update (Vanity URL)
client.on('guildUpdate', async (o, n) => {
  if (o.vanityURLCode !== n.vanityURLCode) {
    const e = (await n.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 1 })).entries.first();
    if (e) await handleNukeEvent(n, e.executorId, 'vanity_update', 'Unauthorized Vanity URL Change', `Old: ${o.vanityURLCode || 'none'} → New: ${n.vanityURLCode || 'none'}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ROLE MEMORY — Restore on rejoin
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
//  ANTI-EVERYONE
// ═══════════════════════════════════════════════════════════════════

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (message.mentions.everyone) {
    const trust = db.getTrust(message.guild.id, message.author.id);
    if (!trust || trust.level > 2) {
      await message.delete().catch(() => {});
      const mb = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (mb) await suspendUser(mb, '@everyone / @here Abuse', `Message in #${message.channel.name}`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
//  STATE SNAPSHOT — Every 6 hours
// ═══════════════════════════════════════════════════════════════════

async function takeSnapshots() {
  for (const guild of client.guilds.cache.values()) {
    const data = {
      timestamp: Date.now(),
      channels: guild.channels.cache.map(c => ({
        id: c.id, name: c.name, type: c.type, parentId: c.parentId,
        permissionOverwrites: c.permissionOverwrites?.cache.map(o => ({
          id: o.id, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString()
        })) || []
      })),
      roles: guild.roles.cache.map(r => ({
        id: r.id, name: r.name, color: r.color,
        permissions: r.permissions.bitfield.toString(), position: r.position,
        hoist: r.hoist, mentionable: r.mentionable
      }))
    };
    db.saveSnapshot(guild.id, data);
  }
}

setInterval(takeSnapshots, 6 * 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════
//  AUTO-UNSUSPEND TIMER
// ═══════════════════════════════════════════════════════════════════

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
  db.saveRoles(guildId, userId, data.roles, 0);
  db.deleteSuspensionTimer(guildId, userId);

  // Log auto-unsuspend
  const config = db.getGuildConfig(guildId);
  if (config.log_channel_id) {
    const ch = await guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (ch) {
      ch.send({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ Auto-Unsuspend')
          .setDescription(`<@${userId}> suspension expired. Roles restored.`)
          .setTimestamp()
          .setFooter({ text: 'Daddy USSR Security Engine' })]
      }).catch(() => {});
    }
  }
}

function scheduleUnsuspend(guildId, userId, ms, guild) {
  // Cap setTimeout at ~24 days (Node.js max safe timeout)
  const MAX_TIMEOUT = 2_000_000_000;
  if (ms > MAX_TIMEOUT) {
    setTimeout(() => {
      scheduleUnsuspend(guildId, userId, ms - MAX_TIMEOUT, guild);
    }, MAX_TIMEOUT);
  } else {
    setTimeout(() => doUnsuspend(guildId, userId), ms);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SLASH COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName: cn, options: o } = interaction;

  // ── /say ──────────────────────────────────────────────────────────
  if (cn === 'say') {
    const text = o.getString('message');

    // If used in a server — require Manage Server permission
    if (interaction.guildId) {
      const hasPerm = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasPerm) {
        return interaction.reply({ content: '❌ You need **Manage Server** permission to use this.', ephemeral: true });
      }
    }
    // In DMs or User App context — allow freely (user already authorised the app)

    // Send message silently — no "reply" appearance
    try {
      await interaction.deferReply({ ephemeral: true });
      if (interaction.channel) {
        await interaction.channel.send(text);
      } else {
        // Fallback for contexts where channel object isn't available
        await interaction.editReply({ content: text });
        return;
      }
      await interaction.deleteReply().catch(() => {});
    } catch (err) {
      console.error('Say command error:', err);
      await interaction.editReply({ content: '❌ Could not send message.' }).catch(() => {});
    }
    return;
  }

  // All commands below require a guild
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
  }

  const { guild: g, member: m } = interaction;

  try {
    // ── /config ───────────────────────────────────────────────────────
    if (cn === 'config') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      }
      const type  = o.getString('type');
      const limit = o.getInteger('limit');
      const timeInput = o.getString('time');
      const windowMs  = parseDuration(timeInput);

      if (!windowMs || windowMs < 1000) {
        return interaction.reply({
          content: '❌ Invalid time format. Use: `10s`, `5m`, `2h`, `1d`, `1w`',
          ephemeral: true
        });
      }

      db.setThreshold(g.id, type, limit, windowMs);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('⚙️ Threshold Updated')
          .addFields(
            { name: '📌 Event',  value: `\`${type}\``,                   inline: true },
            { name: '🔢 Limit',  value: `${limit} actions`,              inline: true },
            { name: '⏱️ Window', value: `\`${formatDuration(windowMs)}\``, inline: true }
          )
          .setFooter({ text: 'Formats: 10s • 5m • 2h • 1d • 1w' })
          .setTimestamp()]
      });
    }

    // ── /setup ────────────────────────────────────────────────────────
    else if (cn === 'setup') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      }
      const ch = o.getChannel('channel');
      db.setLogChannel(g.id, ch.id);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📋 Log Channel Set')
          .setDescription(`Security logs will be sent to ${ch}.`)
          .setTimestamp()]
      });
    }

    // ── /trust ────────────────────────────────────────────────────────
    else if (cn === 'trust') {
      if (g.ownerId !== m.id) {
        return interaction.reply({ content: '❌ Server Owner only.', ephemeral: true });
      }
      const sub = o.getSubcommand(), user = o.getUser('user');

      if (sub === 'add') {
        const level = o.getInteger('level');
        db.addTrust(g.id, user.id, level);
        const labels = { 1: 'Level 1 — Owner (Fully Immune)', 2: 'Level 2 — Trustee (Nuke-Immune)', 3: 'Level 3 — Permit (Mod Access)' };
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('🤝 Trust Granted')
            .setDescription(`**${user.tag}** → ${labels[level]}`)
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp()]
        });
      } else if (sub === 'remove') {
        db.removeTrust(g.id, user.id);
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🚫 Trust Removed')
            .setDescription(`Removed trust from **${user.tag}**`)
            .setTimestamp()]
        });
      } else if (sub === 'list') {
        const list = db.listTrust(g.id);
        const labels = { 1: 'Owner/Immune', 2: 'Trustee/Immune', 3: 'Permit/Mod' };
        const desc = list.length
          ? list.map(t => `<@${t.user_id}> — Level ${t.level} (${labels[t.level] || '?'})`).join('\n')
          : 'No trusted users set.';
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🤝 Trusted Users')
            .setDescription(desc)
            .setTimestamp()]
        });
      }
    }

    // ── /suspend ──────────────────────────────────────────────────────
    else if (cn === 'suspend') {
      const topRole = m.roles.highest;
      const botTop  = g.members.me.roles.highest;
      if (topRole.comparePositionTo(botTop) <= 0 && g.ownerId !== m.id) {
        return interaction.reply({ content: '❌ Your role must be above the bot to use this.', ephemeral: true });
      }

      const user        = o.getUser('user');
      const reason      = o.getString('reason') || 'Manual lockdown';
      const durationRaw = o.getString('duration');
      const durationMs  = durationRaw ? parseDuration(durationRaw) : null;

      if (durationRaw && !durationMs) {
        return interaction.reply({ content: '❌ Invalid duration. Use: `10m`, `1h`, `1d`, `7d`', ephemeral: true });
      }

      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });

      // Save roles
      const roles = target.roles.cache.filter(r => r.id !== g.id).map(r => r.id);
      db.saveRoles(g.id, user.id, roles.join(','), 1);

      // Ensure Suspended role exists
      let sr = g.roles.cache.find(r => r.name === 'Suspended');
      if (!sr) {
        sr = await g.roles.create({
          name: 'Suspended',
          permissions: [],
          colors: [0x000000],
          reason: 'Daddy USSR: Auto-created Suspended role'
        }).catch(() => null);
      }
      if (!sr) return interaction.reply({ content: '❌ Could not create Suspended role. Check bot permissions.', ephemeral: true });

      // Apply suspension
      await target.roles.set([sr.id], `Daddy USSR: ${reason}`).catch(err => {
        console.error('Suspend role set error:', err.message);
      });

      // Schedule auto-unsuspend if duration given
      let expireText = 'Permanent';
      if (durationMs) {
        const expiresAt = Date.now() + durationMs;
        db.setSuspensionTimer(g.id, user.id, expiresAt);
        expireText = `<t:${Math.floor(expiresAt / 1000)}:R>`;
        scheduleUnsuspend(g.id, user.id, durationMs, g);
      }

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('⛔ User Suspended')
          .addFields(
            { name: '👤 User',     value: `${user.tag} \`(${user.id})\``, inline: true },
            { name: '⚠️ Reason',   value: reason,                          inline: true },
            { name: '⏱️ Duration', value: expireText,                      inline: true },
            { name: '💾 Roles Saved', value: `${roles.length} role(s) saved for restore`, inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Use /unsuspend to restore manually' })]
      });
    }

    // ── /unsuspend ────────────────────────────────────────────────────
    else if (cn === 'unsuspend') {
      const topRole = m.roles.highest;
      const botTop  = g.members.me.roles.highest;
      if (topRole.comparePositionTo(botTop) <= 0 && g.ownerId !== m.id) {
        return interaction.reply({ content: '❌ Your role must be above the bot to use this.', ephemeral: true });
      }
      const user = o.getUser('user');
      const data = db.getRoles(g.id, user.id);
      if (!data) return interaction.reply({ content: '❌ No role history found for this user.', ephemeral: true });

      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

      const valid = data.roles.split(',').filter(id => id && g.roles.cache.has(id));
      await target.roles.set(valid).catch(() => {});
      db.saveRoles(g.id, user.id, data.roles, 0);
      db.deleteSuspensionTimer(g.id, user.id); // Cancel any pending auto-unsuspend

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ User Unsuspended')
          .addFields(
            { name: '👤 User',           value: `${user.tag}`,         inline: true },
            { name: '🔄 Roles Restored', value: `${valid.length} roles`, inline: true }
          )
          .setTimestamp()]
      });
    }

    // ── /scan ─────────────────────────────────────────────────────────
    else if (cn === 'scan') {
      await interaction.deferReply();
      const members = await g.members.fetch();
      const bots = members.filter(mb => mb.user.bot);

      const lines = bots.map(b => {
        const hasAdmin = b.permissions.has(PermissionFlagsBits.Administrator);
        const hasDanger = b.permissions.has(PermissionFlagsBits.ManageGuild) ||
                          b.permissions.has(PermissionFlagsBits.ManageRoles) ||
                          b.permissions.has(PermissionFlagsBits.ManageChannels);
        const managed = b.roles.cache.filter(r => r.managed);
        let status = '✅ Low Risk';
        if (hasAdmin)   status = '🚨 **CRITICAL** — Has Administrator';
        else if (hasDanger) status = '⚠️ Medium Risk — Has dangerous perms';
        return `**${b.user.tag}** (${managed.size} int. roles)\n${status}`;
      }).join('\n\n') || 'No bots found.';

      // Check native automod
      const autoModRules = await g.autoModerationRules.fetch().catch(() => null);
      const autoModStatus = autoModRules?.size > 0 ? '✅ Enabled' : '❌ Disabled';

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('🔍 Daddy USSR — Security Scan')
          .addFields(
            { name: '🤖 Bot Audit', value: lines.slice(0, 1024), inline: false },
            { name: '🛡️ Discord Native AutoMod', value: autoModStatus, inline: true },
            { name: '💡 Recommendation', value: 'Give bots the minimum permissions needed. Avoid granting Administrator.', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Daddy USSR Security Engine' })]
      });
    }

    // ── /snapshot ─────────────────────────────────────────────────────
    else if (cn === 'snapshot') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      }
      const snap = db.getSnapshot(g.id);
      if (!snap) return interaction.reply({ content: '❌ No snapshot found yet. One is taken automatically every 6 hours.', ephemeral: true });
      const data = JSON.parse(snap.data);
      const ts = new Date(snap.timestamp).toUTCString();
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📸 Last Server Snapshot')
          .addFields(
            { name: '🕒 Taken At', value: ts, inline: false },
            { name: '📁 Channels', value: `${data.channels.length} saved`, inline: true },
            { name: '🔰 Roles', value: `${data.roles.length} saved`, inline: true }
          )
          .setFooter({ text: 'Use /restore to rebuild from snapshot (coming soon)' })
          .setTimestamp()]
      });
    }

    // ── /help ─────────────────────────────────────────────────────────
    else if (cn === 'help') {
      const page = o.getInteger('page') || 1;
      const pages = [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🛡️ Daddy USSR — Security Engine  [Page 1/3]')
          .setDescription('Daddy USSR — a full security bot. All settings via slash commands, all data in SQLite.')
          .addFields(
            { name: '⚙️ /config', value: 'Set anti-nuke thresholds\n`/config [type] [limit] [time]`', inline: false },
            { name: '📋 /setup', value: 'Set the security log channel\n`/setup [#channel]`', inline: false },
            { name: '🤝 /trust', value: 'Manage trusted users\n`/trust add/remove/list [@user] [level]`\n**L1** = Owner/Immune | **L2** = Trustee | **L3** = Permit', inline: false },
            { name: '💬 /say', value: 'Send a message as the bot\n`/say [message]` — works in DMs, User App, and servers', inline: false }
          )
          .setFooter({ text: 'Use /help page:2 for more' }),
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🛡️ Daddy USSR — Security Engine  [Page 2/3]')
          .addFields(
            { name: '⛔ /suspend', value: 'Manually suspend a user (strips all roles)\n`/suspend [@user] [reason]`', inline: false },
            { name: '✅ /unsuspend', value: 'Restore a suspended user\'s roles\n`/unsuspend [@user]`', inline: false },
            { name: '🔍 /scan', value: 'Audit all bots — flags risky perms & checks AutoMod\n`/scan`', inline: false },
            { name: '📸 /snapshot', value: 'View the last server state snapshot\n`/snapshot`', inline: false }
          )
          .setFooter({ text: 'Use /help page:3 for monitors list' }),
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🛡️ Daddy USSR — Security Engine  [Page 3/3]')
          .setDescription('**12 Active Monitors** (default: 3 actions / 10s = suspension)')
          .addFields(
            { name: '📁 Channel Monitors', value: '`channel_delete` `channel_create` `channel_update`', inline: false },
            { name: '🔰 Role Monitors', value: '`role_delete` `role_create` `role_update`', inline: false },
            { name: '👥 Member Monitors', value: '`member_ban` `member_kick`', inline: false },
            { name: '🔗 Other Monitors', value: '`webhook_create` `emoji_create` `sticker_create` `vanity_update`', inline: false },
            { name: '⚡ Auto-Features', value: '• **Anti-Everyone** — instant suspend on @everyone abuse\n• **Role Memory** — save/restore roles on leave/join\n• **State Snapshot** — every 6h for shadow restore\n• **Hierarchy Protection** — reverts Suspended role edits', inline: false }
          )
          .setFooter({ text: 'Daddy USSR Security Engine' })
      ];

      const embed = pages[Math.max(0, Math.min(page - 1, pages.length - 1))];
      await interaction.reply({ embeds: [embed] });
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
  console.log(`🚀 Daddy USSR Security Engine Online: ${client.user.tag}`);

  // Take first snapshot on startup
  await takeSnapshots();
  console.log(`📸 Initial snapshot taken for ${client.guilds.cache.size} guild(s).`);

  // Restore any pending suspension timers that survived a restart
  const pending = db.getAllSuspensionTimers();
  let restored = 0;
  for (const row of pending) {
    const remaining = row.expires_at - Date.now();
    if (remaining <= 0) {
      await doUnsuspend(row.guild_id, row.user_id);
    } else {
      scheduleUnsuspend(row.guild_id, row.user_id, remaining);
      restored++;
    }
  }
  if (restored > 0) console.log(`⏱️ Restored ${restored} pending suspension timer(s).`);
});

client.login(TOKEN);

// ═══════════════════════════════════════════════════════════════════
//  COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════

const MONITOR_TYPES = [
  { name: 'Channel Delete',   value: 'channel_delete'  },
  { name: 'Channel Create',   value: 'channel_create'  },
  { name: 'Channel Update',   value: 'channel_update'  },
  { name: 'Role Delete',      value: 'role_delete'     },
  { name: 'Role Create',      value: 'role_create'     },
  { name: 'Role Update',      value: 'role_update'     },
  { name: 'Member Ban',       value: 'member_ban'      },
  { name: 'Member Kick',      value: 'member_kick'     },
  { name: 'Webhook Create',   value: 'webhook_create'  },
  { name: 'Emoji Create',     value: 'emoji_create'    },
  { name: 'Sticker Create',   value: 'sticker_create'  },
  { name: 'Vanity URL',       value: 'vanity_update'   },
];

const commands = [
  // /say — works in guilds, DMs, and as a User App
  {
    name: 'say',
    description: 'Send a message as the bot',
    integration_types: [0, 1], // 0 = Guild, 1 = User App
    contexts: [0, 1, 2],       // 0 = Guild, 1 = Bot DM, 2 = Private (User App)
    options: [{ name: 'message', type: 3, description: 'Message to send', required: true }]
  },

  // Security commands
  {
    name: 'config',
    description: 'Set anti-nuke thresholds (Admin only)',
    options: [
      { name: 'type',  type: 3, description: 'Monitor type', required: true, choices: MONITOR_TYPES },
      { name: 'limit', type: 4, description: 'Max actions before suspension', required: true, min_value: 1 },
      { name: 'time',  type: 3, description: 'Time window — e.g. 10s, 5m, 2h, 1d, 1w', required: true }
    ]
  },
  {
    name: 'setup',
    description: 'Set the security log channel (Admin only)',
    options: [{ name: 'channel', type: 7, description: 'Log channel', channel_types: [0], required: true }]
  },
  {
    name: 'trust',
    description: 'Manage trusted users (Owner only)',
    options: [
      {
        name: 'add', type: 1, description: 'Add a trusted user',
        options: [
          { name: 'user', type: 6, description: 'User to trust', required: true },
          { name: 'level', type: 4, description: 'Trust level', required: true,
            choices: [{ name: '1 — Owner (Fully Immune)', value: 1 }, { name: '2 — Trustee (Nuke-Immune)', value: 2 }, { name: '3 — Permit (Mod Access)', value: 3 }]
          }
        ]
      },
      { name: 'remove', type: 1, description: 'Remove a trusted user', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
      { name: 'list',   type: 1, description: 'List all trusted users' }
    ]
  },
  {
    name: 'suspend',
    description: 'Manually suspend a user (removes all roles)',
    options: [
      { name: 'user',     type: 6, description: 'User to suspend',                        required: true },
      { name: 'reason',   type: 3, description: 'Reason for suspension' },
      { name: 'duration', type: 3, description: 'Auto-unsuspend after — e.g. 10m, 1h, 1d, 7d' }
    ]
  },
  {
    name: 'unsuspend',
    description: "Restore a suspended user's original roles",
    options: [{ name: 'user', type: 6, description: 'User to restore', required: true }]
  },
  { name: 'scan', description: 'Audit all bots and check server security' },
  { name: 'snapshot', description: 'View the last saved server state snapshot' },
  {
    name: 'help',
    description: 'Show all commands and security modules',
    options: [{ name: 'page', type: 4, description: 'Page number (1–3)', min_value: 1, max_value: 3 }]
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ All commands registered.');
  } catch (err) {
    console.error('❌ Command registration failed:', err.message);
  }
})();
