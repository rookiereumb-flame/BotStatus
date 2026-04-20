const { EmbedBuilder } = require('discord.js');

const ACTION_COLORS = {
  warn:      0xFFC107,
  ban:       0xED4245,
  kick:      0xFFA500,
  mute:      0xF39C12,
  suspend:   0xE67E22,
  shadowban: 0x9B59B6,
  note:      0x3498DB,
};

const ACTION_TYPE_LABELS = {
  warn:      'Warn',
  ban:       'Ban',
  kick:      'Kick',
  mute:      'Timeout',
  suspend:   'Suspend',
  shadowban: 'Shadow-Ban',
  note:      'Note',
};

const RESULT_TITLES = {
  warn:      'Warn result:',
  ban:       'Ban result:',
  kick:      'Kick result:',
  mute:      'Timeout result:',
  suspend:   'Suspend result:',
  shadowban: 'Shadow-Ban result:',
};

const PAST_TENSE = {
  warn:      'Warned',
  ban:       'Banned',
  kick:      'Kicked',
  mute:      'Timed out',
  suspend:   'Suspended',
  shadowban: 'Shadow-Banned',
};

function buildResultEmbed(action, reason, mod, user, extra = {}) {
  const key   = action.toLowerCase();
  const title = RESULT_TITLES[key] || `${action} result:`;
  const color = ACTION_COLORS[key] || 0x5865F2;
  const past  = PAST_TENSE[key]   || action;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: '📋 Reason',    value: reason,                         inline: false },
      { name: '👤 Moderator', value: `${mod.tag || mod} 👑`,         inline: false }
    );

  if (extra.duration) {
    embed.addFields({ name: '⏱️ Duration', value: extra.duration, inline: false });
  }

  embed.addFields({
    name:  `✅ ${past}:`,
    value: `▶ ${user.tag} \`[${user.id}]\``,
    inline: false
  });

  embed.setTimestamp();
  return embed;
}

function buildCaseEmbed(caseData, targetUser, modUser) {
  const key   = (caseData.action || '').toLowerCase();
  const color = ACTION_COLORS[key] || 0xE67E22;

  let typeLabel = ACTION_TYPE_LABELS[key] || caseData.action;
  if (caseData.duration) typeLabel += ` (${caseData.duration})`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .addFields(
      { name: 'Case:',      value: `${caseData.case_id} ✅`,                                   inline: false },
      { name: 'Type:',      value: typeLabel,                                                   inline: false },
      { name: 'Moderator:', value: `${modUser?.username || modUser?.tag || 'Unknown'} 👑`,     inline: false },
      { name: 'Target:',    value: `▶ ${targetUser?.tag || targetUser?.id || 'Unknown'} 🎯`,   inline: false },
      { name: 'Reason:',    value: caseData.reason || 'No reason.',                             inline: false }
    )
    .setTimestamp(new Date(caseData.timestamp));

  const avatarUrl = typeof targetUser?.displayAvatarURL === 'function'
    ? targetUser.displayAvatarURL()
    : null;
  if (avatarUrl) embed.setThumbnail(avatarUrl);

  if (caseData.evidence) embed.setImage(caseData.evidence);

  return embed;
}

async function sendModlog(guild, embed, botDb) {
  const config    = botDb.getGuildConfig(guild.id);
  const channelId = config?.modlog_channel_id || config?.log_channel_id;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { buildResultEmbed, buildCaseEmbed, sendModlog };
