# RainyDay Exchange Bot — Command Reference

> **Prefix:** `.` (dot)  
> **Slash:** `/` (forward slash)  
> Both work for most commands.

---

## 🔧 SETUP (Admin only)

| Command | Description |
|---------|-------------|
| `/setup` | Auto-creates all roles, ticket category, #vouches channel, and posts the panel |
| `/panel` or `.panel` | Post the exchange panel in current channel |

---

## 💱 EXCHANGE PANEL & TICKETS

Panel has 5 buttons:
- **Rate** — Shows current exchange rates
- **Exchange** — Opens a currency exchange ticket (i2c, c2i, p2c, c2p, ca2c, c2ca, n2c, c2n)
- **Middleman** — Opens a middleman ticket
- **Buy** — Opens a buy ticket  
- **Sell** — Opens a sell ticket

### Ticket Controls (Staff only)
| Command | Description |
|---------|-------------|
| `/close` | Close current ticket (deletes in 5s) |
| `/add @user` | Add a user to current ticket |
| `/remove @user` | Remove a user from current ticket |

---

## ⚙️ EXCHANGE CONFIGURATION (Admin/Manage Server)

| Command | Description |
|---------|-------------|
| `/setexchange role type:i2c role:@role` | Assign staff role to an exchange type |
| `/setexchange category` | Set the ticket category channel |
| `/setexchange rates text:...` | Set rate text shown in the Rate button |
| `/setexchange show` | Show current bot configuration |

### Exchange Types
| Type | Meaning |
|------|---------|
| `i2c` | INR → Crypto |
| `c2i` | Crypto → INR |
| `p2c` | PayPal → Crypto |
| `c2p` | Crypto → PayPal |
| `ca2c` | CashApp → Crypto |
| `c2ca` | Crypto → CashApp |
| `n2c` | NPR → Crypto |
| `c2n` | Crypto → NPR |

---

## 🎨 PANEL CUSTOMIZATION (Manage Server)

| Command | Description |
|---------|-------------|
| `/setpanel title text:RainyDay Exchange` | Change panel title |
| `/setpanel description text:Your text here` | Change panel description (use `\n` for new lines) |
| `/setpanel color hex:#5865f2` | Change embed color (hex code) |
| `/setpanel image url:https://...` | Set large panel image (or leave empty to remove) |
| `/setpanel thumbnail url:https://...` | Set small thumbnail (or leave empty to remove) |
| `/setpanel footer text:Footer text` | Set footer text (or leave empty to remove) |
| `/setpanel preview` | Preview the current panel without posting |
| `/setpanel reset` | Reset panel back to defaults |

---

## ⭐ VOUCHES & PROFILES

| Command | Description |
|---------|-------------|
| `/vouch user:@user service:exchange amount:₹5000 comment:fast deal` | Post a vouch for someone |
| `/profile` | View your own trade profile |
| `/profile user:@user` | View someone else's profile |
| `/setvouchchannel channel:#vouches` | Set vouch channel (admin) |

### Trust Badges (based on received vouches)
| Badge | Required Vouches |
|-------|-----------------|
| 🆕 New Trader | 0–2 |
| 🥉 Bronze Trader | 3–9 |
| 🥈 Silver Trader | 10–24 |
| 🥇 Gold Trader | 25–49 |
| 💎 Diamond Trader | 50+ |

### `/vouch` Service Options
`exchange` · `middleman` · `buy` · `sell`

---

## 🔍 CRYPTO TRANSACTIONS

| Command | Description |
|---------|-------------|
| `/tx address:0x...` | Show latest transactions for any wallet |
| `.tx 0x...` | Same via prefix |

**Supported chains:** Bitcoin (BTC) · Ethereum (ETH) · Tron (TRX) · Solana (SOL) · Litecoin (LTC) · Dogecoin (DOGE)

Address is auto-detected — just paste the wallet address.

---

## 🔊 JOIN VC (Token-based)

> Bot guides you step-by-step in DMs. Token is never stored.

| Command | Description |
|---------|-------------|
| `/joinvc` or `.joinvc` | Start VC join setup in DMs |
| `/stoptask id:TASKID` | Stop a running joinvc task |
| `/stoptask` | List all your active tasks |

**DM Flow:**
1. Send your Discord token (validated before use)
2. Send the Server (Guild) ID
3. Send the Voice Channel ID
4. Send duration: `24/7` / `forever` / `2h` / `30m` / `1d`

The account will join VC and appear online. Auto-reconnects if dropped. When done, bot sends a completion embed in the original server channel.

---

## 📨 AUTO MESSAGE (Token-based)

> Bot guides you step-by-step in DMs. Token is never stored.

| Command | Description |
|---------|-------------|
| `/automsg` or `.automsg` | Start auto message setup in DMs |
| `/stoptask id:TASKID` | Stop a running automsg task |
| `/stoptask` | List all your active tasks |

**DM Flow:**
1. Send your Discord token (validated before use)
2. Send the Channel ID to send messages in
3. Send the message text
4. Send rate + duration:

**Rate format:** `<msgs>/<min>` — e.g. `3/1` = 3 messages per minute

**Duration format:**
| Input | Meaning |
|-------|---------|
| `24/7` or `forever` | Run indefinitely |
| `2h` | 2 hours |
| `30m` | 30 minutes |
| `1d` | 1 day |
| `3600s` | 3600 seconds |

**Full example:** `3/1 24/7` → 3 msgs per minute, forever

Bot sends a completion embed in the original server channel when done.

---

## 🛑 TASK MANAGEMENT

| Command | Description |
|---------|-------------|
| `/stoptask` | List all your running tasks |
| `/stoptask id:ABC123` | Stop a specific task by its ID |

Task ID is shown in the DM confirmation embed after starting a task.

---

## ❓ HELP

| Command | Description |
|---------|-------------|
| `/help` | Show command list in Discord |
| `.help` | Same via prefix |

---

## 🚀 FIRST-TIME SETUP (Run in order)

1. Invite bot with Administrator permission
2. Run `/setup` in any channel → creates all roles, category, #vouches, and posts panel
3. Go to the panel channel and click the panel buttons to test
4. Run `/setexchange rates text:Your rate info here` to set exchange rates
5. Run `/setvouchchannel channel:#vouches` if not set automatically
6. Done! Users can now create tickets, post vouches, and use all features.

---

*RainyDay Exchange Bot — Built with discord.js 14*
