require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
require('./server');
const { addWarning, getWarnings, removeWarning, setLogChannel, setLgLogChannel, enableAutomod, disableAutomod, enableLGBL, disableLGBL, setCustomPrefix, getCustomPrefix, getPrefixCooldown, addBlacklistWord, removeBlacklistWord, getBlacklistWords, addLgblWord, removeLgblWord, getLgblWords, getAntiNukeConfig, setAntiNukeConfig, getAntiRaidConfig, setAntiRaidConfig, createCase, getCase, getCases, updateCaseStatus, updateCase, deleteCase, enableAntiSpam, disableAntiSpam, getAntiSpamConfig, setAntiSpamConfig, trackSpamMessage, getRecentMessages, cleanupSpamTracking, setAutoRole, removeAutoRole, getAutoRole, setLanguageGuardianConfig, getLanguageGuardianConfig, addWhitelistRole, removeWhitelistRole, getWhitelistRoles, addWhitelistMember, removeWhitelistMember, getWhitelistMembers, isUserWhitelisted, setWhitelistBypassConfig, getWhitelistBypassConfig, addAuditLog, getAuditLogsByTimeRange, suspendUser, unsuspendUser, getSuspendedUsers, isUserSuspended, getGuildConfig, setAFK, removeAFK, getAFKUser, getAllAFKUsers } = require('./src/database');
const { logModeration, logLanguageGuardian } = require('./src/utils/logger');
const { checkMessage } = require('./src/services/automod');
const { matchesBlacklist, safeTranslate, addStrike, resetStrikesFor, getStrikes, addWord, removeWord, getWords, sendModLog } = require('./src/services/language-guardian');
const { addLgblWord, removeLgblWord, getLgblWords } = require('./src/database');

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

// Get highest role position
const getHighestRolePosition = (member) => {
  return member.roles.highest.position;
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

// Helper function for Sapphire embeds (used everywhere)
const sapphireEmbed = (title, desc, color = SAPPHIRE_COLOR, fields = []) => {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || '⠀')  // Use zero-width space if empty
    .setColor(color)
    .setTimestamp();
  if (fields.length > 0) embed.addFields(fields);
  return embed;
};

// Convert time to milliseconds
const convertTimeToMs = (amount, unit) => {
  const times = {
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
    'w': 7 * 24 * 60 * 60 * 1000,
    'y': 365 * 24 * 60 * 60 * 1000
  };
  return amount * (times[unit.toLowerCase()] || times['m']);
};

// Format milliseconds to readable time
const formatTime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  
  if (weeks > 0) return `${weeks}w ${days % 7}d`;
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

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
        description: 'Duration number (e.g., 5)',
        type: 4,
        required: true
      },
      {
        name: 'unit',
        description: 'Time unit',
        type: 3,
        required: true,
        choices: [
          { name: 'Minutes (m)', value: 'm' },
          { name: 'Hours (h)', value: 'h' },
          { name: 'Days (d)', value: 'd' },
          { name: 'Weeks (w)', value: 'w' },
          { name: 'Years (y)', value: 'y' }
        ]
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
    name: 'help-command',
    description: 'Get detailed help about a specific command',
    options: [
      {
        name: 'command',
        description: 'The command to get help with',
        type: 3,
        required: true,
        choices: [
          { name: 'kick', value: 'kick' },
          { name: 'ban', value: 'ban' },
          { name: 'mute', value: 'mute' },
          { name: 'warn', value: 'warn' },
          { name: 'suspend', value: 'suspend' },
          { name: 'add-role', value: 'add-role' },
          { name: 'purge', value: 'purge' },
          { name: 'setup-language-guardian', value: 'setup-language-guardian' },
          { name: 'server-config', value: 'server-config' },
          { name: 'server-report', value: 'server-report' }
        ]
      }
    ]
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
    name: 'set-lg-channel',
    description: 'Set log channel for Language Guardian actions (translations & strikes)',
    options: [
      {
        name: 'channel',
        description: 'The channel to log LG actions',
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
    name: 'prune',
    description: 'Remove inactive members from the server',
    options: [
      {
        name: 'days',
        description: 'Remove members inactive for X days (default 30)',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 365
      }
    ]
  },
  {
    name: 'afk',
    description: 'Set yourself as AFK with a reason',
    options: [
      {
        name: 'reason',
        description: 'Why are you AFK?',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'afk-list',
    description: 'View all AFK members'
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
      },
      {
        name: 'action',
        description: 'Action to take on strike limit: mute, kick, ban, or suspend',
        type: 3,
        required: false,
        choices: [
          { name: 'Mute', value: 'mute' },
          { name: 'Kick', value: 'kick' },
          { name: 'Ban', value: 'ban' },
          { name: 'Suspend', value: 'suspend' }
        ]
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
    description: 'Suspend a user (removes all roles)',
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
    description: 'Restore a suspended user',
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
  
  // Set bot activity/status
  client.user.setActivity('Daddy USSR - Moderation Bot\nFull server protection & management\ncreator -@k4giroi\nFor suggestions & issues DM support creator -@kur4yamii', { type: 'WATCHING' });
  
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

    // Bot mention handler - reply once if bot is directly mentioned
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

    // Remove AFK if user sends a message (send normal chat message and fix nick)
    if (getAFKUser(message.guild.id, message.author.id)) {
      removeAFK(message.guild.id, message.author.id);
      message.channel.send(`👋 ${message.author} is back from AFK!`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000)).catch(()=>{});
      const member = message.member;
      if (member && member.manageable) {
        try {
          const currentNick = member.nickname;
          if (currentNick && currentNick.startsWith('[AFK] ')) {
            const cleanNick = currentNick.replace(/^\[AFK\] /, '');
            await member.setNickname(cleanNick);
          }
        } catch (e) {}
      }
    }

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
            // Get LGBL words from DATABASE (per guild) - Language Guardian list
            const blacklistWords = getLgblWords(message.guild.id);
            
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
                const strikeResult = addStrike(message.guild.id, message.author.id, lgConfig.strikeLimit, lgConfig.action || 'mute');

                message.channel.send(`❌ ${message.author}, that word is not allowed. (Strike ${strikeResult.strikeCount}/${lgConfig.strikeLimit})`)
                  .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
                
                // Log to Language Guardian channel
                await logLanguageGuardian(message.guild, {
                  user: message.author,
                  action: 'warning',
                  reason: `Banned word detected: ${foundBadWord}`,
                  translation: translated
                });

                if (strikeResult.hitLimit) {
                  if (member && member.moderatable) {
                    const action = strikeResult.action || 'mute';
                    try {
                      if (action === 'mute') {
                        await member.timeout(lgConfig.timeoutSeconds * 1000, "Blacklist strikes exceeded");
                      } else if (action === 'kick') {
                        await member.kick("Blacklist strikes exceeded");
                      } else if (action === 'ban') {
                        await message.guild.members.ban(message.author.id, { reason: "Blacklist strikes exceeded" });
                      } else if (action === 'suspend') {
                        const suspendRole = message.guild.roles.cache.find(r => r.name === '⛔ Suspended') || await message.guild.roles.create({ name: '⛔ Suspended', color: '#FF0000' });
                        const previousRoles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
                        await member.roles.set([suspendRole.id]);
                        suspendUser(message.guild.id, message.author.id, suspendRole.id, previousRoles, `Language Guardian - Strikes exceeded`);
                      }
                      resetStrikesFor(message.guild.id, message.author.id);
                      
                      // Log action to Language Guardian channel
                      await logLanguageGuardian(message.guild, {
                        user: message.author,
                        action: action,
                        reason: `Hit ${lgConfig.strikeLimit} strikes on Language Guardian`,
                        translation: translated
                      });
                    } catch (e) {
                      console.error('Error applying LG action:', e);
                    }
                  }
                }
                return; // Skip automod check - LG already handled this
              }
            }
          }
        }
      } catch (e) {
        console.error('Language Guardian error:', e);
      }
      
      // Automod check (only runs if LG didn't already handle it)
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
        'enable-language-guardian', 'disable-language-guardian', 'suspend', 'unsuspend', 'suspended-list', 'nick', 'lgbl', 'afk', 'afk-list'
      ];
      if (knownCommands.includes(multiWordCmd)) {
        cmd = multiWordCmd;
        args.shift(); // Remove the second word from args
      }
    }
    
    // Full list of valid commands (for better error checking)
    const validPrefixCommands = [
      'kick', 'ban', 'mute', 'unmute', 'unban', 'warn', 'unwarn', 'add-role', 'remove-role', 'purge', 'say', 'blacklist', 'purgebad',
      'change-role-name', 'lock', 'unlock', 'set-prefix', 'set-channel', 'enable-automod', 'disable-automod', 
      'enable-language-guardian', 'disable-language-guardian', 'suspend', 'unsuspend', 'suspended-list', 'nick', 'lgbl', 'help', 'afk', 'afk-list'
    ];
    
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
        
        const durationStr = args[0];
        if (!durationStr) return message.reply('❌ Usage: `=mute @user 5h reason` (m/h/d/w/y)');
        
        const match = durationStr.match(/^(\d+)([mhdwy])$/i);
        if (!match) return message.reply('❌ Invalid format. Use: `=mute @user 5h reason` (m/h/d/w/y)');
        
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const ms = convertTimeToMs(amount, unit);
        
        if (ms > 40320 * 60 * 1000) return message.reply('❌ Duration cannot exceed 40320 minutes (28 days).');
        
        try {
          const reason = args.slice(1).join(' ') || 'No reason provided';
          const targetMember = await message.guild.members.fetch(user.id);
          await targetMember.timeout(ms, reason);
          const durationFormatted = formatTime(ms);
          addWarning(message.guild.id, user.id, message.author.id, `Muted (${durationFormatted}): ${reason}`);
          message.reply(`✅ Muted ${user.tag} for ${durationFormatted} - ${reason}`);
        } catch (error) {
          console.error('Prefix mute error:', error);
          message.reply('❌ Could not mute this user. Make sure bot has permission.');
        }
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
            return message.reply(`✅ Added \`${word}\` to Automod Blacklist Library for this server.`);
          } else {
            return message.reply(`❌ \`${word}\` is already in the Blacklist Library.`);
          }
        }

        if (action === "remove") {
          if (!word) return message.reply("❌ Please provide a word to remove.");
          if (removeBlacklistWord(message.guild.id, word)) {
            return message.reply(`✅ Removed \`${word}\` from Automod Blacklist Library for this server.`);
          } else {
            return message.reply(`❌ \`${word}\` is not in the Blacklist Library.`);
          }
        }

        if (action === "list") {
          const words = getBlacklistWords(message.guild.id);
          if (words.length === 0) {
            return message.reply("📚 **Automod Blacklist Library:** No words added yet.");
          }
          const wordList = words.slice(0, 50).join(", ") + (words.length > 50 ? `\n\n...and ${words.length - 50} more words` : "");
          return message.reply(`📚 **Automod Blacklist Library (${words.length} words):**\n${wordList}`);
        }

        return message.reply("Usage: `!blacklist <add/remove/list> [word]`");
      }

      case 'lgbl': {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions.");
        }

        const action = args.shift()?.toLowerCase();
        const word = args.join(" ").toLowerCase();

        if (action === "add") {
          if (!word) return message.reply("❌ Please provide a word to add.");
          if (addLgblWord(message.guild.id, word)) {
            return message.reply(`✅ Added \`${word}\` to Language Guardian Blacklist Library.`);
          } else {
            return message.reply(`❌ \`${word}\` is already in LGBL.`);
          }
        }

        if (action === "remove") {
          if (!word) return message.reply("❌ Please provide a word to remove.");
          if (removeLgblWord(message.guild.id, word)) {
            return message.reply(`✅ Removed \`${word}\` from Language Guardian Blacklist Library.`);
          } else {
            return message.reply(`❌ \`${word}\` is not in LGBL.`);
          }
        }

        if (action === "list") {
          const words = getLgblWords(message.guild.id);
          if (words.length === 0) {
            return message.reply("📚 **Language Guardian Blacklist Library:** No words added yet.");
          }
          const wordList = words.slice(0, 50).join(", ") + (words.length > 50 ? `\n\n...and ${words.length - 50} more words` : "");
          return message.reply(`📚 **LGBL (${words.length} words):**\n${wordList}`);
        }

        return message.reply("Usage: `!lgbl <add/remove/list> [word]`");
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

      case 'afk': {
        const reason = args.join(' ') || 'AFK';
        setAFK(message.guild.id, message.author.id, reason);
        const targetMember = message.member;
        if (targetMember && targetMember.manageable) {
          try {
            const currentNick = targetMember.nickname || targetMember.user.username;
            const cleanNick = currentNick.replace(/^\[AFK\] /, '');
            const newNick = `[AFK] ${cleanNick}`.substring(0, 32);
            await targetMember.setNickname(newNick);
          } catch (e) {}
        }
        message.reply(`😴 **AFK Set** - You are now marked as AFK.\n📝 **Reason:** ${reason}\n💡 **Tip:** You'll be automatically removed from AFK when you send a message or join voice.`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000)).catch(()=>{});
        break;
      }

      case 'afk-list': {
        const afkUsers = getAllAFKUsers(message.guild.id);
        if (afkUsers.length === 0) {
          return message.reply('✅ No one is AFK right now!');
        }
        let list = '';
        for (const afkUser of afkUsers.slice(0, 20)) {
          const user = await client.users.fetch(afkUser.user_id).catch(() => null);
          list += `👤 **${user ? user.tag : afkUser.user_id}** - ${afkUser.reason} (<t:${Math.floor(afkUser.afk_timestamp / 1000)}:R>)\n`;
        }
        message.reply(`😴 **AFK Members** (${afkUsers.length})\n\n${list}`);
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
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to suspend.');
        const reason = args.join(' ') || 'No reason provided';
        const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) return message.reply('❌ User not found.');
        
        // Check if target has same highest role as executor - if yes, suspend both
        const executorHighestPos = getHighestRolePosition(message.member);
        const targetHighestPos = getHighestRolePosition(targetMember);
        
        if (executorHighestPos === targetHighestPos) {
          // Setup suspend role
          let suspendRole = message.guild.roles.cache.find(r => r.name === '⛔ Suspended');
          if (!suspendRole) {
            suspendRole = await message.guild.roles.create({
              name: '⛔ Suspended',
              color: '#FF0000',
              reason: 'Suspend role for suspended users'
            }).catch(() => null);
          }
          
          if (suspendRole) {
            // Suspend the executor (person trying to suspend equal rank)
            const executorRoles = message.member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
            suspendUser(message.guild.id, message.author.id, suspendRole.id, executorRoles, 'Abuse Prevention: Tried to suspend equal rank');
            
            for (const role of message.member.roles.cache.values()) {
              if (role.id !== message.guild.id) await message.member.roles.remove(role).catch(() => {});
            }
            await message.member.roles.add(suspendRole).catch(() => {});
            
            // Suspend the target (equal rank person)
            const targetRoles = targetMember.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
            suspendUser(message.guild.id, user.id, suspendRole.id, targetRoles, 'Abuse Prevention: Was targeted for suspension by equal rank');
            
            for (const role of targetMember.roles.cache.values()) {
              if (role.id !== message.guild.id) await targetMember.roles.remove(role).catch(() => {});
            }
            await targetMember.roles.add(suspendRole).catch(() => {});
          }
          
          return message.reply(`🛡️ **ANTI-NUKE DEFENSE ACTIVATED!**\n\n❌ Equal rank suspension detected - Potential admin nuke attempt!\n\n**SECURITY ACTION:** Both you and ${user.tag} have been suspended immediately.\n\n🚫 *Only admins with higher authority can suspend lower ranks. Attempting to suspend equals = nuke attempt.*`);
        }
        
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
        
        // Deny suspended role from all other channels (except suspended channel)
        try {
          for (const channel of message.guild.channels.cache.values()) {
            if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
              if (channel.id !== suspendChannel?.id) {
                await channel.permissionOverwrites.create(suspendRole, { ViewChannel: false }).catch(() => {});
              }
            }
          }
        } catch (err) {
          console.error('Error setting channel permissions:', err);
        }
        
        const previousRoles = targetMember.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
        suspendUser(message.guild.id, user.id, suspendRole.id, previousRoles, reason);
        for (const role of targetMember.roles.cache.values()) {
          if (role.id !== message.guild.id) await targetMember.roles.remove(role).catch(() => {});
        }
        await targetMember.roles.add(suspendRole).catch(() => {});
        
        const logChannelId = getGuildConfig(message.guild.id)?.log_channel_id;
        if (logChannelId) {
          const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const notifyEmbed = sapphireEmbed('⛔ User Suspended Notice', `${targetMember} has been suspended.\n**Reason:** ${reason}`);
            logChannel.send({ embeds: [notifyEmbed] }).catch(() => {});
          }
        }
        
        message.reply(`✅ ${user.tag} suspended. Reason: ${reason}`);
        break;
      }
      
      case 'unsuspend': {
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to unsuspend.');
        if (!isUserSuspended(message.guild.id, user.id)) return message.reply('❌ This user is not suspended.');
        const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) return message.reply('❌ User not found.');
        
        const previousRoles = unsuspendUser(message.guild.id, user.id);
        
        try {
          // Remove ALL roles first (except @everyone)
          for (const role of targetMember.roles.cache.values()) {
            if (role.id !== message.guild.id) {
              await targetMember.roles.remove(role, 'User unsuspended').catch(() => {});
            }
          }
          
          // Now add back the previous roles
          for (const roleId of previousRoles) {
            const role = message.guild.roles.cache.get(roleId);
            if (role) {
              await targetMember.roles.add(role, 'User unsuspended').catch(() => {});
            }
          }
        } catch (err) {
          console.error('Error unsuspending user:', err);
        }
        
        const logChannelId = getGuildConfig(message.guild.id)?.log_channel_id;
        if (logChannelId) {
          const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const notifyEmbed = sapphireEmbed('✅ User Unsuspended', `${targetMember} has been unsuspended.`);
            logChannel.send({ embeds: [notifyEmbed] }).catch(() => {});
          }
        }
        
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
        // Check if the command is valid but not in switch (shouldn't happen)
        if (validPrefixCommands.includes(cmd)) {
          return message.reply(`❌ Command \`${cmd}\` encountered an error. Please try again or use \`${customPrefix}help\`.`);
        }
        
        // Suggest correct command
        const suggestions = validPrefixCommands.filter(c => c.startsWith(cmd.charAt(0))).slice(0, 3);
        
        if (suggestions.length > 0) {
          const suggestionText = suggestions.map(s => `\`${customPrefix}${s}\``).join(', ');
          return message.reply({ content: `❌ Unknown command \`${cmd}\`. Did you mean: ${suggestionText}?` });
        } else {
          return message.reply({ content: `❌ Unknown command \`${cmd}\`. Use \`${customPrefix}help\` for a list of commands.` });
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
        await logModeration(guild, 'kick', {
          user: user,
          moderator: member.user,
          reason: reason
        });
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
        await logModeration(guild, 'ban', {
          user: user,
          moderator: member.user,
          reason: reason
        });
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
        const unit = options.getString('unit') || 'm';
        const reason = options.getString('reason') || 'No reason provided';
        
        const ms = convertTimeToMs(duration, unit);
        if (ms > 40320 * 60 * 1000) return interaction.reply({ content: '❌ Duration cannot exceed 40320 minutes (28 days).', ephemeral: true });
        
        try {
          const targetMember = await guild.members.fetch(user.id);
          await targetMember.timeout(ms, reason);
          const durationStr = formatTime(ms);
          const durationMinutes = Math.floor(ms / 1000 / 60);
          addWarning(guild.id, user.id, member.id, `Muted (${durationStr}): ${reason}`);
          const caseId = createCase(guild.id, user.id, member.id, 'mute', reason, durationMinutes);
          await logModeration(guild, 'mute', {
            user: user,
            moderator: member.user,
            reason: reason,
            duration: durationMinutes
          });
          const embed = sapphireEmbed('🔇 Member Muted', `${user} has been muted for **${durationStr}**.\n**Reason:** ${reason}\n**Case #${caseId}**`);
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          console.error('Mute error:', error);
          if (error.code === 50013) {
            return interaction.reply({ content: '❌ Bot is missing permissions. Make sure the bot has "Moderate Members" permission.', ephemeral: true });
          }
          return interaction.reply({ content: '❌ Could not mute this user.', ephemeral: true });
        }
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
        await logModeration(guild, 'warn', {
          user: user,
          moderator: member.user,
          reason: reason
        });
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
          await logModeration(guild, 'unwarn', {
            user: user,
            moderator: member.user,
            reason: `Warning #${warningNum + 1} removed`
          });
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
        await logModeration(guild, 'unban', {
          userId: userId,
          moderator: member.user,
          reason: reason
        });
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
        await logModeration(guild, 'unmute', {
          user: user,
          moderator: member.user,
          reason: reason
        });
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
          const timeLeftMs = m.communicationDisabledUntilTimestamp - Date.now();
          const timeLeft = formatTime(timeLeftMs);
          statusText += `${m.user.tag} - **${timeLeft}** left\n`;
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

      case 'set-lg-channel': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        const channel = options.getChannel('channel');
        setLgLogChannel(guild.id, channel.id);
        const embed = sapphireEmbed('✅ Language Guardian Log Channel Set', `LG actions and translations will now be sent to ${channel}.`);
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
          if (addLgblWord(guild.id, word)) {
            const embed = sapphireEmbed('✅ Added to LGBL', `**${word}** has been added to the Language Guardian Blacklist Library.\n\n*This word will be detected in any language!*`);
            await interaction.reply({ embeds: [embed] });
          } else {
            await interaction.reply({ content: '❌ Word already in LGBL.', ephemeral: true });
          }
        } 
        else if (subcommand === 'remove') {
          const word = options.getString('word');
          if (removeLgblWord(guild.id, word)) {
            const embed = sapphireEmbed('✅ Removed from LGBL', `**${word}** has been removed from the Language Guardian Blacklist Library.`);
            await interaction.reply({ embeds: [embed] });
          } else {
            await interaction.reply({ content: '❌ Word not found in LGBL.', ephemeral: true });
          }
        } 
        else if (subcommand === 'list') {
          const words = getLgblWords(guild.id);
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
        
        const embed = sapphireEmbed('🗑️ Messages Purged', `${amount} messages have been deleted from ${interaction.channel}.`, SAPPHIRE_COLOR, [
          { name: '📊 Amount Deleted', value: `${amount} messages`, inline: true },
          { name: '👤 Moderator', value: interaction.user.tag, inline: true },
          { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
          { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: false }
        ]);
        
        await interaction.reply({ embeds: [embed] });
        
        // Log to mod log channel
        const logChannelId = getGuildConfig(guild.id)?.log_channel_id;
        if (logChannelId) {
          const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const logEmbed = sapphireEmbed('🗑️ Purge Logged', `**Moderator:** ${interaction.user.tag}\n**Channel:** ${interaction.channel}\n**Amount:** ${amount} messages`);
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
        }
        break;
      }
      
      case 'prune': {
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ 
            content: '❌ You need the "Manage Server" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        await interaction.deferReply();
        const days = options.getInteger('days') || 30;
        const pruned = await guild.prune({ days, dry: false });
        
        const embed = sapphireEmbed('🧹 Server Pruned', `Inactive members have been removed from the server.`, SAPPHIRE_COLOR, [
          { name: '👥 Members Removed', value: `${pruned} member${pruned !== 1 ? 's' : ''}`, inline: true },
          { name: '📅 Inactive For', value: `${days} day${days !== 1 ? 's' : ''}`, inline: true },
          { name: '👤 Moderator', value: interaction.user.tag, inline: true },
          { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: false }
        ]);
        
        await interaction.editReply({ embeds: [embed] });
        
        // Log to mod log channel
        const logChannelId = getGuildConfig(guild.id)?.log_channel_id;
        if (logChannelId) {
          const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const logEmbed = sapphireEmbed('🧹 Prune Logged', `**Moderator:** ${interaction.user.tag}\n**Members Removed:** ${pruned}\n**Inactive For:** ${days} days`);
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
        }
        break;
      }

      case 'afk': {
        const reason = options.getString('reason') || 'AFK';
        setAFK(guild.id, interaction.user.id, reason);
        const targetMember = interaction.member;
        if (targetMember && targetMember.manageable) {
          try {
            const currentNick = targetMember.nickname || targetMember.user.username;
            const cleanNick = currentNick.replace(/^\[AFK\] /, '');
            const newNick = `[AFK] ${cleanNick}`.substring(0, 32);
            await targetMember.setNickname(newNick);
          } catch (e) {}
        }
        await interaction.reply(`😴 **AFK Set** - You are now marked as AFK.\n📝 **Reason:** ${reason}\n💡 **Tip:** You'll be automatically removed from AFK when you send a message or join voice.`);
        setTimeout(() => interaction.deleteReply().catch(()=>{}), 5000);
        break;
      }

      case 'afk-list': {
        const afkUsers = getAllAFKUsers(guild.id);
        if (afkUsers.length === 0) {
          return interaction.reply({ content: '✅ No one is AFK right now!', ephemeral: true });
        }
        let list = '';
        for (const afkUser of afkUsers.slice(0, 20)) {
          const user = await client.users.fetch(afkUser.user_id).catch(() => null);
          list += `👤 **${user ? user.tag : afkUser.user_id}** - ${afkUser.reason} (<t:${Math.floor(afkUser.afk_timestamp / 1000)}:R>)\n`;
        }
        await interaction.reply(`😴 **AFK Members** (${afkUsers.length})\n\n${list}`);
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
        const allCmds = ['/kick', '/ban', '/mute', '/warn', '/unwarn', '/unban', '/unmute', '/suspend', '/unsuspend', '/suspended-list', '/add-role', '/remove-role', '/nick', '/change-role-name', '/warns', '/server-timeout-status', '/case', '/cases', '/user-info', '/server-info', '/ban-list', '/set-channel', '/enable-automod', '/disable-automod', '/enable-language-guardian', '/disable-language-guardian', '/setup-language-guardian', '/lgbl add', '/lgbl remove', '/lgbl list', '/purge', '/prune', '/afk', '/afk-list', '/say', '/lock', '/unlock', '/set-prefix', '/help-command', '/setup-anti-nuke', '/setup-anti-raid', '/setup-anti-spam', '/enable-anti-spam', '/disable-anti-spam', '/set-auto-role', '/remove-auto-role', '/server-config', '/server-report', '/whitelist add', '/whitelist remove', '/whitelist list'];
        
        const page = parseInt(interaction.customId?.split('_')[2] || 0);
        const itemsPerPage = 10;
        const totalPages = Math.ceil(allCmds.length / itemsPerPage);
        
        const start = page * itemsPerPage;
        const end = start + itemsPerPage;
        const pageCommands = allCmds.slice(start, end);
        
        const embed = sapphireEmbed('🤖 Bot Commands', `Page ${page + 1}/${totalPages} • Total: ${allCmds.length} commands\n\n💡 **Use** \` /help-command <command-name> \` **for detailed help**`);
        embed.addFields({ name: '📋 Commands', value: pageCommands.map((cmd, i) => `${start + i + 1}. ${cmd}`).join('\n'), inline: false });
        
        const buttons = new ActionRowBuilder();
        if (page > 0) {
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(`help_page_${page - 1}`)
              .setLabel('← Previous')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        if (page < totalPages - 1) {
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(`help_page_${page + 1}`)
              .setLabel('Next →')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        
        if (interaction.isButton?.()) {
          await interaction.update({ embeds: [embed], components: buttons.components.length > 0 ? [buttons] : [] });
        } else {
          await interaction.reply({ embeds: [embed], components: buttons.components.length > 0 ? [buttons] : [] });
        }
        break;
      }

      case 'help-command': {
        const cmdName = options.getString('command');
        
        const cmdDetails = {
          'kick': { emoji: '👢', title: 'Kick Command', desc: 'Remove a member from the server temporarily.', usage: '/kick <@user> [reason]', example: '/kick @spammer Spamming messages', perms: 'Kick Members', notes: 'User can rejoin, members stay banned from channels.' },
          'ban': { emoji: '🔨', title: 'Ban Command', desc: 'Permanently ban a member from the server.', usage: '/ban <@user> [reason]', example: '/ban @hacker Breaking rules', perms: 'Ban Members', notes: 'User cannot rejoin. Use /unban to remove ban.' },
          'mute': { emoji: '🔇', title: 'Mute Command', desc: 'Timeout a member for a set duration.', usage: '/mute <@user> <minutes> [reason]', example: '/mute @offender 15 Excessive caps', perms: 'Moderate Members', notes: 'Duration: 1-40320 minutes (28 days max). User cannot message or react.' },
          'warn': { emoji: '⚠️', title: 'Warn Command', desc: 'Give a warning to a member (tracked in profile).', usage: '/warn <@user> [reason]', example: '/warn @rude Disrespecting members', perms: 'Warn Members', notes: 'Track user warnings. Get warns with /warns <@user>.' },
          'suspend': { emoji: '⛔', title: 'Suspend Command', desc: 'Suspend user (Wick-style) - removes all roles instantly.', usage: '/suspend <@user> [reason]', example: '/suspend @raider Raiding server', perms: 'admin only', notes: 'Equal ranks will trigger abuse prevention (both suspended). Use /unsuspend to restore all roles.' },
          'add-role': { emoji: '🎫', title: 'Add Role Command', desc: 'Give a role to a member.', usage: '/add-role <@user> <@role>', example: '/add-role @newmember @Member', perms: 'Manage Roles', notes: 'Can only add roles below bot\'s highest role.' },
          'purge': { emoji: '🗑️', title: 'Purge Command', desc: 'Delete multiple messages from a channel.', usage: '/purge <amount>', example: '/purge 50', perms: 'Manage Messages', notes: 'Deletes up to 100 messages. Cannot delete messages >14 days old. Logged to mod channel.' },
          'prune': { emoji: '🧹', title: 'Prune Command', desc: 'Remove inactive members from the server.', usage: '/prune [days]', example: '/prune 30', perms: 'Manage Server', notes: 'Default 30 days. Removes members who haven\'t been active for specified days. Logged to mod channel.' },
          'afk': { emoji: '😴', title: 'AFK Command', desc: 'Set yourself as AFK.', usage: '/afk [reason]', example: '/afk In a meeting', perms: 'None', notes: 'Automatically removed when you send a message or join voice. Shows in /afk-list.' },
          'afk-list': { emoji: '😴', title: 'AFK List Command', desc: 'View all AFK members.', usage: '/afk-list', example: '/afk-list', perms: 'None', notes: 'Shows all AFK members with reasons and time.' },
          'setup-language-guardian': { emoji: '🛡️', title: 'Setup Language Guardian', desc: 'Configure Language Guardian settings (strikes, timeout, action).', usage: '/setup-language-guardian [strike_limit] [timeout_minutes] [action]', example: '/setup-language-guardian 3 10 ban', perms: 'Administrator', notes: 'Actions: mute (default), kick, ban, suspend. Strikes reset after action taken.' },
          'server-config': { emoji: '⚙️', title: 'Server Config', desc: 'Toggle whitelist bypass for each protection system.', usage: '/server-config', example: '/server-config', perms: 'Roles ABOVE bot', notes: 'Enable/disable bypass per system: Anti-Spam, LG, Anti-Nuke, Anti-Raid.' },
          'server-report': { emoji: '📊', title: 'Server Report', desc: 'View audit logs for time-range and selectively undo actions.', usage: '/server-report <from-time> <to-time>', example: '/server-report 2:30 PM 3:45 PM', perms: 'Roles ABOVE bot', notes: 'Shows: channels, roles, member events, messages. Click events to undo.' }
        };
        
        const detail = cmdDetails[cmdName] || { emoji: '❓', title: 'Command', desc: 'No details available.', usage: 'N/A', example: 'N/A', perms: 'N/A', notes: 'N/A' };
        const embed = sapphireEmbed(`${detail.emoji} ${detail.title}`, detail.desc);
        embed.addFields(
          { name: '📝 Usage', value: `\`${detail.usage}\``, inline: false },
          { name: '📌 Example', value: `\`${detail.example}\``, inline: false },
          { name: '🔐 Permission', value: detail.perms, inline: true },
          { name: '💡 Notes', value: detail.notes, inline: false }
        );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
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
        
        const embed = sapphireEmbed('⚙️ Anti-Spam Configured', '✅ Anti-spam protection is now active!', SAPPHIRE_COLOR, [
          { name: '📊 Max Messages', value: `${maxMessages}`, inline: true },
          { name: '⏱️ Time Window', value: `${timeWindow}s`, inline: true },
          { name: '🔇 Mute Duration', value: `${Math.floor(muteDuration / 60)} min`, inline: true },
          { name: '📍 Violation Location', value: 'Same channel as violation', inline: false },
          { name: '💡 Tip', value: 'Use "Configure Logging" button to change where violations are reported.', inline: false }
        ]);
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`antispam_status_${guild.id}`)
              .setLabel('View Settings')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚙️'),
            new ButtonBuilder()
              .setCustomId(`antispam_log_config_${guild.id}`)
              .setLabel('Configure Logging')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('📋'),
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
        const embed = sapphireEmbed('👥 Auto-Role Set', '✅ New members will be automatically assigned a role!', SAPPHIRE_COLOR, [
          { name: '🎯 Assigned Role', value: role.toString(), inline: false },
          { name: '📝 Action', value: 'All new members who join will receive this role', inline: false }
        ]);
        
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
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        
        const targetMember = await guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }
        
        // Check if target has same highest role as executor - if yes, suspend both
        const executorHighestPos = getHighestRolePosition(member);
        const targetHighestPos = getHighestRolePosition(targetMember);
        
        if (executorHighestPos === targetHighestPos) {
          // Setup suspend role
          let suspendRole = guild.roles.cache.find(r => r.name === '⛔ Suspended');
          if (!suspendRole) {
            suspendRole = await guild.roles.create({
              name: '⛔ Suspended',
              color: '#FF0000',
              reason: 'Suspend role for suspended users'
            }).catch(() => null);
          }
          
          if (suspendRole) {
            // Suspend the executor (person trying to suspend equal rank)
            const executorRoles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
            suspendUser(guild.id, interaction.user.id, suspendRole.id, executorRoles, 'Abuse Prevention: Tried to suspend equal rank');
            
            for (const role of member.roles.cache.values()) {
              if (role.id !== guild.id) await member.roles.remove(role).catch(() => {});
            }
            await member.roles.add(suspendRole).catch(() => {});
            
            // Suspend the target (equal rank person)
            const targetRoles = targetMember.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
            suspendUser(guild.id, user.id, suspendRole.id, targetRoles, 'Abuse Prevention: Was targeted for suspension by equal rank');
            
            for (const role of targetMember.roles.cache.values()) {
              if (role.id !== guild.id) await targetMember.roles.remove(role).catch(() => {});
            }
            await targetMember.roles.add(suspendRole).catch(() => {});
          }
          
          return interaction.reply({ content: `🛡️ **ANTI-NUKE DEFENSE ACTIVATED!**\n\n❌ Equal rank suspension detected - Potential admin nuke attempt!\n\n**SECURITY ACTION:** Both you and ${user.tag} have been suspended immediately.\n\n🚫 *Only admins with higher authority can suspend lower ranks. Attempting to suspend equals = nuke attempt.*`, ephemeral: false });
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
        
        // Deny suspended role from all other channels (except suspended channel)
        try {
          for (const channel of guild.channels.cache.values()) {
            if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
              if (channel.id !== suspendChannel?.id) {
                await channel.permissionOverwrites.create(suspendRole, { ViewChannel: false }).catch(() => {});
              }
            }
          }
        } catch (err) {
          console.error('Error setting channel permissions:', err);
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
        
        await logModeration(guild, 'suspend', {
          user: user,
          moderator: member.user,
          reason: reason
        });
        
        const logChannelId = getGuildConfig(guild.id)?.log_channel_id;
        if (logChannelId) {
          const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const notifyEmbed = sapphireEmbed('⛔ User Suspended Notice', `${targetMember} has been suspended.\n**Reason:** ${reason}`);
            logChannel.send({ embeds: [notifyEmbed] }).catch(() => {});
          }
        }
        
        const embed = sapphireEmbed('⛔ User Suspended', 
          `**User:** ${user.tag}\n**Reason:** ${reason}\n**Status:** Suspended\n\n✅ All roles removed\n✅ Suspend role assigned\n✅ Can only access #suspended channel\n\nUse \`/unsuspend\` to restore.`
        );
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'unsuspend': {
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
        
        try {
          // Remove ALL roles first (except @everyone)
          for (const role of targetMember.roles.cache.values()) {
            if (role.id !== guild.id) {
              await targetMember.roles.remove(role, 'User unsuspended').catch(() => {});
            }
          }
          
          // Now add back the previous roles
          for (const roleId of previousRoles) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
              await targetMember.roles.add(role, 'User unsuspended').catch(() => {});
            }
          }
        } catch (err) {
          console.error('Error unsuspending user:', err);
        }
        
        await logModeration(guild, 'unsuspend', {
          user: user,
          moderator: member.user,
          reason: 'User unsuspended'
        });
        
        const logChannelId = getGuildConfig(guild.id)?.log_channel_id;
        if (logChannelId) {
          const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const notifyEmbed = sapphireEmbed('✅ User Unsuspended', `${targetMember} has been unsuspended.`);
            logChannel.send({ embeds: [notifyEmbed] }).catch(() => {});
          }
        }
        
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
          const timestamp = Math.floor(log.createdTimestamp / 1000);
          const logInfo = {
            id: log.id,
            action: log.action,
            target: log.targetType,
            user: log.executor?.tag || 'Unknown',
            time: `<t:${timestamp}:t>`,
            timestamp: timestamp,
            details: `${log.targetType === 'Channel' ? '📁' : log.targetType === 'Role' ? '🔰' : log.targetType === 'User' ? '👤' : '💬'} ${log.action} - ${log.target?.name || 'Unknown'}`
          };
          
          if (log.targetType === 'Channel') categories[1].events.push(logInfo);
          else if (log.targetType === 'Role') categories[2].events.push(logInfo);
          else if (log.targetType === 'User' || log.targetType === 'Member') categories[3].events.push(logInfo);
          else categories[4].events.push(logInfo);
        });
        
        const total = Object.values(categories).reduce((sum, cat) => sum + cat.events.length, 0);
        
        const embed = sapphireEmbed('📊 Server Report', `**Time Range:** ${fromHour}:${String(fromMinute).padStart(2, '0')} ${fromMeridian} - ${toHour}:${String(toMinute).padStart(2, '0')} ${toMeridian}\n**Total Events:** ${total}`);
        
        Object.entries(categories).forEach(([num, cat]) => {
          if (cat.events.length > 0) {
            const eventList = cat.events.slice(0, 25).map((e, idx) => `${idx + 1}. ${e.details} (${e.time})`).join('\n');
            embed.addFields({ name: `${cat.name} (${cat.events.length})`, value: eventList || 'No events', inline: false });
          }
        });
        
        embed.setDescription('Select events below to undo them.');
        
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
                      label: `${e.action.substring(0, 30)} - ${e.details.substring(0, 40)}`,
                      value: `${i}_${idx}`,
                      description: `By ${e.user} | ${e.time}`
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
        const action = options.getString('action') || 'mute';
        
        setLanguageGuardianConfig(guild.id, {
          strikeLimit,
          timeoutSeconds: timeoutMinutes * 60,
          action
        });
        
        const embed = sapphireEmbed('🛡️ Language Guardian Configured', '✅ Bad word detection is now active!', SAPPHIRE_COLOR, [
          { name: '⚠️ Strike Limit', value: `${strikeLimit} strikes`, inline: true },
          { name: '⏰ Timeout Duration', value: `${timeoutMinutes} min`, inline: true },
          { name: '🎯 Action on Limit', value: action.toUpperCase(), inline: true },
          { name: '🌍 Coverage', value: 'Detects offensive words from all languages', inline: false },
          { name: '💡 Tip', value: 'Use "Configure Logging" to choose where violations are logged (DM or channel).', inline: false }
        ]);
        
        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`lguardian_status_${guild.id}`)
              .setLabel('View Settings')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚙️'),
            new ButtonBuilder()
              .setCustomId(`lguardian_log_config_${guild.id}`)
              .setLabel('Configure Logging')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('📋'),
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
        const actionEmoji = { 'kick': '👢', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅', 'suspend': '⛔', 'delete': '🗑️' }[caseData.action] || '⚙️';
        const timestamp = Math.floor(caseData.timestamp / 1000);
        
        const embed = sapphireEmbed(`${actionEmoji} Case #${caseId}`, '');
        embed.addFields(
          { name: '📋 Action', value: caseData.action.toUpperCase(), inline: true },
          { name: '⏰ Time', value: `<t:${timestamp}:F>`, inline: true },
          { name: '✅ Status', value: caseData.status.toUpperCase(), inline: true },
          { name: '👤 User', value: user.tag, inline: true },
          { name: '🛡️ Moderator', value: moderator.tag, inline: true },
          { name: '📝 Reason', value: caseData.reason || 'No reason', inline: false }
        );
        
        if (caseData.duration) {
          embed.addFields(
            { name: '⏳ Duration', value: `${caseData.duration} minutes`, inline: true }
          );
        }

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
            const actionEmoji = { 'kick': '👢', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅', 'suspend': '⛔' }[c.action] || '⚙️';
            const time = `<t:${Math.floor(c.timestamp / 1000)}:t>`;
            caseList += `${actionEmoji} **#${c.case_id}** | ${c.action.toUpperCase()} | ${time} | ${c.reason.substring(0, 30)}\n`;
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

// Remove AFK when user joins voice
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!oldState.channelId && newState.channelId) {
    // User joined voice channel
    const afkUser = getAFKUser(newState.guild.id, newState.member.id);
    if (afkUser) {
      removeAFK(newState.guild.id, newState.member.id);
      if (newState.member.manageable) {
        try {
          const currentNick = newState.member.nickname;
          if (currentNick && currentNick.startsWith('[AFK] ')) {
            const cleanNick = currentNick.replace(/^\[AFK\] /, '');
            await newState.member.setNickname(cleanNick);
          }
        } catch (e) {}
      }
      try {
        await newState.member.user.send(`👋 Removed from AFK as you joined voice channel.`).catch(()=>{});
      } catch (e) {}
    }
  }
});

// Handle Info Command Buttons
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  try {
    const customId = interaction.customId;
    
    // Server Info Buttons
    if (customId.startsWith('serverinfo_banlist_')) {
      const guild = interaction.guild;
      const bans = await guild.bans.fetch().catch(() => null);
      if (!bans || bans.size === 0) {
        return interaction.reply({ content: '✅ No bans on this server.', ephemeral: true });
      }
      
      let banList = '';
      bans.forEach((ban, idx) => {
        banList += `🔨 **${ban.user.tag}** - ${ban.reason || 'No reason'}\n`;
      });
      
      const embed = sapphireEmbed('🔨 Ban List', banList);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    
    if (customId.startsWith('serverinfo_timeouts_')) {
      const guild = interaction.guild;
      const members = await guild.members.fetch();
      const timedOutMembers = members.filter(m => m.communicationDisabledUntil && m.communicationDisabledUntil > new Date());
      
      if (timedOutMembers.size === 0) {
        return interaction.reply({ content: '✅ No members are currently timed out.', ephemeral: true });
      }
      
      let timeoutList = '';
      timedOutMembers.forEach((member, idx) => {
        const timeRemaining = Math.ceil((member.communicationDisabledUntil - new Date()) / 1000 / 60);
        timeoutList += `⏱️ **${member.user.tag}** - ${timeRemaining} minutes remaining\n`;
      });
      
      const embed = sapphireEmbed('⏱️ Timed Out Members', timeoutList);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    
    // Help Pagination
    if (customId.startsWith('help_page_')) {
      const page = parseInt(customId.replace('help_page_', ''));
      const allCmds = ['/kick', '/ban', '/mute', '/warn', '/unwarn', '/unban', '/unmute', '/suspend', '/unsuspend', '/suspended-list', '/add-role', '/remove-role', '/nick', '/change-role-name', '/warns', '/server-timeout-status', '/case', '/cases', '/user-info', '/server-info', '/ban-list', '/set-channel', '/enable-automod', '/disable-automod', '/enable-language-guardian', '/disable-language-guardian', '/setup-language-guardian', '/lgbl add', '/lgbl remove', '/lgbl list', '/purge', '/prune', '/afk', '/afk-list', '/say', '/lock', '/unlock', '/set-prefix', '/help-command', '/setup-anti-nuke', '/setup-anti-raid', '/setup-anti-spam', '/enable-anti-spam', '/disable-anti-spam', '/set-auto-role', '/remove-auto-role', '/server-config', '/server-report', '/whitelist add', '/whitelist remove', '/whitelist list'];
      
      const itemsPerPage = 10;
      const totalPages = Math.ceil(allCmds.length / itemsPerPage);
      const start = page * itemsPerPage;
      const end = start + itemsPerPage;
      const pageCommands = allCmds.slice(start, end);
      
      const embed = sapphireEmbed('🤖 Bot Commands', `Page ${page + 1}/${totalPages} • Total: ${allCmds.length} commands\n\n💡 **Use** \` /help-command <command-name> \` **for detailed help**`);
      embed.addFields({ name: '📋 Commands', value: pageCommands.map((cmd, i) => `${start + i + 1}. ${cmd}`).join('\n'), inline: false });
      
      const buttons = new ActionRowBuilder();
      if (page > 0) {
        buttons.addComponents(
          new ButtonBuilder().setCustomId(`help_page_${page - 1}`).setLabel('← Previous').setStyle(ButtonStyle.Secondary)
        );
      }
      if (page < totalPages - 1) {
        buttons.addComponents(
          new ButtonBuilder().setCustomId(`help_page_${page + 1}`).setLabel('Next →').setStyle(ButtonStyle.Secondary)
        );
      }
      
      await interaction.update({ embeds: [embed], components: buttons.components.length > 0 ? [buttons] : [] });
      return;
    }
    
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
      const embed = sapphireEmbed('⚙️ Anti-Spam Settings', 'Current configuration:', SAPPHIRE_COLOR, [
        { name: '📊 Max Messages', value: config ? `${config.max_messages}` : 'N/A', inline: true },
        { name: '⏱️ Time Window', value: config ? `${config.time_window}s` : 'N/A', inline: true },
        { name: '🔇 Mute Duration', value: config ? `${Math.floor(config.mute_duration / 60)} min` : 'N/A', inline: true },
        { name: '✅ Status', value: config && config.enabled ? '✅ Enabled' : '❌ Disabled', inline: false }
      ]);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Logging Configuration for Anti-Spam
    if (customId.startsWith('antispam_log_config_')) {
      const embed = sapphireEmbed('📋 Configure Anti-Spam Logging', 'Where should spam violations be reported?', SAPPHIRE_COLOR, [
        { name: '📌 Option 1: Same Channel', value: 'Report violations in the channel where spam occurs', inline: false },
        { name: '💬 Option 2: DM to User', value: 'Send spam warning via direct message to the offender', inline: false },
        { name: 'ℹ️ Current', value: 'Currently: Same channel as violation', inline: false }
      ]);
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
      const embed = sapphireEmbed('⚙️ Language Guardian Settings', 'Current configuration:', SAPPHIRE_COLOR, [
        { name: '⚠️ Strike Limit', value: `${config.strikeLimit} strikes`, inline: true },
        { name: '⏰ Timeout Duration', value: `${Math.floor(config.timeoutSeconds / 60)} min`, inline: true },
        { name: '🎯 Action on Limit', value: (config.action || 'mute').toUpperCase(), inline: true },
        { name: '🌍 Detection', value: 'All languages with auto-translate', inline: false },
        { name: '✅ Status', value: '✅ Active', inline: false }
      ]);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Logging Configuration for Language Guardian
    if (customId.startsWith('lguardian_log_config_')) {
      const embed = sapphireEmbed('📋 Configure Language Guardian Logging', 'Where should bad word violations be reported?', SAPPHIRE_COLOR, [
        { name: '📌 Option 1: Dedicated Log Channel', value: 'Create/use a specific channel for all LG violations', inline: false },
        { name: '💬 Option 2: DM to Admin', value: 'Send violation alerts directly to server admins', inline: false },
        { name: '⚠️ Option 3: DM to Offender', value: 'Notify the user who violated the rules', inline: false },
        { name: 'ℹ️ Current', value: 'Currently: Configured logging enabled', inline: false }
      ]);
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
