import { getDb } from '../index';

export interface ReactionCheck {
  id: number; guild_id: string; channel_id: string; message_id: string;
  emoji: string; emoji_key: string; label: string; created_at: string; synced_at: string | null;
}
export interface CheckMember { user_id: string; username: string; display_name: string }
export interface CheckEvent { id: number; user_id: string | null; reaction_type: number | null; action: string; observed_at: string }

export function emojiKey(emoji: string): string {
  const custom = /^<a?:[^:>]+:(\d+)>$/.exec(emoji);
  return custom ? custom[1] : emoji.replace(/\uFE0F/g, '');
}
export function listReactionChecks(guildId: string): ReactionCheck[] {
  return getDb().prepare('SELECT * FROM reaction_checks WHERE guild_id = ? ORDER BY id DESC').all(guildId) as ReactionCheck[];
}
export function getReactionCheck(id: number, guildId: string): ReactionCheck | undefined {
  return getDb().prepare('SELECT * FROM reaction_checks WHERE id = ? AND guild_id = ?').get(id, guildId) as ReactionCheck | undefined;
}
export function createReactionCheck(data: Pick<ReactionCheck, 'guild_id' | 'channel_id' | 'message_id' | 'emoji' | 'label'>): number {
  return Number(getDb().prepare('INSERT INTO reaction_checks (guild_id,channel_id,message_id,emoji,emoji_key,label) VALUES (?,?,?,?,?,?)')
    .run(data.guild_id, data.channel_id, data.message_id, data.emoji, emojiKey(data.emoji), data.label).lastInsertRowid);
}
function applyEvent(checkId: number, event: Omit<CheckEvent, 'id'>): void {
  const db = getDb();
  if (event.action === 'clear') {
    db.prepare('UPDATE reaction_check_state SET active = 0 WHERE check_id = ?').run(checkId);
  } else if (event.action === 'add') {
    db.prepare(`INSERT INTO reaction_check_state (check_id,user_id,reaction_type,active,reacted_at) VALUES (?,?,?,1,?)
      ON CONFLICT(check_id,user_id,reaction_type) DO UPDATE SET active=1,
      reacted_at=CASE WHEN reaction_check_state.active=1 THEN reaction_check_state.reacted_at ELSE excluded.reacted_at END`)
      .run(checkId, event.user_id, event.reaction_type, event.observed_at);
  } else {
    db.prepare('UPDATE reaction_check_state SET active=0 WHERE check_id=? AND user_id=? AND reaction_type=?')
      .run(checkId, event.user_id, event.reaction_type);
  }
}
export function recordCheckEvent(checkId: number, userId: string | null, type: number | null, action: 'add' | 'remove' | 'clear', at = new Date().toISOString()): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('INSERT INTO reaction_check_events(check_id,user_id,reaction_type,action,observed_at) VALUES (?,?,?,?,?)').run(checkId, userId, type, action, at);
    applyEvent(checkId, { user_id: userId, reaction_type: type, action, observed_at: at });
  })();
}
export function checkEventCursor(checkId: number): number {
  return (getDb().prepare('SELECT COALESCE(MAX(id),0) AS id FROM reaction_check_events WHERE check_id=?').get(checkId) as { id: number }).id;
}
/** Commit only a complete REST snapshot and replay events observed while it was fetched. */
export function saveCheckSnapshot(checkId: number, members: CheckMember[], users: [Set<string>, Set<string>], cursor: number): void {
  const db = getDb();
  db.transaction(() => {
    const prior = db.prepare('SELECT user_id,reaction_type,active,reacted_at FROM reaction_check_state WHERE check_id=?').all(checkId) as { user_id: string; reaction_type: number; active: number; reacted_at: string | null }[];
    const known = new Map(prior.map(row => [`${row.user_id}:${row.reaction_type}`, row]));
    db.prepare('UPDATE reaction_check_members SET present=0 WHERE check_id=?').run(checkId);
    const memberStmt = db.prepare(`INSERT INTO reaction_check_members(check_id,user_id,username,display_name,present) VALUES (?,?,?,?,1)
      ON CONFLICT(check_id,user_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,present=1`);
    for (const member of members) memberStmt.run(checkId, member.user_id, member.username, member.display_name);
    db.prepare('UPDATE reaction_check_state SET active=0 WHERE check_id=?').run(checkId);
    const state = db.prepare(`INSERT INTO reaction_check_state(check_id,user_id,reaction_type,active,reacted_at) VALUES (?,?,?,1,?)
      ON CONFLICT(check_id,user_id,reaction_type) DO UPDATE SET active=1,reacted_at=excluded.reacted_at`);
    for (const [type, ids] of users.entries()) for (const id of ids) {
      const previous = known.get(`${id}:${type}`);
      state.run(checkId, id, type, previous?.active ? previous.reacted_at : null);
    }
    const events = db.prepare('SELECT * FROM reaction_check_events WHERE check_id=? AND id>? ORDER BY id').all(checkId, cursor) as CheckEvent[];
    for (const event of events) applyEvent(checkId, event);
    db.prepare('UPDATE reaction_checks SET synced_at=? WHERE id=?').run(new Date().toISOString(), checkId);
  })();
}
export function reactionCheckReport(check: ReactionCheck) {
  const rows = getDb().prepare(`SELECT m.user_id,m.username,m.display_name,
    MAX(COALESCE(s.active,0)) AS active,
    MIN(CASE WHEN s.active=1 THEN s.reacted_at END) AS reacted_at
    FROM reaction_check_members m LEFT JOIN reaction_check_state s ON m.check_id=s.check_id AND m.user_id=s.user_id
    WHERE m.check_id=? AND m.present=1 GROUP BY m.user_id ORDER BY m.display_name,m.user_id`).all(check.id) as (CheckMember & { active: number; reacted_at: string | null })[];
  const clean = (row: typeof rows[number]) => ({ user_id: row.user_id, username: row.username, display_name: row.display_name, reacted_at: row.active ? row.reacted_at : null });
  return { check: publicReactionCheck(check), reacted: rows.filter(row => row.active).map(clean), pending: rows.filter(row => !row.active).map(clean),
    synced_at: check.synced_at, member_snapshot_at: check.synced_at, warning: null as string | null };
}
export function publicReactionCheck(check: ReactionCheck) {
  const { emoji_key, ...data } = check;
  return { ...data, message_url: `https://discord.com/channels/${check.guild_id}/${check.channel_id}/${check.message_id}` };
}
