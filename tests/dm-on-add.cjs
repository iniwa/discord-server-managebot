// Run after npm run build: node --test tests/dm-on-add.cjs
// Uses only an in-memory database and fake Discord objects.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
process.env.DB_PATH = ':memory:';
process.env.DISCORD_GUILD_ID = 'test-guild';
const { runMigrations } = require('../dist/db/migrate');
const { getDb } = require('../dist/db');
const { ComponentType, Events } = require('discord.js');
const { registerMessageReactionAdd } = require('../dist/bot/events/messageReactionAdd');
const { registerVoiceStateUpdate } = require('../dist/bot/events/voiceStateUpdate');
const { registerMessageReactionRemove } = require('../dist/bot/events/messageReactionRemove');
const bot = require('../dist/bot');
bot.getClient = () => ({ channels: { fetch: async () => null } });

const fixture = { guild_id: 'test-guild', channel_id: 'test-channel', message_id: 'test-message', emoji: '✅', role_id: 'test-role', label: 'test' };

function fakeDiscord({ hasRole = false, inVoice = true } = {}) {
  const calls = { add: 0, remove: 0, dm: 0, reaction: 0 };
  const cache = new Map(hasRole ? [[fixture.role_id, {}]] : []);
  const user = { id: 'test-user', username: 'test-user', bot: false, partial: false, send: async () => { calls.dm++; } };
  const member = { id: user.id, user, voice: { channelId: inVoice ? 'test-voice' : null }, roles: {
    cache, add: async id => { calls.add++; cache.set(id, {}); }, remove: async id => { calls.remove++; cache.delete(id); },
  } };
  const guild = { id: fixture.guild_id, name: 'Test guild', members: { fetch: async () => member }, roles: { cache: new Map([[fixture.role_id, { name: 'Test role' }]]) } };
  const reaction = { partial: false, emoji: { name: fixture.emoji }, message: { id: fixture.message_id, guild }, users: { remove: async () => { calls.reaction++; } } };
  return { calls, user, member, guild, reaction };
}

function handler(register, event) {
  let result;
  register({ on: (name, fn) => { if (name === event) result = fn; } });
  assert.equal(typeof result, 'function');
  return result;
}

function reset() {
  const db = getDb();
  for (const table of ['reaction_roles', 'status_roles', 'voice_roles', 'bot_logs']) db.prepare(`DELETE FROM ${table}`).run();
}

for (const kind of ['reaction', 'status']) {
  const title = kind === 'reaction' ? 'Reaction' : 'Status';
  const queries = require(`../dist/db/queries/${kind}Roles`);
  const create = queries[`create${title}Role`];
  const get = queries[`get${title}Role`];

  test(`${kind}: migration preserves legacy records and is repeatable`, () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    db.exec(`ALTER TABLE ${kind}_roles DROP COLUMN dm_on_add`);
    db.prepare(`INSERT INTO ${kind}_roles (guild_id, channel_id, message_id, emoji, role_id, label) VALUES (?, ?, ?, ?, ?, ?)`).run(...Object.values(fixture));
    db.exec("INSERT INTO role_snapshots (guild_id, note) VALUES ('test-guild', 'preserve'); INSERT INTO role_snapshot_entries (snapshot_id, role_id, role_name) VALUES (1, 'test-role', 'Test role')");
    const before = db.prepare(`SELECT * FROM ${kind}_roles`).get();
    runMigrations(db);
    runMigrations(db);
    assert.deepEqual(db.prepare(`SELECT * FROM ${kind}_roles`).get(), { ...before, dm_on_add: 1 });
    assert.equal(db.prepare('SELECT note FROM role_snapshots').get().note, 'preserve');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM role_snapshot_entries').get().n, 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    db.close();
  });

  for (const legacyDmOnAdd of [0, 1]) {
    test(`${kind}: legacy dm_on_add=${legacyDmOnAdd} never sends DM; toggle removal unchanged`, async () => {
      reset();
      create(fixture);
      getDb().prepare(`UPDATE ${kind}_roles SET dm_on_add = ? WHERE message_id = ? AND emoji = ?`)
        .run(legacyDmOnAdd, fixture.message_id, fixture.emoji);
      assert.equal(Object.hasOwn(get(fixture.message_id, fixture.emoji), 'dm_on_add'), false);
      const fake = fakeDiscord();
      const onAdd = handler(registerMessageReactionAdd, Events.MessageReactionAdd);
      await onAdd(fake.reaction, fake.user);
      assert.deepEqual(fake.calls, { add: 1, remove: 0, dm: 0, reaction: 1 });
      if (kind === 'reaction') assert.equal(getDb().prepare('SELECT action FROM bot_logs').get().action, 'reaction_role_add');
      const client = new (require('node:events').EventEmitter)();
      registerMessageReactionRemove(client);
      client.emit(Events.MessageReactionRemove, fake.reaction, fake.user);
      assert.equal(fake.calls.remove, 0);
      await onAdd(fake.reaction, fake.user);
      assert.deepEqual(fake.calls, { add: 1, remove: 1, dm: 0, reaction: 2 });

      const buttonReaction = { ...fake.reaction, message: { ...fake.reaction.message, components: [{
        type: ComponentType.ActionRow,
        components: [{ type: ComponentType.Button, customId: 'role:test-role' }],
      }] } };
      await onAdd(buttonReaction, fake.user);
      assert.deepEqual(fake.calls, { add: 1, remove: 1, dm: 0, reaction: 2 });
    });
  }

}

test('status: no DM outside VC or on voice disconnect; VC move keeps role', async () => {
  reset();
  require('../dist/db/queries/statusRoles').createStatusRole(fixture);
  getDb().prepare('UPDATE status_roles SET dm_on_add = 1 WHERE message_id = ? AND emoji = ?').run(fixture.message_id, fixture.emoji);
  const outside = fakeDiscord({ inVoice: false });
  await handler(registerMessageReactionAdd, Events.MessageReactionAdd)(outside.reaction, outside.user);
  assert.deepEqual(outside.calls, { add: 0, remove: 0, dm: 0, reaction: 1 });
  const inside = fakeDiscord({ hasRole: true });
  const onVoice = handler(registerVoiceStateUpdate, Events.VoiceStateUpdate);
  await onVoice({ channelId: 'voice-1', guild: inside.guild, member: inside.member }, { channelId: 'voice-2', guild: inside.guild, member: inside.member });
  assert.equal(inside.calls.remove, 0);
  await onVoice({ channelId: 'voice-2', guild: inside.guild, member: inside.member }, { channelId: null, guild: inside.guild, member: inside.member });
  assert.equal(inside.calls.remove, 1);
  assert.equal(inside.calls.dm, 0);
});
