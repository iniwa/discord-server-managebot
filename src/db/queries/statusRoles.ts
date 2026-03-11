import { getDb } from '../index';
import type { StatusRole } from '../../types/index';

export function listStatusRoles(guildId: string): StatusRole[] {
  return getDb()
    .prepare('SELECT * FROM status_roles WHERE guild_id = ? ORDER BY created_at DESC')
    .all(guildId) as StatusRole[];
}

export function getStatusRole(messageId: string, emoji: string): StatusRole | undefined {
  return getDb()
    .prepare('SELECT * FROM status_roles WHERE message_id = ? AND emoji = ?')
    .get(messageId, emoji) as StatusRole | undefined;
}

export function createStatusRole(data: Omit<StatusRole, 'id' | 'created_at'>): number {
  const result = getDb()
    .prepare(
      `INSERT INTO status_roles (guild_id, channel_id, message_id, emoji, role_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(data.guild_id, data.channel_id, data.message_id, data.emoji, data.role_id, data.label ?? null);
  return result.lastInsertRowid as number;
}

export function updateStatusRole(
  id: number,
  data: Partial<Omit<StatusRole, 'id' | 'created_at'>>,
): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  getDb().prepare(`UPDATE status_roles SET ${fields} WHERE id = ?`).run(...values);
}

export function deleteStatusRole(id: number): void {
  getDb().prepare('DELETE FROM status_roles WHERE id = ?').run(id);
}
