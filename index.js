require('dotenv').config();
const {
  Client, GatewayIntentBits, AuditLogEvent, PermissionFlagsBits,
  EmbedBuilder, REST, Routes, ChannelType
} = require('discord.js');
const db = require('./src/database/db');
const { logAction, checkThreshold, suspendUser } = require('./src/services/monitor');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

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

// =============================================
// SECURITY ENGINE - Anti-Nuke Monitors
// =============================================

async function handleSecurityEvent(guild, executorId, type, reason) {
  if (!executorId || executorId === client.user.id) return;
  const trust = db.getTrust(guild.id, executorId);
  if (trust && trust.level <= 2) return;
  logAction(guild.id, executorId, type);
  if (checkThreshold(guild.id, executorId, type)) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) await suspendUser(member, reason, client);
  }
}

// Channel monitors
client.on('channelCreate', async c => {
  const entry = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(c.guild, entry.executorId, 'channel_create', 'Channel Creation Spam');
});
client.on('channelDelete', async c => {
  const entry = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(c.guild, entry.executorId, 'channel_delete', 'Channel Deletion Spam');
});

// Role monitors
client.on('roleCreate', async r => {
  const entry = (await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(r.guild, entry.executorId, 'role_create', 'Role Creation Spam');
});
client.on('roleDelete', async r => {
  const entry = (await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(r.guild, entry.executorId, 'role_delete', 'Role Deletion Spam');
});
client.on('roleUpdate', async (o, n) => {
  const entry = (await n.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 })).entries.first();
  if (!entry) return;
  const botHighest = n.guild.members.me.roles.highest.id;
  if (n.name === 'Suspended' || n.id === botHighest) {
    const m = await n.guild.members.fetch(entry.executorId).catch(() => null);
    if (m) await suspendUser(m, 'Unauthorized Hierarchy Edit', client);
    await n.edit({ permissions: o.permissions.bitfield }).catch(() => {});
  } else {
    await handleSecurityEvent(n.guild, entry.executorId, 'role_update', 'Role Update Spam');
  }
});

// Member monitors
client.on('guildBanAdd', async b => {
  const entry = (await b.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(b.guild, entry.executorId, 'member_ban', 'Ban Spam');
});

// Webhook monitor
client.on('webhookUpdate', async c => {
  const entry = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(c.guild, entry.executorId, 'webhook_create', 'Webhook Spam');
});

// Emoji / Sticker monitors
client.on('emojiCreate', async e => {
  const entry = (await e.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(e.guild, entry.executorId, 'emoji_create', 'Emoji Spam');
});
client.on('stickerCreate', async s => {
  const entry = (await s.guild.fetchAuditLogs({ type: AuditLogEvent.StickerCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(s.guild, entry.executorId, 'sticker_create', 'Sticker Spam');
});

// @everyone protection
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  if (message.mentions.everyone) {
    const trust = db.getTrust(message.guild.id, message.author.id);
    if (!trust || trust.level > 2) {
      const mb = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (mb) await suspendUser(mb, '@everyone Abuse', client);
      await message.delete().catch(() => {});
      return;
    }
  }

  // =============================================
  // COUNTING GAME
  // =============================================
  const counting = db.getCounting(message.guild.id);
  if (counting && counting.enabled && counting.channel_id === message.channel.id) {
    const num = parseInt(message.content.trim());
    const expected = (counting.current_count || 0) + 1;

    if (isNaN(num) || num !== expected) {
      await message.react('❌').catch(() => {});
      db.resetCount(message.guild.id);
      await message.channel.send(`❌ **${message.author.username}** ruined the count at **${counting.current_count}**! Back to **0**. Next number: **1**`);
      return;
    }
    if (counting.last_user_id === message.author.id) {
      await message.react('❌').catch(() => {});
      db.resetCount(message.guild.id);
      await message.channel.send(`❌ **${message.author.username}** can't count twice in a row! Back to **0**. Next number: **1**`);
      return;
    }

    db.updateCount(message.guild.id, num, message.author.id);
    await message.react('✅').catch(() => {});
  }
});

// =============================================
// STARBOARD
// =============================================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (!reaction.message.guild) return;
  if (reaction.emoji.name !== '⭐') return;

  const sb = db.getStarboard(reaction.message.guild.id);
  if (!sb || !sb.enabled || !sb.channel_id) return;

  const starCount = reaction.count;
  if (starCount < sb.threshold) return;

  const existing = db.getStarboardPost(reaction.message.guild.id, reaction.message.id);
  if (existing) return;

  const starboardChannel = reaction.message.guild.channels.cache.get(sb.channel_id);
  if (!starboardChannel) return;

  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setAuthor({ name: reaction.message.author.tag, iconURL: reaction.message.author.displayAvatarURL() })
    .setDescription(reaction.message.content || '*[no text]*')
    .addFields({ name: 'Source', value: `[Jump to message](${reaction.message.url})` })
    .setTimestamp(reaction.message.createdAt);

  if (reaction.message.attachments.size > 0) {
    embed.setImage(reaction.message.attachments.first().url);
  }

  const sent = await starboardChannel.send({ content: `⭐ **${starCount}** in <#${reaction.message.channel.id}>`, embeds: [embed] }).catch(() => null);
  if (sent) db.saveStarboardPost(reaction.message.guild.id, reaction.message.id, sent.id);
});

// =============================================
// ROLE MEMORY
// =============================================
client.on('guildMemberRemove', async member => {
  const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.id);
  db.saveRoles(member.guild.id, member.id, roles.join(','), 0);
});
client.on('guildMemberAdd', async member => {
  const data = db.getRoles(member.guild.id, member.id);
  if (!data) return;
  if (data.is_suspended) {
    const suspendedRole = member.guild.roles.cache.find(r => r.name === 'Suspended');
    if (suspendedRole) await member.roles.add(suspendedRole).catch(() => {});
  } else {
    const roleIds = data.roles.split(',').filter(id => member.guild.roles.cache.has(id));
    if (roleIds.length) await member.roles.add(roleIds).catch(() => {});
  }
});

// =============================================
// STATE SNAPSHOT — Every 6 Hours
// =============================================
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    const data = {
      channels: guild.channels.cache.map(c => ({ name: c.name, type: c.type })),
      roles: guild.roles.cache.map(r => ({ name: r.name, color: r.color, permissions: r.permissions.bitfield.toString() }))
    };
    db.saveSnapshot(guild.id, data);
  }
}, 6 * 60 * 60 * 1000);

// =============================================
// SLASH COMMAND HANDLER
// =============================================
const MAGIC8 = [
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.',
  'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.',
  "Don't count on it.", 'My sources say no.', 'Very doubtful.'
];

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName: cn, options: o, guild: g, member: m } = interaction;

  try {
    // ---- ASK ----
    if (cn === 'ask') {
      const question = o.getString('question');
      const answer = MAGIC8[Math.floor(Math.random() * MAGIC8.length)];
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🎱 Magic 8-Ball')
          .addFields({ name: '❓ Question', value: question }, { name: '🔮 Answer', value: `**${answer}**` })
          .setColor('#5865F2')]
      });
    }

    // ---- BAN ----
    else if (cn === 'ban') {
      if (!m.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '❌ You need Ban Members permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'No reason provided.';
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Cannot ban this user.', ephemeral: true });
      await target.ban({ reason });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('🔨 Banned').setDescription(`**${user.tag}** has been banned.\n**Reason:** ${reason}`)] });
    }

    // ---- UNBAN ----
    else if (cn === 'unban') {
      if (!m.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '❌ You need Ban Members permission.', ephemeral: true });
      const userId = o.getString('user_id'), reason = o.getString('reason') || 'No reason provided.';
      await g.members.unban(userId, reason).catch(() => null);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Unbanned').setDescription(`User **${userId}** has been unbanned.\n**Reason:** ${reason}`)] });
    }

    // ---- KICK ----
    else if (cn === 'kick') {
      if (!m.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: '❌ You need Kick Members permission.', ephemeral: true });
      const user = o.getUser('user'), reason = o.getString('reason') || 'No reason provided.';
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
      await target.kick(reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#e67e22').setTitle('👢 Kicked').setDescription(`**${user.tag}** has been kicked.\n**Reason:** ${reason}`)] });
    }

    // ---- MUTE ----
    else if (cn === 'mute') {
      if (!m.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
      const user = o.getUser('user'), minutes = o.getInteger('minutes') || 10, reason = o.getString('reason') || 'No reason provided.';
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await target.timeout(minutes * 60 * 1000, reason);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#f39c12').setTitle('🔇 Muted').setDescription(`**${user.tag}** muted for **${minutes} minutes**.\n**Reason:** ${reason}`)] });
    }

    // ---- COUNTING-TOGGLE ----
    else if (cn === 'counting-toggle') {
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
      const channel = o.getChannel('channel');
      const existing = db.getCounting(g.id);
      const newState = existing ? !existing.enabled : true;
      db.setCounting(g.id, channel.id, newState);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(newState ? '#2ecc71' : '#e74c3c')
          .setTitle(`🔢 Counting ${newState ? 'Enabled' : 'Disabled'}`)
          .setDescription(newState ? `Counting game is now active in ${channel}.\nUsers take turns counting. Start at **1**!` : `Counting game has been disabled in ${channel}.`)]
      });
    }

    // ---- STARBOARD ENABLE ----
    else if (cn === 'starboard-enable') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
      const channel = o.getChannel('channel'), threshold = o.getInteger('threshold') || 3;
      db.setStarboard(g.id, channel.id, true, threshold);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('⭐ Starboard Enabled')
          .setDescription(`Starboard is now active in ${channel}.\nMessages need **${threshold}** ⭐ reactions to be featured.`)]
      });
    }

    // ---- STARBOARD DISABLE ----
    else if (cn === 'starboard-disable') {
      if (!m.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
      db.disableStarboard(g.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⭐ Starboard Disabled').setDescription('Starboard has been turned off.')] });
    }

    // ---- SECURITY: CONFIG ----
    else if (cn === 'config') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
      const type = o.getString('type'), limit = o.getInteger('limit'), time = o.getInteger('time') * 1000;
      db.setThreshold(g.id, type, limit, time);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('⚙️ Threshold Updated').setDescription(`**Event:** ${type}\n**Limit:** ${limit} actions\n**Window:** ${time / 1000}s`)] });
    }

    // ---- SECURITY: SETUP LOG ----
    else if (cn === 'setup') {
      if (!m.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
      const channel = o.getChannel('channel');
      db.updateLogChannel(g.id, channel.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('📋 Log Channel Set').setDescription(`Security logs will be sent to ${channel}.`)] });
    }

    // ---- SECURITY: TRUST ----
    else if (cn === 'trust') {
      if (g.ownerId !== m.id) return interaction.reply({ content: '❌ Server owner only.', ephemeral: true });
      const sub = o.getSubcommand(), user = o.getUser('user');
      if (sub === 'add') {
        const level = o.getInteger('level');
        db.addTrust(g.id, user.id, level);
        const labels = { 1: 'Owner (Immune)', 2: 'Trustee (Immune)', 3: 'Permit (Mod-Access)' };
        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('🤝 Trust Added').setDescription(`**${user.tag}** → Level ${level}: ${labels[level] || 'Unknown'}`)] });
      } else {
        db.removeTrust(g.id, user.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('🤝 Trust Removed').setDescription(`Removed trust from **${user.tag}**`)] });
      }
    }

    // ---- SECURITY: SUSPEND ----
    else if (cn === 'suspend') {
      if (!m.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const user = o.getUser('user');
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      await suspendUser(target, `Manual lockdown by ${m.user.tag}`, client);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⛔ User Suspended').setDescription(`**${user.tag}** has been suspended. All roles removed.`)] });
    }

    // ---- SECURITY: UNSUSPEND ----
    else if (cn === 'unsuspend') {
      if (!m.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const user = o.getUser('user'), data = db.getRoles(g.id, user.id);
      if (!data) return interaction.reply({ content: '❌ No role history found.', ephemeral: true });
      const target = await g.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const roleIds = data.roles.split(',').filter(id => g.roles.cache.has(id));
      await target.roles.set(roleIds).catch(() => {});
      db.saveRoles(g.id, user.id, data.roles, 0);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ User Unsuspended').setDescription(`**${user.tag}** roles have been restored.`)] });
    }

    // ---- SECURITY: SCAN ----
    else if (cn === 'scan') {
      const bots = (await g.members.fetch()).filter(mb => mb.user.bot);
      const list = bots.map(b => `**${b.user.tag}**: ${b.permissions.has(PermissionFlagsBits.Administrator) ? '🚨 ADMIN' : '✅ SECURE'}`).join('\n');
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🔍 Security Scan')
          .setDescription(`**Bots in Server:**\n${list || 'None'}`)
          .setColor('#3498db')
          .setFooter({ text: '🚨 = Has Administrator | ✅ = Safe' })]
      });
    }

    // ---- HELP ----
    else if (cn === 'help') {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🛡️ Daddy USSR — Command List')
          .setColor('#5865F2')
          .addFields(
            { name: '🎲 Fun', value: '`/ask` — Magic 8-Ball answer' },
            { name: '⚖️ Moderation', value: '`/ban` `/unban` `/kick` `/mute`' },
            { name: '🔢 Counting', value: '`/counting-toggle` — Enable/disable counting game' },
            { name: '⭐ Starboard', value: '`/starboard-enable` `/starboard-disable`' },
            { name: '🛡️ Security', value: '`/config` `/setup` `/trust` `/suspend` `/unsuspend` `/scan`' }
          )]
      });
    }

  } catch (e) {
    console.error(e);
    await interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
  }
});

// =============================================
// READY
// =============================================
client.once('ready', () => {
  console.log(`🚀 Daddy USSR Security Engine Online: ${client.user.tag}`);
});

client.login(TOKEN);

// =============================================
// COMMAND REGISTRATION
// =============================================
const commands = [
  // Fun
  { name: 'ask', description: 'Ask the Magic 8-Ball a yes/no question', options: [{ name: 'question', type: 3, description: 'Your question', required: true }] },

  // Moderation
  {
    name: 'ban', description: 'Ban a member',
    options: [{ name: 'user', type: 6, description: 'User to ban', required: true }, { name: 'reason', type: 3, description: 'Reason' }]
  },
  {
    name: 'unban', description: 'Unban a user by ID',
    options: [{ name: 'user_id', type: 3, description: 'User ID to unban', required: true }, { name: 'reason', type: 3, description: 'Reason' }]
  },
  {
    name: 'kick', description: 'Kick a member',
    options: [{ name: 'user', type: 6, description: 'User to kick', required: true }, { name: 'reason', type: 3, description: 'Reason' }]
  },
  {
    name: 'mute', description: 'Timeout (mute) a member',
    options: [
      { name: 'user', type: 6, description: 'User to mute', required: true },
      { name: 'minutes', type: 4, description: 'Duration in minutes (default 10)', min_value: 1, max_value: 40320 },
      { name: 'reason', type: 3, description: 'Reason' }
    ]
  },

  // Counting
  {
    name: 'counting-toggle', description: 'Enable or disable the counting game in a channel',
    options: [{ name: 'channel', type: 7, description: 'The counting channel', channel_types: [0], required: true }]
  },

  // Starboard
  {
    name: 'starboard-enable', description: 'Enable the starboard',
    options: [
      { name: 'channel', type: 7, description: 'Starboard channel', channel_types: [0], required: true },
      { name: 'threshold', type: 4, description: 'Stars needed (default 3)', min_value: 1 }
    ]
  },
  { name: 'starboard-disable', description: 'Disable the starboard' },

  // Security
  {
    name: 'config', description: 'Set anti-nuke thresholds (Admin only)',
    options: [
      {
        name: 'type', type: 3, description: 'Event type', required: true,
        choices: [
          { name: 'Channel Delete', value: 'channel_delete' }, { name: 'Channel Create', value: 'channel_create' },
          { name: 'Role Delete', value: 'role_delete' }, { name: 'Role Create', value: 'role_create' },
          { name: 'Role Update', value: 'role_update' }, { name: 'Member Ban', value: 'member_ban' },
          { name: 'Webhook Create', value: 'webhook_create' }, { name: 'Emoji Create', value: 'emoji_create' }
        ]
      },
      { name: 'limit', type: 4, description: 'Max actions before suspension', required: true, min_value: 1 },
      { name: 'time', type: 4, description: 'Time window in seconds', required: true, min_value: 1 }
    ]
  },
  { name: 'setup', description: 'Set the security log channel (Admin only)', options: [{ name: 'channel', type: 7, description: 'Log channel', channel_types: [0], required: true }] },
  {
    name: 'trust', description: 'Manage trust levels (Owner only)',
    options: [
      {
        name: 'add', type: 1, description: 'Add trust',
        options: [
          { name: 'user', type: 6, description: 'User', required: true },
          {
            name: 'level', type: 4, description: 'Trust level', required: true,
            choices: [{ name: '1 - Owner (Immune)', value: 1 }, { name: '2 - Trustee (Immune)', value: 2 }, { name: '3 - Permit (Mod)', value: 3 }]
          }
        ]
      },
      { name: 'remove', type: 1, description: 'Remove trust', options: [{ name: 'user', type: 6, description: 'User', required: true }] }
    ]
  },
  { name: 'suspend', description: 'Manually suspend a user (removes all roles)', options: [{ name: 'user', type: 6, description: 'User to suspend', required: true }] },
  { name: 'unsuspend', description: 'Restore a suspended user\'s roles', options: [{ name: 'user', type: 6, description: 'User to restore', required: true }] },
  { name: 'scan', description: 'Audit all bots in the server for security risks' },
  { name: 'help', description: 'Show all commands' }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands registered successfully.');
  } catch (e) {
    console.error('❌ Command registration failed:', e);
  }
})();
