import { Client, Events, GuildMember, PartialGuildMember } from 'discord.js';
import { insertLeaveLog } from '../../db/queries/leaveLog';

export function registerGuildMemberRemove(client: Client): void {
  client.on(
    Events.GuildMemberRemove,
    async (member: GuildMember | PartialGuildMember) => {
      try {
        const roles = member.roles.cache
          .filter((r) => r.id !== member.guild.id) // exclude @everyone
          .map((r) => ({ id: r.id, name: r.name }));

        insertLeaveLog({
          guild_id: member.guild.id,
          user_id: member.id,
          username: member.user.username,
          display_name: member.displayName ?? null,
          joined_at: member.joinedAt?.toISOString() ?? null,
          roles_at_leave: JSON.stringify(roles),
        });

        console.log(`[LeaveLog] Recorded leave for ${member.user.username}`);
      } catch (err) {
        console.error('[LeaveLog] Error:', err);
      }
    }
  );
}
