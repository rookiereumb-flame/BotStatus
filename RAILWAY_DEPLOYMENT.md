# Railway Deployment Guide

## Quick Setup (5 minutes)

### Step 1: Prepare Your Repository
Your bot is already configured for Railway! Just ensure:
- ✅ `package.json` has correct start script: `node start.js`
- ✅ `railway.json` exists in root directory
- ✅ `.env` is in `.gitignore` (already configured)
- ✅ All code committed to GitHub

### Step 2: Deploy to Railway

**Option A: One-Click Deploy (Easiest)**
1. Go to https://railway.app
2. Click **"Create a new project"** → **"Deploy from GitHub repo"**
3. Select your bot repository
4. Railway auto-detects Node.js and installs dependencies
5. Set environment variables (see Step 3)

**Option B: Using Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to your Railway account
railway login

# Link to existing project or create new one
railway init

# Deploy
railway up
```

### Step 3: Set Environment Variables in Railway Dashboard

1. Open your project in Railway
2. Click the **"Variables"** tab
3. Add these variables:

| Key | Value | Where to Find |
|-----|-------|---------------|
| `DISCORD_BOT_TOKEN` | Your bot token | Discord Dev Portal → Bot → Copy Token |
| `DISCORD_CLIENT_ID` | Your client ID | Discord Dev Portal → General Information |
| `SESSION_SECRET` | Any random string | Generate one: `openssl rand -base64 32` |
| `PREFIX` | `!` or your custom prefix | Your choice |
| `NODE_ENV` | `production` | Leave as is |

### Step 4: Verify Deployment

1. Go to Railway dashboard → Your Project → **Deployments**
2. Check the latest deployment logs
3. Look for: `✅ Logged in as Daddy USSR#2234`
4. Check: `✅ Successfully registered all commands!`

**✅ Bot is live!** Invite it to your Discord server and test commands.

---

## Architecture on Railway

```
Railway VM
├── Node.js Runtime
├── start.js (Process Manager)
│   ├── server.js (Express HTTP server on PORT env var)
│   └── index.js (Discord Bot)
└── Persistent SQLite Database
```

- **Process Manager**: `start.js` manages both bot and server
- **Auto-Recovery**: Restarts failing processes automatically
- **Health Checks**: HTTP endpoint at `/` for monitoring
- **Database**: SQLite persists in `/bot.db`

---

## Monitoring & Troubleshooting

### View Real-Time Logs
1. Go to Railway Dashboard → Project → **Deployments**
2. Click latest deployment → **View Logs**
3. Watch output for errors

### Check Bot Status
```bash
# Railway web dashboard shows uptime
# You can also use Discord to check if bot is online
```

### Common Issues

| Problem | Solution |
|---------|----------|
| "Invalid token" error | Regenerate token in Discord Dev Portal, update Railway variable |
| Bot goes offline | Railway restarts it automatically. Check logs for crash reason |
| Database errors | SQLite file persists in Railway. Old data is preserved |
| Port conflict | Railway auto-assigns PORT env var. Our bot handles it correctly |
| Commands not working | Verify `DISCORD_CLIENT_ID` is correct in Railway variables |

### Debug Commands
Check the full logs in Railway dashboard:
1. **Bot online check**: Look for `✅ Logged in as Daddy USSR#2234`
2. **Command registration**: Look for `✅ Successfully registered all commands!`
3. **Error monitoring**: Search logs for `❌` or `error` keywords

---

## Migrating from Replit to Railway

### What Stays the Same
- ✅ All bot code (index.js)
- ✅ All commands and features
- ✅ Database (bot.db)
- ✅ Configuration system

### What Changes
- ❌ No more Replit UptimeRobot pings needed
- ❌ Railway handles 24/7 uptime automatically
- ❌ No more manual restarts

### Migration Steps
1. Push code to GitHub (all changes already committed)
2. Create Railway account (https://railway.app)
3. Deploy from GitHub (see Step 2 above)
4. Set environment variables in Railway
5. Test bot commands in Discord
6. (Optional) Delete Replit project to stop hosting there

---

## Stopping Replit Hosting (Optional)

When ready to fully migrate to Railway:

1. **Remove Replit workflow** (optional):
   ```bash
   # In Replit console:
   # Stop the 'discord-bot' workflow
   ```

2. **Delete .replit file** (optional):
   ```bash
   rm .replit
   ```

3. Your bot will continue running on Railway 24/7

---

## Cost Comparison

| Provider | Cost | Uptime | Reliability |
|----------|------|--------|-------------|
| **Replit** | Free/Reserved VM | 24/7 | Good |
| **Railway** | $5 credit/month + usage | 24/7 | Excellent |

**Tip**: Monitor Railway usage in dashboard to manage costs.

---

## Need Help?

- **Railway Docs**: https://docs.railway.app
- **Discord.js Guide**: https://discordjs.guide
- **Railway Community**: https://railway.app/chat

Happy hosting! 🚀
