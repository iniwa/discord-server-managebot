import { Client, Events, VoiceState } from 'discord.js';
import { getVoiceRolesByChannel } from '../../db/queries/voiceRoles';
import { listStatusRoles } from '../../db/queries/statusRoles';
import { getActiveNickname, clearActiveNickname } from '../nicknameState';

export function registerVoiceStateUpdate(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guild = oldState.guild ?? newState.guild;

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

      // ── 通話から完全退出したとき ──────────────────────────────────────
      if (oldState.channelId && !newState.channelId) {
        // ステータスロール: 対象ロールを全て除去
        const statusRoles = listStatusRoles(guild.id);
        for (const config of statusRoles) {
          if (member.roles.cache.has(config.role_id)) {
            await member.roles.remove(config.role_id);
            const roleName = guild.roles.cache.get(config.role_id)?.name ?? config.role_id;
            console.log(`[StatusRole] Removed role ${roleName} from ${member.user.username} on voice disconnect`);
            try {
              await member.user.send(`**${guild.name}** の通話から退出したため、ステータスロール **${roleName}** が外れました。`);
            } catch {
              console.warn(`[StatusRole] Could not DM user ${member.id}`);
            }
          }
        }

        // ニックネーム変更: 元に戻す
        const activeNick = getActiveNickname(member.id);
        if (activeNick) {
          try {
            await member.setNickname(activeNick.originalNick, 'NicknameChanger: left voice');
            clearActiveNickname(member.id);
            console.log(`[NicknameChanger] Reverted nickname for ${member.user.username} on voice disconnect`);
          } catch (err) {
            console.warn(`[NicknameChanger] Could not revert nickname for ${member.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[VoiceStateUpdate] Error:', err);
    }
  });
}
