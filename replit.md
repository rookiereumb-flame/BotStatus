# Discord Bot Host

## Overview
This project hosts a comprehensive Discord moderation bot on Replit, running 24/7. The bot features complete moderation tools, role management, advanced protection systems (anti-nuke, anti-raid, anti-spam), auto-role assignment, intelligent automod system with translation support, Language Guardian system that detects bad words from all languages with auto-translation, and Discord invite detection. **All settings are fully customizable by admins via commands with Sapphire-style buttons.**

## Recent Changes
- **November 29, 2025**: Discord Invite Detection + Full Admin Customization
  - **Discord Invite Detection**: Auto-detects `discord.gg/` and `discordapp.com/invite/` links
    - Automatically deletes invite messages
    - Issues warning to user
    - Works on all prefixes (default & custom)
  - **Full Admin Customization**: All systems now customizable per-guild via commands
    - Anti-Spam: `/setup-anti-spam` (max messages, time window, mute duration)
    - Language Guardian: `/setup-language-guardian` (strike limit, timeout)
    - Auto-Role: `/set-auto-role` (choose any role)
  - **Sapphire Buttons**: All config commands have view/disable buttons
  
- **November 29, 2025**: Anti-Spam + Auto-Role + Enhanced Protection
  - Anti-Spam System with real-time tracking and customizable mute duration
  - Auto-Role System with automatic assignment on member join
  - Enhanced info commands with Wick-style display and interactive buttons

## Project Architecture
- **index.js**: 46+ slash commands + event handlers + prefix commands (2100+ lines)
- **server.js**: Express web server for Replit uptime
- **src/database.js**: SQLite database with guild configurations per setting
- **src/services/**: Automod, Language Guardian, Translation, Logger utilities
- **data/**: Blacklist words and user strikes storage

## Commands (46 Total)

### Moderation (7)
- `/kick`, `/ban`, `/mute`, `/warn`, `/unwarn`, `/unban`, `/unmute`

### Role Management (4)
- `/add-role`, `/remove-role`, `/nick`, `/change-role-name`

### Information (8)
- `/warns`, `/server-timeout-status`, `/case`, `/cases`, `/user-info`, `/server-info`, `/ban-list`, `/help`
- All include Sapphire buttons for quick access to details

### Automod (5)
- `/set-channel`, `/enable-automod`, `/disable-automod`, `/enable-language-guardian`, `/disable-language-guardian`, `/lgbl`

### Language Guardian - LGBL (3)
- `/lgbl add`, `/lgbl remove`, `/lgbl list`

### Utilities (5)
- `/purge`, `/say`, `/lock`, `/unlock`, `/set-prefix`

### Protection & Configuration (7)
- `/setup-anti-nuke`, `/setup-anti-raid`
- `/enable-anti-spam`, `/disable-anti-spam`, `/setup-anti-spam` *(with buttons)*
- `/set-auto-role`, `/remove-auto-role`
- `/setup-language-guardian` *(with buttons)*

## All Admin-Customizable Settings (Per-Guild)

### Anti-Spam
- Max messages: 2-10
- Time window: 5-60 seconds
- Mute duration: 1-60 minutes
- Buttons: View Settings, Disable

### Language Guardian
- Strike limit: 1-10 strikes
- Timeout duration: 1-60 minutes
- Buttons: View Settings, Disable

### Auto-Role
- Any server role can be auto-assigned on join
- Buttons: View Setting, Remove

### Custom Prefix
- 1-3 characters (letters, numbers, special chars)
- 30-day cooldown between changes

### Anti-Nuke/Raid
- Configurable thresholds
- Separate setup commands

## Features
✅ **100% Admin Customizable** - All protection settings via slash commands
✅ **Discord Invite Detection** - Auto-deletes discord.gg/ and discordapp.com/invite/ links
✅ **Anti-Spam** - Customizable message tracking with auto-mute
✅ **Auto-Role** - Automatic role assignment on member join
✅ **Case Management** - Sapphire-style with interactive buttons
✅ **Language Guardian** - Multilingual bad word detection with customizable strikes/timeout
✅ **LGBL** - Blacklist management in any language
✅ **Custom Prefixes** - Per-server with 30-day cooldown
✅ **Comprehensive Info** - Wick-style user/server/ban details with buttons
✅ **Full Moderation** - Complete moderation suite
✅ **Advanced Protection** - Anti-nuke, anti-raid, anti-spam with real-time tracking
✅ **Sapphire UI** - Professional buttons on all config & info commands

## Configuration
- Bot token: DISCORD_BOT_TOKEN (environment variable)
- All settings customizable via slash commands (per-guild)
- Admin-only configuration commands
- SQLite database for persistent storage
- All embeds use Sapphire theme (blurple #5865F2)

## User Preferences
- Sapphire bot-style embeds and buttons
- Hyphenated command names
- Interactive case management
- Pagination on all list commands (10 per page)
- Real-time protection (spam, invites, bad words)
- Automatic role assignment on join
- 24/7 uptime on Replit
- Full admin customization via commands and buttons

## Deployment
For true 24/7 uptime, deploy using Replit's Reserved VM option. Currently running on workflow.

## Future Enhancement Opportunities (Autonomous Mode)
- AI content detection (toxicity, harassment, NSFW, threats, spam)
- Image NSFW detection
- Pattern detection (rapid messages, repeated text, ghost pings)
- Customizable alert notifications (DM or channel)
