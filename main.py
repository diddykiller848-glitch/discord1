import os
import json
import random
import string
import asyncio
from datetime import datetime, timedelta
from dotenv import load_dotenv
import discord
from discord.ext import commands, tasks
import aiohttp
import logging

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='.', intents=intents)

DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
CHECK_DELAY = float(os.getenv('CHECK_DELAY', '7.5'))
MIN_LENGTH = int(os.getenv('MIN_LENGTH', '3'))
MAX_LENGTH = int(os.getenv('MAX_LENGTH', '6'))
RESULTS_DIR = os.getenv('RESULTS_DIR', './results')
GEN_COUNT = int(os.getenv('GEN_COUNT', '8'))
EMAIL_REFRESH_MINUTES = 30

os.makedirs(RESULTS_DIR, exist_ok=True)

generation_running = False
user_emails = {}
auto_refresh_tasks = {}

TEMP_EMAIL_PROVIDERS = {
    'tempmail': {'url': 'https://api.tempmail.com/new'},
    '10minutemail': {'url': 'https://10minutemail.com/api/v1/address'},
    'guerrillamail': {'url': 'https://api.guerrillamail.com/ajax.php?f=get_email_address'},
    'yopmail': {'url': 'https://yopmail.com/api/generate'},
    'mailinator': {'url': 'https://api.mailinator.com/v1/generate'}
}

class UsernameChecker:
    def __init__(self):
        self.session = None
    
    async def init_session(self):
        if not self.session:
            self.session = aiohttp.ClientSession()
    
    async def close_session(self):
        if self.session:
            await self.session.close()
    
    def generate_username(self, length):
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=length))
    
    async def check_discord(self, username):
        try:
            async with self.session.get(f'https://discord.com/api/v10/users/search?q={username}', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                return resp.status != 429
        except:
            return None
    
    async def check_instagram(self, username):
        try:
            async with self.session.get(f'https://www.instagram.com/api/v1/users/search/?q={username}', timeout=aiohttp.ClientTimeout(total=5), headers={'User-Agent': 'Instagram 1.0'}) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return len(data.get('users', [])) == 0
        except:
            return None
    
    async def check_tiktok(self, username):
        try:
            async with self.session.get(f'https://www.tiktok.com/api/user/detail/?uniqueId={username}', timeout=aiohttp.ClientTimeout(total=5), headers={'User-Agent': 'Mozilla/5.0'}) as resp:
                return resp.status == 404
        except:
            return None
    
    async def check_snapchat(self, username):
        try:
            async with self.session.get(f'https://api.snapchat.com/v2/usernames/{username}', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                return resp.status == 404
        except:
            return None
    
    async def check_roblox(self, username):
        try:
            async with self.session.post('https://auth.roblox.com/v1/usernames/validate', json={'username': username}, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                data = await resp.json()
                return data.get('valid', False)
        except:
            return None
    
    async def check_facebook(self, username):
        try:
            async with self.session.get(f'https://www.facebook.com/{username}/', timeout=aiohttp.ClientTimeout(total=5), allow_redirects=False) as resp:
                return resp.status == 404
        except:
            return None

class TempEmailGenerator:
    def __init__(self, session):
        self.session = session
    
    async def generate_tempmail(self, provider='tempmail'):
        try:
            if provider == 'tempmail':
                async with self.session.get('https://api.tempmail.com/new', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {'email': data.get('email'), 'token': data.get('token'), 'provider': provider}
            elif provider == '10minutemail':
                async with self.session.get('https://10minutemail.com/api/v1/address', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {'email': data, 'provider': provider}
            elif provider == 'guerrillamail':
                async with self.session.get('https://api.guerrillamail.com/ajax.php?f=get_email_address', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {'email': data.get('email_address'), 'provider': provider}
        except Exception as e:
            logger.error(f"Error generating email: {e}")
        return None
    
    async def get_inbox(self, email, provider='tempmail'):
        try:
            if provider == 'tempmail':
                async with self.session.get(f'https://api.tempmail.com/messages?email={email}', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        return await resp.json()
            elif provider == '10minutemail':
                async with self.session.get(f'https://10minutemail.com/api/v1/messages', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        return await resp.json()
            elif provider == 'guerrillamail':
                async with self.session.get(f'https://api.guerrillamail.com/ajax.php?f=check_email&email_addr={email}', timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        return await resp.json()
        except Exception as e:
            logger.error(f"Error getting inbox: {e}")
        return None

checker = UsernameChecker()
temp_email_gen = None

async def check_usernames(platform, ctx=None):
    length = random.randint(MIN_LENGTH, MAX_LENGTH)
    platform_map = {'discord': checker.check_discord, 'instagram': checker.check_instagram, 'tiktok': checker.check_tiktok, 'snapchat': checker.check_snapchat, 'roblox': checker.check_roblox, 'facebook': checker.check_facebook}
    
    if platform not in platform_map:
        return None, "Invalid platform"
    
    check_func = platform_map[platform]
    usernames = [checker.generate_username(length) for _ in range(GEN_COUNT)]
    results = {'available': [], 'taken': [], 'error': []}
    
    if ctx:
        embed = discord.Embed(title=f"🔍 Checking {platform.upper()} ({length} letters)", description="Starting...", color=discord.Color.blue())
        msg = await ctx.send(embed=embed)
    
    for i, username in enumerate(usernames):
        try:
            is_available = await check_func(username)
            if is_available is True:
                results['available'].append(username)
            elif is_available is False:
                results['taken'].append(username)
            else:
                results['error'].append(username)
            
            if ctx and i % 2 == 0:
                embed.description = f"{i+1}/{GEN_COUNT} checked"
                try:
                    await msg.edit(embed=embed)
                except:
                    pass
            
            if i < len(usernames) - 1:
                await asyncio.sleep(CHECK_DELAY)
        except Exception as e:
            logger.error(f"Error checking {username}: {e}")
            results['error'].append(username)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = os.path.join(RESULTS_DIR, f"{platform}_{length}letter_{timestamp}.json")
    with open(filename, 'w') as f:
        json.dump(results, f, indent=2)
    
    return results, filename, length

async def auto_refresh_inbox(user_id, email, provider, dm_channel, message_id):
    """Auto-refresh inbox for 30 minutes"""
    start_time = datetime.now()
    end_time = start_time + timedelta(minutes=EMAIL_REFRESH_MINUTES)
    refresh_count = 0
    
    while datetime.now() < end_time:
        try:
            await asyncio.sleep(30)  # Refresh every 30 seconds
            
            inbox = await temp_email_gen.get_inbox(email, provider)
            
            if inbox and len(inbox) > 0:
                messages_text = ""
                for i, msg_data in enumerate(inbox[:10], 1):
                    sender = msg_data.get('from', 'Unknown')
                    subject = msg_data.get('subject', 'No Subject')
                    preview = msg_data.get('body_preview', msg_data.get('body', 'No preview'))[:80]
                    messages_text += f"**{i}.** {sender}\n{subject}\n{preview}...\n\n"
                
                time_remaining = (end_time - datetime.now()).total_seconds() / 60
                
                embed = discord.Embed(
                    title="📧 Live Inbox (Auto-Refresh)",
                    description=messages_text or "Empty",
                    color=discord.Color.blue()
                )
                embed.add_field(name="Total", value=f"{len(inbox)} messages", inline=True)
                embed.add_field(name="Time Left", value=f"{int(time_remaining)} min", inline=True)
                embed.set_footer(text=f"Auto-updating... (Refresh #{refresh_count})")
                
                try:
                    msg = await dm_channel.fetch_message(message_id)
                    await msg.edit(embed=embed)
                    refresh_count += 1
                except:
                    break
            
        except Exception as e:
            logger.error(f"Auto-refresh error: {e}")
            break
    
    # Notify user when done
    try:
        embed = discord.Embed(
            title="⏰ Email Monitoring Ended",
            description=f"Auto-refresh for {EMAIL_REFRESH_MINUTES} minutes has completed.",
            color=discord.Color.orange()
        )
        await dm_channel.send(embed=embed)
    except:
        pass

@bot.event
async def on_ready():
    global temp_email_gen
    await checker.init_session()
    temp_email_gen = TempEmailGenerator(checker.session)
    logger.info(f'✅ Bot logged in as {bot.user}')
    print(f'✅ Bot is running!')

@bot.command(name='emailgen')
async def email_gen(ctx, provider='tempmail'):
    """Generate temp email"""
    if provider.lower() not in TEMP_EMAIL_PROVIDERS:
        await ctx.send("❌ Invalid provider!")
        return
    
    async with ctx.typing():
        temp_mail = await temp_email_gen.generate_tempmail(provider.lower())
        if not temp_mail:
            await ctx.send("❌ Failed to generate email")
            return
        
        email = temp_mail.get('email')
        user_emails[ctx.author.id] = {'email': email, 'provider': provider.lower()}
        
        embed = discord.Embed(title="📧 Email Generated", color=discord.Color.green())
        embed.add_field(name="Email", value=f"```{email}```", inline=False)
        embed.add_field(name="Check", value="Use `.emailinbox` in DM to start 30-min auto-refresh", inline=False)
        
        await ctx.author.send(embed=embed)
        await ctx.send("✅ Email sent to your DM!")

@bot.command(name='emailinbox')
async def email_inbox(ctx):
    """Check email inbox with 30-min auto-refresh in DM"""
    if ctx.author.id not in user_emails:
        await ctx.author.send("❌ Generate an email first: `.emailgen`")
        return
    
    email_data = user_emails[ctx.author.id]
    email = email_data['email']
    provider = email_data['provider']
    
    async with ctx.typing():
        inbox = await temp_email_gen.get_inbox(email, provider)
        
        if not inbox:
            embed = discord.Embed(title="📧 Inbox", description="🚿 Checking... (retry in 10s)", color=discord.Color.orange())
            msg = await ctx.author.send(embed=embed)
            await asyncio.sleep(10)
            inbox = await temp_email_gen.get_inbox(email, provider)
        
        if not inbox or len(inbox) == 0:
            embed = discord.Embed(title="📧 Inbox", description="❌ Empty", color=discord.Color.red())
            msg = await ctx.author.send(embed=embed)
            
            # Still start auto-refresh even if empty
            task = asyncio.create_task(auto_refresh_inbox(ctx.author.id, email, provider, ctx.author.dm_channel, msg.id))
            auto_refresh_tasks[ctx.author.id] = task
            
            await ctx.send("✅ Inbox monitoring started! (Will auto-refresh for 30 min)")
            return
        
        messages_text = ""
        for i, msg_data in enumerate(inbox[:10], 1):
            sender = msg_data.get('from', 'Unknown')
            subject = msg_data.get('subject', 'No Subject')
            preview = msg_data.get('body_preview', msg_data.get('body', 'No preview'))[:80]
            messages_text += f"**{i}.** {sender}\n{subject}\n{preview}...\n\n"
        
        embed = discord.Embed(
            title="📧 Live Inbox (Auto-Refresh Starting)",
            description=messages_text or "Empty",
            color=discord.Color.blue()
        )
        embed.add_field(name="Total", value=f"{len(inbox)} messages", inline=True)
        embed.add_field(name="Time Left", value=f"{EMAIL_REFRESH_MINUTES} min", inline=True)
        embed.set_footer(text="Starting auto-refresh...")
        
        msg = await ctx.author.send(embed=embed)
        
        # Start auto-refresh task
        task = asyncio.create_task(auto_refresh_inbox(ctx.author.id, email, provider, ctx.author.dm_channel, msg.id))
        auto_refresh_tasks[ctx.author.id] = task
        
        await ctx.send(f"✅ Inbox monitoring started for {EMAIL_REFRESH_MINUTES} minutes!")

@bot.command(name='emailstop')
async def email_stop(ctx):
    """Stop auto-refresh for current email"""
    if ctx.author.id in auto_refresh_tasks:
        auto_refresh_tasks[ctx.author.id].cancel()
        del auto_refresh_tasks[ctx.author.id]
        embed = discord.Embed(title="⏹️ Monitoring Stopped", description="Email auto-refresh has been stopped.", color=discord.Color.red())
        await ctx.author.send(embed=embed)
        await ctx.send("✅ Email monitoring stopped!")
    else:
        await ctx.author.send("❌ No active email monitoring")

@bot.command(name='emailcheck')
async def email_check(ctx):
    """Show email providers"""
    providers_list = ', '.join(TEMP_EMAIL_PROVIDERS.keys())
    embed = discord.Embed(title="📧 Providers", description=providers_list, color=discord.Color.gold())
    embed.add_field(name="Features", value=f"• 30-min auto-refresh\n• Live inbox updates\n• Every 30 seconds", inline=False)
    await ctx.author.send(embed=embed)

@bot.command(name='genstart')
async def gen_start(ctx, platform):
    """Start continuous generation"""
    global generation_running
    if generation_running:
        await ctx.send("❌ Already running!")
        return
    
    valid_platforms = ['discord', 'instagram', 'tiktok', 'snapchat', 'roblox', 'facebook']
    if platform.lower() not in valid_platforms:
        await ctx.send(f"❌ Invalid! Choose: {', '.join(valid_platforms)}")
        return
    
    generation_running = True
    embed = discord.Embed(title=f"🚀 {platform.upper()} Generation", description="Started...", color=discord.Color.green())
    await ctx.send(embed=embed)
    
    count = 0
    check_count = 0
    
    try:
        while generation_running:
            results, filename, length = await check_usernames(platform, None)
            if results is None:
                break
            
            count += 1
            check_count += len(results['available'])
            available_list = '\n'.join(results['available']) or "None"
            
            embed = discord.Embed(title=f"✅ Batch #{count}", color=discord.Color.green())
            embed.add_field(name="Available", value=f"```{available_list}```", inline=False)
            embed.add_field(name="Batch", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
            embed.add_field(name="Total", value=f"{check_count}", inline=True)
            
            await ctx.send(embed=embed)
            await asyncio.sleep(5)
    finally:
        generation_running = False

@bot.command(name='genstop')
async def gen_stop(ctx):
    """Stop generation"""
    global generation_running
    if not generation_running:
        await ctx.send("❌ Not running!")
        return
    generation_running = False
    await ctx.send("⛔ Stopped")

@bot.command(name='gen')
async def discord_gen(ctx):
    """Check Discord"""
    async with ctx.typing():
        results, _, _ = await check_usernames('discord', ctx)
        if results is None:
            await ctx.send("❌ Error")
            return
        embed = discord.Embed(title="✅ Check Complete", color=discord.Color.green())
        embed.add_field(name="Available", value=f"```{'\n'.join(results['available']) or 'None'}```", inline=False)
        embed.add_field(name="Summary", value=f"{len(results['available'])}/{GEN_COUNT}", inline=True)
        await ctx.send(embed=embed)

@bot.command(name='igen')
async def instagram_gen(ctx):
    async with ctx.typing():
        results, _, _ = await check_usernames('instagram', ctx)
        if results is None:
            await ctx.send("❌ Error")
            return
        embed = discord.Embed(title="✅ Check Complete", color=discord.Color.from_rgb(229, 45, 168))
        embed.add_field(name="Available", value=f"```{'\n'.join(results['available']) or 'None'}```", inline=False)
        await ctx.send(embed=embed)

@bot.command(name='tgen')
async def tiktok_gen(ctx):
    async with ctx.typing():
        results, _, _ = await check_usernames('tiktok', ctx)
        if results is None:
            await ctx.send("❌ Error")
            return
        embed = discord.Embed(title="✅ Check Complete", color=discord.Color.from_rgb(0, 0, 0))
        embed.add_field(name="Available", value=f"```{'\n'.join(results['available']) or 'None'}```", inline=False)
        await ctx.send(embed=embed)

@bot.command(name='sgen')
async def snapchat_gen(ctx):
    async with ctx.typing():
        results, _, _ = await check_usernames('snapchat', ctx)
        if results is None:
            await ctx.send("❌ Error")
            return
        embed = discord.Embed(title="✅ Check Complete", color=discord.Color.from_rgb(255, 252, 0))
        embed.add_field(name="Available", value=f"```{'\n'.join(results['available']) or 'None'}```", inline=False)
        await ctx.send(embed=embed)

@bot.command(name='rgen')
async def roblox_gen(ctx):
    async with ctx.typing():
        results, _, _ = await check_usernames('roblox', ctx)
        if results is None:
            await ctx.send("❌ Error")
            return
        embed = discord.Embed(title="✅ Check Complete", color=discord.Color.from_rgb(235, 24, 24))
        embed.add_field(name="Available", value=f"```{'\n'.join(results['available']) or 'None'}```", inline=False)
        await ctx.send(embed=embed)

@bot.command(name='fgen')
async def facebook_gen(ctx):
    async with ctx.typing():
        results, _, _ = await check_usernames('facebook', ctx)
        if results is None:
            await ctx.send("❌ Error")
            return
        embed = discord.Embed(title="✅ Check Complete", color=discord.Color.from_rgb(59, 89, 152))
        embed.add_field(name="Available", value=f"```{'\n'.join(results['available']) or 'None'}```", inline=False)
        await ctx.send(embed=embed)

@bot.command(name='help')
async def help_command(ctx):
    embed = discord.Embed(title="📋 Commands", color=discord.Color.gold())
    embed.add_field(name="Username", value=".gen, .igen, .rgen, .tgen, .sgen, .fgen", inline=False)
    embed.add_field(name="Generation", value=".genstart <platform> | .genstop", inline=False)
    embed.add_field(name="Email (DM)", value=".emailgen | .emailinbox | .emailstop | .emailcheck", inline=False)
    embed.add_field(name="📧 Email Features", value="• Auto-refresh inbox for 30 min\n• Updates every 30 sec\n• Shows message count & time left", inline=False)
    await ctx.send(embed=embed)

if __name__ == "__main__":
    try:
        bot.run(DISCORD_TOKEN)
    except Exception as e:
        logger.error(f"Error: {e}")