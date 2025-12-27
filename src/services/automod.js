const { getGuildConfig, getBlacklistWords, getLanguageGuardianConfig, addWarning, suspendUser } = require('../database');
const { translateToEnglish } = require('./translation');
const { logModeration } = require('../utils/logger');

// Parse duration string to milliseconds
function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([smhd])$/);
  if (!match) return 3600000; // Default 1h
  const value = parseInt(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return value * multipliers[unit];
}

async function safeTranslate(text) {
  try {
    const translated = await translateToEnglish(text);
    return typeof translated === 'string' ? translated : text;
  } catch {
    return text;
  }
}

// Regular automod check (for when Language Guardian is OFF)
async function checkMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const config = getGuildConfig(message.guild.id);
  if (!config || !config.automod_enabled) {
    return;
  }

  const blacklistWords = getBlacklistWords(message.guild.id);
  if (blacklistWords.length === 0) {
    return;
  }

  let textToCheck = message.content.toLowerCase();
  
  for (const word of blacklistWords) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(textToCheck)) {
      try {
        const messageContent = message.content;
        await message.delete();

        message.channel.send(`⚠️ **${message.author}** - Message deleted for violation:\n\`\`\`${messageContent}\`\`\``)
          .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
          .catch(()=>{});

        // Apply global automod punishment
        await applyPunishment(message, {
          action: config.automod_punishment_action,
          duration: config.automod_punishment_duration
        }, `Used blacklisted word in message`);

        return true;
      } catch (error) {
        console.error('Error in automod:', error);
      }
      break;
    }
  }

  return false;
}

// Apply punishment based on unified config
async function applyPunishment(message, config, reason) {
  try {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    const action = config?.action || 'warn';
    const durationStr = config?.duration || '1h';
    const durationMs = parseDuration(durationStr);

    switch (action) {
      case 'warn':
        addWarning(message.guild.id, message.author.id, reason, message.client.user.id);
        await message.channel.send(`⚠️ **${message.author}** has been warned for: ${reason}`)
          .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
          .catch(()=>{});
        break;

      case 'mute':
        if (member.moderatable) {
          await member.timeout(durationMs, reason);
          await message.channel.send(`⏱️ **${message.author}** has been muted for ${durationStr}.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;

      case 'kick':
        if (member.kickable) {
          await member.kick(reason);
          await message.channel.send(`👨🏻‍🔧 **${message.author}** has been kicked.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;

      case 'ban':
        if (member.bannable) {
          await member.ban({ reason, deleteMessageSeconds: 604800 });
          await message.channel.send(`🔨 **${message.author}** has been banned.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;

      case 'suspend':
        // Suspend: remove all roles and assign suspended role
        const suspendedRole = message.guild.roles.cache.find(r => r.name === '⛔ Suspended');
        if (suspendedRole && member.manageable) {
          const currentRoles = member.roles.cache.filter(r => r.id !== message.guild.id && r.id !== suspendedRole.id).map(r => r.id);
          suspendUser(message.guild.id, message.author.id, currentRoles.join(','), reason);
          await member.roles.set([suspendedRole.id]);
          await message.channel.send(`⛔ **${message.author}** has been suspended for ${durationStr}.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
            
          // Handle auto-unsuspend if duration is provided
          setTimeout(async () => {
            const freshMember = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (freshMember && freshMember.roles.cache.has(suspendedRole.id)) {
              await freshMember.roles.set(currentRoles);
            }
          }, durationMs);
        }
        break;
    }

    // Log the action
    await logModeration(message.guild, 'automod', {
      user: message.author,
      moderator: message.client.user,
      reason: reason + ` (Action: ${action}, Duration: ${durationStr})`
    });

  } catch (error) {
    console.error('Error applying punishment:', error);
  }
}

// Language Guardian check - AI-style pattern detection (for when Language Guardian is ON)
async function runLanguageGuardian(message, config) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const text = message.content.toLowerCase();

  // Ignore very short messages
  if (text.length < 4) return;

  // AI-style toxic patterns (detects phrases/intent, not just words)
  const toxicPatterns = [
    /kill yourself|kys/i,
    /fuck( you)?|fuckin'/i,
    /hate you/i,
    /die bitch|die mf/i,
    /madarchod|bhosdike|chutiya/i,
    /nigger|nigga/i,
    /retard|tard/i,
    /go die|go kill/i,
    /i hope you die|hope u die/i,
    /piece of shit|pos|poss/i,
    /kll self|k1ll/i
  ];

  // Check if message contains toxic patterns
  const isToxic = toxicPatterns.some(pattern => pattern.test(text));
  
  // Also check if any blacklisted words from database are present (multilingual support)
  let isBlacklisted = false;
  const blacklistWords = getBlacklistWords(message.guild.id);
  
  if (blacklistWords.length > 0) {
    // Check original text first (for non-multilingual matches)
    for (const word of blacklistWords) {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        isBlacklisted = true;
        break;
      }
    }

    // If not found in original, check translated text (multilingual support)
    if (!isBlacklisted) {
      const translatedText = await safeTranslate(message.content);
      const textToCheck = translatedText.toLowerCase();
      
      for (const word of blacklistWords) {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(textToCheck)) {
          isBlacklisted = true;
          break;
        }
      }
    }
  }

  if (!isToxic && !isBlacklisted) return;

  try {
    // Delete the message
    await message.delete().catch(() => {});

    // Apply punishment based on unified config
    const reason = isToxic ? 'Language Guardian: Toxic content detected' : 'Language Guardian: Blacklisted word detected';
    await applyPunishment(message, {
      action: config.automod_punishment_action,
      duration: config.automod_punishment_duration
    }, reason);

  } catch (error) {
    console.error('Error in language guardian:', error);
  }
}

module.exports = {
  checkMessage,
  runLanguageGuardian,
  applyPunishment
};
