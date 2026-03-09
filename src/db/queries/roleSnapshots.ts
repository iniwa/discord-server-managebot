import { getDb } from '../index';
import type { RoleSnapshot, RoleSnapshotEntry } from '../../types/index';

export function listSnapshots(guildId: string): RoleSnapshot[] {
  return getDb()
    .prepare('SELECT * FROM role_snapshots WHERE guild_id = ? ORDER BY taken_at DESC')
    .all(guildId) as RoleSnapshot[];
}

export function getSnapshot(id: number): RoleSnapshot | undefined {
  return getDb()
    .prepare('SELECT * FROM role_snapshots WHERE id = ?')
    .get(id) as RoleSnapshot | undefined;
}

export function getSnapshotEntries(snapshotId: number): RoleSnapshotEntry[] {
  return getDb()
    .prepare('SELECT * FROM role_snapshot_entries WHERE snapshot_id = ? ORDER BY position DESC')
    .all(snapshotId) as RoleSnapshotEntry[];
}

export function createSnapshot(guildId: string, note: string | null): number {
  const result = getDb()
    .prepare('INSERT INTO role_snapshots (guild_id, note) VALUES (?, ?)')
    .run(guildId, note);
  return result.lastInsertRowid as number;
}

export function insertSnapshotEntry(
  snapshotId: number,
  entry: Omit<RoleSnapshotEntry, 'id' | 'snapshot_id'>
): void {
  getDb()
    .prepare(
      `INSERT INTO role_snapshot_entries
       (snapshot_id, role_id, role_name, color, hoist, mentionable, position, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      snapshotId,
      entry.role_id,
      entry.role_name,
      entry.color,
      entry.hoist ? 1 : 0,
      entry.mentionable ? 1 : 0,
      entry.position,
      entry.permissions
    );
}

export function deleteSnapshot(id: number): void {
  getDb().prepare('DELETE FROM role_snapshots WHERE id = ?').run(id);
}
