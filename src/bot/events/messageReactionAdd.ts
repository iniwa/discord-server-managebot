import { Client, Events, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { getReactionRole } from '../../db/queries/reactionRoles';
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

        const config = getReactionRole(reaction.message.id, emoji);
        if (!config) return;

        const guild = reaction.message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(user.id);
        const hasRole = member.roles.cache.has(config.role_id);

        // ユーザーのリアクションを消去（BOT分のみ残す）
        await reaction.users.remove(user.id);

        const roleName = guild.roles.cache.get(config.role_id)?.name ?? config.role_id;

        if (hasRole) {
          await member.roles.remove(config.role_id);
          console.log(`[ReactionRole] Removed role ${config.role_id} (${roleName}) from ${(user as User).username}`);
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
          console.log(`[ReactionRole] Added role ${config.role_id} (${roleName}) to ${(user as User).username}`);
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
