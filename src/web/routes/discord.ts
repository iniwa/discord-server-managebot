import { Router } from 'express';
import { getRoles, getChannels, getEmojis } from '../../bot/cache/guildCache';

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

export default router;
