import { Client, Routes } from 'discord.js';
import { getClient } from './index';
import { anyCheckEventCursor, recordAnyCheckEvent, saveAnyCheckSnapshot, checkEventCursor, emojiKey, listReactionChecks, recordCheckEvent, saveCheckSnapshot, ReactionCheck, CheckMember } from '../db/queries/reactionChecks';
import { listReactionRoles } from '../db/queries/reactionRoles';
import { listStatusRoles } from '../db/queries/statusRoles';

export function conflictsWithRole(check: Pick<ReactionCheck, 'guild_id' | 'channel_id' | 'message_id' | 'emoji'> & { mode?: 'any' | 'specific' }): boolean {
  return [...listReactionRoles(check.guild_id), ...listStatusRoles(check.guild_id)].some(role =>
    role.channel_id === check.channel_id && role.message_id === check.message_id && (check.mode === 'any' || emojiKey(role.emoji) === emojiKey(check.emoji)));
}
export function reactionCheckError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'number' ? error.code : undefined;
  console.warn('[ReactionCheck] Operation failed', code ?? 'unexpected');
  if (code === 50001 || code === 50013) return 'Botがメッセージを閲覧できません。チャンネルを見る・メッセージ履歴を読む権限を確認してください。';
  if (code === 10003 || code === 10008) return 'チャンネルまたはメッセージが見つかりません。URLを確認してください。';
  if (code === 10014 || code === 50035) return '絵文字を利用できません。サーバーの絵文字またはUnicode絵文字を指定してください。';
  return 'Discordから情報を取得できませんでした。Botの接続状態を確認し、再同期してください。';
}

const active = new Map<number, Promise<void>>();
export function syncReactionCheck(check: ReactionCheck, client = getClient()): Promise<void> {
  const running = active.get(check.id);
  if (running) return running;
  const task = sync(check, client).finally(() => active.delete(check.id));
  active.set(check.id, task);
  return task;
}
async function sync(check: ReactionCheck, client: Client): Promise<void> {
  if (conflictsWithRole(check)) throw new Error('Conflicting role configuration');
  const cursor = check.mode === 'any' ? anyCheckEventCursor(check.id) : checkEventCursor(check.id);
  const guild = await client.guilds.fetch(check.guild_id);
  const channel = await guild.channels.fetch(check.channel_id);
  if (!channel?.isTextBased() || !('messages' in channel)) throw new Error('Unavailable channel');
  const message = await channel.messages.fetch({ message: check.message_id, force: true });
  const members: CheckMember[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await guild.members.list({ limit: 1000, ...(after ? { after } : {}) });
    for (const member of page.values()) if (!member.user.bot) members.push({ user_id: member.id, username: member.user.username, display_name: member.displayName });
    if (page.size < 1000) break;
    const next = page.lastKey();
    if (!next || next === after) throw new Error('Member pagination stalled');
    after = next;
  }
  const custom = /^<a?:([^:>]+):(\d+)>$/.exec(check.emoji);
  const emojis = check.mode === 'any'
    ? [...message.reactions.cache.values()].map(reaction => ({
      key: reaction.emoji.id ?? emojiKey(reaction.emoji.name ?? ''),
      route: reaction.emoji.id ? `${reaction.emoji.name ?? '_'}:${reaction.emoji.id}` : reaction.emoji.name ?? '',
    }))
    : [{ key: check.emoji_key, route: custom ? `${custom[1]}:${custom[2]}` : check.emoji }];
  const allUsers = new Map<string, [Set<string>, Set<string>]>();
  for (const emoji of emojis) {
    const users: [Set<string>, Set<string>] = [new Set(), new Set()];
    allUsers.set(emoji.key, users);
    for (const type of [0, 1]) {
      after = undefined;
      for (;;) {
        const query = new URLSearchParams({ limit: '100', type: String(type) });
        if (after) query.set('after', after);
        const page = await client.rest.get(Routes.channelMessageReaction(check.channel_id, check.message_id, encodeURIComponent(emoji.route)), { query }) as { id: string; bot?: boolean }[];
        for (const user of page) if (!user.bot) users[type].add(user.id);
        if (page.length < 100) break;
        const next = page[page.length - 1]?.id;
        if (!next || next === after) throw new Error('Reaction pagination stalled');
        after = next;
      }
    }
  }
  if (check.mode === 'any') saveAnyCheckSnapshot(check.id, members, allUsers, cursor);
  else saveCheckSnapshot(check.id, members, allUsers.get(check.emoji_key)!, cursor);
}

export async function installCheckReaction(check: ReactionCheck): Promise<string | null> {
  if (check.mode === 'any') return null;
  try {
    const guild = await getClient().guilds.fetch(check.guild_id);
    const channel = await guild.channels.fetch(check.channel_id);
    if (!channel?.isTextBased() || !('messages' in channel)) throw new Error('Unavailable channel');
    const message = await channel.messages.fetch(check.message_id);
    await message.react(check.emoji);
    return null;
  } catch (error) {
    reactionCheckError(error);
    return '一覧は同期しましたが、Botから絵文字を設置できませんでした。「リアクションの追加」権限と絵文字の利用可否を確認し、必要なら手動でリアクションを追加してください。';
  }
}

/** Raw packets include uncached messages and separate normal/burst reaction types. */
export function registerReactionChecks(client: Client): void {
  client.on('raw', packet => {
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE', 'MESSAGE_REACTION_REMOVE_ALL', 'MESSAGE_REACTION_REMOVE_EMOJI'].includes(packet.t ?? '')) return;
    const data = packet.d as { guild_id?: string; channel_id: string; message_id: string; user_id?: string; type?: number; burst?: boolean; emoji?: { id: string | null; name: string | null } };
    if (!data.guild_id || data.guild_id !== process.env.DISCORD_GUILD_ID) return;
    try {
      const checks = listReactionChecks(data.guild_id).filter(check => check.channel_id === data.channel_id && check.message_id === data.message_id &&
        (check.mode === 'any' || packet.t === 'MESSAGE_REACTION_REMOVE_ALL' || check.emoji_key === (data.emoji?.id ?? emojiKey(data.emoji?.name ?? ''))));
      for (const check of checks) {
        if (check.mode === 'any') {
          const key = data.emoji?.id ?? emojiKey(data.emoji?.name ?? '');
          if (packet.t === 'MESSAGE_REACTION_REMOVE_ALL') recordAnyCheckEvent(check.id, null, null, null, 'clear');
          else if (packet.t === 'MESSAGE_REACTION_REMOVE_EMOJI') recordAnyCheckEvent(check.id, null, key, null, 'clear_emoji');
          else if (data.user_id) recordAnyCheckEvent(check.id, data.user_id, key, data.type ?? (data.burst ? 1 : 0), packet.t === 'MESSAGE_REACTION_ADD' ? 'add' : 'remove');
          continue;
        }
        if (packet.t === 'MESSAGE_REACTION_REMOVE_ALL' || packet.t === 'MESSAGE_REACTION_REMOVE_EMOJI') recordCheckEvent(check.id, null, null, 'clear');
        else if (data.user_id) recordCheckEvent(check.id, data.user_id, data.type ?? (data.burst ? 1 : 0), packet.t === 'MESSAGE_REACTION_ADD' ? 'add' : 'remove');
      }
    } catch { console.warn('[ReactionCheck] Could not record reaction event'); }
  });
  // Reconcile once after connection/reconnection; further full refresh is explicit to limit large-guild load.
  const reconcile = async () => {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) return;
    for (const check of listReactionChecks(guildId)) {
      try { await syncReactionCheck(check, client); } catch { console.warn('[ReactionCheck] Startup synchronization failed'); }
    }
  };
  const startReconcile = () => { void reconcile().catch(() => console.warn('[ReactionCheck] Could not start synchronization')); };
  client.on('clientReady', startReconcile);
  client.on('shardResume', startReconcile);
}
