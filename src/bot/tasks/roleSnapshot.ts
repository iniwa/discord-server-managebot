import { Guild } from 'discord.js';
import { createSnapshot, insertSnapshotEntry } from '../../db/queries/roleSnapshots';

export async function takeRoleSnapshot(guild: Guild, note?: string): Promise<number> {
  const snapshotId = createSnapshot(guild.id, note ?? null);

  const roles = await guild.roles.fetch();
  for (const [, role] of roles) {
    if (role.managed) continue; // skip bot-managed roles
    insertSnapshotEntry(snapshotId, {
      role_id: role.id,
      role_name: role.name,
      color: role.color,
      hoist: role.hoist ? 1 : 0,
      mentionable: role.mentionable ? 1 : 0,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
    });
  }

  return snapshotId;
}
