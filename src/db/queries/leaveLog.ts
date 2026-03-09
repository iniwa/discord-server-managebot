import { getDb } from '../index';
import type { LeaveLog } from '../../types/index';

export function insertLeaveLog(data: Omit<LeaveLog, 'id' | 'left_at'>): void {
  getDb()
    .prepare(
      `INSERT INTO leave_log (guild_id, user_id, username, display_name, joined_at, roles_at_leave)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.guild_id,
      data.user_id,
      data.username,
      data.display_name ?? null,
      data.joined_at ?? null,
      data.roles_at_leave
    );
}

export function listLeaveLogs(
  guildId: string,
  page: number,
  limit: number
): { rows: LeaveLog[]; total: number } {
  const db = getDb();
  const offset = (page - 1) * limit;
  const rows = db
    .prepare('SELECT * FROM leave_log WHERE guild_id = ? ORDER BY left_at DESC LIMIT ? OFFSET ?')
    .all(guildId, limit, offset) as LeaveLog[];
  const { total } = db
    .prepare('SELECT COUNT(*) as total FROM leave_log WHERE guild_id = ?')
    .get(guildId) as { total: number };
  return { rows, total };
}
