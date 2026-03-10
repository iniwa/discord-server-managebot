import { getDb } from '../index';
import type { BotLog } from '../../types/index';

export function insertBotLog(data: Omit<BotLog, 'id' | 'created_at'>): void {
  getDb()
    .prepare(
      `INSERT INTO bot_logs (guild_id, action, user_id, username, role_id, role_name, message_id, emoji)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.guild_id,
      data.action,
      data.user_id,
      data.username,
      data.role_id,
      data.role_name,
      data.message_id ?? null,
      data.emoji ?? null
    );
}

export function listBotLogs(
  guildId: string,
  page: number,
  limit: number
): { rows: BotLog[]; total: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM bot_logs WHERE guild_id = ?').get(guildId) as { c: number }
  ).c;
  const offset = (page - 1) * limit;
  const rows = db
    .prepare('SELECT * FROM bot_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(guildId, limit, offset) as BotLog[];
  return { rows, total };
}
