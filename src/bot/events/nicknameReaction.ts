import { DiscordAPIError, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { getNicknameConfigByReaction } from '../../db/queries/nicknames';
import {
  isRateLimited,
  setLastChangeTime,
  getActiveNickname,
  setActiveNickname,
  clearActiveNickname,
} from '../nicknameState';

export async function handleNicknameReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  const guild = reaction.message.guild;
  if (!guild) return;

  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? '');

  const config = getNicknameConfigByReaction(reaction.message.id, emoji, user.id);
  if (!config) return;

  if (isRateLimited(user.id)) {
    console.log(`[NicknameChanger] Rate limited for user ${user.id}`);
    return;
  }

  const member = await guild.members.fetch(user.id);

  // Discord API はサーバーオーナーのニックネームを変更できない
  if (guild.ownerId === member.id) {
    console.warn(
      `[NicknameChanger] Cannot change nickname of server owner ${member.id}. ` +
      'Please change the nickname manually or use a different Discord account as bot target.',
    );
    return;
  }

  // 対象ボイスチャンネルに入っていない場合は無視
  if (member.voice.channelId !== config.voice_channel_id) {
    console.log(`[NicknameChanger] User ${user.id} not in configured voice channel`);
    return;
  }

  const activeState = getActiveNickname(user.id);

  try {
    if (activeState && activeState.configId === config.id) {
      // 同じ設定で再押し → 元に戻す
      await member.setNickname(activeState.originalNick, 'NicknameChanger: toggled off by user');
      clearActiveNickname(user.id);
      console.log(`[NicknameChanger] Reverted nickname for ${(user as User).username}`);
    } else {
      // 新しいニックネームに変更（別設定への切り替えも含む）
      const originalNick = activeState ? activeState.originalNick : (member.nickname ?? null);
      await member.setNickname(config.nickname, 'NicknameChanger: toggled on by user');
      setActiveNickname(user.id, { originalNick, configId: config.id });
      console.log(
        `[NicknameChanger] Set nickname for ${(user as User).username} to "${config.nickname}"`,
      );
    }
    setLastChangeTime(user.id);
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === 50013) {
      console.error(
        `[NicknameChanger] Missing Permissions for user ${member.id}. ` +
        'Ensure the bot has MANAGE_NICKNAMES permission and its role is above the target user\'s highest role.',
      );
    } else {
      console.error(`[NicknameChanger] Failed to change nickname for ${member.id}:`, err);
    }
  }
}
