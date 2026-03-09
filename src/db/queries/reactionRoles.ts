import { getDb } from '../index';
import type { ReactionRole } from '../../types/index';

export function listReactionRoles(guildId: string): ReactionRole[] {
  return getDb()
    .prepare('SELECT * FROM reaction_roles WHERE guild_id = ? ORDER BY created_at DESC')
    .all(guildId) as ReactionRole[];
}

export function getReactionRole(messageId: string, emoji: string): ReactionRole | undefined {
  return getDb()
    .prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?')
    .get(messageId, emoji) as ReactionRole | undefined;
}

export function createReactionRole(
  data: Omit<ReactionRole, 'id' | 'created_at'>
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(data.guild_id, data.channel_id, data.message_id, data.emoji, data.role_id, data.label ?? null);
  return result.lastInsertRowid as number;
}

export function updateReactionRole(
  id: number,
  data: Partial<Omit<ReactionRole, 'id' | 'created_at'>>
): void {
  const fields = Object.keys(data)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(data), id];
  getDb().prepare(`UPDATE reaction_roles SET ${fields} WHERE id = ?`).run(...values);
}

export function deleteReactionRole(id: number): void {
  getDb().prepare('DELETE FROM reaction_roles WHERE id = ?').run(id);
}
