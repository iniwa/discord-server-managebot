interface NicknameState {
  originalNick: string | null;
  configId: number;
}

const activeNicknames = new Map<string, NicknameState>(); // userId -> state
const lastChangeTimes = new Map<string, number>();        // userId -> timestamp ms

const RATE_LIMIT_MS = 6000;

export function isRateLimited(userId: string): boolean {
  const last = lastChangeTimes.get(userId);
  if (last === undefined) return false;
  return Date.now() - last < RATE_LIMIT_MS;
}

export function setLastChangeTime(userId: string): void {
  lastChangeTimes.set(userId, Date.now());
}

export function getActiveNickname(userId: string): NicknameState | undefined {
  return activeNicknames.get(userId);
}

export function setActiveNickname(userId: string, state: NicknameState): void {
  activeNicknames.set(userId, state);
}

export function clearActiveNickname(userId: string): void {
  activeNicknames.delete(userId);
}
