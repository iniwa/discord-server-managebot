import { Guild } from 'discord.js';
import { createSnapshot, insertSnapshotEntry, insertSnapshotMember } from '../../db/queries/roleSnapshots';
import { getMembers } from '../cache/membersCache';

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

  // メンバーキャッシュからロール保持者を保存
  const members = getMembers();
  for (const member of members) {
    for (const role of member.roles) {
      insertSnapshotMember(snapshotId, role.id, {
        user_id: member.id,
        username: member.username,
        display_name: member.display_name,
      });
    }
  }

  if (members.length === 0) {
    console.warn('[RoleSnapshot] Members cache is empty — member data not saved. Refresh cache first.');
  }

  return snapshotId;
}
