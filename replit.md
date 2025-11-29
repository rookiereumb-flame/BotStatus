# Discord Bot Host

## Overview
This project hosts a comprehensive Discord moderation bot on Replit, running 24/7. The bot features complete moderation tools, role management, advanced protection systems (anti-nuke, anti-raid, anti-spam), auto-role assignment, intelligent automod system with translation support, and Language Guardian system that detects bad words from all languages with auto-translation.

## Recent Changes
- **November 29, 2025**: Anti-Spam + Auto-Role + Enhanced Protection
  - **Anti-Spam System**: Real-time message spam detection
    - `/enable-anti-spam` - Activate anti-spam (5 messages/10 seconds default)
    - `/disable-anti-spam` - Deactivate anti-spam
    - `/setup-anti-spam` - Configure thresholds and time windows
    - Auto-mutes users who exceed message limit (5 min mute by default)
    - Tracks messages in real-time database table
  - **Auto-Role System**: Automatic role assignment on member join
    - `/set-auto-role <role>` - Set the role to auto-assign
    - `/remove-auto-role` - Remove auto-role assignment
    - Automatically assigns role when new members join
    - Integrates with guildMemberAdd event handler
  - Enhanced info commands now display Wick-style comprehensive details:
    - `/user-info` - Shows account age, join age, roles, warnings, cases
    - `/server-info` - Shows members breakdown (humans/bots), channels, security, features
    - `/ban-list` - Shows combined ban & kick history with pagination
  
- **November 29, 2025**: Per-server custom prefix + Language Guardian + Smart Mention Handler
  - Added `/set-prefix` command for per-server custom prefixes (1-3 characters)
  - 30-day cooldown on prefix changes
  - Smart mention handler replies with welcome message
  - Language Guardian & LGBL systems fully separated and documented

## Project Architecture
- **index.js**: Main bot file with 45+ slash commands + event handlers + prefix commands
- **server.js**: Express web server for keeping bot alive on Replit
- **src/database.js**: SQLite database with:
  - Guild configuration (automod, lgbl, anti-spam, auto-role)
  - Anti-spam tracking and settings
  - Auto-role settings per guild
  - Warning system, Case management, Anti-nuke/raid settings
  - Join logs, moderation logs
- **src/services/automod.js**: Translation-based content filtering
- **src/services/language-guardian.js**: Multilingual bad word detection
- **src/services/translation.js**: LibreTranslate API integration
- **src/utils/logger.js**: Moderation action logging
- **data/blacklist.json**: Customizable blacklist words
- **data/strikes.json**: User strike tracking per guild
- **package.json**: Dependencies (discord.js, express, better-sqlite3, etc.)

## Commands (44 Total)

### Moderation (7 commands)
- `/kick`, `/ban`, `/mute`, `/warn`, `/unwarn`, `/unban`, `/unmute`

### Role Management (4 commands)
- `/add-role`, `/remove-role`, `/nick`, `/change-role-name`

### Information (8 commands)
- `/warns`, `/server-timeout-status`, `/case`, `/cases`, `/user-info`, `/server-info`, `/ban-list`, `/help`

### Automod (5 commands)
- `/set-channel`, `/enable-automod`, `/disable-automod`, `/enable-language-guardian`, `/disable-language-guardian`, `/lgbl`

### Language Guardian - LGBL (3 commands)
- `/lgbl add`, `/lgbl remove`, `/lgbl list`

### Utilities (5 commands)
- `/purge`, `/say`, `/lock`, `/unlock`, `/set-prefix`

### Protection (5 commands)
- `/setup-anti-nuke`, `/setup-anti-raid`, `/enable-anti-spam`, `/disable-anti-spam`, `/setup-anti-spam`

### Auto-Role (2 commands)
- `/set-auto-role`, `/remove-auto-role`

## Features
✅ **Anti-Spam**: Tracks rapid messages, auto-mutes spammers
✅ **Auto-Role**: Assigns roles to new members automatically
✅ **Case Management**: Sapphire-style case system with interactive buttons
✅ **Language Guardian**: Multilingual bad word detection with auto-translation
✅ **LGBL**: Manage blacklist words in any language
✅ **Custom Prefixes**: Per-server custom prefixes with 30-day cooldown
✅ **Comprehensive Info Commands**: Wick-style detailed user/server/ban information
✅ **Full Moderation Suite**: Kick, ban, mute, warn, case management
✅ **Anti-Nuke & Anti-Raid**: Advanced protection systems

## Configuration
- Bot token: DISCORD_BOT_TOKEN (environment variable)
- Customizable via commands: Anti-spam thresholds, auto-role, custom prefix
- Environment variables: STRIKE_LIMIT, TIMEOUT_SECONDS, MOD_LOG_CHANNEL

## Database Schema
- Cases (per-server auto-incrementing IDs)
- Warnings (manual warnings only)
- Anti-Spam (settings + real-time tracking)
- Auto-Role (role assignment settings)
- Anti-Nuke/Raid settings
- User strikes tracking
- Join and moderation logs

## User Preferences
- Sapphire bot-style embeds (blurple #5865F2)
- Hyphenated command names
- Interactive case management with buttons
- Pagination on all list commands (10 per page)
- Real-time spam detection and blocking
- Automatic role assignment on member join
- 24/7 uptime on Replit

## Deployment
For true 24/7 uptime, deploy using Replit's Reserved VM option. Currently running on workflow.
