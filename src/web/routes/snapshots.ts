import { Router } from 'express';
import { getClient } from '../../bot/index';
import {
  listSnapshots,
  getSnapshot,
  getSnapshotEntries,
  getSnapshotMembersByRole,
  deleteSnapshot,
} from '../../db/queries/roleSnapshots';
import { takeRoleSnapshot } from '../../bot/tasks/roleSnapshot';
import { refreshGuildCache } from '../../bot/cache/guildCache';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (_req, res) => {
  res.json(listSnapshots(GUILD_ID));
});

router.post('/', async (req, res) => {
  try {
    const client = getClient();
    const guild = await client.guilds.fetch(GUILD_ID);
    const note: string | undefined = req.body?.note;
    const id = await takeRoleSnapshot(guild, note);
    // スナップショット取得のついでにキャッシュも更新する
    refreshGuildCache(guild).catch((e) => console.error('[Snapshots] Cache refresh failed:', e));
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const snapshot = getSnapshot(id);
  if (!snapshot) return res.status(404).json({ error: 'Not found' });
  const entries = getSnapshotEntries(id);
  const membersByRole = getSnapshotMembersByRole(id);
  const entriesWithMembers = entries.map((e) => ({
    ...e,
    members: membersByRole.get(e.role_id) ?? [],
  }));
  return res.json({ ...snapshot, entries: entriesWithMembers });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  deleteSnapshot(id);
  res.status(204).send();
});

export default router;
