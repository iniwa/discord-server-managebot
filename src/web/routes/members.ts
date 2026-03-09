import { Router } from 'express';
import { getClient } from '../../bot/index';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', async (req, res) => {
  try {
    const client = getClient();
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    const withoutRole = req.query.without_role as string | undefined;

    const result = members
      .filter((m) => !m.user.bot)
      .filter((m) => !withoutRole || !m.roles.cache.has(withoutRole))
      .map((m) => ({
        id: m.id,
        username: m.user.username,
        display_name: m.displayName,
        joined_at: m.joinedAt?.toISOString() ?? null,
        roles: m.roles.cache
          .filter((r) => r.id !== guild.id)
          .map((r) => ({ id: r.id, name: r.name })),
      }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
