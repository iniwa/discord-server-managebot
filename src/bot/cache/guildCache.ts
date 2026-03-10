import { ChannelType, Guild } from 'discord.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface CachedRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

export interface CachedChannel {
  id: string;
  name: string;
  type: number;
  isVoice: boolean;
}

export interface CachedEmoji {
  id: string;
  name: string;
  animated: boolean;
  /** discord.js 形式: <:name:id> or <a:name:id> */
  tag: string;
}

let rolesCache: CachedRole[] = [];
let channelsCache: CachedChannel[] = [];
let emojisCache: CachedEmoji[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let cachedGuild: Guild | null = null;

export async function refreshGuildCache(guild: Guild): Promise<void> {
  try {
    const [roles, channels, emojis] = await Promise.all([
      guild.roles.fetch(),
      guild.channels.fetch(),
      guild.emojis.fetch(),
    ]);

    rolesCache = roles
      .filter((r) => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }));

    channelsCache = channels
      .filter((c) => c !== null)
      .map((c) => ({
        id: c!.id,
        name: c!.name,
        type: c!.type,
        isVoice: c!.type === ChannelType.GuildVoice || c!.type === ChannelType.GuildStageVoice,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    emojisCache = emojis
      .filter((e) => e.name !== null)
      .map((e) => ({
        id: e.id,
        name: e.name!,
        animated: e.animated ?? false,
        tag: e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(
      `[GuildCache] Refreshed: ${rolesCache.length} roles, ${channelsCache.length} channels, ${emojisCache.length} emojis`
    );
  } catch (err) {
    console.error('[GuildCache] Failed to refresh:', err);
  }
}

export function startGuildCacheRefresh(guild: Guild): void {
  cachedGuild = guild;
  refreshGuildCache(guild);

  if (timer) clearInterval(timer);
  timer = setInterval(() => refreshGuildCache(guild), REFRESH_INTERVAL_MS);
}

export async function forceRefreshGuildCache(): Promise<void> {
  if (!cachedGuild) throw new Error('Guild cache not initialized');
  await refreshGuildCache(cachedGuild);
}

export function getRoles(): CachedRole[] {
  return rolesCache;
}

export function getChannels(): CachedChannel[] {
  return channelsCache;
}

export function getEmojis(): CachedEmoji[] {
  return emojisCache;
}
