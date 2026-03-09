import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { registerReady } from './events/ready';
import { registerMessageReactionAdd } from './events/messageReactionAdd';
import { registerMessageReactionRemove } from './events/messageReactionRemove';
import { registerVoiceStateUpdate } from './events/voiceStateUpdate';
import { registerGuildMemberRemove } from './events/guildMemberRemove';

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    throw new Error('Discord client not initialized');
  }
  return _client;
}

export async function startBot(token: string): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
    ],
  });

  registerReady(client);
  registerMessageReactionAdd(client);
  registerMessageReactionRemove(client);
  registerVoiceStateUpdate(client);
  registerGuildMemberRemove(client);

  await client.login(token);
  _client = client;
  return client;
}
