import { Client } from 'discord.js';

// ロール付与／剥奪はすべて messageReactionAdd のトグルロジックで処理する。
// BOTがユーザーリアクションを削除した際にもこのイベントが発火するため、
// 二重処理防止のため Remove イベントでは何もしない。
export function registerMessageReactionRemove(_client: Client): void {
  // intentionally no-op
}
