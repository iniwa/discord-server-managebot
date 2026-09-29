// Run after npm run build: node --test tests/dm-on-add.cjs
// Uses only an in-memory database and fake Discord objects.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
process.env.DB_PATH = ':memory:';
process.env.DISCORD_GUILD_ID = 'test-guild';
const { runMigrations } = require('../dist/db/migrate');
const { getDb } = require('../dist/db');
const { Events } = require('discord.js');
const { registerMessageReactionAdd } = require('../dist/bot/events/messageReactionAdd');
const { registerVoiceStateUpdate } = require('../dist/bot/events/voiceStateUpdate');
const { registerMessageReactionRemove } = require('../dist/bot/events/messageReactionRemove');
const bot = require('../dist/bot');
bot.getClient = () => ({ channels: { fetch: async () => null } });

const fixture = { guild_id: 'test-guild', channel_id: 'test-channel', message_id: 'test-message', emoji: '✅', role_id: 'test-role', label: 'test' };

function fakeDiscord({ hasRole = false, inVoice = true, failDm = false } = {}) {
  const calls = { add: 0, remove: 0, dm: 0, reaction: 0 };
  const cache = new Map(hasRole ? [[fixture.role_id, {}]] : []);
  const user = { id: 'test-user', username: 'test-user', bot: false, partial: false, send: async () => { calls.dm++; if (failDm) throw Error('DM closed'); } };
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

  for (const dm_on_add of [0, 1]) {
    test(`${kind}: add with DM=${dm_on_add}, toggle removal unchanged`, async () => {
      reset();
      create({ ...fixture, dm_on_add });
      assert.equal(get(fixture.message_id, fixture.emoji).dm_on_add, dm_on_add);
      const fake = fakeDiscord();
      const onAdd = handler(registerMessageReactionAdd, Events.MessageReactionAdd);
      await onAdd(fake.reaction, fake.user);
      assert.deepEqual(fake.calls, { add: 1, remove: 0, dm: dm_on_add, reaction: 1 });
      if (kind === 'reaction') assert.equal(getDb().prepare('SELECT action FROM bot_logs').get().action, 'reaction_role_add');
      const client = new (require('node:events').EventEmitter)();
      registerMessageReactionRemove(client);
      client.emit(Events.MessageReactionRemove, fake.reaction, fake.user);
      assert.equal(fake.calls.remove, 0);
      await onAdd(fake.reaction, fake.user);
      assert.deepEqual(fake.calls, { add: 1, remove: 1, dm: dm_on_add + 1, reaction: 2 });
    });
  }

  test(`${kind}: DM failure leaves role assigned`, async () => {
    reset();
    create({ ...fixture, dm_on_add: 1 });
    const fake = fakeDiscord({ failDm: true });
    await handler(registerMessageReactionAdd, Events.MessageReactionAdd)(fake.reaction, fake.user);
    assert.equal(fake.calls.add, 1);
    assert.equal(fake.calls.dm, 1);
    assert.equal(fake.member.roles.cache.has(fixture.role_id), true);
  });

  test(`${kind}: API create/update/default/validation`, async () => {
    reset();
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/roles', require(`../dist/web/routes/${kind}Roles`).default);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/roles`;
    const request = (method, path, body) => fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const response = await request('POST', '', fixture);
      assert.equal(response.status, 201);
      const { id } = await response.json();
      assert.equal(get(fixture.message_id, fixture.emoji).dm_on_add, 1);
      for (const value of [0, 1, 0]) {
        assert.equal((await request('PUT', `/${id}`, { ...fixture, dm_on_add: value })).status, 200);
        assert.equal((await (await fetch(url)).json())[0].dm_on_add, value);
      }
      assert.equal((await request('PUT', `/${id}`, fixture)).status, 200);
      assert.equal(get(fixture.message_id, fixture.emoji).dm_on_add, 0);
      for (const value of [null, '0', false, 2]) {
        assert.equal((await request('PUT', `/${id}`, { ...fixture, dm_on_add: value })).status, 400);
        assert.equal((await request('POST', '', { ...fixture, dm_on_add: value })).status, 400);
      }
      assert.equal(get(fixture.message_id, fixture.emoji).dm_on_add, 0);
      assert.equal((await request('POST', '', { ...fixture, message_id: 'second-message', dm_on_add: 0 })).status, 201);
      assert.equal(get('second-message', fixture.emoji).dm_on_add, 0);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test('status: outside VC and voice disconnect keep existing notifications; VC move keeps role', async () => {
  reset();
  require('../dist/db/queries/statusRoles').createStatusRole({ ...fixture, dm_on_add: 0 });
  const outside = fakeDiscord({ inVoice: false });
  await handler(registerMessageReactionAdd, Events.MessageReactionAdd)(outside.reaction, outside.user);
  assert.deepEqual(outside.calls, { add: 0, remove: 0, dm: 1, reaction: 1 });
  const inside = fakeDiscord({ hasRole: true });
  const onVoice = handler(registerVoiceStateUpdate, Events.VoiceStateUpdate);
  await onVoice({ channelId: 'voice-1', guild: inside.guild, member: inside.member }, { channelId: 'voice-2', guild: inside.guild, member: inside.member });
  assert.equal(inside.calls.remove, 0);
  await onVoice({ channelId: 'voice-2', guild: inside.guild, member: inside.member }, { channelId: null, guild: inside.guild, member: inside.member });
  assert.equal(inside.calls.remove, 1);
  assert.equal(inside.calls.dm, 1);
});
