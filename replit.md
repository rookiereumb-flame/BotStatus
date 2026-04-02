# Daddy USSR — Discord Security Bot

## Overview
A Wick-style Discord security bot with no web dashboard. All logic handled via slash commands and a persistent SQLite database. Features 12+ anti-nuke monitors, trust system, role memory, state snapshots, and a global `/say` command.

## Current Status
- **Bot Tag**: Daddy USSR#2234
- **Commands**: 9 slash commands registered globally
- **DB**: SQLite (`security.db`) via `better-sqlite3`

## Architecture
- **index.js** — Main bot file: all monitors, slash commands, event handlers, command registration
- **src/database/db.js** — SQLite schema + all DB helpers
- **src/services/monitor.js** — `logAction`, `checkThreshold`, `suspendUser`, `sendLog`
- **start.js** — Process manager (bot + express server for uptime)
- **server.js** — Express web server (port 5000)
- **security.db** — Persistent SQLite database

## Commands
| Command | Permission | Description |
|---------|-----------|-------------|
| `/say [message]` | ManageGuild (in server) / Free (DMs & User App) | Send message as bot, silently |
| `/config [type] [limit] [time]` | Administrator | Set anti-nuke thresholds |
| `/setup [#channel]` | Administrator | Set security log channel |
| `/trust add/remove/list [@user] [level]` | Server Owner | Manage trusted users |
| `/suspend [@user] [reason]` | Role above bot | Manually suspend user |
| `/unsuspend [@user]` | Role above bot | Restore suspended user |
| `/scan` | Any | Audit bots, check AutoMod |
| `/snapshot` | Administrator | View last server snapshot |
| `/help [page]` | Any | Paginated help (3 pages) |

## Security Monitors (12)
| Monitor | Event | Default Threshold |
|---------|-------|-------------------|
| channel_delete | Channel deleted | 3 / 10s |
| channel_create | Channel created | 3 / 10s |
| channel_update | Channel updated | 3 / 10s |
| role_delete | Role deleted | 3 / 10s |
| role_create | Role created | 3 / 10s |
| role_update | Role updated | 3 / 10s |
| member_ban | Member banned | 3 / 10s |
| member_kick | Member kicked | 3 / 10s |
| webhook_create | Webhook created | 3 / 10s |
| emoji_create | Emoji created | 3 / 10s |
| sticker_create | Sticker created | 3 / 10s |
| vanity_update | Vanity URL changed | 3 / 10s |

## Features
- **Anti-Everyone**: Instant suspension for @everyone/@here abuse
- **Role Memory**: Save roles on leave, restore on rejoin
- **State Snapshots**: Every 6 hours, also taken on startup
- **Hierarchy Protection**: Reverts edits to Suspended role / bot role
- **Trust Levels**: L1=Owner/Immune, L2=Trustee/Immune, L3=Permit/Mod
- **Detailed Logging**: Color-coded embeds sent to log channel

## /say Command Details
- In a server: requires **Manage Server** permission
- In DMs or via User App: works freely (user already authorized)
- No "reply" appearance — uses deferReply(ephemeral) → channel.send → deleteReply
- Registered with `integration_types: [0, 1]` and `contexts: [0, 1, 2]`

## Database Tables
- `guild_config` — log_channel_id per guild
- `thresholds` — per-guild, per-event limit/window
- `trusted_users` — per-guild trust levels
- `role_memory` — saved roles + suspension flag
- `snapshots` — full channel/role state JSON

## Deployment
- **Replit Reserved VM** — 24/7 uptime
- **Run command**: `node start.js`
- **Token**: `DISCORD_BOT_TOKEN` secret
- **Client ID**: `DISCORD_CLIENT_ID` in `.env` (1437383469528387616)
