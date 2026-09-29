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
  const input = body as Record<string, unknown>;
  const { channel_id, message_content } = input;
  if (typeof channel_id !== 'string' || !channel_id.trim()
    || (message_content !== undefined && message_content !== null && (typeof message_content !== 'string' || message_content.length > 2000))) return null;
  const rawButtons = input.buttons === undefined ? [input] : input.buttons;
  if (!Array.isArray(rawButtons) || rawButtons.length < 1 || rawButtons.length > 25) return null;
  const buttons: { role_id: string; emoji: string; label: string | null }[] = [];
  for (const raw of rawButtons) {
    if (!raw || typeof raw !== 'object') return null;
    const { role_id, emoji, label } = raw as Record<string, unknown>;
    if (typeof role_id !== 'string' || !role_id.trim()
      || (emoji !== undefined && typeof emoji !== 'string')
      || (label !== undefined && label !== null && (typeof label !== 'string' || label.length > 80))) return null;
    if (buttons.some((button) => button.role_id === role_id.trim())) return null;
    buttons.push({ role_id: role_id.trim(), emoji: typeof emoji === 'string' ? emoji.trim() : '', label: typeof label === 'string' ? label.trim() || null : null });
  }
  return { channel_id: channel_id.trim(), ...buttons[0], buttons,
    message_content: message_content === undefined ? previousContent : (typeof message_content === 'string' ? message_content.trim() || null : null) };
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
  if (!data) return res.status(400).json({ error: '投稿先と1〜25個のボタンを設定してください。ロールの重複は不可、ボタン名は80文字、本文は2000文字以内です。' });
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
  if (!data) return res.status(400).json({ error: '投稿先と1〜25個のボタンを設定してください。ロールの重複は不可、ボタン名は80文字、本文は2000文字以内です。' });
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
