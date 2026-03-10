import { Router } from 'express';
import { getRoles, getChannels, getEmojis, forceRefreshGuildCache } from '../../bot/cache/guildCache';

const router = Router();

router.get('/roles', (_req, res) => {
  res.json(getRoles());
});

router.get('/channels', (_req, res) => {
  res.json(getChannels());
});

router.get('/emojis', (_req, res) => {
  res.json(getEmojis());
});

router.post('/refresh', async (_req, res) => {
  try {
    await forceRefreshGuildCache();
    res.json({ roles: getRoles().length, channels: getChannels().length, emojis: getEmojis().length });
  } catch (err) {
    res.status(503).json({ error: String(err) });
  }
});

export default router;
