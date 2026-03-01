require('dotenv').config();
const { Client, GatewayIntentBits, AuditLogEvent, PermissionFlagsBits, EmbedBuilder, REST, Routes, ChannelType, WebhookClient } = require('discord.js');
const db = require('./src/database/db');
const { logAction, checkThreshold, suspendUser } = require('./src/services/monitor');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildPresences
  ]
});

// --- Security Monitors ---
async function handleSecurityEvent(guild, executorId, type, reason) {
  if (executorId === client.user.id) return;
  const trust = db.getTrust(guild.id, executorId);
  if (trust && trust.level <= 2) return;
  logAction(guild.id, executorId, type);
  if (checkThreshold(guild.id, executorId, type)) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) await suspendUser(member, reason, client);
  }
}

client.on('channelCreate', async c => {
  const entry = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(c.guild, entry.executorId, 'channel_create', 'Channel Creation Spam');
});
client.on('channelDelete', async c => {
  const entry = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(c.guild, entry.executorId, 'channel_delete', 'Channel Deletion Spam');
});
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
  if (entry) {
    if (n.name === 'Suspended' || n.id === n.guild.members.me.roles.highest.id) {
       const m = await n.guild.members.fetch(entry.executorId).catch(() => null);
       if (m) await suspendUser(m, 'Unauthorized Hierarchy Edit', client);
       await n.edit({ permissions: o.permissions.bitfield });
    } else await handleSecurityEvent(n.guild, entry.executorId, 'role_update', 'Role Update Spam');
  }
});
client.on('guildBanAdd', async b => {
  const entry = (await b.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(b.guild, entry.executorId, 'member_ban', 'Ban Spam');
});
client.on('webhookUpdate', async c => {
  const entry = (await c.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 })).entries.first();
  if (entry) await handleSecurityEvent(c.guild, entry.executorId, 'webhook_create', 'Webhook Spam');
});
client.on('messageCreate', async m => {
  if (!m.guild || m.author.bot) return;
  if (m.mentions.everyone) {
    const t = db.getTrust(m.guild.id, m.author.id);
    if (!t || t.level > 2) {
      const mb = await m.guild.members.fetch(m.author.id);
      await suspendUser(mb, '@everyone Abuse', client);
      await m.delete().catch(() => {});
    }
  }
});

// Snapshot Every 6h
setInterval(async () => {
  for (const g of client.guilds.cache.values()) {
    const data = { channels: g.channels.cache.map(c => ({ name: c.name, type: c.type })), roles: g.roles.cache.map(r => ({ name: r.name, color: r.color })) };
    db.saveSnapshot(g.id, data);
  }
}, 6 * 60 * 60 * 1000);

// Interaction Handler
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  const { commandName: cn, options: o, guild: g, member: m } = i;
  try {
    if (cn === 'config') {
      const type = o.getString('type'), limit = o.getInteger('limit'), time = o.getInteger('time') * 1000;
      db.setThreshold(g.id, type, limit, time);
      await i.reply(\`✅ **\${type}**: \${limit} / \${time/1000}s\`);
    } else if (cn === 'setup') {
      const c = o.getChannel('channel');
      db.updateLogChannel(g.id, c.id);
      await i.reply(\`✅ Log set to \${c}\`);
    } else if (cn === 'trust') {
      if (g.ownerId !== m.id) return i.reply('❌ Owner only.');
      const sub = o.getSubcommand(), u = o.getUser('user');
      if (sub === 'add') { db.addTrust(g.id, u.id, o.getInteger('level')); await i.reply(\`✅ Trusted \${u.tag}\`); }
      else { db.removeTrust(g.id, u.id); await i.reply(\`✅ Removed trust from \${u.tag}\`); }
    } else if (cn === 'suspend') {
      const target = await g.members.fetch(o.getUser('user').id);
      await suspendUser(target, 'Manual Lockdown', client);
      await i.reply(\`✅ Suspended \${target.user.tag}\`);
    } else if (cn === 'unsuspend') {
      const u = o.getUser('user'), data = db.getRoles(g.id, u.id);
      if (!data) return i.reply('❌ No history.');
      const target = await g.members.fetch(u.id);
      await target.roles.set(data.roles.split(',').filter(id => g.roles.cache.has(id)));
      db.saveRoles(g.id, u.id, data.roles, 0);
      await i.reply(\`✅ Restored \${u.tag}\`);
    } else if (cn === 'scan') {
      const bots = (await g.members.fetch()).filter(mb => mb.user.bot);
      const list = bots.map(b => \`**\${b.user.tag}**: \${b.permissions.has(PermissionFlagsBits.Administrator) ? '🚨 ADMIN' : '✅ SECURE'}\`).join('\\n');
      await i.reply({ embeds: [new EmbedBuilder().setTitle('🔍 Scan').setDescription(list || 'None').setColor('#3498db')] });
    } else if (cn === 'help') {
      await i.reply({ embeds: [new EmbedBuilder().setTitle('🛡️ Security Help').addFields({ name: '⚙️ Config', value: '/config\\n/setup' }, { name: '🤝 Trust', value: '/trust' }, { name: '⛔ Action', value: '/suspend\\n/unsuspend' }).setColor('#5865F2')] });
    }
  } catch (e) { console.error(e); await i.reply({ content: '❌ Error', ephemeral: true }).catch(() => {}); }
});

client.once('ready', () => console.log('🚀 Security Engine Online'));
client.login(TOKEN);

// Register Commands
const cmds = [
  { name: 'config', description: 'Thresholds', options: [{ name: 'type', type: 3, required: true, choices: [{ name: 'Channel Delete', value: 'channel_delete' }, { name: 'Role Delete', value: 'role_delete' }, { name: 'Ban', value: 'member_ban' }] }, { name: 'limit', type: 4, required: true }, { name: 'time', type: 4, required: true }] },
  { name: 'setup', description: 'Log channel', options: [{ name: 'channel', type: 7, required: true }] },
  { name: 'trust', description: 'Trust', options: [{ name: 'add', type: 1, options: [{ name: 'user', type: 6, required: true }, { name: 'level', type: 4, required: true }] }, { name: 'remove', type: 1, options: [{ name: 'user', type: 6, required: true }] }] },
  { name: 'suspend', description: 'Lockdown', options: [{ name: 'user', type: 6, required: true }] },
  { name: 'unsuspend', description: 'Restore', options: [{ name: 'user', type: 6, required: true }] },
  { name: 'scan', description: 'Audit' },
  { name: 'help', description: 'Help' }
];
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => { try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: cmds }); } catch (e) { console.error(e); } })();
