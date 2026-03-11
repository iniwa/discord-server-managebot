import { Client, Events, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { getReactionRole } from '../../db/queries/reactionRoles';
import { getStatusRole } from '../../db/queries/statusRoles';
import { insertBotLog } from '../../db/queries/botLogs';

export function registerMessageReactionAdd(client: Client): void {
  client.on(
    Events.MessageReactionAdd,
    async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
      if (user.bot) return;

      try {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();

        const emoji = reaction.emoji.id
          ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
          : (reaction.emoji.name ?? '');

        const guild = reaction.message.guild;
        if (!guild) return;
        const member = await guild.members.fetch(user.id);

        // ── ステータスロール ───────────────────────────────────────────
        const statusConfig = getStatusRole(reaction.message.id, emoji);
        if (statusConfig) {
          const hasRole = member.roles.cache.has(statusConfig.role_id);
          await reaction.users.remove(user.id);
          const roleName = guild.roles.cache.get(statusConfig.role_id)?.name ?? statusConfig.role_id;

          if (hasRole) {
            await member.roles.remove(statusConfig.role_id);
            console.log(`[StatusRole] Removed role ${roleName} from ${(user as User).username}`);
            try {
              await (user as User).send(`**${guild.name}** のステータスロール **${roleName}** が外れました。`);
            } catch {
              console.warn(`[StatusRole] Could not DM user ${user.id}`);
            }
          } else {
            if (!member.voice.channelId) {
              console.log(`[StatusRole] Skipped: ${(user as User).username} is not in a voice channel`);
              try {
                await (user as User).send(`**${guild.name}** のステータスロール **${roleName}** を付与するには、通話に参加している必要があります。`);
              } catch {
                console.warn(`[StatusRole] Could not DM user ${user.id}`);
              }
              return;
            }
            await member.roles.add(statusConfig.role_id);
            console.log(`[StatusRole] Added role ${roleName} to ${(user as User).username}`);
            try {
              await (user as User).send(`**${guild.name}** でステータスロール **${roleName}** が付与されました。通話から退出すると自動的に外れます。`);
            } catch {
              console.warn(`[StatusRole] Could not DM user ${user.id}`);
            }
          }
          return;
        }

        // ── リアクションロール ─────────────────────────────────────────
        const config = getReactionRole(reaction.message.id, emoji);
        if (!config) return;

        const hasRole = member.roles.cache.has(config.role_id);
        await reaction.users.remove(user.id);
        const roleName = guild.roles.cache.get(config.role_id)?.name ?? config.role_id;

        if (hasRole) {
          await member.roles.remove(config.role_id);
          console.log(`[ReactionRole] Removed role ${roleName} from ${(user as User).username}`);
          insertBotLog({
            guild_id: guild.id,
            action: 'reaction_role_remove',
            user_id: user.id,
            username: (user as User).username,
            role_id: config.role_id,
            role_name: roleName,
            message_id: reaction.message.id,
            emoji,
          });
          try {
            await (user as User).send(`**${guild.name}** のロール **${roleName}** が剥奪されました。`);
          } catch {
            console.warn(`[ReactionRole] Could not DM user ${user.id}`);
          }
        } else {
          await member.roles.add(config.role_id);
          console.log(`[ReactionRole] Added role ${roleName} to ${(user as User).username}`);
          insertBotLog({
            guild_id: guild.id,
            action: 'reaction_role_add',
            user_id: user.id,
            username: (user as User).username,
            role_id: config.role_id,
            role_name: roleName,
            message_id: reaction.message.id,
            emoji,
          });
          try {
            await (user as User).send(`**${guild.name}** でロール **${roleName}** が付与されました。`);
          } catch {
            console.warn(`[ReactionRole] Could not DM user ${user.id}`);
          }
        }
      } catch (err) {
        console.error('[ReactionRole] Error on reaction add:', err);
      }
    }
  );
}
