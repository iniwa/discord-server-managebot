import { Client, ComponentType, Events, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { getReactionRole } from '../../db/queries/reactionRoles';
import { getStatusRole } from '../../db/queries/statusRoles';
import { insertBotLog } from '../../db/queries/botLogs';
import { emojiKey, listReactionChecks } from '../../db/queries/reactionChecks';

export function registerMessageReactionAdd(client: Client): void {
  client.on(
    Events.MessageReactionAdd,
    async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
      if (user.bot) return;

      try {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();
        // 新しいボタン投稿はボタン操作だけを受け付ける。旧設定は移行まで維持する。
        if ((reaction.message.components ?? []).some((row) => row.type === ComponentType.ActionRow &&
          row.components.some((component) => component.type === ComponentType.Button && component.customId?.startsWith('role:')))) return;

        const emoji = reaction.emoji.id
          ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
          : (reaction.emoji.name ?? '');

        const guild = reaction.message.guild;
        if (!guild) return;
        // Read-confirmation reactions are retained; never toggle roles or remove them.
        if (listReactionChecks(guild.id).some(check => check.channel_id === reaction.message.channelId
          && check.message_id === reaction.message.id && (check.mode === 'any' || check.emoji_key === emojiKey(emoji)))) return;
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
          } else {
            if (!member.voice.channelId) {
              console.log(`[StatusRole] Skipped: ${(user as User).username} is not in a voice channel`);
              return;
            }
            await member.roles.add(statusConfig.role_id);
            console.log(`[StatusRole] Added role ${roleName} to ${(user as User).username}`);
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
        }
      } catch (err) {
        console.error('[ReactionRole] Error on reaction add:', err);
      }
    }
  );
}
