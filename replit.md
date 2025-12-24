# Discord Bot Host

## Overview
This project hosts a comprehensive Discord moderation bot on Replit, running 24/7. The bot features complete moderation tools, role management, advanced protection systems (anti-nuke, anti-raid, anti-spam), auto-role assignment, intelligent automod system with translation support, Language Guardian system that detects bad words from all languages with auto-translation, and Discord invite detection. **All settings are fully customizable by admins via commands with Sapphire-style buttons.**

## Recent Changes
- **December 2, 2025**: Fixed Port Conflict Crashes + 24/7 Stability (LATEST!)
  - **Root Cause Fixed**: Removed duplicate server startup that was causing port 5000 conflicts
  - **Process Manager Simplified**: Bot and server now managed cleanly by start.js without conflicts
  - **Stable 24/7 Uptime**: No more HTTP 503 crashes from port conflicts
  - **Clean Shutdown/Restart**: Aggressive port cleanup prevents zombie processes

- **December 1, 2025**: Fixed Command Registration + Process Manager Stability
  - **Fixed Command Registration Hang**: Removed cache clearing delay that was causing Discord command registration timeouts
  - **Improved Process Manager**: Triple port cleanup + server startup retry logic (up to 3 attempts)
  - **Better Crash Recovery**: Added aggressive port cleanup with `fuser` + `pkill` to prevent zombie processes
  - **46 Slash Commands**: All commands now register cleanly and consistently
  - **24/7 Uptime**: Bot auto-recovers from crashes within 5 seconds with no manual intervention

- **November 30, 2025**: Pageable Help + Detailed Command Assistance + Customizable LG Actions
  - **Pageable `/help` Command**: Shows 10 commands per page with Next/Previous buttons
    - Navigate through all 46+ commands easily
    - Page indicator (e.g., "Page 1/5")
  - **`/help-command <name>` Command**: Detailed help for specific commands
    - Shows usage, examples, permissions, and notes
    - 10 featured commands with full details (kick, ban, mute, warn, suspend, add-role, purge, setup-language-guardian, server-config, server-report)
    - Users can understand exactly how to use each command
  - **Language Guardian Customizable Actions**: Admin can choose action when strikes hit limit
    - Options: Mute (default), Kick, Ban, or Suspend
    - `/setup-language-guardian strike_limit:3 timeout_minutes:10 action:ban`
    - Strikes automatically reset after action taken
  - **Prune Command Added**: Now documented in utilities section

- **November 29, 2025**: Prefix Commands Enhanced + Admin-Only Suspend (LATEST!)
  - **Multi-Word Prefix Commands**: All commands now work with spaces instead of hyphens
    - `=set prefix` works the same as `=set-prefix`
    - `=add role` works the same as `=add-role`
    - Works for ALL hyphenated commands!
  - **Suspend Commands - Admin Only**: Only users with roles ABOVE bot can use
    - `=suspend @user reason` (or `/suspend`)
    - `=unsuspend @user` (or `/unsuspend`)
    - `=suspended-list` (or `/suspended-list`)
    - Short aliases: `=sus`, `=unsus`, `=susl`
  - **Automod Fixes**: Prefix commands fixed to only check non-command messages
  - **Crash Prevention**: Added auto-reconnect + error handlers for 24/7 stability
  - **Prefix Commands**: Fixed blacklist commands to use per-guild database

- **November 29, 2025**: Wick-Style Suspend System
  - **`/suspend` Command** - Suspend users by removing all roles
    - Removes all roles and assigns "⛔ Suspended" role
    - Stores previous roles for restoration
    - Only for roles ABOVE bot's highest role
    - Optional reason/comment
  - **`/unsuspend` Command** - Instantly restore suspended users
    - Restores all previous roles
    - Only for roles ABOVE bot
  - **`/suspended-list` Command** - View all suspended users with reasons and time
  - **Database Tracking**: Stores suspension history and previous roles per user

- **November 29, 2025**: Server Report & Selective Undo
  - **`/server-report` Command** - Fast attack recovery tool
    - Time-range inputs: FROM (hour:minute AM/PM) TO (hour:minute AM/PM)
    - Fetches Discord audit logs for selected time range
    - **4 Categorized Views:**
      - 📁 **Category 1: Channel Events** (create, delete, edit)
      - 🔰 **Category 2: Role Events** (create, delete, edit)
      - 👥 **Category 3: Member Events** (kicks, bans, timeouts)
      - 💬 **Category 4: Message Events** (purges, deletes)
    - **Select Menus**: Choose which events to undo from each category
    - **Undo Button**: ⏮️ Instantly restore selected events (delete created channels/roles, etc.)
    - **Role Hierarchy Check**: Only roles ABOVE bot can use
  - Example: After nuke, run `/server-report 2:30 PM 3:45 PM`, select deleted channels/roles, hit undo

- **November 29, 2025**: Per-System Whitelist Bypass Configuration
  - **Customizable Whitelist**: Higher roles can enable/disable whitelist bypass per protection system
    - `/server-config` - Open admin config panel (only for roles ABOVE bot)
    - Toggle buttons: Anti-Spam, Language Guardian, Anti-Nuke, Anti-Raid
    - Each system independently configured (✅ BYPASS or ❌ NO BYPASS)
    - Example: Allow whitelist bypass for anti-spam but NOT for anti-nuke
  - **Role Hierarchy Check**: Commands restricted to users with roles above bot's highest role
  - **Full Per-System Control**: Admins decide exactly which protections respect whitelist

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

## Commands (53 Total)

### Moderation (10)
- `/kick`, `/ban`, `/mute`, `/warn`, `/unwarn`, `/unban`, `/unmute`
- `/suspend` *(NEW - suspend user, only roles above bot)*
- `/unsuspend` *(NEW - restore suspended user)*
- `/suspended-list` *(NEW - view all suspended users)*

### Role Management (4)
- `/add-role`, `/remove-role`, `/nick`, `/change-role-name`

### Information (8)
- `/warns`, `/server-timeout-status`, `/case`, `/cases`, `/user-info`, `/server-info`, `/ban-list`, `/help`
- All include Sapphire buttons for quick access to details

### Automod (5)
- `/set-channel`, `/enable-automod`, `/disable-automod`, `/enable-language-guardian`, `/disable-language-guardian`, `/lgbl`

### Language Guardian - LGBL (3)
- `/lgbl add`, `/lgbl remove`, `/lgbl list`

### Utilities (6)
- `/purge`, `/say`, `/lock`, `/unlock`, `/set-prefix`, `/help-command`

### Protection & Configuration (9)
- `/setup-anti-nuke`, `/setup-anti-raid`
- `/enable-anti-spam`, `/disable-anti-spam`, `/setup-anti-spam` *(with buttons)*
- `/set-auto-role`, `/remove-auto-role`
- `/setup-language-guardian` *(with buttons)*
- `/server-config` *(role hierarchy check, 4 toggle buttons)*
- `/server-report` *(NEW - time-range audit logs + selective undo)*
- `/whitelist add`, `/whitelist remove`, `/whitelist list`

## All Admin-Customizable Settings (Per-Guild)

### Whitelist Bypass Configuration (NEW!)
- **Anti-Spam Bypass**: ✅ Enable or ❌ Disable whitelist bypass
- **Language Guardian Bypass**: ✅ Enable or ❌ Disable whitelist bypass
- **Anti-Nuke Bypass**: ✅ Enable or ❌ Disable whitelist bypass
- **Anti-Raid Bypass**: ✅ Enable or ❌ Disable whitelist bypass
- **Access**: Only users with roles ABOVE bot's highest role
- **Method**: `/server-config` command with 4 toggle buttons
- Example: Allow admin whitelist bypass for anti-spam, but enforce anti-nuke on everyone

### Whitelist Management
- `/whitelist add` - Add role or member
- `/whitelist remove` - Remove role or member
- `/whitelist list` - View all whitelisted (with buttons to remove)
- Access: Administrator permission required

### Anti-Spam
- Max messages: 2-10
- Time window: 5-60 seconds
- Mute duration: 1-60 minutes
- Buttons: View Settings, Disable
- Respects whitelist bypass setting from `/server-config`

### Language Guardian
- Strike limit: 1-10 strikes
- Timeout duration: 1-60 minutes
- Buttons: View Settings, Disable
- Respects whitelist bypass setting from `/server-config`

### Auto-Role
- Any server role can be auto-assigned on join
- Buttons: View Setting, Remove

### Custom Prefix
- 1-3 characters (letters, numbers, special chars)
- 30-day cooldown between changes

### Anti-Nuke/Raid
- Configurable thresholds
- Separate setup commands
- Respects whitelist bypass settings

## Features
✅ **Wick Suspend System** - Suspend users with instant restore capability (NEW!)
✅ **Server Report & Undo** - Time-range audit logs with selective undo for fast attack recovery
✅ **Per-System Whitelist Configuration** - Enable/disable bypass per protection system
✅ **Role Hierarchy Protection** - Only super-admin roles can configure advanced settings
✅ **100% Admin Customizable** - All protection settings via slash commands
✅ **Whitelist System** - Role & member exemption with granular per-system control
✅ **Discord Invite Detection** - Auto-deletes discord.gg/ and discordapp.com/invite/ links
✅ **Anti-Spam** - Customizable message tracking with auto-mute
✅ **Auto-Role** - Automatic role assignment on member join
✅ **Case Management** - Sapphire-style with interactive buttons
✅ **Language Guardian** - Multilingual bad word detection with customizable strikes/timeout/action (mute, kick, ban, suspend)
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
- **Role Hierarchy Protection**: Only roles ABOVE bot can use advanced admin commands
  - `/server-config` (per-system whitelist bypass)
  - `/server-report` (audit logs + selective undo)
  - `/suspend` (suspend users instantly)
  - `/unsuspend` (restore suspended users)

## Deployment

### Option 1: Replit (Current)
✅ **Reserved VM Deployment Configured** (December 2, 2025)
- **Deployment target:** VM (always-on, never sleeps)
- **Run command:** `node start.js` (process manager with auto-recovery)
- **Process Manager (start.js):** Monitors & auto-restarts both server + bot
- **Server (port 5000):** UptimeRobot pings every 5 minutes
- **Bot (index.js):** Stays connected to Discord 24/7
- **Crash Recovery:** Automatic restart within 5 seconds if either process fails
- **Status:** 🚀 **True 24/7 uptime with auto-recovery enabled!**

### Option 2: Railway (Ready to Deploy)
🚀 **Railway Deployment Prepared** (December 2, 2025)
- **railway.json**: Configured with NIXPACKS builder
- **.env.example**: Template for all required variables
- **package.json**: Updated to use `node start.js` start command
- **server.js**: Now respects PORT environment variable (Railway assigns dynamically)
- **Deployment Guide**: See RAILWAY_DEPLOYMENT.md for complete setup instructions
- **Status:** Ready to deploy! Just push to GitHub → Connect Railway → Set env vars
- **See**: RAILWAY_DEPLOYMENT.md for step-by-step instructions

## Future Enhancement Opportunities (Autonomous Mode)
- AI content detection (toxicity, harassment, NSFW, threats, spam)
- Image NSFW detection
- Pattern detection (rapid messages, repeated text, ghost pings)
- Customizable alert notifications (DM or channel)
