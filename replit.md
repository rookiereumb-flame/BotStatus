# Daddy USSR — Discord Security Bot

## Overview
A Discord security bot with no web dashboard. All logic via slash commands and a persistent SQLite database. Features 14+ security monitors, trust system, role memory, state snapshots with auto-revert, lockdown, and fun commands.

## Current Status
- **Bot Tag**: Daddy USSR#2234
- **Commands**: 22 slash commands registered globally
- **DB**: SQLite (`security.db`) via `better-sqlite3`

## Architecture
- **index.js** — Main bot file: all monitors, event handlers, command handler, command registration
- **src/database/db.js** — SQLite schema + all DB helpers
- **src/services/monitor.js** — `logAction`, `checkThreshold`, `suspendUser`, `sendLog`
- **start.js** — Process manager (bot + express server for uptime)
- **server.js** — Express web server (port 5000)
- **security.db** — Persistent SQLite database

## Commands (22)
| Command | Permission | Description |
|---------|-----------|-------------|
| `/say [message]` | ManageGuild in server / Free in DMs | Send message as bot |
| `/ask [question]` | Any | Magic 8-Ball |
| `/ban [@user] [reason]` | BanMembers / L3+ | Ban a member |
| `/unban [id] [reason]` | BanMembers / L3+ | Unban by ID |
| `/kick [@user] [reason]` | KickMembers / L3+ | Kick |
| `/mute [@user] [dur] [reason]` | ModerateMembers / L3+ | Discord timeout |
| `/unmute [@user]` | ModerateMembers / L3+ | Remove timeout |
| `/suspend [@user] [dur] [reason]` | ManageRoles / L3+ | Strip all roles, optional auto-expire |
| `/unsuspend [@user]` | ManageRoles / L3+ | Restore roles |
| `/lockdown [reason]` | ManageChannels | Lock all text channels (exact perm save) |
| `/unlockdown` | ManageChannels | Restore exact pre-lockdown state |
| `/config [type] [limit] [time]` | Administrator | Set anti-nuke thresholds |
| `/setup [#channel]` | Administrator | Set log channel |
| `/antinuke enable\|disable\|status` | Administrator | Toggle/view all monitors |
| `/trust add\|remove\|list` | Server Owner | Manage trusted users |
| `/scan` | Any | Audit bots + check AutoMod |
| `/snapshot` | Administrator | View last snapshot info |
| `/revert channels\|roles\|all` | Administrator | Restore from snapshot (with overwrites) |
| `/counting-toggle [#ch] [type]` | ManageChannels | Enable counting game |
| `/starboard-enable [#ch] [n] [emoji]` | ManageGuild | Enable starboard |
| `/starboard-disable` | ManageGuild | Disable starboard |
| `/help [page]` | Any | Paginated help with ◀ ▶ buttons |

## Security Monitors (14)
| Monitor | Event | Behavior |
|---------|-------|----------|
| channel_delete | Channel deleted | Threshold → suspend + auto-revert |
| channel_create | Channel created | Threshold → suspend |
| channel_update | Channel updated | Threshold → suspend |
| role_delete | Role deleted | Threshold → suspend + auto-revert |
| role_create | Role created | Threshold → suspend |
| **role_update** | Dangerous perm grant | **Instant revert + suspend** (no threshold) |
| member_ban | Member banned | Threshold → suspend |
| member_kick | Member kicked | Threshold → suspend |
| **webhook_create** | Webhook created | **Deleted instantly** + threshold for repeated |
| emoji_create | Emoji created | Threshold → suspend |
| **emoji_delete** | Emoji deleted | Threshold → suspend |
| sticker_create | Sticker created | Threshold → suspend |
| **sticker_delete** | Sticker deleted | Threshold → suspend |
| **vanity_update** | Vanity URL changed | **Instant revert + suspend** (no threshold) |

## Key Features
- **Auto-Revert**: On nuke threshold, deleted channels/roles recreated from snapshot with full overwrites
- **False-positive fix**: Audit log entries checked by timestamp AND target ID (within 5s)
- **Audit log race condition**: `fetchAuditEntry()` helper checks recency and target match
- **Role Update**: Only acts on dangerous permission grants; normal edits (name/color/hoist) are allowed
- **Webhook**: Deleted on creation; threshold triggers suspension
- **Vanity URL**: Instant revert + suspend, no threshold needed
- **Role Memory**: Saved on leave (ONLY if not suspended — prevents overwriting suspension save)
- **Trust System**:
  - **L1 (Owner)**: Fully immune to everything
  - **L2 (Trustee)**: Immune to anti-nuke + @everyone suspend
  - **L3 (Permit)**: Bypasses Discord permission checks for mod commands
  - **Bot-Owner tier**: Admin + role above bot = full access
- **Lockdown**: Saves ALL channel overwrites exactly, restores using `permissionOverwrites.set()`
- **Counting**: Types: normal, even, odd, fibonacci, prime. High score (🏆), milestones (💯 at 100s)
- **Starboard**: Handles text, images, videos (link), message embeds, custom emoji
- **Suspend**: Always saves fresh roles on each new suspension; clears DB on unsuspend
- **Help**: Paginated 4-page embed with ◀ ▶ button navigation
- **Say in DM**: Replies directly (no ephemeral) in DM/User App contexts

## Trust Permission Details
- L1/L2: Immune to monitors and @everyone suspend
- L3: `hasBotPerm()` bypasses Discord perm requirements for ban/kick/mute/suspend/unsuspend
- Server owner + users with role above bot + Administrator = bot-owner tier (full access)

## Database Tables
- `guild_config` — log_channel_id, antinuke_enabled per guild
- `thresholds` — per-guild, per-event limit/window
- `trusted_users` — per-guild trust levels
- `role_memory` — saved roles + suspension flag
- `snapshots` — full channel/role state JSON (with permission overwrites)
- `suspension_timers` — auto-unsuspend timestamps (restart-safe)
- `counting` — channel, enabled, current_count, last_user_id, high_score, count_type
- `starboard` — channel, enabled, threshold, emoji
- `starboard_posts` — message_id → starboard_message_id map
- `lockdown_backup` — full overwrite arrays per channel

## Deployment
- **Replit Reserved VM** — 24/7 uptime
- **Run command**: `node start.js`
- **Token**: `DISCORD_BOT_TOKEN` secret
- **Client ID**: `DISCORD_CLIENT_ID` in `.env` (1437383469528387616)
