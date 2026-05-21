import os
import json
import random
import string
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import discord
from discord.ext import commands
import aiohttp
import logging

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot setup
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='.', intents=intents)

# Environment variables
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
CHECK_DELAY = float(os.getenv('CHECK_DELAY', '7.5'))  # 8 usernames per minute
MIN_LENGTH = int(os.getenv('MIN_LENGTH', '3'))
MAX_LENGTH = int(os.getenv('MAX_LENGTH', '6'))
RESULTS_DIR = os.getenv('RESULTS_DIR', './results')
GEN_COUNT = int(os.getenv('GEN_COUNT', '8'))  # How many usernames to generate per batch

# Create results directory if it doesn't exist
os.makedirs(RESULTS_DIR, exist_ok=True)

# Global variable to track if generation is running
generation_running = False

# Temp Email Websites
TEMP_EMAIL_PROVIDERS = {
    'tempmail': {
        'url': 'https://tempmail.com',
        'api': 'https://api.tempmail.com/new',
        'inbox': 'https://api.tempmail.com/messages'
    },
    '10minutemail': {
        'url': 'https://10minutemail.com',
        'api': 'https://10minutemail.com/api/v1/address',
        'inbox': 'https://10minutemail.com/api/v1/messages'
    },
    'mailinator': {
        'url': 'https://www.mailinator.com',
        'api': 'https://api.mailinator.com/v1/generate',
        'inbox': 'https://api.mailinator.com/v1/get'
    },
    'guerrillamail': {
        'url': 'https://www.guerrillamail.com',
        'api': 'https://api.guerrillamail.com/ajax.php?f=get_email_address',
        'inbox': 'https://api.guerrillamail.com/ajax.php?f=check_email'
    },
    'yopmail': {
        'url': 'https://yopmail.com',
        'api': 'https://yopmail.com/api/generate',
        'inbox': 'https://yopmail.com/api/inbox'
    }
}

class UsernameChecker:
    """Handles username generation and checking across platforms"""
    
    def __init__(self):
        self.session = None
    
    async def init_session(self):
        """Initialize aiohttp session"""
        if not self.session:
            self.session = aiohttp.ClientSession()
    
    async def close_session(self):
        """Close aiohttp session"""
        if self.session:
            await self.session.close()
    
    def generate_username(self, length):
        """Generate random username with mix of letters and numbers"""
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=length))
    
    async def check_discord(self, username):
        """Check Discord username availability"""
        try:
            async with self.session.get(
                f'https://discord.com/api/v10/users/search?q={username}',
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return resp.status != 429
        except:
            return None
    
    async def check_twitch(self, username):
        """Check Twitch username availability"""
        try:
            async with self.session.get(
                f'https://api.twitch.tv/kraken/users/{username}',
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return resp.status == 404
        except:
            return None
    
    async def check_roblox(self, username):
        """Check Roblox username availability"""
        try:
            async with self.session.post(
                'https://auth.roblox.com/v1/usernames/validate',
                json={'username': username},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                data = await resp.json()
                return data.get('valid', False)
        except:
            return None
    
    async def check_instagram(self, username):
        """Check Instagram username availability"""
        try:
            async with self.session.get(
                f'https://www.instagram.com/api/v1/users/search/?ig_sig_key_version=4&search_surface=user_search&q={username}',
                timeout=aiohttp.ClientTimeout(total=5),
                headers={'User-Agent': 'Instagram 1.0'}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return len(data.get('users', [])) == 0
        except:
            return None
    
    async def check_tiktok(self, username):
        """Check TikTok username availability"""
        try:
            async with self.session.get(
                f'https://www.tiktok.com/api/user/detail/?uniqueId={username}',
                timeout=aiohttp.ClientTimeout(total=5),
                headers={'User-Agent': 'Mozilla/5.0'}
            ) as resp:
                return resp.status == 404
        except:
            return None
    
    async def check_snapchat(self, username):
        """Check Snapchat username availability"""
        try:
            async with self.session.get(
                f'https://api.snapchat.com/v2/usernames/{username}',
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return resp.status == 404
        except:
            return None
    
    async def check_facebook(self, username):
        """Check Facebook username availability"""
        try:
            async with self.session.get(
                f'https://www.facebook.com/{username}/',
                timeout=aiohttp.ClientTimeout(total=5),
                allow_redirects=False
            ) as resp:
                return resp.status == 404
        except:
            return None

class TempEmailGenerator:
    """Handles temporary email generation and inbox checking"""
    
    def __init__(self, session):
        self.session = session
    
    async def generate_tempmail(self, provider='tempmail'):
        """Generate a temporary email"""
        try:
            if provider == 'tempmail':
                async with self.session.get(
                    'https://api.tempmail.com/new',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {
                            'email': data.get('email'),
                            'token': data.get('token'),
                            'provider': provider
                        }
            
            elif provider == '10minutemail':
                async with self.session.get(
                    'https://10minutemail.com/api/v1/address',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {
                            'email': data,
                            'provider': provider
                        }
            
            elif provider == 'guerrillamail':
                async with self.session.get(
                    'https://api.guerrillamail.com/ajax.php?f=get_email_address',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {
                            'email': data.get('email_address'),
                            'sid': data.get('sid_token'),
                            'provider': provider
                        }
        except Exception as e:
            logger.error(f"Error generating temp email: {e}")
        
        return None
    
    async def get_inbox(self, email, provider='tempmail', token=None):
        """Get emails from temp email inbox"""
        try:
            if provider == 'tempmail':
                async with self.session.get(
                    f'https://api.tempmail.com/messages?email={email}',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
            
            elif provider == '10minutemail':
                async with self.session.get(
                    f'https://10minutemail.com/api/v1/messages?email={email}',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
            
            elif provider == 'guerrillamail':
                async with self.session.get(
                    f'https://api.guerrillamail.com/ajax.php?f=check_email&email_addr={email}',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
        except Exception as e:
            logger.error(f"Error getting inbox: {e}")
        
        return None

checker = UsernameChecker()
temp_email_gen = None

async def check_usernames(platform, ctx=None):
    """Check usernames with proper rate limiting - AUTO generates random length 3-6"""
    
    # Randomly generate length between MIN and MAX
    length = random.randint(MIN_LENGTH, MAX_LENGTH)
    
    # Platform check functions mapping
    platform_map = {
        'discord': checker.check_discord,
        'instagram': checker.check_instagram,
        'tiktok': checker.check_tiktok,
        'snapchat': checker.check_snapchat,
        'roblox': checker.check_roblox,
        'facebook': checker.check_facebook,
    }
    
    if platform not in platform_map:
        return None, "Invalid platform"
    
    check_func = platform_map[platform]
    usernames = [checker.generate_username(length) for _ in range(GEN_COUNT)]
    results = {'available': [], 'taken': [], 'error': []}
    
    # Create embed for live updates
    if ctx:
        embed = discord.Embed(
            title=f"🔍 Checking {platform.upper()} Usernames ({length} letters)",
            description="Starting check...",
            color=discord.Color.blue()
        )
        msg = await ctx.send(embed=embed)
    
    # Check each username with delay
    for i, username in enumerate(usernames):
        try:
            is_available = await check_func(username)
            
            if is_available is True:
                results['available'].append(username)
                status = "✅"
            elif is_available is False:
                results['taken'].append(username)
                status = "❌"
            else:
                results['error'].append(username)
                status = "⚠️"
            
            # Update embed
            if ctx and i % 2 == 0:
                progress = f"{i+1}/{GEN_COUNT} checked"
                embed.description = progress
                try:
                    await msg.edit(embed=embed)
                except:
                    pass
            
            # Rate limiting
            if i < len(usernames) - 1:
                await asyncio.sleep(CHECK_DELAY)
        
        except Exception as e:
            logger.error(f"Error checking {username}: {e}")
            results['error'].append(username)
    
    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = os.path.join(RESULTS_DIR, f"{platform}_{length}letter_{timestamp}.json")
    
    with open(filename, 'w') as f:
        json.dump(results, f, indent=2)
    
    return results, filename, length

@bot.event
async def on_ready():
    """Bot ready event"""
    global temp_email_gen
    await checker.init_session()
    temp_email_gen = TempEmailGenerator(checker.session)
    logger.info(f'✅ Bot logged in as {bot.user}')
    print(f'✅ Bot is running!')

# ============ EMAIL GENERATION COMMANDS ============

@bot.command(name='emailgen')
async def email_gen(ctx, provider='tempmail'):
    """Generate a temporary email: .emailgen [provider]
    Providers: tempmail, 10minutemail, guerrillamail"""
    
    if provider.lower() not in TEMP_EMAIL_PROVIDERS:
        await ctx.send("❌ Invalid provider!")
        return
    
    async with ctx.typing():
        temp_mail = await temp_email_gen.generate_tempmail(provider.lower())
        
        if not temp_mail:
            await ctx.send("❌ Failed to generate temporary email. Try again!")
            return
        
        email = temp_mail.get('email')
        
        embed = discord.Embed(
            title=f"📧 Email Generated",
            color=discord.Color.green()
        )
        embed.add_field(name="Email Address", value=f"```{email}```", inline=False)
        embed.add_field(name="Next Step", value=f"Use `.emailinbox {email}` to check messages", inline=False)
        embed.set_footer(text="Email expires after 10-15 minutes")
        
        await ctx.send(embed=embed)

@bot.command(name='emailinbox')
async def email_inbox(ctx, email, provider='tempmail'):
    """Check temporary email inbox: .emailinbox <email> [provider]
    Shows all received messages in real-time"""
    
    if provider.lower() not in TEMP_EMAIL_PROVIDERS:
        await ctx.send("❌ Invalid provider!")
        return
    
    async with ctx.typing():
        inbox = await temp_email_gen.get_inbox(email, provider.lower())
        
        if not inbox:
            embed = discord.Embed(
                title=f"📧 Inbox - {email}",
                description="🚿 No messages yet. Checking again in 10 seconds...",
                color=discord.Color.orange()
            )
            msg = await ctx.send(embed=embed)
            
            # Check again after 10 seconds
            await asyncio.sleep(10)
            inbox = await temp_email_gen.get_inbox(email, provider.lower())
        
        if not inbox or len(inbox) == 0:
            embed = discord.Embed(
                title=f"📧 Inbox - {email}",
                description="❌ Inbox is empty",
                color=discord.Color.red()
            )
            await ctx.send(embed=embed)
            return
        
        # Build messages display
        messages_text = ""
        for i, msg_data in enumerate(inbox[:10], 1):  # Show up to 10 messages
            sender = msg_data.get('from', 'Unknown')
            subject = msg_data.get('subject', 'No Subject')
            preview = msg_data.get('body_preview', msg_data.get('body', 'No preview'))[:100]
            time_received = msg_data.get('time', 'Unknown time')
            
            messages_text += f"""
**{i}. From:** {sender}
**Subject:** {subject}
**Preview:** {preview}...
**Time:** {time_received}

"""
        
        embed = discord.Embed(
            title=f"📧 Live Inbox - {email}",
            description=messages_text or "No messages",
            color=discord.Color.blue()
        )
        embed.add_field(
            name="Total Messages",
            value=f"{len(inbox)} message(s)",
            inline=True
        )
        embed.add_field(
            name="Refresh",
            value=f"Use `.emailinbox {email}` to refresh",
            inline=True
        )
        embed.set_footer(text="Messages auto-refresh every 10 seconds")
        
        await ctx.send(embed=embed)

@bot.command(name='emailcheck')
async def email_check(ctx):
    """Show all available email providers"""
    
    providers_list = ', '.join(TEMP_EMAIL_PROVIDERS.keys())
    
    embed = discord.Embed(
        title="📧 Available Providers",
        description=f"Providers: {providers_list}",
        color=discord.Color.gold()
    )
    
    embed.add_field(
        name="Usage",
        value="`.emailgen <provider>` - Generate email\n`.emailinbox <email>` - Check messages",
        inline=False
    )
    embed.set_footer(text="Emails expire after 10-15 minutes")
    
    await ctx.send(embed=embed)

# ============ GENSTART COMMAND - Continuous Generation ============

@bot.command(name='genstart')
async def gen_start(ctx, platform):
    """Start continuous username generation: .genstart <platform>
    Automatically generates random length usernames (3-6 letters)"""
    global generation_running
    
    if generation_running:
        await ctx.send("❌ Generation is already running! Use `.genstop` to stop.")
        return
    
    valid_platforms = ['discord', 'instagram', 'tiktok', 'snapchat', 'roblox', 'facebook']
    if platform.lower() not in valid_platforms:
        await ctx.send(f"❌ Invalid platform! Choose from: {', '.join(valid_platforms)}")
        return
    
    generation_running = True
    embed = discord.Embed(
        title=f"🚀 Starting Continuous {platform.upper()} Generation",
        description="Generating random usernames (3-6 letters) continuously...",
        color=discord.Color.green()
    )
    embed.set_footer(text="Use .genstop to stop generation")
    
    await ctx.send(embed=embed)
    
    count = 0
    check_count = 0
    
    try:
        while generation_running:
            results, filename, length = await check_usernames(platform, None)
            
            if results is None:
                await ctx.send(f"❌ Error: {filename}")
                break
            
            count += 1
            check_count += len(results['available'])
            
            available_list = '\n'.join(results['available']) or "None"
            
            # Send results every batch
            embed = discord.Embed(
                title=f"✅ Batch #{count}",
                color=discord.Color.green()
            )
            embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
            embed.add_field(name="Batch Stats", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
            embed.add_field(name="Total Found", value=f"{check_count}", inline=True)
            
            await ctx.send(embed=embed)
            
            # Wait before next batch
            await asyncio.sleep(5)
    
    except Exception as e:
        logger.error(f"Error in generation loop: {e}")
        await ctx.send(f"❌ Error during generation: {e}")
    finally:
        generation_running = False

@bot.command(name='genstop')
async def gen_stop(ctx):
    """Stop continuous username generation"""
    global generation_running
    
    if not generation_running:
        await ctx.send("❌ No generation is currently running!")
        return
    
    generation_running = False
    embed = discord.Embed(
        title="⛔ Generation Stopped",
        color=discord.Color.red()
    )
    await ctx.send(embed=embed)

# ============ SINGLE CHECK COMMANDS ============

@bot.command(name='gen')
async def discord_gen(ctx):
    """Check Discord usernames: .gen
    Automatically generates random length (3-6 letters)"""
    async with ctx.typing():
        results, filename, length = await check_usernames('discord', ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        taken_list = '\n'.join(results['taken'][:3]) or "None"
        
        embed = discord.Embed(
            title=f"✅ Check Complete",
            color=discord.Color.green()
        )
        embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="Taken", value=f"```{taken_list}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        
        await ctx.send(embed=embed)

@bot.command(name='igen')
async def instagram_gen(ctx):
    """Check Instagram usernames: .igen
    Automatically generates random length (3-6 letters)"""
    async with ctx.typing():
        results, filename, length = await check_usernames('instagram', ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title=f"✅ Check Complete",
            color=discord.Color.from_rgb(229, 45, 168)
        )
        embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        
        await ctx.send(embed=embed)

@bot.command(name='tgen')
async def tiktok_gen(ctx):
    """Check TikTok usernames: .tgen
    Automatically generates random length (3-6 letters)"""
    async with ctx.typing():
        results, filename, length = await check_usernames('tiktok', ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title=f"✅ Check Complete",
            color=discord.Color.from_rgb(0, 0, 0)
        )
        embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        
        await ctx.send(embed=embed)

@bot.command(name='sgen')
async def snapchat_gen(ctx):
    """Check Snapchat usernames: .sgen
    Automatically generates random length (3-6 letters)"""
    async with ctx.typing():
        results, filename, length = await check_usernames('snapchat', ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title=f"✅ Check Complete",
            color=discord.Color.from_rgb(255, 252, 0)
        )
        embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        
        await ctx.send(embed=embed)

@bot.command(name='rgen')
async def roblox_gen(ctx):
    """Check Roblox usernames: .rgen
    Automatically generates random length (3-6 letters)"""
    async with ctx.typing():
        results, filename, length = await check_usernames('roblox', ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title=f"✅ Check Complete",
            color=discord.Color.from_rgb(235, 24, 24)
        )
        embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        
        await ctx.send(embed=embed)

@bot.command(name='fgen')
async def facebook_gen(ctx):
    """Check Facebook usernames: .fgen
    Automatically generates random length (3-6 letters)"""
    async with ctx.typing():
        results, filename, length = await check_usernames('facebook', ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title=f"✅ Check Complete",
            color=discord.Color.from_rgb(59, 89, 152)
        )
        embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        
        await ctx.send(embed=embed)

@bot.command(name='help')
async def help_command(ctx):
    """Show all available commands"""
    embed = discord.Embed(
        title="📋 Commands",
        description="Username checker & Email generator",
        color=discord.Color.gold()
    )
    
    # Username Commands
    embed.add_field(name="Username Checks", value="Auto-generates 3-6 letter usernames", inline=False)
    embed.add_field(name=".gen, .igen, .rgen, .tgen, .sgen, .fgen", value="Single checks", inline=False)
    embed.add_field(name=".genstart <platform>, .genstop", value="Continuous generation", inline=False)
    
    # Email Commands
    embed.add_field(name="Email Generator", value="Generate & check emails", inline=False)
    embed.add_field(name=".emailgen, .emailinbox, .emailcheck", value="Email commands", inline=False)
    
    await ctx.send(embed=embed)

# Run bot
if __name__ == "__main__":
    try:
        bot.run(DISCORD_TOKEN)
    except Exception as e:
        logger.error(f"Error starting bot: {e}")