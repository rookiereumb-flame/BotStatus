const { getGuildConfig, getBlacklistWords, getLanguageGuardianConfig, addWarning } = require('../database');
const { translateToEnglish } = require('./translation');
const { logModeration } = require('../utils/logger');

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

        await logModeration(message.guild, 'automod', {
          user: message.author,
          moderator: message.client.user,
          reason: `Used blacklisted word in message`
        });

        return true;
      } catch (error) {
        console.error('Error in automod:', error);
      }
      break;
    }
  }

  return false;
}

// Apply punishment based on Language Guardian config (AI-style detection)
async function applyPunishment(message, lgConfig, reason) {
  try {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    const action = lgConfig?.action || 'mute';
    const timeoutSeconds = lgConfig?.timeout_seconds || 600;

    switch (action) {
      case 'mute':
        if (member.moderatable) {
          await member.timeout(timeoutSeconds * 1000, reason);
          await message.channel.send(`⏱️ **${message.author}** has been muted for ${Math.round(timeoutSeconds / 60)} minute(s).`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;

      case 'kick':
        if (member.kickable) {
          await member.kick(reason);
          await message.channel.send(`👢 **${message.author}** has been kicked.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;

      case 'ban':
        if (member.bannable) {
          await member.ban({ reason });
          await message.channel.send(`🔨 **${message.author}** has been banned.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;

      case 'suspend':
        // Suspend: remove all roles and assign suspended role
        const suspendedRole = message.guild.roles.cache.find(r => r.name === '⛔ Suspended');
        if (suspendedRole && member.manageable) {
          const previousRoles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
          await member.roles.set([suspendedRole.id]);
          await message.channel.send(`⛔ **${message.author}** has been suspended.`)
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000))
            .catch(()=>{});
        }
        break;
    }

    // Log the action
    await logModeration(message.guild, 'language-guardian', {
      user: message.author,
      moderator: message.client.user,
      reason: reason
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
  if (!isToxic) return;

  try {
    // Delete the message
    await message.delete().catch(() => {});

    // Get Language Guardian config
    const lgConfig = getLanguageGuardianConfig(message.guild.id);

    // Apply punishment based on config
    await applyPunishment(message, lgConfig, 'Language Guardian: Toxic content detected');

  } catch (error) {
    console.error('Error in language guardian:', error);
  }
}

module.exports = {
  checkMessage,
  runLanguageGuardian
};
