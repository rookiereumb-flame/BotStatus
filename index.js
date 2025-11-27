require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
require('./server');
const { addWarning, getWarnings, removeWarning, setLogChannel, enableAutomod, disableAutomod, addBlacklistWord, removeBlacklistWord, getBlacklistWords } = require('./src/database');
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
  },
  {
    name: 'nick',
    description: 'Change a user\'s nickname',
    options: [
      {
        name: 'user',
        description: 'The user to change nickname for',
        type: 6,
        required: true
      },
      {
        name: 'nickname',
        description: 'The new nickname (leave empty to reset)',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'purge',
    description: 'Delete messages from a channel',
    options: [
      {
        name: 'amount',
        description: 'Number of messages to delete (1-100)',
        type: 4,
        required: true,
        min_value: 1,
        max_value: 100
      }
    ]
  },
  {
    name: 'unwarn',
    description: 'Remove a warning from a user',
    options: [
      {
        name: 'user',
        description: 'The user to remove warning from',
        type: 6,
        required: true
      },
      {
        name: 'warning_number',
        description: 'The warning number to remove',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
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
    console.log('\n⚖️  MODERATION:');
    console.log('  /kick');
    console.log('  /ban');
    console.log('  /mute');
    console.log('  /warn');
    console.log('  /unban');
    console.log('  /unmute');
    console.log('  /unwarn');
    console.log('\n👥 ROLE MANAGEMENT:');
    console.log('  /addrole');
    console.log('  /removerole');
    console.log('  /nick');
    console.log('\n📊 INFORMATION:');
    console.log('  /warns');
    console.log('  /status');
    console.log('  /help');
    console.log('\n🛡️  AUTOMOD:');
    console.log('  /setchannel');
    console.log('  /enableautomod');
    console.log('  /disableautomod');
    console.log('  /addblacklistword');
    console.log('  /removeblacklistword');
    console.log('  /blacklistwords');
    console.log('\n🔧 UTILITIES:');
    console.log('  /purge');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
});

const PREFIX = 'n?';

client.on('messageCreate', async message => {
  // Automod check
  await checkMessage(message);
  
  // Prefix command handling
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  
  try {
    switch(cmd) {
      case 'kick': {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return message.reply('❌ You need the "Kick Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to kick.');
        const reason = args.join(' ') || 'No reason provided';
        const targetMember = await message.guild.members.fetch(user.id);
        if (!targetMember.kickable) return message.reply('❌ Cannot kick this user.');
        await targetMember.kick(reason);
        addWarning(message.guild.id, user.id, message.author.id, `Kicked: ${reason}`);
        message.reply(`✅ Kicked ${user.tag} - ${reason}`);
        break;
      }
      
      case 'ban': {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return message.reply('❌ You need the "Ban Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to ban.');
        const reason = args.join(' ') || 'No reason provided';
        const targetMember = await message.guild.members.fetch(user.id);
        if (!targetMember.bannable) return message.reply('❌ Cannot ban this user.');
        await targetMember.ban({ reason });
        addWarning(message.guild.id, user.id, message.author.id, `Banned: ${reason}`);
        message.reply(`✅ Banned ${user.tag} - ${reason}`);
        break;
      }
      
      case 'mute': {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return message.reply('❌ You need the "Timeout Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to mute.');
        const duration = parseInt(args[0]);
        if (!duration || duration > 40320) return message.reply('❌ Duration must be 1-40320 minutes.');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        const targetMember = await message.guild.members.fetch(user.id);
        await targetMember.timeout(duration * 60 * 1000, reason);
        addWarning(message.guild.id, user.id, message.author.id, `Muted (${duration}m): ${reason}`);
        message.reply(`✅ Muted ${user.tag} for ${duration} minutes - ${reason}`);
        break;
      }
      
      case 'warn': {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return message.reply('❌ You need the "Moderate Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to warn.');
        const reason = args.join(' ') || 'No reason provided';
        addWarning(message.guild.id, user.id, message.author.id, reason);
        message.reply(`✅ Warned ${user.tag} - ${reason}`);
        break;
      }
      
      case 'unwarn': {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return message.reply('❌ You need the "Moderate Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user.');
        const warnNum = parseInt(args[0]);
        if (!warnNum) return message.reply('❌ Please specify warning number.');
        if (removeWarning(message.guild.id, user.id, warnNum - 1)) {
          message.reply(`✅ Removed warning #${warnNum} from ${user.tag}`);
        } else {
          message.reply(`❌ Warning #${warnNum} not found for ${user.tag}`);
        }
        break;
      }
      
      case 'nick': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
          return message.reply('❌ You need the "Manage Nicknames" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user.');
        const nickname = args.join(' ') || null;
        const targetMember = await message.guild.members.fetch(user.id);
        await targetMember.setNickname(nickname);
        if (nickname) {
          message.reply(`✅ Changed ${user.tag}'s nickname to: ${nickname}`);
        } else {
          message.reply(`✅ Reset ${user.tag}'s nickname`);
        }
        break;
      }
      
      case 'purge': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return message.reply('❌ You need the "Manage Messages" permission.');
        }
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return message.reply('❌ Please specify 1-100 messages to delete.');
        const deleted = await message.channel.bulkDelete(amount, true);
        message.reply(`✅ Deleted ${deleted.size} messages.`).then(msg => setTimeout(() => msg.delete(), 3000));
        break;
      }
      
      case 'warns': {
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user.');
        const warnings = getWarnings(message.guild.id, user.id);
        if (warnings.length === 0) {
          return message.reply(`✅ ${user.tag} has no warnings.`);
        }
        const list = warnings.map((w, i) => `${i + 1}. ${w.reason}`).slice(0, 10).join('\n');
        message.reply(`⚠️  **Warnings for ${user.tag}** (${warnings.length} total):\n${list}`);
        break;
      }
      
      case 'help': {
        message.reply(`🤖 **Discord Moderation Bot**\n\n**Slash Commands:** Use / followed by command\n**Prefix Commands:** Use n? followed by command\n\n⚖️ **Moderation:** Kick Member, Ban Member, Mute Member, Warn Member, Unwarn, Unmute Member, Unban User\n👥 **Role Management:** Add Role, Remove Role, Change Nickname\n📊 **Info:** Show Warnings, Show Timed Out Users, Help\n🛡️ **Automod:** Set Log Channel, Enable Automod, Disable Automod, Add Blacklist Word, Remove Blacklist Word, List Blacklist Words\n🔧 **Utilities:** Delete Messages`);
        break;
      }
    }
  } catch (error) {
    console.error(`Error executing prefix command ${cmd}:`, error);
    message.reply('❌ An error occurred executing that command.');
  }
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
              value: '`/kick` - Kick Member\n`/ban` - Ban Member\n`/mute` - Mute Member\n`/warn` - Warn Member\n`/unwarn` - Remove Warning\n`/unban` - Unban User\n`/unmute` - Unmute Member',
              inline: false
            },
            {
              name: '👥 Role Management',
              value: '`/addrole` - Add Role\n`/removerole` - Remove Role\n`/nick` - Change Nickname',
              inline: false
            },
            {
              name: '📊 Information',
              value: '`/warns` - Show Warnings\n`/status` - Show Timed Out Users\n`/help` - Show Help',
              inline: false
            },
            {
              name: '🛡️ Automod Configuration',
              value: '`/setchannel` - Set Log Channel\n`/enableautomod` - Enable Automod\n`/disableautomod` - Disable Automod\n`/addblacklistword` - Add Blacklist Word\n`/removeblacklistword` - Remove Blacklist Word\n`/blacklistwords` - List Blacklist Words',
              inline: false
            },
            {
              name: '🔧 Utilities',
              value: '`/purge` - Delete Messages',
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

      case 'nick': {
        if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Nicknames" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const nickname = interaction.options.getString('nickname');
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.manageable) {
          return interaction.reply({ 
            content: '❌ I cannot manage this user\'s nickname.', 
            ephemeral: true 
          });
        }
        
        await targetMember.setNickname(nickname);
        
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('✏️ Nickname Changed')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'New Nickname', value: nickname || 'Reset to default', inline: true }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'purge': {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Messages" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const amount = interaction.options.getInteger('amount');
        
        try {
          const deleted = await interaction.channel.bulkDelete(amount, true);
          await interaction.reply({ 
            content: `✅ Deleted ${deleted.size} messages.`, 
            ephemeral: true 
          });
        } catch (error) {
          await interaction.reply({ 
            content: '❌ Could not delete messages. Messages must be less than 2 weeks old.', 
            ephemeral: true 
          });
        }
        break;
      }

      case 'unwarn': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Moderate Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const warningNum = interaction.options.getInteger('warning_number');
        
        if (removeWarning(guild.id, user.id, warningNum - 1)) {
          await interaction.reply({ 
            content: `✅ Removed warning #${warningNum} from ${user.tag}`, 
            ephemeral: true 
          });
        } else {
          await interaction.reply({ 
            content: `❌ Warning #${warningNum} not found for ${user.tag}`, 
            ephemeral: true 
          });
        }
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
