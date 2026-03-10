import { Router } from 'express';
import { getMembers, getCacheStatus, forceRefreshMembers } from '../../bot/cache/membersCache';

const router = Router();

router.get('/', (req, res) => {
  const withoutRole = req.query.without_role as string | undefined;
  const members = getMembers();

  const result = withoutRole
    ? members.filter((m) => !m.roles.some((r) => r.id === withoutRole))
    : members;

  res.json(result);
});

router.get('/cache-status', (_req, res) => {
  res.json(getCacheStatus());
});

router.post('/refresh', async (_req, res) => {
  try {
    await forceRefreshMembers();
    res.json(getCacheStatus());
  } catch (err) {
    res.status(503).json({ error: String(err) });
  }
});

export default router;
