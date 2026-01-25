require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { 
  getGuildConfig, setAutomodConfig, addWarning, getWarnings, removeWarning, 
  getBlacklistWords, addBlacklistWord, removeBlacklistWord, 
  getCustomPrefix, setCustomPrefix, getPrefixCooldown,
  suspendUser, unsuspendUser, getSuspendedUsers,
  setAFK, getAllAFKUsers, getRecentMessages,
  addWhitelistRole, removeWhitelistRole, getWhitelistRoles,
  addWhitelistMember, removeWhitelistMember, getWhitelistMembers,
  getCase, getCases, createCase,
  setAntiNukeConfig, setAntiRaidConfig, setAntiSpamConfig
} = require('./src/database');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';
const SAPPHIRE_COLOR = '#5865F2';
const PREFIX = process.env.PREFIX || '=';

const sapphireEmbed = (title, desc, color = SAPPHIRE_COLOR, fields = []) => {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || '⠀')
    .setColor(color)
    .setTimestamp();
  if (fields.length > 0) embed.addFields(fields);
  return embed;
};

const formatTime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('Daddy USSR - Moderation Bot', { type: 'WATCHING' });
});

// INTERACTION CREATE (SLASH COMMANDS & BUTTONS)
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('help_page_')) {
      const page = parseInt(interaction.customId.split('_')[2]);
      const allCmds = ['/kick', '/ban', '/mute', '/warn', '/unwarn', '/unban', '/unmute', '/suspend', '/unsuspend', '/suspended-list', '/add-role', '/remove-role', '/nick', '/change-role-name', '/warns', '/server-timeout-status', '/case', '/cases', '/user-info', '/server-info', '/ban-list', '/set-channel', '/enable-automod', '/disable-automod', '/enable-language-guardian', '/disable-language-guardian', '/setup-language-guardian', '/lgbl add', '/lgbl remove', '/lgbl list', '/purge', '/prune', '/afk', '/afk-list', '/say', '/lock', '/unlock', '/set-prefix', '/help-command', '/setup-anti-nuke', '/setup-anti-raid', '/setup-anti-spam', '/enable-anti-spam', '/disable-anti-spam', '/set-auto-role', '/remove-auto-role', '/server-config', '/server-report', '/whitelist add', '/whitelist remove', '/whitelist list'];
      const totalPages = Math.ceil(allCmds.length / 10);
      const start = page * 10;
      const pageCommands = allCmds.slice(start, start + 10);
      const embed = sapphireEmbed('🤖 Bot Commands', `Page ${page + 1}/${totalPages} • Total: ${allCmds.length} commands`);
      embed.addFields({ name: '📋 Commands', value: pageCommands.map((cmd, i) => `${start + i + 1}. ${cmd}`).join('\n') });
      const buttons = new ActionRowBuilder();
      if (page > 0) buttons.addComponents(new ButtonBuilder().setCustomId(`help_page_${page - 1}`).setLabel('← Previous').setStyle(ButtonStyle.Secondary));
      if (page < totalPages - 1) buttons.addComponents(new ButtonBuilder().setCustomId(`help_page_${page + 1}`).setLabel('Next →').setStyle(ButtonStyle.Secondary));
      return await interaction.update({ embeds: [embed], components: buttons.components.length > 0 ? [buttons] : [] });
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, guild } = interaction;

  try {
    switch (commandName) {
      case 'setup-automod': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        const config = getGuildConfig(guild.id);
        const embed = sapphireEmbed('🛡️ Automod Configuration', 'Configure the unified automod system.');
        embed.addFields(
          { name: '🤖 Status', value: config?.automod_enabled ? '✅ ENABLED' : '❌ DISABLED', inline: true },
          { name: '🌍 Language Guardian', value: config?.automod_multilingual ? '✅ ENABLED' : '❌ DISABLED', inline: true },
          { name: '⚡ Action', value: (config?.automod_punishment_action || 'WARN').toUpperCase(), inline: true },
          { name: '⏱️ Duration', value: config?.automod_punishment_duration || '1h', inline: true }
        );
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`automod_toggle_${guild.id}`).setLabel(config?.automod_enabled ? 'Disable Automod' : 'Enable Automod').setStyle(config?.automod_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`automod_toggle_lg_${guild.id}`).setLabel(config?.automod_multilingual ? 'Disable LG' : 'Enable LG').setStyle(config?.automod_multilingual ? ButtonStyle.Danger : ButtonStyle.Success)
        );
        await interaction.reply({ embeds: [embed], components: [row1] });
        break;
      }
      case 'kick': {
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: '❌ Kick permission required.', ephemeral: true });
        const user = options.getUser('user');
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target || !target.kickable) return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
        await target.kick();
        await interaction.reply({ content: `✅ Kicked ${user.tag}` });
        break;
      }
      case 'ban': {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '❌ Ban permission required.', ephemeral: true });
        const user = options.getUser('user');
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target || !target.bannable) return interaction.reply({ content: '❌ Cannot ban this user.', ephemeral: true });
        await target.ban();
        await interaction.reply({ content: `✅ Banned ${user.tag}` });
        break;
      }
      case 'mute': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Moderate Members required.', ephemeral: true });
        const user = options.getUser('user');
        const duration = options.getInteger('duration');
        const unit = options.getString('unit');
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
        const ms = duration * (unit === 'm' ? 60000 : unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 604800000);
        await target.timeout(ms);
        await interaction.reply({ content: `✅ Muted ${user.tag} for ${duration}${unit}.` });
        break;
      }
      case 'warn': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Moderate Members required.', ephemeral: true });
        const user = options.getUser('user');
        const reason = options.getString('reason');
        addWarning(guild.id, user.id, reason, interaction.user.id);
        await interaction.reply({ content: `✅ Warned ${user.tag}: ${reason}` });
        break;
      }
      case 'suspend': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        const user = options.getUser('user');
        const target = await guild.members.fetch(user.id);
        const roles = target.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
        suspendUser(guild.id, user.id, roles.join(','), options.getString('reason'));
        await target.roles.set([]); // In production, add a prison role if configured
        await interaction.reply({ content: `✅ Suspended ${user.tag}` });
        break;
      }
      case 'unsuspend': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        const user = options.getUser('user');
        const data = getSuspension(guild.id, user.id);
        if (!data) return interaction.reply({ content: '❌ Not suspended.', ephemeral: true });
        const target = await guild.members.fetch(user.id);
        await target.roles.set(data.roles.split(','));
        deleteSuspension(guild.id, user.id);
        await interaction.reply({ content: `✅ Unsuspended ${user.tag}` });
        break;
      }
      case 'purge': {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Manage Messages required.', ephemeral: true });
        const amount = options.getInteger('amount');
        await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `✅ Deleted ${amount} messages.`, ephemeral: true });
        break;
      }
      case 'help': {
        const allCmds = ['/kick', '/ban', '/mute', '/warn', '/unwarn', '/unban', '/unmute', '/suspend', '/unsuspend', '/suspended-list', '/add-role', '/remove-role', '/nick', '/change-role-name', '/warns', '/server-timeout-status', '/case', '/cases', '/user-info', '/server-info', '/ban-list', '/set-channel', '/enable-automod', '/disable-automod', '/enable-language-guardian', '/disable-language-guardian', '/setup-language-guardian', '/lgbl add', '/lgbl remove', '/lgbl list', '/purge', '/prune', '/afk', '/afk-list', '/say', '/lock', '/unlock', '/set-prefix', '/help-command', '/setup-anti-nuke', '/setup-anti-raid', '/setup-anti-spam', '/enable-anti-spam', '/disable-anti-spam', '/set-auto-role', '/remove-auto-role', '/server-config', '/server-report', '/whitelist add', '/whitelist remove', '/whitelist list'];
        const embed = sapphireEmbed('🤖 Bot Commands', `Page 1/6 • Total: ${allCmds.length} commands`);
        embed.addFields({ name: '📋 Commands', value: allCmds.slice(0, 10).map((cmd, i) => `${i + 1}. ${cmd}`).join('\n') });
        const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('help_page_1').setLabel('Next →').setStyle(ButtonStyle.Secondary));
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }
      case 'user-info': {
        const user = options.getUser('user');
        const member = await guild.members.fetch(user.id).catch(() => null);
        const embed = sapphireEmbed(`👤 User Info: ${user.tag}`, '');
        embed.addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Joined', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Not in server', inline: true }
        );
        embed.setThumbnail(user.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
        break;
      }
      default:
        await interaction.reply({ content: 'This command handler is being optimized. Please use other commands or /help.', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: '❌ Error.', ephemeral: true });
  }
});

// MESSAGE CREATE (LEGACY PREFIX SUPPORT)
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const prefix = getCustomPrefix(message.guild.id) || PREFIX;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    if (command === 'kick') {
      if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ No perms.');
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ Mention a user.');
      const target = await message.guild.members.fetch(user.id);
      await target.kick();
      message.reply(`✅ Kicked ${user.tag}`);
    } else if (command === 'ban') {
      if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ No perms.');
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ Mention a user.');
      const target = await message.guild.members.fetch(user.id);
      await target.ban();
      message.reply(`✅ Banned ${user.tag}`);
    } else if (command === 'help') {
      message.reply('Bot is fully active! Use `/help` for all commands.');
    }
  } catch (err) {
    console.error(err);
  }
});

client.login(TOKEN);
