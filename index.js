require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
require('./server');
const { addWarning, getWarnings, setLogChannel, enableAutomod, disableAutomod, addBlacklistWord, removeBlacklistWord, getBlacklistWords } = require('./src/database');
const { logModeration } = require('./src/utils/logger');
const { checkMessage } = require('./src/services/automod');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const commands = [
  {
    name: 'kick',
    description: 'Kick a member from the server',
    options: [
      {
        name: 'user',
        description: 'The user to kick',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for kicking',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'ban',
    description: 'Ban a member from the server',
    options: [
      {
        name: 'user',
        description: 'The user to ban',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for banning',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'mute',
    description: 'Timeout a member',
    options: [
      {
        name: 'user',
        description: 'The user to mute',
        type: 6,
        required: true
      },
      {
        name: 'duration',
        description: 'Duration in minutes (max 40320)',
        type: 4,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for muting',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'warn',
    description: 'Warn a member',
    options: [
      {
        name: 'user',
        description: 'The user to warn',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for warning',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'unban',
    description: 'Unban a user from the server',
    options: [
      {
        name: 'userid',
        description: 'The user ID to unban',
        type: 3,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for unbanning',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'unmute',
    description: 'Remove timeout from a member',
    options: [
      {
        name: 'user',
        description: 'The user to unmute',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for unmuting',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'addrole',
    description: 'Add a role to a user',
    options: [
      {
        name: 'user',
        description: 'The user to add role to',
        type: 6,
        required: true
      },
      {
        name: 'role',
        description: 'The role to add',
        type: 8,
        required: true
      }
    ]
  },
  {
    name: 'removerole',
    description: 'Remove a role from a user',
    options: [
      {
        name: 'user',
        description: 'The user to remove role from',
        type: 6,
        required: true
      },
      {
        name: 'role',
        description: 'The role to remove',
        type: 8,
        required: true
      }
    ]
  },
  {
    name: 'warns',
    description: 'Show all warnings for a user',
    options: [
      {
        name: 'user',
        description: 'The user to check warnings for',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'status',
    description: 'Show all currently timed out users in the server'
  },
  {
    name: 'help',
    description: 'Show bot information and all commands'
  },
  {
    name: 'setchannel',
    description: 'Set log channel for moderation actions',
    options: [
      {
        name: 'channel',
        description: 'The channel to log moderation actions',
        type: 7,
        required: true
      }
    ]
  },
  {
    name: 'enableautomod',
    description: 'Enable automod system'
  },
  {
    name: 'disableautomod',
    description: 'Disable automod system'
  },
  {
    name: 'addblacklistword',
    description: 'Add word to blacklist',
    options: [
      {
        name: 'word',
        description: 'The word to blacklist',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'removeblacklistword',
    description: 'Remove word from blacklist',
    options: [
      {
        name: 'word',
        description: 'The word to remove from blacklist',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'blacklistwords',
    description: 'List all blacklisted words'
  }
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  
  try {
    console.log('🔄 Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    
    console.log('✅ Successfully reloaded application (/) commands.');
    console.log('\n📋 Registered Commands:');
    commands.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
});

client.on('messageCreate', async message => {
  await checkMessage(message);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, member, guild } = interaction;
  
  try {
    switch (commandName) {
      case 'kick': {
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Kick Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.kickable) {
          return interaction.reply({ 
            content: '❌ I cannot kick this user. They may have higher permissions than me.', 
            ephemeral: true 
          });
        }
        
        await targetMember.kick(reason);
        addWarning(guild.id, user.id, interaction.user.id, `Kicked: ${reason}`);
        
        const embed = await logModeration(guild, 'kick', {
          user,
          moderator: interaction.user,
          reason
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      case 'ban': {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Ban Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.bannable) {
          return interaction.reply({ 
            content: '❌ I cannot ban this user. They may have higher permissions than me.', 
            ephemeral: true 
          });
        }
        
        await targetMember.ban({ reason });
        addWarning(guild.id, user.id, interaction.user.id, `Banned: ${reason}`);
        
        const embed = await logModeration(guild, 'ban', {
          user,
          moderator: interaction.user,
          reason
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      case 'mute': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Timeout Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (duration > 40320) {
          return interaction.reply({ 
            content: '❌ Duration cannot exceed 40320 minutes (28 days).', 
            ephemeral: true 
          });
        }
        
        if (!targetMember.moderatable) {
          return interaction.reply({ 
            content: '❌ I cannot timeout this user. They may have higher permissions than me.', 
            ephemeral: true 
          });
        }
        
        await targetMember.timeout(duration * 60 * 1000, reason);
        addWarning(guild.id, user.id, interaction.user.id, `Muted (${duration}m): ${reason}`);
        
        const embed = await logModeration(guild, 'mute', {
          user,
          moderator: interaction.user,
          reason,
          duration
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      case 'warn': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Moderate Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        
        addWarning(guild.id, user.id, interaction.user.id, reason);
        
        const embed = await logModeration(guild, 'warn', {
          user,
          moderator: interaction.user,
          reason
        });
        
        await interaction.reply({ embeds: [embed] });
        
        try {
          await user.send({
            embeds: [new EmbedBuilder()
              .setColor(0xF1C40F)
              .setTitle('⚠️ You have been warned')
              .setDescription(`You received a warning in **${guild.name}**`)
              .addFields({ name: 'Reason', value: reason })
              .setTimestamp()
            ]
          });
        } catch (error) {
          console.log(`Could not DM ${user.tag}`);
        }
        break;
      }
      
      case 'unban': {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Ban Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          await guild.members.unban(userId, reason);
          
          const embed = await logModeration(guild, 'unban', {
            userId,
            moderator: interaction.user,
            reason
          });
          
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ 
            content: '❌ Could not unban user. Make sure the User ID is correct and they are banned.', 
            ephemeral: true 
          });
        }
        break;
      }
      
      case 'unmute': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Timeout Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.moderatable) {
          return interaction.reply({ 
            content: '❌ I cannot modify this user\'s timeout.', 
            ephemeral: true 
          });
        }
        
        await targetMember.timeout(null, reason);
        
        const embed = await logModeration(guild, 'unmute', {
          user,
          moderator: interaction.user,
          reason
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'addrole': {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Roles" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const targetMember = await guild.members.fetch(user.id);
        
        if (targetMember.roles.cache.has(role.id)) {
          return interaction.reply({ 
            content: `❌ ${user.tag} already has the ${role.name} role.`, 
            ephemeral: true 
          });
        }
        
        await targetMember.roles.add(role);
        
        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Role Added')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Role', value: `${role.name}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'removerole': {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Roles" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.roles.cache.has(role.id)) {
          return interaction.reply({ 
            content: `❌ ${user.tag} doesn't have the ${role.name} role.`, 
            ephemeral: true 
          });
        }
        
        await targetMember.roles.remove(role);
        
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🗑️ Role Removed')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Role', value: `${role.name}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'warns': {
        const user = interaction.options.getUser('user');
        const warnings = getWarnings(guild.id, user.id);
        
        if (warnings.length === 0) {
          return interaction.reply({ 
            content: `✅ ${user.tag} has no warnings.`, 
            ephemeral: true 
          });
        }
        
        const embed = new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle(`⚠️ Warnings for ${user.tag}`)
          .setDescription(`Total warnings: ${warnings.length}`)
          .setTimestamp();
        
        warnings.slice(0, 10).forEach((warning, index) => {
          const date = new Date(warning.timestamp).toLocaleString();
          embed.addFields({
            name: `Warning #${index + 1}`,
            value: `**Reason:** ${warning.reason}\n**Date:** ${date}`,
            inline: false
          });
        });
        
        if (warnings.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings` });
        }
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'status': {
        const members = await guild.members.fetch();
        const timedOutMembers = members.filter(m => m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now());
        
        if (timedOutMembers.size === 0) {
          return interaction.reply({ 
            content: '✅ No users are currently timed out.', 
            ephemeral: true 
          });
        }
        
        const embed = new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('🔇 Currently Timed Out Users')
          .setDescription(`Total: ${timedOutMembers.size}`)
          .setTimestamp();
        
        timedOutMembers.forEach(member => {
          const endsAt = new Date(member.communicationDisabledUntilTimestamp);
          const timeLeft = Math.round((member.communicationDisabledUntilTimestamp - Date.now()) / 60000);
          embed.addFields({
            name: member.user.tag,
            value: `Ends: ${endsAt.toLocaleString()}\nTime left: ${timeLeft} minutes`,
            inline: true
          });
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🤖 Discord Moderation Bot')
          .setDescription('A comprehensive moderation bot with automod features')
          .addFields(
            {
              name: '⚖️ Moderation Commands',
              value: '`/kick` - Kick a member\n`/ban` - Ban a member\n`/mute` - Timeout a member\n`/warn` - Warn a member\n`/unban` - Unban a user\n`/unmute` - Remove timeout',
              inline: false
            },
            {
              name: '👥 Role Management',
              value: '`/addrole` - Add role to user\n`/removerole` - Remove role from user',
              inline: false
            },
            {
              name: '📊 Information',
              value: '`/warns` - View user warnings\n`/status` - View timed out users\n`/help` - Show this message',
              inline: false
            },
            {
              name: '🛡️ Automod Configuration',
              value: '`/setchannel` - Set log channel\n`/enableautomod` - Enable automod\n`/disableautomod` - Disable automod\n`/addblacklistword` - Add blacklisted word\n`/removeblacklistword` - Remove blacklisted word\n`/blacklistwords` - List blacklisted words',
              inline: false
            }
          )
          .setFooter({ text: 'Use commands responsibly' })
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'setchannel': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const channel = interaction.options.getChannel('channel');
        
        if (channel.type !== ChannelType.GuildText) {
          return interaction.reply({ 
            content: '❌ Please select a text channel.', 
            ephemeral: true 
          });
        }
        
        setLogChannel(guild.id, channel.id);
        
        await interaction.reply({ 
          content: `✅ Log channel set to ${channel}`, 
          ephemeral: true 
        });
        break;
      }

      case 'enableautomod': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        enableAutomod(guild.id);
        
        await interaction.reply({ 
          content: '✅ Automod system has been enabled. Messages will be checked against the blacklist.', 
          ephemeral: true 
        });
        break;
      }

      case 'disableautomod': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        disableAutomod(guild.id);
        
        await interaction.reply({ 
          content: '✅ Automod system has been disabled.', 
          ephemeral: true 
        });
        break;
      }

      case 'addblacklistword': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const word = interaction.options.getString('word');
        const success = addBlacklistWord(guild.id, word);
        
        if (success) {
          await interaction.reply({ 
            content: `✅ Added "${word}" to the blacklist.`, 
            ephemeral: true 
          });
        } else {
          await interaction.reply({ 
            content: `❌ "${word}" is already in the blacklist.`, 
            ephemeral: true 
          });
        }
        break;
      }

      case 'removeblacklistword': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const word = interaction.options.getString('word');
        const success = removeBlacklistWord(guild.id, word);
        
        if (success) {
          await interaction.reply({ 
            content: `✅ Removed "${word}" from the blacklist.`, 
            ephemeral: true 
          });
        } else {
          await interaction.reply({ 
            content: `❌ "${word}" is not in the blacklist.`, 
            ephemeral: true 
          });
        }
        break;
      }

      case 'blacklistwords': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const words = getBlacklistWords(guild.id);
        
        if (words.length === 0) {
          return interaction.reply({ 
            content: '✅ No words are currently blacklisted.', 
            ephemeral: true 
          });
        }
        
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('🚫 Blacklisted Words')
          .setDescription(words.map((w, i) => `${i + 1}. ${w}`).join('\n'))
          .setFooter({ text: `Total: ${words.length} words` })
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
    }
  } catch (error) {
    console.error(`Error executing ${commandName}:`, error);
    const errorMessage = { 
      content: '❌ An error occurred while executing this command.', 
      ephemeral: true 
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.login(TOKEN).catch(error => {
  console.error('❌ Failed to login:', error);
  console.log('\n⚠️  Make sure DISCORD_BOT_TOKEN is set in your environment variables.');
});
