import { Router } from 'express';
import { listLeaveLogs } from '../../db/queries/leaveLog';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));
  const { rows, total } = listLeaveLogs(GUILD_ID, page, limit);
  res.json({ rows, total, page, limit });
});

export default router;
