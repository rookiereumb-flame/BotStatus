require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
require('./server');
const { addWarning, getWarnings, removeWarning, setLogChannel, enableAutomod, disableAutomod, enableLGBL, disableLGBL, setCustomPrefix, getCustomPrefix, getPrefixCooldown, addBlacklistWord, removeBlacklistWord, getBlacklistWords, getAntiNukeConfig, setAntiNukeConfig, getAntiRaidConfig, setAntiRaidConfig, createCase, getCase, getCases, updateCaseStatus, updateCase, deleteCase, enableAntiSpam, disableAntiSpam, getAntiSpamConfig, setAntiSpamConfig, trackSpamMessage, getRecentMessages, cleanupSpamTracking, setAutoRole, removeAutoRole, getAutoRole, setLanguageGuardianConfig, getLanguageGuardianConfig, addWhitelistRole, removeWhitelistRole, getWhitelistRoles, addWhitelistMember, removeWhitelistMember, getWhitelistMembers, isUserWhitelisted, setWhitelistBypassConfig, getWhitelistBypassConfig, addAuditLog, getAuditLogsByTimeRange, suspendUser, unsuspendUser, getSuspendedUsers, isUserSuspended } = require('./src/database');
const { logModeration } = require('./src/utils/logger');
const { checkMessage } = require('./src/services/automod');
const { matchesBlacklist, safeTranslate, addStrike, resetStrikesFor, getStrikes, addWord, removeWord, getWords, sendModLog } = require('./src/services/language-guardian');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';
const SAPPHIRE_COLOR = '#5865F2';
const PREFIX = process.env.PREFIX || '!';
const MOD_LOG_CHANNEL = process.env.MOD_LOG_CHANNEL || '';
const STRIKE_LIMIT = parseInt(process.env.STRIKE_LIMIT || '3', 10);
const TIMEOUT_SECONDS = parseInt(process.env.TIMEOUT_SECONDS || '600', 10);

// Helper function to check if user's highest role is above bot's highest role
const isUserAboveBot = (member, guild) => {
  const botMember = guild.members.cache.get(client.user.id);
  if (!botMember) return false;
  
  const userHighestRole = member.roles.highest;
  const botHighestRole = botMember.roles.highest;
  
  return userHighestRole.position > botHighestRole.position;
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
    name: 'add-role',
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
    name: 'remove-role',
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
    name: 'server-timeout-status',
    description: 'Show all currently timed out users in the server'
  },
  {
    name: 'help',
    description: 'Show bot information and all commands'
  },
  {
    name: 'set-prefix',
    description: 'Set custom prefix for your server (2-3 chars, must include #$_-+/*:!?~=\\)',
    options: [
      {
        name: 'prefix',
        description: 'The new prefix (2-3 characters)',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'set-channel',
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
    name: 'enable-automod',
    description: 'Enable automod system'
  },
  {
    name: 'disable-automod',
    description: 'Disable automod system'
  },
  {
    name: 'enable-language-guardian',
    description: 'Enable Language Guardian'
  },
  {
    name: 'disable-language-guardian',
    description: 'Disable Language Guardian'
  },
  {
    name: 'lgbl',
    description: 'Language Guardian - manage blacklisted words',
    options: [
      {
        name: 'add',
        description: 'Language Guardian - Add a word to the blacklist (works in any language)',
        type: 1,
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
        name: 'remove',
        description: 'Language Guardian - Remove a word from the blacklist',
        type: 1,
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
        name: 'list',
        description: 'Language Guardian - List all blacklisted words',
        type: 1
      }
    ]
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
  },
  {
    name: 'say',
    description: 'Make the bot say something',
    options: [
      {
        name: 'text',
        description: 'The text to say',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'change-role-name',
    description: 'Change a role\'s name',
    options: [
      {
        name: 'role',
        description: 'The role to rename',
        type: 8,
        required: true
      },
      {
        name: 'newname',
        description: 'The new name for the role',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'lock',
    description: 'Lock a channel (prevent members from sending messages)',
    options: [
      {
        name: 'channel',
        description: 'The channel to lock',
        type: 7,
        required: false
      }
    ]
  },
  {
    name: 'unlock',
    description: 'Unlock a channel (allow members to send messages)',
    options: [
      {
        name: 'channel',
        description: 'The channel to unlock',
        type: 7,
        required: false
      }
    ]
  },
  {
    name: 'setup-anti-nuke',
    description: 'Setup anti-nuke protection'
  },
  {
    name: 'setup-anti-raid',
    description: 'Setup anti-raid protection'
  },
  {
    name: 'case',
    description: 'View a specific moderation case',
    options: [
      {
        name: 'case_id',
        description: 'The case ID to view',
        type: 4,
        required: true
      }
    ]
  },
  {
    name: 'cases',
    description: 'View all moderation cases or cases for a user',
    options: [
      {
        name: 'user',
        description: 'Optional: View cases for a specific user',
        type: 6,
        required: false
      }
    ]
  },
  {
    name: 'user-info',
    description: 'Get information about a user',
    options: [
      {
        name: 'user',
        description: 'The user to get info about',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'server-info',
    description: 'Get information about the server'
  },
  {
    name: 'ban-list',
    description: 'View ban and kick history'
  },
  {
    name: 'enable-anti-spam',
    description: 'Enable anti-spam protection'
  },
  {
    name: 'disable-anti-spam',
    description: 'Disable anti-spam protection'
  },
  {
    name: 'setup-anti-spam',
    description: 'Configure anti-spam settings',
    options: [
      {
        name: 'max_messages',
        description: 'Max messages allowed in time window',
        type: 4,
        required: false,
        min_value: 2,
        max_value: 10
      },
      {
        name: 'time_window',
        description: 'Time window in seconds',
        type: 4,
        required: false,
        min_value: 5,
        max_value: 60
      },
      {
        name: 'mute_duration',
        description: 'Mute duration in minutes',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 60
      }
    ]
  },
  {
    name: 'setup-language-guardian',
    description: 'Configure Language Guardian settings',
    options: [
      {
        name: 'strike_limit',
        description: 'Number of strikes before timeout',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 10
      },
      {
        name: 'timeout_minutes',
        description: 'Timeout duration in minutes',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 60
      }
    ]
  },
  {
    name: 'set-auto-role',
    description: 'Set role to auto-assign to new members',
    options: [
      {
        name: 'role',
        description: 'The role to auto-assign',
        type: 8,
        required: true
      }
    ]
  },
  {
    name: 'remove-auto-role',
    description: 'Remove auto-role assignment'
  },
  {
    name: 'whitelist',
    description: 'Manage whitelist (roles/members exempt from moderation)',
    options: [
      {
        name: 'add',
        description: 'Add role or member to whitelist',
        type: 1,
        options: [
          {
            name: 'role',
            description: 'Role to whitelist',
            type: 8,
            required: false
          },
          {
            name: 'member',
            description: 'Member to whitelist',
            type: 6,
            required: false
          }
        ]
      },
      {
        name: 'remove',
        description: 'Remove role or member from whitelist',
        type: 1,
        options: [
          {
            name: 'role',
            description: 'Role to remove',
            type: 8,
            required: false
          },
          {
            name: 'member',
            description: 'Member to remove',
            type: 6,
            required: false
          }
        ]
      },
      {
        name: 'list',
        description: 'View all whitelisted roles and members',
        type: 1
      }
    ]
  },
  {
    name: 'server-config',
    description: 'Advanced server configuration (admin only)'
  },
  {
    name: 'suspend',
    description: 'Suspend a user (removes all roles, only for roles above bot)',
    options: [
      {
        name: 'user',
        description: 'User to suspend',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for suspension',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'unsuspend',
    description: 'Restore a suspended user (only for roles above bot)',
    options: [
      {
        name: 'user',
        description: 'User to restore',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'suspended-list',
    description: 'View all suspended users'
  },
  {
    name: 'server-report',
    description: 'View server audit logs between two times and undo changes (admin only)',
    options: [
      {
        name: 'from-hour',
        description: 'From hour (0-12)',
        type: 4,
        required: true,
        min_value: 0,
        max_value: 12
      },
      {
        name: 'from-minute',
        description: 'From minute (0-59)',
        type: 4,
        required: true,
        min_value: 0,
        max_value: 59
      },
      {
        name: 'from-meridian',
        description: 'From AM or PM',
        type: 3,
        required: true,
        choices: [
          { name: 'AM', value: 'AM' },
          { name: 'PM', value: 'PM' }
        ]
      },
      {
        name: 'to-hour',
        description: 'To hour (0-12)',
        type: 4,
        required: true,
        min_value: 0,
        max_value: 12
      },
      {
        name: 'to-minute',
        description: 'To minute (0-59)',
        type: 4,
        required: true,
        min_value: 0,
        max_value: 59
      },
      {
        name: 'to-meridian',
        description: 'To AM or PM',
        type: 3,
        required: true,
        choices: [
          { name: 'AM', value: 'AM' },
          { name: 'PM', value: 'PM' }
        ]
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
    console.log('  /add-role');
    console.log('  /remove-role');
    console.log('  /nick');
    console.log('  /change-role-name');
    console.log('\n📊 INFORMATION:');
    console.log('  /warns');
    console.log('  /server-timeout-status');
    console.log('  /help');
    console.log('\n🛡️  AUTOMOD:');
    console.log('  /set-channel');
    console.log('  /enable-automod');
    console.log('  /disable-automod');
    console.log('  /enable-language-guardian');
    console.log('  /disable-language-guardian');
    console.log('  /lgbl');
    console.log('\n🔧 UTILITIES:');
    console.log('  /purge');
    console.log('  /say');
    console.log('  /lock');
    console.log('  /unlock');
    console.log('  /set-prefix');
    console.log('\n🛡️  PROTECTION:');
    console.log('  /setup-anti-nuke');
    console.log('  /setup-anti-raid');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    // Get custom prefix for this guild
    const customPrefix = getCustomPrefix(message.guild.id) || PREFIX;

    // Bot mention handler - ONLY reply if bot is directly mentioned (not a reply to another message)
    if (message.mentions.has(client.user.id) && !message.reference) {
      try {
        await message.reply(`Hello ${message.author}, ***nice to meet you I am Daddy USSR*** pls use \` /help \` to get started!!`);
      } catch (e) {
        console.error('Error sending mention reply:', e);
      }
      return;
    }

    // Anti-Spam Detection
    try {
      const spamConfig = getAntiSpamConfig(message.guild.id);
      if (spamConfig && spamConfig.enabled) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!isUserWhitelisted(message.guild.id, message.author.id, member, 'anti_spam')) {
          trackSpamMessage(message.guild.id, message.author.id);
          const recentMessages = getRecentMessages(message.guild.id, message.author.id, spamConfig.time_window);
          
          if (recentMessages.length > spamConfig.max_messages) {
            await message.delete().catch(() => {});
            if (member && member.moderatable) {
              await member.timeout(spamConfig.mute_duration * 1000, 'Anti-spam');
              message.channel.send(`⏱️ ${message.author} has been muted for spam.`)
                .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
          }
        }
      }
    } catch (e) {}

    // Check if message starts with prefix for command processing
    const isCommand = message.content.startsWith(customPrefix);
    
    if (!isCommand) {
      // Only run automod & LGBL on non-command messages
      
      // Anti-Spam Detection (already done above)
      
      // Language Guardian - Automatic bad word detection (only if LGBL enabled)
      try {
        const guildConfig = require('./src/database').getGuildConfig(message.guild.id);
        if (guildConfig && guildConfig.lgbl_enabled) {
          const member = await message.guild.members.fetch(message.author.id).catch(() => null);
          if (!isUserWhitelisted(message.guild.id, message.author.id, member, 'language_guardian')) {
            const lgConfig = getLanguageGuardianConfig(message.guild.id);
            // Get blacklist words from DATABASE (per guild)
            const blacklistWords = getBlacklistWords(message.guild.id);
            
            if (blacklistWords && blacklistWords.length > 0) {
              // Translate the message first
              const translated = await safeTranslate(message.content);
              
              // Check translated text against database blacklist
              let foundBadWord = null;
              for (const badWord of blacklistWords) {
                const regex = new RegExp(`\\b${badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (regex.test(translated.toLowerCase())) {
                  foundBadWord = badWord;
                  break;
                }
              }

              if (foundBadWord) {
                await message.delete().catch(() => {});
                const strikesNow = addStrike(message.guild.id, message.author.id);

                message.channel.send(`❌ ${message.author}, that word is not allowed. (Strike ${strikesNow}/${lgConfig.strikeLimit})`)
                  .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));

                await sendModLog(message.guild, `${message.author.tag} sent a banned word: ${foundBadWord}`);

                if (strikesNow >= lgConfig.strikeLimit) {
                  if (member && member.moderatable) {
                    await member.timeout(lgConfig.timeoutSeconds * 1000, "Blacklist strikes exceeded");
                    resetStrikesFor(message.guild.id, message.author.id);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Language Guardian error:', e);
      }
      
      // Automod check
      await checkMessage(message);
      return;
    }
    
    const args = message.content.slice(customPrefix.length).trim().split(/ +/);
    let cmd = args.shift().toLowerCase();
    
    // Command aliases
    const aliases = {
      'k': 'kick', 'b': 'ban', 'm': 'mute', 'um': 'unmute', 'ub': 'unban', 'w': 'warn', 'uw': 'unwarn',
      'ar': 'add-role', 'rr': 'remove-role', 'p': 'purge', 's': 'say', 'bl': 'blacklist', 'pb': 'purgebad',
      'cr': 'change-role-name', 'l': 'lock', 'ul': 'unlock', 'sp': 'set-prefix', 'sc': 'set-channel',
      'ea': 'enable-automod', 'da': 'disable-automod', 'elg': 'enable-language-guardian', 'dlg': 'disable-language-guardian',
      'sus': 'suspend', 'unsus': 'unsuspend', 'susl': 'suspended-list'
    };
    
    // Resolve alias to full command
    if (aliases[cmd]) cmd = aliases[cmd];
    
    // Handle multi-word commands (e.g., "set prefix" -> "set-prefix", "add role" -> "add-role")
    if (args.length > 0) {
      const multiWordCmd = cmd + '-' + args[0];
      const knownCommands = [
        'kick', 'ban', 'mute', 'unmute', 'unban', 'warn', 'unwarn', 'add-role', 'remove-role', 'purge', 'say', 'blacklist', 'purgebad',
        'change-role-name', 'lock', 'unlock', 'set-prefix', 'set-channel', 'enable-automod', 'disable-automod', 
        'enable-language-guardian', 'disable-language-guardian', 'suspend', 'unsuspend', 'suspended-list'
      ];
      if (knownCommands.includes(multiWordCmd)) {
        cmd = multiWordCmd;
        args.shift(); // Remove the second word from args
      }
    }
    
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
          return message.reply('❌ You need moderation permissions.');
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
          return message.reply('❌ You need moderation permissions.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user.');
        const warningNum = parseInt(args[1]) - 1;
        if (removeWarning(message.guild.id, user.id, warningNum)) {
          message.reply(`✅ Removed warning from ${user.tag}`);
        } else {
          message.reply('❌ Could not find that warning.');
        }
        break;
      }

      case 'blacklist': {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions.");
        }

        const action = args.shift()?.toLowerCase();
        const word = args.join(" ").toLowerCase();

        if (action === "add") {
          if (!word) return message.reply("❌ Please provide a word to add.");
          if (addBlacklistWord(message.guild.id, word)) {
            return message.reply(`✅ Added \`${word}\` to blacklist for this server.`);
          } else {
            return message.reply(`❌ \`${word}\` is already in the blacklist.`);
          }
        }

        if (action === "remove") {
          if (!word) return message.reply("❌ Please provide a word to remove.");
          if (removeBlacklistWord(message.guild.id, word)) {
            return message.reply(`✅ Removed \`${word}\` from blacklist for this server.`);
          } else {
            return message.reply(`❌ \`${word}\` is not in the blacklist.`);
          }
        }

        if (action === "list") {
          const words = getBlacklistWords(message.guild.id);
          if (words.length === 0) {
            return message.reply("📚 **Blacklist:** No words added yet.");
          }
          const wordList = words.slice(0, 50).join(", ") + (words.length > 50 ? `\n\n...and ${words.length - 50} more words` : "");
          return message.reply(`📚 **Blacklist (${words.length} words):**\n${wordList}`);
        }

        return message.reply("Usage: `!blacklist <add/remove/list> [word]`");
      }

      case 'purgebad': {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("You need admin permissions.");
        }

        const limit = parseInt(args[0]) || 30;
        const messages = await message.channel.messages.fetch({ limit });

        const toDelete = [];
        for (const m of messages.values()) {
          const translated = await safeTranslate(m.content);
          if (matchesBlacklist(translated)) toDelete.push(m);
        }

        for (const m of toDelete) m.delete().catch(() => {});
        return message.reply(`✅ Deleted ${toDelete.length} bad messages.`);
      }
      
      case 'unban': {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return message.reply('❌ You need the "Ban Members" permission.');
        }
        const userId = args[0];
        if (!userId) return message.reply('❌ Please provide a user ID.');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        await message.guild.bans.remove(userId, reason);
        message.reply(`✅ Unbanned user ${userId} - ${reason}`);
        break;
      }
      
      case 'unmute': {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return message.reply('❌ You need the "Timeout Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to unmute.');
        const reason = args.join(' ') || 'No reason provided';
        const targetMember = await message.guild.members.fetch(user.id);
        await targetMember.timeout(null, reason);
        message.reply(`✅ Unmuted ${user.tag}`);
        break;
      }

      case 'add-role': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return message.reply('❌ You need the "Manage Roles" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Please mention a role.');
        const targetMember = await message.guild.members.fetch(user.id);
        await targetMember.roles.add(role);
        message.reply(`✅ Added role ${role.name} to ${user.tag}`);
        break;
      }
      
      case 'remove-role': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return message.reply('❌ You need the "Manage Roles" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Please mention a role.');
        const targetMember = await message.guild.members.fetch(user.id);
        await targetMember.roles.remove(role);
        message.reply(`✅ Removed role ${role.name} from ${user.tag}`);
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
        message.reply(`✅ Changed nickname for ${user.tag}`);
        break;
      }

      case 'say': {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ You need Administrator permission.');
        }
        const text = args.join(' ');
        if (!text) return message.reply('❌ Please provide text to say.');
        message.delete().catch(() => {});
        await message.channel.send(text);
        break;
      }

      case 'change-role-name': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return message.reply('❌ You need the "Manage Roles" permission.');
        }
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Please mention a role.');
        const newName = args.join(' ');
        if (!newName) return message.reply('❌ Please provide a new name.');
        await role.setName(newName);
        message.reply(`✅ Renamed role to **${newName}**`);
        break;
      }

      case 'lock': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return message.reply('❌ You need the "Manage Channels" permission.');
        }
        const channel = message.channel;
        await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
        message.reply(`🔒 Channel locked!`);
        break;
      }

      case 'unlock': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return message.reply('❌ You need the "Manage Channels" permission.');
        }
        const channel = message.channel;
        await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
        message.reply(`🔓 Channel unlocked!`);
        break;
      }
      
      case 'suspend': {
        if (!isUserAboveBot(message.member, message.guild)) {
          return message.reply('❌ Your role must be above the bot\'s highest role to use this command.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to suspend.');
        const reason = args.join(' ') || 'No reason provided';
        const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) return message.reply('❌ User not found.');
        
        let suspendRole = message.guild.roles.cache.find(r => r.name === '⛔ Suspended');
        if (!suspendRole) {
          suspendRole = await message.guild.roles.create({
            name: '⛔ Suspended',
            color: '#FF0000',
            reason: 'Suspend role for suspended users'
          }).catch(() => null);
        }
        if (!suspendRole) return message.reply('❌ Could not create suspend role.');
        
        let suspendChannel = message.guild.channels.cache.find(c => c.name === 'suspended' && c.type === ChannelType.GuildText);
        if (!suspendChannel) {
          suspendChannel = await message.guild.channels.create({
            name: 'suspended',
            type: ChannelType.GuildText,
            reason: 'Channel for suspended users',
            permissionOverwrites: [
              {
                id: message.guild.id,
                deny: ['ViewChannel']
              },
              {
                id: suspendRole.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
              }
            ]
          }).catch(() => null);
        }
        
        const previousRoles = targetMember.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
        suspendUser(message.guild.id, user.id, suspendRole.id, previousRoles, reason);
        for (const role of targetMember.roles.cache.values()) {
          if (role.id !== message.guild.id) await targetMember.roles.remove(role).catch(() => {});
        }
        await targetMember.roles.add(suspendRole).catch(() => {});
        
        await sendModLog(message.guild, `⛔ ${user.tag} has been suspended.\n**Reason:** ${reason}`);
        
        message.reply(`✅ ${user.tag} suspended. Reason: ${reason}`);
        break;
      }
      
      case 'unsuspend': {
        if (!isUserAboveBot(message.member, message.guild)) {
          return message.reply('❌ Your role must be above the bot\'s highest role to use this command.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to unsuspend.');
        if (!isUserSuspended(message.guild.id, user.id)) return message.reply('❌ This user is not suspended.');
        const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) return message.reply('❌ User not found.');
        const previousRoles = unsuspendUser(message.guild.id, user.id);
        await targetMember.roles.set(previousRoles).catch(() => {});
        await sendModLog(message.guild, `✅ ${user.tag} has been unsuspended.`);
        message.reply(`✅ ${user.tag} restored.`);
        break;
      }
      
      case 'suspended-list': {
        const suspended = getSuspendedUsers(message.guild.id);
        if (suspended.length === 0) return message.reply('✅ No suspended users.');
        const list = suspended.map(s => `👤 <@${s.user_id}> - ${s.suspend_reason}`).join('\n');
        message.reply(`⛔ **Suspended Users:**\n${list}`);
        break;
      }
      
      default: {
        // Suggest correct command
        const allCommands = ['kick', 'ban', 'mute', 'unmute', 'unban', 'warn', 'unwarn', 'add-role', 'remove-role', 'nick', 'change-role-name', 'say', 'purge', 'lock', 'unlock', 'set-prefix', 'set-channel', 'enable-automod', 'disable-automod', 'enable-language-guardian', 'disable-language-guardian', 'blacklist', 'purgebad'];
        
        // Find closest match
        const suggestions = allCommands.filter(c => c.startsWith(cmd.charAt(0))).slice(0, 3);
        
        if (suggestions.length > 0) {
          const suggestionText = suggestions.map(s => `\`${customPrefix}${s}\``).join(', ');
          return message.reply({ content: `❌ Unknown command \`${cmd}\`. Did you mean: ${suggestionText}?`, ephemeral: true });
        } else {
          return message.reply({ content: `❌ Unknown command \`${cmd}\`. Use \`${customPrefix}help\` for a list of commands.`, ephemeral: true });
        }
      }
    }
  } catch (error) {
    console.error('Error in prefix command:', error);
    message.reply('❌ An error occurred while executing the command.');
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, options, member, guild } = interaction;
  const sapphireEmbed = (title, desc, color = SAPPHIRE_COLOR) => {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setColor(color)
      .setTimestamp();
  };

  try {
    switch(commandName) {
      case 'kick': {
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Kick Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        if (!targetMember.kickable) return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
        await targetMember.kick(reason);
        addWarning(guild.id, user.id, member.id, `Kicked: ${reason}`);
        const caseId = createCase(guild.id, user.id, member.id, 'kick', reason);
        const embed = sapphireEmbed('👢 Member Kicked', `${user} has been kicked from the server.\n**Reason:** ${reason}\n**Case #${caseId}**`);
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
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        if (!targetMember.bannable) return interaction.reply({ content: '❌ Cannot ban this user.', ephemeral: true });
        await targetMember.ban({ reason });
        addWarning(guild.id, user.id, member.id, `Banned: ${reason}`);
        const caseId = createCase(guild.id, user.id, member.id, 'ban', reason);
        const embed = sapphireEmbed('🔨 Member Banned', `${user} has been banned from the server.\n**Reason:** ${reason}\n**Case #${caseId}**`);
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
        const user = options.getUser('user');
        const duration = options.getInteger('duration');
        const reason = options.getString('reason') || 'No reason provided';
        if (duration > 40320) return interaction.reply({ content: '❌ Duration cannot exceed 40320 minutes.', ephemeral: true });
        const targetMember = await guild.members.fetch(user.id);
        await targetMember.timeout(duration * 60 * 1000, reason);
        addWarning(guild.id, user.id, member.id, `Muted (${duration}m): ${reason}`);
        const caseId = createCase(guild.id, user.id, member.id, 'mute', reason, duration);
        const embed = sapphireEmbed('🔇 Member Muted', `${user} has been muted for ${duration} minutes.\n**Reason:** ${reason}\n**Case #${caseId}**`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'warn': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need moderation permissions to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const reason = options.getString('reason');
        addWarning(guild.id, user.id, member.id, reason);
        const caseId = createCase(guild.id, user.id, member.id, 'warn', reason);
        const warnings = getWarnings(guild.id, user.id);
        const embed = sapphireEmbed('⚠️ Member Warned', `${user} has been warned.\n**Reason:** ${reason}\n**Total Warnings:** ${warnings.length}\n**Case #${caseId}**`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'unwarn': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need moderation permissions to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const warningNum = options.getInteger('warning_number') - 1;
        if (removeWarning(guild.id, user.id, warningNum)) {
          const warnings = getWarnings(guild.id, user.id);
          const embed = sapphireEmbed('✅ Warning Removed', `Removed warning from ${user}.\n**Remaining Warnings:** ${warnings.length}`);
          await interaction.reply({ embeds: [embed] });
        } else {
          await interaction.reply({ content: '❌ Could not find that warning.', ephemeral: true });
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
        const userId = options.getString('userid');
        const reason = options.getString('reason') || 'No reason provided';
        await guild.bans.remove(userId, reason);
        const caseId = createCase(guild.id, userId, member.id, 'unban', reason);
        const embed = sapphireEmbed('✅ Member Unbanned', `User ${userId} has been unbanned.\n**Reason:** ${reason}\n**Case #${caseId}**`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'unmute': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Timeout Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        await targetMember.timeout(null, reason);
        const caseId = createCase(guild.id, user.id, member.id, 'unmute', reason);
        const embed = sapphireEmbed('🔊 Member Unmuted', `${user} has been unmuted.\n**Case #${caseId}**`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'add-role': {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Roles" permission to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const role = options.getRole('role');
        const targetMember = await guild.members.fetch(user.id);
        await targetMember.roles.add(role);
        const embed = sapphireEmbed('✅ Role Added', `Added role ${role} to ${user}.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'remove-role': {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Roles" permission to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const role = options.getRole('role');
        const targetMember = await guild.members.fetch(user.id);
        await targetMember.roles.remove(role);
        const embed = sapphireEmbed('✅ Role Removed', `Removed role ${role} from ${user}.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'nick': {
        if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Nicknames" permission to use this command.', 
            ephemeral: true 
          });
        }
        const user = options.getUser('user');
        const nickname = options.getString('nickname') || null;
        const targetMember = await guild.members.fetch(user.id);
        await targetMember.setNickname(nickname);
        const embed = sapphireEmbed('✅ Nickname Changed', `Changed nickname for ${user}.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'warns': {
        const user = options.getUser('user');
        const warnings = getWarnings(guild.id, user.id);
        if (warnings.length === 0) {
          const embed = sapphireEmbed('📋 No Warnings', `${user} has no warnings.`);
          return await interaction.reply({ embeds: [embed] });
        }
        let warningText = '';
        warnings.forEach((w, i) => {
          warningText += `**${i + 1}.** ${w.reason}\n`;
        });
        const embed = sapphireEmbed(`⚠️ Warnings for ${user.username}`, warningText);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'server-timeout-status': {
        const members = await guild.members.fetch();
        const timedOutMembers = members.filter(m => m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now());
        
        if (timedOutMembers.size === 0) {
          const embed = sapphireEmbed('✅ No Timeouts', 'No members are currently timed out.');
          return await interaction.reply({ embeds: [embed] });
        }
        
        let statusText = '';
        timedOutMembers.forEach(m => {
          const timeLeft = Math.ceil((m.communicationDisabledUntilTimestamp - Date.now()) / 1000 / 60);
          statusText += `${m.user.tag} - ${timeLeft} minutes left\n`;
        });
        
        const embed = sapphireEmbed(`⏱️ Timed Out Members (${timedOutMembers.size})`, statusText);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'set-channel': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        const channel = options.getChannel('channel');
        setLogChannel(guild.id, channel.id);
        const embed = sapphireEmbed('✅ Log Channel Set', `Moderation logs will now be sent to ${channel}.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'enable-automod': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        enableAutomod(guild.id);
        const embed = sapphireEmbed('✅ Automod Enabled', 'Automod is now enabled for this server.');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'disable-automod': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        disableAutomod(guild.id);
        const embed = sapphireEmbed('✅ Automod Disabled', 'Automod is now disabled for this server.');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'enable-language-guardian': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        enableLGBL(guild.id);
        const embed = sapphireEmbed('✅ Language Guardian Enabled', 'Language Guardian is now active for this server.\n\nUsers will get strikes for blacklisted words (3 strikes = timeout).');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'disable-language-guardian': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        disableLGBL(guild.id);
        const embed = sapphireEmbed('✅ Language Guardian Disabled', 'Language Guardian is now disabled for this server.');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'lgbl': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }

        const subcommand = options.getSubcommand();
        
        if (subcommand === 'add') {
          const word = options.getString('word');
          if (addBlacklistWord(guild.id, word)) {
            const embed = sapphireEmbed('✅ Added to LGBL', `**${word}** has been added to the Language Guardian Blacklist Library.\n\n*This word will be detected in any language!*`);
            await interaction.reply({ embeds: [embed] });
          } else {
            await interaction.reply({ content: '❌ Word already in LGBL.', ephemeral: true });
          }
        } 
        else if (subcommand === 'remove') {
          const word = options.getString('word');
          if (removeBlacklistWord(guild.id, word)) {
            const embed = sapphireEmbed('✅ Removed from LGBL', `**${word}** has been removed from the Language Guardian Blacklist Library.`);
            await interaction.reply({ embeds: [embed] });
          } else {
            await interaction.reply({ content: '❌ Word not found in LGBL.', ephemeral: true });
          }
        } 
        else if (subcommand === 'list') {
          const words = getBlacklistWords(guild.id);
          if (words.length === 0) {
            const embed = sapphireEmbed('📚 Language Guardian Blacklist Library', 'No blacklisted words yet.');
            return await interaction.reply({ embeds: [embed] });
          }
          const wordList = words.slice(0, 50).join(', ') + (words.length > 50 ? `\n\n...and ${words.length - 50} more words` : '');
          const embed = sapphireEmbed('📚 Language Guardian Blacklist Library', `**${words.length} words:** (works in any language!)\n\n${wordList}`);
          await interaction.reply({ embeds: [embed] });
        }
        break;
      }

      case 'purge': {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Messages" permission to use this command.', 
            ephemeral: true 
          });
        }
        const amount = options.getInteger('amount');
        await interaction.channel.bulkDelete(amount);
        const embed = sapphireEmbed('🗑️ Messages Purged', `Deleted ${amount} messages.`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'set-prefix': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        // Check cooldown
        const cooldown = getPrefixCooldown(interaction.guildId);
        if (cooldown && !cooldown.canChange) {
          return interaction.reply({ 
            content: `Hello sorry i couldn't change the prefix because there's already an existing prefix (\`${cooldown.prefix}\`) pls try after ${cooldown.remainingDays} day${cooldown.remainingDays !== 1 ? 's' : ''}`, 
            ephemeral: true 
          });
        }
        
        const prefix = options.getString('prefix');
        const validSpecialChars = '#$_-+/*:!?~=\\';
        
        // Check length (max 3 characters)
        if (prefix.length === 0 || prefix.length > 3) {
          return interaction.reply({ 
            content: `❌ Prefix must be 1-3 characters long.`, 
            ephemeral: true 
          });
        }
        
        // Check if all characters are valid (special chars or alphanumeric)
        const validAllChars = validSpecialChars + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        if (!prefix.split('').every(c => validAllChars.includes(c))) {
          return interaction.reply({ 
            content: `❌ Prefix can only contain letters, numbers, or special characters: ${validSpecialChars}`, 
            ephemeral: true 
          });
        }
        
        setCustomPrefix(interaction.guildId, prefix);
        const embed = sapphireEmbed('✅ Custom Prefix Set', `Server prefix changed to \`${prefix}\`\n\nExample: \`${prefix}unmute @user reason\``);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'help': {
        const embed = sapphireEmbed('🤖 Bot Help', 'All available commands:');
        embed.addFields(
          {
            name: '⚖️ Moderation Commands',
            value: '` /kick ` - Kick Member\n` /ban ` - Ban Member\n` /mute ` - Mute Member\n` /warn ` - Warn Member\n` /unwarn ` - Remove Warning\n` /unban ` - Unban User\n` /unmute ` - Unmute Member\n` /suspend ` - Suspend User\n` /unsuspend ` - Restore User',
            inline: false
          },
          {
            name: '👥 Role Management',
            value: '` /add-role ` - Add Role\n` /remove-role ` - Remove Role\n` /nick ` - Change Nickname\n` /change-role-name ` - Rename Role',
            inline: false
          },
          {
            name: '📊 Information',
            value: '` /warns ` - Show Warnings\n` /server-timeout-status ` - Show Timed Out Users\n` /case ` - View Case\n` /cases ` - View Cases\n` /user-info ` - View User Details\n` /server-info ` - View Server Details\n` /ban-list ` - View All Banned Members\n` /help ` - Show Help',
            inline: false
          },
          {
            name: '🛡️ Automod Configuration',
            value: '` /set-channel ` - Set Log Channel\n` /enable-automod ` - Enable Automod\n` /disable-automod ` - Disable Automod\n` /enable-language-guardian ` - Enable Language Guardian\n` /disable-language-guardian ` - Disable Language Guardian',
            inline: false
          },
          {
            name: '🛡️ Language Guardian (LGBL)',
            value: '` /lgbl add ` - Add Word to Blacklist\n` /lgbl remove ` - Remove Word from Blacklist\n` /lgbl list ` - List Blacklisted Words',
            inline: false
          },
          {
            name: '🔧 Utilities',
            value: '` /purge ` - Delete Messages\n` /say ` - Make Bot Say Something\n` /lock ` - Lock Channel\n` /unlock ` - Unlock Channel\n` /set-prefix ` - Set Custom Prefix',
            inline: false
          },
          {
            name: '🛡️ Protection & Configuration',
            value: '` /setup-anti-nuke ` - Setup Anti-Nuke\n` /setup-anti-raid ` - Setup Anti-Raid\n` /setup-anti-spam ` - Configure Anti-Spam\n` /enable-anti-spam ` - Enable Anti-Spam\n` /disable-anti-spam ` - Disable Anti-Spam\n` /set-auto-role ` - Set Auto Role on Join\n` /remove-auto-role ` - Remove Auto Role\n` /server-config ` - Admin Config Panel\n` /server-report ` - View Audit Logs & Undo\n` /suspended-list ` - View Suspended Users',
            inline: false
          },
          {
            name: '⚙️ Whitelist Management',
            value: '` /whitelist add ` - Add Role/Member to Whitelist\n` /whitelist remove ` - Remove from Whitelist\n` /whitelist list ` - View Whitelist',
            inline: false
          }
        );
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'say': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        const text = options.getString('text');
        await interaction.channel.send(text);
        await interaction.reply({ content: '✅ Message sent!', ephemeral: true });
        break;
      }

      case 'change-role-name': {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Roles" permission to use this command.', 
            ephemeral: true 
          });
        }
        const role = options.getRole('role');
        const newName = options.getString('newname');
        await role.setName(newName);
        const embed = sapphireEmbed('✅ Role Renamed', `Role has been renamed to **${newName}**.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'lock': {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Channels" permission to use this command.', 
            ephemeral: true 
          });
        }
        const channel = options.getChannel('channel') || interaction.channel;
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
        const embed = sapphireEmbed('🔒 Channel Locked', `${channel} has been locked.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'unlock': {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Channels" permission to use this command.', 
            ephemeral: true 
          });
        }
        const channel = options.getChannel('channel') || interaction.channel;
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: null });
        const embed = sapphireEmbed('🔓 Channel Unlocked', `${channel} has been unlocked.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'setup-anti-nuke': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        const config = {
          enabled: 1,
          action: 'ban',
          thresholdChannels: 5,
          thresholdRoles: 5,
          thresholdBans: 3,
          timeWindow: 300,
          logChannelId: null
        };
        setAntiNukeConfig(guild.id, config);
        const embed = sapphireEmbed('🛡️ Anti-Nuke Setup Complete', 
          `Anti-Nuke protection is now **enabled** for this server!\n\n**Default Settings:**\n• Action: Ban\n• Channel Deletion Threshold: 5 channels\n• Role Deletion Threshold: 5 roles\n• Ban Threshold: 3 bans\n• Time Window: 5 minutes\n\nYou can customize these settings in the database if needed.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'setup-anti-raid': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        const config = {
          enabled: 1,
          action: 'ban',
          thresholdJoins: 5,
          timeWindow: 60,
          logChannelId: null
        };
        setAntiRaidConfig(guild.id, config);
        const embed = sapphireEmbed('🛡️ Anti-Raid Setup Complete', 
          `Anti-Raid protection is now **enabled** for this server!\n\n**Default Settings:**\n• Action: Ban\n• Join Threshold: 5 members\n• Time Window: 1 minute\n\nYou can customize these settings in the database if needed.`);
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'user-info': {
        const user = options.getUser('user');
        const member = await guild.members.fetch(user.id).catch(() => null);
        const accountAge = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
        const joinAge = member ? Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24)) : 0;
        
        const embed = sapphireEmbed(`👤 ${user.tag}`, '');
        embed.addFields(
          { name: '📋 Account Info', value: `**Username:** ${user.username}\n**ID:** ${user.id}\n**Bot:** ${user.bot ? 'Yes ✓' : 'No'}`, inline: false },
          { name: '📅 Dates', value: `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R> (${accountAge} days)\n${member ? `**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R> (${joinAge} days)` : 'Not a member'}`, inline: false },
          { name: '👥 Roles', value: member && member.roles.cache.size > 1 ? member.roles.cache.sort((a, b) => b.position - a.position).map(r => r.name).slice(0, 10).join(', ') + (member.roles.cache.size > 10 ? `\n... and ${member.roles.cache.size - 10} more` : '') : 'No roles', inline: false },
          { name: '⚠️ Statistics', value: `**Warnings:** ${getWarnings(guild.id, user.id).length}\n**Cases:** ${getCases(guild.id, user.id).length}`, inline: false }
        );
        embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`userinfo_warns_${user.id}`)
              .setLabel('Warnings')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚠️'),
            new ButtonBuilder()
              .setCustomId(`userinfo_cases_${user.id}`)
              .setLabel('Cases')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📋'),
            new ButtonBuilder()
              .setURL(user.displayAvatarURL({ size: 1024 }))
              .setLabel('Avatar')
              .setStyle(ButtonStyle.Link)
              .setEmoji('🖼️')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }

      case 'server-info': {
        const owner = await guild.fetchOwner();
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const members = await guild.members.fetch();
        const botCount = members.filter(m => m.user.bot).size;
        const humanCount = guild.memberCount - botCount;
        
        const embed = sapphireEmbed(`🏰 ${guild.name}`, '');
        embed.addFields(
          { name: '📋 Server Info', value: `**ID:** ${guild.id}\n**Owner:** ${owner.user.tag}\n**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: false },
          { name: '👥 Members', value: `**Total:** ${guild.memberCount}\n**Humans:** ${humanCount}\n**Bots:** ${botCount}`, inline: false },
          { name: '📢 Channels', value: `**Text:** ${textChannels}\n**Voice:** ${voiceChannels}\n**Total Roles:** ${guild.roles.cache.size}`, inline: false },
          { name: '🔒 Security', value: `**Verification Level:** ${guild.verificationLevel}\n**2FA:** ${guild.mfaLevel === 1 ? 'Enabled' : 'Disabled'}`, inline: false },
          { name: '✨ Features', value: guild.features.length > 0 ? guild.features.join(', ').toLowerCase() : 'None', inline: false }
        );
        embed.setThumbnail(guild.iconURL({ size: 256 }));
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`serverinfo_banlist_${guild.id}`)
              .setLabel('Ban List')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🔨'),
            new ButtonBuilder()
              .setCustomId(`serverinfo_timeouts_${guild.id}`)
              .setLabel('Timeouts')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⏱️'),
            new ButtonBuilder()
              .setURL(guild.iconURL({ size: 1024 }))
              .setLabel('Server Icon')
              .setStyle(ButtonStyle.Link)
              .setEmoji('🖼️')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }

      case 'ban-list': {
        const bans = await guild.bans.fetch().catch(() => null);
        const kicks = getCases(guild.id).filter(c => c.action === 'kick');
        
        const allActions = [
          ...bans.map(ban => ({ type: 'ban', user: ban.user.tag, reason: ban.reason || 'No reason', timestamp: 0 })),
          ...kicks.map(k => ({ type: 'kick', user: k.user_id, reason: k.reason, timestamp: k.timestamp }))
        ];
        
        if (allActions.length === 0) {
          const embed = sapphireEmbed('📋 Ban/Kick History', 'No ban or kick history.');
          return await interaction.reply({ embeds: [embed] });
        }
        
        const totalPages = Math.ceil(allActions.length / 10);
        let currentPage = 0;
        
        const buildEmbed = (page) => {
          let list = '';
          const startIdx = page * 10;
          const endIdx = startIdx + 10;
          allActions.slice(startIdx, endIdx).forEach((action, idx) => {
            const emoji = action.type === 'ban' ? '🔨' : '👢';
            list += `${emoji} **${action.user}** - ${action.type.toUpperCase()} - ${action.reason}\n`;
          });
          return sapphireEmbed(`📋 Ban/Kick History (Page ${page + 1}/${totalPages})`, list);
        };
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`banlist_prev`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId(`banlist_next`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('➡️')
              .setDisabled(currentPage >= totalPages - 1)
          );
        
        await interaction.reply({ embeds: [buildEmbed(currentPage)], components: [buttons] });
        break;
      }

      case 'enable-anti-spam': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        enableAntiSpam(guild.id);
        const embed = sapphireEmbed('🛡️ Anti-Spam Enabled', '✅ Anti-spam system is now active.\n**Settings:**\n• Max messages: 5\n• Time window: 10 seconds\n• Action: Mute for 5 minutes');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'disable-anti-spam': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        disableAntiSpam(guild.id);
        const embed = sapphireEmbed('🛡️ Anti-Spam Disabled', '✅ Anti-spam system has been disabled.');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'setup-anti-spam': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        const maxMessages = options.getInteger('max_messages') || 5;
        const timeWindow = options.getInteger('time_window') || 10;
        const muteDuration = (options.getInteger('mute_duration') || 5) * 60;
        
        setAntiSpamConfig(guild.id, {
          enabled: 1,
          maxMessages,
          timeWindow,
          action: 'mute',
          muteDuration
        });
        
        const embed = sapphireEmbed('⚙️ Anti-Spam Configured', `✅ Anti-spam settings updated.\n**Max messages:** ${maxMessages}\n**Time window:** ${timeWindow}s\n**Mute duration:** ${muteDuration / 60} minutes`);
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`antispam_status_${guild.id}`)
              .setLabel('View Settings')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚙️'),
            new ButtonBuilder()
              .setCustomId(`antispam_disable_${guild.id}`)
              .setLabel('Disable')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }

      case 'set-auto-role': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        const role = options.getRole('role');
        setAutoRole(guild.id, role.id);
        const embed = sapphireEmbed('👥 Auto-Role Set', `✅ New members will receive the ${role.name} role.`);
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`autorole_status_${guild.id}`)
              .setLabel('View Setting')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('👥'),
            new ButtonBuilder()
              .setCustomId(`autorole_remove_${guild.id}`)
              .setLabel('Remove')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }

      case 'remove-auto-role': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        removeAutoRole(guild.id);
        const embed = sapphireEmbed('👥 Auto-Role Removed', '✅ Auto-role assignment has been disabled.');
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'server-config': {
        // Only allow users with roles above the bot
        if (!isUserAboveBot(member, guild)) {
          return interaction.reply({ content: '❌ Your role must be above the bot\'s highest role to use this command.', ephemeral: true });
        }
        
        const bypassConfig = getWhitelistBypassConfig(guild.id);
        const settings = `
**Whitelist Bypass Settings:**
🛡️ Anti-Spam: ${bypassConfig.bypass_anti_spam ? '✅ BYPASS' : '❌ NO BYPASS'}
🛡️ Language Guardian: ${bypassConfig.bypass_language_guardian ? '✅ BYPASS' : '❌ NO BYPASS'}
🛡️ Anti-Nuke: ${bypassConfig.bypass_anti_nuke ? '✅ BYPASS' : '❌ NO BYPASS'}
🛡️ Anti-Raid: ${bypassConfig.bypass_anti_raid ? '✅ BYPASS' : '❌ NO BYPASS'}

Click buttons below to toggle each system's whitelist bypass.
        `;
        
        const embed = sapphireEmbed('⚙️ Server Configuration', settings);
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`config_toggle_anti_spam_${guild.id}`)
              .setLabel('Toggle Anti-Spam')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🛡️'),
            new ButtonBuilder()
              .setCustomId(`config_toggle_lg_${guild.id}`)
              .setLabel('Toggle Language Guardian')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📢')
          );
        
        const buttons2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`config_toggle_anti_nuke_${guild.id}`)
              .setLabel('Toggle Anti-Nuke')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('💣'),
            new ButtonBuilder()
              .setCustomId(`config_toggle_anti_raid_${guild.id}`)
              .setLabel('Toggle Anti-Raid')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('👾')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons, buttons2], ephemeral: true });
        break;
      }

      case 'suspend': {
        // Only allow users with roles above the bot
        if (!isUserAboveBot(member, guild)) {
          return interaction.reply({ content: '❌ Your role must be above the bot\'s highest role to use this command.', ephemeral: true });
        }
        
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        
        const targetMember = await guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }
        
        // Get or create suspend role
        let suspendRole = guild.roles.cache.find(r => r.name === '⛔ Suspended');
        if (!suspendRole) {
          suspendRole = await guild.roles.create({
            name: '⛔ Suspended',
            color: '#FF0000',
            reason: 'Suspend role for suspended users'
          }).catch(() => null);
        }
        
        if (!suspendRole) {
          return interaction.reply({ content: '❌ Could not create suspend role.', ephemeral: true });
        }
        
        // Get or create suspend channel
        let suspendChannel = guild.channels.cache.find(c => c.name === 'suspended' && c.type === ChannelType.GuildText);
        if (!suspendChannel) {
          suspendChannel = await guild.channels.create({
            name: 'suspended',
            type: ChannelType.GuildText,
            reason: 'Channel for suspended users',
            permissionOverwrites: [
              {
                id: guild.id,
                deny: ['ViewChannel']
              },
              {
                id: suspendRole.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
              }
            ]
          }).catch(() => null);
        }
        
        // Store previous roles
        const previousRoles = targetMember.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
        suspendUser(guild.id, user.id, suspendRole.id, previousRoles, reason);
        
        // Remove ALL roles first
        try {
          for (const role of targetMember.roles.cache.values()) {
            if (role.id !== guild.id && role.id !== suspendRole.id) {
              await targetMember.roles.remove(role, `User suspended - ${reason}`).catch(() => {});
            }
          }
        } catch (err) {
          console.error('Error removing roles:', err);
        }
        
        // Then add suspend role only
        try {
          await targetMember.roles.add(suspendRole, `User suspended - ${reason}`);
        } catch (err) {
          console.error('Error adding suspend role:', err);
        }
        
        await sendModLog(guild, `⛔ ${user.tag} has been suspended.\n**Reason:** ${reason}`);
        
        const embed = sapphireEmbed('⛔ User Suspended', 
          `**User:** ${user.tag}\n**Reason:** ${reason}\n**Status:** Suspended\n\n✅ All roles removed\n✅ Suspend role assigned\n✅ Can only access #suspended channel\n\nUse \`/unsuspend\` to restore.`
        );
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'unsuspend': {
        // Only allow users with roles above the bot
        if (!isUserAboveBot(member, guild)) {
          return interaction.reply({ content: '❌ Your role must be above the bot\'s highest role to use this command.', ephemeral: true });
        }
        
        const user = options.getUser('user');
        
        if (!isUserSuspended(guild.id, user.id)) {
          return interaction.reply({ content: '❌ This user is not suspended.', ephemeral: true });
        }
        
        const targetMember = await guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }
        
        // Restore previous roles
        const previousRoles = unsuspendUser(guild.id, user.id);
        await targetMember.roles.set(previousRoles, 'User unsuspended').catch(() => {});
        
        await sendModLog(guild, `✅ ${user.tag} has been unsuspended.`);
        
        const embed = sapphireEmbed('✅ User Restored', 
          `**User:** ${user.tag}\n**Status:** Restored\n\nPrevious roles have been restored.`
        );
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'suspended-list': {
        const suspended = getSuspendedUsers(guild.id);
        
        if (suspended.length === 0) {
          return interaction.reply({ content: '✅ No suspended users.', ephemeral: true });
        }
        
        const list = suspended.map(s => {
          const date = new Date(s.suspend_timestamp).toLocaleString();
          return `👤 <@${s.user_id}> - **${s.suspend_reason}** <t:${Math.floor(s.suspend_timestamp / 1000)}:R>`;
        }).join('\n');
        
        const embed = sapphireEmbed('⛔ Suspended Users', list);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'server-report': {
        // Only allow users with roles above the bot
        if (!isUserAboveBot(member, guild)) {
          return interaction.reply({ content: '❌ Your role must be above the bot\'s highest role to use this command.', ephemeral: true });
        }
        
        const fromHour = options.getInteger('from-hour');
        const fromMinute = options.getInteger('from-minute');
        const fromMeridian = options.getString('from-meridian');
        const toHour = options.getInteger('to-hour');
        const toMinute = options.getInteger('to-minute');
        const toMeridian = options.getString('to-meridian');
        
        // Convert to 24-hour format
        let from24H = fromHour;
        if (fromMeridian === 'PM' && fromHour !== 12) from24H += 12;
        if (fromMeridian === 'AM' && fromHour === 12) from24H = 0;
        
        let to24H = toHour;
        if (toMeridian === 'PM' && toHour !== 12) to24H += 12;
        if (toMeridian === 'AM' && toHour === 12) to24H = 0;
        
        // Get today's date
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const fromTime = new Date(today);
        fromTime.setHours(from24H, fromMinute, 0, 0);
        
        const toTime = new Date(today);
        toTime.setHours(to24H, toMinute, 59, 999);
        
        // Fetch Discord audit logs for the time range
        const auditLogs = await guild.fetchAuditLogs({ limit: 100 }).catch(() => null);
        if (!auditLogs) {
          return interaction.reply({ content: '❌ Could not fetch audit logs.', ephemeral: true });
        }
        
        // Filter and categorize logs
        const filtered = auditLogs.entries.filter(log => {
          const logTime = new Date(log.createdTimestamp);
          return logTime >= fromTime && logTime <= toTime;
        });
        
        const categories = {
          1: { name: '📁 Channel Events', events: [] },
          2: { name: '🔰 Role Events', events: [] },
          3: { name: '👥 Member Events', events: [] },
          4: { name: '💬 Message Events', events: [] }
        };
        
        filtered.forEach(log => {
          const logInfo = {
            id: log.id,
            action: log.action,
            target: log.targetType,
            user: log.executor?.tag || 'Unknown',
            time: new Date(log.createdTimestamp).toLocaleTimeString(),
            details: `${log.targetType === 'Channel' ? '📁' : log.targetType === 'Role' ? '🔰' : log.targetType === 'User' ? '👤' : '💬'} ${log.action} - ${log.target?.name || 'Unknown'}`
          };
          
          if (log.targetType === 'Channel') categories[1].events.push(logInfo);
          else if (log.targetType === 'Role') categories[2].events.push(logInfo);
          else if (log.targetType === 'User' || log.targetType === 'Member') categories[3].events.push(logInfo);
          else categories[4].events.push(logInfo);
        });
        
        const total = Object.values(categories).reduce((sum, cat) => sum + cat.events.length, 0);
        
        const embed = sapphireEmbed('📊 Server Report', 
          `**Time Range:** ${fromHour}:${String(fromMinute).padStart(2, '0')} ${fromMeridian} - ${toHour}:${String(toMinute).padStart(2, '0')} ${toMeridian}\n**Total Events:** ${total}\n\n${
            Object.entries(categories)
              .map(([num, cat]) => `**${cat.name}:** ${cat.events.length} events`)
              .join('\n')
          }\n\nSelect events below to undo them.`
        );
        
        // Store events for button interactions
        if (!global.reportCache) global.reportCache = {};
        const cacheId = `${guild.id}_${Date.now()}`;
        global.reportCache[cacheId] = categories;
        
        // Create select menus for each category with events
        const selects = [];
        for (let i = 1; i <= 4; i++) {
          if (categories[i].events.length > 0) {
            const select = new ActionRowBuilder()
              .addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`report_select_${i}_${cacheId}`)
                  .setPlaceholder(`Select ${categories[i].name.toLowerCase()} to undo`)
                  .setMinValues(0)
                  .setMaxValues(Math.min(25, categories[i].events.length))
                  .addOptions(
                    categories[i].events.slice(0, 25).map((e, idx) => ({
                      label: e.details.substring(0, 100),
                      value: `${i}_${idx}`,
                      description: `By ${e.user} at ${e.time}`
                    }))
                  )
              );
            selects.push(select);
          }
        }
        
        const undoButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`report_undo_${cacheId}`)
              .setLabel('⏮️ Undo Selected')
              .setStyle(ButtonStyle.Danger)
          );
        
        selects.push(undoButton);
        
        await interaction.reply({ embeds: [embed], components: selects.length > 0 ? selects : undefined, ephemeral: true });
        break;
      }

      case 'whitelist': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        
        const subcommand = options.getSubcommand();
        
        if (subcommand === 'add') {
          const role = options.getRole('role');
          const user = options.getUser('member');
          
          if (!role && !user) {
            return interaction.reply({ content: '❌ Please provide either a role or member.', ephemeral: true });
          }
          
          if (role) {
            const added = addWhitelistRole(guild.id, role.id);
            if (!added) {
              return interaction.reply({ content: `❌ ${role.name} is already whitelisted.`, ephemeral: true });
            }
            const embed = sapphireEmbed('✅ Role Whitelisted', `**${role.name}** is now exempt from moderation.`);
            const buttons = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`whitelist_view_${guild.id}`)
                  .setLabel('View Whitelist')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('📋'),
                new ButtonBuilder()
                  .setCustomId(`whitelist_remove_role_${role.id}`)
                  .setLabel('Remove Role')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('❌')
              );
            await interaction.reply({ embeds: [embed], components: [buttons] });
          } else if (user) {
            const added = addWhitelistMember(guild.id, user.id);
            if (!added) {
              return interaction.reply({ content: `❌ ${user.tag} is already whitelisted.`, ephemeral: true });
            }
            const embed = sapphireEmbed('✅ Member Whitelisted', `**${user.tag}** is now exempt from moderation.`);
            const buttons = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`whitelist_view_${guild.id}`)
                  .setLabel('View Whitelist')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('📋'),
                new ButtonBuilder()
                  .setCustomId(`whitelist_remove_member_${user.id}`)
                  .setLabel('Remove Member')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('❌')
              );
            await interaction.reply({ embeds: [embed], components: [buttons] });
          }
        } else if (subcommand === 'remove') {
          const role = options.getRole('role');
          const user = options.getUser('member');
          
          if (!role && !user) {
            return interaction.reply({ content: '❌ Please provide either a role or member.', ephemeral: true });
          }
          
          if (role) {
            const removed = removeWhitelistRole(guild.id, role.id);
            if (!removed) {
              return interaction.reply({ content: `❌ ${role.name} is not whitelisted.`, ephemeral: true });
            }
            const embed = sapphireEmbed('✅ Role Removed', `**${role.name}** is no longer whitelisted.`);
            await interaction.reply({ embeds: [embed] });
          } else if (user) {
            const removed = removeWhitelistMember(guild.id, user.id);
            if (!removed) {
              return interaction.reply({ content: `❌ ${user.tag} is not whitelisted.`, ephemeral: true });
            }
            const embed = sapphireEmbed('✅ Member Removed', `**${user.tag}** is no longer whitelisted.`);
            await interaction.reply({ embeds: [embed] });
          }
        } else if (subcommand === 'list') {
          const whitelistRoles = getWhitelistRoles(guild.id);
          const whitelistMembers = getWhitelistMembers(guild.id);
          
          let rolesList = '';
          let membersList = '';
          
          if (whitelistRoles.length === 0) {
            rolesList = 'No whitelisted roles.';
          } else {
            rolesList = whitelistRoles.map(id => `<@&${id}>`).join('\n');
          }
          
          if (whitelistMembers.length === 0) {
            membersList = 'No whitelisted members.';
          } else {
            membersList = whitelistMembers.map(id => `<@${id}>`).join('\n');
          }
          
          const embed = sapphireEmbed('📋 Whitelist', '');
          embed.addFields(
            { name: '👥 Roles', value: rolesList, inline: false },
            { name: '👤 Members', value: membersList, inline: false }
          );
          await interaction.reply({ embeds: [embed] });
        }
        break;
      }

      case 'setup-language-guardian': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
        }
        const strikeLimit = options.getInteger('strike_limit') || DEFAULT_STRIKE_LIMIT;
        const timeoutMinutes = options.getInteger('timeout_minutes') || Math.floor(DEFAULT_TIMEOUT_SECONDS / 60);
        
        setLanguageGuardianConfig(guild.id, {
          strikeLimit,
          timeoutSeconds: timeoutMinutes * 60
        });
        
        const embed = sapphireEmbed('🛡️ Language Guardian Configured', `✅ Settings updated.\n**Strike limit:** ${strikeLimit} strikes\n**Timeout duration:** ${timeoutMinutes} minutes`);
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`lguardian_status_${guild.id}`)
              .setLabel('View Settings')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚙️'),
            new ButtonBuilder()
              .setCustomId(`lguardian_disable_${guild.id}`)
              .setLabel('Disable')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }

      case 'case': {
        const caseId = options.getInteger('case_id');
        const caseData = getCase(guild.id, caseId);
        
        if (!caseData) {
          return interaction.reply({ content: `❌ Case #${caseId} not found.`, ephemeral: true });
        }

        const user = await client.users.fetch(caseData.user_id);
        const moderator = await client.users.fetch(caseData.moderator_id);
        const actionEmoji = { 'kick': '👢', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅', 'delete': '🗑️' }[caseData.action] || '⚙️';
        
        const embed = sapphireEmbed(`${actionEmoji} Case #${caseId}`, 
          `**Action:** ${caseData.action.toUpperCase()}\n**User:** ${user.tag}\n**Moderator:** ${moderator.tag}\n**Reason:** ${caseData.reason}\n${caseData.duration ? `**Duration:** ${caseData.duration} minutes\n` : ''}**Status:** ${caseData.status}\n**Date:** <t:${Math.floor(caseData.timestamp / 1000)}>`
        );

        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`close_case_${caseId}`)
              .setLabel('Close')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`edit_case_${caseId}`)
              .setLabel('Edit')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('✏️'),
            new ButtonBuilder()
              .setCustomId(`delete_case_${caseId}`)
              .setLabel('Delete')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️')
          );
        
        await interaction.reply({ embeds: [embed], components: [buttons] });
        break;
      }

      case 'cases': {
        const targetUser = options.getUser('user');
        const userCases = getCases(guild.id, targetUser?.id);

        if (userCases.length === 0) {
          const msg = targetUser ? `${targetUser} has no cases.` : 'No cases found.';
          const embed = sapphireEmbed('📋 Case History', msg);
          return await interaction.reply({ embeds: [embed] });
        }

        const totalPages = Math.ceil(userCases.length / 10);
        let currentPage = 0;

        const buildEmbed = (page) => {
          let caseList = '';
          const startIdx = page * 10;
          const endIdx = startIdx + 10;
          userCases.slice(startIdx, endIdx).forEach(c => {
            const actionEmoji = { 'kick': '👢', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅' }[c.action] || '⚙️';
            caseList += `${actionEmoji} **Case #${c.case_id}** | ${c.action.toUpperCase()} | ${c.reason.substring(0, 40)}\n`;
          });
          const desc = targetUser 
            ? `Cases for ${targetUser}: (Page ${page + 1}/${totalPages})\n\n${caseList}` 
            : `Latest cases: (Page ${page + 1}/${totalPages})\n\n${caseList}`;
          return sapphireEmbed('📋 Case History', desc);
        };

        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`cases_prev_${targetUser?.id || 'all'}`)
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId(`cases_next_${targetUser?.id || 'all'}`)
              .setLabel('Next')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('➡️')
              .setDisabled(currentPage >= totalPages - 1)
          );

        await interaction.reply({ embeds: [buildEmbed(currentPage)], components: [buttons] });
        break;
      }

      default:
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    }
  } catch (error) {
    console.error('Error in command:', error);
    try {
      await interaction.reply({ content: '❌ An error occurred while executing the command.', ephemeral: true });
    } catch (e) {}
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const guild = client.guilds.cache.get(interaction.guildId);
  if (!guild) return;

  try {
    const customId = interaction.customId;

    if (customId.startsWith('close_case_')) {
      const caseId = parseInt(customId.split('_')[2]);
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: '❌ You need moderation permissions.', ephemeral: true });
      }
      updateCaseStatus(guild.id, caseId, 'closed');
      await interaction.reply({ content: `✅ Case #${caseId} has been closed.`, ephemeral: true });
    }

    else if (customId.startsWith('delete_case_')) {
      const caseId = parseInt(customId.split('_')[2]);
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
      }
      deleteCase(guild.id, caseId);
      await interaction.reply({ content: `🗑️ Case #${caseId} has been deleted.`, ephemeral: true });
    }

    else if (customId.startsWith('edit_case_')) {
      const caseId = parseInt(customId.split('_')[2]);
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: '❌ You need moderation permissions.', ephemeral: true });
      }

      const caseData = getCase(guild.id, caseId);
      if (!caseData) {
        return interaction.reply({ content: `❌ Case #${caseId} not found.`, ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`edit_modal_${caseId}`)
        .setTitle(`Edit Case #${caseId}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('action_input')
            .setLabel('Action (kick/ban/mute/warn/unmute/unban)')
            .setValue(caseData.action)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel('Reason')
            .setValue(caseData.reason)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('duration_input')
            .setLabel('Duration (minutes, leave blank if N/A)')
            .setValue(caseData.duration ? caseData.duration.toString() : '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('status_input')
            .setLabel('Status (active/closed/resolved)')
            .setValue(caseData.status)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    else if (customId.startsWith('cases_prev_') || customId.startsWith('cases_next_')) {
      const userId = customId.split('_')[2];
      const targetUser = userId === 'all' ? null : userId;
      const userCases = getCases(guild.id, targetUser);

      if (userCases.length === 0) {
        return interaction.reply({ content: '❌ No cases found.', ephemeral: true });
      }

      const totalPages = Math.ceil(userCases.length / 10);
      let currentPage = 0;

      const msg = await interaction.channel.messages.fetch(interaction.message.id);
      const embed = msg.embeds[0];
      const pageMatch = embed.description?.match(/Page (\d+)\/(\d+)/);
      if (pageMatch) currentPage = parseInt(pageMatch[1]) - 1;

      if (customId.startsWith('cases_next_')) currentPage++;
      else currentPage--;

      currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

      const buildEmbed = (page) => {
        let caseList = '';
        const startIdx = page * 10;
        const endIdx = startIdx + 10;
        userCases.slice(startIdx, endIdx).forEach(c => {
          const actionEmoji = { 'kick': '👢', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅' }[c.action] || '⚙️';
          caseList += `${actionEmoji} **Case #${c.case_id}** | ${c.action.toUpperCase()} | ${c.reason.substring(0, 40)}\n`;
        });
        const title = targetUser ? `Cases for <@${targetUser}>: (Page ${page + 1}/${totalPages})` : `Latest cases: (Page ${page + 1}/${totalPages})`;
        return sapphireEmbed('📋 Case History', `${title}\n\n${caseList}`);
      };

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`cases_prev_${userId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId(`cases_next_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
            .setDisabled(currentPage >= totalPages - 1)
        );

      await interaction.update({ embeds: [buildEmbed(currentPage)], components: [buttons] });
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    try {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    } catch (e) {}
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;

  const guild = client.guilds.cache.get(interaction.guildId);
  if (!guild) return;

  try {
    if (interaction.customId.startsWith('edit_modal_')) {
      const caseId = parseInt(interaction.customId.split('_')[2]);
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: '❌ You need moderation permissions.', ephemeral: true });
      }

      const action = interaction.fields.getTextInputValue('action_input')?.toLowerCase();
      const reason = interaction.fields.getTextInputValue('reason_input');
      const durationStr = interaction.fields.getTextInputValue('duration_input');
      const status = interaction.fields.getTextInputValue('status_input')?.toLowerCase();

      const validActions = ['kick', 'ban', 'mute', 'warn', 'unmute', 'unban'];
      if (!validActions.includes(action)) {
        return interaction.reply({ content: '❌ Invalid action. Must be: kick, ban, mute, warn, unmute, unban', ephemeral: true });
      }

      const validStatuses = ['active', 'closed', 'resolved'];
      if (!validStatuses.includes(status)) {
        return interaction.reply({ content: '❌ Invalid status. Must be: active, closed, resolved', ephemeral: true });
      }

      const updates = { action, reason, status };
      if (durationStr) {
        const duration = parseInt(durationStr);
        if (isNaN(duration) || duration < 1) {
          return interaction.reply({ content: '❌ Duration must be a positive number.', ephemeral: true });
        }
        updates.duration = duration;
      }

      updateCase(guild.id, caseId, updates);
      await interaction.reply({ content: `✅ Case #${caseId} has been updated.`, ephemeral: true });
    }
  } catch (error) {
    console.error('Modal interaction error:', error);
    try {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    } catch (e) {}
  }
});

// Auto-Role on Member Join
client.on('guildMemberAdd', async member => {
  try {
    const autoRoleId = getAutoRole(member.guild.id);
    if (autoRoleId) {
      const role = member.guild.roles.cache.get(autoRoleId);
      if (role && member.manageable) {
        await member.roles.add(role);
        console.log(`✅ Auto-assigned ${role.name} to ${member.user.tag}`);
      }
    }
  } catch (error) {
    console.error('Error assigning auto-role:', error);
  }
});

// Handle Info Command Buttons
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  try {
    const customId = interaction.customId;
    
    // User Info Buttons
    if (customId.startsWith('userinfo_warns_')) {
      const userId = customId.replace('userinfo_warns_', '');
      const warnings = getWarnings(interaction.guild.id, userId);
      const user = await client.users.fetch(userId);
      
      let list = '';
      if (warnings.length === 0) {
        list = 'No warnings.';
      } else {
        warnings.forEach((w, idx) => {
          list += `${idx + 1}. **${w.reason}** <t:${Math.floor(w.timestamp / 1000)}:R>\n`;
        });
      }
      
      const embed = sapphireEmbed(`⚠️ ${user.tag}'s Warnings`, list);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (customId.startsWith('userinfo_cases_')) {
      const userId = customId.replace('userinfo_cases_', '');
      const cases = getCases(interaction.guild.id, userId);
      const user = await client.users.fetch(userId);
      
      let list = '';
      if (cases.length === 0) {
        list = 'No cases.';
      } else {
        cases.slice(0, 10).forEach((c) => {
          const emoji = { 'kick': '👢', 'ban': '🔨', 'mute': '🔇', 'warn': '⚠️', 'unmute': '🔊', 'unban': '✅' }[c.action] || '⚙️';
          list += `${emoji} Case #${c.case_id}: **${c.action.toUpperCase()}** - ${c.reason}\n`;
        });
        if (cases.length > 10) list += `\n... and ${cases.length - 10} more cases`;
      }
      
      const embed = sapphireEmbed(`📋 ${user.tag}'s Cases`, list);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Config Buttons - Anti-Spam
    if (customId.startsWith('antispam_status_')) {
      const guildId = customId.replace('antispam_status_', '');
      const config = getAntiSpamConfig(guildId);
      const settings = config ? `**Max messages:** ${config.max_messages}\n**Time window:** ${config.time_window}s\n**Mute duration:** ${Math.floor(config.mute_duration / 60)} minutes\n**Status:** ${config.enabled ? '✅ Enabled' : '❌ Disabled'}` : 'Not configured yet.';
      const embed = sapphireEmbed('⚙️ Anti-Spam Settings', settings);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (customId.startsWith('antispam_disable_')) {
      const guildId = customId.replace('antispam_disable_', '');
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
      }
      disableAntiSpam(guildId);
      const embed = sapphireEmbed('✅ Anti-Spam Disabled', 'Anti-spam protection has been disabled.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Config Buttons - Language Guardian
    if (customId.startsWith('lguardian_status_')) {
      const guildId = customId.replace('lguardian_status_', '');
      const config = getLanguageGuardianConfig(guildId);
      const settings = `**Strike limit:** ${config.strikeLimit}\n**Timeout duration:** ${Math.floor(config.timeoutSeconds / 60)} minutes\n**Status:** ✅ Configured`;
      const embed = sapphireEmbed('⚙️ Language Guardian Settings', settings);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (customId.startsWith('lguardian_disable_')) {
      const guildId = customId.replace('lguardian_disable_', '');
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
      }
      disableLGBL(guildId);
      const embed = sapphireEmbed('✅ Language Guardian Disabled', 'Language Guardian has been disabled.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Config Buttons - Auto-Role
    if (customId.startsWith('autorole_status_')) {
      const guildId = customId.replace('autorole_status_', '');
      const roleId = getAutoRole(guildId);
      const role = interaction.guild.roles.cache.get(roleId);
      const settings = role ? `**Role:** ${role.name}\n**Status:** ✅ Active` : 'No auto-role configured.';
      const embed = sapphireEmbed('👥 Auto-Role Setting', settings);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (customId.startsWith('autorole_remove_')) {
      const guildId = customId.replace('autorole_remove_', '');
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
      }
      removeAutoRole(guildId);
      const embed = sapphireEmbed('✅ Auto-Role Removed', 'Auto-role assignment has been disabled.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Whitelist Buttons
    if (customId.startsWith('whitelist_view_')) {
      const guildId = customId.replace('whitelist_view_', '');
      const whitelistRoles = getWhitelistRoles(guildId);
      const whitelistMembers = getWhitelistMembers(guildId);
      
      let rolesList = whitelistRoles.length === 0 ? 'No roles' : whitelistRoles.map(id => `<@&${id}>`).join(', ');
      let membersList = whitelistMembers.length === 0 ? 'No members' : whitelistMembers.map(id => `<@${id}>`).join(', ');
      
      const embed = sapphireEmbed('📋 Current Whitelist', `**Roles:** ${rolesList}\n**Members:** ${membersList}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (customId.startsWith('whitelist_remove_role_')) {
      const roleId = customId.replace('whitelist_remove_role_', '');
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
      }
      removeWhitelistRole(interaction.guild.id, roleId);
      const embed = sapphireEmbed('✅ Role Removed', 'Role has been removed from whitelist.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (customId.startsWith('whitelist_remove_member_')) {
      const userId = customId.replace('whitelist_remove_member_', '');
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ You need administrator permissions.', ephemeral: true });
      }
      removeWhitelistMember(interaction.guild.id, userId);
      const embed = sapphireEmbed('✅ Member Removed', 'Member has been removed from whitelist.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Config Toggle Buttons
    if (customId.startsWith('config_toggle_')) {
      if (!isUserAboveBot(interaction.member, interaction.guild)) {
        return interaction.reply({ content: '❌ Only users with roles above the bot can change this.', ephemeral: true });
      }
      
      const config = getWhitelistBypassConfig(interaction.guild.id);
      let system = '';
      
      if (customId.includes('anti_spam')) {
        system = 'anti_spam';
        config.bypass_anti_spam = config.bypass_anti_spam ? 0 : 1;
      } else if (customId.includes('_lg_')) {
        system = 'language_guardian';
        config.bypass_language_guardian = config.bypass_language_guardian ? 0 : 1;
      } else if (customId.includes('anti_nuke')) {
        system = 'anti_nuke';
        config.bypass_anti_nuke = config.bypass_anti_nuke ? 0 : 1;
      } else if (customId.includes('anti_raid')) {
        system = 'anti_raid';
        config.bypass_anti_raid = config.bypass_anti_raid ? 0 : 1;
      }
      
      setWhitelistBypassConfig(interaction.guild.id, {
        bypassAntiSpam: config.bypass_anti_spam,
        bypassLanguageGuardian: config.bypass_language_guardian,
        bypassAntiNuke: config.bypass_anti_nuke,
        bypassAntiRaid: config.bypass_anti_raid
      });
      
      const systemName = system.replace('_', ' ').toUpperCase();
      const newState = config[`bypass_${system}`] ? '✅ BYPASS' : '❌ NO BYPASS';
      const embed = sapphireEmbed(`✅ ${systemName} Updated`, `Whitelist bypass for ${systemName}: **${newState}**`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error('Button interaction error:', error);
  }
});

// Handle Select Menus (Server Report)
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  
  try {
    const customId = interaction.customId;
    
    if (customId.startsWith('report_select_')) {
      const selected = interaction.values;
      if (!global.reportSelected) global.reportSelected = {};
      const cacheId = customId.split('_').pop();
      if (!global.reportSelected[cacheId]) global.reportSelected[cacheId] = [];
      global.reportSelected[cacheId] = global.reportSelected[cacheId].concat(selected);
      
      await interaction.reply({ content: `✅ Selected ${selected.length} event(s) for undo.`, ephemeral: true });
    }
  } catch (error) {
    console.error('Select menu error:', error);
  }
});

// Handle Report Undo Button
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  try {
    if (interaction.customId.startsWith('report_undo_')) {
      const cacheId = interaction.customId.replace('report_undo_', '');
      const selected = global.reportSelected?.[cacheId] || [];
      const categories = global.reportCache?.[cacheId];
      
      if (!categories || selected.length === 0) {
        return interaction.reply({ content: '❌ No events selected or cache expired.', ephemeral: true });
      }
      
      let undone = 0;
      const results = [];
      
      // Process undo for each selected event
      for (const val of selected) {
        const [catNum, idx] = val.split('_');
        const event = categories[catNum]?.events[parseInt(idx)];
        if (event) {
          try {
            if (catNum === '1') {
              // Channel undo
              const channel = interaction.guild.channels.cache.get(event.id);
              if (channel) {
                await channel.delete('Undo from server report');
                results.push(`✅ Deleted channel: ${event.details}`);
                undone++;
              }
            } else if (catNum === '2') {
              // Role undo
              const role = interaction.guild.roles.cache.get(event.id);
              if (role) {
                await role.delete('Undo from server report');
                results.push(`✅ Deleted role: ${event.details}`);
                undone++;
              }
            }
          } catch (e) {
            results.push(`⚠️ Could not undo: ${event.details}`);
          }
        }
      }
      
      const embed = sapphireEmbed('⏮️ Undo Report', 
        `**Events Undone:** ${undone}/${selected.length}\n\n${results.join('\n').substring(0, 2000)}`
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      
      // Cleanup
      delete global.reportCache[cacheId];
      delete global.reportSelected[cacheId];
    }
  } catch (error) {
    console.error('Report undo error:', error);
  }
});

// Error handlers to prevent bot crashes
client.on('error', error => {
  console.error('❌ Discord Client Error:', error);
  // Auto-reconnect on error
  if (!client.isReady()) {
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect...');
      client.login(TOKEN).catch(e => console.error('Reconnect failed:', e));
    }, 5000);
  }
});

client.on('disconnect', () => {
  console.warn('⚠️ Bot disconnected from Discord');
  setTimeout(() => {
    if (!client.isReady()) {
      console.log('🔄 Attempting to reconnect...');
      client.login(TOKEN).catch(e => console.error('Reconnect failed:', e));
    }
  }, 5000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Keep the process running instead of crashing
  console.log('🔄 Bot continuing despite error...');
});

client.login(TOKEN);
