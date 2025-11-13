const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
require('./server');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1437383469528387616';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

const commands = [
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
        description: 'Duration in minutes (max 40320)',
        type: 4,
        required: true
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
  }
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  
  try {
    console.log('🔄 Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    
    console.log('✅ Successfully reloaded application (/) commands.');
    console.log('\n📋 Registered Commands:');
    commands.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, member, guild } = interaction;
  
  try {
    switch (commandName) {
      case 'kick': {
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Kick Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.kickable) {
          return interaction.reply({ 
            content: '❌ I cannot kick this user. They may have higher permissions than me.', 
            ephemeral: true 
          });
        }
        
        await targetMember.kick(reason);
        
        const embed = new EmbedBuilder()
          .setColor(0xFF6B6B)
          .setTitle('👢 Member Kicked')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      case 'ban': {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Ban Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.bannable) {
          return interaction.reply({ 
            content: '❌ I cannot ban this user. They may have higher permissions than me.', 
            ephemeral: true 
          });
        }
        
        await targetMember.ban({ reason });
        
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🔨 Member Banned')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      case 'mute': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Timeout Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (duration > 40320) {
          return interaction.reply({ 
            content: '❌ Duration cannot exceed 40320 minutes (28 days).', 
            ephemeral: true 
          });
        }
        
        if (!targetMember.moderatable) {
          return interaction.reply({ 
            content: '❌ I cannot timeout this user. They may have higher permissions than me.', 
            ephemeral: true 
          });
        }
        
        await targetMember.timeout(duration * 60 * 1000, reason);
        
        const embed = new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('🔇 Member Muted')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Duration', value: `${duration} minutes`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
      
      case 'warn': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Moderate Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        
        const embed = new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle('⚠️ Member Warned')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
        try {
          await user.send({
            embeds: [new EmbedBuilder()
              .setColor(0xF1C40F)
              .setTitle('⚠️ You have been warned')
              .setDescription(`You received a warning in **${guild.name}**`)
              .addFields({ name: 'Reason', value: reason })
              .setTimestamp()
            ]
          });
        } catch (error) {
          console.log(`Could not DM ${user.tag}`);
        }
        break;
      }
      
      case 'unban': {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Ban Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          await guild.members.unban(userId, reason);
          
          const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('✅ User Unbanned')
            .addFields(
              { name: 'User ID', value: userId, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: reason }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ 
            content: '❌ Could not unban user. Make sure the User ID is correct and they are banned.', 
            ephemeral: true 
          });
        }
        break;
      }
      
      case 'unmute': {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ 
            content: '❌ You need the "Timeout Members" permission to use this command.', 
            ephemeral: true 
          });
        }
        
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(user.id);
        
        if (!targetMember.moderatable) {
          return interaction.reply({ 
            content: '❌ I cannot modify this user\'s timeout.', 
            ephemeral: true 
          });
        }
        
        await targetMember.timeout(null, reason);
        
        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('🔊 Member Unmuted')
          .addFields(
            { name: 'User', value: `${user.tag}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
    }
  } catch (error) {
    console.error(`Error executing ${commandName}:`, error);
    const errorMessage = { 
      content: '❌ An error occurred while executing this command.', 
      ephemeral: true 
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.login(TOKEN).catch(error => {
  console.error('❌ Failed to login:', error);
  console.log('\n⚠️  Make sure DISCORD_BOT_TOKEN is set in your environment variables.');
});
