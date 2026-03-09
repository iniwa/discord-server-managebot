import { Router } from 'express';
import { getClient } from '../../bot/index';
import { ChannelType } from 'discord.js';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/roles', async (_req, res) => {
  try {
    const client = getClient();
    const guild = await client.guilds.fetch(GUILD_ID);
    const roles = await guild.roles.fetch();
    const result = roles
      .filter((r) => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/channels', async (_req, res) => {
  try {
    const client = getClient();
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    const result = channels
      .filter((c) => c !== null)
      .map((c) => ({
        id: c!.id,
        name: c!.name,
        type: c!.type,
        isVoice: c!.type === ChannelType.GuildVoice || c!.type === ChannelType.GuildStageVoice,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
