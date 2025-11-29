# Discord Bot Host

## Overview
This project hosts a comprehensive Discord moderation bot on Replit, running 24/7. The bot features complete moderation tools, role management, advanced protection systems (anti-nuke, anti-raid, anti-spam), auto-role assignment, intelligent automod system with translation support, and Language Guardian system that detects bad words from all languages with auto-translation. **All settings are fully customizable by admins via commands.**

## Recent Changes
- **November 29, 2025**: Full Admin Customization
  - **Anti-Spam Customization**: `/setup-anti-spam` now lets admins set:
    - Max messages (2-10)
    - Time window (5-60 seconds)
    - **Mute duration (1-60 minutes)** - NEW!
  - **Language Guardian Customization**: NEW `/setup-language-guardian` command
    - Strike limit (1-10 strikes)
    - Timeout duration (1-60 minutes)
  - All settings stored per-guild in database

- **November 29, 2025**: Anti-Spam + Auto-Role + Enhanced Protection
  - Anti-Spam System with real-time tracking
  - Auto-Role System with automatic assignment on join
  - Enhanced info commands with Wick-style display

## Project Architecture
- **index.js**: 46+ slash commands + event handlers + prefix commands
- **server.js**: Express web server for Replit uptime
- **src/database.js**: SQLite database with:
  - Guild configuration (automod, lgbl, anti-spam, auto-role, language guardian)
  - Anti-spam tracking and customizable settings
  - Auto-role settings per guild
  - **Language Guardian config (strike limit, timeout)** - NEW!
  - Warning system, Case management, Anti-nuke/raid settings
  - Join logs, moderation logs
- **src/services/**: Automod, Language Guardian, Translation, Logger utilities
- **data/**: Blacklist words and user strikes storage

## Commands (46 Total)

### Moderation (7)
- `/kick`, `/ban`, `/mute`, `/warn`, `/unwarn`, `/unban`, `/unmute`

### Role Management (4)
- `/add-role`, `/remove-role`, `/nick`, `/change-role-name`

### Information (8)
- `/warns`, `/server-timeout-status`, `/case`, `/cases`, `/user-info`, `/server-info`, `/ban-list`, `/help`

### Automod (5)
- `/set-channel`, `/enable-automod`, `/disable-automod`, `/enable-language-guardian`, `/disable-language-guardian`, `/lgbl`

### Language Guardian - LGBL (3)
- `/lgbl add`, `/lgbl remove`, `/lgbl list`

### Utilities (5)
- `/purge`, `/say`, `/lock`, `/unlock`, `/set-prefix`

### Protection & Configuration (7)
- `/setup-anti-nuke`, `/setup-anti-raid`
- `/enable-anti-spam`, `/disable-anti-spam`, `/setup-anti-spam` *(customizable)*
- `/set-auto-role`, `/remove-auto-role`
- **`/setup-language-guardian`** *(customizable)* - NEW!

## All Admin-Customizable Settings

### Anti-Spam (per-guild)
- **Max messages**: 2-10 messages
- **Time window**: 5-60 seconds
- **Mute duration**: 1-60 minutes

### Language Guardian (per-guild)
- **Strike limit**: 1-10 strikes
- **Timeout duration**: 1-60 minutes

### Auto-Role (per-guild)
- **Role to assign**: Any server role

### Custom Prefix (per-guild)
- **Prefix**: 1-3 characters (letters, numbers, special chars)
- **Cooldown**: 30 days between changes

### Anti-Nuke/Raid (per-guild)
- **Configurable thresholds**: Detection limits
- **Action type**: Ban or kick

## Features
✅ **100% Admin Customizable** - All protection settings via commands
✅ **Anti-Spam** - Customizable message tracking and mute duration
✅ **Auto-Role** - Automatic role assignment on member join
✅ **Case Management** - Sapphire-style with interactive buttons
✅ **Language Guardian** - Multilingual with customizable strikes/timeout
✅ **LGBL** - Blacklist management in any language
✅ **Custom Prefixes** - Per-server with cooldown
✅ **Comprehensive Info** - Wick-style user/server/ban details
✅ **Full Moderation** - Complete moderation suite
✅ **Advanced Protection** - Anti-nuke, anti-raid, anti-spam

## Configuration
- Bot token: DISCORD_BOT_TOKEN (environment variable)
- All settings customizable via slash commands (per-guild)
- Admin-only configuration commands
- SQLite database for persistent storage

## User Preferences
- Sapphire bot-style embeds (blurple #5865F2)
- Hyphenated command names
- Interactive case management
- Pagination (10 per page)
- Real-time spam detection
- Automatic role assignment
- 24/7 uptime on Replit
- Full admin customization capability

## Deployment
For 24/7 uptime, use Replit's Reserved VM deployment option. Currently running on workflow.
