require('dotenv').config();
const {
  Client, GatewayIntentBits, AuditLogEvent, ChannelType,
  PermissionFlagsBits, EmbedBuilder, REST, Routes, OverwriteType
} = require('discord.js');

const db = require('./src/database/db');
const { logAction, checkThreshold, suspendUser, sendLog } = require('./src/services/monitor');

const TOKEN     = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

// ─── Duration helpers ────────────────────────────────────────────────────────
function parseDuration(input) {
  if (!input) return null;
  const str = input.trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|day|days?|w|wk|wks|weeks?)$/);
  if (!match) return null;
  const val  = parseFloat(match[1]);
  const unit = match[2][0];
  const map  = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return Math.floor(val * map[unit]);
}
function formatDuration(ms) {
  if (ms < 60000)     return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000)   return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000)  return `${Math.round(ms / 3600000)}h`;
  if (ms < 604800000) return `${Math.round(ms / 86400000)}d`;
  return `${Math.round(ms / 604800000)}w`;
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
//  AUTO-REVERT — Restore deleted channels/roles from last snapshot
// ═══════════════════════════════════════════════════════════════════

async function autoRevertChannel(guild, deletedChannel) {
  const snap = db.getSnapshot(guild.id);
  if (!snap) return;
  const data = JSON.parse(snap.data);
  const saved = data.channels?.find(c => c.id === deletedChannel.id);
  if (!saved) return;

  try {
    const restored = await guild.channels.create({
      name: saved.name,
      type: saved.type,
      parent: saved.parentId || null,
      reason: 'Daddy USSR: Auto-revert after nuke detection'
    });
    await sendLog(guild, new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🔄 Auto-Revert: Channel Restored')
      .addFields(
        { name: '📁 Channel', value: `#${saved.name} → ${restored}`, inline: true },
        { name: '🔍 Trigger', value: 'Anti-nuke threshold exceeded', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Daddy USSR Security Engine' })
    );
  } catch (e) {
    console.error('Auto-revert channel failed:', e.message);
  }
}

async function autoRevertRole(guild, deletedRole) {
  const snap = db.getSnapshot(guild.id);
  if (!snap) return;
  const data = JSON.parse(snap.data);
  const saved = data.roles?.find(r => r.id === deletedRole.id);
  if (!saved) return;

  try {
    const restored = await guild.roles.create({
      name: saved.name,
      colors: [saved.color || 0x000000],
      permissions: BigInt(saved.permissions || '0'),
      hoist: saved.hoist || false,
      mentionable: saved.mentionable || false,
      reason: 'Daddy USSR: Auto-revert after nuke detection'
    });
    await sendLog(guild, new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🔄 Auto-Revert: Role Restored')
      .addFields(
        { name: '🔰 Role', value: `"${saved.name}" → ${restored}`, inline: true },
        { name: '🔍 Trigger', value: 'Anti-nuke threshold exceeded', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Daddy USSR Security Engine' })
    );
  } catch (e) {
    console.error('Auto-revert role failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SECURITY ENGINE — ANTI-NUKE MONITORS (12+)
// ═══════════════════════════════════════════════════════════════════

async function handleNukeEvent(guild, executorId, type, reason, evidence, revertTarget = null) {
  if (!executorId || executorId === client.user.id) return;
  const cfg = db.getGuildConfig(guild.id);
  if (cfg.antinuke_enabled === 0) return; // Globally disabled

  const trust = db.getTrust(guild.id, executorId);
  if (trust && trust.level <= 2) return;

  logAction(guild.id, executorId, type);

  // Per-event informational log
  await sendLog(guild, new EmbedBuilder()
    .setColor(0xff6600)
    .setTitle(`⚠️ Monitor: ${type.replace(/_/g, ' ').toUpperCase()}`)
    .addFields(
      { name: '👤 Executor', value: `<@${executorId}> \`(${executorId})\``, inline: true },
      { name: '📋 Evidence', value: evidence, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Daddy USSR Security Engine' })
  );

  if (checkThreshold(guild.id, executorId, type)) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) await suspendUser(member, reason, evidence);

    // Auto-revert
    if (revertTarget) {
      if (type === 'channel_delete') await autoRevertChannel(guild, revertTarget);
      if (type === 'role_delete')    await autoRevertRole(guild, revertTarget);
    }
  }
}

// ── 12 Monitors ─────────────────────────────────────────────────────────────

client.on('channelDelete', async c => {
  const e = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_delete', 'Channel Deletion Spam', `Deleted: #${c.name} (ID: ${c.id})`, c);
});
client.on('channelCreate', async c => {
  const e = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(c.guild, e.executorId, 'channel_create', 'Channel Creation Spam', `Created: #${c.name} (ID: ${c.id})`);
});
client.on('channelUpdate', async (o, n) => {
  const e = (await n.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(n.guild, e.executorId, 'channel_update', 'Channel Update Spam', `Updated: #${n.name} (ID: ${n.id})`);
});
client.on('roleDelete', async r => {
  const e = (await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(r.guild, e.executorId, 'role_delete', 'Role Deletion Spam', `Deleted Role: "${r.name}" (ID: ${r.id})`, r);
});
client.on('roleCreate', async r => {
  const e = (await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(r.guild, e.executorId, 'role_create', 'Role Creation Spam', `Created Role: "${r.name}" (ID: ${r.id})`);
});
client.on('roleUpdate', async (o, n) => {
  const e = (await n.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 })).entries.first();
  if (!e) return;
  const botTop = n.guild.members.me?.roles.highest.id;
  if (n.name === 'Suspended' || n.id === botTop) {
    await n.edit({ permissions: o.permissions.bitfield }).catch(() => {});
    const m = await n.guild.members.fetch(e.executorId).catch(() => null);
    if (m) await suspendUser(m, 'Unauthorized Hierarchy Edit', `Edited role: "${n.name}" (ID: ${n.id})`);
    return;
  }
  await handleNukeEvent(n.guild, e.executorId, 'role_update', 'Role Update Spam', `Updated: "${n.name}" (ID: ${n.id})`);
});
client.on('guildBanAdd', async b => {
  const e = (await b.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(b.guild, e.executorId, 'member_ban', 'Ban Spam', `Banned: ${b.user.tag} (ID: ${b.user.id})`);
});
client.on('guildMemberRemove', async m => {
  const kickLog = (await m.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 })).entries.first();
  if (kickLog && kickLog.targetId === m.id && Date.now() - kickLog.createdTimestamp < 5000) {
    await handleNukeEvent(m.guild, kickLog.executorId, 'member_kick', 'Kick Spam', `Kicked: ${m.user.tag}`);
  }
  const roles = m.roles.cache.filter(r => r.id !== m.guild.id).map(r => r.id);
  if (roles.length) db.saveRoles(m.guild.id, m.id, roles.join(','), 0);
});
client.on('webhookUpdate', async c => {
  const e = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(c.guild, e.executorId, 'webhook_create', 'Webhook Creation Spam', `Channel: #${c.name}`);
});
client.on('emojiCreate', async e => {
  const entry = (await e.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiCreate, limit: 1 })).entries.first();
  if (entry) await handleNukeEvent(e.guild, entry.executorId, 'emoji_create', 'Emoji Spam', `:${e.name}: (ID: ${e.id})`);
});
client.on('stickerCreate', async s => {
  const e = (await s.guild.fetchAuditLogs({ type: AuditLogEvent.StickerCreate, limit: 1 })).entries.first();
  if (e) await handleNukeEvent(s.guild, e.executorId, 'sticker_create', 'Sticker Spam', `"${s.name}" (ID: ${s.id})`);
});
client.on('guildUpdate', async (o, n) => {
  if (o.vanityURLCode !== n.vanityURLCode) {
    const e = (await n.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 1 })).entries.first();
    if (e) await handleNukeEvent(n, e.executorId, 'vanity_update', 'Vanity URL Changed', `${o.vanityURLCode || 'none'} → ${n.vanityURLCode || 'none'}`);
  }
});

// ── Role Memory ──────────────────────────────────────────────────────────────
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

// ── Anti-Everyone ────────────────────────────────────────────────────────────
// ── Counting Game + @everyone protection ────────────────────────────────────
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  // @everyone / @here protection
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
  if (counting?.enabled && counting.channel_id === message.channel.id) {
    const num      = parseInt(message.content.trim());
    const expected = (counting.current_count || 0) + 1;
    if (isNaN(num) || num !== expected) {
      await message.react('❌').catch(() => {});
      db.resetCount(message.guild.id);
      return message.channel.send(`❌ **${message.author.username}** ruined it at **${counting.current_count}**! Back to **0** — next: **1**`);
    }
    if (counting.last_user_id === message.author.id) {
      await message.react('❌').catch(() => {});
      db.resetCount(message.guild.id);
      return message.channel.send(`❌ No counting twice in a row! Back to **0** — next: **1**`);
    }
    db.updateCount(message.guild.id, num, message.author.id);
    await message.react('✅').catch(() => {});
  }
});

// ── Starboard ────────────────────────────────────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction.message.guild || reaction.emoji.name !== '⭐') return;
  const sb = db.getStarboard(reaction.message.guild.id);
  if (!sb?.enabled || !sb.channel_id) return;
  if (reaction.count < sb.threshold) return;
  if (db.getStarboardPost(reaction.message.guild.id, reaction.message.id)) return;
  const sbCh = reaction.message.guild.channels.cache.get(sb.channel_id);
  if (!sbCh) return;
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: reaction.message.author.tag, iconURL: reaction.message.author.displayAvatarURL() })
    .setDescription(reaction.message.content || '*[no text]*')
    .addFields({ name: 'Source', value: `[Jump](${reaction.message.url})` })
    .setTimestamp(reaction.message.createdAt);
  if (reaction.message.attachments.size > 0) embed.setImage(reaction.message.attachments.first().url);
  const sent = await sbCh.send({ content: `⭐ **${reaction.count}** in <#${reaction.message.channelId}>`, embeds: [embed] }).catch(() => null);
  if (sent) db.saveStarboardPost(reaction.message.guild.id, reaction.message.id, sent.id);
});

// ── State Snapshot (every 6h) ────────────────────────────────────────────────
async function takeSnapshots() {
  for (const guild of client.guilds.cache.values()) {
    const data = {
      timestamp: Date.now(),
      channels: guild.channels.cache.map(c => ({
        id: c.id, name: c.name, type: c.type, parentId: c.parentId,
        permissionOverwrites: c.permissionOverwrites?.cache.map(o => ({
          id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString()
        })) || []
      })),
      roles: guild.roles.cache.map(r => ({
        id: r.id, name: r.name, color: r.color, hoist: r.hoist,
        permissions: r.permissions.bitfield.toString(), position: r.position, mentionable: r.mentionable
      }))
    };
    db.saveSnapshot(guild.id, data);
  }
}
setInterval(takeSnapshots, 6 * 60 * 60 * 1000);

// ── Auto-Unsuspend Timer ─────────────────────────────────────────────────────
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
  await sendLog(guild, new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅ Auto-Unsuspend')
    .setDescription(`<@${userId}> — suspension expired, roles restored.`)
    .setTimestamp()
    .setFooter({ text: 'Daddy USSR Security Engine' })
  );
}
function scheduleUnsuspend(guildId, userId, ms) {
  const MAX = 2_000_000_000;
  if (ms > MAX) { setTimeout(() => scheduleUnsuspend(guildId, userId, ms - MAX), MAX); }
  else           { setTimeout(() => doUnsuspend(guildId, userId), ms); }
}

// ═══════════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════

const MAGIC8 = [
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.',
  'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.',
  "Don't count on it.", 'My sources say no.', 'Very doubtful.',
  'Cannot predict now.', 'Ask again later.'
];

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName: cn, options: o } = interaction;

  // ── /say ────────────────────────────────────────────────────────
  if (cn === 'say') {
    const text = o.getString('message');
    if (interaction.guildId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need **Manage Server** permission.', ephemeral: true });
    }
    try {
      await interaction.deferReply({ ephemeral: true });
      if (interaction.channel) {
        await interaction.channel.send(text);
        await interaction.deleteReply().catch(() => {});
      } else {
        await interaction.editReply({ content: text });
      }
    } catch (e) {
      await interaction.editReply({ content: '❌ Could not send message.' }).catch(() => {});
    }
    return;
  }

  // ── /ask ────────────────────────────────────────────────────────
  if (cn === 'ask') {
    const answer = MAGIC8[Math.floor(Math.random() * MAGIC8.length)];
    return interaction.reply({ embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: '❓ Question', value: o.getString('question') },
        { name: '🔮 Answer',   value: `**${answer}**` }
      )] });
  }

  // All other commands require a guild
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ This command only works in a server.', ephemeral: true });
  }
  const { guild: g, member: m } = interaction;

  try {
    // ── /ban ──────────────────────────────────────────────────────
    if (cn === 'ban') {
      if (!m.permissions.has(PermissionFlagsBits.BanMembers))
        return interaction.reply({ content: '❌ You need Ban Members permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'No reason.';
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Cannot ban this user.', ephemeral: true });
      await target.ban({ reason });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🔨 Banned')
        .addFields({ name: 'User', value: `${user.tag}`, inline: true }, { name: 'Reason', value: reason, inline: true })
        .setTimestamp()] });
    }

    // ── /unban ────────────────────────────────────────────────────
    if (cn === 'unban') {
      if (!m.permissions.has(PermissionFlagsBits.BanMembers))
        return interaction.reply({ content: '❌ You need Ban Members permission.', ephemeral: true });
      const uid = o.getString('user_id'), reason = o.getString('reason') || 'No reason.';
      await g.members.unban(uid, reason).catch(() => null);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Unbanned')
        .setDescription(`User \`${uid}\` has been unbanned.\n**Reason:** ${reason}`).setTimestamp()] });
    }

    // ── /kick ─────────────────────────────────────────────────────
    if (cn === 'kick') {
      if (!m.permissions.has(PermissionFlagsBits.KickMembers))
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

    // ── /mute ─────────────────────────────────────────────────────
    if (cn === 'mute') {
      if (!m.permissions.has(PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user = o.getUser('user'), durRaw = o.getString('duration') || '10m', reason = o.getString('reason') || 'No reason.';
      const durMs = parseDuration(durRaw);
      if (!durMs) return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `1d`.', ephemeral: true });
      if (durMs > 2419200000) return interaction.reply({ content: '❌ Max mute duration is 28 days.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await target.timeout(durMs, reason);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf39c12).setTitle('🔇 Muted')
        .addFields(
          { name: 'User',     value: `${user.tag}`,          inline: true },
          { name: 'Duration', value: formatDuration(durMs),  inline: true },
          { name: 'Reason',   value: reason,                 inline: true }
        ).setTimestamp()] });
    }

    // ── /unmute ───────────────────────────────────────────────────
    if (cn === 'unmute') {
      if (!m.permissions.has(PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user   = o.getUser('user');
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await target.timeout(null);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🔊 Unmuted')
        .setDescription(`**${user.tag}** has been unmuted.`).setTimestamp()] });
    }

    // ── /counting-toggle ──────────────────────────────────────────
    if (cn === 'counting-toggle') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
      const ch = o.getChannel('channel');
      const existing  = db.getCounting(g.id);
      const newState  = existing ? !existing.enabled : true;
      db.setCounting(g.id, ch.id, newState);
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(newState ? 0x2ecc71 : 0xe74c3c)
        .setTitle(`🔢 Counting ${newState ? 'Enabled' : 'Disabled'}`)
        .setDescription(newState
          ? `Counting game is now active in ${ch}.\nStart at **1**!`
          : `Counting game disabled in ${ch}.`)
        .setTimestamp()] });
    }

    // ── /starboard-enable ─────────────────────────────────────────
    if (cn === 'starboard-enable') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
      const ch = o.getChannel('channel'), threshold = o.getInteger('threshold') || 3;
      db.setStarboard(g.id, ch.id, true, threshold);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('⭐ Starboard Enabled')
        .setDescription(`Posts with **${threshold}** ⭐ go to ${ch}.`).setTimestamp()] });
    }

    // ── /starboard-disable ────────────────────────────────────────
    if (cn === 'starboard-disable') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
      db.disableStarboard(g.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('⭐ Starboard Disabled')
        .setDescription('Starboard turned off.').setTimestamp()] });
    }

    // ── /lockdown ─────────────────────────────────────────────────
    if (cn === 'lockdown') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ content: '❌ You need Manage Channels.', ephemeral: true });
      await interaction.deferReply();
      const reason = o.getString('reason') || 'Security lockdown';
      const everyone = g.roles.everyone;
      let locked = 0;
      for (const [, ch] of g.channels.cache) {
        if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) continue;
        const currentPerm = ch.permissionOverwrites.cache.get(everyone.id);
        db.saveLockdownBackup(g.id, ch.id, JSON.stringify({
          allow: currentPerm?.allow.bitfield.toString() || '0',
          deny:  currentPerm?.deny.bitfield.toString()  || '0'
        }));
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false, AddReactions: false }, { reason }).catch(() => {});
        locked++;
      }
      await sendLog(g, new EmbedBuilder()
        .setColor(0xff0000).setTitle('🔒 Server Lockdown Active')
        .addFields({ name: 'Reason', value: reason }, { name: 'Channels', value: `${locked} locked` })
        .setTimestamp().setFooter({ text: `By ${m.user.tag}` })
      );
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('🔒 Server Locked Down')
        .setDescription(`**${locked}** channels locked.\n**Reason:** ${reason}\n\nUse \`/unlockdown\` to restore.`).setTimestamp()] });
    }

    // ── /unlockdown ───────────────────────────────────────────────
    if (cn === 'unlockdown') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ content: '❌ You need Manage Channels.', ephemeral: true });
      await interaction.deferReply();
      const backups = db.getLockdownBackups(g.id);
      if (!backups.length) return interaction.editReply({ content: '❌ No lockdown backup found.' });
      let restored = 0;
      for (const row of backups) {
        const ch = g.channels.cache.get(row.channel_id);
        if (!ch) continue;
        const saved = JSON.parse(row.perms_json);
        const allow = BigInt(saved.allow), deny = BigInt(saved.deny);
        if (allow === 0n && deny === 0n) {
          await ch.permissionOverwrites.delete(g.roles.everyone).catch(() => {});
        } else {
          await ch.permissionOverwrites.edit(g.roles.everyone, {
            SendMessages: allow & PermissionFlagsBits.SendMessages ? true : deny & PermissionFlagsBits.SendMessages ? false : null,
            AddReactions: allow & PermissionFlagsBits.AddReactions ? true : deny & PermissionFlagsBits.AddReactions ? false : null
          }).catch(() => {});
        }
        restored++;
      }
      db.clearLockdownBackup(g.id);
      await sendLog(g, new EmbedBuilder()
        .setColor(0x2ecc71).setTitle('🔓 Lockdown Lifted')
        .addFields({ name: 'Channels Restored', value: `${restored}` })
        .setTimestamp().setFooter({ text: `By ${m.user.tag}` })
      );
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🔓 Lockdown Lifted')
        .setDescription(`**${restored}** channels restored to previous state.`).setTimestamp()] });
    }

    // ── /antinuke ─────────────────────────────────────────────────
    if (cn === 'antinuke') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const sub = o.getSubcommand();

      if (sub === 'enable') {
        db.setAntinuke(g.id, 1);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71)
          .setTitle('✅ Anti-Nuke Enabled').setDescription('All 12 monitors are now active.').setTimestamp()] });
      }
      if (sub === 'disable') {
        db.setAntinuke(g.id, 0);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c)
          .setTitle('⛔ Anti-Nuke Disabled').setDescription('⚠️ All monitors are now off. Re-enable with `/antinuke enable`.').setTimestamp()] });
      }
      if (sub === 'status') {
        const cfg       = db.getGuildConfig(g.id);
        const thresholds = db.getAllThresholds(g.id);
        const enabled   = cfg.antinuke_enabled !== 0;
        const lines = MONITOR_TYPES.map(mt => {
          const t = thresholds.find(x => x.event_type === mt.value) || { limit_count: 3, time_window: 10000 };
          return `\`${mt.value.padEnd(16)}\` ${t.limit_count} actions / ${formatDuration(t.time_window)}`;
        }).join('\n');
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(enabled ? 0x2ecc71 : 0xe74c3c)
          .setTitle(`🛡️ Anti-Nuke Status — ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`)
          .addFields({ name: '⚙️ Thresholds (per event)', value: lines })
          .setFooter({ text: 'Change with /config | Toggle with /antinuke enable|disable' })
          .setTimestamp()] });
      }
    }

    // ── /revert ───────────────────────────────────────────────────
    if (cn === 'revert') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const snap = db.getSnapshot(g.id);
      if (!snap) return interaction.reply({ content: '❌ No snapshot found yet. One is saved every 6 hours.', ephemeral: true });

      const sub = o.getSubcommand();
      const data = JSON.parse(snap.data);
      const ts   = `<t:${Math.floor(snap.timestamp / 1000)}:R>`;
      await interaction.deferReply();

      if (sub === 'channels') {
        let restored = 0;
        for (const saved of data.channels) {
          const exists = g.channels.cache.has(saved.id);
          if (!exists) {
            await g.channels.create({ name: saved.name, type: saved.type, parent: saved.parentId || null, reason: 'Daddy USSR: Manual revert' }).catch(() => {});
            restored++;
          }
        }
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00ff88)
          .setTitle('🔄 Channels Reverted')
          .setDescription(`Restored **${restored}** missing channels.\nSnapshot taken ${ts}.`)
          .setTimestamp()] });
      }
      if (sub === 'roles') {
        let restored = 0;
        for (const saved of data.roles) {
          if (saved.name === '@everyone') continue;
          const exists = g.roles.cache.has(saved.id);
          if (!exists) {
            await g.roles.create({ name: saved.name, colors: [saved.color || 0], permissions: BigInt(saved.permissions || '0'), hoist: saved.hoist, mentionable: saved.mentionable, reason: 'Daddy USSR: Manual revert' }).catch(() => {});
            restored++;
          }
        }
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00ff88)
          .setTitle('🔄 Roles Reverted')
          .setDescription(`Restored **${restored}** missing roles.\nSnapshot taken ${ts}.`)
          .setTimestamp()] });
      }
    }

    // ── /config ───────────────────────────────────────────────────
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

    // ── /setup ────────────────────────────────────────────────────
    if (cn === 'setup') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const ch = o.getChannel('channel');
      db.setLogChannel(g.id, ch.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📋 Log Channel Set')
        .setDescription(`Security logs → ${ch}`).setTimestamp()] });
    }

    // ── /trust ────────────────────────────────────────────────────
    if (cn === 'trust') {
      if (g.ownerId !== m.id)
        return interaction.reply({ content: '❌ Server Owner only.', ephemeral: true });
      const sub = o.getSubcommand(), user = o.getUser('user');
      const labels = { 1: 'Owner (Fully Immune)', 2: 'Trustee (Nuke-Immune)', 3: 'Permit (Mod Access)' };
      if (sub === 'add') {
        const level = o.getInteger('level');
        db.addTrust(g.id, user.id, level);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🤝 Trust Granted')
          .setDescription(`**${user.tag}** → Level ${level}: ${labels[level]}`).setThumbnail(user.displayAvatarURL()).setTimestamp()] });
      }
      if (sub === 'remove') {
        db.removeTrust(g.id, user.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🚫 Trust Removed')
          .setDescription(`Removed trust from **${user.tag}**`).setTimestamp()] });
      }
      if (sub === 'list') {
        const list = db.listTrust(g.id);
        const desc = list.length ? list.map(t => `<@${t.user_id}> — L${t.level} (${labels[t.level] || '?'})`).join('\n') : 'None set.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🤝 Trusted Users').setDescription(desc).setTimestamp()] });
      }
    }

    // ── /suspend ──────────────────────────────────────────────────
    if (cn === 'suspend') {
      const botTop = g.members.me.roles.highest;
      if (m.roles.highest.comparePositionTo(botTop) <= 0 && g.ownerId !== m.id)
        return interaction.reply({ content: '❌ Your role must be above the bot.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'Manual lockdown', durRaw = o.getString('duration');
      const durMs = durRaw ? parseDuration(durRaw) : null;
      if (durRaw && !durMs) return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `1d`.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

      const roles = target.roles.cache.filter(r => r.id !== g.id).map(r => r.id);
      db.saveRoles(g.id, user.id, roles.join(','), 1);
      let sr = g.roles.cache.find(r => r.name === 'Suspended');
      if (!sr) sr = await g.roles.create({ name: 'Suspended', permissions: [], colors: [0x000000], reason: 'Daddy USSR: Suspended role' }).catch(() => null);
      if (!sr) return interaction.reply({ content: '❌ Could not create Suspended role. Check bot permissions.', ephemeral: true });
      await target.roles.set([sr.id], `Daddy USSR: ${reason}`).catch(e => console.error('Suspend error:', e.message));

      let expireText = 'Permanent';
      if (durMs) {
        const expiresAt = Date.now() + durMs;
        db.setSuspensionTimer(g.id, user.id, expiresAt);
        expireText = `<t:${Math.floor(expiresAt / 1000)}:R>`;
        scheduleUnsuspend(g.id, user.id, durMs);
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('⛔ User Suspended')
        .addFields(
          { name: '👤 User',        value: `${user.tag} \`(${user.id})\``,       inline: true },
          { name: '⚠️ Reason',      value: reason,                               inline: true },
          { name: '⏱️ Duration',    value: expireText,                           inline: true },
          { name: '💾 Roles Saved', value: `${roles.length} role(s) saved`,      inline: false }
        ).setTimestamp().setFooter({ text: 'Use /unsuspend to restore manually' })] });
    }

    // ── /unsuspend ────────────────────────────────────────────────
    if (cn === 'unsuspend') {
      const botTop = g.members.me.roles.highest;
      if (m.roles.highest.comparePositionTo(botTop) <= 0 && g.ownerId !== m.id)
        return interaction.reply({ content: '❌ Your role must be above the bot.', ephemeral: true });
      const user = o.getUser('user'), data = db.getRoles(g.id, user.id);
      if (!data) return interaction.reply({ content: '❌ No role history found.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const valid = data.roles.split(',').filter(id => id && g.roles.cache.has(id));
      await target.roles.set(valid).catch(() => {});
      db.saveRoles(g.id, user.id, data.roles, 0);
      db.deleteSuspensionTimer(g.id, user.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Unsuspended')
        .addFields(
          { name: '👤 User',           value: `${user.tag}`,          inline: true },
          { name: '🔄 Roles Restored', value: `${valid.length} roles`, inline: true }
        ).setTimestamp()] });
    }

    // ── /scan ─────────────────────────────────────────────────────
    if (cn === 'scan') {
      await interaction.deferReply();
      const members = await g.members.fetch();
      const bots    = members.filter(mb => mb.user.bot);
      const lines   = bots.map(b => {
        const danger = b.permissions.has(PermissionFlagsBits.Administrator) ? '🚨 **ADMIN**' :
          (b.permissions.has(PermissionFlagsBits.ManageGuild) || b.permissions.has(PermissionFlagsBits.ManageRoles)) ? '⚠️ Elevated' : '✅ Safe';
        return `**${b.user.tag}** — ${danger}`;
      }).join('\n') || 'No bots found.';
      const autoMod  = (await g.autoModerationRules.fetch().catch(() => null))?.size > 0;
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🔍 Security Scan')
        .addFields(
          { name: '🤖 Bot Audit',              value: lines.slice(0, 1024) },
          { name: '🛡️ Discord Native AutoMod', value: autoMod ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '💡 Tip',                    value: 'Use `/antinuke status` to see all monitor thresholds.', inline: true }
        ).setTimestamp().setFooter({ text: 'Daddy USSR Security Engine' })] });
    }

    // ── /snapshot ─────────────────────────────────────────────────
    if (cn === 'snapshot') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
      const snap = db.getSnapshot(g.id);
      if (!snap) return interaction.reply({ content: '❌ No snapshot found yet.', ephemeral: true });
      const data = JSON.parse(snap.data);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📸 Last Snapshot')
        .addFields(
          { name: '🕒 Taken',    value: `<t:${Math.floor(snap.timestamp / 1000)}:R>`, inline: true },
          { name: '📁 Channels', value: `${data.channels.length} saved`,              inline: true },
          { name: '🔰 Roles',    value: `${data.roles.length} saved`,                 inline: true }
        ).setFooter({ text: 'Use /revert channels or /revert roles to restore' }).setTimestamp()] });
    }

    // ── /help ─────────────────────────────────────────────────────
    if (cn === 'help') {
      const page = (o.getInteger('page') || 1) - 1;
      const pages = [
        new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 1/4: Moderation')
          .addFields(
            { name: '/ban [@user] [reason]',        value: 'Ban a member',                     inline: false },
            { name: '/unban [id] [reason]',          value: 'Unban by user ID',                 inline: false },
            { name: '/kick [@user] [reason]',        value: 'Kick a member',                    inline: false },
            { name: '/mute [@user] [duration]',      value: 'Timeout (mute) — e.g. `10m` `1h`', inline: false },
            { name: '/unmute [@user]',               value: 'Remove timeout',                   inline: false },
            { name: '/suspend [@user] [dur]',        value: 'Strip all roles (optional auto-expire)', inline: false },
            { name: '/unsuspend [@user]',            value: 'Restore suspended user\'s roles',  inline: false }
          ).setFooter({ text: '/help page:2 for more' }),
        new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 2/4: Security')
          .addFields(
            { name: '/config [type] [limit] [time]', value: 'Set anti-nuke thresholds — e.g. `3 / 10s`', inline: false },
            { name: '/setup [#channel]',              value: 'Set security log channel',         inline: false },
            { name: '/antinuke enable|disable|status',value: 'Toggle or view all monitors',     inline: false },
            { name: '/trust add|remove|list',         value: 'L1=Immune L2=Nuke-Immune L3=Mod', inline: false },
            { name: '/scan',                          value: 'Audit bots + check AutoMod',      inline: false },
            { name: '/lockdown [reason]',             value: 'Lock all text channels',          inline: false },
            { name: '/unlockdown',                    value: 'Restore pre-lockdown permissions', inline: false }
          ).setFooter({ text: '/help page:3 for more' }),
        new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 3/4: Restore & Snapshots')
          .addFields(
            { name: '/snapshot',           value: 'View last saved server state',               inline: false },
            { name: '/revert channels',    value: 'Restore missing channels from snapshot',     inline: false },
            { name: '/revert roles',       value: 'Restore missing roles from snapshot',        inline: false }
          )
          .addFields({ name: '⚡ Auto-Revert', value: 'When anti-nuke threshold triggers, deleted channels/roles are **automatically recreated** from the last snapshot.', inline: false })
          .setFooter({ text: '/help page:4 for more' }),
        new EmbedBuilder().setColor(0x5865f2).setTitle('🛡️ Daddy USSR — Page 4/4: Fun & Features')
          .addFields(
            { name: '/ask [question]',              value: 'Magic 8-Ball answer',               inline: false },
            { name: '/say [message]',               value: 'Send a message as the bot (works in DMs & User App)', inline: false },
            { name: '/counting-toggle [#channel]',  value: 'Enable/disable counting game',      inline: false },
            { name: '/starboard-enable [#ch] [n]',  value: 'Enable starboard (default: 3 ⭐)',  inline: false },
            { name: '/starboard-disable',           value: 'Disable starboard',                 inline: false }
          )
          .addFields({ name: '🔢 Duration Format', value: '`10s` · `5m` · `2h` · `1d` · `1w` — used in /mute, /suspend, /config', inline: false })
          .setFooter({ text: 'Daddy USSR Security Engine' })
      ];
      return interaction.reply({ embeds: [pages[Math.max(0, Math.min(page, pages.length - 1))]] });
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
  console.log(`📸 Snapshot taken for ${client.guilds.cache.size} guild(s).`);
  const pending = db.getAllSuspensionTimers();
  let restored  = 0;
  for (const row of pending) {
    const rem = row.expires_at - Date.now();
    if (rem <= 0) await doUnsuspend(row.guild_id, row.user_id);
    else { scheduleUnsuspend(row.guild_id, row.user_id, rem); restored++; }
  }
  if (restored) console.log(`⏱️ Restored ${restored} suspension timer(s).`);
});

client.login(TOKEN);

// ═══════════════════════════════════════════════════════════════════
//  COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════
const MONITOR_TYPES = [
  { name: 'Channel Delete', value: 'channel_delete' }, { name: 'Channel Create', value: 'channel_create' },
  { name: 'Channel Update', value: 'channel_update' }, { name: 'Role Delete',    value: 'role_delete'    },
  { name: 'Role Create',    value: 'role_create'    }, { name: 'Role Update',    value: 'role_update'    },
  { name: 'Member Ban',     value: 'member_ban'     }, { name: 'Member Kick',    value: 'member_kick'    },
  { name: 'Webhook Create', value: 'webhook_create' }, { name: 'Emoji Create',   value: 'emoji_create'   },
  { name: 'Sticker Create', value: 'sticker_create' }, { name: 'Vanity URL',     value: 'vanity_update'  },
];

const commands = [
  // Global (DM + User App)
  { name: 'say',  description: 'Send a message as the bot', integration_types: [0, 1], contexts: [0, 1, 2], options: [{ name: 'message', type: 3, description: 'Message to send', required: true }] },
  { name: 'ask',  description: 'Ask the Magic 8-Ball',      integration_types: [0, 1], contexts: [0, 1, 2], options: [{ name: 'question', type: 3, description: 'Your question', required: true }] },

  // Moderation
  { name: 'ban',    description: 'Ban a member',   options: [{ name: 'user', type: 6, required: true, description: 'User' }, { name: 'reason', type: 3, description: 'Reason' }] },
  { name: 'unban',  description: 'Unban a user',   options: [{ name: 'user_id', type: 3, required: true, description: 'User ID' }, { name: 'reason', type: 3, description: 'Reason' }] },
  { name: 'kick',   description: 'Kick a member',  options: [{ name: 'user', type: 6, required: true, description: 'User' }, { name: 'reason', type: 3, description: 'Reason' }] },
  { name: 'mute',   description: 'Timeout a member', options: [
    { name: 'user',     type: 6, required: true,  description: 'User' },
    { name: 'duration', type: 3, description: 'Duration — e.g. 10m, 1h, 1d (max 28d)' },
    { name: 'reason',   type: 3, description: 'Reason' }
  ]},
  { name: 'unmute', description: 'Remove timeout', options: [{ name: 'user', type: 6, required: true, description: 'User' }] },

  // Fun / features
  { name: 'counting-toggle',  description: 'Enable/disable counting game', options: [{ name: 'channel', type: 7, required: true, description: 'Channel', channel_types: [0] }] },
  { name: 'starboard-enable', description: 'Enable starboard', options: [{ name: 'channel', type: 7, required: true, description: 'Starboard channel', channel_types: [0] }, { name: 'threshold', type: 4, description: 'Stars needed (default 3)', min_value: 1 }] },
  { name: 'starboard-disable', description: 'Disable starboard' },

  // Security management
  { name: 'config',   description: 'Set anti-nuke thresholds (Admin)', options: [
    { name: 'type',  type: 3, required: true, description: 'Event type', choices: MONITOR_TYPES },
    { name: 'limit', type: 4, required: true, description: 'Action limit', min_value: 1 },
    { name: 'time',  type: 3, required: true, description: 'Window — e.g. 10s, 5m, 1h' }
  ]},
  { name: 'setup',    description: 'Set log channel (Admin)', options: [{ name: 'channel', type: 7, required: true, description: 'Log channel', channel_types: [0] }] },
  { name: 'trust',    description: 'Manage trusted users (Owner)', options: [
    { name: 'add',    type: 1, description: 'Add trust',    options: [{ name: 'user', type: 6, required: true, description: 'User' }, { name: 'level', type: 4, required: true, description: 'Level', choices: [{ name: '1 — Owner/Immune', value: 1 }, { name: '2 — Trustee/Immune', value: 2 }, { name: '3 — Permit/Mod', value: 3 }] }] },
    { name: 'remove', type: 1, description: 'Remove trust', options: [{ name: 'user', type: 6, required: true, description: 'User' }] },
    { name: 'list',   type: 1, description: 'List trusted users' }
  ]},
  { name: 'antinuke', description: 'Toggle/view the anti-nuke system (Admin)', options: [
    { name: 'enable',  type: 1, description: 'Enable all monitors' },
    { name: 'disable', type: 1, description: 'Disable all monitors' },
    { name: 'status',  type: 1, description: 'View all thresholds' }
  ]},
  { name: 'suspend',   description: 'Suspend a user', options: [
    { name: 'user',     type: 6, required: true, description: 'User' },
    { name: 'reason',   type: 3, description: 'Reason' },
    { name: 'duration', type: 3, description: 'Auto-unsuspend after — e.g. 10m, 1h, 1d' }
  ]},
  { name: 'unsuspend', description: 'Restore suspended user', options: [{ name: 'user', type: 6, required: true, description: 'User' }] },
  { name: 'lockdown',  description: 'Lock all channels', options: [{ name: 'reason', type: 3, description: 'Reason' }] },
  { name: 'unlockdown', description: 'Restore channels from lockdown' },
  { name: 'scan',      description: 'Audit bots + check server security' },
  { name: 'snapshot',  description: 'View last server state snapshot' },
  { name: 'revert',    description: 'Restore from last snapshot (Admin)', options: [
    { name: 'channels', type: 1, description: 'Restore missing channels' },
    { name: 'roles',    type: 1, description: 'Restore missing roles' }
  ]},
  { name: 'help', description: 'Show all commands', options: [{ name: 'page', type: 4, description: 'Page 1–4', min_value: 1, max_value: 4 }] }
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
