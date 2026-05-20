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
GEN_COUNT = int(os.getenv('GEN_COUNT', '8'))  # How many usernames to generate per check

# Create results directory if it doesn't exist
os.makedirs(RESULTS_DIR, exist_ok=True)

# Global variable to track if generation is running
generation_running = False
generation_task = None

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

checker = UsernameChecker()

async def check_usernames(platform, length=None, ctx=None):
    """Check usernames with proper rate limiting"""
    
    if length:
        try:
            length = int(length)
            if length < MIN_LENGTH or length > MAX_LENGTH:
                return None, f"Length must be between {MIN_LENGTH}-{MAX_LENGTH}"
        except:
            return None, "Invalid length format"
    else:
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
    
    return results, filename

@bot.event
async def on_ready():
    """Bot ready event"""
    await checker.init_session()
    logger.info(f'✅ Bot logged in as {bot.user}')
    print(f'✅ Bot is running!')

# GENSTART COMMAND - Continuous Generation
@bot.command(name='genstart')
async def gen_start(ctx, platform, length=None):
    """Start continuous username generation: .genstart <platform> [length]"""
    global generation_running, generation_task
    
    if generation_running:
        await ctx.send("❌ Generation is already running! Use `.genstop` to stop.")
        return
    
    valid_platforms = ['discord', 'instagram', 'tiktok', 'snapchat', 'roblox', 'facebook']
    if platform.lower() not in valid_platforms:
        await ctx.send(f"❌ Invalid platform! Choose from: {', '.join(valid_platforms)}")
        return
    
    if length:
        try:
            length = int(length)
            if length < MIN_LENGTH or length > MAX_LENGTH:
                await ctx.send(f"❌ Length must be between {MIN_LENGTH}-{MAX_LENGTH}")
                return
        except:
            await ctx.send("❌ Invalid length format")
            return
    
    generation_running = True
    embed = discord.Embed(
        title=f"🚀 Starting Continuous {platform.upper()} Generation",
        description="Generating usernames continuously...",
        color=discord.Color.green()
    )
    embed.add_field(name="Platform", value=platform.upper(), inline=True)
    embed.add_field(name="Length", value=length or "Random (3-6)", inline=True)
    embed.set_footer(text="Use .genstop to stop generation")
    
    await ctx.send(embed=embed)
    
    count = 0
    check_count = 0
    
    try:
        while generation_running:
            results, filename = await check_usernames(platform, length, None)
            
            if results is None:
                await ctx.send(f"❌ Error: {filename}")
                break
            
            count += 1
            check_count += len(results['available'])
            
            available_list = '\n'.join(results['available']) or "None"
            
            # Send results every batch
            embed = discord.Embed(
                title=f"✅ Batch #{count} - {platform.upper()} Usernames Found",
                color=discord.Color.green()
            )
            embed.add_field(name="🟢 Available Usernames", value=f"```{available_list}```", inline=False)
            embed.add_field(name="📊 Batch Stats", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
            embed.add_field(name="📈 Total Found", value=f"{check_count} usernames", inline=True)
            embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
            
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
        description="Continuous username generation has been stopped.",
        color=discord.Color.red()
    )
    await ctx.send(embed=embed)

# SINGLE CHECK COMMANDS
@bot.command(name='gen')
async def discord_gen(ctx, length=None):
    """Check Discord usernames: .gen [length]"""
    async with ctx.typing():
        results, filename = await check_usernames('discord', length, ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        taken_list = '\n'.join(results['taken'][:3]) or "None"
        
        embed = discord.Embed(
            title="✅ Discord Username Check Complete",
            color=discord.Color.green()
        )
        embed.add_field(name="🟢 Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="🔴 Taken", value=f"```{taken_list}```", inline=False)
        embed.add_field(name="📊 Summary", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
        embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
        
        await ctx.send(embed=embed)

@bot.command(name='igen')
async def instagram_gen(ctx, length=None):
    """Check Instagram usernames: .igen [length]"""
    async with ctx.typing():
        results, filename = await check_usernames('instagram', length, ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title="📸 Instagram Username Check Complete",
            color=discord.Color.from_rgb(229, 45, 168)
        )
        embed.add_field(name="🟢 Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="📊 Summary", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
        embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
        
        await ctx.send(embed=embed)

@bot.command(name='tgen')
async def tiktok_gen(ctx, length=None):
    """Check TikTok usernames: .tgen [length]"""
    async with ctx.typing():
        results, filename = await check_usernames('tiktok', length, ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title="🎵 TikTok Username Check Complete",
            color=discord.Color.from_rgb(0, 0, 0)
        )
        embed.add_field(name="🟢 Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="📊 Summary", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
        embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
        
        await ctx.send(embed=embed)

@bot.command(name='sgen')
async def snapchat_gen(ctx, length=None):
    """Check Snapchat usernames: .sgen [length]"""
    async with ctx.typing():
        results, filename = await check_usernames('snapchat', length, ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title="👻 Snapchat Username Check Complete",
            color=discord.Color.from_rgb(255, 252, 0)
        )
        embed.add_field(name="🟢 Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="📊 Summary", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
        embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
        
        await ctx.send(embed=embed)

@bot.command(name='rgen')
async def roblox_gen(ctx, length=None):
    """Check Roblox usernames: .rgen [length]"""
    async with ctx.typing():
        results, filename = await check_usernames('roblox', length, ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title="🎮 Roblox Username Check Complete",
            color=discord.Color.from_rgb(235, 24, 24)
        )
        embed.add_field(name="🟢 Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="📊 Summary", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
        embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
        
        await ctx.send(embed=embed)

@bot.command(name='fgen')
async def facebook_gen(ctx, length=None):
    """Check Facebook usernames: .fgen [length]"""
    async with ctx.typing():
        results, filename = await check_usernames('facebook', length, ctx)
        if results is None:
            await ctx.send(f"❌ Error: {filename}")
            return
        
        available_list = '\n'.join(results['available']) or "None"
        
        embed = discord.Embed(
            title="f Facebook Username Check Complete",
            color=discord.Color.from_rgb(59, 89, 152)
        )
        embed.add_field(name="🟢 Available", value=f"```{available_list}```", inline=False)
        embed.add_field(name="📊 Summary", value=f"Available: {len(results['available'])}/{GEN_COUNT}", inline=True)
        embed.set_footer(text=f"Saved to: {os.path.basename(filename)}")
        
        await ctx.send(embed=embed)

@bot.command(name='help')
async def help_command(ctx):
    """Show all available commands"""
    embed = discord.Embed(
        title="📋 Username Checker Bot Commands",
        description="Check username availability across platforms",
        color=discord.Color.gold()
    )
    
    # Single Check Commands
    embed.add_field(name="🔍 Single Checks", value="Check once and get results", inline=False)
    embed.add_field(name=".gen [length]", value="Discord usernames", inline=False)
    embed.add_field(name=".igen [length]", value="Instagram usernames", inline=False)
    embed.add_field(name=".tgen [length]", value="TikTok usernames", inline=False)
    embed.add_field(name=".sgen [length]", value="Snapchat usernames", inline=False)
    embed.add_field(name=".rgen [length]", value="Roblox usernames", inline=False)
    embed.add_field(name=".fgen [length]", value="Facebook usernames", inline=False)
    
    # Continuous Generation
    embed.add_field(name="🚀 Continuous Generation", value="Keep checking until you stop", inline=False)
    embed.add_field(name=".genstart <platform> [length]", value="Start continuous generation", inline=False)
    embed.add_field(name=".genstop", value="Stop continuous generation", inline=False)
    
    embed.set_footer(text="[length] = 3-6 characters (optional, defaults to random)")
    
    await ctx.send(embed=embed)

# Run bot
if __name__ == "__main__":
    try:
        bot.run(DISCORD_TOKEN)
    except Exception as e:
        logger.error(f"Error starting bot: {e}")