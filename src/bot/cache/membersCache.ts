import { Guild } from 'discord.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface CachedMember {
  id: string;
  username: string;
  display_name: string;
  joined_at: string | null;
  roles: { id: string; name: string }[];
}

let cache: CachedMember[] = [];
let lastRefreshed: Date | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshMembers(guild: Guild): Promise<void> {
  try {
    const members = await guild.members.fetch();
    cache = members
      .filter((m) => !m.user.bot)
      .map((m) => ({
        id: m.id,
        username: m.user.username,
        display_name: m.displayName,
        joined_at: m.joinedAt?.toISOString() ?? null,
        roles: m.roles.cache
          .filter((r) => r.id !== guild.id)
          .map((r) => ({ id: r.id, name: r.name })),
      }));
    lastRefreshed = new Date();
    console.log(`[MembersCache] Refreshed: ${cache.length} members at ${lastRefreshed.toISOString()}`);
  } catch (err) {
    console.error('[MembersCache] Failed to refresh:', err);
  }
}

export function startMembersCacheRefresh(guild: Guild): void {
  refreshMembers(guild);

  if (timer) clearInterval(timer);
  timer = setInterval(() => refreshMembers(guild), REFRESH_INTERVAL_MS);
}

export function getMembers(): CachedMember[] {
  return cache;
}

export function getCacheStatus(): { count: number; lastRefreshed: string | null } {
  return {
    count: cache.length,
    lastRefreshed: lastRefreshed?.toISOString() ?? null,
  };
}
