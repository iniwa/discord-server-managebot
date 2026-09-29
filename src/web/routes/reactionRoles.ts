import { randomUUID } from 'crypto';
import { Router } from 'express';
import {
  listReactionRoles,
  createReactionRole,
  updateReactionRole,
  deleteReactionRole,
} from '../../db/queries/reactionRoles';
import { publishRoleButton, roleButtonMessageUrl, roleButtonPublishError } from '../../bot/roleButtons';

const router = Router();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

function fields(body: unknown, previousContent: string | null = null) {
  if (!body || typeof body !== 'object') return null;
  const { channel_id, emoji, role_id, label, message_content } = body as Record<string, unknown>;
  if (typeof channel_id !== 'string' || !channel_id.trim()
    || (emoji !== undefined && typeof emoji !== 'string')
    || typeof role_id !== 'string' || !role_id.trim()
    || (message_content !== undefined && message_content !== null && (typeof message_content !== 'string' || message_content.length > 2000))
    || (label !== undefined && label !== null && typeof label !== 'string')) return null;
  return { channel_id: channel_id.trim(), emoji: typeof emoji === 'string' ? emoji.trim() : '', role_id: role_id.trim(), label: typeof label === 'string' ? label : null, message_content: message_content === undefined ? previousContent : (typeof message_content === 'string' ? message_content.trim() || null : null) };
}

function findConfig(rawId: string) {
  if (!/^[1-9]\d*$/.test(rawId)) return undefined;
  return listReactionRoles(GUILD_ID).find((config) => config.id === Number(rawId));
}

router.get('/', (_req, res) => {
  res.json(listReactionRoles(GUILD_ID));
});

router.post('/', async (req, res) => {
  const data = fields(req.body);
  if (!data) return res.status(400).json({ error: '投稿先とロールを選択し、本文は2000文字以内で入力してください。' });
  let id: number;
  try {
    id = createReactionRole({ guild_id: GUILD_ID, ...data, message_id: randomUUID() });
  } catch {
    return res.status(409).json({ error: '設定を保存できませんでした。一覧を更新して再試行してください。' });
  }
  try {
    const config = listReactionRoles(GUILD_ID).find((entry) => entry.id === id)!;
    const message_id = await publishRoleButton('reaction', config);
    return res.status(201).json({ id, message_id, message_url: roleButtonMessageUrl(GUILD_ID, config.channel_id, message_id) });
  } catch (error) {
    deleteReactionRole(id);
    return res.status(502).json({ error: roleButtonPublishError(error) + ' 設定は作成されていません。' });
  }
});

router.put('/:id', async (req, res) => {
  const config = findConfig(req.params.id);
  if (!config) return res.status(404).json({ error: '設定が見つかりません。一覧を更新してください。' });
  const data = fields(req.body, config.message_content ?? null);
  if (!data) return res.status(400).json({ error: '投稿先とロールを選択し、本文は2000文字以内で入力してください。' });
  const message_id = randomUUID();
  try {
    // Invalidate the old button before publishing, including when publishing fails.
    updateReactionRole(config.id, { ...data, message_id });
  } catch {
    return res.status(409).json({ error: '設定を保存できませんでした。一覧を更新して再試行してください。' });
  }
  try {
    const publishedId = await publishRoleButton('reaction', { ...config, ...data, message_id });
    return res.json({ ok: true, id: config.id, message_id: publishedId, message_url: roleButtonMessageUrl(GUILD_ID, data.channel_id, publishedId) });
  } catch (error) {
    return res.status(502).json({ error: '設定は保存しましたが、投稿は完了していません。' + roleButtonPublishError(error) });
  }
});

router.post('/:id/publish', async (req, res) => {
  const config = findConfig(req.params.id);
  if (!config) return res.status(404).json({ error: '設定が見つかりません。一覧を更新してください。' });
  try {
    const message_id = await publishRoleButton('reaction', config);
    return res.json({ ok: true, id: config.id, message_id, message_url: roleButtonMessageUrl(GUILD_ID, config.channel_id, message_id) });
  } catch (error) {
    return res.status(502).json({ error: roleButtonPublishError(error) });
  }
});

router.delete('/:id', (req, res) => {
  const config = findConfig(req.params.id);
  if (!config) return res.status(404).json({ error: '設定が見つかりません。一覧を更新してください。' });
  deleteReactionRole(config.id);
  return res.status(204).send();
});

export default router;
