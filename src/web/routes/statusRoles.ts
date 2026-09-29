import { randomUUID } from 'crypto';
import { Router } from 'express';
import {
  listStatusRoles,
  createStatusRole,
  updateStatusRole,
  deleteStatusRole,
} from '../../db/queries/statusRoles';
import { publishRoleButton } from '../../bot/roleButtons';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

function fields(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const { channel_id, emoji, role_id, label } = body as Record<string, unknown>;
  if (typeof channel_id !== 'string' || !channel_id.trim()
    || typeof emoji !== 'string' || !emoji.trim()
    || typeof role_id !== 'string' || !role_id.trim()
    || (label !== undefined && label !== null && typeof label !== 'string')) return null;
  return { channel_id: channel_id.trim(), emoji: emoji.trim(), role_id: role_id.trim(), label: typeof label === 'string' ? label : null };
}

function findConfig(rawId: string) {
  if (!/^[1-9]\d*$/.test(rawId)) return undefined;
  return listStatusRoles(GUILD_ID).find((config) => config.id === Number(rawId));
}

router.get('/', (_req, res) => {
  res.json(listStatusRoles(GUILD_ID));
});

router.post('/', async (req, res) => {
  const data = fields(req.body);
  if (!data) return res.status(400).json({ error: 'Invalid required fields' });
  let id: number;
  try {
    id = createStatusRole({ guild_id: GUILD_ID, ...data, message_id: randomUUID() });
  } catch {
    return res.status(409).json({ error: 'Could not save role configuration' });
  }
  try {
    const config = listStatusRoles(GUILD_ID).find((entry) => entry.id === id)!;
    await publishRoleButton('status', config);
    return res.status(201).json({ id });
  } catch {
    deleteStatusRole(id);
    return res.status(502).json({ error: 'ボタンを投稿できませんでした。チャンネル・ロール・Botの権限を確認してください。設定は作成されていません。' });
  }
});

router.put('/:id', async (req, res) => {
  const config = findConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'Role configuration not found' });
  const data = fields(req.body);
  if (!data) return res.status(400).json({ error: 'Invalid required fields' });
  const message_id = randomUUID();
  try {
    // Invalidate the old button before publishing, including when publishing fails.
    updateStatusRole(config.id, { ...data, message_id });
  } catch {
    return res.status(409).json({ error: 'Could not save role configuration' });
  }
  try {
    await publishRoleButton('status', { ...config, ...data, message_id });
    return res.json({ ok: true });
  } catch {
    return res.status(502).json({ error: '設定は保存しましたが、ボタンを投稿できませんでした。チャンネル・ロール・Botの権限を確認し、再投稿してください。' });
  }
});

router.post('/:id/publish', async (req, res) => {
  const config = findConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'Role configuration not found' });
  try {
    const message_id = await publishRoleButton('status', config);
    return res.json({ ok: true, message_id });
  } catch {
    return res.status(502).json({ error: 'ボタンを投稿できませんでした。チャンネル・ロール・Botの権限を確認してください。' });
  }
});

router.delete('/:id', (req, res) => {
  const config = findConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'Role configuration not found' });
  deleteStatusRole(config.id);
  return res.status(204).send();
});

export default router;
