require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  AuditLogEvent,
  PermissionsBitField,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const TOKEN = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const thresholds = new Map();
const actionLog = new Map();
const trusted = new Set();

const DEFAULT_LIMIT = 3;
const DEFAULT_TIME = 10000;

function logAction(guildId, userId, type) {
  const key = `${guildId}-${userId}-${type}`;
  if (!actionLog.has(key)) actionLog.set(key, []);
  actionLog.get(key).push(Date.now());
}

function checkThreshold(guildId, userId, type) {
  const key = `${guildId}-${userId}-${type}`;
  if (!actionLog.has(key)) return false;
  const now = Date.now();
  const limit = thresholds.get(type)?.limit || DEFAULT_LIMIT;
  const time = thresholds.get(type)?.time || DEFAULT_TIME;
  const filtered = actionLog.get(key).filter(t => t > now - time);
  actionLog.set(key, filtered);
  return filtered.length >= limit;
}

async function suspend(member, reason) {
  let role = member.guild.roles.cache.find(r => r.name === "Suspended");
  if (!role) {
    try {
      role = await member.guild.roles.create({ name: "Suspended", permissions: [] });
    } catch (e) { return; }
  }
  try {
    await member.roles.set([]);
    await member.roles.add(role);
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🚨 User Suspended")
      .setDescription(`${member.user.tag}\nReason: ${reason}`)
      .setTimestamp();
    member.guild.systemChannel?.send({ embeds: [embed] });
  } catch (e) {}
}

client.on("channelDelete", async channel => {
  const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;
  const executor = entry.executor;
  if (trusted.has(executor.id) || executor.id === client.user.id) return;
  logAction(channel.guild.id, executor.id, "channel_delete");
  if (checkThreshold(channel.guild.id, executor.id, "channel_delete")) {
    const member = await channel.guild.members.fetch(executor.id).catch(() => null);
    if (member) await suspend(member, "Channel Deletion Spam");
  }
});

client.on("roleDelete", async role => {
  const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = logs.entries.first();
  if (!entry) return;
  const executor = entry.executor;
  if (trusted.has(executor.id) || executor.id === client.user.id) return;
  logAction(role.guild.id, executor.id, "role_delete");
  if (checkThreshold(role.guild.id, executor.id, "role_delete")) {
    const member = await role.guild.members.fetch(executor.id).catch(() => null);
    if (member) await suspend(member, "Role Deletion Spam");
  }
});

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  if (message.mentions.everyone && !trusted.has(message.author.id)) {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member) await suspend(member, "@everyone Abuse");
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'say') {
    const text = interaction.options.getString('text');
    try {
      if (interaction.channel) {
        await interaction.channel.send(text);
        await interaction.reply({ content: '✅', ephemeral: true });
      } else {
        await interaction.reply({ content: text });
      }
    } catch (err) {
      try { await interaction.reply({ content: text }); } catch (e) {}
    }
  }
});

client.once("ready", () => {
  console.log(`Wick-Omega Lite running as ${client.user.tag}`);
});

client.login(TOKEN);

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Wick-Omega Lite is Online!'));
app.listen(5000, '0.0.0.0');
