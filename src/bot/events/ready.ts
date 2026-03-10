import { Client } from 'discord.js';
import { startMembersCacheRefresh } from '../cache/membersCache';
import { startGuildCacheRefresh } from '../cache/guildCache';

const GUILD_ID = process.env.DISCORD_GUILD_ID!;

export function registerReady(client: Client): void {
  client.once('ready', async (c) => {
    console.log(`[Bot] Logged in as ${c.user.tag}`);
    try {
      const guild = await c.guilds.fetch(GUILD_ID);
      startGuildCacheRefresh(guild);
      startMembersCacheRefresh(guild);
    } catch (err) {
      console.error('[Bot] Failed to start cache:', err);
    }
  });
}
