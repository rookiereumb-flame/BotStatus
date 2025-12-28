require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, setAutomodConfig } = require('./src/database');

const SAPPHIRE_COLOR = '#5865F2';

const sapphireEmbed = (title, desc) => {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(SAPPHIRE_COLOR)
    .setTimestamp();
};

function createAutomodEmbed(config) {
  const embed = sapphireEmbed('🛡️ Wick-Style Automod Configuration', 'Configure the unified automod system.');
  embed.addFields(
    { name: '🤖 Automod Main Toggle', value: config.automod_enabled ? '✅ **ENABLED**' : '❌ **DISABLED**', inline: true },
    { name: '🌍 Language Guardian', value: config.automod_multilingual ? '✅ **ENABLED**' : '❌ **DISABLED**', inline: true },
    { name: '⚡ Punishment Action', value: (config.automod_punishment_action || 'warn').toUpperCase(), inline: true },
    { name: '⏱️ Punishment Duration', value: config.automod_punishment_duration || '1h', inline: true }
  );
  return embed;
}

function createAutomodComponents(config) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('toggle_automod').setLabel(config.automod_enabled ? 'Disable Automod' : 'Enable Automod').setStyle(config.automod_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('toggle_lg').setLabel(config.automod_multilingual ? 'Disable LG' : 'Enable LG').setStyle(config.automod_multilingual ? ButtonStyle.Danger : ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('automod_punishment').setPlaceholder('Select Punishment Action').addOptions([
      { label: 'Warn', value: 'warn', emoji: '⚠️' },
      { label: 'Mute', value: 'mute', emoji: '🔇' },
      { label: 'Kick', value: 'kick', emoji: '👨🏻‍🔧' },
      { label: 'Ban', value: 'ban', emoji: '🔨' },
      { label: 'Suspend', value: 'suspend', emoji: '⛔' }
    ])
  );
  return [row1, row2];
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.on('ready', () => {
  console.log('✅ Logged in as ' + client.user.tag);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const config = getGuildConfig(interaction.guildId);
    if (['toggle_automod', 'toggle_lg', 'automod_punishment'].includes(interaction.customId)) {
      let enabled = config.automod_enabled;
      let lgEnabled = config.automod_multilingual;
      let action = config.automod_punishment_action;
      if (interaction.customId === 'toggle_automod') enabled = !enabled;
      if (interaction.customId === 'toggle_lg') lgEnabled = !lgEnabled;
      if (interaction.customId === 'automod_punishment') action = interaction.values[0];
      setAutomodConfig(interaction.guildId, enabled, lgEnabled, action, config.automod_punishment_duration);
      const newConfig = getGuildConfig(interaction.guildId);
      return await interaction.update({ embeds: [createAutomodEmbed(newConfig)], components: createAutomodComponents(newConfig) });
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, guild } = interaction;
  const config = getGuildConfig(guild.id);

  try {
    switch(commandName) {
      case 'setup-automod':
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        await interaction.reply({ embeds: [createAutomodEmbed(config)], components: createAutomodComponents(config) });
        break;
      case 'help':
        await interaction.reply({ content: 'Wick-style bot active. Use /setup-automod.' });
        break;
    }
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

// --- ADDITIONAL COMMANDS & UTILITIES ---

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return days + "d " + (hours % 24) + "h";
  if (hours > 0) return hours + "h " + (minutes % 60) + "m";
  if (minutes > 0) return minutes + "m " + (seconds % 60) + "s";
  return seconds + "s";
}

function convertTimeToMs(amount, unit) {
  const units = { 's': 1000, 'm': 60000, 'h': 3600000, 'd': 86400000, 'w': 604800000 };
  return amount * (units[unit] || 60000);
}

// Prefix command support (Legacy/Backup)
const validPrefixCommands = ['kick', 'ban', 'mute', 'warn', 'unwarn', 'setup-automod', 'help'];
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const customPrefix = '='; // Default prefix
  if (!message.content.startsWith(customPrefix)) return;

  const args = message.content.slice(customPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!validPrefixCommands.includes(command)) return;
  message.reply("Please use slash commands (e.g., /" + command + ") for the best experience. The prefix system is currently in maintenance mode.");
});

