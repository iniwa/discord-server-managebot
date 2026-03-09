import { Client, Events, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { getReactionRole } from '../../db/queries/reactionRoles';

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
        await member.roles.add(config.role_id);
        console.log(`[ReactionRole] Added role ${config.role_id} to ${user.id}`);
      } catch (err) {
        console.error('[ReactionRole] Error on add:', err);
      }
    }
  );
}
