# Discord Bot Host

## Overview
This project hosts a comprehensive Discord moderation bot on Replit, running 24/7. The bot features complete moderation tools, role management, advanced protection systems (anti-nuke and anti-raid), an intelligent automod system with translation support, and a new Language Guardian system that detects bad words from all languages with auto-translation.

## Recent Changes
- **November 29, 2025**: Per-server custom prefix + Language Guardian + Smart Mention Handler
  - Added `/set-prefix` command for per-server custom prefixes (1-3 characters: letters, numbers, or special chars from #$_-+/*:!?~=\)
  - Examples: `=`, `$`, `mod`, `!a`, `k!`, `admin`
  - 30-day cooldown: Once set, prefix can't be changed for 30 days (private error message shows remaining days)
  - Prefix settings saved per guild in database with timestamp tracking
  - Falls back to default `!` if no custom prefix set
  - Smart mention handler: Bot replies when mentioned with welcome message
  - **Language Guardian & Automod: TWO SEPARATE SYSTEMS**
    - **Language Guardian**: Multilingual bad word detection with automatic translation (enable/disable with `/enable-language-guardian` and `/disable-language-guardian`)
    - **LGBL (Language Guardian Blacklist Library)**: Manage blacklisted words via `/lgbl add/remove/list` (works in any language!)
    - **Automod**: Traditional translation-based content filtering (enable with `/enable-automod`)
  - Admins can add/remove custom words via `/lgbl add/remove/list` or `!blacklist add/remove/list`
  - Works with BOTH slash commands AND prefix commands (custom prefixes fully supported)
  - Detects blacklisted words from any language (translates to English automatically)
  - Strike system: 3 strikes = automatic timeout (configurable via env vars)
  - Prefix commands: `!blacklist add/remove/list` and `!purgebad` work on any prefix
  - Real-time message filtering on all non-command messages when enabled
  - Customizable strike limit (STRIKE_LIMIT env var) and timeout duration (TIMEOUT_SECONDS env var)
  - Optional moderation log channel for all violations (MOD_LOG_CHANNEL env var)
  
- **November 28, 2025**: Complete case system with interactive management
  - Implemented Sapphire-style case system with unique per-server case IDs
  - All moderation commands automatically create cases
  - Added `/case <case_id>` and `/cases [user]` with pagination and buttons
  - Interactive buttons: Close, Edit, Delete with full modal editing
  - Case management requires proper permissions (Moderator/Admin)

## Project Architecture
- **index.js**: Main bot file with all command handlers and event listeners (30 slash commands + prefix commands)
- **server.js**: Express web server for keeping bot alive on Replit
- **src/database.js**: SQLite database with:
  - Guild configuration (automod, log channels)
  - Warning system (manual warnings only, marked with is_manual flag)
  - Case management system (auto-incrementing per-server case IDs)
  - Anti-nuke and anti-raid settings
  - Join and moderation logs
- **src/services/automod.js**: Translation-based content filtering
- **src/services/language-guardian.js**: Multilingual bad word detection with translation
- **src/services/translation.js**: LibreTranslate API integration
- **src/utils/logger.js**: Moderation action logging
- **data/blacklist.json**: Customizable blacklist words (persistent storage)
- **data/strikes.json**: User strike tracking per guild
- **package.json**: Dependencies (discord.js, express, better-sqlite3, axios, dotenv, translate-google, fs-extra)

## Commands (35 Total)

### Moderation (7 commands)
- `/kick` - Kick member with reason (creates case)
- `/ban` - Ban member with reason (creates case)
- `/mute` - Timeout member with duration (creates case)
- `/warn` - Warn member (manual warnings only, creates case)
- `/unwarn` - Remove specific warning
- `/unban` - Unban user by ID (creates case)
- `/unmute` - Remove timeout (creates case)

### Role Management (4 commands)
- `/add-role` - Add role to user
- `/remove-role` - Remove role from user
- `/nick` - Change user nickname
- `/change-role-name` - Rename a role

### Information (5 commands)
- `/warns` - Show manual warnings for user (excludes automod)
- `/server-timeout-status` - List all timed-out members
- `/case <id>` - View case with buttons: Close, Edit, Delete
- `/cases [user]` - View case history with pagination (10 per page)
- `/help` - Show all commands

### Automod (2 commands)
- `/set-channel` - Set moderation log channel
- `/enable-automod` - Enable translation-based content filter
- `/disable-automod` - Disable automod

### Language Guardian (2 commands)
- `/enable-language-guardian` - Enable Language Guardian
- `/disable-language-guardian` - Disable Language Guardian

### LGBL - Language Guardian Blacklist Library (3 commands)
- `/lgbl add` - Add word to blacklist (works in any language!)
- `/lgbl remove` - Remove word from blacklist
- `/lgbl list` - List all blacklisted words

### Utilities (5)
- `/purge` - Delete messages (1-100)
- `/say` - Make bot send a message
- `/lock` - Lock channel (prevent messages)
- `/unlock` - Unlock channel (allow messages)
- `/set-prefix` - Set custom server prefix (one special char #$_-+/*:!?~=\ + optional letters)

### Protection (2 commands)
- `/setup-anti-nuke` - Enable anti-nuke with default settings
- `/setup-anti-raid` - Enable anti-raid with default settings

### Prefix Commands & Aliases
- All commands support short aliases: `k` (kick), `b` (ban), `m` (mute), `um` (unmute), `ub` (unban), `w` (warn), `uw` (unwarn), `p` (purge), `l` (lock), `ul` (unlock), `sp` (set-prefix)
- `!blacklist <add/remove/list> [word]` - Manage LGBL (Admin only)
- `!purgebad [limit]` - Delete bad messages from channel (Admin only)
- Smart error handling: Typos show suggestions (private to user)

**Automatic Message Monitoring:**
- **Language Guardian**: Scans all non-command messages for blacklisted words with automatic translation and strike system
  - Enable/disable with `/enable-language-guardian` and `/disable-language-guardian`
  - **LGBL** commands: `/lgbl add/remove/list` to manage blacklisted words
  - Multi-language support (translates to English automatically)
  - Works on any server prefix (default `!` or custom prefixes)
  - 3 strikes system with configurable timeout
  - Optional moderation log channel
- **Automod**: Traditional translation-based content filtering
  - Enable/disable with `/enable-automod` and `/disable-automod`
  - Works on prefix commands only
  - Logs all violations

## Configuration
- Bot token stored in DISCORD_BOT_TOKEN environment variable
- Web server runs on port 5000 for Replit compatibility
- Embeds styled with Sapphire bot theme (blurple #5865F2)
- SQLite database for persistent storage
- Custom prefix validation: 1-3 characters (any combination of letters, numbers, or special chars from #$_-+/*:!?~=\)

## Database Schema Features
- **Cases**: Full case management system with Sapphire-style features
  - Per-server auto-incrementing case IDs (Case #1, #2, #3, etc.)
  - Records: action, user, moderator, reason, duration, status, timestamp
  - Status options: active, closed, resolved
  - Edit functionality to modify action, reason, duration, status
  - Delete functionality with Admin permissions
  - Close functionality with Moderator permissions
- **Warnings**: Manual mod warnings only (automod violations excluded)
- **Anti-Nuke**: Tracks channel/role deletions and bans with configurable thresholds
- **Anti-Raid**: Tracks member joins with configurable time windows
- **Join Logs**: Historical join tracking for raid detection
- **Moderation Logs**: All moderation action audit trail

## User Preferences
- Sapphire bot-style embed design (blurple theme #5865F2)
- Hyphenated command names (add-role vs addrole)
- Interactive case management with buttons and modals
- Pagination system for case history (10 per page)
- Full case editing capability for moderators
- Manual warnings separate from automod violations
- 24/7 uptime on Replit platform
- Comprehensive protection systems (anti-nuke, anti-raid)

## Deployment
For true 24/7 uptime, deploy using Replit's Reserved VM deployment option. Currently running on workflow (may restart).
