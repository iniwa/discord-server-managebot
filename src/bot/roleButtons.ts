import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getClient } from './index';
import { listReactionRoles, updateReactionRole } from '../db/queries/reactionRoles';
import { listStatusRoles, updateStatusRole } from '../db/queries/statusRoles';
import type { ReactionRole, StatusRole } from '../types';

export type RoleButtonKind = 'reaction' | 'status';

/** Publish a new, bot-owned message; never edit a user-authored legacy message. */
export async function publishRoleButton(
  kind: RoleButtonKind,
  config: ReactionRole | StatusRole,
): Promise<string> {
  const guild = await getClient().guilds.fetch(config.guild_id);
  const channel = await guild.channels.fetch(config.channel_id);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    throw new Error('Role button channel is not sendable');
  }
  const role = await guild.roles.fetch(config.role_id);
  if (!role) throw new Error('Role button role is unavailable');
  const button = new ButtonBuilder()
    .setCustomId(`role:${kind}:${config.id}`)
    .setStyle(ButtonStyle.Primary)
    .setLabel((config.label?.trim() || role.name).slice(0, 80))
    .setEmoji(config.emoji);
  const message = await channel.send({
    content: kind === 'status'
      ? 'ボタンでステータスロールを切り替えます。付与はVC参加中のみ可能で、VC退出時に自動解除されます。操作結果はあなただけに表示されます。'
      : 'ボタンでロールの付与・解除を切り替えます。操作結果はあなただけに表示されます。',
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    allowedMentions: { parse: [] },
  });
  try {
    // A concurrent edit, publication or deletion must not activate a stale button.
    const list = kind === 'reaction' ? listReactionRoles : listStatusRoles;
    const current = list(config.guild_id).find((entry) => entry.id === config.id);
    if (!current || current.channel_id !== config.channel_id
      || current.role_id !== config.role_id || current.emoji !== config.emoji
      || current.label !== config.label || current.message_id !== config.message_id) {
      throw new Error('Role configuration changed while publishing');
    }
    const update = kind === 'reaction' ? updateReactionRole : updateStatusRole;
    update(config.id, { message_id: message.id });
  } catch (error) {
    await message.delete().catch(() => undefined);
    throw error;
  }
  return message.id;
}
