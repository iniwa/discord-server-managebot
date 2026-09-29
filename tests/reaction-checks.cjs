// In-memory SQLite and fake Discord only. Run after npm run build with Node 20.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { Collection } = require('discord.js');
process.env.DB_PATH = ':memory:';
process.env.DISCORD_GUILD_ID = '100';
const q = require('../dist/db/queries/reactionChecks');
const { getDb } = require('../dist/db');
const service = require('../dist/bot/reactionChecks');
const bot = require('../dist/bot');
const base = { guild_id: '100', channel_id: '200', message_id: '300', emoji: '✅', label: 'Read check' };
function create(message = String(Math.floor(Math.random() * 1e12))) { const id = q.createReactionCheck({ ...base, message_id: message }); return q.getReactionCheck(id, '100'); }
function member(id, isBot = false) { return { id, user: { username: `user${id}`, bot: isBot }, displayName: `Member ${id}` }; }
function fake({ members = [member('1'), member('2'), member('3', true)], reactionPages, failReact = false, onPage } = {}) {
  const calls = [];
  const guild = { channels: { fetch: async () => ({ isTextBased: () => true, messages: { fetch: async () => ({ react: async () => { if (failReact) throw { code: 50013 }; } }) } }) },
    members: { list: async () => new Collection(members.map(m => [m.id, m])) } };
  return { calls, guilds: { fetch: async id => { assert.equal(id, '100'); return guild; } }, rest: { get: async (route, { query }) => {
    calls.push({ route, type: query.get('type'), limit: query.get('limit'), after: query.get('after') });
    if (onPage) await onPage(query);
    return reactionPages ? reactionPages(query) : query.get('type') === '0' ? [{ id: '1' }] : [];
  } } };
}
test('sync counts present humans, initial time unknown, fetches both types and paginates', async () => {
  const check = create();
  const first = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1) }));
  const client = fake({ reactionPages: query => query.get('type') === '1' ? [{ id: '2' }] : query.get('after') ? [{ id: '101' }] : first });
  await service.syncReactionCheck(check, client);
  const report = q.reactionCheckReport(q.getReactionCheck(check.id, '100'));
  assert.deepEqual(report.reacted.map(u => u.user_id), ['1', '2']);
  assert.equal(report.reacted[0].reacted_at, null);
  assert.equal(report.pending.length, 0);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[1].after, '100');
  assert.ok(client.calls.every(c => c.limit === '100'));
  assert.ok(report.synced_at);
});
test('normal/burst independent removals, remove-readd gets new observed timestamp; history retained', async () => {
  const check = create();
  q.saveCheckSnapshot(check.id, [{ user_id: '1', username: 'user', display_name: 'User' }], [new Set(), new Set()], 0);
  q.recordCheckEvent(check.id, '1', 0, 'add', '2026-01-01T00:00:00Z');
  q.recordCheckEvent(check.id, '1', 1, 'add', '2026-01-01T00:01:00Z');
  q.recordCheckEvent(check.id, '1', 0, 'remove');
  assert.equal(q.reactionCheckReport(check).reacted.length, 1);
  q.recordCheckEvent(check.id, '1', 1, 'remove');
  assert.equal(q.reactionCheckReport(check).pending.length, 1);
  q.recordCheckEvent(check.id, '1', 0, 'add', '2026-01-01T00:02:00Z');
  assert.equal(q.reactionCheckReport(check).reacted[0].reacted_at, '2026-01-01T00:02:00Z');
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM reaction_check_events WHERE check_id=?').get(check.id).n, 5);
});
test('events during sync retain add timestamps even when REST includes the new reaction', async () => {
  const check = create();
  q.recordCheckEvent(check.id, '1', 0, 'add', '2026-01-01T00:00:00Z');
  let once = false;
  const client = fake({ onPage: () => {
    if (once) return; once = true;
    q.recordCheckEvent(check.id, '1', 0, 'remove');
    q.recordCheckEvent(check.id, '1', 0, 'add', '2026-02-02T00:00:00Z');
    q.recordCheckEvent(check.id, '2', 0, 'add', '2026-03-03T00:00:00Z');
  }, reactionPages: query => query.get('type') === '0' ? [{ id: '1' }, { id: '2' }] : [] });
  await service.syncReactionCheck(check, client);
  const reacted = q.reactionCheckReport(check).reacted;
  assert.equal(reacted[0].reacted_at, '2026-02-02T00:00:00Z');
  assert.equal(reacted[1].reacted_at, '2026-03-03T00:00:00Z');
});
test('failed second reaction page leaves saved snapshot intact', async () => {
  const check = create();
  await service.syncReactionCheck(check, fake());
  const before = q.reactionCheckReport(q.getReactionCheck(check.id, '100'));
  await assert.rejects(service.syncReactionCheck(check, fake({ reactionPages: query => {
    if (query.get('type') === '1') throw Error('fake private error'); return [];
  } })));
  assert.deepEqual(q.reactionCheckReport(q.getReactionCheck(check.id, '100')), before);
});
test('raw events cover uncached messages, scoped emoji identity and clear events', async () => {
  const check = create('700');
  const client = new EventEmitter();
  service.registerReactionChecks(client);
  const data = { guild_id: '100', channel_id: '200', message_id: '700', user_id: '1', emoji: { id: null, name: '✅' } };
  client.emit('raw', { t: 'MESSAGE_REACTION_ADD', d: { ...data, guild_id: 'other' } });
  assert.equal(q.checkEventCursor(check.id), 0);
  client.emit('raw', { t: 'MESSAGE_REACTION_ADD', d: data });
  assert.ok(q.checkEventCursor(check.id));
  client.emit('raw', { t: 'MESSAGE_REACTION_REMOVE_EMOJI', d: data });
  assert.equal(getDb().prepare('SELECT active FROM reaction_check_state WHERE check_id=?').get(check.id).active, 0);
});
test('HTTP registration/report/sync: URL scope, duplicate conflict, installation warning and role conflict', async () => {
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/checks', require('../dist/web/routes/reactionChecks').default);
  bot.getClient = () => fake({ failReact: true });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/checks`;
  const request = (path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await request('', { message_url: 'https://discord.com/channels/999/200/300', emoji: '✅', label: 'Check' })).status, 400);
    const input = { message_url: 'https://discord.com/channels/100/200/900', emoji: '✅', label: 'Check' };
    for (const emoji of ['asa', '✅👍', '✅123']) assert.equal((await request('', { ...input, emoji })).status, 400);
    const created = await request('', input); assert.equal(created.status, 201);
    const report = await created.json(); assert.ok(report.warning); assert.equal(report.pending.length, 1);
    assert.equal((await request('', input)).status, 409);
    assert.equal((await (await fetch(`${url}/${report.check.id}`)).json()).reacted.length, 1);
    assert.equal((await request(`/${report.check.id}/sync`)).status, 200);
    const foreign = q.createReactionCheck({ ...base, guild_id: '999' });
    assert.equal((await fetch(`${url}/${foreign}`)).status, 404);
    require('../dist/db/queries/reactionRoles').createReactionRole({ ...base, message_id: '901', role_id: 'role', message_content: null });
    assert.equal((await request('', { ...input, message_url: 'https://discord.com/channels/100/200/901' })).status, 409);
    const optional = await request('', { ...input, label: '', message_url: 'https://discord.com/channels/100/200/902' });
    assert.equal(optional.status, 201);
    assert.equal((await optional.json()).check.label, '既読確認');
    bot.getClient = () => fake({ reactionPages: () => { throw Error('private payload'); } });
    const failed = await request('', { ...input, message_url: 'https://discord.com/channels/100/200/903' });
    assert.equal(failed.status, 502);
    const failure = await failed.json();
    assert.ok(failure.id);
    assert.ok(!failure.error.includes('private payload'));
    const unsynced = await (await fetch(`${url}/${failure.id}`)).json();
    assert.equal(unsynced.synced_at, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('unicode variation and custom emoji names share stable identities', () => {
  assert.equal(q.emojiKey('☑️'), q.emojiKey('☑'));
  assert.equal(q.emojiKey('<a:old:123>'), q.emojiKey('<:new:123>'));
  const id = q.createReactionCheck({ ...base, message_id: '777', emoji: '☑️' });
  const client = new EventEmitter(); service.registerReactionChecks(client);
  client.emit('raw', { t: 'MESSAGE_REACTION_ADD', d: { guild_id: '100', channel_id: '200', message_id: '777', user_id: '1', emoji: { id: null, name: '☑' } } });
  assert.ok(q.checkEventCursor(id));
});

test('known check bypasses legacy role toggling and reaction removal', async () => {
  const check = create('778');
  let handler;
  require('../dist/bot/events/messageReactionAdd').registerMessageReactionAdd({ on: (_, callback) => { handler = callback; } });
  await handler({ partial: false, emoji: { name: '✅' }, message: { id: check.message_id, channelId: '200', components: [], guild: { id: '100', members: { fetch: () => { throw Error('must not fetch member or toggle role'); } } } } }, { id: '1', bot: false, partial: false });
});
