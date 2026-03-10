import { Router } from 'express';
import { listBotLogs } from '../../db/queries/botLogs';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
  res.json(listBotLogs(GUILD_ID, page, limit));
});

export default router;
