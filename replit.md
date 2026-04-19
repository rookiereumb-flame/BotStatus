# beni — Discord Security Bot

## Overview
A Discord security/moderation bot with no web dashboard. All logic via slash commands and a persistent SQLite database. Features 14+ security monitors, trust system, role memory, state snapshots with auto-revert, lockdown, suspend system, Wick-style case/modlog system, intelligence systems, and fun commands.

## Current Status
- **Bot Tag**: Kisuke Urahara#2234 (display name: beni)
- **Commands**: 35+ slash commands registered globally
- **DB**: SQLite (`security.db`) via `better-sqlite3`

## Architecture
- **index.js** — Main bot file: all monitors, event handlers, command handler, command registration
- **src/database/db.js** — SQLite schema + all DB helpers
- **src/services/monitor.js** — `logAction`, `checkThreshold`, `suspendUser`, `sendLog`, `securityEmbed`
- **start.js** — Process manager (bot + express server for uptime)
- **server.js** — Express web server (port 5000)
- **security.db** — Persistent SQLite database

## Commands (29)
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
| `/setup-suspend` | Administrator | Create Suspended role + apply deny overwrites to all channels |
| `/antinuke enable\|disable\|status` | Administrator | Toggle/view all monitors |
| `/trust add\|remove\|list` | Server Owner | Manage trusted users |
| `/scan` | Any | Audit bots + check AutoMod |
| `/snapshot` | Administrator | View last snapshot info |
| `/revert channels\|roles\|all` | Administrator | Restore from snapshot (with overwrites) |
| `/counting-toggle [#ch] [type]` | ManageChannels | Enable counting game |
| `/starboard-enable [#ch] [n] [emoji]` | ManageGuild | Enable starboard |
| `/starboard-disable` | ManageGuild | Disable starboard |
| `/help [page]` | Any | Paginated help (5 pages) with ◀ ▶ buttons |
| `/watchlist add\|remove\|list` | ManageGuild | Silent watchlist — log alert on each message |
| `/evidence view\|clear [@user]` | ManageGuild | View deleted messages from evidence locker |
| `/shadow-ban [@user] [reason]` | ManageGuild | Silently delete all user messages |
| `/shadow-unban [@user]` | ManageGuild | Lift shadow-ban |
| `/staff-log [mod]` | ManageGuild | View recent staff actions |
| `/raid-config set\|disable\|status` | Administrator | Configure predictive raid detection |

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

## Intelligence Systems
- **Evidence Locker** — `messageDelete` listener captures every deleted message to DB; view with `/evidence view @user`
- **Silent Watchlist** — `/watchlist add @user [reason]`; every message from watched user triggers a silent log-channel alert
- **Shadow Ban** — `/shadow-ban @user`; messages silently deleted on `messageCreate`, user unaware
- **Staff Action Log** — all ban/kick/mute/suspend/unsuspend/shadow-ban recorded; view with `/staff-log`
- **Dynamic Slowmode** — tracks message rate per channel (in-memory); 12+ msgs/10s → 5s slowmode; quiets → remove
- **Predictive Raid Detection** — tracks join timestamps; spike or fresh-account wave triggers lockdown/kick/alert; configure with `/raid-config`

## Logging Format
All security log embeds use screenshot-style format via `securityEmbed()`:
- **Title**: `[Username] has been [action]!`
- **Lines**: `▶ **Label:** value`
- **More Details**: `▶ **Key:** ✅/❌` status flags at bottom

## Suspend System (v2)
- **Channel Overwrites**: On `/suspend`, ALL channels get deny overwrites for the Suspended role (parallel `Promise.all`)
- **Bot Support**: Managed role permissions are zeroed on suspend, restored on unsuspend
- **Snapshot Sync**: Every 6h snapshot also re-syncs Suspended role deny overwrites across all channels
- **channelCreate**: New channels automatically get Suspended role deny overwrite
- **Hierarchy Protection**: If a user (untrusted) tries to suspend someone with equal/higher role → BOTH suspended
- **Permission**: ManageRoles OR Administrator (either is sufficient; trust levels bypass)

## Auto-Revert (Fixed)
- Channel overwrites now use `permissionOverwrites.set()` instead of the broken `.edit(id, {}, {allow,deny})` — overwrites are fully restored on nuke events

## Trust System v2
- **L1**: Immune to EVERYTHING (threshold events + instant-action events, @everyone, webhooks, vanity)
- **L2**: Immune to THRESHOLD monitors ONLY — still caught by: dangerous perm grants, vanity URL change, webhook spam, @everyone abuse
- **L3**: Permission bypass for mod commands only
- **Owner tier** (guild owner + role above bot + Admin): Same as L1 immunity in suspendUser

## Database Tables
- `guild_config` — log_channel_id, antinuke_enabled per guild
- `thresholds` — per-guild, per-event limit/window/enabled
- `trusted_users` — per-guild trust levels
- `role_memory` — saved roles + suspension flag
- `snapshots` — full channel/role state JSON (with permission overwrites)
- `suspension_timers` — auto-unsuspend timestamps (restart-safe)
- `bot_managed_role_perms` — bot managed role permissions saved during suspension
- `counting` — channel, enabled, current_count, last_user_id, high_score, count_type
- `starboard` — channel, enabled, threshold, emoji
- `starboard_posts` — message_id → starboard_message_id map
- `lockdown_backup` — full overwrite arrays per channel
- `watchlist` — guild_id, user_id, reason, added_by, added_at
- `evidence_locker` — deleted messages (guild, user, channel, content, attachments, timestamp)
- `shadow_bans` — guild_id, user_id, added_by, reason, added_at
- `staff_actions` — guild_id, mod_id, action, target_id, reason, timestamp
- `raid_config` — join_limit, join_window, min_age_days, action per guild

## Deployment
- **Replit Reserved VM** — 24/7 uptime
- **Run command**: `node start.js`
- **Token**: `DISCORD_BOT_TOKEN` secret
- **Client ID**: `DISCORD_CLIENT_ID` in `.env` (1437383469528387616)
