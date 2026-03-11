import { Router } from 'express';
import { GuildTextBasedChannel } from 'discord.js';
import {
  listStatusRoles,
  createStatusRole,
  updateStatusRole,
  deleteStatusRole,
} from '../../db/queries/statusRoles';
import { getClient } from '../../bot/index';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

router.get('/', (_req, res) => {
  res.json(listStatusRoles(GUILD_ID));
});

router.post('/', async (req, res) => {
  const { channel_id, message_id, emoji, role_id, label } = req.body;
  if (!channel_id || !message_id || !emoji || !role_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const id = createStatusRole({ guild_id: GUILD_ID, channel_id, message_id, emoji, role_id, label: label ?? null });

    // 設定後、BOTが対象メッセージにリアクションを付与する
    try {
      const client = getClient();
      const channel = await client.channels.fetch(channel_id);
      if (channel && channel.isTextBased() && !channel.isDMBased()) {
        const msg = await (channel as GuildTextBasedChannel).messages.fetch(message_id);
        await msg.react(emoji);
        console.log(`[StatusRole] Bot reacted ${emoji} on message ${message_id}`);
      }
    } catch (err) {
      console.warn('[StatusRole] Could not add bot reaction:', err);
    }

    return res.status(201).json({ id });
  } catch {
    return res.status(409).json({ error: 'Duplicate entry' });
  }
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { channel_id, message_id, emoji, role_id, label } = req.body;
  updateStatusRole(id, { channel_id, message_id, emoji, role_id, label });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);

  // 削除前にBOTのリアクションを除去する
  try {
    const all = listStatusRoles(GUILD_ID);
    const config = all.find((r) => r.id === id);
    if (config) {
      const client = getClient();
      const channel = await client.channels.fetch(config.channel_id);
      if (channel && channel.isTextBased() && !channel.isDMBased()) {
        const msg = await (channel as GuildTextBasedChannel).messages.fetch(config.message_id);
        const botReaction = msg.reactions.cache.find((r) => {
          const emojiStr = r.emoji.id ? `<:${r.emoji.name}:${r.emoji.id}>` : r.emoji.name;
          return emojiStr === config.emoji;
        });
        if (botReaction) await botReaction.users.remove(client.user!.id);
      }
    }
  } catch (err) {
    console.warn('[StatusRole] Could not remove bot reaction:', err);
  }

  deleteStatusRole(id);
  res.status(204).send();
});

export default router;
