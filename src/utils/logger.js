const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../database');

async function logToChannel(guild, embed) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config || !config.log_channel_id) {
      return;
    }

    const logChannel = await guild.channels.fetch(config.log_channel_id);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error logging to channel:', error);
  }
}

async function logModeration(guild, action, options) {
  const { user, moderator, reason, duration, userId } = options;
  
  const colors = {
    kick: 0xFF6B6B,
    ban: 0xE74C3C,
    mute: 0xF39C12,
    warn: 0xF1C40F,
    unban: 0x2ECC71,
    unmute: 0x2ECC71,
    unwarn: 0x2ECC71,
    suspend: 0xFF0000,
    unsuspend: 0x2ECC71,
    automod: 0x3498DB
  };

  const icons = {
    kick: '👨🏻‍🔧',
    ban: '🔨',
    mute: '🔇',
    warn: '⚠️',
    unban: '✅',
    unmute: '🔊',
    unwarn: '🗑️',
    suspend: '⛔',
    unsuspend: '✅',
    automod: '🤖'
  };

  const embed = new EmbedBuilder()
    .setColor(colors[action] || 0x95A5A6)
    .setTitle(`${icons[action] || '📋'} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
    .setTimestamp();

  if (user) {
    embed.addFields({ name: 'User', value: `${user.tag} (${user.id})`, inline: true });
  } else if (userId) {
    embed.addFields({ name: 'User ID', value: userId, inline: true });
  }

  if (moderator) {
    embed.addFields({ name: 'Moderator', value: `${moderator.tag}`, inline: true });
  }

  if (duration) {
    embed.addFields({ name: 'Duration', value: `${duration} minutes`, inline: true });
  }

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason });
  }

  await logToChannel(guild, embed);
  return embed;
}

async function logLanguageGuardian(guild, options) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config || !config.lg_log_channel_id) {
      return;
    }

    const { user, action, reason, translation } = options;
    const logChannel = await guild.channels.fetch(config.lg_log_channel_id);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle('🛡️ Language Guardian Action')
      .setTimestamp();

    if (user) {
      embed.addFields({ name: 'User', value: `${user.tag} (${user.id})`, inline: true });
    }

    if (action) {
      embed.addFields({ name: 'Action', value: action.toUpperCase(), inline: true });
    }

    if (translation) {
      embed.addFields({ name: 'Translation', value: translation, inline: false });
    }

    if (reason) {
      embed.addFields({ name: 'Reason', value: reason, inline: false });
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error logging to LG channel:', error);
  }
}

module.exports = {
  logToChannel,
  logModeration,
  logLanguageGuardian
};
