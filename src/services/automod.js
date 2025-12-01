const { getGuildConfig, getBlacklistWords } = require('../database');
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
  if (config.automod_multilingual) {
    const translatedText = await safeTranslate(message.content);
    textToCheck = translatedText.toLowerCase();
  }
  
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

module.exports = {
  checkMessage
};
