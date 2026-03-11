import { Router } from 'express';
import { listNicknameConfigs, createNicknameConfig, deleteNicknameConfig } from '../../db/queries/nicknames';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (_req, res) => {
  res.json(listNicknameConfigs(GUILD_ID));
});

router.post('/', (req, res) => {
  const { user_id, voice_channel_id, channel_id, message_id, emoji, nickname, label } = req.body;
  if (!user_id || !voice_channel_id || !channel_id || !message_id || !emoji || !nickname) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const id = createNicknameConfig({
      guild_id: GUILD_ID,
      user_id,
      voice_channel_id,
      channel_id,
      message_id,
      emoji,
      nickname,
      label: label ?? null,
    });
    return res.status(201).json({ id });
  } catch {
    return res.status(409).json({ error: 'Duplicate entry' });
  }
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  deleteNicknameConfig(id);
  res.status(204).send();
});

export default router;
