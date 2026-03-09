import { Router } from 'express';
import {
  listVoiceRoles,
  createVoiceRole,
  updateVoiceRole,
  deleteVoiceRole,
} from '../../db/queries/voiceRoles';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (_req, res) => {
  res.json(listVoiceRoles(GUILD_ID));
});

router.post('/', (req, res) => {
  const { channel_id, role_id, label } = req.body;
  if (!channel_id || !role_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const id = createVoiceRole({
      guild_id: GUILD_ID,
      channel_id,
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
  const { channel_id, role_id, label } = req.body;
  updateVoiceRole(id, { channel_id, role_id, label });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  deleteVoiceRole(id);
  res.status(204).send();
});

export default router;
