import { Router } from 'express';
import { createReactionCheck, getReactionCheck, listReactionChecks, publicReactionCheck, reactionCheckReport } from '../../db/queries/reactionChecks';
import { conflictsWithRole, installCheckReaction, reactionCheckError, syncReactionCheck } from '../../bot/reactionChecks';

const router = Router();
const guildId = () => process.env.DISCORD_GUILD_ID ?? '';
function find(id: string) { return /^[1-9]\d*$/.test(id) ? getReactionCheck(Number(id), guildId()) : undefined; }
function validEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  const text = value.trim();
  if (/^<a?:[A-Za-z0-9_]+:\d+>$/.test(text)) return true;
  // Node 20 supports grapheme segmentation (family emoji, flags and keycaps are one unit).
  const Segmenter = (Intl as unknown as { Segmenter: new (locale: string, options: { granularity: string }) => { segment: (value: string) => Iterable<unknown> } }).Segmenter;
  return [...new Segmenter('en', { granularity: 'grapheme' }).segment(text)].length === 1
    && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200d\ufe0f\u20e3]|[\u{E0020}-\u{E007F}]|[0-9#*])+$/u.test(text)
    && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text);
}

router.get('/', (_req, res) => res.json(listReactionChecks(guildId()).map(publicReactionCheck)));
router.post('/', async (req, res) => {
  const { message_url, emoji, label, mode = 'specific' } = req.body ?? {};
  const match = typeof message_url === 'string' ? /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?(?:\?[^#]*)?$/.exec(message_url.trim()) : null;
  if (!match || match[1] !== guildId() || !['specific', 'any'].includes(mode) || (mode === 'specific' && !validEmoji(emoji)) || (label !== undefined && (typeof label !== 'string' || label.length > 100))) {
    return res.status(400).json({ error: 'このサーバーのメッセージURL、絵文字、100文字以内の管理名を入力してください。' });
  }
  const data = { guild_id: match[1], channel_id: match[2], message_id: match[3], emoji: mode === 'any' ? '' : emoji.trim(), label: label?.trim() || '既読確認', mode: mode as 'any' | 'specific' };
  if (conflictsWithRole(data)) return res.status(409).json({ error: mode === 'any' ? 'このメッセージはロール設定で使用されています。別のメッセージを選択してください。' : '同じメッセージと絵文字はロール設定で使用されています。別の絵文字を選択してください。' });
  let id: number;
  try { id = createReactionCheck(data); } catch { return res.status(409).json({ error: '同じメッセージと絵文字の確認設定が既に存在するか、設定を保存できませんでした。' }); }
  try {
    const check = getReactionCheck(id, guildId())!;
    await syncReactionCheck(check);
    const warning = await installCheckReaction(check);
    const report = reactionCheckReport(getReactionCheck(id, guildId())!);
    return res.status(201).json({ ...report, warning });
  } catch (error) {
    return res.status(502).json({ id, error: '設定は保存しましたが、初回同期に失敗しました。' + reactionCheckError(error) });
  }
});
router.get('/:id', (req, res) => {
  const check = find(req.params.id);
  if (!check) return res.status(404).json({ error: '設定が見つかりません。' });
  return res.json(reactionCheckReport(check));
});
router.post('/:id/sync', async (req, res) => {
  const check = find(req.params.id);
  if (!check) return res.status(404).json({ error: '設定が見つかりません。' });
  try {
    await syncReactionCheck(check);
    const warning = await installCheckReaction(check);
    return res.json({ ...reactionCheckReport(getReactionCheck(check.id, guildId())!), warning });
  } catch (error) { return res.status(502).json({ error: reactionCheckError(error) }); }
});
export default router;
