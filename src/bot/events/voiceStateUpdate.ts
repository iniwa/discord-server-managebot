import { Client, Events, VoiceState } from 'discord.js';
import { getVoiceRolesByChannel } from '../../db/queries/voiceRoles';

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
    } catch (err) {
      console.error('[VoiceRole] Error:', err);
    }
  });
}
