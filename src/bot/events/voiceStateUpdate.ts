import { Client, Events, VoiceState } from 'discord.js';
import { getVoiceRolesByChannel } from '../../db/queries/voiceRoles';
import { getActiveNickname, clearActiveNickname } from '../nicknameState';

export function registerVoiceStateUpdate(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    try {
      // Left a channel
      if (oldState.channelId) {
        const configs = getVoiceRolesByChannel(oldState.channelId);
        for (const config of configs) {
          if (member.roles.cache.has(config.role_id)) {
            await member.roles.remove(config.role_id);
            console.log(`[VoiceRole] Removed role ${config.role_id} from ${member.id}`);
          }
        }
      }

      // Joined a channel
      if (newState.channelId) {
        const configs = getVoiceRolesByChannel(newState.channelId);
        for (const config of configs) {
          if (!member.roles.cache.has(config.role_id)) {
            await member.roles.add(config.role_id);
            console.log(`[VoiceRole] Added role ${config.role_id} to ${member.id}`);
          }
        }
      }

      // ── ニックネーム変更: 通話から完全退出したとき元に戻す ──────────────
      if (oldState.channelId && !newState.channelId) {
        const activeState = getActiveNickname(member.id);
        if (activeState) {
          try {
            await member.setNickname(activeState.originalNick, 'NicknameChanger: left voice');
            clearActiveNickname(member.id);
            console.log(`[NicknameChanger] Reverted nickname for ${member.user.username} on voice disconnect`);
          } catch (err) {
            console.warn(`[NicknameChanger] Could not revert nickname for ${member.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[VoiceRole] Error:', err);
    }
  });
}
