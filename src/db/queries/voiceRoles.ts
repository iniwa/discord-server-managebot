import { getDb } from '../index';
import type { VoiceRole } from '../../types/index';

export function listVoiceRoles(guildId: string): VoiceRole[] {
  return getDb()
    .prepare('SELECT * FROM voice_roles WHERE guild_id = ? ORDER BY created_at DESC')
    .all(guildId) as VoiceRole[];
}

export function getVoiceRolesByChannel(channelId: string): VoiceRole[] {
  return getDb()
    .prepare('SELECT * FROM voice_roles WHERE channel_id = ?')
    .all(channelId) as VoiceRole[];
}

export function createVoiceRole(data: Omit<VoiceRole, 'id' | 'created_at'>): number {
  const result = getDb()
    .prepare(
      `INSERT INTO voice_roles (guild_id, channel_id, role_id, label)
       VALUES (?, ?, ?, ?)`
    )
    .run(data.guild_id, data.channel_id, data.role_id, data.label ?? null);
  return result.lastInsertRowid as number;
}

export function updateVoiceRole(
  id: number,
  data: Partial<Omit<VoiceRole, 'id' | 'created_at'>>
): void {
  const fields = Object.keys(data)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(data), id];
  getDb().prepare(`UPDATE voice_roles SET ${fields} WHERE id = ?`).run(...values);
}

export function deleteVoiceRole(id: number): void {
  getDb().prepare('DELETE FROM voice_roles WHERE id = ?').run(id);
}
