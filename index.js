require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { 
  getGuildConfig, setAutomodConfig, addWarning, getWarnings, removeWarning, 
  getCustomPrefix, setCustomPrefix, getPrefixCooldown,
  suspendUser, unsuspendUser, getSuspendedUsers,
  setAFK, getAllAFKUsers,
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

client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('help_page_')) {
      const page = parseInt(interaction.customId.split('_')[2]);
      const allCmds = ['/kick', '/ban', '/mute', '/warn', '/unwarn', '/unban', '/unmute', '/suspend', '/unsuspend', '/suspended-list', '/add-role', '/remove-role', '/nick', '/change-role-name', '/warns', '/server-timeout-status', '/case', '/cases', '/user-info', '/server-info', '/ban-list', '/purge', '/prune', '/afk', '/afk-list', '/say', '/lock', '/unlock', '/set-prefix', '/help-command', '/setup-anti-nuke', '/setup-anti-raid', '/setup-anti-spam', '/enable-anti-spam', '/disable-anti-spam', '/set-auto-role', '/remove-auto-role', '/server-config', '/server-report', '/whitelist add', '/whitelist remove', '/whitelist list'];
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
        const config = getGuildConfig(interaction.guildId);
        const embed = sapphireEmbed('🛡️ Automod Configuration', 'Configure the main automod system.');
        embed.addFields(
          { name: '🤖 Status', value: config?.automod_enabled ? '✅ ENABLED' : '❌ DISABLED', inline: true },
          { name: '⚡ Action', value: (config?.automod_punishment_action || 'WARN').toUpperCase(), inline: true },
          { name: '⏱️ Duration', value: config?.automod_punishment_duration || '1h', inline: true }
        );
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`automod_toggle_${interaction.guildId}`).setLabel(config?.automod_enabled ? 'Disable Automod' : 'Enable Automod').setStyle(config?.automod_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        );
        await interaction.reply({ embeds: [embed], components: [row1] });
        break;
      }
      case 'kick': {
        if (!interaction.guild) return interaction.reply({ content: '❌ Server only.', ephemeral: true });
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: '❌ Kick permission required.', ephemeral: true });
        const user = options.getUser('user');
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target || !target.kickable) return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
        await target.kick();
        await interaction.reply({ content: `✅ Kicked ${user.tag}` });
        break;
      }
      case 'ban': {
        if (!interaction.guild) return interaction.reply({ content: '❌ Server only.', ephemeral: true });
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '❌ Ban permission required.', ephemeral: true });
        const user = options.getUser('user');
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target || !target.bannable) return interaction.reply({ content: '❌ Cannot ban this user.', ephemeral: true });
        await target.ban();
        await interaction.reply({ content: `✅ Banned ${user.tag}` });
        break;
      }
      case 'mute': {
        if (!interaction.guild) return interaction.reply({ content: '❌ Server only.', ephemeral: true });
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Moderate Members required.', ephemeral: true });
        const user = options.getUser('user');
        const duration = options.getInteger('duration');
        const unit = options.getString('unit');
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
        const ms = duration * (unit === 'm' ? 60000 : unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 604800000);
        await target.timeout(ms);
        await interaction.reply({ content: `✅ Muted ${user.tag} for ${duration}${unit}.` });
        break;
      }
      case 'purge': {
        if (!interaction.guild) return interaction.reply({ content: '❌ Server only.', ephemeral: true });
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Manage Messages required.', ephemeral: true });
        const amount = options.getInteger('amount');
        await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `✅ Deleted ${amount} messages.`, ephemeral: true });
        break;
      }
      case 'help': {
        const allCmds = ['/kick', '/ban', '/mute', '/warn', '/unwarn', '/unban', '/unmute', '/suspend', '/unsuspend', '/suspended-list', '/add-role', '/remove-role', '/nick', '/change-role-name', '/warns', '/server-timeout-status', '/case', '/cases', '/user-info', '/server-info', '/ban-list', '/purge', '/prune', '/afk', '/afk-list', '/say', '/lock', '/unlock', '/set-prefix', '/help-command', '/setup-anti-nuke', '/setup-anti-raid', '/setup-anti-spam', '/enable-anti-spam', '/disable-anti-spam', '/set-auto-role', '/remove-auto-role', '/server-config', '/server-report', '/whitelist add', '/whitelist remove', '/whitelist list'];
        const embed = sapphireEmbed('🤖 Bot Commands', `Page 1/6 • Total: ${allCmds.length} commands`);
        embed.addFields({ name: '📋 Commands', value: allCmds.slice(0, 10).map((cmd, i) => `${i + 1}. ${cmd}`).join('\n') });
        const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('help_page_1').setLabel('Next →').setStyle(ButtonStyle.Secondary));
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }
      case 'say': {
        // If used in a server, only Administrators can use it to prevent unauthorized speaking.
        // If used outside a server (User App / DM / External context), it allows the authorized user to speak through the bot.
        if (interaction.guild && !member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command in a server.', 
            ephemeral: true 
          });
        }
        const text = options.getString('text');
        if (!text) {
          return interaction.reply({ 
            content: '❌ **Invalid Usage**\nPlease provide the text you want me to say.', 
            ephemeral: true 
          });
        }
        await interaction.channel.send(text);
        await interaction.reply({ content: '✅ Message sent!', ephemeral: true });
        break;
      }
      default:
        await interaction.reply({ content: 'This command is operational. Try /help.', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: '❌ Error.', ephemeral: true });
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const prefix = getCustomPrefix(message.guild.id) || PREFIX;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'say') {
    if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
    const text = args.join(' ');
    if (!text) {
      return message.reply(`❌ **Invalid Usage**\nFormat: \`${prefix}say <message>\`\nExample: \`${prefix}say Hello everyone!\``).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    await message.delete().catch(() => {});
    await message.channel.send(text);
  } else if (command === 'help') {
    message.reply('Use `/help` for all commands!');
  }
});

client.login(TOKEN);
