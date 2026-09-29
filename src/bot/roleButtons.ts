import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getClient } from './index';
import { listReactionRoles, updateReactionRole } from '../db/queries/reactionRoles';
import { listStatusRoles, updateStatusRole } from '../db/queries/statusRoles';
import type { ReactionRole, StatusRole } from '../types';

export type RoleButtonKind = 'reaction' | 'status';

class RoleButtonError extends Error {
  constructor(readonly reason: 'channel' | 'role' | 'changed') {
    super(reason === 'changed' ? 'Role configuration changed while publishing' : reason);
  }
}

export function roleButtonMessageUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** Never expose Discord request payloads, tokens or raw error text. */
export function roleButtonPublishError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'number'
    ? error.code : undefined;
  const reason = error instanceof RoleButtonError ? error.reason : undefined;
  console.warn('[RoleButton] Publication failed', reason ?? (code === undefined ? 'unexpected' : 'DiscordAPIError'), code ?? '');
  if (reason === 'channel' || code === 10003) return '投稿先チャンネルが見つからないか、ボタンを投稿できない種類です。テキストチャンネルを選び直してください。';
  if (reason === 'role' || code === 10011) return '対象のロールが見つかりません。ロールを選び直してください。';
  if (reason === 'changed') return '投稿中に設定が変更または削除されました。一覧を更新して、現在の設定から再投稿してください。';
  if (code === 50013) return 'Botの権限が不足しています。投稿先で「チャンネルを見る」「メッセージを送信」を許可してください。スレッドの場合は「スレッドでメッセージを送信」も必要です。';
  if (code === 50001) return 'Botが投稿先にアクセスできません。Botがサーバーに参加していることと、チャンネルの閲覧権限を確認してください。';
  if (code === 50035) return 'Discordがボタンの内容を受け付けませんでした。絵文字を空欄にして再試行し、ボタン名を確認してください。';
  return 'ボタンを投稿できませんでした。Botの接続状態と投稿先を確認して再試行してください。';
}

/** Publish a new, bot-owned message; never edit a user-authored legacy message. */
export async function publishRoleButton(
  kind: RoleButtonKind,
  config: ReactionRole | StatusRole,
): Promise<string> {
  const guild = await getClient().guilds.fetch(config.guild_id);
  const channel = await guild.channels.fetch(config.channel_id);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    throw new RoleButtonError('channel');
  }
  const role = await guild.roles.fetch(config.role_id);
  if (!role) throw new RoleButtonError('role');
  const button = new ButtonBuilder()
    .setCustomId(`role:${kind}:${config.id}`)
    .setStyle(ButtonStyle.Primary)
    .setLabel((config.label?.trim() || role.name).slice(0, 80));
  if (config.emoji.trim()) button.setEmoji(config.emoji);
  const assertCurrent = () => {
    const list = kind === 'reaction' ? listReactionRoles : listStatusRoles;
    const current = list(config.guild_id).find((entry) => entry.id === config.id);
    if (!current || current.channel_id !== config.channel_id
      || current.role_id !== config.role_id || current.emoji !== config.emoji
      || current.label !== config.label || current.message_id !== config.message_id) {
      throw new RoleButtonError('changed');
    }
    if ((current.message_content ?? null) !== (config.message_content ?? null)) {
      throw new RoleButtonError('changed');
    }
  };
  assertCurrent();
  const message = await channel.send({
    content: config.message_content?.trim() || (kind === 'status'
      ? 'ボタンでステータスロールを切り替えます。付与はVC参加中のみ可能で、VC退出時に自動解除されます。操作結果はあなただけに表示されます。'
      : 'ボタンでロールの付与・解除を切り替えます。操作結果はあなただけに表示されます。'),
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    allowedMentions: { parse: [] },
  });
  try {
    // A concurrent edit, publication or deletion must not activate a stale button.
    assertCurrent();
    const update = kind === 'reaction' ? updateReactionRole : updateStatusRole;
    update(config.id, { message_id: message.id });
  } catch (error) {
    await message.delete().catch(() => undefined);
    throw error;
  }
  return message.id;
}
