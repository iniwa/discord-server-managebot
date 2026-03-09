import 'dotenv/config';
import { getDb } from './db/index';
import { startServer } from './web/server';
import { startBot } from './bot/index';

const TOKEN = process.env.DISCORD_TOKEN;
const PORT = parseInt(process.env.PORT || '3002', 10);

if (!TOKEN) {
  console.error('[Fatal] DISCORD_TOKEN is not set');
  process.exit(1);
}

if (!process.env.DISCORD_GUILD_ID) {
  console.error('[Fatal] DISCORD_GUILD_ID is not set');
  process.exit(1);
}

// 1. Initialize DB
getDb();
console.log('[DB] Initialized');

// 2. Start Web server
startServer(PORT);

// 3. Start Discord bot
startBot(TOKEN).catch((err) => {
  console.error('[Bot] Failed to start:', err);
  process.exit(1);
});
