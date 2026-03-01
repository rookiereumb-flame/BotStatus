require('dotenv').config();
const { Client, GatewayIntentBits, AuditLogEvent, PermissionFlagsBits, EmbedBuilder, REST, Routes, ChannelType } = require('discord.js');
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
    GatewayIntentBits.GuildEmojisAndStickers
  ]
});

// --- Security Monitors (Expanded) ---

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

client.on('channelDelete', async channel => {
  const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = logs.entries.first();
  if (entry) await handleSecurityEvent(channel.guild, entry.executorId, 'channel_delete', 'Channel Deletion Spam');
});

client.on('roleDelete', async role => {
  const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = logs.entries.first();
  if (entry) await handleSecurityEvent(role.guild, entry.executorId, 'role_delete', 'Role Deletion Spam');
});

client.on('guildBanAdd', async ban => {
  const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const entry = logs.entries.first();
  if (entry) await handleSecurityEvent(ban.guild, entry.executorId, 'member_ban', 'Ban Spam');
});

client.on('webhookUpdate', async (channel) => {
  const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 });
  const entry = logs.entries.first();
  if (entry) await handleSecurityEvent(channel.guild, entry.executorId, 'webhook_create', 'Webhook Creation Spam');
});

// --- Role Memory & Everyone Protection ---

client.on('guildMemberRemove', async member => {
  const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.id);
  db.saveRoles(member.guild.id, member.id, roles.join(','), 0);
});

client.on('guildMemberAdd', async member => {
  const data = db.getRoles(member.guild.id, member.id);
  if (data) {
    if (data.is_suspended) {
      const suspendedRole = member.guild.roles.cache.find(r => r.name === 'Suspended');
      if (suspendedRole) await member.roles.add(suspendedRole);
    } else {
      const roleIds = data.roles.split(',').filter(id => member.guild.roles.cache.has(id));
      await member.roles.add(roleIds).catch(() => {});
    }
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (message.mentions.everyone) {
    const trust = db.getTrust(message.guild.id, message.author.id);
    if (!trust || trust.level > 2) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member) {
        await suspendUser(member, '@everyone Abuse', client);
        await message.delete().catch(() => {});
      }
    }
  }
});

// --- Interaction Handler ---

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, member } = interaction;

  try {
    if (commandName === 'config') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply('❌ Admin only.');
      const type = options.getString('type');
      const limit = options.getInteger('limit');
      const time = options.getInteger('time') * 1000;
      db.setThreshold(guild.id, type, limit, time);
      await interaction.reply(\`✅ Configured **\${type}** with limit **\${limit}** per **\${time/1000}s**\`);
    }

    if (commandName === 'setup') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply('❌ Admin only.');
      const channel = options.getChannel('channel');
      db.updateLogChannel(guild.id, channel.id);
      await interaction.reply(\`✅ Log channel set to \${channel}\`);
    }

    if (commandName === 'trust') {
      if (guild.ownerId !== member.id) return interaction.reply('❌ Only server owner can manage trust.');
      const sub = options.getSubcommand();
      const user = options.getUser('user');
      if (sub === 'add') {
        const level = options.getInteger('level');
        db.addTrust(guild.id, user.id, level);
        await interaction.reply(\`✅ Trusted \${user.tag} at level \${level}\`);
      } else {
        db.removeTrust(guild.id, user.id);
        await interaction.reply(\`✅ Removed trust from \${user.tag}\`);
      }
    }

    if (commandName === 'suspend') {
      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply('❌ No perms.');
      const user = options.getUser('user');
      const target = await guild.members.fetch(user.id);
      await suspendUser(target, \`Manual lockdown by \${member.user.tag}\`, client);
      await interaction.reply(\`✅ User \${user.tag} has been suspended.\`);
    }

    if (commandName === 'unsuspend') {
      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply('❌ No perms.');
      const user = options.getUser('user');
      const data = db.getRoles(guild.id, user.id);
      if (!data) return interaction.reply('❌ No role history found for this user.');
      const target = await guild.members.fetch(user.id);
      const roleIds = data.roles.split(',').filter(id => guild.roles.cache.has(id));
      await target.roles.set(roleIds, \`Unsuspended by \${member.user.tag}\`);
      db.saveRoles(guild.id, user.id, data.roles, 0);
      await interaction.reply(\`✅ Restored roles for \${user.tag}\`);
    }

    if (commandName === 'scan') {
      const bots = (await guild.members.fetch()).filter(m => m.user.bot);
      let list = bots.map(b => \`**\${b.user.tag}**: \${b.permissions.has(PermissionFlagsBits.Administrator) ? '🚨 ADMIN' : '✅ SECURE'}\`).join('\\n');
      const embed = new EmbedBuilder()
        .setTitle('🔍 Bot Security Scan')
        .setDescription(list || 'No bots found.')
        .setColor('#3498db');
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Daddy USSR Security Help')
        .setDescription('Wick-style advanced security system.')
        .addFields(
          { name: '⚙️ Configuration', value: \`/config nuke [type] [limit] [time]\\n/setup log [#channel]\` },
          { name: '🤝 Trust System', value: \`/trust add/remove [@user] [level]\` },
          { name: '⛔ Lockdown', value: \`/suspend [@user]\\n/unsuspend [@user]\` },
          { name: '🔍 Analysis', value: \`/scan (Bot Audit)\` }
        )
        .setColor('#5865F2');
      await interaction.reply({ embeds: [embed] });
    }
  } catch (e) {
    console.error(e);
    await interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
  }
});

client.once('ready', () => console.log(\`🚀 Daddy USSR Security Engine Online: \${client.user.tag}\`));
client.login(TOKEN);

// --- Command Registration ---
const commands = [
  { 
    name: 'config', 
    description: 'Configure thresholds', 
    options: [
      { name: 'type', type: 3, description: 'Event type', required: true, choices: [{ name: 'Channel Delete', value: 'channel_delete' }, { name: 'Role Delete', value: 'role_delete' }, { name: 'Member Ban', value: 'member_ban' }] },
      { name: 'limit', type: 4, description: 'Action limit', required: true },
      { name: 'time', type: 4, description: 'Window in seconds', required: true }
    ] 
  },
  { name: 'setup', description: 'Setup log channel', options: [{ name: 'channel', type: 7, description: 'Log channel', channel_types: [0], required: true }] },
  { 
    name: 'trust', 
    description: 'Manage trust', 
    options: [
      { name: 'add', type: 1, description: 'Add trust', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'level', type: 4, description: 'Level (1: Owner, 2: Trustee, 3: Permit)', required: true }] },
      { name: 'remove', type: 1, description: 'Remove trust', options: [{ name: 'user', type: 6, description: 'User', required: true }] }
    ] 
  },
  { name: 'suspend', description: 'Suspend user', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
  { name: 'unsuspend', description: 'Unsuspend user', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
  { name: 'scan', description: 'Security scan' },
  { name: 'help', description: 'Help menu' }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (e) { console.error(e); }
})();
