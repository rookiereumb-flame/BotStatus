# Discord Bot Host

## Overview
This project hosts a Discord bot on Replit, keeping it online 24/7. The bot connects to Discord using the provided bot token and displays all available commands.

## Recent Changes
- **November 13, 2025**: Initial project setup
  - Installed Node.js and dependencies (discord.js, express)
  - Created bot hosting infrastructure with keep-alive web server
  - Configured to display bot commands on startup

## Project Architecture
- **index.js**: Main bot file that connects to Discord and handles events
- **server.js**: Express web server for keeping the bot alive on Replit
- **package.json**: Project dependencies (discord.js for Discord API, express for web server)

## Configuration
- Bot token stored securely in DISCORD_BOT_TOKEN environment variable
- Web server runs on port 5000 for Replit compatibility
- Bot displays all registered commands when it comes online

## User Preferences
- Simple, functional bot hosting solution
- Display commands on startup for easy verification
