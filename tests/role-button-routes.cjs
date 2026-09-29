// Run after npm run build. Uses only in-memory SQLite and fake Discord objects.
const assert = require('node:assert/strict');
const { test } = require('node:test');
process.env.DB_PATH = ':memory:';
process.env.DISCORD_GUILD_ID = 'test-guild';
const { getDb } = require('../dist/db');
const bot = require('../dist/bot');
const fixture = { guild_id: 'test-guild', channel_id: 'channel', message_id: 'legacy', role_id: 'role', emoji: '✅', label: 'Test role' };

for (const kind of ['reaction', 'status']) {
  test(`${kind}: publish, replacement, failure and guild isolation`, async () => {
    getDb().exec(`DELETE FROM ${kind}_roles`);
    const title = kind === 'reaction' ? 'Reaction' : 'Status';
    const queries = require(`../dist/db/queries/${kind}Roles`);
    const list = () => queries[`list${title}Roles`](fixture.guild_id);
    let fail = false;
    const sent = [];
    bot.getClient = () => ({ guilds: { fetch: async id => {
      assert.equal(id, fixture.guild_id);
      return {
        channels: { fetch: async () => ({ isTextBased: () => true, send: async data => {
          if (fail) throw Error('fake private failure');
          const id = `posted-${sent.length}`;
          sent.push(data);
          return { id, delete: async () => {} };
        } }) },
        roles: { fetch: async () => ({ name: 'Role' }) },
      };
    } } });
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/roles', require(`../dist/web/routes/${kind}Roles`).default);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/roles`;
    const request = (method, path, body) => fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      assert.equal((await request('POST', '', { ...fixture, emoji: 1 })).status, 400);
      for (const message_content of [42, 'x'.repeat(2001), '😀'.repeat(1001)]) {
        assert.equal((await request('POST', '', { ...fixture, message_content })).status, 400);
      }
      const response = await request('POST', '', { ...fixture, dm_on_add: 1, message_content: ' Choose your role @everyone ' });
      assert.equal(response.status, 201);
      const { id, message_id, message_url } = await response.json();
      assert.equal(message_id, 'posted-0');
      assert.equal(message_url, 'https://discord.com/channels/test-guild/channel/posted-0');
      assert.equal(list()[0].message_id, 'posted-0');
      assert.equal(Object.hasOwn((await (await fetch(url)).json())[0], 'dm_on_add'), false);
      assert.deepEqual(sent[0].allowedMentions, { parse: [] });
      assert.equal(sent[0].content, 'Choose your role @everyone');
      assert.equal((await (await fetch(url)).json())[0].message_content, 'Choose your role @everyone');
      assert.equal(sent[0].components[0].toJSON().components[0].custom_id, `role:${kind}:${id}`);
      const updated = await request('PUT', `/${id}`, { ...fixture, label: 'Updated', emoji: '' });
      assert.equal(updated.status, 200);
      assert.equal((await updated.json()).message_url, 'https://discord.com/channels/test-guild/channel/posted-1');
      assert.equal(list()[0].emoji, '');
      assert.equal(sent[1].components[0].toJSON().components[0].emoji, undefined);
      assert.equal(list()[0].message_id, 'posted-1');
      assert.equal(list()[0].label, 'Updated');
      assert.equal(list()[0].message_content, 'Choose your role @everyone', 'old clients preserve saved text on PUT');
      assert.equal((await request('PUT', `/${id}`, { ...fixture, message_content: 'x'.repeat(2001) })).status, 400);
      fail = true;
      assert.equal((await request('POST', '', fixture)).status, 502);
      assert.equal(list().length, 1, 'failed create must not leave a configuration');
      const failedUpdate = await request('PUT', `/${id}`, { ...fixture, label: 'Saved edit' });
      assert.equal(failedUpdate.status, 502);
      assert.ok(!(await failedUpdate.text()).includes('fake private failure'));
      assert.equal(list()[0].label, 'Saved edit');
      assert.notEqual(list()[0].message_id, 'posted-1', 'old button must be invalid after edit');
      fail = false;
      const republished = await request('POST', `/${id}/publish`);
      assert.equal(republished.status, 200);
      assert.equal((await republished.json()).message_url, 'https://discord.com/channels/test-guild/channel/posted-2');
      assert.equal(list()[0].message_id, 'posted-2');
      const foreignId = queries[`create${title}Role`]({ ...fixture, guild_id: 'other-guild' });
      for (const [method, path] of [['PUT', `/${foreignId}`], ['POST', `/${foreignId}/publish`], ['DELETE', `/${foreignId}`]]) {
        assert.equal((await request(method, path, method === 'PUT' ? fixture : undefined)).status, 404);
      }
      assert.equal(queries[`list${title}Roles`]('other-guild').length, 1);
      assert.equal((await request('DELETE', `/${id}`)).status, 204);
      assert.equal(list().length, 0);
      assert.equal(sent.length, 3);
      const omittedEmoji = await request('POST', '', { ...fixture, emoji: undefined, message_content: '   ' });
      assert.equal(omittedEmoji.status, 201);
      assert.equal(list()[0].emoji, '');
      assert.equal(sent[3].components[0].toJSON().components[0].emoji, undefined);
      assert.equal(list()[0].message_content, null);
      assert.ok(sent[3].content.startsWith('ボタンで'));
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test('publication errors explain known failures without leaking raw payloads', () => {
  const { roleButtonPublishError } = require('../dist/bot/roleButtons');
  const logged = [];
  const warn = console.warn;
  console.warn = (...args) => logged.push(args.join(' '));
  try {
    for (const [code, expected] of [[50013, '権限'], [50001, 'アクセス'], [10003, 'チャンネル'], [10011, 'ロール'], [50035, '絵文字']]) {
      const text = roleButtonPublishError({ code, message: 'secret-payload', requestBody: 'secret-payload' });
      assert.ok(text.includes(expected));
      assert.ok(!text.includes('secret-payload'));
    }
    assert.ok(roleButtonPublishError(Error('secret-payload')).includes('接続状態'));
    assert.ok(!logged.join().includes('secret-payload'));
  } finally {
    console.warn = warn;
  }
});

test('publication aborts before sending when the configuration changed during lookup', async () => {
  const queries = require('../dist/db/queries/reactionRoles');
  const id = queries.createReactionRole({ ...fixture, message_id: 'before-send' });
  const config = queries.listReactionRoles(fixture.guild_id).find(entry => entry.id === id);
  let sent = false;
  bot.getClient = () => ({ guilds: { fetch: async () => ({
    channels: { fetch: async () => ({ isTextBased: () => true, send: async () => { sent = true; } }) },
    roles: { fetch: async () => { queries.deleteReactionRole(id); return { name: 'Role' }; } },
  }) } });
  await assert.rejects(require('../dist/bot/roleButtons').publishRoleButton('reaction', config), /changed while publishing/);
  assert.equal(sent, false);
});

test('publish removes its new message when database update fails', async () => {
  const queries = require('../dist/db/queries/reactionRoles');
  const id = queries.createReactionRole({ ...fixture, message_id: 'rollback' });
  const config = queries.listReactionRoles(fixture.guild_id).find(entry => entry.id === id);
  const original = queries.updateReactionRole;
  let deleted = false;
  bot.getClient = () => ({ guilds: { fetch: async () => ({
    channels: { fetch: async () => ({ isTextBased: () => true, send: async () => ({ id: 'new', delete: async () => { deleted = true; } }) }) },
    roles: { fetch: async () => ({ name: 'Role' }) },
  }) } });
  queries.updateReactionRole = () => { throw Error('fake database failure'); };
  try {
    await assert.rejects(require('../dist/bot/roleButtons').publishRoleButton('reaction', config), /fake database failure/);
    assert.equal(deleted, true);
  } finally {
    queries.updateReactionRole = original;
  }
});

for (const change of ['edit', 'delete', 'publish', 'content']) {
  test(`publish discards the new message after concurrent ${change}`, async () => {
    const queries = require('../dist/db/queries/reactionRoles');
    const id = queries.createReactionRole({ ...fixture, message_id: `concurrent-${change}` });
    const config = queries.listReactionRoles(fixture.guild_id).find(entry => entry.id === id);
    let deleted = false;
    bot.getClient = () => ({ guilds: { fetch: async () => ({
      channels: { fetch: async () => ({ isTextBased: () => true, send: async () => {
        if (change === 'delete') queries.deleteReactionRole(id);
        else queries.updateReactionRole(id, change === 'edit' ? { role_id: 'changed' } : change === 'content' ? { message_content: 'Changed text' } : { message_id: 'other-publication' });
        return { id: 'stale-message', delete: async () => { deleted = true; } };
      } }) },
      roles: { fetch: async () => ({ name: 'Role' }) },
    }) } });
    await assert.rejects(require('../dist/bot/roleButtons').publishRoleButton('reaction', config), /changed while publishing/);
    assert.equal(deleted, true);
    const current = queries.listReactionRoles(fixture.guild_id).find(entry => entry.id === id);
    if (change === 'delete') assert.equal(current, undefined);
    else assert.notEqual(current.message_id, 'stale-message');
  });
}

test('message content migration preserves legacy rows and saved content on rerun', () => {
  const Database = require('better-sqlite3');
  const { runMigrations } = require('../dist/db/migrate');
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    for (const table of ['reaction_roles', 'status_roles']) {
      db.exec(`ALTER TABLE ${table} DROP COLUMN message_content`);
      db.prepare(`INSERT INTO ${table} (guild_id, channel_id, message_id, emoji, role_id, label) VALUES (?, ?, ?, ?, ?, ?)`).run(fixture.guild_id, fixture.channel_id, fixture.message_id, fixture.emoji, fixture.role_id, fixture.label);
    }
    runMigrations(db);
    for (const table of ['reaction_roles', 'status_roles']) {
      assert.equal(db.prepare(`SELECT message_content FROM ${table}`).get().message_content, null);
      db.prepare(`UPDATE ${table} SET message_content = ?`).run('Saved body');
    }
    runMigrations(db);
    for (const table of ['reaction_roles', 'status_roles']) {
      const row = db.prepare(`SELECT * FROM ${table}`).get();
      assert.equal(row.message_content, 'Saved body');
      assert.equal(row.message_id, fixture.message_id);
      assert.equal(row.dm_on_add, 1);
    }
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});
