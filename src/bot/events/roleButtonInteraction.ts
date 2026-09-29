import { Client, Events, MessageFlags } from 'discord.js';
import { listReactionRoles } from '../../db/queries/reactionRoles';
import { listStatusRoles } from '../../db/queries/statusRoles';
import { insertBotLog } from '../../db/queries/botLogs';

export function registerRoleButtonInteraction(client: Client): void {
  const pending = new Set<string>();
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('role:')) return;
    try {
      const match = /^role:(reaction|status):(\d+)(?::(\d+))?$/.exec(interaction.customId);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reply = (content: string) => interaction.editReply({ content, allowedMentions: { parse: [] } });
      if (!match || !interaction.guild || interaction.guildId !== process.env.DISCORD_GUILD_ID) {
        await reply('このボタンは利用できません。');
        return;
      }
      const [, kind, id, index] = match;
      const configs = kind === 'status' ? listStatusRoles(interaction.guildId) : listReactionRoles(interaction.guildId);
      const config = configs.find((row) => row.id === Number(id));
      if (!config || config.channel_id !== interaction.channelId || config.message_id !== interaction.message.id) {
        await reply('このボタンは更新または削除されています。最新のボタンを使用してください。');
        return;
      }
      const buttons = config.buttons ?? [config];
      const button = buttons[Number(index ?? 0)];
      if (!button) {
        await reply('このボタンは利用できません。最新の投稿を確認してください。');
        return;
      }
      const key = `${interaction.guildId}:${interaction.user.id}:${button.role_id}`;
      if (pending.has(key)) {
        await reply('処理中です。少し待ってから操作してください。');
        return;
      }
      pending.add(key);
      try {
        const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
        const removing = member.roles.cache.has(button.role_id);
        if (!removing && kind === 'status' && !member.voice.channelId) {
          await reply('このロールを付与するには、通話に参加してください。');
          return;
        }
        const role = await interaction.guild.roles.fetch(button.role_id);
        if (!role) {
          await reply('対象のロールが見つかりません。管理者に確認してください。');
          return;
        }
        if (removing) await member.roles.remove(button.role_id);
        else await member.roles.add(button.role_id);

        // 付与中にVC退出した場合も、ステータスロールを残さない。
        if (!removing && kind === 'status' && !member.voice.channelId) {
          await member.roles.remove(button.role_id);
          await reply('通話から退出したため、ロールを解除しました。');
          return;
        }
        if (kind === 'reaction') {
          insertBotLog({ guild_id: config.guild_id, action: removing ? 'reaction_role_remove' : 'reaction_role_add',
            user_id: interaction.user.id, username: interaction.user.username, role_id: role.id,
            role_name: role.name, message_id: interaction.message.id, emoji: button.emoji });
        }
        await reply(`ロール「${role.name}」を${removing ? '解除' : '付与'}しました。`);
      } catch {
        await reply('操作を完了できませんでした。現在のロール状態を確認し、管理者に連絡してください。');
      } finally {
        pending.delete(key);
      }
    } catch {
      console.warn('[RoleButton] Could not complete interaction response');
    }
  });
}
