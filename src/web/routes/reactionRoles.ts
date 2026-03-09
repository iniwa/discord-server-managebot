import { Router } from 'express';
import {
  listReactionRoles,
  createReactionRole,
  updateReactionRole,
  deleteReactionRole,
} from '../../db/queries/reactionRoles';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (_req, res) => {
  res.json(listReactionRoles(GUILD_ID));
});

router.post('/', (req, res) => {
  const { channel_id, message_id, emoji, role_id, label } = req.body;
  if (!channel_id || !message_id || !emoji || !role_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const id = createReactionRole({
      guild_id: GUILD_ID,
      channel_id,
      message_id,
      emoji,
      role_id,
      label: label ?? null,
    });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(409).json({ error: 'Duplicate entry' });
  }
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { channel_id, message_id, emoji, role_id, label } = req.body;
  updateReactionRole(id, { channel_id, message_id, emoji, role_id, label });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  deleteReactionRole(id);
  res.status(204).send();
});

export default router;
