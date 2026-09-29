import { getDb } from '../index';
import type { StatusRole, RoleButtonConfig } from '../../types/index';

type StoredRole = StatusRole & { buttons_json: string | null };
const columns = 'id, guild_id, channel_id, message_id, emoji, role_id, label, message_content, buttons_json, created_at';

function decode(row: StoredRole): StatusRole {
  const { buttons_json, ...config } = row;
  const buttons: RoleButtonConfig[] = buttons_json === null
    ? [{ role_id: config.role_id, emoji: config.emoji, label: config.label }]
    : JSON.parse(buttons_json);
  return { ...config, buttons };
}

export function listStatusRoles(guildId: string): StatusRole[] {
  return (getDb().prepare(`SELECT ${columns} FROM status_roles WHERE guild_id = ? ORDER BY created_at DESC`)
    .all(guildId) as StoredRole[]).map(decode);
}

export function getStatusRole(messageId: string, emoji: string): StatusRole | undefined {
  const row = getDb().prepare(`SELECT ${columns} FROM status_roles WHERE message_id = ? AND emoji = ?`)
    .get(messageId, emoji) as StoredRole | undefined;
  return row ? decode(row) : undefined;
}

export function createStatusRole(data: Omit<StatusRole, 'id' | 'created_at'>): number {
  const first = data.buttons?.[0] ?? data;
  const result = getDb().prepare(
    `INSERT INTO status_roles (guild_id, channel_id, message_id, emoji, role_id, label, message_content, buttons_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(data.guild_id, data.channel_id, data.message_id, first.emoji, first.role_id, first.label ?? null,
    data.message_content ?? null, data.buttons ? JSON.stringify(data.buttons) : null);
  return result.lastInsertRowid as number;
}

export function updateStatusRole(id: number, data: Partial<Omit<StatusRole, 'id' | 'created_at'>>): void {
  const { buttons, ...rest } = data;
  const changes: Record<string, unknown> = { ...rest };
  if (buttons) {
    if (!buttons.length) throw new Error('At least one role button is required');
    Object.assign(changes, buttons[0], { buttons_json: JSON.stringify(buttons) });
  } else if ('role_id' in rest || 'emoji' in rest || 'label' in rest) {
    // Legacy single-button updates retain the other buttons and sync the first.
    const row = getDb().prepare(`SELECT ${columns} FROM status_roles WHERE id = ?`).get(id) as StoredRole | undefined;
    if (row) {
      const updated = decode(row).buttons!;
      updated[0] = { ...updated[0],
        ...('role_id' in rest ? { role_id: rest.role_id! } : {}),
        ...('emoji' in rest ? { emoji: rest.emoji! } : {}),
        ...('label' in rest ? { label: rest.label ?? null } : {}) };
      changes.buttons_json = JSON.stringify(updated);
    }
  }
  const fields = Object.keys(changes).map((key) => `${key} = ?`).join(', ');
  if (fields) getDb().prepare(`UPDATE status_roles SET ${fields} WHERE id = ?`).run(...Object.values(changes), id);
}

export function deleteStatusRole(id: number): void {
  getDb().prepare('DELETE FROM status_roles WHERE id = ?').run(id);
}
