require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
// NOTE: Server is started separately by start.js to avoid port conflicts
const { addWarning, getWarnings, removeWarning, setLogChannel, setLgLogChannel, enableAutomod, disableAutomod, enableAutomodMultilingual, disableAutomodMultilingual, setCustomPrefix, getCustomPrefix, getPrefixCooldown, addBlacklistWord, removeBlacklistWord, getBlacklistWords, getAntiNukeConfig, setAntiNukeConfig, getAntiRaidConfig, setAntiRaidConfig, createCase, getCase, getCases, updateCaseStatus, updateCase, deleteCase, enableAntiSpam, disableAntiSpam, getAntiSpamConfig, setAntiSpamConfig, trackSpamMessage, getRecentMessages, cleanupSpamTracking, setAutoRole, removeAutoRole, getAutoRole, setLanguageGuardianConfig, getLanguageGuardianConfig, addWhitelistRole, removeWhitelistRole, getWhitelistRoles, addWhitelistMember, removeWhitelistMember, getWhitelistMembers, isUserWhitelisted, setWhitelistBypassConfig, getWhitelistBypassConfig, addAuditLog, getAuditLogsByTimeRange, suspendUser, unsuspendUser, getSuspendedUsers, isUserSuspended, getGuildConfig, setAFK, removeAFK, getAFKUser, getAllAFKUsers, setAutomodConfig, setPrisonRole, setPrisonChannel } = require('./src/database');
const { logModeration } = require('./src/utils/logger');
const { checkMessage, runLanguageGuardian } = require('./src/services/automod');

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
    name: 'setup-automod',
    description: 'Configure Wick-style unified automod settings',
    default_member_permissions: PermissionFlagsBits.Administrator,
  },
  {
    name: 'set-prison-role',
    description: 'Set a custom role for suspended users',
    default_member_permissions: "268435456", // ManageRoles
    options: [{ name: 'role', type: 8, description: 'The role to use for prison', required: true }]
  },
  {
    name: 'set-prison-channel',
    description: 'Set a custom channel for suspended users',
    default_member_permissions: "16", // ManageChannels
    options: [{ name: 'channel', type: 7, description: 'The channel to use for prison', required: true }]
  },
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
      },
      {
        name: 'duration',
        description: 'Duration for record (e.g. 30s, 5m, 1h, 1w)',
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
      },
      {
        name: 'duration',
        description: 'Duration for record (e.g. 30s, 5m, 1h, 1w)',
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
    name: 'enable-automod',
    description: 'Enable automod system'
  },
  {
    name: 'disable-automod',
    description: 'Disable automod system'
  },
  {
    name: 'setup-automod',
    description: 'Configure automod with Language Guardian option'
  },
  {
    name: 'blacklist',
    description: 'Automod - manage blacklisted words',
    options: [
      {
        name: 'add',
        description: 'Add a word to Automod blacklist',
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
        description: 'Remove a word from Automod blacklist',
        type: 1,
        options: [
          {
            name: 'word',
            description: 'The word to remove',
            type: 3,
            required: true
          }
        ]
      },
      {
        name: 'library',
        description: 'View all blacklisted words',
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
      },
      {
        name: 'duration',
        description: 'Duration for record (e.g. 5m, 1h, 1w, 30s)',
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
    console.log('🔄 Registering slash commands...');
    console.log('📊 Total commands to register: ' + commands.length);
    
    const result = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: JSON.parse(JSON.stringify(commands, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      )) }
    );
    
    console.log('✅ Successfully registered all commands!');
    console.log('\n📋 Commands Registered (' + (result?.length || commands.length) + ' total):');
    commands.slice(0, 10).forEach(cmd => {
      console.log(`  /${cmd.name}`);
    });
    if (commands.length > 10) {
      console.log(`  ... and ${commands.length - 10} more`);
    }
  } catch (error) {
    console.error('❌ Error registering commands:', error.message);
    console.error('Full error:', error);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    // Get custom prefix for this guild
    const customPrefix = getCustomPrefix(message.guild.id) || PREFIX;

    // Bot mention handler - reply once if bot is directly mentioned
    if (message.mentions.has(client.user.id) && !message.reference && message.content.trim().startsWith('<')) {
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
      // Only run automod on non-command messages
      const config = getGuildConfig(message.guild.id);
      
      // Main automod controller: if automod is enabled
      if (config?.automod_enabled) {
        // If Language Guardian is enabled, run it (it handles translation + multilingual detection)
        if (config.automod_multilingual) {
          await runLanguageGuardian(message, config);
        } else {
          // Otherwise, run regular automod
          await checkMessage(message);
        }
      }
      return;
    }

    const args = message.content.slice(customPrefix.length).trim().split(/ +/);
    let cmd = args.shift().toLowerCase();

    // Multi-word command support (e.g., "=add role" -> "=add-role")
    const multiWordSupport = [
      'add-role', 'remove-role', 'set-prefix', 'lgbl-add', 'lgbl-remove', 
      'server-config', 'server-report', 'help-command', 'set-prison-role', 
      'set-prison-channel', 'change-role-name', 'change-prefix'
    ];

    if (args.length > 0) {
      const multiWordCmd = `${cmd}-${args[0].toLowerCase()}`;
      if (multiWordSupport.includes(multiWordCmd)) {
        cmd = multiWordCmd;
        args.shift();
      }
    }
    // Command aliases
    const aliases = {
      'k': 'kick', 'b': 'ban', 'm': 'mute', 'um': 'unmute', 'ub': 'unban', 'w': 'warn', 'uw': 'unwarn',
      'ar': 'add-role', 'rr': 'remove-role', 'p': 'purge', 's': 'say', 'bl': 'blacklist', 'pb': 'purgebad',
      'cr': 'change-role-name', 'l': 'lock', 'ul': 'unlock', 'sp': 'set-prefix', 'sc': 'set-channel',
      'ea': 'enable-automod', 'da': 'disable-automod', 'elg': 'enable-language-guardian', 'dlg': 'disable-language-guardian',
      'sus': 'suspend', 'unsus': 'unsuspend', 'susl': 'suspended-list', 'cp': 'set-prefix'
    };
    
    // Resolve alias to full command
    if (aliases[cmd]) cmd = aliases[cmd];

    // Final mapping for specific multi-word cases
    if (cmd === 'change-prefix') cmd = 'set-prefix';
    
    // Handle remaining multi-word commands logic
    if (args.length > 0) {
      const multiWordCmd = cmd + '-' + args[0].toLowerCase();
      const knownCommands = [
        'kick', 'ban', 'mute', 'unmute', 'unban', 'warn', 'unwarn', 'add-role', 'remove-role', 'purge', 'say', 'blacklist', 'purgebad',
        'change-role-name', 'lock', 'unlock', 'set-prefix', 'set-channel', 'enable-automod', 'disable-automod', 
        'enable-language-guardian', 'disable-language-guardian', 'suspend', 'unsuspend', 'suspended-list', 'nick', 'lgbl', 'afk', 'afk-list'
      ];
      if (knownCommands.includes(multiWordCmd)) {
        cmd = multiWordCmd;
        args.shift();
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
        
        // Duration parsing
        let reason = args.join(' ') || 'No reason provided';
        let duration = null;
        let durationLabel = '';
        
        if (args.length > 1) {
          const possibleDuration = args[1];
          const match = possibleDuration.match(/^(\d+)([mhdwy])$/i);
          if (match) {
            duration = possibleDuration;
            const amount = match[1];
            const unit = match[2].toLowerCase();
            const units = { 'm': 'minute', 'h': 'hour', 'd': 'day', 'w': 'week', 'y': 'year' };
            durationLabel = `${amount} ${units[unit]}${amount > 1 ? 's' : ''}`;
            reason = args.slice(2).join(' ') || 'No reason provided';
          }
        }

        const targetMember = await message.guild.members.fetch(user.id);
        if (!targetMember.kickable) return message.reply('❌ Cannot kick this user.');
        
        await targetMember.kick(reason);
        addWarning(message.guild.id, user.id, message.author.id, `👨🏻‍🔧 Kicked${durationLabel ? ` (${durationLabel})` : ''}: ${reason}`);
        
        const embed = sapphireEmbed('✅ User Kicked', `👨🏻‍🔧 **${user.tag}** has been kicked.`)
          .addFields(
            { name: '👤 Target', value: `${user}`, inline: true },
            { name: '🛡️ Moderator', value: `${message.author}`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
          );
        if (durationLabel) embed.addFields({ name: '⏱️ Duration', value: durationLabel, inline: true });
        
        message.reply({ embeds: [embed] });
        break;
      }
      
      case 'ban': {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return message.reply('❌ You need the "Ban Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to ban.');
        
        // Duration parsing
        let reason = args.join(' ') || 'No reason provided';
        let duration = null;
        let durationLabel = '';
        
        if (args.length > 1) {
          const possibleDuration = args[1];
          const match = possibleDuration.match(/^(\d+)([mhdwy])$/i);
          if (match) {
            duration = possibleDuration;
            const amount = match[1];
            const unit = match[2].toLowerCase();
            const units = { 'm': 'minute', 'h': 'hour', 'd': 'day', 'w': 'week', 'y': 'year' };
            durationLabel = `${amount} ${units[unit]}${amount > 1 ? 's' : ''}`;
            reason = args.slice(2).join(' ') || 'No reason provided';
          }
        }

        const targetMember = await message.guild.members.fetch(user.id);
        if (!targetMember.bannable) return message.reply('❌ Cannot ban this user.');
        
        await targetMember.ban({ reason });
        addWarning(message.guild.id, user.id, message.author.id, `Banned${durationLabel ? ` (${durationLabel})` : ''}: ${reason}`);
        
        const embed = sapphireEmbed('✅ User Banned', `🚫 **${user.tag}** has been banned.`)
          .addFields(
            { name: '👤 Target', value: `${user}`, inline: true },
            { name: '🛡️ Moderator', value: `${message.author}`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
          );
        if (durationLabel) embed.addFields({ name: '⏱️ Duration', value: durationLabel, inline: true });

        message.reply({ embeds: [embed] });
        break;
      }
      
      case 'mute': {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return message.reply('❌ You need the "Timeout Members" permission.');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to mute.');
        
        // args[0] is the mention, so we check args[1] for duration
        const durationStr = args[1];
        if (!durationStr) return message.reply('❌ Usage: `=mute @user 5h reason` (m/h/d/w/y)');
        
        const match = durationStr.match(/^(\d+)([mhdwy])$/i);
        if (!match) return message.reply('❌ Invalid format. Use: `=mute @user 5h reason` (m/h/d/w/y)');
        
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const ms = convertTimeToMs(amount, unit);
        
        if (ms > 40320 * 60 * 1000) return message.reply('❌ Duration cannot exceed 40320 minutes (28 days).');
        
        try {
          const reason = args.slice(2).join(' ') || 'No reason provided';
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

        if (action === "library") {
          const words = getBlacklistWords(message.guild.id);
          if (words.length === 0) {
            return message.reply("📚 **Blacklist Library:** No words added yet.");
          }
          const wordList = words.slice(0, 50).join(", ") + (words.length > 50 ? `\n\n...and ${words.length - 50} more words` : "");
          return message.reply(`📚 **Blacklist Library (${words.length} words):**\n${wordList}`);
        }

        return message.reply("Usage: `=blacklist <add/remove/library> [word]`");
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

      case 'setup-automod': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }
        enableAutomod(guild.id);
        const config = getGuildConfig(guild.id);
        const multilingualEnabled = config?.automod_multilingual ? '✅ Enabled' : '❌ Disabled';
        
        const embed = sapphireEmbed('🛡️ Wick-Style Automod Configuration', 'Configure the unified automod system. Sub-modules like Language Guardian only run if Automod is ON.')
          .addFields(
            { name: '🤖 Automod Main Toggle', value: config?.automod_enabled ? '✅ **ENABLED**' : '❌ **DISABLED**', inline: true },
            { name: '🌍 Language Guardian', value: multilingualEnabled, inline: true },
            { name: '⚡ Punishment Action', value: `\`${config?.automod_punishment_action?.toUpperCase() || 'WARN'}\``, inline: true },
            { name: '⏱️ Punishment Duration', value: `\`${config?.automod_punishment_duration || '1h'}\``, inline: true }
          );
        
        const selectMenu = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`automod_punishment_action_${guild.id}`)
              .setPlaceholder('Select Punishment Action')
              .addOptions([
                { label: 'Warn', value: 'warn', emoji: '⚠️', default: config?.automod_punishment_action === 'warn' },
                { label: 'Mute', value: 'mute', emoji: '🔇', default: config?.automod_punishment_action === 'mute' },
                { label: 'Kick', value: 'kick', emoji: '👨🏻‍🔧', default: config?.automod_punishment_action === 'kick' },
                { label: 'Ban', value: 'ban', emoji: '🔨', default: config?.automod_punishment_action === 'ban' },
                { label: 'Suspend', value: 'suspend', emoji: '⛔', default: config?.automod_punishment_action === 'suspend' }
              ])
          );

        const durationMenu = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`automod_punishment_duration_${guild.id}`)
              .setPlaceholder('Select Punishment Duration')
              .addOptions([
                { label: '5 Minutes', value: '5m', emoji: '⏱️' },
                { label: '10 Minutes', value: '10m', emoji: '⏱️' },
                { label: '1 Hour', value: '1h', emoji: '🕒' },
                { label: '6 Hours', value: '6h', emoji: '🕓' },
                { label: '12 Hours', value: '12h', emoji: '🕕' },
                { label: '1 Day', value: '1d', emoji: '📅' },
                { label: '3 Days', value: '3d', emoji: '🗓️' },
                { label: '1 Week', value: '7d', emoji: '⏳' }
              ])
          );

        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`automod_toggle_${guild.id}`)
              .setLabel(config?.automod_enabled ? 'Disable Automod' : 'Enable Automod')
              .setStyle(config?.automod_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
              .setEmoji('🛡️'),
            new ButtonBuilder()
              .setCustomId(`automod_toggle_multilingual_${guild.id}`)
              .setLabel(config?.automod_multilingual ? 'Disable Language Guardian' : 'Enable Language Guardian')
              .setStyle(config?.automod_multilingual ? ButtonStyle.Danger : ButtonStyle.Success)
              .setEmoji('🌍'),
            new ButtonBuilder()
              .setCustomId(`automod_prison_settings_${guild.id}`)
              .setLabel('Prison Settings')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⛓️')
          );
        
        await interaction.reply({ embeds: [embed], components: [selectMenu, durationMenu, buttons] });
        break;
      }

      case 'blacklist': {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ 
            content: '❌ You need the "Administrator" permission to use this command.', 
            ephemeral: true 
          });
        }

        const subcommand = options.getSubcommand();
        
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
          'kick': { emoji: '👨🏻‍🔧', title: 'Kick Command', desc: 'Remove a member from the server temporarily.', usage: '/kick <@user> [reason]', example: '/kick @spammer Spamming messages', perms: 'Kick Members', notes: 'User can rejoin, members stay banned from channels.' },
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
            const emoji = action.type === 'ban' ? '🔨' : '👨🏻‍🔧';
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
        const durationStr = options.getString('duration');
        
        const targetMember = await guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
          return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }

        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: '❌ You need `Manage Roles` permission to use this command.', ephemeral: true });
        }

        // Duration parsing for slash command
        let durationLabel = '';
        if (durationStr) {
          const match = durationStr.match(/^(\d+)([smhdwy])$/i);
          if (match) {
            const amount = match[1];
            const unit = match[2].toLowerCase();
            const units = { 's': 'second', 'm': 'minute', 'h': 'hour', 'd': 'day', 'w': 'week', 'y': 'year' };
            durationLabel = `${amount} ${units[unit]}${amount > 1 ? 's' : ''}`;
          }
        }
        
        const executorHighestPos = member.roles.highest.position;
        const targetHighestPos = targetMember.roles.highest.position;
        
        if (executorHighestPos <= targetHighestPos && guild.ownerId !== interaction.user.id) {
          let suspendRole = guild.roles.cache.find(r => r.name === '⛔ Suspended');
          const config = getGuildConfig(guild.id);
          if (config.prison_role_id) suspendRole = guild.roles.cache.get(config.prison_role_id);
          
          if (!suspendRole) {
             suspendRole = await guild.roles.create({
              name: '⛔ Suspended',
              color: '#FF0000',
              reason: 'Suspend role for nuke attempt'
            }).catch(() => null);
          }
          
          if (suspendRole) {
            const executorRoles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
            suspendUser(guild.id, interaction.user.id, suspendRole.id, executorRoles.join(','), 'Abuse Prevention: Tried to suspend equal/higher rank (Potential Nuke)');
            await member.roles.set([suspendRole.id]).catch(() => {});
            
            const targetRoles = targetMember.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
            suspendUser(guild.id, user.id, suspendRole.id, targetRoles.join(','), 'Abuse Prevention: Target of nuke attempt');
            await targetMember.roles.set([suspendRole.id]).catch(() => {});
          }
          
          return interaction.reply({ content: `🛡️ **ANTI-NUKE DEFENSE ACTIVATED!**\n\n❌ Attempted to suspend an equal or higher rank user.\n\n**SECURITY ACTION:** Both you and ${user.tag} have been suspended immediately.`, ephemeral: false });
        }

        const config = getGuildConfig(guild.id);
        let suspendRole = config.prison_role_id ? guild.roles.cache.get(config.prison_role_id) : guild.roles.cache.find(r => r.name === '⛔ Suspended');
        
        if (!suspendRole) {
          suspendRole = await guild.roles.create({
            name: '⛔ Suspended',
            color: '#FF0000',
            reason: 'Auto-created suspend role'
          }).catch(() => null);
          if (suspendRole) setPrisonRole(guild.id, suspendRole.id);
        }
        
        if (!suspendRole) return interaction.reply({ content: '❌ Could not create suspend role.', ephemeral: true });
        
        const previousRoles = targetMember.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
        suspendUser(guild.id, user.id, suspendRole.id, previousRoles.join(','), reason);
        
        await targetMember.roles.set([suspendRole.id]).catch(() => {});
        
        const responseEmbed = sapphireEmbed('✅ User Suspended', `⛔ **${user.tag}** has been suspended.`)
          .addFields(
            { name: '👤 Target', value: `${user}`, inline: true },
            { name: '🛡️ Moderator', value: `${interaction.user}`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
          );
        if (durationLabel) responseEmbed.addFields({ name: '⏱️ Duration', value: durationLabel, inline: true });

        await interaction.reply({ embeds: [responseEmbed] });
        break;
      }

      case 'unsuspend': {
        const user = options.getUser('user');
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: '❌ You need `Manage Roles` permission to use this command.', ephemeral: true });
        }

        const suspendedData = isUserSuspended(guild.id, user.id);
        if (!suspendedData) return interaction.reply({ content: '❌ This user is not suspended.', ephemeral: true });
        
        const targetMember = await guild.members.fetch(user.id).catch(() => null);
        if (targetMember) {
          const rolesStr = suspendedData.previous_roles || '';
          const roles = rolesStr.split(',').filter(id => id.length > 0);
          await targetMember.roles.set(roles).catch(() => {});
        }
        
        unsuspendUser(guild.id, user.id);
        
        const embed = sapphireEmbed('✅ User Unsuspended', `👤 **${user.tag}** has been restored.`)
          .addFields(
            { name: '👤 Target', value: `${user}`, inline: true },
            { name: '🛡️ Moderator', value: `${interaction.user}`, inline: true }
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

      case 'case': {
        const caseId = options.getInteger('case_id');
        const caseData = getCase(guild.id, caseId);
        
        if (!caseData) {
          return interaction.reply({ content: `❌ Case #${caseId} not found.`, ephemeral: true });
        }

        const user = await client.users.fetch(caseData.user_id);
        const moderator = await client.users.fetch(caseData.moderator_id);
        const actionEmoji = { 'kick': '👨🏻‍🔧', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅', 'suspend': '⛔', 'delete': '🗑️' }[caseData.action] || '⚙️';
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
            const actionEmoji = { 'kick': '👨🏻‍🔧', 'ban': '🔨', 'mute': '🔇', 'unmute': '🔊', 'warn': '⚠️', 'unban': '✅', 'suspend': '⛔' }[c.action] || '⚙️';
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
