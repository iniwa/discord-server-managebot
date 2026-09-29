// Uses a disposable in-memory DB and Discord mocks; never starts the bot.
const assert = require('node:assert/strict');
const { test } = require('node:test');
process.env.DB_PATH = ':memory:';
process.env.DISCORD_GUILD_ID = 'guild';
const { MessageFlags } = require('discord.js');
const { getDb } = require('../dist/db');
const { registerRoleButtonInteraction } = require('../dist/bot/events/roleButtonInteraction');
const fixture = { guild_id: 'guild', channel_id: 'channel', message_id: 'message', emoji: '✅', role_id: 'role', label: null };

function setup(kind = 'reaction', options = {}) {
  getDb().exec('DELETE FROM reaction_roles; DELETE FROM status_roles; DELETE FROM bot_logs;');
  const q = require(`../dist/db/queries/${kind}Roles`);
  const id = q[kind === 'reaction' ? 'createReactionRole' : 'createStatusRole'](fixture);
  const roles = new Map(options.hasRole ? [['role', {}]] : []);
  const replies = [];
  const calls = { add: 0, remove: 0, dm: 0, flags: [] };
  const member = { voice: { channelId: options.outside ? null : 'voice' }, roles: { cache: roles,
    add: async () => { calls.add++; if (options.fail) throw Error('forbidden'); roles.set('role', {}); if (options.leaveDuringAdd) member.voice.channelId = null; },
    remove: async () => { calls.remove++; roles.delete('role'); },
  } };
  const interaction = { isButton: () => true, customId: `role:${kind}:${id}`, guildId: 'guild', channelId: 'channel', message: { id: 'message' },
    user: { id: 'user', username: 'test', send: async () => { calls.dm++; } },
    guild: { members: { fetch: async () => member }, roles: { fetch: async () => options.missingRole ? null : { id: 'role', name: 'Test' } } },
    deferReply: async data => calls.flags.push(data.flags), editReply: async data => replies.push(data),
  };
  let handle;
  registerRoleButtonInteraction({ on: (_, callback) => { handle = callback; } });
  return { interaction, handle, calls, replies, member };
}

for (const kind of ['reaction', 'status']) {
  test(`${kind}: buttons toggle and always reply privately, without DM`, async () => {
    const f = setup(kind);
    await f.handle(f.interaction);
    await f.handle(f.interaction);
    assert.deepEqual(f.calls, { add: 1, remove: 1, dm: 0, flags: [MessageFlags.Ephemeral, MessageFlags.Ephemeral] });
    assert.match(f.replies[0].content, /付与しました/);
    assert.match(f.replies[1].content, /解除しました/);
    assert.deepEqual(f.replies[0].allowedMentions, { parse: [] });
    if (kind === 'reaction') assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM bot_logs').get().n, 2);
  });
}
test('status: outside VC replies privately without granting; existing role can be removed', async () => {
  const f = setup('status', { outside: true });
  await f.handle(f.interaction);
  assert.equal(f.calls.add, 0);
  assert.match(f.replies[0].content, /通話に参加/);
  f.member.roles.cache.set('role', {});
  await f.handle(f.interaction);
  assert.equal(f.calls.remove, 1);
});
test('status: disconnect during assignment cleans up the role', async () => {
  const f = setup('status', { leaveDuringAdd: true });
  await f.handle(f.interaction);
  assert.equal(f.calls.remove, 1);
  assert.equal(f.member.roles.cache.has('role'), false);
});
for (const field of ['guildId', 'channelId', 'message', 'customId']) {
  test(`reject stale/foreign ${field} without role changes`, async () => {
    const f = setup();
    f.interaction[field] = field === 'message' ? { id: 'old' } : field === 'customId' ? 'role:reaction:999999' : 'other';
    await f.handle(f.interaction);
    assert.equal(f.calls.add, 0);
    assert.equal(f.replies.length, 1);
    assert.equal(f.calls.flags[0], MessageFlags.Ephemeral);
  });
}
for (const options of [{ fail: true }, { missingRole: true }]) {
  test(`failure/missing role receives private feedback ${JSON.stringify(options)}`, async () => {
    const f = setup('reaction', options);
    await f.handle(f.interaction);
    assert.equal(f.replies.length, 1);
    assert.doesNotMatch(f.replies[0].content, /付与しました/);
    assert.equal(f.calls.dm, 0);
  });
}
test('concurrent clicks for the same member/role do not toggle twice', async () => {
  const f = setup();
  await Promise.all([f.handle(f.interaction), f.handle(f.interaction)]);
  assert.equal(f.calls.add, 1);
  assert.equal(f.calls.remove, 0);
  assert.ok(f.replies.some(r => /処理中/.test(r.content)));
});
test('expired interaction is contained without touching roles', async () => {
  const f = setup();
  f.interaction.deferReply = async () => { throw Error('expired'); };
  await f.handle(f.interaction);
  assert.equal(f.calls.add, 0);
});
