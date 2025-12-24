# 🤖 Daddy USSR Bot - Complete Features & Commands Guide

**46 Slash Commands + Prefix Commands Available**

---

## 📋 MODERATION COMMANDS (10)

### `/kick` - Remove a member from server
- **Usage**: `/kick @user [reason]`
- **What it does**: Removes user from the server temporarily (they can rejoin)
- **Features**: 
  - Optional reason tracking
  - Logged to moderation channel
  - Creates case entry

### `/ban` - Permanently ban a member
- **Usage**: `/ban @user [reason]`
- **What it does**: Permanently bans user from the server
- **Features**:
  - Optional reason tracking
  - Logged to moderation channel
  - Creates case entry
  - User cannot rejoin without unban

### `/unban` - Remove a ban
- **Usage**: `/unban <user_id> [reason]`
- **What it does**: Unbans a previously banned user
- **Features**:
  - Requires user ID (use `/ban-list` to find)
  - Optional reason
  - Logged to moderation channel

### `/mute` - Timeout a member
- **Usage**: `/mute @user <duration> <unit> [reason]`
- **What it does**: Temporarily silences user (Discord timeout)
- **Options**:
  - Duration: Any number (e.g., 5)
  - Unit: Minutes (m), Hours (h), Days (d), Weeks (w), Years (y)
- **Features**:
  - User cannot send messages during timeout
  - Auto-unmutes after duration
  - Logged to moderation channel

### `/unmute` - Remove timeout
- **Usage**: `/unmute @user [reason]`
- **What it does**: Removes active timeout from user
- **Features**:
  - User can immediately send messages again
  - Logged to moderation channel

### `/warn` - Issue a warning
- **Usage**: `/warn @user [reason]`
- **What it does**: Warns user about behavior
- **Features**:
  - Tracks all warnings per user
  - Logged to moderation channel
  - Can accumulate (use `/warns` to see)
  - Works with Language Guardian strikes

### `/unwarn` - Remove a warning
- **Usage**: `/unwarn @user <warning_number>`
- **What it does**: Removes specific warning from user
- **Features**:
  - View all warnings with `/warns`
  - Can remove individual warnings
  - Logged to moderation channel

### `/suspend` - Wick-style suspend (NEW!)
- **Usage**: `/suspend @user [reason]`
- **What it does**: Removes ALL roles from user, assigns "⛔ Suspended" role
- **Features**:
  - User cannot participate in server
  - Previous roles stored for restoration
  - Optional reason/comment
  - Instant restoration with `/unsuspend`
  - Only for roles ABOVE bot

### `/unsuspend` - Restore suspended user
- **Usage**: `/unsuspend @user`
- **What it does**: Instantly restores all previous roles
- **Features**:
  - Automatically recovers suspended users
  - Only for roles ABOVE bot

### `/suspended-list` - View suspended users
- **Usage**: `/suspended-list`
- **What it does**: Shows all currently suspended users
- **Features**:
  - Displays reasons and suspension time
  - Shows how long they've been suspended
  - Interactive buttons for quick unsuspend

---

## 👥 ROLE MANAGEMENT COMMANDS (4)

### `/add-role` - Add role to user
- **Usage**: `/add-role @user <role>`
- **What it does**: Gives user a specific role
- **Features**:
  - Can add any role
  - Works with role picker
  - Logged to moderation channel

### `/remove-role` - Remove role from user
- **Usage**: `/remove-role @user <role>`
- **What it does**: Takes away specific role from user
- **Features**:
  - Select from available roles
  - Logged to moderation channel

### `/nick` - Change user's nickname
- **Usage**: `/nick @user [nickname]`
- **What it does**: Sets custom nickname for user
- **Features**:
  - Can reset nickname (leave empty)
  - Shows in member list

### `/change-role-name` - Rename a role
- **Usage**: `/change-role-name <role> <newname>`
- **What it does**: Changes the name of a role
- **Features**:
  - Useful for organizing roles
  - Instant name change

---

## ℹ️ INFORMATION COMMANDS (8)

### `/warns` - Check user warnings
- **Usage**: `/warns @user`
- **What it does**: Shows all warnings for a user
- **Features**:
  - Lists all warnings with reasons
  - Interactive buttons for details
  - Shows total warning count

### `/case` - View specific moderation case
- **Usage**: `/case <case_id>`
- **What it does**: Shows details of one moderation action
- **Features**:
  - Sapphire-style embed
  - Shows action, user, reason, moderator
  - Shows case date/time

### `/cases` - View all moderation cases
- **Usage**: `/cases [user]`
- **What it does**: Shows all moderation actions (or for specific user)
- **Features**:
  - Pageable list (10 per page)
  - Filter by user (optional)
  - Interactive Next/Previous buttons
  - Shows total cases per page

### `/user-info` - Get user details
- **Usage**: `/user-info @user`
- **What it does**: Shows detailed information about a user
- **Features**:
  - Account creation date
  - Join date
  - Current roles
  - Warning count
  - Suspension status
  - Sapphire-style embed

### `/server-info` - Get server details
- **Usage**: `/server-info`
- **What it does**: Shows information about the server
- **Features**:
  - Total members
  - Total roles
  - Creation date
  - Owner info
  - Server boost level
  - Sapphire-style embed

### `/server-timeout-status` - View timed-out users
- **Usage**: `/server-timeout-status`
- **What it does**: Shows all currently muted users
- **Features**:
  - Lists all timeouts
  - Shows timeout remaining time
  - Shows reason for timeout
  - Pageable if many users

### `/ban-list` - View ban history
- **Usage**: `/ban-list`
- **What it does**: Shows all banned and kicked users
- **Features**:
  - Complete ban history
  - Kick history
  - Shows reasons
  - Pageable list
  - Interactive buttons

### `/help` - Show all commands
- **Usage**: `/help`
- **What it does**: Shows complete command list with descriptions
- **Features**:
  - Pageable (10 commands per page)
  - Next/Previous buttons
  - Page counter (e.g., Page 1/5)
  - Shows all 46 commands

### `/help-command` - Get detailed help for one command
- **Usage**: `/help-command <command>`
- **What it does**: Shows detailed help for specific command
- **Featured Commands**:
  - `/kick`, `/ban`, `/mute`, `/warn`
  - `/suspend`, `/add-role`, `/purge`
  - `/setup-language-guardian`, `/server-config`, `/server-report`
- **Features**:
  - Usage examples
  - Full description
  - Required permissions
  - Special notes

---

## 🛡️ AUTOMOD & LANGUAGE GUARDIAN (8)

### `/enable-automod` - Turn on automod
- **Usage**: `/enable-automod`
- **What it does**: Enables the automod system
- **Features**:
  - Starts checking messages
  - Works with blacklist words
  - Optional multilingual mode

### `/disable-automod` - Turn off automod
- **Usage**: `/disable-automod`
- **What it does**: Disables automod system
- **Features**:
  - Stops checking messages
  - No more automatic actions
  - Respects whitelist settings

### `/setup-automod` - Configure automod
- **Usage**: `/setup-automod`
- **What it does**: Opens automod configuration panel
- **Features**:
  - Button: Enable/Disable System
  - Button: Toggle Multilingual (Language Guardian)
  - Button: View Current Settings
  - Per-guild customization

### `/blacklist` - Manage blacklisted words
- **Usage**: `/blacklist <add|remove|library> [word]`
- **Features**:
  - **add**: Add word to automod blacklist
  - **remove**: Remove word from blacklist
  - **library**: View all blacklisted words (pageable)
  - Words auto-deleted when found
  - User warned automatically

### `/enable-language-guardian` - Enable Language Guardian
- **Usage**: `/enable-language-guardian`
- **What it does**: Enables multilingual bad word detection
- **Features**:
  - Detects bad words from ALL languages
  - Auto-translates detected text
  - Configurable strikes system
  - Can mute, kick, ban, or suspend on violation

### `/disable-language-guardian` - Disable Language Guardian
- **Usage**: `/disable-language-guardian`
- **What it does**: Turns off multilingual detection
- **Features**:
  - Stops multilingual checking
  - Regular automod still works

### `/setup-language-guardian` - Configure Language Guardian
- **Usage**: `/setup-language-guardian <strike_limit> <timeout_minutes> <action>`
- **Options**:
  - Strike Limit: 1-10 (how many strikes before action)
  - Timeout Minutes: 1-60 (mute duration)
  - Action: Mute, Kick, Ban, or Suspend
- **Features**:
  - **Mute**: Times out user for specified duration
  - **Kick**: Removes user (can rejoin)
  - **Ban**: Permanently bans user
  - **Suspend**: Removes all roles (Wick-style)
  - Strikes auto-reset after action taken
  - Sapphire buttons for easy config
  - Per-guild customization

### `/lgbl` - Manage Language Guardian Blacklist
- **Usage**: `/lgbl <add|remove|list> [word]`
- **Features**:
  - **add**: Add custom word to LG blacklist
  - **remove**: Remove word from LG
  - **list**: View all LG blacklist words (pageable)
  - Works in all languages
  - Automatically translated on detection

---

## ⚙️ PROTECTION SYSTEMS (9)

### `/setup-anti-nuke` - Configure anti-nuke
- **Usage**: `/setup-anti-nuke`
- **What it does**: Protects server from channel/role mass deletion
- **Features**:
  - Detects rapid role/channel deletions
  - Configurable threshold
  - Whitelist bypass available
  - Integrated with `/server-config`

### `/setup-anti-raid` - Configure anti-raid
- **Usage**: `/setup-anti-raid`
- **What it does**: Protects from sudden member spike abuse
- **Features**:
  - Detects mass member joins
  - Configurable threshold
  - Whitelist bypass available
  - Auto-kick suspected bots/raiders

### `/enable-anti-spam` - Turn on anti-spam
- **Usage**: `/enable-anti-spam`
- **What it does**: Enables spam detection
- **Features**:
  - Tracks rapid messages
  - Auto-mutes spammers
  - Respects whitelist settings

### `/disable-anti-spam` - Turn off anti-spam
- **Usage**: `/disable-anti-spam`
- **What it does**: Disables spam detection

### `/setup-anti-spam` - Configure anti-spam
- **Usage**: `/setup-anti-spam <max_messages> <time_window> <mute_duration>`
- **Options**:
  - Max Messages: 2-10 (messages allowed)
  - Time Window: 5-60 seconds
  - Mute Duration: 1-60 minutes
- **Features**:
  - Sapphire buttons (View/Disable)
  - Real-time tracking
  - Per-guild customization

### `/set-auto-role` - Set auto-assign role
- **Usage**: `/set-auto-role <role>`
- **What it does**: Automatically gives role to new members
- **Features**:
  - Applied on member join
  - Any role can be auto-assigned
  - Only one auto-role per server
  - Sapphire buttons (View/Remove)

### `/remove-auto-role` - Remove auto-role
- **Usage**: `/remove-auto-role`
- **What it does**: Disables auto-role assignment
- **Features**:
  - Immediate effect
  - New members won't get role

### `/server-config` - Configure protection systems
- **Usage**: `/server-config`
- **What it does**: Master configuration panel for all protections
- **Features**:
  - **4 Toggle Buttons**: Anti-Spam, Language Guardian, Anti-Nuke, Anti-Raid
  - **Per-System Control**: Enable/disable whitelist bypass individually
  - Example: Allow whitelist bypass for anti-spam BUT NOT for anti-nuke
  - **Role Hierarchy Check**: Only for roles ABOVE bot
  - Sapphire button interface

### `/server-report` - Server attack recovery (NEW!)
- **Usage**: `/server-report <from_time> <to_time>`
- **Time Format**: Hour:Minute AM/PM (e.g., "2:30 PM", "3:45 PM")
- **What it does**: Analyzes Discord audit logs in time range, shows what happened
- **Features**:
  - **4 Categories**:
    - 📁 Channel Events (create, delete, edit)
    - 🔰 Role Events (create, delete, edit)
    - 👥 Member Events (kicks, bans, timeouts)
    - 💬 Message Events (purges, deletes)
  - **Select Menus**: Choose which events to undo
  - **Undo Button (⏮️)**: Instantly reverses selected actions
    - Restores deleted channels
    - Restores deleted roles
    - Reverses kicks/bans
    - Etc.
  - **Role Hierarchy Check**: Only for roles ABOVE bot
  - Perfect for fast attack recovery

---

## ✋ WHITELIST MANAGEMENT (3)

### `/whitelist add` - Add to whitelist
- **Usage**: `/whitelist add <role|member>`
- **What it does**: Exempts role/member from moderation
- **Features**:
  - Choose role or member
  - Whitelisted users bypass some protections
  - Works with all protection systems

### `/whitelist remove` - Remove from whitelist
- **Usage**: `/whitelist remove <role|member>`
- **What it does**: Removes whitelist exemption
- **Features**:
  - Select role or member
  - Interactive buttons to remove

### `/whitelist list` - View whitelist
- **Usage**: `/whitelist list`
- **What it does**: Shows all whitelisted roles and members
- **Features**:
  - Pageable list
  - Quick remove buttons
  - Shows what's currently whitelisted

---

## 🛠️ UTILITY COMMANDS (7)

### `/purge` - Delete messages
- **Usage**: `/purge <amount>`
- **What it does**: Removes specified number of messages from channel
- **Features**:
  - Delete 1-100 messages
  - Instant purge
  - Logged to moderation channel

### `/say` - Make bot speak
- **Usage**: `/say <text>`
- **What it does**: Bot repeats the message
- **Features**:
  - Any text allowed
  - Useful for announcements
  - Fun interaction

### `/lock` - Lock channel
- **Usage**: `/lock [channel]`
- **What it does**: Prevents members from sending messages
- **Features**:
  - Channel still visible
  - Members can see history
  - Mods can still message

### `/unlock` - Unlock channel
- **Usage**: `/unlock [channel]`
- **What it does**: Re-enables messages in locked channel
- **Features**:
  - Members can message again
  - Instant effect

### `/prune` - Remove inactive members
- **Usage**: `/prune [days]`
- **What it does**: Kicks members inactive for X days
- **Features**:
  - Default: 30 days
  - Removes inactive users
  - Useful for server cleanup

### `/afk` - Set AFK status
- **Usage**: `/afk <reason>`
- **What it does**: Marks you as away with reason
- **Features**:
  - Shows in user info
  - Others see you're AFK
  - Custom reason message

### `/afk-list` - View AFK members
- **Usage**: `/afk-list`
- **What it does**: Shows all members marked AFK
- **Features**:
  - Shows their reasons
  - Helpful for team coordination

---

## ⚙️ SERVER CONFIGURATION (3)

### `/set-prefix` - Set custom prefix
- **Usage**: `/set-prefix <prefix>`
- **What it does**: Changes command prefix from `!` to custom prefix
- **Prefix Requirements**:
  - 2-3 characters
  - Can include: letters, numbers, `#$_-+/*:!?~=\`
- **Features**:
  - 30-day cooldown between changes
  - Per-guild (each server has own)
  - Example: `=`, `>`, `?`, `$`

### `/set-channel` - Set log channel
- **Usage**: `/set-channel <channel>`
- **What it does**: Designates where moderation actions are logged
- **Features**:
  - All mod actions posted here
  - Auditing purposes
  - Shows cases, warnings, kicks, etc.

---

## 🌍 MULTILINGUAL FEATURES

**Language Guardian Supports:**
- Detects bad words in ALL languages
- Auto-translates to English for review
- Works with custom blacklist in any language
- Examples:
  - 🇷🇺 Russian profanity
  - 🇪🇸 Spanish insults
  - 🇫🇷 French slurs
  - 🇯🇵 Japanese content moderation
  - 🇩🇪 German violations
  - And 100+ other languages!

---

## 🔒 SECURITY & PERMISSIONS

### Role Hierarchy Protection
These advanced commands require user's highest role to be ABOVE bot's highest role:
- `/server-config` (per-system whitelist bypass)
- `/server-report` (audit logs + undo)
- `/suspend` (suspend users)
- `/unsuspend` (restore users)

### Admin-Only Commands
Require Administrator permission:
- `/setup-anti-nuke`
- `/setup-anti-raid`
- `/whitelist add/remove`
- `/set-channel`
- `/set-prefix`

---

## 📊 DISCORD INVITE DETECTION

**Automatic Features (No command needed):**
- Detects `discord.gg/` links automatically
- Detects `discordapp.com/invite/` links
- Automatically deletes invite messages
- Issues warning to user
- Works with all custom prefixes

---

## 💡 QUICK TIPS

### Common Workflows:
1. **Troublemaker**: `/warn @user` → Auto-tracks → Multiple warns visible in `/warns`
2. **Spam Attack**: `/setup-anti-spam` → Auto-detects rapid messages → Auto-mute
3. **Bad Language**: `/setup-language-guardian` → Multilingual detection → Auto-action
4. **After Raid/Nuke**: `/server-report 2:00 PM 3:30 PM` → Select events → `/server-report` undo button
5. **Quick Lockdown**: `/lock #general` → Fix issue → `/unlock #general`

### All Settings Are:
✅ Customizable per-guild (each server independent)
✅ Changeable anytime
✅ Saved in database
✅ Full control to admins

---

## 📝 PREFIX COMMANDS

All commands also work with custom prefix (default `!`):
```
!kick @user
!ban @user
!mute @user 5 h
!warn @user
!add-role @user Role
!remove-role @user Role
!purge 10
!set-prefix >
!enable-automod
!setup-language-guardian
```

Multi-word prefixes work too:
- `=set prefix` works same as `=set-prefix`
- `=add role` works same as `=add-role`
- Works for ALL hyphenated commands!

---

## 🚀 DEPLOYMENT

- **Replit**: 24/7 Reserved VM (running now)
- **Railway**: Ready to deploy (see RAILWAY_DEPLOYMENT.md)
- **Any Node.js host**: Fully compatible

---

**Total: 46 Slash Commands + Full Prefix Command Support + Auto-Protections = Complete Moderation Suite** 🎉
