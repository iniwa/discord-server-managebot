import { getDb } from '../index';
import type { NicknameConfig } from '../../types/index';

export function listNicknameConfigs(guildId: string): NicknameConfig[] {
  return getDb()
    .prepare('SELECT * FROM nickname_configs WHERE guild_id = ? ORDER BY created_at DESC')
    .all(guildId) as NicknameConfig[];
}

export function getNicknameConfigByReaction(
  messageId: string,
  emoji: string,
  userId: string,
): NicknameConfig | null {
  return (
    (getDb()
      .prepare('SELECT * FROM nickname_configs WHERE message_id = ? AND emoji = ? AND user_id = ?')
      .get(messageId, emoji, userId) as NicknameConfig | null) ?? null
  );
}

export function createNicknameConfig(data: Omit<NicknameConfig, 'id' | 'created_at'>): number {
  const result = getDb()
    .prepare(
      `INSERT INTO nickname_configs
         (guild_id, user_id, voice_channel_id, channel_id, message_id, emoji, nickname, label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.guild_id,
      data.user_id,
      data.voice_channel_id,
      data.channel_id,
      data.message_id,
      data.emoji,
      data.nickname,
      data.label ?? null,
    );
  return result.lastInsertRowid as number;
}

export function updateNicknameConfig(
  id: number,
  data: Omit<NicknameConfig, 'id' | 'guild_id' | 'created_at'>,
): void {
  getDb()
    .prepare(
      `UPDATE nickname_configs
       SET user_id=?, voice_channel_id=?, channel_id=?, message_id=?, emoji=?, nickname=?, label=?
       WHERE id=?`,
    )
    .run(
      data.user_id,
      data.voice_channel_id,
      data.channel_id,
      data.message_id,
      data.emoji,
      data.nickname,
      data.label ?? null,
      id,
    );
}

export function deleteNicknameConfig(id: number): void {
  getDb().prepare('DELETE FROM nickname_configs WHERE id = ?').run(id);
}
