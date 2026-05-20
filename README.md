# 🤖 Discord Username Availability Checker Bot

A powerful Discord bot that checks username availability across multiple social media platforms in real-time!

## ✨ Features

✅ **8 Usernames Per Minute** - Rate-limited checking
✅ **6 Platforms Supported** - Discord, Instagram, TikTok, Snapchat, Roblox, Facebook
✅ **Mix of Letters & Numbers** - Random username generation
✅ **Beautiful Embeds** - Real-time progress and results
✅ **Auto-Save Results** - JSON file storage
✅ **Easy Deployment** - Works locally or on Railway
✅ **Customizable** - Adjust length, delays, and directories via .env

## 📋 Commands

```
.gen [length]    - Check Discord usernames
.igen [length]   - Check Instagram usernames
.tgen [length]   - Check TikTok usernames
.sgen [length]   - Check Snapchat usernames
.rgen [length]   - Check Roblox usernames
.fgen [length]   - Check Facebook usernames
.help            - Show all commands
```

**Length:** 3-6 characters (optional, defaults to random)

## 🚀 Quick Start

### Local Setup

```bash
# 1. Clone/Download repository
git clone https://github.com/diddykiller848-glitch/discord1.git
cd discord1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Edit .env with your Discord bot token
# DISCORD_TOKEN=your_token_here

# 4. Run bot
python main.py
```

### Railway Deployment (24/7)

1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Select `diddykiller848-glitch/discord1`
4. Add `DISCORD_TOKEN` variable
5. Done! ✅

## 🔑 Get Discord Bot Token

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Go to "Bot" tab → "Add Bot"
4. Copy the TOKEN
5. Paste in `.env` or Railway variables

## 🔐 Invite Bot to Server

1. Go to "OAuth2" → "URL Generator"
2. Select scopes: `bot`
3. Select permissions:
   - Send Messages
   - Embed Links
   - Read Message History
4. Copy generated URL and authorize

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | - | Your Discord bot token (required) |
| `CHECK_DELAY` | 7.5 | Seconds between checks (8/min) |
| `MIN_LENGTH` | 3 | Minimum username length |
| `MAX_LENGTH` | 6 | Maximum username length |
| `RESULTS_DIR` | ./results | Where to save JSON results |

## 📊 Example Output

```
🔍 Checking DISCORD Usernames (4 letters)

🟢 Available:
abc1
xyz2

🔴 Taken:
test
abc123

📊 Summary: Available: 2/8

Saved to: discord_4letter_20250520_120000.json
```

## 🛠️ Customization

Edit `.env` to customize:

```env
# Generate 5-letter usernames
MIN_LENGTH=5
MAX_LENGTH=5

# Faster checks (10 per minute)
CHECK_DELAY=6

# Save results in different location
RESULTS_DIR=/home/results
```

## ⚠️ Important Notes

- **Rate Limiting:** Bot respects platform rate limits
- **TOS Compliance:** Use only for legitimate username research
- **Token Security:** Never share your bot token
- **API Limitations:** Some platforms may have restrictions

## 📝 License

Free to use and modify

## 🆘 Support

If bot doesn't respond:
1. Check Discord token is correct
2. Verify bot has message permissions
3. Check internet connection
4. View logs for errors

---

**Made with ❤️ for Discord community**