import { Client, Events, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { getReactionRole } from '../../db/queries/reactionRoles';

export function registerMessageReactionRemove(client: Client): void {
  client.on(
    Events.MessageReactionRemove,
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
        await member.roles.remove(config.role_id);
        console.log(`[ReactionRole] Removed role ${config.role_id} from ${user.id}`);
      } catch (err) {
        console.error('[ReactionRole] Error on remove:', err);
      }
    }
  );
}
