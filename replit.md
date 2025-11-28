# Discord Bot Host

## Overview
This project hosts a comprehensive Discord moderation bot on Replit, running 24/7. The bot features complete moderation tools, role management, advanced protection systems (anti-nuke and anti-raid), and an intelligent automod system with translation support.

## Recent Changes
- **November 28, 2025**: Major feature expansion
  - Added 6 new commands: say, change-role-name, lock, unlock, setup-anti-nuke, setup-anti-raid
  - Implemented Sapphire bot-style embeds (blurple color #5865F2)
  - Added anti-nuke and anti-raid database schemas for server protection
  - Separated manual warnings from automod violations in the database (is_manual flag)
  - Updated all command names to use hyphenated format (add-role, remove-role, etc.)
  - Removed automod violations from warning records (only manual mod warnings count)

## Project Architecture
- **index.js**: Main bot file with all command handlers (26 total commands)
- **server.js**: Express web server for keeping bot alive on Replit
- **src/database.js**: SQLite database with:
  - Guild configuration (automod, log channels)
  - Warning system (manual warnings only, marked with is_manual flag)
  - Blacklist words for automod
  - Anti-nuke and anti-raid settings
  - Join and moderation logs
- **src/services/automod.js**: Translation-based content filtering
- **src/services/translation.js**: LibreTranslate API integration
- **src/utils/logger.js**: Moderation action logging
- **package.json**: Dependencies (discord.js, express, better-sqlite3, axios, dotenv)

## Commands (26 Total)

### Moderation (7)
- `/kick` - Kick member with reason
- `/ban` - Ban member with reason
- `/mute` - Timeout member with duration
- `/warn` - Warn member (manual warnings only)
- `/unwarn` - Remove specific warning
- `/unban` - Unban user by ID
- `/unmute` - Remove timeout

### Role Management (4)
- `/add-role` - Add role to user
- `/remove-role` - Remove role from user
- `/nick` - Change user nickname
- `/change-role-name` - Rename a role

### Information (3)
- `/warns` - Show manual warnings for user (excludes automod)
- `/server-timeout-status` - List all timed-out members
- `/help` - Show all commands

### Automod (6)
- `/set-channel` - Set moderation log channel
- `/enable-automod` - Enable translation-based content filter
- `/disable-automod` - Disable automod
- `/add-blacklist-word` - Add word to blacklist
- `/remove-blacklist-word` - Remove word from blacklist
- `/blacklist-library` - View all blacklisted words

### Utilities (3)
- `/purge` - Delete messages (1-100)
- `/say` - Make bot send a message
- `/lock` - Lock channel (prevent messages)
- `/unlock` - Unlock channel (allow messages)

### Protection (2)
- `/setup-anti-nuke` - Enable anti-nuke with default settings
- `/setup-anti-raid` - Enable anti-raid with default settings

### Prefix Commands
All commands support `n?` prefix format for text commands

## Configuration
- Bot token stored in DISCORD_BOT_TOKEN environment variable
- Web server runs on port 5000 for Replit compatibility
- Embeds styled with Sapphire bot theme (blurple #5865F2)
- SQLite database for persistent storage

## Database Schema Features
- **Warnings**: Manual mod warnings only (automod violations excluded)
- **Anti-Nuke**: Tracks channel/role deletions and bans with configurable thresholds
- **Anti-Raid**: Tracks member joins with configurable time windows
- **Join Logs**: Historical join tracking for raid detection
- **Moderation Logs**: All moderation action audit trail

## User Preferences
- Sapphire bot-style embed design (blurple theme)
- Hyphenated command names (add-role vs addrole)
- Manual warnings separate from automod violations
- 24/7 uptime on Replit platform
- Comprehensive protection systems (anti-nuke, anti-raid)

## Deployment
For true 24/7 uptime, deploy using Replit's Reserved VM deployment option. Currently running on workflow (may restart).
