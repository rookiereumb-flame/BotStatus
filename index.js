require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, guildId } = interaction;

  if (commandName === 'say') {
    const isBotInGuild = guildId && client.guilds.cache.has(guildId);
    const hasPerms = !isBotInGuild || (member && (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)));

    if (isBotInGuild && !hasPerms) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const text = options.getString('text');
    if (!text) return interaction.reply({ content: '❌ No text.', ephemeral: true });

    try {
      if (interaction.channel) {
        await interaction.channel.send(text);
        await interaction.reply({ content: '✅', ephemeral: true });
      } else {
        await interaction.reply({ content: text });
      }
    } catch (err) {
      try {
        await interaction.reply({ content: text });
      } catch (e) {
        await interaction.followUp({ content: '❌ Error.', ephemeral: true }).catch(() => {});
      }
    }
  }
});

client.login(TOKEN);
