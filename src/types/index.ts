export interface RoleSnapshot {
  id: number;
  guild_id: string;
  taken_at: string;
  note: string | null;
}

export interface RoleSnapshotEntry {
  id: number;
  snapshot_id: number;
  role_id: string;
  role_name: string;
  color: number;
  hoist: number;
  mentionable: number;
  position: number;
  permissions: string;
}

export interface RoleSnapshotMember {
  id: number;
  snapshot_id: number;
  role_id: string;
  user_id: string;
  username: string;
  display_name: string;
}

export interface ReactionRole {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  emoji: string;
  role_id: string;
  label: string | null;
  created_at: string;
}

export interface VoiceRole {
  id: number;
  guild_id: string;
  channel_id: string;
  role_id: string;
  label: string | null;
  created_at: string;
}

export interface BotLog {
  id: number;
  guild_id: string;
  action: string;
  user_id: string;
  username: string;
  role_id: string;
  role_name: string;
  message_id: string | null;
  emoji: string | null;
  created_at: string;
}

export interface StatusRole {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  emoji: string;
  role_id: string;
  label: string | null;
  created_at: string;
}

export interface LeaveLog {
  id: number;
  guild_id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  joined_at: string | null;
  left_at: string;
  roles_at_leave: string;
}
