const { getGuildConfig, getBlacklistWords, addWarning } = require('../database');
const { translateToEnglish } = require('./translation');
const { logModeration } = require('../utils/logger');
const { safeTranslate } = require('./language-guardian');

async function checkMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const config = getGuildConfig(message.guild.id);
  if (!config || !config.automod_enabled) {
    return;
  }

  // Get per-guild blacklist from database
  const blacklistWords = getBlacklistWords(message.guild.id);
  if (blacklistWords.length === 0) {
    return;
  }

  // Translate message
  const translatedText = await safeTranslate(message.content);
  const lowerText = translatedText.toLowerCase();
  
  for (const word of blacklistWords) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      try {
        await message.delete();

        await logModeration(message.guild, 'automod', {
          user: message.author,
          moderator: message.client.user,
          reason: `Used blacklisted word: "${word}" (Message: "${message.content.substring(0, 100)}")`
        });

        try {
          await message.author.send({
            content: `⚠️ Your message in **${message.guild.name}** was deleted for containing a blacklisted word.`
          });
        } catch (error) {
          console.log(`Could not DM ${message.author.tag}`);
        }

        return true;
      } catch (error) {
        console.error('Error in automod:', error);
      }
      break;
    }
  }

  return false;
}

module.exports = {
  checkMessage
};
